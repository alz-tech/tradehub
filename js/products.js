// ════════════════════════════════════════════════════
// TRADEHUB — Products Data Layer
// ════════════════════════════════════════════════════
// No demo/seed data here — every product shown comes from real listings
// created via sell.html. The feed will be empty until real sellers list
// real items.
// ════════════════════════════════════════════════════

import {
  db, collection, doc, setDoc, getDoc, addDoc, updateDoc,
  query, where, orderBy, limit, getDocs, deleteDoc, serverTimestamp,
  runTransaction
} from "./firebase-config.js";

export const CATEGORIES = [
  { id: "fashion",   label: "Fashion",   bg: "#FFE5EC",
    icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF5C8A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4l4 4-3 3-2-2v11H9V9L7 11l-3-3 4-4 2 2h4z"/></svg>' },
  { id: "phones",    label: "Phones",    bg: "#E0F0FF",
    icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3DA9FC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/></svg>' },
  { id: "home",      label: "Home",      bg: "#FFF3E0",
    icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFA53E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' },
  { id: "sports",    label: "Sports",    bg: "#E8F7EF",
    icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1FAE6E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 000 20M2 12h20M4.5 7a14.5 14.5 0 0015 0M4.5 17a14.5 14.5 0 0115 0"/></svg>' },
  { id: "beauty",    label: "Beauty",    bg: "#F3E8FF",
    icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h6l1 5-4 3-4-3z"/><path d="M9.5 10L7 22h10l-2.5-12"/></svg>' },
  { id: "groceries", label: "Groceries", bg: "#FFF9E0",
    icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E0A800" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6"/></svg>' },
  { id: "others",    label: "Others",    bg: "#E8EDF3",
    icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5A6B80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>' }
];

// ── Fetch products for the home feed ──────────────────
// Only ever returns APPROVED products — this is the public-facing feed.
// Pending/rejected listings never show here, no matter who's logged in.
export async function getProducts({ category = null, max = 20 } = {}) {
  let q;
  if (category) {
    q = query(
      collection(db, "tradehub_products"),
      where("category", "==", category),
      where("status", "==", "approved"),
      orderBy("createdAt", "desc"),
      limit(max)
    );
  } else {
    q = query(
      collection(db, "tradehub_products"),
      where("status", "==", "approved"),
      orderBy("createdAt", "desc"),
      limit(max)
    );
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Search across ALL products, regardless of category ──
// This intentionally ignores any active category filter — search is
// platform-wide by design. Matching happens client-side after a bulk
// fetch since Firestore doesn't support full-text search natively;
// fine at this scale, but consider Algolia if the catalog grows large.
export async function searchProducts(term, maxResults = 200) {
  const q = query(
    collection(db, "tradehub_products"),
    where("status", "==", "approved"),
    orderBy("createdAt", "desc"),
    limit(maxResults)
  );
  const snap = await getDocs(q);
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const lower = term.trim().toLowerCase();
  if (!lower) return all;
  return all.filter(p =>
    p.name?.toLowerCase().includes(lower) ||
    p.description?.toLowerCase().includes(lower) ||
    p.category?.toLowerCase().includes(lower) ||
    p.sellerName?.toLowerCase().includes(lower) ||
    p.sellerLocation?.toLowerCase().includes(lower)
  );
}

export async function getMyProducts(sellerId) {
  const q = query(
    collection(db, "tradehub_products"),
    where("sellerId", "==", sellerId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function deleteProduct(productId) {
  await deleteDoc(doc(db, "tradehub_products", productId));
}

// ── Orders (buyer's purchase history) ─────────────────
export async function getMyOrders(buyerId) {
  const q = query(
    collection(db, "tradehub_orders"),
    where("buyerId", "==", buyerId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Orders received (seller's incoming sales) ─────────
// An order can contain items from multiple sellers, so this checks the
// sellerIds array set on each order at checkout time.
export async function getOrdersForSeller(sellerId) {
  const q = query(
    collection(db, "tradehub_orders"),
    where("sellerIds", "array-contains", sellerId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getProduct(id) {
  const snap = await getDoc(doc(db, "tradehub_products", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Every new listing starts as "pending" — it will NOT appear in the
// public feed (getProducts/searchProducts both filter to status ==
// "approved") until an admin approves it via admin.html.
export async function createProduct(data) {
  const ref = await addDoc(collection(db, "tradehub_products"), {
    ...data,
    status: "pending",
    createdAt: serverTimestamp(),
    rating: data.rating || 0,
    reviewCount: data.reviewCount || 0,
    sold: data.sold || 0
  });
  return ref.id;
}

// ── Admin: listing moderation ─────────────────────────
// These are only ever called from admin.html, which itself gates access
// by checking the logged-in username against an admin allowlist before
// rendering anything. Firestore security rules should ALSO restrict
// writes to the status field to admin accounts only — see the note in
// admin.html for the exact rule to add.
export async function getPendingProducts() {
  const q = query(
    collection(db, "tradehub_products"),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getAllProductsForAdmin() {
  const q = query(
    collection(db, "tradehub_products"),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function approveProduct(productId) {
  await updateDoc(doc(db, "tradehub_products", productId), { status: "approved" });
}

export async function rejectProduct(productId, reason = "") {
  await updateDoc(doc(db, "tradehub_products", productId), {
    status: "rejected",
    rejectionReason: reason
  });
}

// ── Wishlist ───────────────────────────────────────────
export async function addToWishlist(userId, productId) {
  await setDoc(doc(db, "tradehub_wishlists", `${userId}_${productId}`), {
    userId, productId, createdAt: serverTimestamp()
  });
}

export async function removeFromWishlist(userId, productId) {
  await deleteDoc(doc(db, "tradehub_wishlists", `${userId}_${productId}`));
}

export async function isInWishlist(userId, productId) {
  const snap = await getDoc(doc(db, "tradehub_wishlists", `${userId}_${productId}`));
  return snap.exists();
}

export async function getWishlist(userId) {
  const q = query(
    collection(db, "tradehub_wishlists"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  const wishlistDocs = snap.docs.map(d => d.data());
  const products = await Promise.all(
    wishlistDocs.map(w => getProduct(w.productId))
  );
  return products.filter(Boolean); // drop any deleted since wishlisting
}

// ── Order receipt confirmation (buyer-side) ───────────
// Called when a buyer taps "I've received this" on orders.html.
// Flips the order to "delivered" and bumps each item's product.sold
// count, so the "X sold" figure on product.html reflects real
// completed deliveries rather than just placed orders.
export async function markOrderReceived(orderId) {
  const orderRef = doc(db, "tradehub_orders", orderId);
  const orderSnap = await getDoc(orderRef);
  if (!orderSnap.exists()) throw new Error("Order not found.");
  const order = orderSnap.data();

  if (order.status === "delivered") return; // already marked, avoid double-counting sold

  await updateDoc(orderRef, {
    status: "delivered",
    deliveredAt: serverTimestamp()
  });

  await Promise.all((order.items || []).map(async (item) => {
    if (!item.productId) return;
    try {
      const productRef = doc(db, "tradehub_products", item.productId);
      await runTransaction(db, async (tx) => {
        const pSnap = await tx.get(productRef);
        if (!pSnap.exists()) return;
        const current = pSnap.data().sold || 0;
        tx.update(productRef, { sold: current + (item.qty || 1) });
      });
    } catch (e) {
      console.warn("Couldn't bump sold count for", item.productId, e.message);
    }
  }));
}

// ── Reviews (buyer remark + star rating on a product) ─
// A buyer can only review a product after marking the order containing
// it as received (see markOrderReceived above + orders.html UI).
export async function getProductReviews(productId) {
  const q = query(
    collection(db, "tradehub_reviews"),
    where("productId", "==", productId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Has this buyer already reviewed this product for this order?
// Prevents duplicate reviews piling up the rating average.
export async function getMyReviewForOrder(orderId, productId, buyerId) {
  const snap = await getDoc(doc(db, "tradehub_reviews", `${orderId}_${productId}_${buyerId}`));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function addReview({ orderId, productId, buyerId, buyerName, stars, remark }) {
  if (!stars || stars < 1 || stars > 5) throw new Error("Rating must be between 1 and 5 stars.");

  const reviewId = `${orderId}_${productId}_${buyerId}`;
  const reviewRef = doc(db, "tradehub_reviews", reviewId);
  const productRef = doc(db, "tradehub_products", productId);

  const existing = await getDoc(reviewRef);
  if (existing.exists()) throw new Error("You've already reviewed this item.");

  await setDoc(reviewRef, {
    orderId, productId, buyerId,
    buyerName: buyerName || "Anonymous",
    stars,
    remark: remark || "",
    createdAt: serverTimestamp()
  });

  // Recalculate the product's average rating + review count atomically,
  // so concurrent reviews on the same product can't race each other.
  await runTransaction(db, async (tx) => {
    const pSnap = await tx.get(productRef);
    if (!pSnap.exists()) return;
    const p = pSnap.data();
    const prevCount = p.reviewCount || 0;
    const prevRating = p.rating || 0;
    const newCount = prevCount + 1;
    const newRating = ((prevRating * prevCount) + stars) / newCount;
    tx.update(productRef, { rating: newRating, reviewCount: newCount });
  });
}
