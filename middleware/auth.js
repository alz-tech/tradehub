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
    createdAt: row.created_at
  };
}

// Attaches req.user (full row, minus password_hash) on every request if
// a session exists. Also figures out req.isAdmin and req.viewMode, so
// templates/routes never need to re-check the allowlist themselves.
async function attachUser(req, res, next) {
  res.locals.viewMode = null;
  res.locals.user = null;
  res.locals.isAdmin = false;

  const username = req.session?.username;
  if (!username) return next();

  try {
    const { rows } = await pool.query(
      `SELECT username, name, phone, role, avatar_color, avatar_url, rating, total_sales, is_admin, created_at
       FROM users WHERE username = $1`,
      [username]
    );
    if (!rows.length) {
      req.session.destroy(() => {});
      return next();
    }

    const user = mapUser(rows[0]);
    const isAdmin = ADMIN_USERNAMES.includes(username) || user.isAdmin;

    // Admins can switch which dashboard they're looking at (buyer /
    // seller / admin) without logging into a different account — the
    // chosen mode is stored on the session and defaults to "admin".
    let viewMode = req.session.viewMode || "admin";
    if (!isAdmin) viewMode = user.role === "seller" ? "seller" : "buyer";

    req.user = user;
    req.isAdmin = isAdmin;
    req.viewMode = viewMode;
    res.locals.user = user;
    res.locals.isAdmin = isAdmin;
    res.locals.viewMode = viewMode;
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

module.exports = { attachUser, requireAuth, requireRole, requireAdmin, ADMIN_USERNAMES, mapUser };
