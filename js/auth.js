// ════════════════════════════════════════════════════
// TRADEHUB — Auth Logic (Username + Password)
// ════════════════════════════════════════════════════
// No email, no OTP, no third-party email service required. Sign up with
// a username and password; password is hashed (SHA-256, client-side)
// before it's stored — the raw password is never written to Firestore.
//
// Note for context: this is lightweight protection appropriate for an
// app at this stage, not bank-grade auth. There's no rate-limiting on
// login attempts and everything runs client-side. If Tradehub grows
// into something handling real money/sensitive data at scale, migrating
// to real Firebase Authentication (with server-side rules) would be the
// right next step.
// ════════════════════════════════════════════════════

import {
  db, collection, doc, setDoc, getDoc, updateDoc,
  query, where, getDocs, serverTimestamp
} from "./firebase-config.js";

const SESSION_KEY = "tradehub_session";

// ── Helpers ──────────────────────────────────────────
function normalizeUsername(username) {
  return username.trim().toLowerCase();
}

function isValidUsername(username) {
  // letters, numbers, underscore, dot — 3 to 30 chars
  return /^[a-z0-9_.]{3,30}$/.test(username);
}

// SHA-256 hash via the browser's built-in Web Crypto API.
async function hashPassword(password) {
  const enc  = new TextEncoder().encode(password);
  const buf  = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Check username availability ───────────────────────
export async function isUsernameTaken(username) {
  username = normalizeUsername(username);
  const snap = await getDoc(doc(db, "tradehub_users", username));
  return snap.exists();
}

// ── Create account ────────────────────────────────────
// role: "buyer" | "seller" | "both"
// The username itself is used as the Firestore document ID, which also
// guarantees usernames are unique (a second signup with the same name
// would overwrite the doc — checked against in handleSignup before this
// runs, but createUser also re-checks as a safety net).
export async function createUser(username, password, displayName, phone, role, avatarColor) {
  username = normalizeUsername(username);
  if (!isValidUsername(username)) {
    throw new Error("Username must be 3-30 characters: letters, numbers, _ or . only.");
  }
  if (!password || password.length < 4) {
    throw new Error("Password must be at least 4 characters.");
  }

  const ref = doc(db, "tradehub_users", username);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    throw new Error("That username is already taken.");
  }

  const passwordHash = await hashPassword(password);
  const data = {
    username,
    passwordHash,
    name: displayName || username,
    phone: phone || null,
    role: role || "buyer",
    avatarColor: avatarColor || "#3DA9FC",
    avatarUrl: null,
    rating: 0,
    totalSales: 0,
    createdAt: new Date().toISOString()
  };

  await setDoc(ref, data);

  // Sellers (and "both") get an automatic 14-day free trial of seller
  // access, starting now. Pure buyers don't need one — they're never
  // gated by the subscription check in sell.html. Admins can override
  // this later from admin.html (extend, end early, or activate paid).
  if (data.role === "seller" || data.role === "both") {
    const now = Date.now();
    await setDoc(doc(db, "tradehub_subscriptions", username), {
      username,
      status: "trial",
      trialStart: now,
      trialEnd: now + 14 * 24 * 60 * 60 * 1000,
      currentPeriodEnd: null,
      lastPaymentRef: null,
      createdAt: serverTimestamp()
    });
  }

  const { passwordHash: _omit, ...publicData } = data;
  return { id: username, ...publicData };
}

// ── Log in ─────────────────────────────────────────────
// Throws on bad username or wrong password. Returns the user's public
// data (no passwordHash) on success.
export async function login(username, password) {
  username = normalizeUsername(username);
  const ref  = doc(db, "tradehub_users", username);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error("No account found with that username.");
  }

  const data = snap.data();
  const inputHash = await hashPassword(password);
  if (inputHash !== data.passwordHash) {
    throw new Error("Incorrect password.");
  }

  const { passwordHash: _omit, ...publicData } = data;
  return { id: username, ...publicData };
}

// ── User profile helpers ──────────────────────────────
export async function getUserById(username) {
  username = normalizeUsername(username);
  const snap = await getDoc(doc(db, "tradehub_users", username));
  if (!snap.exists()) return null;
  const { passwordHash: _omit, ...publicData } = snap.data();
  return { id: username, ...publicData };
}

export async function updateUser(username, updates) {
  username = normalizeUsername(username);
  // Never allow passwordHash to be overwritten through this generic
  // updater — password changes should go through a dedicated flow
  // (not built yet) that re-hashes properly.
  const { passwordHash, username: _u, ...safeUpdates } = updates;
  await updateDoc(doc(db, "tradehub_users", username), safeUpdates);
}

// ── Admin: list every seller/both account ─────────────
// Used by admin.html's Subscriptions tab. Pure "buyer" accounts are
// excluded since they're never subject to the seller subscription gate.
export async function getAllSellers() {
  const q = query(collection(db, "tradehub_users"), where("role", "in", ["seller", "both"]));
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const { passwordHash: _omit, ...publicData } = d.data();
    return { id: d.id, ...publicData };
  });
}

// ── Session ───────────────────────────────────────────
export function saveSession(username) {
  localStorage.setItem(SESSION_KEY, normalizeUsername(username));
}

export function getSession() {
  return localStorage.getItem(SESSION_KEY);
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export async function getCurrentUser() {
  const username = getSession();
  if (!username) return null;
  return getUserById(username);
}
