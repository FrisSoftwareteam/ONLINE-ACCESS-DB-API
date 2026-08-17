import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth, logRequest, getClientIp, AuthedClient } from "./auth";

type Handler = (req: VercelRequest, res: VercelResponse, client: AuthedClient) => Promise<void>;

/**
 * Wraps a route handler with: API key + IP allowlist auth, JSON error handling,
 * and request logging. Every endpoint in this API should be wrapped with this.
 */
export function withApi(fn: Handler) {
  return async (req: VercelRequest, res: VercelResponse) => {
    const start = Date.now();
    let clientId: number | null = null;

    try {
      const client = await requireAuth(req, res);
      if (!client) return; // requireAuth already wrote the 401/403 response

      clientId = client.id;
      await fn(req, res, client);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) {
        res.status(500).json({ message: "An unexpected error occurred." });
      }
    } finally {
      const duration = Date.now() - start;
      logRequest(clientId, req.method || "GET", req.url || "", res.statusCode, getClientIp(req), duration).catch(
        () => {}
      );
    }
  };
}
