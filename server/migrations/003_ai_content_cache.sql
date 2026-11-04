-- ============================================================
-- Migration 003: Content-based AI cache
-- Purpose: Persist validated Gemini results for receipt images and
--          SMS batches, scoped per user and processing parameters.
--
-- Apply once:
--   mysql -u <user> -p finance_advisor < migrations/003_ai_content_cache.sql
-- ============================================================
USE finance_advisor;

CREATE TABLE IF NOT EXISTS ai_content_cache (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT NOT NULL,
    feature       VARCHAR(32) NOT NULL COMMENT 'receipt_scan or sms_parse',
    cache_version INT NOT NULL DEFAULT 1,
    content_hash  CHAR(64) NOT NULL COMMENT 'SHA-256 of image bytes or normalized SMS content',
    params_hash   CHAR(64) NOT NULL COMMENT 'SHA-256 of prompt/model/category/mime parameters',
    response      LONGTEXT NOT NULL COMMENT 'Validated JSON result',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_ai_content_cache (user_id, feature, cache_version, content_hash, params_hash),
    INDEX idx_ai_content_user (user_id, feature),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
