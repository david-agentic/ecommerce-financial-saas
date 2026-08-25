-- Migration: 0003_channel_and_product_onboarding.sql
-- Purpose: Support guided onboarding primary objectives, channel sync metadata, and product cost tracking.

ALTER TABLE organizations ADD COLUMN primary_objective TEXT DEFAULT 'finance_intelligence';
ALTER TABLE organizations ADD COLUMN region TEXT DEFAULT 'UK';

ALTER TABLE sales_channels ADD COLUMN last_sync_at TEXT;
ALTER TABLE sales_channels ADD COLUMN last_error TEXT;
