import { getApiDbPool, sql } from "./db";

export interface AccountKey {
  accountNumber: number;
  registerCode: number;
}

export async function getAccountsForRegNo(regNo: number): Promise<AccountKey[]> {
  const pool = await getApiDbPool();
  const result = await pool
    .request()
    .input("regNo", sql.BigInt, regNo)
    .query(
      `SELECT AccountNumber AS accountNumber, RegisterCode AS registerCode
       FROM dbo.ShareholderRegistryAccounts
       WHERE RegNo = @regNo`
    );
  return result.recordset;
}

export async function getRegNosForAccounts(keys: AccountKey[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (keys.length === 0) return map;

  // account_number values only ever come from our own upstream DB queries (never raw user
  // input), and are guaranteed integers here, so a validated inline IN-list is safe.
  const accountNumbers = Array.from(new Set(keys.map((k) => k.accountNumber)))
    .filter((n) => Number.isInteger(n));
  if (accountNumbers.length === 0) return map;

  const pool = await getApiDbPool();
  const result = await pool
    .request()
    .query(
      `SELECT AccountNumber AS accountNumber, RegisterCode AS registerCode, RegNo AS regNo
       FROM dbo.ShareholderRegistryAccounts
       WHERE AccountNumber IN (${accountNumbers.join(",")})`
    );

  for (const row of result.recordset) {
    map.set(`${row.accountNumber}-${row.registerCode}`, Number(row.regNo));
  }
  return map;
}

export function accountKey(accountNumber: number, registerCode: number): string {
  return `${accountNumber}-${registerCode}`;
}
