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
// ════════════════════════════════════════════════════
// TRADEHUB — Designated admin accounts
// Runs once at every boot, right after the schema migration. For each
// entry below: if the account already exists (has signed up), it is
// promoted — repeatedly, so it can never accidentally drift back to a
// regular user even if someone edits the DB by hand. If the account
// does NOT exist yet, nothing happens; promotion is applied
// automatically the moment they sign up (see designatedAdmin() in
// routes/api/auth.js) — no restart needed to take effect.
//
// Fields:
//   protected — invincible in the admin users list: routes/api/users.js
//               refuses to demote, deactivate, or delete this account,
//               no matter who's asking.
//   owner     — manages every other admin's access (promote/demote,
//               edit their admin_tabs). Automatically granted every
//               tab; adminTabs below is ignored for an owner.
//   adminTabs — which admin-panel tabs a non-owner admin can access.
//               Omit or leave empty to require the owner to grant
//               access manually from the Users tab after they sign up.
//   lifetime  — permanent, non-expiring seller subscription (skips
//               the ₦1,500/month paid cycle entirely).
//
// Usernames only — this app's accounts are handles, not emails. Each
// entry's `email` is kept purely as a comment/reference for whoever
// reads this file later; it is never written to the database.
// ════════════════════════════════════════════════════
const ALL_ADMIN_TABS = ["users", "products", "subscription", "settings", "orders"];

const DESIGNATED_ADMINS = [
  { username: "confidencerich", email: "confidencerich97@gmail.com", protected: true, owner: true, adminTabs: ALL_ADMIN_TABS, lifetime: true },
  { username: "nicky", email: "nicky@tradehub.com", protected: false, owner: false, adminTabs: [], lifetime: false }
];

async function seedAdmins(pool) {
  for (const admin of DESIGNATED_ADMINS) {
    try {
      const tabs = admin.owner ? ALL_ADMIN_TABS : (admin.adminTabs || []);
      const { rows } = await pool.query(
        `UPDATE users SET is_admin = TRUE, is_protected = $2, is_owner = $3, admin_tabs = $4
         WHERE username = $1
           AND (is_admin IS DISTINCT FROM TRUE OR is_protected IS DISTINCT FROM $2
                OR is_owner IS DISTINCT FROM $3 OR admin_tabs IS DISTINCT FROM $4)
         RETURNING username`,
        [admin.username, admin.protected, admin.owner, tabs]
      );
      if (rows.length) {
        console.log(`[seed-admins] @${admin.username} (${admin.email}) is now ${admin.owner ? "an owner" : "an admin"}${admin.protected ? " (protected)" : ""}.`);
      }
      if (admin.lifetime) {
        await grantLifetimeSubscription(pool, admin.username);
      }
    } catch (err) {
      // Never let a seeding problem take the whole server down — log
      // and move on to the next admin / let the app boot regardless.
      console.error(`[seed-admins] Could not promote @${admin.username}:`, err.message);
    }
  }
}

// Shared by both the boot-time seed above and the immediate signup-time
// application in routes/api/auth.js, so the "permanent access" logic
// only lives in one place. ON CONFLICT DO UPDATE means this works
// whether or not a subscription row already exists (e.g. from the
// automatic seller trial granted at signup).
async function grantLifetimeSubscription(db, username) {
  const { rowCount } = await db.query(
    `INSERT INTO subscriptions (username, status, is_lifetime)
     VALUES ($1, 'active', TRUE)
     ON CONFLICT (username) DO UPDATE SET status = 'active', is_lifetime = TRUE, updated_at = now()
     WHERE subscriptions.is_lifetime IS DISTINCT FROM TRUE`,
    [username]
  );
  if (rowCount) console.log(`[seed-admins] @${username} granted permanent (lifetime) access.`);
}

module.exports = { seedAdmins, grantLifetimeSubscription, DESIGNATED_ADMINS, ALL_ADMIN_TABS };
