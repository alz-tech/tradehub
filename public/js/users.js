// ════════════════════════════════════════════════════
// TRADEHUB — Admin: users list (fetch-based)
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

export async function getAllUsers() {
  const data = await api("/users");
  return data.users;
}

export async function promoteUser(username) {
  await api(`/users/${username}/promote`, { method: "POST" });
}

export async function demoteUser(username) {
  await api(`/users/${username}/demote`, { method: "POST" });
}

export async function deleteUser(username) {
  await api(`/users/${username}`, { method: "DELETE" });
}

// ── Owner-only: set which admin tabs a given admin can access ──
export async function setAdminPermissions(username, adminTabs) {
  await api(`/users/${username}/permissions`, { method: "PATCH", body: JSON.stringify({ adminTabs }) });
}
