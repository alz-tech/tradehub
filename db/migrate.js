// ════════════════════════════════════════════════════
// TRADEHUB — Schema migration runner
// Usage:  npm run migrate
// Reads db/schema.sql and runs it against DATABASE_URL. Every
// statement in schema.sql uses CREATE TABLE IF NOT EXISTS / CREATE
// INDEX IF NOT EXISTS, so this is safe to run repeatedly (e.g. as a
// Render "Pre-Deploy Command") without dropping or duplicating data.
// ════════════════════════════════════════════════════
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("./pool");

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  console.log("Running schema.sql against the database...");
  try {
    await pool.query(sql);
    console.log("Migration complete — all tables and indexes are up to date.");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
