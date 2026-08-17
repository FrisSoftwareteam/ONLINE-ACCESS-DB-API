import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withApi } from "./handler";
import { getFrdbPool, sql } from "./db";
import { normalizePaging, toPagedResult } from "./pagination";

export interface ColumnDef {
  db: string; // actual column name in frdb
  json: string; // property name in the API response
}

export interface FilterDef {
  /** query string param name, e.g. "register_id" */
  queryParam: string;
  db: string;
  sqlType: any;
  /** "exact" for = match, "like" for a %value% search */
  mode?: "exact" | "like";
}

export interface ListEndpointConfig {
  table: string;
  columns: ColumnDef[];
  filters?: FilterDef[];
  /** columns searched by the shared ?search= param (LIKE, OR'd together) */
  searchColumns?: string[];
  defaultSort: string;
  sortable?: Record<string, string>; // query value -> "column ASC/DESC"
}

interface BoundInput {
  name: string;
  type: any;
  value: unknown;
}

function firstQueryValue(v: unknown): string | undefined {
  if (Array.isArray(v)) return v[0];
  return typeof v === "string" ? v : undefined;
}

/**
 * Builds a paginated, filterable GET handler for a single frdb table/view.
 * This is a thin, declarative wrapper — every endpoint still explicitly lists
 * its own columns and filters (nothing here accepts an arbitrary table name
 * from the request), it just avoids re-writing the same pagination/filter
 * plumbing in every file.
 */
export function createListHandler(config: ListEndpointConfig) {
  return withApi(async (req: VercelRequest, res: VercelResponse) => {
    if (req.method !== "GET") {
      res.status(405).json({ message: "Method not allowed." });
      return;
    }

    const { page, pageSize, offset } = normalizePaging(req.query.page, req.query.page_size);
    const pool = await getFrdbPool();

    // Build the WHERE clause and its bound values once, up front — every
    // Request object created afterwards binds the same fixed set of inputs.
    const conditions: string[] = ["1 = 1"];
    const inputs: BoundInput[] = [];

    for (const f of config.filters ?? []) {
      const raw = firstQueryValue((req.query as any)[f.queryParam]);
      if (raw === undefined || raw === "") continue;
      if (f.mode === "like") {
        conditions.push(`${f.db} LIKE @${f.queryParam}`);
        inputs.push({ name: f.queryParam, type: f.sqlType, value: `%${raw}%` });
      } else {
        conditions.push(`${f.db} = @${f.queryParam}`);
        inputs.push({ name: f.queryParam, type: f.sqlType, value: raw });
      }
    }

    const search = firstQueryValue(req.query.search);
    if (search && config.searchColumns && config.searchColumns.length > 0) {
      conditions.push("(" + config.searchColumns.map((c) => `${c} LIKE @search`).join(" OR ") + ")");
      inputs.push({ name: "search", type: sql.VarChar, value: `%${search}%` });
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const makeRequest = () => {
      const request = pool.request();
      for (const input of inputs) request.input(input.name, input.type, input.value);
      return request;
    };

    const countResult = await makeRequest().query(`SELECT COUNT(*) AS total FROM dbo.${config.table} ${where}`);
    const total = countResult.recordset[0].total as number;

    const sortParam = firstQueryValue(req.query.sort);
    const orderBy = (sortParam && config.sortable?.[sortParam]) || config.defaultSort;

    const selectCols = config.columns.map((c) => `${c.db} AS ${c.json}`).join(", ");
    const pageRequest = makeRequest();
    pageRequest.input("offset", sql.Int, offset);
    pageRequest.input("pageSize", sql.Int, pageSize);

    const pageResult = await pageRequest.query(
      `SELECT ${selectCols}
       FROM dbo.${config.table}
       ${where}
       ORDER BY ${orderBy}
       OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`
    );

    res.status(200).json(toPagedResult(pageResult.recordset, page, pageSize, total));
  });
}
