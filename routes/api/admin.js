// ════════════════════════════════════════════════════
// TRADEHUB — Admin API (product moderation)
// ════════════════════════════════════════════════════
const express = require("express");
const pool = require("../../db/pool");
const { requireAdmin } = require("../../middleware/auth");
const { mapProduct } = require("./products");
const { mapOrder } = require("./orders");

const router = express.Router();
router.use(requireAdmin);

router.get("/products/pending", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM products WHERE status = 'pending' ORDER BY created_at DESC");
  res.json({ products: rows.map(mapProduct) });
});

router.get("/products", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM products ORDER BY created_at DESC");
  res.json({ products: rows.map(mapProduct) });
});

router.post("/products/:id/approve", async (req, res) => {
  await pool.query("UPDATE products SET status = 'approved' WHERE id = $1", [req.params.id]);
  res.json({ success: true });
});

router.post("/products/:id/reject", async (req, res) => {
  await pool.query("UPDATE products SET status = 'rejected', rejection_reason = $1 WHERE id = $2", [req.body?.reason || "", req.params.id]);
  res.json({ success: true });
});

router.delete("/products/:id", async (req, res) => {
  await pool.query("DELETE FROM products WHERE id = $1", [req.params.id]);
  res.json({ success: true });
});

// ── Every order platform-wide (not scoped to one buyer/seller) ──
router.get("/orders", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM orders ORDER BY created_at DESC");
  res.json({ orders: rows.map(mapOrder) });
});

module.exports = router;
