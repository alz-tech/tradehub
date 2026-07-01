// ════════════════════════════════════════════════════
// TRADEHUB — Notifications API
// ════════════════════════════════════════════════════
const express = require("express");
const pool = require("../../db/pool");
const { requireAuth } = require("../../middleware/auth");

const router = express.Router();

function mapNotif(r) {
  return {
    id: r.id, userId: r.user_id, type: r.type, title: r.title, body: r.body,
    orderId: r.order_id, productId: r.product_id, read: r.read, createdAt: r.created_at
  };
}

router.get("/", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC",
    [req.user.username]
  );
  res.json({ notifications: rows.map(mapNotif) });
});

router.get("/unread-count", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read = false",
    [req.user.username]
  );
  res.json({ count: rows[0].count });
});

router.post("/:id/read", requireAuth, async (req, res) => {
  await pool.query("UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2", [req.params.id, req.user.username]);
  res.json({ success: true });
});

router.post("/read-all", requireAuth, async (req, res) => {
  await pool.query("UPDATE notifications SET read = true WHERE user_id = $1 AND read = false", [req.user.username]);
  res.json({ success: true });
});

module.exports = router;
