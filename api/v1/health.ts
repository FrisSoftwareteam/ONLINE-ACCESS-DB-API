import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withApi } from "../../lib/handler";
import { getFrdbPool, getEstockPool } from "../../lib/db";

async function canConnect(getPool: () => Promise<any>): Promise<boolean> {
  try {
    const pool = await getPool();
    await pool.request().query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const [frdbOk, estockOk] = await Promise.all([canConnect(getFrdbPool), canConnect(getEstockPool)]);

  const body = {
    status: estockOk ? "healthy" : "degraded",
    apiHealthy: true,
    frdbAvailable: frdbOk,
    estockAvailable: estockOk,
    checkedAtUtc: new Date().toISOString(),
  };

  res.status(estockOk ? 200 : 503).json(body);
});
