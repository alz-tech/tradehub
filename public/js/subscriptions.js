// ════════════════════════════════════════════════════
// TRADEHUB — Seller Subscriptions (₦1,500/month, fetch-based)
// ════════════════════════════════════════════════════
async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: options.body ? { "Content-Type": "application/json" } : {},
    credentials: "same-origin",
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

export let MONTHLY_PRICE_KOBO = 150000;
export let MONTHLY_PRICE_NAIRA = 1500;
export let PAYSTACK_PUBLIC_KEY = "";

export async function loadConstants() {
  const data = await api("/subscriptions/constants");
  MONTHLY_PRICE_KOBO = data.MONTHLY_PRICE_KOBO;
  MONTHLY_PRICE_NAIRA = data.MONTHLY_PRICE_NAIRA;
  PAYSTACK_PUBLIC_KEY = data.paystackPublicKey;
  return data;
}

export async function getSubscription() {
  const data = await api("/subscriptions/me");
  return data.subscription;
}

export function getAccessState(sub) {
  if (!sub) return "none";
  if (sub.isLifetime) return "active"; // never expires — skip the date check entirely
  const now = Date.now();
  if (sub.status === "trial") return sub.trialEnd && now < sub.trialEnd ? "trial" : "expired";
  if (sub.status === "active") return sub.currentPeriodEnd && now < sub.currentPeriodEnd ? "active" : "expired";
  return "expired";
}

export async function canSell() {
  const sub = await getSubscription();
  const state = getAccessState(sub);
  return state === "trial" || state === "active";
}

export async function verifyPayment(reference) {
  return api("/payments/verify", { method: "POST", body: JSON.stringify({ reference }) });
}

// ── Admin actions ──────────────────────────────────────
export async function adminStartTrial(username, days = 14) {
  await api(`/subscriptions/admin/${username}/trial`, { method: "POST", body: JSON.stringify({ days }) });
}

export async function adminGrantPaidDays(username, days = 30) {
  await api(`/subscriptions/admin/${username}/grant`, { method: "POST", body: JSON.stringify({ days }) });
}

export async function adminEndAccess(username) {
  await api(`/subscriptions/admin/${username}/end`, { method: "POST" });
}

// ── Owner-only: permanent, non-expiring access ────────
export async function adminGrantLifetime(username) {
  await api(`/subscriptions/admin/${username}/lifetime`, { method: "POST" });
}
