const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Forzar timezone Lima en cada nueva conexión del pool
// Así CURRENT_DATE, NOW() dentro de PostgreSQL usan hora de Lima (UTC-5)
pool.on("connect", (client) => {
  client.query("SET TIME ZONE 'America/Lima'");
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

async function testConnection() {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query("SELECT NOW() AT TIME ZONE 'America/Lima' AS now_lima");
    console.log("✅  DB connected (Lima time):", result.rows[0].now_lima);
    return true;
  } catch (err) {
    console.error("❌  DB connection failed:", err.message);
    return false;
  } finally {
    if (client) client.release();
  }
}

module.exports = { pool, testConnection };
