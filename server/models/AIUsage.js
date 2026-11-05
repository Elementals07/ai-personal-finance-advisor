const pool = require('../config/db');

const AIUsage = {
    async record({
        userId,
        provider,
        model,
        feature,
        inputTokens = 0,
        outputTokens = 0,
        totalTokens = inputTokens + outputTokens,
        durationMs = 0,
        statusCode = null,
        estimatedCostUsd = null,
        cacheHit = false
    }) {
        await pool.execute(
            `INSERT INTO ai_usage
                (user_id, provider, model, feature, input_tokens, output_tokens,
                 total_tokens, duration_ms, status_code, estimated_cost_usd, cache_hit)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                provider,
                model,
                feature,
                inputTokens,
                outputTokens,
                totalTokens,
                durationMs,
                statusCode,
                estimatedCostUsd,
                cacheHit
            ]
        );
    },

    async getSummary(userId) {
        const [rows] = await pool.execute(
            `SELECT
                COUNT(*) AS requests,
                COALESCE(SUM(input_tokens), 0) AS inputTokens,
                COALESCE(SUM(output_tokens), 0) AS outputTokens,
                COALESCE(SUM(total_tokens), 0) AS totalTokens,
                COALESCE(SUM(duration_ms), 0) AS durationMs,
                COALESCE(SUM(cache_hit = 1), 0) AS cacheHits,
                COALESCE(SUM(status_code >= 400), 0) AS failedRequests,
                SUM(estimated_cost_usd) AS estimatedCostUsd
             FROM ai_usage
             WHERE user_id = ?`,
            [userId]
        );
        return rows[0];
    }
};

module.exports = AIUsage;
