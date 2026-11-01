import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withApi } from "../../../../lib/handler";
import { getEstockPool } from "../../../../lib/db";
import { getAccountsForRegNo, pairsValuesClause } from "../../../../lib/registry";

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

  const pool = await getEstockPool();

  // Exact account+register pairs only — matching the two lists independently would also pull in
  // other shareholders' accounts (account numbers are only unique within a register).
  const pairs = pairsValuesClause(accounts);

  const holdingsResult = await pool.request().query(
    `SELECT g.account_number AS accountNumber, g.register_code AS registerCode,
            g.Company_name AS companyName, g.Holdings AS units, g.branch_code AS branchCode
     FROM dbo.api_getStock AS g
     JOIN ${pairs} ON g.account_number = p.a AND g.register_code = p.r`
  );

  const txResult = await pool.request().query(
    `SELECT t.cert_no AS certNo, t.date_issue AS dateIssue, t.no_of_units AS noOfUnits,
            t.transfer_number AS transferNumber, t.tranmode AS tranMode,
            t.certificate_status AS certificateStatus, t.reg_code AS registerCode, t.account_no AS accountNumber
     FROM dbo.Qry_Online_Transaction AS t
     JOIN ${pairs} ON t.account_no = p.a AND t.reg_code = p.r
     ORDER BY t.date_issue DESC`
  );

  const transactions = txResult.recordset;

  const certificates = transactions
    .filter((t: any) => t.certNo)
    .map((t: any) => ({
      certificateNo: String(t.certNo),
      registerCode: t.registerCode,
      accountNumber: t.accountNumber,
      units: t.noOfUnits ?? 0,
      dateIssued: t.dateIssue,
      certificateStatus: !!t.certificateStatus,
    }));

  const transactionHistory = transactions.map((t: any) => ({
    transferNumber: t.transferNumber,
    registerCode: t.registerCode,
    accountNumber: t.accountNumber,
    units: t.noOfUnits,
    transactionMode: t.tranMode,
    dateIssued: t.dateIssue,
  }));

  res.status(200).json({
    currentHoldings: holdingsResult.recordset,
    certificates,
    transactionHistory,
  });
});
