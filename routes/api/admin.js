// ════════════════════════════════════════════════════
// TRADEHUB — Admin API (product moderation, orders, settings)
// ════════════════════════════════════════════════════
const express = require("express");
const pool = require("../../db/pool");
const { requireAdmin, requireAdminTab } = require("../../middleware/auth");
const { mapProduct } = require("./products");
const { mapOrder } = require("./orders");

const router = express.Router();
router.use(requireAdmin);

router.get("/products/pending", requireAdminTab("products"), async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM products WHERE status = 'pending' ORDER BY created_at DESC");
  res.json({ products: rows.map(mapProduct) });
});

router.get("/products", requireAdminTab("products"), async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM products ORDER BY created_at DESC");
  res.json({ products: rows.map(mapProduct) });
});

router.post("/products/:id/approve", requireAdminTab("products"), async (req, res) => {
  await pool.query("UPDATE products SET status = 'approved' WHERE id = $1", [req.params.id]);
  res.json({ success: true });
});

router.post("/products/:id/reject", requireAdminTab("products"), async (req, res) => {
  await pool.query("UPDATE products SET status = 'rejected', rejection_reason = $1 WHERE id = $2", [req.body?.reason || "", req.params.id]);
  res.json({ success: true });
});

router.delete("/products/:id", requireAdminTab("products"), async (req, res) => {
  await pool.query("DELETE FROM products WHERE id = $1", [req.params.id]);
  res.json({ success: true });
});

// ── Every order platform-wide (not scoped to one buyer/seller) ──
router.get("/orders", requireAdminTab("orders"), async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM orders ORDER BY created_at DESC");
  res.json({ orders: rows.map(mapOrder) });
});

// ── Site settings: demo/seed data cleanup ──────────────
// Deliberately separate from the /products routes above so this tool
// doesn't require Products-tab access — an admin scoped to only the
// Settings tab can run it without being able to see or moderate the
// live product-approval queue.
const DEMO_SELLER_NAME = "Cfirbigets";

router.get("/settings/demo-products", requireAdminTab("settings"), async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM products WHERE seller_name = $1 ORDER BY created_at DESC", [DEMO_SELLER_NAME]);
  res.json({ products: rows.map(mapProduct) });
});

router.post("/settings/demo-products/cleanup", requireAdminTab("settings"), async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM products WHERE seller_name = $1", [DEMO_SELLER_NAME]);
  res.json({ success: true, deleted: rowCount });
});

module.exports = router;
