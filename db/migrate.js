// ════════════════════════════════════════════════════
// TRADEHUB — Schema migration
// Reads db/schema.sql and runs it against DATABASE_URL. Every
// statement in schema.sql uses CREATE TABLE IF NOT EXISTS / CREATE
// INDEX IF NOT EXISTS, so this is safe to run repeatedly without
// dropping or duplicating data.
//
// runMigration() is called automatically by server.js on every boot,
// so the schema is created on the very first request/visit — no
// separate step (e.g. a Render "Pre-Deploy Command") is required.
// `npm run migrate` still works too, for anyone who wants to run it
// by hand (e.g. against a database before pointing the app at it).
// ════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");

async function runMigration(pool) {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(sql);
}

module.exports = { runMigration };

// ── CLI usage: `npm run migrate` ──────────────────────
if (require.main === module) {
  require("dotenv").config();
  const pool = require("./pool");
  (async () => {
    console.log("Running schema.sql against the database...");
    try {
      await runMigration(pool);
      console.log("Migration complete — all tables and indexes are up to date.");
    } catch (err) {
      console.error("Migration failed:", err.message);
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  })();
}
