/**
 * Persistent cache for content-based AI results (receipt images and SMS batches).
 * Scoped by user, feature, cache version, content hash and processing parameters.
 */
const pool = require('../config/db');
const crypto = require('crypto');

const CACHE_VERSION = 1;

function hash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function stableStringify(value) {
    if (value === undefined) return 'null';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    return `{${Object.keys(value).sort().map(key => (
        `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(',')}}`;
}

const AIContentCache = {
    CACHE_VERSION,
    hash,
    stableStringify,

    /**
     * Find a cached JSON response for an exact cache key.
     */
    async find({ userId, feature, contentHash, paramsHash }) {
        const [rows] = await pool.execute(
            `SELECT response
             FROM ai_content_cache
             WHERE user_id = ?
               AND feature = ?
               AND cache_version = ?
               AND content_hash = ?
               AND params_hash = ?
             LIMIT 1`,
            [userId, feature, CACHE_VERSION, contentHash, paramsHash]
        );

        if (!rows[0]) return null;

        try {
            return JSON.parse(rows[0].response);
        } catch (_) {
            return null;
        }
    },

    /**
     * Create or replace the cached result for an exact cache key.
     * Returns true when an existing row was updated.
     */
    async upsert({ userId, feature, contentHash, paramsHash, response }) {
        const [existing] = await pool.execute(
            `SELECT id
             FROM ai_content_cache
             WHERE user_id = ?
               AND feature = ?
               AND cache_version = ?
               AND content_hash = ?
               AND params_hash = ?
             LIMIT 1`,
            [userId, feature, CACHE_VERSION, contentHash, paramsHash]
        );

        const payload = JSON.stringify(response);

        await pool.execute(
            `INSERT INTO ai_content_cache
                (user_id, feature, cache_version, content_hash, params_hash, response)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                response = VALUES(response),
                updated_at = CURRENT_TIMESTAMP`,
            [userId, feature, CACHE_VERSION, contentHash, paramsHash, payload]
        );

        return existing.length > 0;
    },

    /**
     * Maintenance: remove stale rows that no longer belong to an existing user.
     * User deletion is already handled by the foreign key; this is a safe no-op
     * placeholder for future retention policies.
     */
    async cleanup() {
        await pool.execute(
            'DELETE FROM ai_content_cache WHERE user_id NOT IN (SELECT id FROM users)'
        );
    }
};

module.exports = AIContentCache;
