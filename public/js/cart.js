// ════════════════════════════════════════════════════
// TRADEHUB — Cart Logic (shared across product.html, cart.html, index.html)
// ════════════════════════════════════════════════════
// Cart is stored client-side in localStorage. Checkout re-verifies
// prices/availability server-side (see POST /api/orders) so nothing
// here needs to be trusted for the actual charge — this file only
// drives the cart UI before that point. If you want cross-device cart
// persistence later, move this to a `cart_items` Postgres table keyed
// by username; the function signatures here are written so that swap
// stays contained to this one file.
// ════════════════════════════════════════════════════

const CART_KEY = "tradehub_cart";

export function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

export function addToCart(item, qty = 1) {
  const cart = getCart();
  const existing = cart.find(i => i.productId === item.productId);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({ ...item, qty });
  }
  saveCart(cart);
  return cart;
}

export function updateQty(productId, qty) {
  const cart = getCart();
  const item = cart.find(i => i.productId === productId);
  if (!item) return cart;
  if (qty <= 0) {
    return removeFromCart(productId);
  }
  item.qty = qty;
  saveCart(cart);
  return cart;
}

export function removeFromCart(productId) {
  const cart = getCart().filter(i => i.productId !== productId);
  saveCart(cart);
  return cart;
}

export function clearCart() {
  saveCart([]);
}

export function getCartCount() {
  return getCart().reduce((sum, i) => sum + i.qty, 0);
}

export function getCartSubtotal() {
  return getCart().reduce((sum, i) => sum + i.price * i.qty, 0);
}

// Flat delivery fee for now — replace with a real distance/weight-based
// calculation once you have delivery logistics worked out.
export const DELIVERY_FEE = 1500;

export function getCartTotal() {
  const subtotal = getCartSubtotal();
  return subtotal > 0 ? subtotal + DELIVERY_FEE : 0;
}
