-- ════════════════════════════════════════════════════
-- TRADEHUB — PostgreSQL Schema
-- ════════════════════════════════════════════════════
-- Run once against your Render Postgres database, e.g.:
--   psql "$DATABASE_URL" -f db/schema.sql
-- ════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  username        TEXT PRIMARY KEY,
  password_hash   TEXT NOT NULL,
  name            TEXT NOT NULL,
  phone           TEXT,
  role            TEXT NOT NULL DEFAULT 'buyer' CHECK (role IN ('buyer', 'seller', 'both')),
  avatar_color    TEXT DEFAULT '#3DA9FC',
  avatar_url      TEXT,
  rating          NUMERIC DEFAULT 0,
  total_sales     INTEGER DEFAULT 0,
  is_admin        BOOLEAN NOT NULL DEFAULT FALSE,
  is_protected    BOOLEAN NOT NULL DEFAULT FALSE, -- "invincible": can't be demoted, disabled, or deleted via the admin users list
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  username            TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'expired')),
  trial_start         BIGINT,
  trial_end           BIGINT,
  current_period_end  BIGINT,
  last_payment_ref    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id                SERIAL PRIMARY KEY,
  seller_id         TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  seller_name       TEXT NOT NULL,
  seller_phone      TEXT,
  seller_location   TEXT,
  name              TEXT NOT NULL,
  description       TEXT,
  category          TEXT NOT NULL,
  price             NUMERIC NOT NULL,
  old_price         NUMERIC,
  images            JSONB NOT NULL DEFAULT '[]',
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason  TEXT,
  rating            NUMERIC NOT NULL DEFAULT 0,
  review_count      INTEGER NOT NULL DEFAULT 0,
  sold              INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);

CREATE TABLE IF NOT EXISTS orders (
  id              SERIAL PRIMARY KEY,
  buyer_id        TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  buyer_name      TEXT NOT NULL,
  buyer_phone     TEXT,
  seller_ids      TEXT[] NOT NULL DEFAULT '{}',
  items           JSONB NOT NULL DEFAULT '[]',
  subtotal        NUMERIC NOT NULL,
  delivery_fee    NUMERIC NOT NULL DEFAULT 0,
  total           NUMERIC NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'cancelled')),
  remark          TEXT,
  delivery_address TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_sellers ON orders USING GIN (seller_ids);

CREATE TABLE IF NOT EXISTS wishlists (
  user_id     TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  order_id    INTEGER,
  product_id  INTEGER,
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

CREATE TABLE IF NOT EXISTS reviews (
  id          TEXT PRIMARY KEY, -- `${orderId}_${productId}_${buyerId}`
  order_id    INTEGER NOT NULL,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  buyer_id    TEXT NOT NULL,
  buyer_name  TEXT,
  stars       SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  remark      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);

-- The session table for connect-pg-simple (auto-created by the library
-- too, but declared here so a fresh DB has it from the first migration).
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
