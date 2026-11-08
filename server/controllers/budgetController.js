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
            const budgetsList = await Budget.findByUserAndMonth(req.user.id, month);

            // MySQL is the source of truth. The "All" row (when present) stores
            // the month's income reference; category rows store the real
            // spending plan. The user profile is only a fallback for legacy
            // accounts that have not saved an income row for this month.
            const overallRow = budgetsList.find(b => b.category === 'All');
            const overallBudget = parseFloat(overallRow?.budget_amount)
                || parseFloat(user.monthly_income)
                || 0;

            const allocations = {};
            budgetsList.forEach(b => {
                if (b.category !== 'All') {
                    allocations[b.category] = parseFloat(b.budget_amount);
                }
            });

            const plannedAmount = Object.values(allocations)
                .reduce((sum, amount) => sum + (Number.isFinite(amount) ? amount : 0), 0);
            const hasCategoryPlan = plannedAmount > 0;
            const spendingPlanAmount = hasCategoryPlan ? plannedAmount : overallBudget;

            const summary = await Transaction.getMonthlySummary(req.user.id, month);
            const totalSpent = summary.totalSpending;
            const remaining = spendingPlanAmount - totalSpent;

            res.json({
                success: true,
                data: {
                    month,
                    // Income baseline used by the budget form.
                    budgetAmount: overallBudget,
                    // Sum of configured category limits (the actual spending plan).
                    plannedAmount,
                    // Amount the progress UI compares spending against.
                    spendingPlanAmount,
                    allocations,
                    totalSpent,
                    remaining,
                    percentUsed: spendingPlanAmount > 0
                        ? Math.round((totalSpent / spendingPlanAmount) * 100)
                        : 0,
                    isOverBudget: spendingPlanAmount > 0 && totalSpent > spendingPlanAmount,
                    categoryBreakdown: summary.categoryBreakdown,
                    hasBudget: hasCategoryPlan,
                    hasIncome: overallBudget > 0
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
