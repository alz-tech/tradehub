// ════════════════════════════════════════════════════
// TRADEHUB — Auth & role middleware
// ════════════════════════════════════════════════════
const pool = require("../db/pool");

const ADMIN_USERNAMES = (process.env.ADMIN_USERNAMES || "")
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

// Converts a raw `users` table row into the shape the front-end
// expects. Two things happen here, both preserving the exact contract
// the original Firestore-based app's client code was written against:
//   1. snake_case DB columns -> camelCase (avatar_color -> avatarColor,
//      etc.) since every page's JS reads camelCase fields.
//   2. "id" is aliased from username, matching the original app's
//      Firestore documents which were always `{ id: username, ...data }`.
// Never include password_hash in anything sent to the client.
function mapUser(row) {
  if (!row) return null;
  return {
    id: row.username,
    username: row.username,
    name: row.name,
    phone: row.phone,
    role: row.role,
    avatarColor: row.avatar_color,
    avatarUrl: row.avatar_url,
    rating: row.rating !== undefined ? Number(row.rating) : 0,
    totalSales: row.total_sales,
    isAdmin: !!row.is_admin,
    isProtected: !!row.is_protected,
    isOwner: !!row.is_owner,
    adminTabs: row.admin_tabs || [],
    createdAt: row.created_at
  };
}

// Attaches req.user (full row, minus password_hash) on every request if
// a session exists. Also figures out req.isAdmin, so templates/routes
// never need to re-check the allowlist themselves.
async function attachUser(req, res, next) {
  res.locals.user = null;
  res.locals.isAdmin = false;

  const username = req.session?.username;
  if (!username) return next();

  try {
    const { rows } = await pool.query(
      `SELECT username, name, phone, role, avatar_color, avatar_url, rating, total_sales, is_admin, is_protected, is_owner, admin_tabs, created_at
       FROM users WHERE username = $1`,
      [username]
    );
    if (!rows.length) {
      req.session.destroy(() => {});
      return next();
    }

    const user = mapUser(rows[0]);
    const isEnvAdmin = ADMIN_USERNAMES.includes(username);
    const isAdmin = isEnvAdmin || user.isAdmin;
    // Env-allowlisted admins (ADMIN_USERNAMES) have no DB-backed
    // admin_tabs to scope them by, so they get full access — same
    // treatment as an owner — rather than being silently locked out
    // of every tab.
    if (isEnvAdmin) user.isOwner = true;

    req.user = user;
    req.isAdmin = isAdmin;
    res.locals.user = user;
    res.locals.isAdmin = isAdmin;
    next();
  } catch (err) {
    next(err);
  }
}

// Blocks the request entirely if not logged in.
function requireAuth(req, res, next) {
  if (!req.user) {
    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ success: false, error: "Not logged in." });
    }
    return res.redirect("/auth");
  }
  next();
}

// Admins always pass (they have full buyer + seller access by design);
// everyone else must hold the given role, or "both".
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      if (req.path.startsWith("/api/")) {
        return res.status(401).json({ success: false, error: "Not logged in." });
      }
      return res.redirect("/auth");
    }
    if (req.isAdmin || req.user.role === role || req.user.role === "both") {
      return next();
    }
    if (req.path.startsWith("/api/")) {
      return res.status(403).json({ success: false, error: `This requires a ${role} account.` });
    }
    res.redirect("/");
  };
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.isAdmin) {
    if (req.path.startsWith("/api/")) {
      return res.status(403).json({ success: false, error: "Admin access only." });
    }
    return res.redirect("/");
  }
  next();
}

// Gates the admin-management actions themselves — promoting/demoting
// an admin, or editing an admin's tab permissions. Only the owner (or
// an env-allowlisted admin, who's treated as owner — see attachUser)
// can do this; a regular admin can't grant themselves or anyone else
// more access than the owner has already given them, no matter what
// tabs they hold.
function requireOwner(req, res, next) {
  if (!req.user || !req.isAdmin || !req.user.isOwner) {
    return res.status(403).json({ success: false, error: "Only the site owner can manage admin access." });
  }
  next();
}

// Gates one specific admin tab (products/users/subscription/settings/
// orders). Must run after requireAdmin. The owner always passes,
// regardless of admin_tabs — tab restrictions only apply to the
// admins the owner has scoped down.
function requireAdminTab(tab) {
  return (req, res, next) => {
    if (!req.user || !req.isAdmin) {
      return res.status(403).json({ success: false, error: "Admin access only." });
    }
    if (req.user.isOwner || req.user.adminTabs.includes(tab)) {
      return next();
    }
    return res.status(403).json({ success: false, error: "You don't have access to this section. Ask the site owner to grant it." });
  };
}

module.exports = { attachUser, requireAuth, requireRole, requireAdmin, requireOwner, requireAdminTab, ADMIN_USERNAMES, mapUser };
