-- Multi-Tenant E-Commerce Financial Intelligence SaaS Schema
-- Philosophy: Strict Tenant Isolation (`org_id` on every table), Universal Financial Ledger, Channel Agnostic, Traceable Ingestion

PRAGMA foreign_keys = ON;

-- ============================================================
-- 1. ORGANIZATIONS (TENANTS)
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id                    TEXT PRIMARY KEY,               -- org_01h...
  name                  TEXT NOT NULL,
  base_currency         TEXT NOT NULL DEFAULT 'GBP',
  timezone              TEXT NOT NULL DEFAULT 'Europe/London',
  primary_objective     TEXT NOT NULL DEFAULT 'finance_intelligence',
  region                TEXT NOT NULL DEFAULT 'UK',
  status                TEXT NOT NULL DEFAULT 'Active'
                          CHECK (status IN ('Active','Suspended','Archived')),
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);

-- ============================================================
-- 2. USERS & MULTI-TENANT MEMBERSHIPS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                    TEXT PRIMARY KEY,               -- usr_01h...
  email                 TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name                  TEXT NOT NULL,
  password_hash         TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'Active'
                          CHECK (status IN ('Active','Disabled')),
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS org_memberships (
  id                    TEXT PRIMARY KEY,               -- mem_01h...
  org_id                TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role                  TEXT NOT NULL DEFAULT 'member'
                          CHECK (role IN ('owner','admin','member','viewer')),
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON org_memberships(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id                    TEXT PRIMARY KEY,               -- ses_01h...
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash            TEXT NOT NULL UNIQUE,
  expires_at            TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);

-- ============================================================
-- 3. SALES CHANNELS (CONNECTOR REGISTRY)
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_channels (
  id                    TEXT PRIMARY KEY,               -- chn_01h...
  org_id                TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL
                          CHECK (provider IN ('shopify', 'tiktok', 'woocommerce', 'amazon', 'custom_api', 'manual_csv')),
  channel_name          TEXT NOT NULL,
  external_store_id     TEXT,
  status                TEXT NOT NULL DEFAULT 'Connected'
                          CHECK (status IN ('Connected', 'Disconnected', 'SyncError', 'Paused', 'ReadyToConnect', 'Importing', 'RequiresAttention')),
  credentials_json      TEXT,                           -- Isolated/encrypted token payload
  last_sync_at          TEXT,
  last_error            TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_sales_channels_org ON sales_channels(org_id);

-- ============================================================
-- 4. CANONICAL PRODUCTS (CATALOG & COGS)
-- ============================================================
CREATE TABLE IF NOT EXISTS canonical_products (
  id                    TEXT PRIMARY KEY,               -- prd_01h...
  org_id                TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sku                   TEXT NOT NULL,
  title                 TEXT NOT NULL,
  category              TEXT,
  unit_cost             REAL NOT NULL DEFAULT 0.0,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (org_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_canonical_products_org_sku ON canonical_products(org_id, sku);

-- ============================================================
-- 5. CANONICAL ORDERS (UNIVERSAL ORDER HEADER)
-- ============================================================
CREATE TABLE IF NOT EXISTS canonical_orders (
  id                    TEXT PRIMARY KEY,               -- ord_01h...
  org_id                TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_id            TEXT NOT NULL REFERENCES sales_channels(id) ON DELETE CASCADE,
  import_job_id         TEXT,                           -- Traceability to import batch
  external_order_id     TEXT NOT NULL,                  -- Provider's unique order identifier
  order_number          TEXT NOT NULL,                  -- Display order number (e.g. #1001)
  currency              TEXT NOT NULL DEFAULT 'GBP',
  gross_amount          REAL NOT NULL DEFAULT 0.0,
  discount_amount       REAL NOT NULL DEFAULT 0.0,
  shipping_amount       REAL NOT NULL DEFAULT 0.0,
  tax_amount            REAL NOT NULL DEFAULT 0.0,
  financial_status      TEXT NOT NULL DEFAULT 'paid'
                          CHECK (financial_status IN ('pending', 'paid', 'partially_refunded', 'refunded', 'voided')),
  fulfillment_status    TEXT NOT NULL DEFAULT 'unfulfilled'
                          CHECK (fulfillment_status IN ('unfulfilled', 'partial', 'fulfilled', 'cancelled')),
  customer_email        TEXT,
  ordered_at            TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (org_id, channel_id, external_order_id)
);

CREATE INDEX IF NOT EXISTS idx_canonical_orders_org ON canonical_orders(org_id);
CREATE INDEX IF NOT EXISTS idx_canonical_orders_ordered_at ON canonical_orders(org_id, ordered_at);
CREATE INDEX IF NOT EXISTS idx_canonical_orders_import_job ON canonical_orders(import_job_id);

-- ============================================================
-- 6. CANONICAL ORDER ITEMS (LINE ITEMS & MARGINS)
-- ============================================================
CREATE TABLE IF NOT EXISTS canonical_order_items (
  id                    TEXT PRIMARY KEY,               -- itm_01h...
  org_id                TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_id              TEXT NOT NULL REFERENCES canonical_orders(id) ON DELETE CASCADE,
  sku                   TEXT NOT NULL,
  title                 TEXT NOT NULL,
  qty                   INTEGER NOT NULL CHECK (qty > 0),
  unit_price            REAL NOT NULL CHECK (unit_price >= 0),
  unit_cost             REAL NOT NULL DEFAULT 0.0,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (org_id, order_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_canonical_order_items_order ON canonical_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_canonical_order_items_org ON canonical_order_items(org_id);

-- ============================================================
-- 7. CANONICAL PAYOUTS (CHANNEL SETTLEMENTS)
-- ============================================================
CREATE TABLE IF NOT EXISTS canonical_payouts (
  id                    TEXT PRIMARY KEY,               -- pay_01h...
  org_id                TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_id            TEXT NOT NULL REFERENCES sales_channels(id) ON DELETE CASCADE,
  import_job_id         TEXT,                           -- Traceability to import batch
  external_payout_id    TEXT NOT NULL,
  payout_date           TEXT NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'GBP',
  gross_sales           REAL NOT NULL DEFAULT 0.0,
  total_refunds         REAL NOT NULL DEFAULT 0.0,
  total_fees            REAL NOT NULL DEFAULT 0.0,
  net_amount            REAL NOT NULL DEFAULT 0.0,
  reconciliation_status TEXT NOT NULL DEFAULT 'unreconciled'
                          CHECK (reconciliation_status IN ('unreconciled', 'matched', 'discrepancy', 'flagged')),
  discrepancy_amount    REAL NOT NULL DEFAULT 0.0,
  notes                 TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (org_id, channel_id, external_payout_id)
);

CREATE INDEX IF NOT EXISTS idx_canonical_payouts_org ON canonical_payouts(org_id);

-- ============================================================
-- 8. CANONICAL FINANCIAL EVENTS (UNIVERSAL LEDGER)
-- ============================================================
CREATE TABLE IF NOT EXISTS canonical_financial_events (
  id                    TEXT PRIMARY KEY,               -- evt_01h...
  org_id                TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_id            TEXT NOT NULL REFERENCES sales_channels(id) ON DELETE CASCADE,
  order_id              TEXT REFERENCES canonical_orders(id) ON DELETE CASCADE,
  payout_id             TEXT REFERENCES canonical_payouts(id) ON DELETE SET NULL,
  import_job_id         TEXT,                           -- Traceability to import batch
  external_event_id     TEXT NOT NULL,
  event_type            TEXT NOT NULL
                          CHECK (event_type IN ('sale', 'refund', 'platform_fee', 'processing_fee', 'shipping_fee', 'adjustment', 'payout')),
  amount                REAL NOT NULL,                  -- Positive for revenue, negative for fees/refunds
  currency              TEXT NOT NULL DEFAULT 'GBP',
  description           TEXT,
  occurred_at           TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (org_id, channel_id, external_event_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_financial_events_org ON canonical_financial_events(org_id);
CREATE INDEX IF NOT EXISTS idx_financial_events_occurred ON canonical_financial_events(org_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_financial_events_type ON canonical_financial_events(org_id, event_type);

-- ============================================================
-- 9. IMPORT JOBS (ONBOARDING & INGESTION LOG)
-- ============================================================
CREATE TABLE IF NOT EXISTS import_jobs (
  id                    TEXT PRIMARY KEY,               -- imp_01h...
  org_id                TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_id            TEXT REFERENCES sales_channels(id) ON DELETE SET NULL,
  source_name           TEXT NOT NULL,
  import_type           TEXT NOT NULL CHECK (import_type IN ('orders', 'payouts', 'products', 'financial_events')),
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'processing', 'completed', 'completed_with_errors', 'failed')),
  total_rows            INTEGER NOT NULL DEFAULT 0,
  processed_rows        INTEGER NOT NULL DEFAULT 0,
  successful_rows       INTEGER NOT NULL DEFAULT 0,
  skipped_rows          INTEGER NOT NULL DEFAULT 0,
  failed_rows           INTEGER NOT NULL DEFAULT 0,
  error_summary         TEXT,
  started_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at          TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_org ON import_jobs(org_id);
