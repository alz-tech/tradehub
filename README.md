# Tradehub

A buyer/seller marketplace — Node.js, Express, EJS, and PostgreSQL. This
is a rewrite of the original Firebase/Firestore version: same design,
same features, same visual layout — different stack underneath.

## Stack

- **Server:** Node.js + Express
- **Views:** EJS (server-rendered, same HTML/CSS as the original)
- **Database:** PostgreSQL
- **Sessions:** `express-session` + `connect-pg-simple` (stored in Postgres, not localStorage)
- **Auth:** bcryptjs (salted password hashing, no native compiler needed — works on Render and on Termux)
- **Image hosting:** Cloudinary (unsigned upload preset)
- **Payments:** Paystack (subscription billing for sellers)

## Folder structure

```
routes/
  api/            → JSON endpoints (auth, products, orders, wishlist, notifications, subscriptions, payments, admin)
  buyer/          → buyer-facing page routes
  seller/         → seller-facing page routes (gated by requireRole("seller"))
  admin/          → admin-facing page routes (gated by requireAdmin)
views/
  buyer/          → buyer EJS templates
  seller/         → seller EJS templates
  admin/          → admin EJS template
  auth/           → sign-in / sign-up template
  partials/       → shared partials (e.g. the admin view-switcher pill)
middleware/auth.js → session lookup, role gating, admin check, snake_case→camelCase user mapping
db/               → schema.sql, connection pool, migration runner
public/           → static CSS/JS served as-is (same look as the original)
```

Admins are regular users with `is_admin = true` (or a username listed in
`ADMIN_USERNAMES`). They get every buyer + seller feature and can switch
between Buyer / Seller / Admin views with the floating pill at the
bottom of the screen — no separate login needed.

## Local setup

**1. Install dependencies**
```bash
npm install
```

**2. Create a Postgres database** (local, or a free one from Render/Neon/Supabase for testing)

**3. Copy the environment template and fill it in**
```bash
cp .env.example .env
```
Open `.env` and set at minimum: `DATABASE_URL`, `SESSION_SECRET`,
`ADMIN_USERNAMES`. Cloudinary and Paystack keys are needed for photo
uploads and subscription payments to work, but the app will still run
without them (those specific features will just show a clear error
until configured).

**4. Run the schema migration**
```bash
npm run migrate
```
This creates every table if it doesn't already exist. Safe to re-run —
it won't drop or duplicate anything.

**5. Start the server**
```bash
npm run dev     # auto-restarts on file changes
# or
npm start        # plain node
```
Visit `http://localhost:3000`.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `DATABASE_SSL` | No | Set to `false` for a local Postgres without SSL. Defaults to SSL on. |
| `SESSION_SECRET` | Yes | Long random string signing session cookies. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ADMIN_USERNAMES` | Yes | Comma-separated usernames granted admin access |
| `CLOUDINARY_CLOUD_NAME` | For photo uploads | From your Cloudinary dashboard |
| `CLOUDINARY_UPLOAD_PRESET` | For photo uploads | An **unsigned** upload preset |
| `PAYSTACK_SECRET_KEY` | For subscriptions | Server-side only, never sent to the browser |
| `PAYSTACK_PUBLIC_KEY` | For subscriptions | Safe to expose client-side, but still comes from env so nothing's hardcoded |
| `PORT` | No | Defaults to 3000; Render sets this for you |
| `NODE_ENV` | No | `production` enables secure cookies; Render sets this for you |

None of these are committed — `.env` is gitignored. `.env.example` is
the template that should be committed instead.

## Deploying to Render

1. Push this repo to GitHub/GitLab.
2. On Render: **New → Web Service**, connect the repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add a **PostgreSQL** instance (Render → New → PostgreSQL). Copy its
   **Internal Database URL** into this service's `DATABASE_URL` env var
   (internal URL is faster and free when both services are on Render).
6. Add the rest of the environment variables from the table above under
   the service's **Environment** tab.
7. Add `npm run migrate` as a **Pre-Deploy Command** (Render → your
   service → Settings → Pre-Deploy Command) so the schema is created/
   updated automatically on every deploy.
8. In your **Paystack dashboard**, set the webhook URL to:
   `https://your-service.onrender.com/api/payments/webhook`
   (This is the backup path that activates a subscription even if the
   buyer closes the tab right after paying.)
9. In your **Cloudinary dashboard**, create an unsigned upload preset
   and put its name in `CLOUDINARY_UPLOAD_PRESET`.

## Security notes for a real-money launch

- **Sessions are server-side** (Postgres-backed via `connect-pg-simple`), not a
  localStorage flag — a user can't forge login by editing browser storage.
- **Passwords are bcrypt-hashed server-side**, never touching the
  network or client as plaintext beyond the initial HTTPS request.
- **Admin access is enforced server-side** (`requireAdmin` middleware on
  every admin route and API endpoint) — the old client-only allowlist
  is gone.
- **Payments are verified server-side** against Paystack's API using the
  secret key; the browser reporting "success" is never trusted alone.
  A webhook (`/api/payments/webhook`, signature-checked) is the backup
  path if the buyer closes the tab before the client-side verify call finishes.
- **Checkout re-verifies prices server-side** against the database at
  order time — a tampered client can't alter what gets charged.
- Still worth doing before scaling further: rate-limiting on
  `/api/auth/login` (brute-force protection), a Terms of Service /
  Privacy Policy / refund policy page, and moving off a shared hosting
  tier if you expect sustained traffic.

## What stayed identical to the original

- All page layouts, CSS, colors, spacing, and copy
- All feature flows (browse, list, cart, checkout, wishlist, orders,
  reviews, seller subscriptions, admin moderation)
- Category icons and general visual design

## What changed under the hood

- Firebase/Firestore → PostgreSQL
- Firebase Cloud Functions → Express API routes (`routes/api/`)
- Client-trusted localStorage session → server-side session
- Client-side admin allowlist → server-enforced `requireAdmin`
- Emoji icons → inline SVG icons throughout
- Flat file structure → buyer/seller/admin folder separation
- Hardcoded Paystack key & Cloudinary config → environment variables
