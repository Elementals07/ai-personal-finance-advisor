/**
 * Data Processing Service
 * Aggregates and summarizes raw financial data from MySQL.
 *
 * Only processed/summarised data is sent to Gemini — never raw transaction logs.
 *
 * Key additions over the original:
 *  - getCategoryBaseline  → 3-month per-category rolling average
 *  - getMicroLeakage      → detect small repeated drains (chai, quick buys)
 *  - buildDeltaMatrix     → categorise each spend bucket as spike / normal / saving
 *  - computeHealthSignal  → green / yellow / red overall status
 *  - formatForHumanAdvisorPrompt → ultra-dense token-efficient context for Gemini
 */
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const User = require('../models/User');
const crypto = require('crypto');

// ─── Category Classification ──────────────────────────────────────────────────
// Categories treated as fixed / unavoidable costs (Needs)
const ESSENTIAL_CATEGORIES = new Set([
    'Rent', 'Groceries', 'Utilities', 'Health', 'Education',
    'Food', 'Bills', 'Insurance', 'EMI', 'Medical'
]);

/**
 * Return 'Essential' or 'Discretionary' for a category name.
 * @param {string} category
 * @returns {'Essential'|'Discretionary'}
 */
function classifyCategory(category) {
    return ESSENTIAL_CATEGORIES.has(category) ? 'Essential' : 'Discretionary';
}

const DataProcessingService = {
    /**
     * Generate a complete financial summary for a user.
     * Now includes:
     *   - 3-month per-category historical baseline
     *   - Category delta matrix (spike / saving / normal flags)
     *   - Micro-leakage detection
     *   - Needs vs Wants split
     *   - Overall health signal (green / yellow / red)
     *
     * @param {number} userId
     * @param {string|null} month     - Format: YYYY-MM (defaults to current month)
     * @param {string}      timeframe - 'Today' | 'This Week' | 'This Month' | 'All'
     * @returns {object} Structured financial summary
     */
    async generateFinancialSummary(userId, month = null, timeframe = 'All', period = 'month') {
        // Default to current month
        if (!month) {
            const now = new Date();
            month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }

        // ── Fetch raw data in parallel ────────────────────────────────────────
        const [
            user,
            monthlySummary,
            trends,
            budget,
            categoryBaseline,
            microLeakage,
            prevSummary
        ] = await Promise.all([
            User.findById(userId),
            Transaction.getMonthlySummary(userId, month),
            Transaction.getMonthlyTrend(userId, 6),
            Budget.findByUserAndMonth(userId, month),
            Transaction.getCategoryBaseline(userId, month, 3),
            Transaction.getMicroLeakage(userId, month, 300, 4),
            (async () => {
                const prevMonthDate = new Date(month + '-01');
                prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
                const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
                return Transaction.getMonthlySummary(userId, prevMonth);
            })()
        ]);

        // ── Budget rows (findByUserAndMonth returns an array) ─────────────────
        const budgetRows = Array.isArray(budget) ? budget : (budget ? [budget] : []);
        const overallRow = budgetRows.find(b => b.category === 'All') || null;
        const savedIncome = user ? parseFloat(user.monthly_income) : 0;
        const budgetAmount = overallRow
            ? parseFloat(overallRow.budget_amount)
            : (savedIncome > 0 ? savedIncome : null);

        // ── Month pacing ──────────────────────────────────────────────────────
        const [yearStr, monthStr] = month.split('-');
        const parsedYear  = parseInt(yearStr, 10);
        const parsedMonth = parseInt(monthStr, 10);
        const daysInMonth = new Date(parsedYear, parsedMonth, 0).getDate();

        const now = new Date();
        let currentDay;
        if (now.getFullYear() === parsedYear && (now.getMonth() + 1) === parsedMonth) {
            currentDay = now.getDate();
        } else if (new Date(parsedYear, parsedMonth - 1, 1) < now) {
            currentDay = daysInMonth; // past month → fully elapsed
        } else {
            currentDay = 1; // future month
        }

        // ── Budget status ─────────────────────────────────────────────────────
        let pacingMetrics  = null;
        if (budgetAmount) {
            const idealDailySpend  = budgetAmount / daysInMonth;
            const actualDailySpend = currentDay > 0
                ? (monthlySummary.totalSpending / currentDay)
                : 0;
            const pacingRatio = idealDailySpend > 0
                ? (actualDailySpend / idealDailySpend)
                : 0;

            pacingMetrics = {
                daysInMonth,
                currentDay,
                idealDailySpend:  Math.round(idealDailySpend),
                actualDailySpend: Math.round(actualDailySpend),
                pacingRatio:      parseFloat(pacingRatio.toFixed(2)),
                isReckless:       pacingRatio > 1.25,
                projectedMonthEnd: Math.round(actualDailySpend * daysInMonth)
            };
        }

        const budgetStatus = budgetAmount
            ? {
                budgetSet:    true,
                budgetAmount,
                spent:        monthlySummary.totalSpending,
                remaining:    budgetAmount - monthlySummary.totalSpending,
                percentUsed:  Math.round((monthlySummary.totalSpending / budgetAmount) * 100),
                isOverBudget: monthlySummary.totalSpending > budgetAmount,
                pacing:       pacingMetrics
            }
            : { budgetSet: false };

        // ── Period view support (quarter / year analysis) ─────────────────────
        const isPeriodView = period === 'quarter' || period === 'year';
        let effectiveSummary = {
            totalSpending:     monthlySummary.totalSpending,
            transactionCount:  monthlySummary.transactionCount,
            categoryBreakdown: monthlySummary.categoryBreakdown
        };
        let periodLabel = month;
        if (isPeriodView) {
            const [py, pm] = month.split('-').map(Number);
            let startMonth;
            if (period === 'quarter') {
                const sd = new Date(py, pm - 3, 1);
                startMonth = `${sd.getFullYear()}-${String(sd.getMonth() + 1).padStart(2, '0')}`;
            } else {
                startMonth = `${py}-01`;
            }
            const periodData = await Transaction.getPeriodSummary(userId, startMonth, month);
            periodLabel = `${startMonth} to ${month}`;
            effectiveSummary = {
                totalSpending:     periodData.totalSpent,
                transactionCount:  periodData.transactionCount,
                categoryBreakdown: periodData.byCategory.map(c => ({
                    category: c.category,
                    total:    c.total,
                    count:    c.count
                }))
            };
        }

        // ── Month-over-month ──────────────────────────────────────────────────
        const monthOverMonth = !isPeriodView && prevSummary.totalSpending > 0
            ? Math.round(
                ((effectiveSummary.totalSpending - prevSummary.totalSpending)
                    / prevSummary.totalSpending) * 100
              )
            : null;

        // ── Category spending map ─────────────────────────────────────────────
        const categorySpending = {};
        effectiveSummary.categoryBreakdown.forEach(item => {
            categorySpending[item.category] = item.total;
        });

        // ── Delta matrix ──────────────────────────────────────────────────────
        // Build a per-category object that includes the historical baseline and
        // flags significant deviations.
        const baselineMap = {};
        categoryBaseline.forEach(b => {
            baselineMap[b.category] = b;
        });

        const deltaMatrix = effectiveSummary.categoryBreakdown.map(item => {
            // Period views have no per-month baseline; classification only.
            const baseline = isPeriodView ? null : baselineMap[item.category];
            const avgSpent = baseline && !isPeriodView ? baseline.avgSpent : null;

            let changePercent = null;
            let flag = 'new'; // no historical data
            if (avgSpent !== null && avgSpent > 0) {
                changePercent = Math.round(((item.total - avgSpent) / avgSpent) * 100);
                if (changePercent >= 50)      flag = 'major_spike';
                else if (changePercent >= 25) flag = 'spike';
                else if (changePercent <= -20) flag = 'saving';
                else                           flag = 'normal';
            }

            return {
                category:        item.category,
                current:         item.total,
                baseline:        avgSpent,
                changePercent,
                flag,
                classification:  classifyCategory(item.category),
                count:           item.count,
                baselineMonths:  baseline ? baseline.monthsWithData : 0
            };
        });

        // ── Needs vs Wants split ──────────────────────────────────────────────
        let needsTotal = 0;
        let wantsTotal = 0;
        deltaMatrix.forEach(d => {
            if (d.classification === 'Essential') needsTotal += d.current;
            else wantsTotal += d.current;
        });

        // ── Health signal ─────────────────────────────────────────────────────
        const monthlyIncome = user ? parseFloat(user.monthly_income) : 0;
        const savingsRate   = monthlyIncome > 0
            ? Math.round(((monthlyIncome - monthlySummary.totalSpending) / monthlyIncome) * 100)
            : null;

        const hasMajorSpike  = deltaMatrix.some(d => d.flag === 'major_spike');
        const hasSpike       = deltaMatrix.some(d => d.flag === 'spike');
        const isOverBudget   = budgetStatus.isOverBudget;
        const isReckless     = pacingMetrics?.isReckless;

        let healthSignal;
        if (isOverBudget || hasMajorSpike || isReckless || (savingsRate !== null && savingsRate < 0)) {
            healthSignal = 'red';
        } else if (hasSpike || (savingsRate !== null && savingsRate < 15) || monthOverMonth > 20) {
            healthSignal = 'yellow';
        } else {
            healthSignal = 'green';
        }

        // ── Optional: exact transactions for timeframe-specific queries ───────
        let recentTransactions = [];
        if (timeframe !== 'All') {
            const getLocalDateString = (d) => {
                const tz = new Date(d);
                tz.setMinutes(tz.getMinutes() - tz.getTimezoneOffset());
                return tz.toISOString().slice(0, 10);
            };
            const filters = {};
            if (timeframe === 'Today') {
                const today = getLocalDateString(now);
                filters.startDate = today;
                filters.endDate   = today;
            } else if (timeframe === 'This Week') {
                const dow = now.getDay();
                const start = new Date(now);
                start.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
                const end = new Date(start);
                end.setDate(start.getDate() + 6);
                filters.startDate = getLocalDateString(start);
                filters.endDate   = getLocalDateString(end);
            } else if (timeframe === 'This Month') {
                filters.month = month;
            }
            filters.limit = 50; // tighter cap — summary replaces raw dumps
            recentTransactions = await Transaction.findByUserId(userId, filters);
        }

        // ── Top category ──────────────────────────────────────────────────────
        const topCategory = monthlySummary.categoryBreakdown[0] || null;

        return {
            month,
            monthlyIncome,
            totalSpending:      monthlySummary.totalSpending,
            transactionCount:   monthlySummary.transactionCount,
            categorySpending,
            categoryBreakdown:  monthlySummary.categoryBreakdown,
            deltaMatrix,
            microLeakage,
            needsTotal,
            wantsTotal,
            budgetStatus,
            trends,
            topCategory:        topCategory ? topCategory.category : 'None',
            topCategoryAmount:  topCategory ? topCategory.total    : 0,
            monthOverMonthChange: monthOverMonth,
            savingsRate,
            healthSignal,       // 'green' | 'yellow' | 'red'
            recentTransactions,
            timeframe
        };
    },

    /**
     * Generate a SHA-256 hash of the financial summary for cache invalidation.
     * @param {object} summary
     * @returns {string}
     */
    hashSummary(summary) {
        const dataString = JSON.stringify({
            totalSpending:    summary.totalSpending,
            categorySpending: summary.categorySpending,
            transactionCount: summary.transactionCount,
            monthlyIncome:    summary.monthlyIncome,
            healthSignal:     summary.healthSignal,
            timeframe:        summary.timeframe,
            txsHash:          summary.recentTransactions.map(t => t.id).join(',')
        });
        return crypto.createHash('sha256').update(dataString).digest('hex');
    },

    /**
     * Ultra-dense, token-efficient prompt context block for the human advisor AI.
     *
     * Design principles:
     *  - Pre-compute all comparisons here in Node.js (zero token cost)
     *  - Give Gemini CONCLUSIONS, not raw numbers to re-derive
     *  - Hard limit: keep under ~250 tokens of context text
     *  - Surface anomalies explicitly so the model can't miss them
     *
     * @param {object} summary
     * @returns {string}
     */
    formatForHumanAdvisorPrompt(summary) {
        const inc   = summary.monthlyIncome;
        const spent = summary.totalSpending;
        const sr    = summary.savingsRate;
        const lines = [];

        // ── Line 1: Snapshot ─────────────────────────────────────────────────
        lines.push(`[SNAPSHOT] ${summary.month} | Inc:₹${fmt(inc)} | Spent:₹${fmt(spent)} | SaveRate:${sr !== null ? sr + '%' : 'N/A'} | Txns:${summary.transactionCount} | Status:${summary.healthSignal.toUpperCase()}`);

        // ── Line 2: Budget / Pacing ──────────────────────────────────────────
        if (summary.budgetStatus.budgetSet) {
            const b = summary.budgetStatus;
            const p = b.pacing;
            const overUnder = b.isOverBudget ? `OVER by ₹${fmt(Math.abs(b.remaining))}` : `₹${fmt(b.remaining)} left`;
            lines.push(`[BUDGET] ₹${fmt(b.budgetAmount)} budget | ${b.percentUsed}% used | ${overUnder}${p ? ` | Day ${p.currentDay}/${p.daysInMonth} | ActualDaily:₹${p.actualDailySpend} vs Ideal:₹${p.idealDailySpend}${p.isReckless ? ' ⚠ RECKLESS_PACE' : ''}` : ''}`);
        } else {
            lines.push(`[BUDGET] No budget set`);
        }

        // ── Line 3: 50/30/20 benchmark ───────────────────────────────────────
        if (inc > 0) {
            lines.push(`[50/30/20] Needs:₹${fmt(Math.round(inc * 0.5))} Wants:₹${fmt(Math.round(inc * 0.3))} Savings:₹${fmt(Math.round(inc * 0.2))} | Actual Needs:₹${fmt(Math.round(summary.needsTotal))} Wants:₹${fmt(Math.round(summary.wantsTotal))}`);
        }

        // ── Line 4: MoM change ───────────────────────────────────────────────
        if (summary.monthOverMonthChange !== null) {
            const dir = summary.monthOverMonthChange > 0 ? '▲' : '▼';
            lines.push(`[MOM] Spending ${dir}${Math.abs(summary.monthOverMonthChange)}% vs last month`);
        }

        // ── Category delta matrix (the core signal) ──────────────────────────
        const spikes  = summary.deltaMatrix.filter(d => d.flag === 'major_spike' || d.flag === 'spike');
        const savings = summary.deltaMatrix.filter(d => d.flag === 'saving');
        const normal  = summary.deltaMatrix.filter(d => d.flag === 'normal' || d.flag === 'new');

        lines.push(`[CATEGORY ANALYSIS vs 3-month average]`);

        spikes.forEach(d => {
            const baseline = d.baseline !== null ? `₹${fmt(Math.round(d.baseline))} avg` : 'no history';
            lines.push(`  ${d.flag === 'major_spike' ? '🔴' : '🟡'} ${d.category}: ₹${fmt(d.current)} (+${d.changePercent}% vs ${baseline}) [${d.classification}]`);
        });

        savings.forEach(d => {
            lines.push(`  🟢 ${d.category}: ₹${fmt(d.current)} (${d.changePercent}% vs ₹${fmt(Math.round(d.baseline))} avg) — GOOD`);
        });

        normal.forEach(d => {
            const base = d.baseline !== null ? ` (avg ₹${fmt(Math.round(d.baseline))})` : ' (first month)';
            lines.push(`  ✅ ${d.category}: ₹${fmt(d.current)}${base} [${d.classification}]`);
        });

        // ── Micro-leakage ────────────────────────────────────────────────────
        if (summary.microLeakage && summary.microLeakage.length > 0) {
            lines.push(`[MICRO-LEAKAGE] Small repeated expenses silently draining budget:`);
            summary.microLeakage.forEach(m => {
                lines.push(`  ⚠ ${m.category}: ₹${fmt(m.total)} across ${m.frequency} small txns (avg ₹${Math.round(m.avgAmount)} each)`);
            });
        }

        // ── 6-month trend (compact) ──────────────────────────────────────────
        if (summary.trends.length > 0) {
            const trendStr = summary.trends.map(t => `${t.month}:₹${fmt(t.total)}`).join(' ');
            lines.push(`[6M TREND] ${trendStr}`);
        }

        // ── Timeframe-specific exact transactions (only when user asked) ──────
        if (summary.recentTransactions && summary.recentTransactions.length > 0) {
            lines.push(`[EXACT TXS — ${summary.timeframe.toUpperCase()}]`);
            summary.recentTransactions.forEach(t => {
                const d = new Date(t.date).toISOString().slice(0, 10);
                lines.push(`  ${d} ₹${t.amount} ${t.category}${t.description ? ' "' + t.description + '"' : ''}`);
            });
        }

        return lines.join('\n');
    },

    /**
     * Legacy formatter — kept for backward compatibility with any code
     * that still references formatForPrompt directly.
     * Delegates to the new human-advisor formatter.
     * @param {object} summary
     * @returns {string}
     */
    formatForPrompt(summary) {
        return this.formatForHumanAdvisorPrompt(summary);
    }
};

/** Format a number with Indian locale grouping (no decimals for prompt brevity) */
function fmt(n) {
    return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

module.exports = DataProcessingService;

