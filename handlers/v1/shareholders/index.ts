import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withApi } from "../../../lib/handler";
import { getEstockPool, sql } from "../../../lib/db";
import { normalizePaging, toPagedResult } from "../../../lib/pagination";
import { getRegNosForAccounts } from "../../../lib/registry";

function firstQueryValue(v: unknown): string | undefined {
  if (Array.isArray(v)) return v[0];
  return typeof v === "string" ? v : undefined;
}

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ message: "Method not allowed." });
    return;
  }

  const search = firstQueryValue(req.query.search);
  const registerCodeRaw = firstQueryValue(req.query.register_code);
  const emailStatus = firstQueryValue(req.query.email_status);
  const sort = firstQueryValue(req.query.sort);
  const { page, pageSize, offset } = normalizePaging(req.query.page, req.query.page_size);

  // The underlying shareholder universe is ~15M rows. An unfiltered scan/count
  // times out and isn't a realistic use case, so at least one filter is required.
  if (!search && !registerCodeRaw) {
    res.status(400).json({
      message: "At least one of 'search' or 'register_code' is required.",
    });
    return;
  }

  const conditions: string[] = ["1 = 1"];
  const pool = await getEstockPool();
  const request = pool.request();

  if (search) {
    conditions.push(
      "(names LIKE @search OR mail LIKE @search OR mobile LIKE @search OR CAST(account_number AS varchar(20)) = @searchExact)"
    );
    request.input("search", sql.VarChar, `%${search}%`);
    request.input("searchExact", sql.VarChar, search);
  }

  const registerCode = registerCodeRaw ? Number(registerCodeRaw) : undefined;
  if (registerCode !== undefined && Number.isInteger(registerCode)) {
    conditions.push("register_code = @registerCode");
    request.input("registerCode", sql.Int, registerCode);
  }

  if (emailStatus === "has_email") {
    conditions.push("mail IS NOT NULL AND LTRIM(RTRIM(mail)) <> ''");
  } else if (emailStatus === "no_email") {
    conditions.push("(mail IS NULL OR LTRIM(RTRIM(mail)) = '')");
  }

  const orderBy =
    sort === "names"
      ? "names ASC"
      : sort === "-names"
      ? "names DESC"
      : sort === "-account_number"
      ? "account_number DESC"
      : "account_number ASC";

  const where = `WHERE ${conditions.join(" AND ")}`;

  const countResult = await pool
    .request()
    .input("search", sql.VarChar, search ? `%${search}%` : null)
    .input("searchExact", sql.VarChar, search ?? null)
    .input("registerCode", sql.Int, registerCode ?? null)
    .query(`SELECT COUNT(*) AS total FROM dbo.api_shareinfo_company ${where}`);
  const total = countResult.recordset[0].total as number;

  request.input("offset", sql.Int, offset);
  request.input("pageSize", sql.Int, pageSize);

  const pageResult = await request.query(
    `SELECT account_number AS accountNumber, register_code AS registerCode,
            Company_name AS companyName, names, mail AS email, mobile
     FROM dbo.api_shareinfo_company
     ${where}
     ORDER BY ${orderBy}
     OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`
  );

  const rows = pageResult.recordset;
  const regNoMap = await getRegNosForAccounts(
    rows.map((r: any) => ({ accountNumber: r.accountNumber, registerCode: r.registerCode }))
  );

  const data = rows.map((r: any) => ({
    regno: (regNoMap.get(`${r.accountNumber}-${r.registerCode}`) ?? "").toString(),
    accountNumber: r.accountNumber,
    registerCode: r.registerCode,
    companyName: r.companyName,
    names: r.names,
    email: r.email,
    mobile: r.mobile,
  }));

  res.status(200).json(toPagedResult(data, page, pageSize, total));
});
