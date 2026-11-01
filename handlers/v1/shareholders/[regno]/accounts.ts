import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withApi } from "../../../../lib/handler";
import { getEstockPool } from "../../../../lib/db";
import { getAccountsForRegNo, pairsValuesClause, accountKey } from "../../../../lib/registry";

const clean = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

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
  const pairs = pairsValuesClause(accounts);

  const [companiesResult, infoResult, holderResult] = await Promise.all([
    pool.request().query(
      `SELECT register_code AS registerCode, Company_name AS companyName
       FROM dbo.api_client_company
       WHERE register_code IN (${registerCodes.join(",")})`
    ),
    // Per-account name / address / contact, for exactly this regno's account+register pairs.
    pool.request().query(
      `SELECT s.account_number AS accountNumber, s.register_code AS registerCode,
              s.names, s.address, s.mail AS email, s.mobile
       FROM dbo.api_shareinfo_company AS s
       JOIN ${pairs} ON s.account_number = p.a AND s.register_code = p.r`
    ),
    // CSCS / clearing house number and the previous account number.
    pool.request().query(
      `SELECT h.Acctno AS accountNumber, h.regcode AS registerCode, h.chn, h.oldaccountno
       FROM dbo.T_shold AS h
       JOIN ${pairs} ON h.Acctno = p.a AND h.regcode = p.r`
    ),
  ]);

  const companyByCode = new Map<number, string>(
    companiesResult.recordset.map((r: any) => [r.registerCode, r.companyName])
  );
  const infoByKey = new Map<string, any>(
    infoResult.recordset.map((r: any) => [accountKey(r.accountNumber, r.registerCode), r])
  );
  const holderByKey = new Map<string, any>(
    holderResult.recordset.map((r: any) => [accountKey(r.accountNumber, r.registerCode), r])
  );

  const data = accounts.map((a) => {
    const key = accountKey(a.accountNumber, a.registerCode);
    const info = infoByKey.get(key);
    const holder = holderByKey.get(key);
    return {
      accountNumber: a.accountNumber,
      registerCode: a.registerCode,
      companyName: companyByCode.get(a.registerCode) ?? "",
      names: clean(info?.names),
      address: clean(info?.address),
      email: clean(info?.email),
      mobile: clean(info?.mobile),
      clearingNo: clean(holder?.chn),
      oldAccountNo: clean(holder?.oldaccountno),
    };
  });

  res.status(200).json(data);
});
