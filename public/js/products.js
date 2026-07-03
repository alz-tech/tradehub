// ════════════════════════════════════════════════════
// TRADEHUB — Products Data Layer (fetch-based)
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

// Same icon set as before — plain inline SVG strings, no emoji glyphs.
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

export async function getProducts({ category = null, max = 20 } = {}) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (max) params.set("max", max);
  const data = await api(`/products?${params.toString()}`);
  return data.products;
}

export async function searchProducts(term) {
  const data = await api(`/products/search?q=${encodeURIComponent(term || "")}`);
  return data.products;
}

export async function getMyProducts() {
  const data = await api("/products/mine");
  return data.products;
}

export async function deleteProduct(productId) {
  await api(`/products/${productId}`, { method: "DELETE" });
}

export async function getMyOrders() {
  const data = await api("/orders/mine");
  return data.orders;
}

export async function getOrdersForSeller() {
  const data = await api("/orders/seller");
  return data.orders;
}

export async function getProduct(id) {
  try {
    const data = await api(`/products/${id}`);
    return data.product;
  } catch {
    return null;
  }
}

export async function createProduct(data) {
  const result = await api("/products", { method: "POST", body: JSON.stringify(data) });
  return result.product.id;
}

// ── Admin: listing moderation ─────────────────────────
export async function getPendingProducts() {
  const data = await api("/admin/products/pending");
  return data.products;
}

export async function getAllProductsForAdmin() {
  const data = await api("/admin/products");
  return data.products;
}

// ── Admin: every order platform-wide ──────────────────
export async function getAllOrdersForAdmin() {
  const data = await api("/admin/orders");
  return data.orders;
}

// ── Admin: site settings — demo/seed data cleanup ─────
export async function findDemoProducts() {
  const data = await api("/admin/settings/demo-products");
  return data.products;
}

export async function cleanupDemoProducts() {
  const data = await api("/admin/settings/demo-products/cleanup", { method: "POST" });
  return data.deleted;
}

export async function approveProduct(productId) {
  await api(`/admin/products/${productId}/approve`, { method: "POST" });
}

export async function rejectProduct(productId, reason = "") {
  await api(`/admin/products/${productId}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
}

// ── Wishlist ───────────────────────────────────────────
export async function addToWishlist(userId, productId) {
  await api(`/wishlist/${productId}`, { method: "POST" });
}

export async function removeFromWishlist(userId, productId) {
  await api(`/wishlist/${productId}`, { method: "DELETE" });
}

export async function isInWishlist(userId, productId) {
  const data = await api(`/wishlist/${productId}`);
  return data.inWishlist;
}

export async function getWishlist() {
  const data = await api("/wishlist");
  return data.products;
}

// ── Order receipt confirmation (buyer-side) ───────────
export async function markOrderReceived(orderId) {
  await api(`/orders/${orderId}/receive`, { method: "POST" });
}

// ── Reviews ─────────────────────────────────────────────
export async function getProductReviews(productId) {
  const data = await api(`/products/${productId}/reviews`);
  return data.reviews;
}

export async function getMyReviewForOrder(orderId, productId) {
  const data = await api(`/products/${productId}/reviews/mine/${orderId}`);
  return data.review;
}

export async function addReview({ orderId, productId, stars, remark }) {
  await api(`/products/${productId}/reviews`, { method: "POST", body: JSON.stringify({ orderId, stars, remark }) });
}

// ── Checkout ─────────────────────────────────────────────
export async function placeOrder({ items, buyerName, buyerPhone, deliveryAddress, remark }) {
  const data = await api("/orders", { method: "POST", body: JSON.stringify({ items, buyerName, buyerPhone, deliveryAddress, remark }) });
  return data.order;
}
