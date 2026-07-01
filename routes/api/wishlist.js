// ════════════════════════════════════════════════════
// TRADEHUB — Wishlist API
// ════════════════════════════════════════════════════
const express = require("express");
const pool = require("../../db/pool");
const { requireAuth } = require("../../middleware/auth");
const { mapProduct } = require("./products");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.* FROM wishlists w JOIN products p ON p.id = w.product_id
     WHERE w.user_id = $1 ORDER BY w.created_at DESC`,
    [req.user.username]
  );
  res.json({ products: rows.map(mapProduct) });
});

router.get("/:productId", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT 1 FROM wishlists WHERE user_id = $1 AND product_id = $2",
    [req.user.username, req.params.productId]
  );
  res.json({ inWishlist: rows.length > 0 });
});

router.post("/:productId", requireAuth, async (req, res) => {
  await pool.query(
    `INSERT INTO wishlists (user_id, product_id) VALUES ($1,$2)
     ON CONFLICT (user_id, product_id) DO NOTHING`,
    [req.user.username, req.params.productId]
  );
  res.json({ success: true });
});

router.delete("/:productId", requireAuth, async (req, res) => {
  await pool.query(
    "DELETE FROM wishlists WHERE user_id = $1 AND product_id = $2",
    [req.user.username, req.params.productId]
  );
  res.json({ success: true });
});

module.exports = router;
