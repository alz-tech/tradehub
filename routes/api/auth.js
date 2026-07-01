// ════════════════════════════════════════════════════
// TRADEHUB — Auth API
// ════════════════════════════════════════════════════
// Username + password auth, same flow as the original app, but properly
// hashed server-side (bcryptjs, salted, never touches the browser) and
// backed by real server-side sessions instead of a localStorage flag.
// ════════════════════════════════════════════════════
const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../../db/pool");
const { ADMIN_USERNAMES, mapUser } = require("../../middleware/auth");
const { DESIGNATED_ADMINS } = require("../../db/seed-admins");

// Looks up a username against the designated-admins list (db/seed-admins.js)
// so a fresh signup is granted admin (and protected, if flagged)
// immediately — without needing to wait for the next server restart.
function designatedAdmin(username) {
  return DESIGNATED_ADMINS.find(a => a.username === username) || null;
}

const router = express.Router();

function normalizeUsername(u) {
  return String(u || "").trim().toLowerCase();
}
function isValidUsername(u) {
  return /^[a-z0-9_.]{3,30}$/.test(u);
}

// ── Sign up ────────────────────────────────────────────
router.post("/signup", async (req, res) => {
  const client = await pool.connect();
  try {
    let { username, password, name, phone, role, avatarColor } = req.body || {};
    username = normalizeUsername(username);

    if (!isValidUsername(username)) {
      return res.status(400).json({ success: false, error: "Username must be 3-30 characters: letters, numbers, _ or . only." });
    }
    if (!password || password.length < 4) {
      return res.status(400).json({ success: false, error: "Password must be at least 4 characters." });
    }
    role = ["buyer", "seller", "both"].includes(role) ? role : "buyer";

    await client.query("BEGIN");

    const existing = await client.query("SELECT 1 FROM users WHERE username = $1", [username]);
    if (existing.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, error: "That username is already taken." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const designated = designatedAdmin(username);
    const isAdmin = ADMIN_USERNAMES.includes(username) || !!designated;
    const isProtected = !!designated?.protected;
    const { rows } = await client.query(
      `INSERT INTO users (username, password_hash, name, phone, role, avatar_color, is_admin, is_protected)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [username, passwordHash, name || username, phone || null, role, avatarColor || "#3DA9FC", isAdmin, isProtected]
    );

    // Sellers (and "both") get an automatic 14-day free trial, same as before.
    if (role === "seller" || role === "both") {
      const now = Date.now();
      await client.query(
        `INSERT INTO subscriptions (username, status, trial_start, trial_end)
         VALUES ($1, 'trial', $2, $3)`,
        [username, now, now + 14 * 24 * 60 * 60 * 1000]
      );
    }

    await client.query("COMMIT");
    req.session.username = username;
    res.json({ success: true, user: mapUser(rows[0]) });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("signup error:", err);
    res.status(500).json({ success: false, error: "Could not create account. Please try again." });
  } finally {
    client.release();
  }
});

// ── Username availability check ───────────────────────
router.get("/check-username/:username", async (req, res) => {
  const username = normalizeUsername(req.params.username);
  const { rows } = await pool.query("SELECT 1 FROM users WHERE username = $1", [username]);
  res.json({ taken: rows.length > 0 });
});

// ── Log in ─────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const username = normalizeUsername(req.body?.username);
    const { password } = req.body || {};
    const { rows } = await pool.query("SELECT * FROM users WHERE username = $1", [username]);

    if (!rows.length) {
      return res.status(401).json({ success: false, error: "No account found with that username." });
    }
    const ok = await bcrypt.compare(password || "", rows[0].password_hash);
    if (!ok) {
      return res.status(401).json({ success: false, error: "Incorrect password." });
    }

    req.session.username = username;
    res.json({ success: true, user: mapUser(rows[0]) });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ success: false, error: "Login failed. Please try again." });
  }
});

// ── Log out ────────────────────────────────────────────
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

// ── Current session ────────────────────────────────────
router.get("/me", async (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: req.user, isAdmin: req.isAdmin });
});

// ── Update profile ─────────────────────────────────────
router.patch("/me", async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Not logged in." });
  if (req.body.role !== undefined && !["buyer", "seller", "both"].includes(req.body.role)) {
    return res.status(400).json({ success: false, error: "Invalid role." });
  }
  const allowed = ["name", "phone", "avatar_color", "avatar_url", "role"];
  const fields = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    const bodyKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); // avatar_color -> avatarColor
    if (req.body[bodyKey] !== undefined) {
      fields.push(`${key} = $${i++}`);
      values.push(req.body[bodyKey]);
    }
  }
  if (!fields.length) return res.json({ success: true });
  values.push(req.user.username);
  try {
    await pool.query(`UPDATE users SET ${fields.join(", ")} WHERE username = $${i}`, values);
    res.json({ success: true });
  } catch (err) {
    console.error("update profile error:", err);
    res.status(500).json({ success: false, error: "Could not update profile." });
  }
});

module.exports = router;
