import sql from "mssql";

function baseConfig(database: string): sql.config {
  return {
    server: process.env.DB_SERVER!,
    port: Number(process.env.DB_PORT || 1433),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database,
    options: {
      encrypt: process.env.DB_ENCRYPT !== "false",
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== "false",
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    requestTimeout: 60000,
  };
}

// Serverless-safe pool caching: within a warm container, module-level state
// persists across invocations, so we reuse pools instead of reconnecting every call.
const pools: Record<string, Promise<sql.ConnectionPool>> = {};

function getPool(key: string, database: string): Promise<sql.ConnectionPool> {
  if (!pools[key]) {
    pools[key] = new sql.ConnectionPool(baseConfig(database)).connect();
  }
  return pools[key];
}

export const getFrdbPool = () => getPool("frdb", process.env.FRDB_DATABASE || "frdb");
export const getEstockPool = () => getPool("estock", process.env.ESTOCK_DATABASE || "estock");
export const getApiDbPool = () => getPool("apidb", process.env.APIDB_DATABASE || "RegistrarApiDb");

export { sql };
