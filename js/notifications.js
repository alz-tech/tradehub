// ════════════════════════════════════════════════════
// TRADEHUB — Notifications Data Layer
// ════════════════════════════════════════════════════
// Used to alert sellers when a buyer places an order containing their
// item(s). Written at checkout time (see checkout.html), read here.
// ════════════════════════════════════════════════════

import {
  db, collection, doc, addDoc, getDoc, updateDoc,
  query, where, orderBy, getDocs, serverTimestamp
} from "./firebase-config.js";

export async function createNotification({ userId, type, title, body, orderId = null, productId = null }) {
  await addDoc(collection(db, "tradehub_notifications"), {
    userId, type, title, body,
    orderId, productId,
    read: false,
    createdAt: serverTimestamp()
  });
}

export async function getNotifications(userId) {
  const q = query(
    collection(db, "tradehub_notifications"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getUnreadNotificationCount(userId) {
  const all = await getNotifications(userId);
  return all.filter(n => !n.read).length;
}

export async function markNotificationRead(notificationId) {
  await updateDoc(doc(db, "tradehub_notifications", notificationId), { read: true });
}

export async function markAllNotificationsRead(userId) {
  const all = await getNotifications(userId);
  await Promise.all(
    all.filter(n => !n.read).map(n => markNotificationRead(n.id))
  );
}
