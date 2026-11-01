/**
 * AI Tools Service
 *
 * Implements Gemini Function Calling for the financial advisor.
 *
 * Architecture:
 *   User asks a question → Gemini decides which tools to call → tools fetch
 *   exact data from MySQL → Gemini reads results → gives a grounded answer.
 *
 * This means the AI is NEVER limited to a pre-built snapshot.  It can query
 * any period, any category, any comparison — exactly like a real advisor who
 * can pull up any report on demand.
 */

'use strict';

const pool       = require('../config/db');
const Transaction = require('../models/Transaction');
const Budget     = require('../models/Budget');
const User       = require('../models/User');

// ─────────────────────────────────────────────────────────────────────────────
// TOOL DECLARATIONS  (sent to Gemini so it knows what it can call)
// ─────────────────────────────────────────────────────────────────────────────

const TOOL_DECLARATIONS = [
    {
        name: 'get_monthly_summary',
        description:
            'Get the complete spending breakdown for a specific calendar month: ' +
            'total spent, per-category amounts, transaction count, and budget status if one is set. ' +
            'Use for questions about a single month.',
        parameters: {
            type: 'OBJECT',
            properties: {
                month: {
                    type: 'STRING',
                    description: 'Month in YYYY-MM format, e.g. "2026-04"'
                }
            },
            required: ['month']
        }
    },
    {
        name: 'get_period_summary',
        description:
            'Get aggregated spending across any custom date range (multiple months). ' +
            'Returns month-by-month totals AND category totals for the whole period. ' +
            'Use for "first four months", "Q1", "Jan to June", "this year so far", etc.',
        parameters: {
            type: 'OBJECT',
            properties: {
                start_month: { type: 'STRING', description: 'Start month in YYYY-MM format (inclusive)' },
                end_month:   { type: 'STRING', description: 'End month in YYYY-MM format (inclusive)'  }
            },
            required: ['start_month', 'end_month']
        }
    },
    {
        name: 'get_category_history',
        description:
            'Get month-by-month spending history for ONE specific category over a date range. ' +
            'Returns grand total, monthly average, highest and lowest months, and per-month breakdown. ' +
            'Use for questions like "analyse my food spending this year", "how much did I spend on rent?", ' +
            '"what is my shopping habit like?"',
        parameters: {
            type: 'OBJECT',
            properties: {
                category: {
                    type: 'STRING',
                    description: 'Exact category name from the user\'s spending categories list'
                },
                start_month: { type: 'STRING', description: 'Start month YYYY-MM' },
                end_month:   { type: 'STRING', description: 'End month YYYY-MM'   }
            },
            required: ['category', 'start_month', 'end_month']
        }
    },
    {
        name: 'get_annual_breakdown',
        description:
            'Get a complete year\'s spending broken down by month and by category. ' +
            'Includes annual total, best and worst months, and category-wise percentages. ' +
            'Use for "how was my year?", "annual summary", "year overview", etc.',
        parameters: {
            type: 'OBJECT',
            properties: {
                year: {
                    type: 'NUMBER',
                    description: '4-digit year, e.g. 2026'
                }
            },
            required: ['year']
        }
    },
    {
        name: 'get_savings_history',
        description:
            'Get month-by-month income vs spending vs savings data. ' +
            'Use for savings rate trends, "am I saving enough?", income vs expense pattern analysis.',
        parameters: {
            type: 'OBJECT',
            properties: {}
        }
    },
    {
        name: 'get_recent_transactions',
        description:
            'Fetch individual transaction records (date, amount, category, description) for detailed review. ' +
            'Use when the user wants to see specific purchases, review actual expenses in a period, ' +
            'or find a particular transaction.',
        parameters: {
            type: 'OBJECT',
            properties: {
                month:    { type: 'STRING', description: 'Filter to a month YYYY-MM (optional)'     },
                category: { type: 'STRING', description: 'Filter to a category name (optional)'     },
                limit:    { type: 'NUMBER', description: 'Number of records to return (max 50, default 20)' }
            }
        }
    },
    {
        name: 'compare_two_periods',
        description:
            'Side-by-side comparison of spending in two separate date ranges. ' +
            'Returns total change, and per-category change with percentages. ' +
            'Use for "compare first half vs second half", "Q1 vs Q2", "this month vs last month" etc.',
        parameters: {
            type: 'OBJECT',
            properties: {
                period1_start: { type: 'STRING', description: 'Start of first period YYYY-MM'  },
                period1_end:   { type: 'STRING', description: 'End of first period YYYY-MM'    },
                period2_start: { type: 'STRING', description: 'Start of second period YYYY-MM' },
                period2_end:   { type: 'STRING', description: 'End of second period YYYY-MM'   }
            },
            required: ['period1_start', 'period1_end', 'period2_start', 'period2_end']
        }
    }
];

// ─────────────────────────────────────────────────────────────────────────────
// TOOL EXECUTOR
// Maps Gemini's function call → actual DB query → result
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a single tool call and return a JSON-serialisable result.
 * @param {string} name  - Tool name as declared above
 * @param {object} args  - Arguments from Gemini
 * @param {number} userId
 * @returns {Promise<object>}
 */
async function executeToolCall(name, args, userId) {
    switch (name) {

        case 'get_monthly_summary': {
            const { month } = args;
            if (!month) throw new Error('month is required');
            const [summary, budget] = await Promise.all([
                Transaction.getMonthlySummary(userId, month),
                Budget.findByUserAndMonth(userId, month)
            ]);
            const budgetData = budget
                ? {
                    amount:      parseFloat(budget.budget_amount),
                    spent:       summary.totalSpending,
                    remaining:   parseFloat(budget.budget_amount) - summary.totalSpending,
                    percentUsed: Math.round(
                        (summary.totalSpending / parseFloat(budget.budget_amount)) * 100
                    ),
                    isOverBudget: summary.totalSpending > parseFloat(budget.budget_amount)
                }
                : null;
            return {
                month,
                totalSpent:       summary.totalSpending,
                transactionCount: summary.transactionCount,
                byCategory:       summary.categoryBreakdown,
                budget:           budgetData
            };
        }

        case 'get_period_summary': {
            const { start_month, end_month } = args;
            if (!start_month || !end_month) throw new Error('start_month and end_month are required');
            return Transaction.getPeriodSummary(userId, start_month, end_month);
        }

        case 'get_category_history': {
            const { category, start_month, end_month } = args;
            if (!category || !start_month || !end_month)
                throw new Error('category, start_month and end_month are required');
            return Transaction.getCategoryHistory(userId, category, start_month, end_month);
        }

        case 'get_annual_breakdown': {
            const year = args.year || new Date().getFullYear();
            return Transaction.getAnnualBreakdown(userId, year);
        }

        case 'get_savings_history': {
            return Transaction.getSavingsHistory(userId);
        }

        case 'get_recent_transactions': {
            const filters = { limit: Math.min(parseInt(args.limit) || 20, 50) };
            if (args.month)    filters.month    = args.month;
            if (args.category) filters.category = args.category;
            const txns = await Transaction.findByUserId(userId, filters);
            return txns.map(t => ({
                date:        typeof t.date.toISOString === 'function'
                    ? t.date.toISOString().slice(0, 10)
                    : String(t.date).slice(0, 10),
                amount:      parseFloat(t.amount),
                category:    t.category,
                description: t.description || null
            }));
        }

        case 'compare_two_periods': {
            const { period1_start, period1_end, period2_start, period2_end } = args;
            if (!period1_start || !period1_end || !period2_start || !period2_end)
                throw new Error('All four period arguments are required');
            return Transaction.comparePeriods(userId, period1_start, period1_end, period2_start, period2_end);
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// USER INDEX BUILDER
// Lightweight orientation context — tells the AI what data exists
// WITHOUT pre-loading all the data (data comes via tool calls)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a lightweight "index" of the user's financial universe.
 * @param {number} userId
 * @returns {Promise<object>}
 */
async function buildUserIndex(userId) {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [user, rangeResult] = await Promise.all([
        User.findById(userId),
        Transaction.getDataRange(userId)
    ]);

    const range = rangeResult || {};

    return {
        income:            user ? parseFloat(user.monthly_income) : 0,
        currentMonth,
        currentYear:       now.getFullYear(),
        earliestMonth:     range.earliest_month || currentMonth,
        latestMonth:       range.latest_month   || currentMonth,
        totalTransactions: range.total_transactions || 0,
        categories:        range.categories || 'None'
    };
}

/**
 * Build the advisor system prompt, injecting the user index.
 * @param {object} index - Result of buildUserIndex()
 * @returns {string}
 */
function buildAdvisorSystemPrompt(index) {
    return `You are an expert Personal Financial Advisor with direct access to this user's financial database via tools.

USER CONTEXT:
- Monthly Income: ₹${index.income.toLocaleString('en-IN')}
- Current Date: ${index.currentMonth}
- Available Records: ${index.earliestMonth} to ${index.latestMonth} (${index.totalTransactions} transactions total)
- Active Categories: ${index.categories}

YOUR TOOLS (Call them to fetch exact numbers before answering):
• get_monthly_summary(month)
• get_period_summary(start_month, end_month)
• get_category_history(category, start, end)
• get_annual_breakdown(year)
• get_savings_history()
• get_recent_transactions(month?, category?, limit?)
• compare_two_periods(p1s, p1e, p2s, p2e)

ADVISOR PHILOSOPHY & INSTRUCTIONS:
1. **Dynamic & Contextual**:
   - Answer the user's specific question directly. If asked about Food, focus on Food. If asked about a 4-month summary, focus on that period. If asked "Can I afford X?", calculate affordability.
   - Do NOT repeat canned scripts, robotic mantras, or generic boilerplate. Tailor your diagnosis and action plan specifically to what the user's data shows.
2. **Real Solutions with Exact Numbers**:
   - Never say vague things like "try to spend less", "continue to monitor", "consider setting a budget", or "delving into".
   - State exact figures: calculate real averages, pinpoint exact anomalies, and propose concrete caps or targets in Rupees (₹).
3. **Clean Visual Scannability**:
   - Avoid long walls of text. Format your response so it is effortless to scan.
   - Use concise headings (\`###\` or \`####\`) for sections.
   - For summary metrics, you can use a piped format like:
     **Metric A:** ₹X | **Metric B:** ₹Y | **Metric C:** ₹Z
   - Use bullet points (\`*\` or \`-\`) for breakdowns, accompanied by clear icons where appropriate:
     🚨 for serious concerns/spikes, ⚠️ for warnings, ✅ for wins/positive habits.
   - When prescribing solutions, use numbered steps (\`1.\`, \`2.\`, \`3.\`) with bold titles and exact rupee targets.
   - Use callouts with \`💡\` for key takeaways or tips, and \`🎯\` for targets.

4. **DATE ACCURACY & "THIS MONTH" CLARITY**:
   - The current calendar date is ${index.currentMonth}.
   - The user's latest recorded transaction in the database is from ${index.latestMonth}.
   - If the user asks for "this month" or "current month":
     - Check if ${index.currentMonth} has any transactions.
     - If ${index.currentMonth} has 0 transactions logged yet, clearly state:
       "You have no transactions logged yet for this month (${index.currentMonth})."
     - Then explain that you are analyzing their latest recorded data from ${index.latestMonth} so they have a relevant baseline to review.
     - NEVER silently substitute ${index.latestMonth} and pretend it is the current month without explaining the gap.
`;
}

module.exports = {
    TOOL_DECLARATIONS,
    executeToolCall,
    buildUserIndex,
    buildAdvisorSystemPrompt
};
