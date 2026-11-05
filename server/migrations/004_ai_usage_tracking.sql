CREATE TABLE IF NOT EXISTS ai_usage (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    provider VARCHAR(16) NOT NULL,
    model VARCHAR(128) NOT NULL,
    feature VARCHAR(32) NOT NULL,
    input_tokens INT UNSIGNED NOT NULL DEFAULT 0,
    output_tokens INT UNSIGNED NOT NULL DEFAULT 0,
    total_tokens INT UNSIGNED NOT NULL DEFAULT 0,
    duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
    status_code SMALLINT UNSIGNED NULL,
    estimated_cost_usd DECIMAL(14, 8) NULL,
    cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_ai_usage_user_created (user_id, created_at),
    CONSTRAINT fk_ai_usage_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
