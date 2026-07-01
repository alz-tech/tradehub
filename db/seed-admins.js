// ════════════════════════════════════════════════════
// TRADEHUB — Designated admin accounts
// Runs once at every boot, right after the schema migration. For each
// entry below: if the account already exists (has signed up), it is
// promoted to admin (and protected, if flagged) — repeatedly, so it
// can never accidentally drift back to a regular user even if someone
// edits the DB by hand. If the account does NOT exist yet, nothing
// happens; promotion is applied automatically the moment they sign up
// (see designatedAdmin() in routes/api/auth.js).
//
// "protected" = invincible in the admin users list: routes/api/users.js
// refuses to demote, deactivate, or delete any user with is_protected
// = true, no matter who's asking.
//
// Usernames only — this app's accounts are handles, not emails. Each
// entry's `email` is kept purely as a comment/reference for whoever
// reads this file later; it is never written to the database.
// ════════════════════════════════════════════════════
const DESIGNATED_ADMINS = [
  { username: "confidencerich97", email: "confidencerich97@gmail.com", protected: true },
  { username: "nicky", email: "nicky@tradehub.com", protected: false }
];

async function seedAdmins(pool) {
  for (const admin of DESIGNATED_ADMINS) {
    try {
      const { rows } = await pool.query(
        `UPDATE users SET is_admin = TRUE, is_protected = $2
         WHERE username = $1 AND (is_admin IS DISTINCT FROM TRUE OR is_protected IS DISTINCT FROM $2)
         RETURNING username`,
        [admin.username, admin.protected]
      );
      if (rows.length) {
        console.log(`[seed-admins] @${admin.username} (${admin.email}) is now an admin${admin.protected ? " (protected)" : ""}.`);
      }
    } catch (err) {
      // Never let a seeding problem take the whole server down — log
      // and move on to the next admin / let the app boot regardless.
      console.error(`[seed-admins] Could not promote @${admin.username}:`, err.message);
    }
  }
}

module.exports = { seedAdmins, DESIGNATED_ADMINS };
