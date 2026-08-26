-- B-COMPASS Schema Migration: Add Expenses & Extended Org Fields
-- Run against D1 database: ecommerce-financial-saas-db

CREATE TABLE IF NOT EXISTS business_expenses (
  id                    TEXT PRIMARY KEY,
  org_id                TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date                  TEXT NOT NULL,
  category              TEXT NOT NULL,
  vendor                TEXT,
  description           TEXT,
  amount                REAL NOT NULL DEFAULT 0.0,
  currency              TEXT NOT NULL DEFAULT 'PKR',
  payment_status        TEXT NOT NULL DEFAULT 'paid'
                          CHECK (payment_status IN ('paid', 'pending', 'partial')),
  reference             TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_expenses_org ON business_expenses(org_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON business_expenses(org_id, date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON business_expenses(org_id, category);
