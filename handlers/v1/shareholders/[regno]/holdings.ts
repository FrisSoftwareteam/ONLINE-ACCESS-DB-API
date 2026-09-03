import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withApi } from "../../../../lib/handler";
import { getEstockPool } from "../../../../lib/db";
import { getAccountsForRegNo } from "../../../../lib/registry";

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

  const accountNumbers = Array.from(new Set(accounts.map((a) => a.accountNumber))).filter(Number.isInteger);
  const registerCodes = Array.from(new Set(accounts.map((a) => a.registerCode))).filter(Number.isInteger);
  const pool = await getEstockPool();

  const holdingsResult = await pool.request().query(
    `SELECT account_number AS accountNumber, register_code AS registerCode,
            Company_name AS companyName, Holdings AS units, branch_code AS branchCode
     FROM dbo.api_getStock
     WHERE account_number IN (${accountNumbers.join(",")}) AND register_code IN (${registerCodes.join(",")})`
  );

  const txResult = await pool.request().query(
    `SELECT cert_no AS certNo, date_issue AS dateIssue, no_of_units AS noOfUnits,
            transfer_number AS transferNumber, tranmode AS tranMode,
            certificate_status AS certificateStatus, reg_code AS registerCode, account_no AS accountNumber
     FROM dbo.Qry_Online_Transaction
     WHERE account_no IN (${accountNumbers.join(",")}) AND reg_code IN (${registerCodes.join(",")})
     ORDER BY date_issue DESC`
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
