// ════════════════════════════════════════════════════
// TRADEHUB — Admin: users list
// Lets an admin (with the "users" tab granted) view every account and
// delete a non-admin account. Accounts with is_protected = TRUE are
// invincible here: every mutating route below checks it and refuses,
// regardless of who is asking — including the owner. This check
// happens server-side only; the client (views/admin/admin.ejs) also
// disables the buttons for a protected row, but that's just UI
// polish, not the real gate.
//
// Promoting/demoting an admin, and editing what tabs an admin can
// access, are owner-only actions (requireOwner) — a regular admin,
// even one with the "users" tab, can't grant admin status or expand
// their own or anyone else's permissions. See middleware/auth.js.
// ════════════════════════════════════════════════════
const express = require("express");
const pool = require("../../db/pool");
const { requireAdmin, requireOwner, requireAdminTab, mapUser } = require("../../middleware/auth");
const { mapProduct } = require("./products");

const router = express.Router();
router.use(requireAdmin);

const VALID_TABS = ["users", "products", "subscription", "settings", "orders"];

router.get("/", requireAdminTab("users"), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT username, name, phone, role, avatar_color, avatar_url, rating, total_sales, is_admin, is_protected, is_owner, admin_tabs, created_at
     FROM users ORDER BY created_at DESC`
  );
  res.json({ users: rows.map(mapUser) });
});

router.post("/:username/promote", requireOwner, async (req, res) => {
  // New admins start with zero tabs granted — the owner grants access
  // explicitly via the permissions route right after, rather than a
  // freshly-promoted admin silently inheriting full access.
  const { rows } = await pool.query(
    "UPDATE users SET is_admin = TRUE WHERE username = $1 RETURNING username",
    [req.params.username]
  );
  if (!rows.length) return res.status(404).json({ success: false, error: "User not found." });
  res.json({ success: true });
});

router.post("/:username/demote", requireOwner, async (req, res) => {
  if (req.params.username === req.user.username) {
    return res.status(400).json({ success: false, error: "You can't remove admin access from your own account." });
  }
  const { rows } = await pool.query("SELECT is_protected FROM users WHERE username = $1", [req.params.username]);
  if (!rows.length) return res.status(404).json({ success: false, error: "User not found." });
  if (rows[0].is_protected) {
    return res.status(403).json({ success: false, error: "This account is protected and can't be demoted." });
  }
  await pool.query(
    "UPDATE users SET is_admin = FALSE, is_owner = FALSE, admin_tabs = '{}' WHERE username = $1",
    [req.params.username]
  );
  res.json({ success: true });
});

// ── Owner: set which tabs a given admin can access ────
router.patch("/:username/permissions", requireOwner, async (req, res) => {
  const tabs = Array.isArray(req.body?.adminTabs) ? req.body.adminTabs.filter(t => VALID_TABS.includes(t)) : [];
  const { rows } = await pool.query("SELECT is_admin, is_owner FROM users WHERE username = $1", [req.params.username]);
  if (!rows.length) return res.status(404).json({ success: false, error: "User not found." });
  if (!rows[0].is_admin) return res.status(400).json({ success: false, error: "This account isn't an admin." });
  if (rows[0].is_owner) return res.status(400).json({ success: false, error: "The owner already has full access." });
  await pool.query("UPDATE users SET admin_tabs = $1 WHERE username = $2", [tabs, req.params.username]);
  res.json({ success: true, adminTabs: tabs });
});

// ── Any admin with the "users" tab: change a user's marketplace role
// (buyer/seller/both). Deliberately NOT owner-gated — this doesn't
// touch admin standing, just which parts of the marketplace someone
// can use. is_protected still blocks it entirely (covers the owner
// automatically, same as every other action in this file). ──
router.patch("/:username/role", requireAdminTab("users"), async (req, res) => {
  const { role } = req.body || {};
  if (!["buyer", "seller", "both"].includes(role)) {
    return res.status(400).json({ success: false, error: "Invalid role." });
  }
  if (req.params.username === req.user.username) {
    return res.status(400).json({ success: false, error: "Use Edit Profile to change your own role." });
  }
  const { rows } = await pool.query("SELECT is_protected FROM users WHERE username = $1", [req.params.username]);
  if (!rows.length) return res.status(404).json({ success: false, error: "User not found." });
  if (rows[0].is_protected) {
    return res.status(403).json({ success: false, error: "This account is protected and can't be changed." });
  }
  await pool.query("UPDATE users SET role = $1 WHERE username = $2", [role, req.params.username]);
  res.json({ success: true });
});

// ── Any admin with the "users" tab: a user's full product list, for
// the "view details" panel. Every status (pending/approved/rejected)
// since this is an internal lookup, not the public buyer-facing feed. ──
router.get("/:username/products", requireAdminTab("users"), async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM products WHERE seller_id = $1 ORDER BY created_at DESC", [req.params.username]);
  res.json({ products: rows.map(mapProduct) });
});

router.delete("/:username", requireAdminTab("users"), async (req, res) => {
  if (req.params.username === req.user.username) {
    return res.status(400).json({ success: false, error: "You can't delete your own account from here." });
  }
  const { rows } = await pool.query("SELECT is_protected, is_admin FROM users WHERE username = $1", [req.params.username]);
  if (!rows.length) return res.status(404).json({ success: false, error: "User not found." });
  if (rows[0].is_protected) {
    return res.status(403).json({ success: false, error: "This account is protected and can't be deleted." });
  }
  // A non-owner admin with only the "users" tab shouldn't be able to
  // delete another admin's account out from under the owner — deleting
  // an admin is at least as sensitive as demoting one, which is
  // already owner-only.
  if (rows[0].is_admin && !req.user.isOwner) {
    return res.status(403).json({ success: false, error: "Only the site owner can delete an admin account." });
  }
  await pool.query("DELETE FROM users WHERE username = $1", [req.params.username]);
  res.json({ success: true });
});

module.exports = router;
