/**
 * AI Controller
 * Handles AI analysis and chat endpoints
 */
const { body, validationResult } = require('express-validator');
const AIService = require('../services/aiService');
const Category = require('../models/Category');

/** Sanitize an optional personal Gemini key sent by the client */
function extractPersonalKey(req) {
    const raw = req.get('x-gemini-key');
    if (!raw) return null;
    const key = String(raw).trim();
    return /^[A-Za-z0-9._-]{10,200}$/.test(key) ? key : null;
}

const aiController = {
    /**
     * GET /api/ai/config
     * Non-secret Gemini configuration status for the AI Settings UI.
     */
    async config(req, res) {
        res.json({
            success: true,
            data: AIService.getConfig()
        });
    },

    /**
     * POST /api/ai/analyze
     * Trigger AI financial analysis
     * Only sends processed/summarized data to Gemini
     */
    async analyze(req, res, next) {
        try {
            const { month, refresh, timeframe } = req.body;
            const result = await AIService.generateAnalysis(
                req.user.id,
                month || null,
                refresh || false,
                ['month', 'quarter', 'year'].includes(timeframe) ? timeframe : 'month',
                extractPersonalKey(req)
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
            console.error('[AI CONTROLLER] Error during analysis:', error);
            // Handle Gemini API errors gracefully
            if (error.message.includes('Gemini API failed')) {
                return res.status(503).json({
                    success: false,
                    message: 'AI service is temporarily unavailable. Please try again in a moment.',
                    detail: error.message
                });
            }
            next(error);
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

                const result = await AIService.chat(req.user.id, message, month || null, timeframe || 'All',
                    extractPersonalKey(req));

                res.json({
                    success: true,
                    data: {
                        reply: result.reply,
                        cached: result.cached,
                        generatedAt: new Date().toISOString()
                    }
                });
            } catch (error) {
                if (error.message.includes('Gemini API failed')) {
                    return res.status(503).json({
                        success: false,
                        message: 'AI service is temporarily unavailable. Please try again in a moment.',
                        detail: error.message
                    });
                }
                next(error);
            }
        }
    ],

    /**
     * POST /api/ai/scan-bill
     * Parse receipt / invoice image with Gemini Multimodal Vision
     */
    async scanBill(req, res, next) {
        try {
            const { image, mimeType, refresh } = req.body;
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
                extractPersonalKey(req),
                { userId: req.user.id, refresh: Boolean(refresh) }
            );

            res.json({
                success: true,
                message: refresh ? 'Receipt refreshed successfully' : 'Receipt scanned successfully',
                data: result
            });
        } catch (error) {
            console.error('[AI CONTROLLER] Bill scan failed:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to scan bill. Please ensure image is clear or enter manually.'
            });
        }
    },

    /**
     * POST /api/ai/parse-sms
     * Parse pasted bank / UPI SMS messages into debit transactions.
     */
    async parseSms(req, res, next) {
        try {
            const { messages, refresh } = req.body;
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
                extractPersonalKey(req),
                { userId: req.user.id, refresh: Boolean(refresh) }
            );

            res.json({
                success: true,
                message: refresh ? 'SMS results refreshed' : 'SMS messages parsed',
                data: result
            });
        } catch (error) {
            console.error('[AI CONTROLLER] SMS parse failed:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to parse SMS messages. Please try again.'
            });
        }
    }
};

module.exports = aiController;
