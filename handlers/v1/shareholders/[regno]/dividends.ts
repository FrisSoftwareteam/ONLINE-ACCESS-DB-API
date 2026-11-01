import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withApi } from "../../../../lib/handler";
import { getEstockPool, sql } from "../../../../lib/db";
import { getAccountsForRegNo, pairsValuesClause } from "../../../../lib/registry";
import { normalizePaging, toPagedResult } from "../../../../lib/pagination";

function firstQueryValue(v: unknown): string | undefined {
  if (Array.isArray(v)) return v[0];
  return typeof v === "string" ? v : undefined;
}

interface DividendRow {
  registerCode: number;
  companyName: string;
  accountNumber: number;
  /** Dividend declaration number (the portal's "Div. No"). */
  dividendNo: number | null;
  /** e.g. INTERIM, FINAL. */
  type: string | null;
  /** The dividend warrant number (the portal's "Warr. No"). */
  paymentNo: number | null;
  /** Gross dividend amount. */
  amount: number | null;
  taxAmount: number | null;
  netAmount: number | null;
  /** Shareholder's unit holding as recorded against this dividend record. */
  holdingUnits: number | null;
  yearEnd: Date | null;
  datePayable: Date | null;
  datePaid: Date | null;
  /** The registrar system's own "unclaimed" flag. Independent of whether a payment date exists. */
  unclaimed: boolean;
  /** paid = a payment date is recorded; unpaid = none. */
  status: "paid" | "unpaid";
}

// Source is dbo.T_Divs — the same table behind the portal's dividend history page — matched on the
// exact account+register pairs of this regno. (The previous source, paid_unclaimed_dividend, is a
// one-off report limited to dividends paid between Jan and Mar 2019, so it was missing nearly everything.)
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
  if (status === "paid") statusFilter = "WHERE d.date_paid IS NOT NULL";
  else if (status === "unpaid") statusFilter = "WHERE d.date_paid IS NULL";

  const from = `FROM dbo.T_Divs AS d
                JOIN ${pairsValuesClause(accounts)} ON d.account_no = p.a AND d.divreg_code = p.r
                ${statusFilter}`;

  const { page, pageSize, offset } = normalizePaging(req.query.page, req.query.page_size);

  const countResult = await pool.request().query(`SELECT COUNT(*) AS total ${from}`);
  const total = countResult.recordset[0].total as number;

  const pageResult = await pool
    .request()
    .input("offset", sql.Int, offset)
    .input("pageSize", sql.Int, pageSize)
    .query(
      `SELECT d.account_no AS accountNo, d.divreg_code AS registerCode, d.divpay_no AS dividendNo,
              d.dividend_type AS type, d.divwarrant_no AS warrantNo, d.divgross_amt AS grossAmt,
              d.divtax_amount AS taxAmt, d.div_netamt AS netAmt, d.total_holding AS holdingUnits,
              d.divdate_payable AS divDatePayable, d.yrend AS yearEnd, d.date_paid AS datePaid,
              d.div_unclaimed AS unclaimed
       ${from}
       ORDER BY d.divdate_payable DESC, d.divpay_no DESC, d.auto DESC
       OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`
    );

  const data: DividendRow[] = pageResult.recordset.map((r: any) => ({
    registerCode: r.registerCode,
    companyName: companyByCode.get(r.registerCode) ?? "",
    accountNumber: r.accountNo,
    dividendNo: r.dividendNo,
    type: r.type ? String(r.type).trim() : null,
    paymentNo: r.warrantNo,
    amount: r.grossAmt,
    taxAmount: r.taxAmt,
    netAmount: r.netAmt,
    holdingUnits: r.holdingUnits,
    yearEnd: r.yearEnd,
    datePayable: r.divDatePayable,
    datePaid: r.datePaid,
    // mssql returns SQL Server `bit` columns as a JS boolean, not 0/1.
    unclaimed: r.unclaimed === true || r.unclaimed === 1,
    status: r.datePaid ? "paid" : "unpaid",
  }));

  res.status(200).json(toPagedResult(data, page, pageSize, total));
});
