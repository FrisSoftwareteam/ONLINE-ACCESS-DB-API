import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withApi } from "../../../../lib/handler";
import { getEstockPool, sql } from "../../../../lib/db";
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

  // Representative account for the summary view: lowest register+account for determinism.
  const primary = [...accounts].sort(
    (a, b) => a.registerCode - b.registerCode || a.accountNumber - b.accountNumber
  )[0];

  const pool = await getEstockPool();
  const result = await pool
    .request()
    .input("accountNumber", sql.Int, primary.accountNumber)
    .input("registerCode", sql.Int, primary.registerCode)
    .query(
      `SELECT account_number AS accountNumber, register_code AS registerCode,
              Company_name AS companyName, names, mail AS email, mobile, address
       FROM dbo.api_shareinfo_company
       WHERE account_number = @accountNumber AND register_code = @registerCode`
    );

  const row = result.recordset[0];
  if (!row) {
    res.status(404).json({ message: `No shareholder found for regno ${regNo}` });
    return;
  }

  res.status(200).json({
    regno: regNo.toString(),
    accountNumber: row.accountNumber,
    registerCode: row.registerCode,
    companyName: row.companyName,
    names: row.names,
    email: row.email,
    mobile: row.mobile,
    address: row.address,
  });
});
