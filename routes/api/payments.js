// ════════════════════════════════════════════════════
// TRADEHUB — Payments API (Paystack subscription billing)
// ════════════════════════════════════════════════════
// Same trust model as the original Cloud Functions: the browser never
// decides a payment succeeded. Both routes below call Paystack's API
// (or validate Paystack's signature) using PAYSTACK_SECRET_KEY, which
// only ever lives in this server's environment variables.
// ════════════════════════════════════════════════════
const express = require("express");
const crypto = require("crypto");
const fetch = require("node-fetch");
const pool = require("../../db/pool");
const { requireAuth } = require("../../middleware/auth");
const { MONTHLY_PRICE_KOBO } = require("./subscriptions");

const router = express.Router();
const DAY_MS = 24 * 60 * 60 * 1000;

function getSecretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set.");
  return key;
}

// Idempotent per Paystack reference — calling this twice for the same
// reference (frontend callback + webhook both landing) won't double-grant days.
async function activateSubscription(username, reference) {
  const { rows } = await pool.query("SELECT * FROM subscriptions WHERE username = $1", [username]);
  const existing = rows[0];
  if (existing && existing.last_payment_ref === reference) return; // already processed

  const now = Date.now();
  const base = existing && Number(existing.current_period_end) > now ? Number(existing.current_period_end) : now;
  const newEnd = base + 30 * DAY_MS;

  await pool.query(
    `INSERT INTO subscriptions (username, status, current_period_end, last_payment_ref)
     VALUES ($1,'active',$2,$3)
     ON CONFLICT (username) DO UPDATE SET status='active', current_period_end=$2, last_payment_ref=$3, updated_at=now()`,
    [username, newEnd, reference]
  );
}

// ── Called by subscribe.ejs right after the Paystack popup reports success ──
router.post("/verify", requireAuth, async (req, res) => {
  try {
    const { reference } = req.body || {};
    const username = req.user.username;
    if (!reference) return res.status(400).json({ success: false, error: "Missing payment reference." });

    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${getSecretKey()}` }
    });
    const verifyData = await verifyRes.json();

    if (!verifyData.status || verifyData.data?.status !== "success") {
      return res.status(402).json({ success: false, error: "Payment was not successful." });
    }
    if (verifyData.data.amount < MONTHLY_PRICE_KOBO) {
      return res.status(402).json({ success: false, error: "Amount paid does not match the subscription price." });
    }
    const metaUsername = verifyData.data.metadata?.username;
    if (metaUsername && metaUsername !== username) {
      return res.status(403).json({ success: false, error: "This payment reference does not belong to this account." });
    }

    await activateSubscription(username, reference);
    res.json({ success: true });
  } catch (e) {
    console.error("verifyPayment error:", e);
    res.status(500).json({ success: false, error: "Verification failed. Please try again or contact support." });
  }
});

// ── Backup path: Paystack calls this directly if the buyer closes the tab ──
// IMPORTANT: this route needs the *raw* request body to check the
// signature, so it's mounted with express.raw() in server.js, not the
// global express.json() parser.
router.post("/webhook", async (req, res) => {
  try {
    const signature = req.headers["x-paystack-signature"];
    const rawBody = req.body; // Buffer, thanks to express.raw()
    const expected = crypto.createHmac("sha512", getSecretKey()).update(rawBody).digest("hex");

    if (signature !== expected) {
      console.warn("paystackWebhook: signature mismatch, ignoring request.");
      return res.status(401).send("Invalid signature");
    }

    const event = JSON.parse(rawBody.toString("utf8"));
    if (event.event === "charge.success") {
      const { reference, amount, metadata } = event.data;
      const username = metadata?.username;
      if (username && amount >= MONTHLY_PRICE_KOBO) {
        await activateSubscription(username, reference);
      }
    }
    res.status(200).send("ok");
  } catch (e) {
    console.error("paystackWebhook error:", e);
    res.status(500).send("error");
  }
});

module.exports = router;
