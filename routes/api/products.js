// ════════════════════════════════════════════════════
// TRADEHUB — Products API
// ════════════════════════════════════════════════════
const express = require("express");
const pool = require("../../db/pool");
const { requireAuth, requireRole } = require("../../middleware/auth");
const { getAccessState } = require("./subscriptions");

const router = express.Router();

function mapProduct(r) {
  const images = Array.isArray(r.images) ? r.images : [];
  return {
    id: r.id,
    sellerId: r.seller_id,
    sellerName: r.seller_name,
    sellerPhone: r.seller_phone,
    sellerLocation: r.seller_location,
    name: r.name,
    description: r.description,
    category: r.category,
    price: Number(r.price),
    oldPrice: r.old_price ? Number(r.old_price) : null,
    images,
    imageUrl: images[0] || null, // convenience field — every page only ever rendered the first photo
    status: r.status,
    rejectionReason: r.rejection_reason,
    rating: Number(r.rating),
    reviewCount: r.review_count,
    sold: r.sold,
    createdAt: r.created_at
  };
}

// ── Public feed — approved products only ──────────────
router.get("/", async (req, res) => {
  const { category, max } = req.query;
  const limit = Math.min(parseInt(max, 10) || 20, 100);
  const params = ["approved"];
  let where = "status = $1";
  if (category) {
    params.push(category);
    where += ` AND category = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT * FROM products WHERE ${where} ORDER BY created_at DESC LIMIT ${limit}`,
    params
  );
  res.json({ products: rows.map(mapProduct) });
});

// ── Search (platform-wide, ignores category filter) ───
router.get("/search", async (req, res) => {
  const term = `%${(req.query.q || "").trim().toLowerCase()}%`;
  const { rows } = await pool.query(
    `SELECT * FROM products
     WHERE status = 'approved' AND (
       lower(name) LIKE $1 OR lower(description) LIKE $1 OR
       lower(category) LIKE $1 OR lower(seller_name) LIKE $1 OR lower(seller_location) LIKE $1
     )
     ORDER BY created_at DESC LIMIT 200`,
    [term]
  );
  res.json({ products: rows.map(mapProduct) });
});

// ── My listings (seller) ──────────────────────────────
router.get("/mine", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM products WHERE seller_id = $1 ORDER BY created_at DESC",
    [req.user.username]
  );
  res.json({ products: rows.map(mapProduct) });
});

// ── Single product ─────────────────────────────────────
router.get("/:id", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM products WHERE id = $1", [req.params.id]);
  if (!rows.length) return res.status(404).json({ success: false, error: "Product not found." });
  res.json({ product: mapProduct(rows[0]) });
});

// ── Create listing — starts "pending" until admin approves ──
router.post("/", requireRole("seller"), async (req, res) => {
  try {
    // Admins bypass this (same convention requireRole already uses:
    // admin implies full buyer+seller access). Everyone else needs an
    // active trial, paid, or lifetime subscription — the client
    // already gates /sell on this (see sell.ejs's subscription-gate),
    // this is the real enforcement behind it.
    if (!req.isAdmin) {
      const { rows } = await pool.query("SELECT * FROM subscriptions WHERE username = $1", [req.user.username]);
      const state = getAccessState(rows[0] ? {
        status: rows[0].status, trialEnd: Number(rows[0].trial_end) || null,
        currentPeriodEnd: Number(rows[0].current_period_end) || null, isLifetime: !!rows[0].is_lifetime
      } : null);
      if (state !== "trial" && state !== "active") {
        return res.status(403).json({ success: false, error: "Your seller subscription isn't active. Subscribe to list items on Tradehub." });
      }
    }

    const { name, description, category, price, oldPrice, images, sellerLocation } = req.body || {};
    if (!name || !category || !price) {
      return res.status(400).json({ success: false, error: "Name, category, and price are required." });
    }
    const { rows } = await pool.query(
      `INSERT INTO products (seller_id, seller_name, seller_phone, seller_location, name, description, category, price, old_price, images)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        req.user.username, req.user.name, req.user.phone || null, sellerLocation || null,
        name, description || "", category, price, oldPrice || null,
        JSON.stringify(images || [])
      ]
    );
    res.json({ success: true, product: mapProduct(rows[0]) });
  } catch (err) {
    console.error("create product error:", err);
    res.status(500).json({ success: false, error: "Could not create listing." });
  }
});

// ── Delete a listing (owner or admin only) ─────────────
router.delete("/:id", requireAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT seller_id FROM products WHERE id = $1", [req.params.id]);
  if (!rows.length) return res.status(404).json({ success: false, error: "Product not found." });
  if (rows[0].seller_id !== req.user.username && !req.isAdmin) {
    return res.status(403).json({ success: false, error: "Not your listing." });
  }
  await pool.query("DELETE FROM products WHERE id = $1", [req.params.id]);
  res.json({ success: true });
});

// ── Reviews ─────────────────────────────────────────────
router.get("/:id/reviews", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM reviews WHERE product_id = $1 ORDER BY created_at DESC",
    [req.params.id]
  );
  res.json({ reviews: rows });
});

router.get("/:id/reviews/mine/:orderId", requireAuth, async (req, res) => {
  const reviewId = `${req.params.orderId}_${req.params.id}_${req.user.username}`;
  const { rows } = await pool.query("SELECT * FROM reviews WHERE id = $1", [reviewId]);
  res.json({ review: rows[0] || null });
});

router.post("/:id/reviews", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { orderId, stars, remark } = req.body || {};
    const productId = req.params.id;
    if (!stars || stars < 1 || stars > 5) {
      return res.status(400).json({ success: false, error: "Rating must be between 1 and 5 stars." });
    }
    const reviewId = `${orderId}_${productId}_${req.user.username}`;

    await client.query("BEGIN");
    const existing = await client.query("SELECT 1 FROM reviews WHERE id = $1", [reviewId]);
    if (existing.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, error: "You've already reviewed this item." });
    }

    await client.query(
      `INSERT INTO reviews (id, order_id, product_id, buyer_id, buyer_name, stars, remark)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [reviewId, orderId, productId, req.user.username, req.user.name, stars, remark || ""]
    );

    // Recalculate the running average atomically.
    const prod = await client.query("SELECT rating, review_count FROM products WHERE id = $1 FOR UPDATE", [productId]);
    const prevRating = Number(prod.rows[0]?.rating || 0);
    const prevCount = prod.rows[0]?.review_count || 0;
    const newCount = prevCount + 1;
    const newRating = ((prevRating * prevCount) + stars) / newCount;
    await client.query("UPDATE products SET rating = $1, review_count = $2 WHERE id = $3", [newRating, newCount, productId]);

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("add review error:", err);
    res.status(500).json({ success: false, error: "Could not submit review." });
  } finally {
    client.release();
  }
});

module.exports = { router, mapProduct };
