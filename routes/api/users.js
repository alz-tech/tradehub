// ════════════════════════════════════════════════════
// TRADEHUB — Admin: users list
// Lets an admin view every account and toggle admin status or delete
// an account. Accounts with is_protected = TRUE are invincible here:
// every mutating route below checks it and refuses, regardless of who
// is asking — including another admin. This check happens server-side
// only; the client (views/admin/admin.ejs) also disables the buttons
// for a protected row, but that's just UI polish, not the real gate.
// ════════════════════════════════════════════════════
const express = require("express");
const pool = require("../../db/pool");
const { requireAdmin, mapUser } = require("../../middleware/auth");

const router = express.Router();
router.use(requireAdmin);

router.get("/", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT username, name, phone, role, avatar_color, avatar_url, rating, total_sales, is_admin, is_protected, created_at
     FROM users ORDER BY created_at DESC`
  );
  res.json({ users: rows.map(mapUser) });
});

router.post("/:username/promote", async (req, res) => {
  const { rows } = await pool.query(
    "UPDATE users SET is_admin = TRUE WHERE username = $1 RETURNING username",
    [req.params.username]
  );
  if (!rows.length) return res.status(404).json({ success: false, error: "User not found." });
  res.json({ success: true });
});

router.post("/:username/demote", async (req, res) => {
  if (req.params.username === req.user.username) {
    return res.status(400).json({ success: false, error: "You can't remove admin access from your own account." });
  }
  const { rows } = await pool.query("SELECT is_protected FROM users WHERE username = $1", [req.params.username]);
  if (!rows.length) return res.status(404).json({ success: false, error: "User not found." });
  if (rows[0].is_protected) {
    return res.status(403).json({ success: false, error: "This account is protected and can't be demoted." });
  }
  await pool.query("UPDATE users SET is_admin = FALSE WHERE username = $1", [req.params.username]);
  res.json({ success: true });
});

router.delete("/:username", async (req, res) => {
  if (req.params.username === req.user.username) {
    return res.status(400).json({ success: false, error: "You can't delete your own account from here." });
  }
  const { rows } = await pool.query("SELECT is_protected FROM users WHERE username = $1", [req.params.username]);
  if (!rows.length) return res.status(404).json({ success: false, error: "User not found." });
  if (rows[0].is_protected) {
    return res.status(403).json({ success: false, error: "This account is protected and can't be deleted." });
  }
  await pool.query("DELETE FROM users WHERE username = $1", [req.params.username]);
  res.json({ success: true });
});

module.exports = router;
