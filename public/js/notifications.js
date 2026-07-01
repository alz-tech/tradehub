// ════════════════════════════════════════════════════
// TRADEHUB — Notifications Data Layer (fetch-based)
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

export async function getNotifications() {
  const data = await api("/notifications");
  return data.notifications;
}

export async function getUnreadNotificationCount() {
  const data = await api("/notifications/unread-count");
  return data.count;
}

export async function markNotificationRead(notificationId) {
  await api(`/notifications/${notificationId}/read`, { method: "POST" });
}

export async function markAllNotificationsRead() {
  await api("/notifications/read-all", { method: "POST" });
}
