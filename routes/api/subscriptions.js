// ════════════════════════════════════════════════════
// TRADEHUB — Seller Subscriptions API (₦1,500/month)
// ════════════════════════════════════════════════════
const express = require("express");
const pool = require("../../db/pool");
const { requireAuth, requireAdmin, requireOwner, requireAdminTab, mapUser } = require("../../middleware/auth");

const router = express.Router();

const MONTHLY_PRICE_KOBO = 150000; // ₦1,500 in kobo
const MONTHLY_PRICE_NAIRA = 1500;
const DAY_MS = 24 * 60 * 60 * 1000;

function mapSub(r) {
  if (!r) return null;
  return {
    username: r.username, status: r.status,
    trialStart: r.trial_start ? Number(r.trial_start) : null,
    trialEnd: r.trial_end ? Number(r.trial_end) : null,
    currentPeriodEnd: r.current_period_end ? Number(r.current_period_end) : null,
    lastPaymentRef: r.last_payment_ref,
    isLifetime: !!r.is_lifetime
  };
}

// "trial" | "active" | "expired" | "none"
function getAccessState(sub) {
  if (!sub) return "none";
  if (sub.isLifetime) return "active"; // never expires — skip the date check entirely
  const now = Date.now();
  if (sub.status === "trial") return sub.trialEnd && now < sub.trialEnd ? "trial" : "expired";
  if (sub.status === "active") return sub.currentPeriodEnd && now < sub.currentPeriodEnd ? "active" : "expired";
  return "expired";
}

router.get("/constants", (req, res) => {
  res.json({ MONTHLY_PRICE_KOBO, MONTHLY_PRICE_NAIRA, paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || "" });
});

router.get("/me", requireAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM subscriptions WHERE username = $1", [req.user.username]);
  const sub = mapSub(rows[0]);
  res.json({ subscription: sub, accessState: getAccessState(sub) });
});

// ── Admin actions ──────────────────────────────────────
router.get("/sellers", requireAdmin, requireAdminTab("subscription"), async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM users WHERE role IN ('seller','both') ORDER BY username"
  );
  const { rows: subs } = await pool.query("SELECT * FROM subscriptions");
  const subByUser = Object.fromEntries(subs.map(s => [s.username, mapSub(s)]));
  res.json({
    sellers: rows.map(u => ({
      ...mapUser(u), subscription: subByUser[u.username] || null,
      accessState: getAccessState(subByUser[u.username] || null)
    }))
  });
});

router.post("/admin/:username/trial", requireAdmin, requireAdminTab("subscription"), async (req, res) => {
  const days = parseInt(req.body?.days, 10) || 14;
  const now = Date.now();
  await pool.query(
    `INSERT INTO subscriptions (username, status, trial_start, trial_end, current_period_end, last_payment_ref, is_lifetime)
     VALUES ($1,'trial',$2,$3,NULL,NULL,FALSE)
     ON CONFLICT (username) DO UPDATE SET status='trial', trial_start=$2, trial_end=$3, is_lifetime=FALSE, updated_at=now()`,
    [req.params.username, now, now + days * DAY_MS]
  );
  res.json({ success: true });
});

router.post("/admin/:username/grant", requireAdmin, requireAdminTab("subscription"), async (req, res) => {
  const days = parseInt(req.body?.days, 10) || 30;
  const now = Date.now();
  const { rows } = await pool.query("SELECT current_period_end FROM subscriptions WHERE username = $1", [req.params.username]);
  const base = rows.length && Number(rows[0].current_period_end) > now ? Number(rows[0].current_period_end) : now;
  await pool.query(
    `INSERT INTO subscriptions (username, status, current_period_end, is_lifetime)
     VALUES ($1,'active',$2,FALSE)
     ON CONFLICT (username) DO UPDATE SET status='active', current_period_end=$2, is_lifetime=FALSE, updated_at=now()`,
    [req.params.username, base + days * DAY_MS]
  );
  res.json({ success: true });
});

router.post("/admin/:username/end", requireAdmin, requireAdminTab("subscription"), async (req, res) => {
  await pool.query("UPDATE subscriptions SET status='expired', is_lifetime=FALSE, updated_at=now() WHERE username = $1", [req.params.username]);
  res.json({ success: true });
});

// ── Owner-only: permanent, non-expiring access. Separate from the
// subscription-tab grant routes above (which any admin with that tab
// can use) because a lifetime grant has no natural end an admin could
// later walk back — only the owner hands this out. ──
router.post("/admin/:username/lifetime", requireAdmin, requireOwner, async (req, res) => {
  await pool.query(
    `INSERT INTO subscriptions (username, status, is_lifetime)
     VALUES ($1,'active',TRUE)
     ON CONFLICT (username) DO UPDATE SET status='active', is_lifetime=TRUE, updated_at=now()`,
    [req.params.username]
  );
  res.json({ success: true });
});

module.exports = { router, getAccessState, MONTHLY_PRICE_KOBO, MONTHLY_PRICE_NAIRA };
