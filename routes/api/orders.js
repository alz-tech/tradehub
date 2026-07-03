// ════════════════════════════════════════════════════
// TRADEHUB — Orders API
// ════════════════════════════════════════════════════
const express = require("express");
const pool = require("../../db/pool");
const { requireAuth } = require("../../middleware/auth");

const router = express.Router();

function mapOrder(r) {
  return {
    id: r.id,
    buyerId: r.buyer_id,
    buyerName: r.buyer_name,
    buyerPhone: r.buyer_phone,
    sellerIds: r.seller_ids,
    items: r.items,
    subtotal: Number(r.subtotal),
    deliveryFee: Number(r.delivery_fee),
    total: Number(r.total),
    status: r.status,
    remark: r.remark,
    deliveryAddress: r.delivery_address,
    createdAt: r.created_at,
    deliveredAt: r.delivered_at
  };
}

// ── Buyer's purchase history ───────────────────────────
router.get("/mine", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM orders WHERE buyer_id = $1 ORDER BY created_at DESC",
    [req.user.username]
  );
  res.json({ orders: rows.map(mapOrder) });
});

// ── Seller's incoming sales ────────────────────────────
router.get("/seller", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM orders WHERE $1 = ANY(seller_ids) ORDER BY created_at DESC",
    [req.user.username]
  );
  res.json({ orders: rows.map(mapOrder) });
});

// ── Checkout — places an order from the cart ──────────
// Cart items are sent from the client (cart lives in localStorage), but
// price/availability are re-verified server-side against the products
// table so nobody can tamper with totals via devtools.
router.post("/", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { items, buyerName, buyerPhone, deliveryAddress, remark } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ success: false, error: "Your cart is empty." });
    }

    await client.query("BEGIN");

    const ids = items.map(i => i.productId);
    const { rows: products } = await client.query(
      `SELECT id, price, seller_id, name, images FROM products WHERE id = ANY($1) AND status = 'approved'`,
      [ids]
    );
    const byId = Object.fromEntries(products.map(p => [String(p.id), p]));

    let subtotal = 0;
    const verifiedItems = [];
    const sellerIds = new Set();
    for (const item of items) {
      const p = byId[String(item.productId)];
      if (!p) continue; // skip anything no longer listed
      const qty = Math.max(1, parseInt(item.qty, 10) || 1);
      subtotal += Number(p.price) * qty;
      sellerIds.add(p.seller_id);
      verifiedItems.push({
        productId: p.id, name: p.name, price: Number(p.price), qty,
        image: Array.isArray(p.images) ? p.images[0] : null, sellerId: p.seller_id
      });
    }
    if (!verifiedItems.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, error: "None of these items are available anymore." });
    }

    const DELIVERY_FEE = 1500;
    const total = subtotal + DELIVERY_FEE;

    const { rows } = await client.query(
      `INSERT INTO orders (buyer_id, buyer_name, buyer_phone, seller_ids, items, subtotal, delivery_fee, total, delivery_address, remark)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        req.user.username, buyerName || req.user.name, buyerPhone || req.user.phone, [...sellerIds], JSON.stringify(verifiedItems),
        subtotal, DELIVERY_FEE, total, deliveryAddress || "",
        remark || null
      ]
    );
    const order = rows[0];

    // Notify each seller involved in this order — only with the items
    // that are actually theirs (a single checkout can span multiple
    // sellers), plus enough context that they can prep/deliver the
    // order without needing to open it first.
    for (const sellerId of sellerIds) {
      const theirItems = verifiedItems.filter(i => i.sellerId === sellerId);
      const itemSummary = theirItems.map(i => `${i.name} (×${i.qty})`).join(", ");
      const body = `${order.buyer_name} just ordered: ${itemSummary}. `
        + `Buyer phone: ${order.buyer_phone || "—"}. `
        + `Delivery address: ${deliveryAddress || "—"}.`
        + (remark ? ` Remark: ${remark}` : "");
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, order_id)
         VALUES ($1,'order','New order received', $2, $3)`,
        [sellerId, body, order.id]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true, order: mapOrder(order) });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("checkout error:", err);
    res.status(500).json({ success: false, error: "Checkout failed. Please try again." });
  } finally {
    client.release();
  }
});

// ── Buyer confirms receipt — bumps each item's sold count ─
router.post("/:id/receive", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM orders WHERE id = $1 AND buyer_id = $2 FOR UPDATE", [req.params.id, req.user.username]);
    if (!rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "Order not found." });
    }
    const order = rows[0];
    if (order.status === "delivered") {
      await client.query("ROLLBACK");
      return res.json({ success: true }); // already marked, avoid double-counting
    }

    await client.query("UPDATE orders SET status = 'delivered', delivered_at = now() WHERE id = $1", [order.id]);

    for (const item of order.items || []) {
      await client.query("UPDATE products SET sold = sold + $1 WHERE id = $2", [item.qty || 1, item.productId]);
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("mark received error:", err);
    res.status(500).json({ success: false, error: "Could not update order." });
  } finally {
    client.release();
  }
});

module.exports = { router, mapOrder };
