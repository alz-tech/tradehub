// ════════════════════════════════════════════════════
// TRADEHUB — Seller page routes
// ════════════════════════════════════════════════════
const express = require("express");
const { requireRole } = require("../../middleware/auth");

const router = express.Router();

router.use(requireRole("seller"));

router.get("/sell", (req, res) => res.render("seller/sell", {
  title: "Sell · Tradehub",
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
  cloudinaryUploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || ""
}));
router.get("/my-listings", (req, res) => res.render("seller/my-listings", { title: "My Listings · Tradehub" }));
router.get("/sales", (req, res) => res.render("seller/sales", { title: "Sales · Tradehub" }));
router.get("/subscribe", (req, res) => res.render("seller/subscribe", { title: "Subscription · Tradehub" }));

module.exports = router;
