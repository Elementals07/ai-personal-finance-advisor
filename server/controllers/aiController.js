/**
 * AI Controller
 * Handles AI analysis and chat endpoints
 */
const { body, validationResult } = require('express-validator');
const AIService = require('../services/aiService');
const Category = require('../models/Category');
const AIUsage = require('../models/AIUsage');

/** Sanitize an optional personal Gemini key sent by the client */
function extractPersonalKey(req) {
    const raw = req.get('x-gemini-key');
    if (!raw) return null;
    const key = String(raw).trim();
    return /^[A-Za-z0-9._-]{10,200}$/.test(key) ? key : null;
}

function getProvider(req, res) {
    const provider = String(req.get('x-ai-provider') || 'velona').toLowerCase();
    if (provider === 'velona' || provider === 'gemini') return provider;
    res.status(400).json({
        success: false,
        message: 'Unsupported AI provider selection. Choose Velona or Google Gemini in AI Settings.'
    });
    return null;
}

function checkProviderConfiguration(req, res, provider) {
    const rawKey = req.get('x-gemini-key');
    const personalKey = extractPersonalKey(req);
    if (provider === 'gemini' && rawKey && !personalKey) {
        res.status(400).json({
            success: false,
            message: 'The Gemini API key format is invalid. Update it in AI Settings.'
        });
        return false;
    }

    if (provider === 'gemini' && !AIService.getConfig().gemini.configured && !personalKey) {
        res.status(400).json({
            success: false,
            message: 'Google Gemini is not configured. Add a Gemini API key in AI Settings before switching providers.'
        });
        return false;
    }

    return personalKey;
}

function handleAIError(error, res, next) {
    if (error.statusCode) {
        const statusCode = error.statusCode === 401 || error.statusCode === 403
            ? 502
            : error.statusCode;
        return res.status(statusCode).json({
            success: false,
            message: error.message
        });
    }
    return next(error);
}

const aiController = {
    /**
     * GET /api/ai/config
     * Non-secret provider configuration and usage for AI Settings.
     */
    async config(req, res, next) {
        try {
            const provider = getProvider(req, res);
            if (!provider) return;
            const [usage] = await Promise.all([AIUsage.getSummary(req.user.id)]);
            res.json({
                success: true,
                data: {
                    ...AIService.getConfig(),
                    activeProvider: provider,
                    usage
                }
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * POST /api/ai/analyze
     * Trigger AI financial analysis
     * Sends processed/summarized data to the selected provider
     */
    async analyze(req, res, next) {
        try {
            const { month, refresh, timeframe } = req.body;
            const provider = getProvider(req, res);
            if (!provider) return;
            const personalKey = checkProviderConfiguration(req, res, provider);
            if (personalKey === false) return;
            const result = await AIService.generateAnalysis(
                req.user.id,
                month || null,
                refresh || false,
                ['month', 'quarter', 'year'].includes(timeframe) ? timeframe : 'month',
                personalKey,
                provider
            );

            res.json({
                success: true,
                data: {
                    analysis:     result.analysis,
                    cached:       result.cached,
                    summary:      result.summary,
                    healthSignal: result.healthSignal,   // 'green' | 'yellow' | 'red'
                    generatedAt:  new Date().toISOString()
                }
            });
        } catch (error) {
            handleAIError(error, res, next);
        }
    },

    /**
     * POST /api/ai/chat
     * Send a contextual chat message
     * Injects user financial data as context into the prompt
     */
    chat: [
        body('message')
            .trim()
            .notEmpty()
            .withMessage('Message is required')
            .isLength({ max: 500 })
            .withMessage('Message must be less than 500 characters'),
        async (req, res, next) => {
            try {
                const errors = validationResult(req);
                if (!errors.isEmpty()) {
                    return res.status(400).json({
                        success: false,
                        message: 'Validation failed',
                        errors: errors.array()
                    });
                }

                const { message, month, timeframe } = req.body;
                const conversationHistory = Array.isArray(req.body.history)
                    ? req.body.history
                        .filter(item => item && ['user', 'assistant'].includes(item.role) &&
                            typeof item.content === 'string' && item.content.trim())
                        .slice(-10)
                        .map(item => ({
                            role: item.role,
                            content: item.content.slice(0, 4000)
                        }))
                    : [];
                const provider = getProvider(req, res);
                if (!provider) return;
                const personalKey = checkProviderConfiguration(req, res, provider);
                if (personalKey === false) return;

                const result = await AIService.chat(req.user.id, message, month || null, timeframe || 'All',
                    personalKey, provider, conversationHistory);

                res.json({
                    success: true,
                    data: {
                        reply: result.reply,
                        cached: result.cached,
                        generatedAt: new Date().toISOString()
                    }
                });
            } catch (error) {
                handleAIError(error, res, next);
            }
        }
    ],

    /**
     * POST /api/ai/scan-bill
     * Parse receipt / invoice image with the selected provider's vision adapter
     */
    async scanBill(req, res, next) {
        try {
            const { image, mimeType, refresh } = req.body;
            const provider = getProvider(req, res);
            if (!provider) return;
            const personalKey = checkProviderConfiguration(req, res, provider);
            if (personalKey === false) return;
            if (!image) {
                return res.status(400).json({
                    success: false,
                    message: 'Image data (base64) is required'
                });
            }

            const categories = await Category.findByUserId(req.user.id);
            const categoryNames = categories.map(c => c.name);

            const result = await AIService.scanReceiptImage(
                image,
                mimeType || 'image/jpeg',
                categoryNames,
                personalKey,
                { userId: req.user.id, refresh: Boolean(refresh), provider }
            );

            res.json({
                success: true,
                message: refresh ? 'Receipt refreshed successfully' : 'Receipt scanned successfully',
                data: result
            });
        } catch (error) {
            handleAIError(error, res, next);
        }
    },

    /**
     * POST /api/ai/parse-sms
     * Parse pasted bank / UPI SMS messages into debit transactions.
     */
    async parseSms(req, res, next) {
        try {
            const { messages, refresh } = req.body;
            const provider = getProvider(req, res);
            if (!provider) return;
            const personalKey = checkProviderConfiguration(req, res, provider);
            if (personalKey === false) return;
            if (!Array.isArray(messages) || messages.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Messages array is required'
                });
            }

            const categories = await Category.findByUserId(req.user.id);
            const categoryNames = categories.map(c => c.name);

            const result = await AIService.parseSmsMessages(
                messages,
                categoryNames,
                personalKey,
                { userId: req.user.id, refresh: Boolean(refresh), provider }
            );

            res.json({
                success: true,
                message: refresh ? 'SMS results refreshed' : 'SMS messages parsed',
                data: result
            });
        } catch (error) {
            handleAIError(error, res, next);
        }
    }
};

module.exports = aiController;
