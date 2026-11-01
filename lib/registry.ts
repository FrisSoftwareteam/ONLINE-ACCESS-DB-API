import { getApiDbPool, sql } from "./db";

export interface AccountKey {
  accountNumber: number;
  registerCode: number;
}

/**
 * Builds `(VALUES (acct, reg), ...) AS p(a, r)` so a query can join on the exact
 * account+register pairs belonging to a regno. Matching `account IN (...) AND
 * register IN (...)` separately is wrong: account numbers are only unique within a
 * register, so it also matches other people's accounts (account A on register B).
 * Values are validated integers from our own registry, never raw user input.
 */
export function pairsValuesClause(accounts: AccountKey[]): string {
  const pairs = accounts.filter((a) => Number.isInteger(a.accountNumber) && Number.isInteger(a.registerCode));
  if (pairs.length === 0) return "(VALUES (CAST(NULL AS int), CAST(NULL AS int))) AS p(a, r)";
  // SQL Server allows at most 1000 rows in a VALUES list; the largest regno today has ~120 pairs.
  if (pairs.length > 1000) throw new Error("Too many linked accounts for one regno.");
  return `(VALUES ${pairs.map((a) => `(${a.accountNumber},${a.registerCode})`).join(",")}) AS p(a, r)`;
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
