// ════════════════════════════════════════════════════
// TRADEHUB — Admin page routes
// ════════════════════════════════════════════════════
const express = require("express");
const { requireAdmin } = require("../../middleware/auth");

const router = express.Router();

router.get("/admin", requireAdmin, (req, res) => res.render("admin/admin", { title: "Admin · Tradehub" }));

module.exports = router;
