// ════════════════════════════════════════════════════
// TRADEHUB — Cloud Functions (Paystack subscription billing)
// ════════════════════════════════════════════════════
// Why this needs to exist at all: the rest of Tradehub runs entirely in
// the browser with no backend. That's fine for products/orders, but it
// is NOT safe for payments — anyone with devtools open could otherwise
// fake a "successful payment" callback and grant themselves a free
// subscription. These two functions are the only place that decides a
// payment really happened, by calling Paystack's API with the SECRET
// key (which lives only here, never in any .html/.js file the browser
// loads).
//
// ── Deploy steps ───────────────────────────────────────
// 1. Install the Firebase CLI if you don't have it:
//      npm install -g firebase-tools
// 2. From the tradehub/ project root:
//      firebase login
//      firebase init functions   (choose "use an existing project" → tradehub3,
//                                  choose JavaScript, decline ESLint if you want,
//                                  then when it asks to overwrite files,
//                                  say NO — keep this functions/ folder as-is)
// 3. Set your Paystack SECRET key as a function config value (NEVER
//    commit it to a file, NEVER put it in any frontend code):
//      firebase functions:config:set paystack.secret_key="sk_live_xxxxxxxx"
//    (use sk_test_xxxx while testing)
// 4. Deploy:
//      firebase deploy --only functions
// 5. Copy the printed verifyPayment URL into subscribe.html's
//    VERIFY_PAYMENT_URL constant, and the paystackWebhook URL into your
//    Paystack dashboard under Settings → API Keys & Webhooks → Webhook URL.
// ════════════════════════════════════════════════════

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();
const db = admin.firestore();

const MONTHLY_PRICE_KOBO = 150000; // ₦1,500 — must match subscriptions.js
const DAY_MS = 24 * 60 * 60 * 1000;

function getSecretKey() {
  const key = functions.config().paystack?.secret_key;
  if (!key) {
    throw new Error("Paystack secret key not configured. Run: firebase functions:config:set paystack.secret_key=\"sk_...\"");
  }
  return key;
}

// Shared CORS handling so subscribe.html (running on whatever domain you
// host Tradehub on) can call this function directly from the browser.
function applyCors(req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }
  return false;
}

// Activates (or extends) a seller's paid subscription. Idempotent per
// Paystack reference — calling this twice with the same reference
// (e.g. once from the frontend callback, once from the webhook) will
// not double-grant days, since we record lastPaymentRef and check it.
async function activateSubscription(username, reference) {
  const subRef = db.collection("tradehub_subscriptions").doc(username);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(subRef);
    const data = snap.exists ? snap.data() : null;

    if (data && data.lastPaymentRef === reference) {
      // Already processed this exact payment (frontend callback + webhook
      // both landed) — don't grant days twice for one payment.
      return;
    }

    const now = Date.now();
    const base = data && data.currentPeriodEnd && data.currentPeriodEnd > now
      ? data.currentPeriodEnd
      : now;

    tx.set(subRef, {
      username,
      status: "active",
      currentPeriodEnd: base + 30 * DAY_MS,
      lastPaymentRef: reference,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
}

// ── verifyPayment ──────────────────────────────────────
// Called directly by subscribe.html right after the Paystack popup
// reports success. Confirms with Paystack's servers that the named
// reference is real, paid, and for the right amount before granting
// any access.
exports.verifyPayment = functions.https.onRequest(async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ success: false, error: "Method not allowed." });
    return;
  }

  const { reference, username } = req.body || {};
  if (!reference || !username) {
    res.status(400).json({ success: false, error: "Missing reference or username." });
    return;
  }

  try {
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${getSecretKey()}` }
    });
    const verifyData = await verifyRes.json();

    if (!verifyData.status || verifyData.data?.status !== "success") {
      res.status(402).json({ success: false, error: "Payment was not successful." });
      return;
    }
    if (verifyData.data.amount < MONTHLY_PRICE_KOBO) {
      res.status(402).json({ success: false, error: "Amount paid does not match the subscription price." });
      return;
    }
    // Cross-check the username embedded at checkout time matches who's
    // asking — stops someone reusing a stranger's reference for their own account.
    const metaUsername = verifyData.data.metadata?.username;
    if (metaUsername && metaUsername !== username) {
      res.status(403).json({ success: false, error: "This payment reference does not belong to this account." });
      return;
    }

    await activateSubscription(username, reference);
    res.json({ success: true });
  } catch (e) {
    console.error("verifyPayment error:", e);
    res.status(500).json({ success: false, error: "Verification failed. Please try again or contact support." });
  }
});

// ── paystackWebhook ────────────────────────────────────
// Backup path: if the buyer closes the tab/loses connection right after
// paying (before the frontend's verifyPayment call completes), this
// webhook — called directly by Paystack's servers — still activates
// the subscription. Configure this URL in your Paystack dashboard.
exports.paystackWebhook = functions.https.onRequest(async (req, res) => {
  try {
    // Paystack signs every webhook with your secret key so you can trust
    // it's really from them and not a forged request hitting this URL.
    const crypto = require("crypto");
    const signature = req.headers["x-paystack-signature"];
    const expected = crypto
      .createHmac("sha512", getSecretKey())
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (signature !== expected) {
      console.warn("paystackWebhook: signature mismatch, ignoring request.");
      res.status(401).send("Invalid signature");
      return;
    }

    const event = req.body;
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
