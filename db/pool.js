// ════════════════════════════════════════════════════
// TRADEHUB — PostgreSQL connection pool
// ════════════════════════════════════════════════════
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render's managed Postgres requires SSL; disabled automatically for
  // local development against a non-SSL local database.
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
});

pool.on("error", (err) => {
  console.error("Unexpected Postgres pool error:", err);
});

module.exports = pool;
