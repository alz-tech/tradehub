// ════════════════════════════════════════════════════
// TRADEHUB — Auth Logic (Username + Password)
// ════════════════════════════════════════════════════
// Same shape as before — sign up with a username and password, no
// email/OTP — but now the password never touches the browser-side
// "hash and store" path at all. It's sent over HTTPS to the server and
// hashed there with bcrypt (salted, slow-by-design). The session is a
// real server-side session (httpOnly cookie), not a localStorage flag,
// so it can't be forged by editing localStorage in devtools.
// ════════════════════════════════════════════════════

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

export async function isUsernameTaken(username) {
  const res = await fetch(`/api/auth/check-username/${encodeURIComponent(username.trim().toLowerCase())}`);
  const data = await res.json();
  return data.taken;
}

export async function createUser(username, password, displayName, phone, role, avatarColor) {
  const data = await api("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ username, password, name: displayName, phone, role, avatarColor })
  });
  return data.user;
}

export async function login(username, password) {
  const data = await api("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
  return data.user;
}

export async function logout() {
  await api("/auth/logout", { method: "POST" });
}

export async function getCurrentUser() {
  const data = await api("/auth/me");
  return data.user;
}

export async function getSessionInfo() {
  return api("/auth/me");
}

// Kept for compatibility with pages that just want a quick truthy check
// without an extra request — does a lightweight session lookup.
export async function getSession() {
  const user = await getCurrentUser();
  return user ? user.username : null;
}

export async function updateUser(updates) {
  await api("/auth/me", { method: "PATCH", body: JSON.stringify(updates) });
}

export async function getAllSellers() {
  const data = await api("/subscriptions/sellers");
  return data.sellers;
}

export async function setViewMode(mode) {
  return api("/auth/view-mode", { method: "POST", body: JSON.stringify({ mode }) });
}
