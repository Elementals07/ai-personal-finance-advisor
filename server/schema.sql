-- ============================================
-- AI Personal Finance Advisor — Database Schema
-- ============================================

CREATE DATABASE IF NOT EXISTS finance_advisor;
USE finance_advisor;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    monthly_income DECIMAL(12, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Custom and Default Categories
CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT DEFAULT NULL COMMENT 'NULL means it is a global default category',
    name VARCHAR(50) NOT NULL,
    color VARCHAR(20) NOT NULL DEFAULT '#cccccc',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_category (user_id, name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert defaults
INSERT IGNORE INTO categories (user_id, name, color) VALUES
(NULL, 'Food', '#ef4444'),
(NULL, 'Travel', '#f59e0b'),
(NULL, 'Rent', '#3b82f6'),
(NULL, 'Entertainment', '#8b5cf6'),
(NULL, 'Shopping', '#ec4899'),
(NULL, 'Utilities', '#06b6d4'),
(NULL, 'Health', '#10b981'),
(NULL, 'Education', '#6366f1'),
(NULL, 'Others', '#64748b');

-- Transactions (expenses) table
CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'Others',
    description VARCHAR(255) DEFAULT NULL,
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_date (date),
    INDEX idx_user_date (user_id, date),
    INDEX idx_user_category (user_id, category),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Budgets table (one budget per user per month per category)
CREATE TABLE IF NOT EXISTS budgets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    month VARCHAR(7) NOT NULL COMMENT 'Format: YYYY-MM',
    category VARCHAR(50) NOT NULL DEFAULT 'All',
    allocations JSON DEFAULT NULL,
    budget_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_month_category (user_id, month, category),
    INDEX idx_user_month (user_id, month),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- AI Insights Cache table
CREATE TABLE IF NOT EXISTS ai_insights_cache (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type ENUM('analysis', 'chat') NOT NULL,
    prompt_hash VARCHAR(64) NOT NULL COMMENT 'SHA-256 hash of the prompt',
    response TEXT NOT NULL,
    data_snapshot_hash VARCHAR(64) NOT NULL COMMENT 'Hash of financial summary for cache invalidation',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    INDEX idx_user_type (user_id, type),
    INDEX idx_cache_lookup (user_id, type, prompt_hash, data_snapshot_hash),
    INDEX idx_expires (expires_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
