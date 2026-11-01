/**
 * Budget Controller
 * Handles budget setting and retrieval
 */
const { body, validationResult } = require('express-validator');
const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');

const budgetController = {
    /**
     * GET /api/budgets
     * Get budget for current month (or specified month)
     * Also returns spending comparison
     */
    async get(req, res, next) {
        try {
            const User = require('../models/User'); // Import User here or at top
            const month = req.query.month || (() => {
                const now = new Date();
                return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            })();

            const user = await User.findById(req.user.id);
            const overallBudget = parseFloat(user.monthly_income) || 0;

            const budgetsList = await Budget.findByUserAndMonth(req.user.id, month);
            const summary = await Transaction.getMonthlySummary(req.user.id, month);
            
            // Reformat budgets into an object mapping
            const allocations = {};
            budgetsList.forEach(b => {
                if (b.category !== 'All') {
                    allocations[b.category] = parseFloat(b.budget_amount);
                }
            });

            const totalSpent = summary.totalSpending;

            res.json({
                success: true,
                data: {
                    month,
                    budgetAmount: overallBudget,
                    allocations,
                    totalSpent,
                    remaining: overallBudget - totalSpent,
                    percentUsed: overallBudget > 0 ? Math.round((totalSpent / overallBudget) * 100) : 0,
                    isOverBudget: totalSpent > overallBudget && overallBudget > 0,
                    categoryBreakdown: summary.categoryBreakdown,
                    hasBudget: overallBudget > 0 || budgetsList.length > 0
                }
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * POST /api/budgets
     * Set or update monthly budget
     */
    set: [
        body('allocations')
            .isArray({ min: 1 })
            .withMessage('Allocations must be an array of { category, amount }'),
        body('month')
            .optional()
            .matches(/^\d{4}-\d{2}$/)
            .withMessage('Month must be in YYYY-MM format'),
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

                const { allocations, month } = req.body;
                const targetMonth = month || (() => {
                    const now = new Date();
                    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                })();

                await Budget.upsert(req.user.id, targetMonth, allocations);

                // Fetch the updated budget
                const updatedBudgets = await Budget.findByUserAndMonth(req.user.id, targetMonth);
                
                res.json({
                    success: true,
                    message: 'Budget set successfully',
                    data: updatedBudgets
                });
            } catch (error) {
                next(error);
            }
        }
    ],

    /**
     * GET /api/budgets/history
     * Get budget history for user
     */
    async history(req, res, next) {
        try {
            const budgets = await Budget.findAllByUser(req.user.id);

            res.json({
                success: true,
                data: budgets.map(b => ({
                    ...b,
                    budget_amount: parseFloat(b.budget_amount)
                }))
            });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = budgetController;
