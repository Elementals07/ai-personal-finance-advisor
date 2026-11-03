-- ============================================
-- Migration 002 — Duplicate safeguards + demo account flag
-- Non-destructive: only additive changes.
--
-- Apply once after 001_add_category_snapshots.sql:
--   mysql -u <user> -p finance_advisor < migrations/002_dtype_safeguards.sql
-- ============================================
USE finance_advisor;

-- Demo account flag on users (0 = normal user, 1 = shared demo account)
ALTER TABLE users
    ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0;

-- Receipt/SMS fingerprint for duplicate-transaction safeguards
ALTER TABLE transactions
    ADD COLUMN receipt_fingerprint VARCHAR(80) DEFAULT NULL,
    ADD INDEX idx_user_fingerprint (user_id, receipt_fingerprint);
