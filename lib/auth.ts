import crypto from "crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getApiDbPool, sql } from "./db";

export interface AuthedClient {
  id: number;
  clientName: string;
}

/**
 * Atomically increments this client's request count for the current UTC minute
 * and returns the new count. One row per (client, minute) — cheap, and safe
 * under concurrent requests since the increment happens inside the MERGE.
 */
async function incrementRateLimitWindow(
  pool: Awaited<ReturnType<typeof getApiDbPool>>,
  clientId: number
): Promise<number> {
  const windowStart = new Date();
  windowStart.setUTCSeconds(0, 0);

  const result = await pool
    .request()
    .input("id", sql.Int, clientId)
    .input("windowStart", sql.DateTime2, windowStart)
    .query(
      `MERGE dbo.ApiRateLimitWindow AS target
       USING (SELECT @id AS ApiClientId, @windowStart AS WindowStartUtc) AS src
         ON target.ApiClientId = src.ApiClientId AND target.WindowStartUtc = src.WindowStartUtc
       WHEN MATCHED THEN UPDATE SET RequestCount = RequestCount + 1
       WHEN NOT MATCHED THEN INSERT (ApiClientId, WindowStartUtc, RequestCount) VALUES (src.ApiClientId, src.WindowStartUtc, 1)
       OUTPUT inserted.RequestCount;`
    );

  // Opportunistic cleanup of old windows for this client — cheap (indexed by the same PK prefix),
  // no separate job needed for a table that only ever grows by ~1 row/client/minute.
  pool
    .request()
    .input("id", sql.Int, clientId)
    .input("cutoff", sql.DateTime2, new Date(Date.now() - 60 * 60 * 1000))
    .query("DELETE FROM dbo.ApiRateLimitWindow WHERE ApiClientId = @id AND WindowStartUtc < @cutoff")
    .catch(() => {});

  return result.recordset[0].RequestCount as number;
}

function getClientIp(req: VercelRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  if (Array.isArray(fwd) && fwd.length > 0) return fwd[0].split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function ipMatches(ip: string, entry: string): boolean {
  const trimmed = entry.trim();
  if (!trimmed.includes("/")) return trimmed === ip;

  // CIDR match (IPv4 only — sufficient for the allowlist use case here).
  const [base, prefixStr] = trimmed.split("/");
  const prefix = Number(prefixStr);
  const toInt = (addr: string) =>
    addr.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;

  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip) || !/^\d+\.\d+\.\d+\.\d+$/.test(base)) return false;

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (toInt(ip) & mask) === (toInt(base) & mask);
}

/**
 * Validates the X-Api-Key header and (if configured) the caller's IP against
 * the client's allowlist. On failure, writes the response and returns null —
 * callers should immediately `return` when this happens.
 */
export async function requireAuth(req: VercelRequest, res: VercelResponse): Promise<AuthedClient | null> {
  const apiKey = req.headers["x-api-key"];
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    res.status(401).json({ message: "Missing X-Api-Key header." });
    return null;
  }

  const keyHash = crypto.createHash("sha256").update(apiKey, "utf8").digest();

  const pool = await getApiDbPool();
  const clientResult = await pool
    .request()
    .input("hash", sql.VarBinary(32), keyHash)
    .query("SELECT Id, ClientName, IsActive, RateLimitPerMinute FROM dbo.ApiClients WHERE ApiKeyHash = @hash");

  const client = clientResult.recordset[0];
  if (!client) {
    res.status(401).json({ message: "Invalid API key." });
    return null;
  }
  if (!client.IsActive) {
    res.status(401).json({ message: "API client is disabled." });
    return null;
  }

  const remoteIp = getClientIp(req);
  const allowlistResult = await pool
    .request()
    .input("id", sql.Int, client.Id)
    .query("SELECT IpAddress FROM dbo.ApiIpAllowlist WHERE ApiClientId = @id AND IsActive = 1");

  const allowlist: string[] = allowlistResult.recordset.map((r: any) => r.IpAddress);
  if (allowlist.length > 0 && !allowlist.some((entry) => ipMatches(remoteIp, entry))) {
    res.status(403).json({ message: `IP ${remoteIp} is not allowlisted for this client.` });
    return null;
  }

  const rateLimit: number | null = client.RateLimitPerMinute;
  if (rateLimit != null) {
    const count = await incrementRateLimitWindow(pool, client.Id);
    if (count > rateLimit) {
      res.setHeader("Retry-After", "60");
      res.status(429).json({ message: `Rate limit exceeded: ${rateLimit} requests per minute.` });
      return null;
    }
  }

  await pool
    .request()
    .input("id", sql.Int, client.Id)
    .query("UPDATE dbo.ApiClients SET LastUsedOn = SYSUTCDATETIME() WHERE Id = @id");

  return { id: client.Id, clientName: client.ClientName };
}

export async function logRequest(
  apiClientId: number | null,
  method: string,
  path: string,
  statusCode: number,
  remoteIp: string,
  durationMs: number
): Promise<void> {
  try {
    const pool = await getApiDbPool();
    await pool
      .request()
      .input("apiClientId", sql.Int, apiClientId)
      .input("method", sql.VarChar(10), method)
      .input("path", sql.VarChar(500), path)
      .input("statusCode", sql.Int, statusCode)
      .input("remoteIp", sql.VarChar(45), remoteIp)
      .input("durationMs", sql.Int, durationMs)
      .query(
        `INSERT INTO dbo.RequestLog (ApiClientId, Method, Path, StatusCode, RemoteIp, DurationMs)
         VALUES (@apiClientId, @method, @path, @statusCode, @remoteIp, @durationMs)`
      );
  } catch {
    // Logging must never break the request.
  }
}

export { getClientIp };
