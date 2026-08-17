import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withApi } from "../../../../lib/handler";
import { getEstockPool } from "../../../../lib/db";
import { getAccountsForRegNo } from "../../../../lib/registry";
import { normalizePaging, toPagedResult } from "../../../../lib/pagination";

function firstQueryValue(v: unknown): string | undefined {
  if (Array.isArray(v)) return v[0];
  return typeof v === "string" ? v : undefined;
}

interface DividendRow {
  registerCode: number;
  companyName: string;
  accountNumber: number;
  paymentNo: number | null;
  amount: number | null;
  yearEnd: Date | null;
  datePayable: Date | null;
  datePaid: Date | null;
  /** paid | unpaid. "returned" is not currently trackable in the source data. */
  status: "paid" | "unpaid";
}

// NOTE: estock's api_claimed_dividend and api_unclaimeddividendbyphone views are
// broken at the database level (they reference a nonexistent dbo.api_divclientcompany
// object internally — a pre-existing bug in the legacy database, not introduced here).
// dbo.paid_unclaimed_dividend is the one reliable source and covers both cases via
// its div_unclaimed flag: 0 = paid, 1 = unpaid/unclaimed.
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ message: "Method not allowed." });
    return;
  }

  const regNo = Number(req.query.regno);
  if (!Number.isInteger(regNo)) {
    res.status(400).json({ message: "regno must be an integer." });
    return;
  }

  const accounts = await getAccountsForRegNo(regNo);
  if (accounts.length === 0) {
    res.status(404).json({ message: `No shareholder found for regno ${regNo}` });
    return;
  }

  const status = firstQueryValue(req.query.status); // "paid" | "unpaid" | undefined
  const accountNumbers = Array.from(new Set(accounts.map((a) => a.accountNumber))).filter(Number.isInteger);
  const registerCodes = Array.from(new Set(accounts.map((a) => a.registerCode))).filter(Number.isInteger);

  const pool = await getEstockPool();

  const companiesResult = await pool
    .request()
    .query(
      `SELECT register_code AS registerCode, Company_name AS companyName
       FROM dbo.api_client_company WHERE register_code IN (${registerCodes.join(",")})`
    );
  const companyByCode = new Map<number, string>(
    companiesResult.recordset.map((r: any) => [r.registerCode, r.companyName])
  );

  let statusFilter = "";
  if (status === "paid") statusFilter = "AND div_unclaimed = 0";
  else if (status === "unpaid") statusFilter = "AND div_unclaimed = 1";

  const dividendsResult = await pool.request().query(
    `SELECT account_no AS accountNo, divreg_code AS registerCode, divgross_amt AS grossAmt,
            divdate_payable AS divDatePayable, yrend AS yearEnd, divwarrant_no AS warrantNo,
            date_paid AS datePaid, div_unclaimed AS divUnclaimed
     FROM dbo.paid_unclaimed_dividend
     WHERE account_no IN (${accountNumbers.join(",")}) AND divreg_code IN (${registerCodes.join(",")}) ${statusFilter}`
  );

  const results: DividendRow[] = dividendsResult.recordset.map((r: any) => ({
    registerCode: r.registerCode,
    companyName: companyByCode.get(r.registerCode) ?? "",
    accountNumber: r.accountNo,
    paymentNo: r.warrantNo,
    amount: r.grossAmt,
    yearEnd: r.yearEnd,
    datePayable: r.divDatePayable,
    datePaid: r.divUnclaimed === 0 ? r.datePaid : null,
    status: r.divUnclaimed === 0 ? "paid" : "unpaid",
  }));

  results.sort((a, b) => {
    const da = a.datePayable ? new Date(a.datePayable).getTime() : 0;
    const db_ = b.datePayable ? new Date(b.datePayable).getTime() : 0;
    return db_ - da;
  });

  const { page, pageSize, offset } = normalizePaging(req.query.page, req.query.page_size);
  const pageData = results.slice(offset, offset + pageSize);

  res.status(200).json(toPagedResult(pageData, page, pageSize, results.length));
});
