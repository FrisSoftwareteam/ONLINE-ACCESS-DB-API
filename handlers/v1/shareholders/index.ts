import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withApi } from "../../../lib/handler";
import { getEstockPool, sql } from "../../../lib/db";
import { normalizePaging, toPagedResult } from "../../../lib/pagination";
import { getRegNosForAccounts } from "../../../lib/registry";

function firstQueryValue(v: unknown): string | undefined {
  if (Array.isArray(v)) return v[0];
  return typeof v === "string" ? v : undefined;
}

// Strips everything but digits and a leading '+' — spaces, dashes, parens, etc. —
// so a search term and the stored mobile value can be compared on digits alone.
function digitsOnly(s: string): string {
  return s.replace(/[^0-9+]/g, "");
}

// Nigerian local (0xxx) vs country-code (+234xxx / 234xxx) numbers are the same
// number in two common formats. If the search term looks like one of them, this
// returns the other form so both get matched — without guessing at other countries.
function mobileCountryCodeVariant(stripped: string): string | null {
  if (stripped.startsWith("+234")) return "0" + stripped.slice(4);
  if (stripped.startsWith("234") && stripped.length > 3) return "0" + stripped.slice(3);
  if (stripped.startsWith("0")) return "234" + stripped.slice(1);
  return null;
}

// mobile compared with spaces/dashes/parens stripped, so formatting differences
// between the source data and the search term don't cause a miss. This is only
// used when the search term looks like a phone number (see below) — wrapping the
// column in REPLACE() on every row is measurably more expensive than a plain LIKE
// (~2.5s vs ~15s locally on an unfiltered-by-index search), and a name/email
// search never needs it.
const MOBILE_EXPR = "REPLACE(REPLACE(REPLACE(REPLACE(mobile,' ',''),'-',''),'(',''),')','')";

// Mostly digits (allowing spaces/dashes/parens/+ as formatting) and long enough
// to plausibly be a phone number rather than, say, a numeric-looking name search.
function looksLikePhoneNumber(term: string): boolean {
  const digits = term.replace(/[^0-9]/g, "");
  return digits.length >= 7 && /^[0-9+\s()-]+$/.test(term);
}

interface BoundInput {
  name: string;
  type: any;
  value: unknown;
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

  // Build the WHERE clause and its bound values once, up front, and apply the
  // exact same inputs to both the count query and the page query — keeps the
  // two queries from silently drifting apart.
  const conditions: string[] = ["1 = 1"];
  const inputs: BoundInput[] = [];

  if (search) {
    let mobileCondition = "mobile LIKE @search"; // cheap default — reuses the @search input below

    if (looksLikePhoneNumber(search)) {
      const strippedSearch = digitsOnly(search);
      const mobileVariant = strippedSearch ? mobileCountryCodeVariant(strippedSearch) : null;

      mobileCondition = `${MOBILE_EXPR} LIKE @searchMobile`;
      inputs.push({ name: "searchMobile", type: sql.VarChar, value: `%${strippedSearch || search}%` });

      if (mobileVariant) {
        mobileCondition += ` OR ${MOBILE_EXPR} LIKE @searchMobileAlt`;
        inputs.push({ name: "searchMobileAlt", type: sql.VarChar, value: `%${mobileVariant}%` });
      }
    }

    conditions.push(`(names LIKE @search OR mail LIKE @search OR (${mobileCondition}) OR CAST(account_number AS varchar(20)) = @searchExact)`);
    inputs.push({ name: "search", type: sql.VarChar, value: `%${search}%` });
    inputs.push({ name: "searchExact", type: sql.VarChar, value: search });
  }

  const registerCode = registerCodeRaw ? Number(registerCodeRaw) : undefined;
  if (registerCode !== undefined && Number.isInteger(registerCode)) {
    conditions.push("register_code = @registerCode");
    inputs.push({ name: "registerCode", type: sql.Int, value: registerCode });
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

  const pool = await getEstockPool();
  const makeRequest = () => {
    const request = pool.request();
    for (const input of inputs) request.input(input.name, input.type, input.value);
    return request;
  };

  const countResult = await makeRequest().query(`SELECT COUNT(*) AS total FROM dbo.api_shareinfo_company ${where}`);
  const total = countResult.recordset[0].total as number;

  const pageRequest = makeRequest();
  pageRequest.input("offset", sql.Int, offset);
  pageRequest.input("pageSize", sql.Int, pageSize);

  const pageResult = await pageRequest.query(
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
