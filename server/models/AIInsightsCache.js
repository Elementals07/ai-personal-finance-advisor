/**
 * AI Insights Cache Model
 * Handles caching of Gemini API responses to minimize API calls
 */
const pool = require('../config/db');
const crypto = require('crypto');

const AIInsightsCache = {
    /**
     * Generate SHA-256 hash for a string
     * Used to hash prompts and data snapshots for cache lookup
     * @param {string} data
     * @returns {string} Hex-encoded SHA-256 hash
     */
    hash(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    },

    /**
     * Find a valid (non-expired) cached response
     * @param {number} userId
     * @param {string} type - 'analysis' or 'chat'
     * @param {string} promptHash - Hash of the prompt
     * @param {string} dataSnapshotHash - Hash of the financial data used
     * @returns {object|null} Cached response or null
     */
    async findValid(userId, type, promptHash, dataSnapshotHash) {
        const [rows] = await pool.execute(
            `SELECT * FROM ai_insights_cache 
             WHERE user_id = ? AND type = ? AND prompt_hash = ? 
             AND data_snapshot_hash = ? AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [userId, type, promptHash, dataSnapshotHash]
        );
        return rows[0] || null;
    },

    /**
     * Save a new cache entry
     * @param {object} data - Cache data
     */
    async save({ userId, type, promptHash, response, dataSnapshotHash, ttlHours = 24 }) {
        await pool.execute(
            `INSERT INTO ai_insights_cache 
             (user_id, type, prompt_hash, response, data_snapshot_hash, expires_at)
             VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
            [userId, type, promptHash, response, dataSnapshotHash, ttlHours]
        );
    },

    /**
     * Invalidate all cache entries for a user
     * Called when significant new data is added
     * @param {number} userId
     */
    async invalidate(userId) {
        await pool.execute(
            'DELETE FROM ai_insights_cache WHERE user_id = ?',
            [userId]
        );
    },

    /**
     * Alias kept for backwards compatibility with older call sites
     * (e.g. expenseController.createBatch).
     */
    async invalidateUser(userId) {
        return this.invalidate(userId);
    },

    /**
     * Clean up expired cache entries (maintenance)
     */
    async cleanup() {
        await pool.execute(
            'DELETE FROM ai_insights_cache WHERE expires_at < NOW()'
        );
    }
};

module.exports = AIInsightsCache;
