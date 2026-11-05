/**
 * Structured AI logging for the Node.js backend terminal.
 * Keeps diagnostics readable while never printing secrets, raw images or SMS bodies.
 */

const SENSITIVE_KEYS = new Set([
    'key',
    'apikey',
    'api_key',
    'gemini_api_key',
    'velona_api_key',
    'x_gemini_key',
    'token',
    'authorization',
    'password',
    'secret',
    'body',
    'image',
    'content',
    'prompt',
    'response'
]);

const MAX_STRING_LENGTH = 160;

function sanitize(value, depth = 0) {
    if (value === null || value === undefined) return value;
    if (depth > 3) return '[object]';

    if (typeof value === 'string') {
        return value.length > MAX_STRING_LENGTH
            ? `${value.slice(0, MAX_STRING_LENGTH)}...`
            : value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') return value;

    if (Array.isArray(value)) {
        return value.slice(0, 20).map(item => sanitize(item, depth + 1));
    }

    if (typeof value === 'object') {
        const safe = {};
        for (const [key, item] of Object.entries(value)) {
            const normalizedKey = key.toLowerCase().replace(/-/g, '_');
            safe[key] = SENSITIVE_KEYS.has(normalizedKey)
                ? '[redacted]'
                : sanitize(item, depth + 1);
        }
        return safe;
    }

    return String(value);
}

function logAiEvent(event, data = {}) {
    const time = new Date().toTimeString().slice(0, 8);
    let payload = '';

    try {
        payload = JSON.stringify(sanitize(data));
    } catch (_) {
        payload = '{}';
    }

    console.log(`[AI ${time}] ${event} ${payload}`);
}

function shortHash(hash) {
    return String(hash || '').slice(0, 6);
}

const lastThrottledLog = new Map();

/** Throttle noisy repeated events (e.g. the same cache hit) for a short window. */
function logAiEventThrottled(event, data = {}, key = event, intervalMs = 30000) {
    const now = Date.now();
    const last = lastThrottledLog.get(key) || 0;

    if (now - last < intervalMs) return;

    if (lastThrottledLog.size > 1000) {
        lastThrottledLog.clear();
    }

    lastThrottledLog.set(key, now);
    logAiEvent(event, data);
}

module.exports = {
    logAiEvent,
    logAiEventThrottled,
    shortHash
};
