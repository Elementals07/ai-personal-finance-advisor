/**
 * Expense Controller
 * Full CRUD operations for user transactions/expenses
 */
const { body, query, validationResult } = require('express-validator');
const Transaction = require('../models/Transaction');
const AIInsightsCache = require('../models/AIInsightsCache');

// Validation rules for creating/updating expenses
const expenseValidation = [
    body('amount')
        .isFloat({ min: 0.01 })
        .withMessage('Amount must be a positive number'),
    body('category')
        .notEmpty()
        .withMessage('Category is required'),
    body('date')
        .isDate()
        .withMessage('Valid date is required (YYYY-MM-DD format)'),
    body('description')
        .optional()
        .trim()
        .isLength({ max: 255 })
        .withMessage('Description must be less than 255 characters')
];

const expenseController = {
    /**
     * POST /api/expenses/batch
     * Create multiple expenses at once (e.g. from an itemized scanned bill).
     * Items may carry a `fingerprint` for duplicate protection; duplicates
     * already recorded for the user are skipped, not inserted.
     */
    async createBatch(req, res, next) {
        try {
            const { items } = req.body;
            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Items array is required'
                });
            }

            const validated = [];
            for (const item of items) {
                const amt = parseFloat(item.amount);
                if (isNaN(amt) || amt <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid amount: ${item.amount}`
                    });
                }
                if (!item.category) {
                    return res.status(400).json({
                        success: false,
                        message: 'Category is required for all items'
                    });
                }
                const dateStr = item.date || new Date().toISOString().slice(0, 10);
                validated.push({
                    amount: amt,
                    category: item.category,
                    description: (item.description || '').trim() || null,
                    date: dateStr,
                    fingerprint: (item.fingerprint || item.receipt_fingerprint || null)
                });
            }

            // Scanned receipts share one fingerprint across all line items,
            // so within-batch duplicates are expected and kept.
            const { created, skipped } = await Transaction.createBatch(req.user.id, validated, false);
            await AIInsightsCache.invalidateUser(req.user.id);

            const combined = created.length + skipped.length;
            res.status(201).json({
                success: true,
                message: `${combined} expense(s) recorded successfully`,
                data: { created, skipped }
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * POST /api/expenses/sms-import
     * Import transactions extracted from user-provided bank SMS text.
     * Uses per-SMS fingerprints so double imports are refused.
     */
    async smsImport(req, res, next) {
        try {
            const { items } = req.body;
            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Items array is required'
                });
            }

            const validated = [];
            for (const item of items) {
                const amt = parseFloat(item.amount);
                if (isNaN(amt) || amt <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid amount: ${item.amount}`
                    });
                }
                if (!item.category) {
                    return res.status(400).json({
                        success: false,
                        message: 'Category is required for all items'
                    });
                }
                const fingerprint = item.fingerprint || (item.smsId ? `sms_${item.smsId}` : null);
                const dateStr = item.date || new Date().toISOString().slice(0, 10);
                const merchant = (item.merchant || '').trim();
                validated.push({
                    amount: amt,
                    category: item.category,
                    description: (item.description || '').trim() ||
                        (merchant ? `${merchant} (via SMS)` : 'Bank SMS transaction'),
                    date: dateStr,
                    fingerprint
                });
            }

            const { created, skipped } = await Transaction.createBatch(req.user.id, validated, true);
            await AIInsightsCache.invalidateUser(req.user.id);

            res.status(201).json({
                success: true,
                message: created.length > 0
                    ? `${created.length} transaction(s) imported${skipped.length > 0 ? `, ${skipped.length} already recorded` : ''}`
                    : 'Those transactions were already imported.',
                data: { created, skipped }
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * GET /api/expenses/receipt-fingerprint?fingerprint=...
     * Client-side duplicate check before saving a scanned receipt.
     */
    async checkFingerprint(req, res, next) {
        try {
            const { fingerprint } = req.query;
            if (!fingerprint) {
                return res.status(400).json({
                    success: false,
                    message: 'fingerprint query param is required'
                });
            }
            const existing = await Transaction.findByFingerprint(req.user.id, String(fingerprint));
            res.json({
                success: true,
                data: { exists: Boolean(existing), transaction: existing ? { id: existing.id, date: existing.date } : null }
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * GET /api/expenses
     * List all expenses for the authenticated user
     * Query params: month, category, startDate, endDate, limit, offset
     */
    async list(req, res, next) {
        try {
            const { month, category, startDate, endDate, search, page = 1, limit = 25 } = req.query;

            const transactions = await Transaction.findByUserId(req.user.id, {
                month,
                category,
                startDate,
                endDate,
                search,
                limit: parseInt(limit),
                offset: (parseInt(page) - 1) * parseInt(limit)
            });

            res.json({
                success: true,
                data: transactions,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    count: transactions.length
                }
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * POST /api/expenses
     * Create a new expense/transaction
     */
    create: [
        ...expenseValidation,
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

                const { amount, category, description, date, fingerprint } = req.body;

                // Duplicate safeguard: reject a receipt fingerprint that is
                // already recorded for this user.
                if (fingerprint) {
                    const existing = await Transaction.findByFingerprint(req.user.id, String(fingerprint));
                    if (existing) {
                        return res.status(409).json({
                            success: false,
                            message: 'This receipt appears to be recorded already. Please review before saving.',
                            errors: [{ msg: 'duplicate_fingerprint' }]
                        });
                    }
                }

                const transaction = await Transaction.create({
                    userId: req.user.id,
                    amount: parseFloat(amount),
                    category,
                    description,
                    date,
                    fingerprint: fingerprint || null
                });

                // Invalidate AI cache since new data was added
                await AIInsightsCache.invalidate(req.user.id);

                res.status(201).json({
                    success: true,
                    message: 'Expense added successfully',
                    data: transaction
                });
            } catch (error) {
                next(error);
            }
        }
    ],

    /**
     * PUT /api/expenses/:id
     * Update an existing expense
     */
    update: [
        ...expenseValidation,
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

                const { id } = req.params;
                const { amount, category, description, date } = req.body;

                // Check if expense exists and belongs to user
                const existing = await Transaction.findById(id, req.user.id);
                if (!existing) {
                    return res.status(404).json({
                        success: false,
                        message: 'Expense not found'
                    });
                }

                await Transaction.update(id, req.user.id, {
                    amount: parseFloat(amount),
                    category,
                    description,
                    date
                });

                // Invalidate AI cache
                await AIInsightsCache.invalidate(req.user.id);

                // Fetch updated record
                const updated = await Transaction.findById(id, req.user.id);

                res.json({
                    success: true,
                    message: 'Expense updated successfully',
                    data: updated
                });
            } catch (error) {
                next(error);
            }
        }
    ],

    /**
     * DELETE /api/expenses/:id
     * Delete an expense
     */
    async delete(req, res, next) {
        try {
            const { id } = req.params;

            // Check if expense exists and belongs to user
            const existing = await Transaction.findById(id, req.user.id);
            if (!existing) {
                return res.status(404).json({
                    success: false,
                    message: 'Expense not found'
                });
            }

            await Transaction.delete(id, req.user.id);

            // Invalidate AI cache
            await AIInsightsCache.invalidate(req.user.id);

            res.json({
                success: true,
                message: 'Expense deleted successfully'
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * GET /api/expenses/summary
     * Get aggregated spending summary for a month
     */
    async summary(req, res, next) {
        try {
            const month = req.query.month || (() => {
                const now = new Date();
                return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            })();

            const summary = await Transaction.getMonthlySummary(req.user.id, month);
            const trends = await Transaction.getMonthlyTrend(req.user.id, 60);
            const daily = await Transaction.getDailySpending(req.user.id, month);

            res.json({
                success: true,
                data: {
                    month,
                    ...summary,
                    trends,
                    dailySpending: daily
                }
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * GET /api/expenses/savings
     * Get historical savings data (Income vs Expenses)
     */
    async savings(req, res, next) {
        try {
            const history = await Transaction.getSavingsHistory(req.user.id);
            res.json({
                success: true,
                data: history
            });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = expenseController;
