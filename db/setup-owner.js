// ════════════════════════════════════════════════════
// TRADEHUB — Owner account setup
// ════════════════════════════════════════════════════
// Promotes an already-registered account to owner: admin + is_owner +
// is_protected + a permanent (lifetime) subscription with every admin
// tab granted.
//
// The account must already exist — sign up normally through /auth
// first. Usernames can only contain lowercase letters, numbers, "."
// and "_" (the signup form strips everything else), so an email like
// confidencerich97@gmail.com can't be typed in as-is; sign up with
// something like "confidencerich" and pass that here instead.
//
// Usage:
//   node db/setup-owner.js <username>
//
// Safe to re-run — every step here is idempotent (UPDATE / INSERT ..
// ON CONFLICT), so running it twice on the same username just
// confirms the account is still set up correctly.
// ════════════════════════════════════════════════════
// dotenv is optional here — it only matters if you're loading a local
// .env file. If you're passing DATABASE_URL directly on the command
// line (as in the usage example below), this does nothing and that's
// fine; it just means node_modules doesn't need dotenv installed for
// this to work.
try { require("dotenv").config(); } catch { /* not installed — fine, see above */ }
const pool = require("./pool");

async function setupOwner(username) {
  const { rows } = await pool.query("SELECT username, is_owner FROM users WHERE username = $1", [username]);
  if (!rows.length) {
    throw new Error(
      `No account found for "${username}". Sign up through the app first (Sign Up on /auth), then run this again with that exact username.`
    );
  }

  const { rows: existingOwners } = await pool.query(
    "SELECT username FROM users WHERE is_owner = TRUE AND username != $1",
    [username]
  );
  if (existingOwners.length) {
    console.warn(
      `Note: "${existingOwners[0].username}" is already an owner. This will add a second owner (${username}), not replace them.`
    );
  }

  await pool.query(
    `UPDATE users
     SET is_admin = TRUE, is_owner = TRUE, is_protected = TRUE,
         admin_tabs = ARRAY['users','products','subscription','settings','orders']
     WHERE username = $1`,
    [username]
  );

  await pool.query(
    `INSERT INTO subscriptions (username, status, is_lifetime)
     VALUES ($1, 'active', TRUE)
     ON CONFLICT (username) DO UPDATE SET status = 'active', is_lifetime = TRUE, updated_at = now()`,
    [username]
  );

  console.log(`Done. @${username} is now an owner: admin, protected, every tab granted, permanent (lifetime) access.`);
}

if (require.main === module) {
  const username = process.argv[2];
  if (!username) {
    console.error("Usage: node db/setup-owner.js <username>");
    process.exitCode = 1;
  } else {
    setupOwner(username.trim().toLowerCase())
      .catch(err => {
        console.error("Setup failed:", err.message);
        process.exitCode = 1;
      })
      .finally(() => pool.end());
  }
}

module.exports = { setupOwner };
