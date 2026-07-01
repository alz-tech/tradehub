// ════════════════════════════════════════════════════
// TRADEHUB — Server entry point
// Node.js + Express + EJS + PostgreSQL
// ════════════════════════════════════════════════════
require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);

const pool = require("./db/pool");
const { runMigration } = require("./db/migrate");
const { seedAdmins } = require("./db/seed-admins");
const { attachUser } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("trust proxy", 1); // Render sits behind a proxy; needed for secure cookies

// ── Paystack webhook needs the raw body for signature verification,
// so it must be mounted BEFORE the global JSON body parser. ──
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
  store: new pgSession({ pool, tableName: "session", createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || "dev_only_insecure_secret_change_me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

app.use(attachUser);

// ── API routes ──────────────────────────────────────────
app.use("/api/auth", require("./routes/api/auth"));
app.use("/api/products", require("./routes/api/products").router);
app.use("/api/orders", require("./routes/api/orders"));
app.use("/api/wishlist", require("./routes/api/wishlist"));
app.use("/api/notifications", require("./routes/api/notifications"));
app.use("/api/subscriptions", require("./routes/api/subscriptions").router);
app.use("/api/payments", require("./routes/api/payments"));
app.use("/api/admin", require("./routes/api/admin"));
app.use("/api/users", require("./routes/api/users"));

// ── Page (view) routes — organized by audience ──────────
app.use(require("./routes/auth-page"));
app.use(require("./routes/buyer/pages"));
app.use(require("./routes/seller/pages"));
app.use(require("./routes/admin/pages"));

// ── 404 ──────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ success: false, error: "Not found." });
  res.status(404).send("Page not found.");
});

// ── Error handler ────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith("/api/")) return res.status(500).json({ success: false, error: "Server error." });
  res.status(500).send("Something went wrong.");
});

// ── Schema + admin seeding ───────────────────────────────
// Runs before the server starts accepting traffic, so the very first
// request — cart, account, signup, anything — hits a database that
// already has its tables. Every statement in schema.sql is
// CREATE ... IF NOT EXISTS, so this is safe to run on every boot,
// including against a database that's already fully migrated.
async function bootstrap() {
  try {
    await runMigration(pool);
    console.log("Database schema is up to date.");
    await seedAdmins(pool);
  } catch (err) {
    // If this fails (e.g. bad DATABASE_URL, Neon still waking up from
    // idle), log loudly but still start the server — attachUser and
    // the rest of the app already handle a missing/unreachable DB per
    // request without crashing the process, so a transient failure
    // here shouldn't make the whole app unreachable.
    console.error("Startup schema check failed — the app will still start, but requests that touch the database may fail until this is resolved:", err.message);
  }

  app.listen(PORT, () => {
    console.log(`Tradehub running on port ${PORT} (${isProd ? "production" : "development"})`);
  });
}

bootstrap();
