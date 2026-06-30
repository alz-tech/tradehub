// ════════════════════════════════════════════════════
// TRADEHUB — Seller Subscriptions (₦1,500/month)
// ════════════════════════════════════════════════════
// Every seller/both account gets a 14-day free trial automatically on
// signup (see auth.js createUser). After the trial ends, they need an
// active paid subscription to keep using sell.html / my-listings.html.
//
// Money actually changes hands through Paystack (see subscribe.html),
// but the *verification* that a payment really succeeded happens
// server-side in Cloud Functions (functions/index.js) — never trust a
// "successful" payment client-side alone, since that's trivially
// fakeable by anyone with devtools open. This module only reads/writes
// the resulting status; it never marks a subscription "active" off the
// back of an unverified frontend payment callback.
// ════════════════════════════════════════════════════

import {
  db, doc, getDoc, setDoc, updateDoc, serverTimestamp
} from "./firebase-config.js";

export const MONTHLY_PRICE_KOBO = 150000; // ₦1,500 in kobo (Paystack uses kobo)
export const MONTHLY_PRICE_NAIRA = 1500;

// ── Read a seller's current subscription doc ──────────
export async function getSubscription(username) {
  const snap = await getDoc(doc(db, "tradehub_subscriptions", username));
  return snap.exists() ? snap.data() : null;
}

// ── Compute current access state from the raw doc ─────
// Returns one of: "trial" | "active" | "expired" | "none"
// "none" = no subscription doc at all (e.g. pure buyer account, or an
// older account created before this feature existed).
export function getAccessState(sub) {
  if (!sub) return "none";
  const now = Date.now();

  if (sub.status === "trial") {
    return sub.trialEnd && now < sub.trialEnd ? "trial" : "expired";
  }
  if (sub.status === "active") {
    return sub.currentPeriodEnd && now < sub.currentPeriodEnd ? "active" : "expired";
  }
  return "expired";
}

// Convenience: true if this seller can currently list/manage products.
export async function canSell(username) {
  const sub = await getSubscription(username);
  const state = getAccessState(sub);
  return state === "trial" || state === "active";
}

// ── Admin: start or restart a 14-day trial for a seller ─
// Used from admin.html's Subscriptions tab. Overwrites any existing
// trial dates; does not touch a currently-active PAID subscription
// unless the admin explicitly chose to (caller's responsibility to
// confirm with the admin before calling this on an active payer).
export async function adminStartTrial(username, days = 14) {
  const now = Date.now();
  await setDoc(doc(db, "tradehub_subscriptions", username), {
    username,
    status: "trial",
    trialStart: now,
    trialEnd: now + days * 24 * 60 * 60 * 1000,
    currentPeriodEnd: null,
    lastPaymentRef: null,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

// ── Admin: manually grant/extend a paid period ─────────
// For edge cases — bank transfer instead of Paystack, comp'd accounts,
// goodwill extensions, etc. Normal paid flow goes through Paystack +
// the verifyPayment Cloud Function instead (see subscribe.html).
export async function adminGrantPaidDays(username, days = 30) {
  const subRef = doc(db, "tradehub_subscriptions", username);
  const snap = await getDoc(subRef);
  const now = Date.now();
  const base = snap.exists() && snap.data().currentPeriodEnd > now
    ? snap.data().currentPeriodEnd
    : now;

  await setDoc(subRef, {
    username,
    status: "active",
    currentPeriodEnd: base + days * 24 * 60 * 60 * 1000,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

// ── Admin: end a trial/subscription early ──────────────
export async function adminEndAccess(username) {
  await updateDoc(doc(db, "tradehub_subscriptions", username), {
    status: "expired",
    updatedAt: serverTimestamp()
  });
}
