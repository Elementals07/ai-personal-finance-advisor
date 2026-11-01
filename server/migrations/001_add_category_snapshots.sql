-- ============================================================
-- Migration 001: Category Historical Snapshots
-- Purpose: Store monthly per-category aggregates for fast
--          3-month baseline comparisons without re-scanning
--          the entire transactions table every AI request.
-- ============================================================

USE finance_advisor;

CREATE TABLE IF NOT EXISTS category_historical_snapshots (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    user_id          INT NOT NULL,
    period_type      ENUM('month', 'week') NOT NULL DEFAULT 'month',
    period_id        VARCHAR(10) NOT NULL COMMENT 'YYYY-MM for month, YYYY-Www for week',
    category         VARCHAR(50) NOT NULL,
    total_spent      DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    transaction_count INT NOT NULL DEFAULT 0,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_snapshot (user_id, period_type, period_id, category),
    INDEX idx_user_period (user_id, period_type, period_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------
-- Backfill: Populate monthly snapshots from existing transactions
-- This runs once; the application will upsert on every transaction
-- ----------------------------------------------------------------
INSERT INTO category_historical_snapshots
    (user_id, period_type, period_id, category, total_spent, transaction_count)
SELECT
    user_id,
    'month'                           AS period_type,
    DATE_FORMAT(date, '%Y-%m')        AS period_id,
    category,
    SUM(amount)                       AS total_spent,
    COUNT(*)                          AS transaction_count
FROM transactions
GROUP BY user_id, DATE_FORMAT(date, '%Y-%m'), category
ON DUPLICATE KEY UPDATE
    total_spent       = VALUES(total_spent),
    transaction_count = VALUES(transaction_count),
    updated_at        = CURRENT_TIMESTAMP;
