import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withApi } from "../../lib/handler";
import { getEstockPool } from "../../lib/db";

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "GET") {
    res.status(405).json({ message: "Method not allowed." });
    return;
  }

  const pool = await getEstockPool();
  const result = await pool.request().query(
    `SELECT register_code AS registerCode, Company_name AS companyName, active
     FROM dbo.api_client_company
     ORDER BY Company_name`
  );

  res.status(200).json(result.recordset);
});
