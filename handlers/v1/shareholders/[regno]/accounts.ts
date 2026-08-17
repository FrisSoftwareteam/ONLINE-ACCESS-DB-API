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

  const registerCodes = Array.from(new Set(accounts.map((a) => a.registerCode))).filter(Number.isInteger);
  const pool = await getEstockPool();
  const companiesResult = await pool
    .request()
    .query(
      `SELECT register_code AS registerCode, Company_name AS companyName
       FROM dbo.api_client_company
       WHERE register_code IN (${registerCodes.join(",")})`
    );

  const companyByCode = new Map<number, string>(
    companiesResult.recordset.map((r: any) => [r.registerCode, r.companyName])
  );

  const data = accounts.map((a) => ({
    accountNumber: a.accountNumber,
    registerCode: a.registerCode,
    companyName: companyByCode.get(a.registerCode) ?? "",
  }));

  res.status(200).json(data);
});
