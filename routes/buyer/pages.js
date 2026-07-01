// ════════════════════════════════════════════════════
// TRADEHUB — Buyer page routes (views only; data is fetched
// client-side from /api/* so the EJS templates stay simple)
// ════════════════════════════════════════════════════
const express = require("express");
const { requireAuth } = require("../../middleware/auth");

const router = express.Router();

router.get("/", (req, res) => res.render("buyer/index", { title: "Tradehub" }));
router.get("/product/:id", (req, res) => res.render("buyer/product", { title: "Tradehub", productId: req.params.id }));
router.get("/cart", (req, res) => res.render("buyer/cart", { title: "Cart · Tradehub" }));
router.get("/checkout", requireAuth, (req, res) => res.render("buyer/checkout", { title: "Checkout · Tradehub" }));
router.get("/orders", requireAuth, (req, res) => res.render("buyer/orders", { title: "Orders · Tradehub" }));
router.get("/wishlist", requireAuth, (req, res) => res.render("buyer/wishlist", { title: "Wishlist · Tradehub" }));
router.get("/profile", requireAuth, (req, res) => res.render("buyer/profile", { title: "Profile · Tradehub" }));
router.get("/profile/edit", requireAuth, (req, res) => res.render("buyer/edit-profile", { title: "Edit Profile · Tradehub" }));
router.get("/notifications", requireAuth, (req, res) => res.render("buyer/notifications", { title: "Notifications · Tradehub" }));

module.exports = router;
