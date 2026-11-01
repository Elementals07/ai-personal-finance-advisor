/**
 * Transaction Model
 * Handles all database operations for the transactions (expenses) table
 */
const pool = require('../config/db');

const Transaction = {
    /**
     * Create a new transaction
     * @param {object} data - Transaction data
     * @returns {object} Insert result
     */
    async create({ userId, amount, category, description, date }) {
        const [result] = await pool.execute(
            'INSERT INTO transactions (user_id, amount, category, description, date) VALUES (?, ?, ?, ?, ?)',
            [userId, amount, category, description || null, date]
        );
        const created = { id: result.insertId, userId, amount, category, description, date };
        // Keep historical snapshot in sync
        const month = date.slice(0, 7); // 'YYYY-MM'
        await this.refreshSnapshot(userId, month, category);
        return created;
    },

    /**
     * Create multiple transactions at once (e.g. from an itemized scanned bill)
     * Keeps category snapshots in sync for each unique month/category.
     * @param {number} userId
     * @param {Array<{ amount, category, description, date }>} items
     * @returns {Array<object>} Created transactions
     */
    async createBatch(userId, items) {
        const created = [];
        const snapshotsToRefresh = new Set();

        for (const item of items) {
            const [result] = await pool.execute(
                'INSERT INTO transactions (user_id, amount, category, description, date) VALUES (?, ?, ?, ?, ?)',
                [userId, item.amount, item.category, item.description || null, item.date]
            );
            created.push({ id: result.insertId, userId, ...item });
            const month = item.date.slice(0, 7);
            snapshotsToRefresh.add(`${month}:${item.category}`);
        }

        // Refresh all affected monthly category snapshots
        for (const key of snapshotsToRefresh) {
            const [month, cat] = key.split(':');
            await this.refreshSnapshot(userId, month, cat);
        }

        return created;
    },

    /**
     * Find all transactions for a user with optional filters
     * @param {number} userId
     * @param {object} filters - { month: 'YYYY-MM', category: string, limit: number, offset: number }
     * @returns {Array} List of transactions
     */
    async findByUserId(userId, filters = {}) {
        let query = 'SELECT * FROM transactions WHERE user_id = ?';
        const params = [userId];

        // Filter by month (YYYY-MM)
        if (filters.month) {
            query += ' AND DATE_FORMAT(date, "%Y-%m") = ?';
            params.push(filters.month);
        }

        // Filter by category
        if (filters.category) {
            query += ' AND category = ?';
            params.push(filters.category);
        }

        // Filter by date range
        if (filters.startDate) {
            query += ' AND date >= ?';
            params.push(filters.startDate);
        }
        if (filters.endDate) {
            query += ' AND date <= ?';
            params.push(filters.endDate);
        }

        query += ' ORDER BY date DESC, created_at DESC';

        // Pagination
        if (filters.limit) {
            const limitVal = parseInt(filters.limit);
            if (!isNaN(limitVal)) {
                query += ` LIMIT ${limitVal}`;
                if (filters.offset) {
                    const offsetVal = parseInt(filters.offset);
                    if (!isNaN(offsetVal)) {
                        query += ` OFFSET ${offsetVal}`;
                    }
                }
            }
        }

        const [rows] = await pool.execute(query, params);
        return rows;
    },

    /**
     * Find a single transaction by ID (with ownership check)
     * @param {number} id - Transaction ID
     * @param {number} userId - Owner's user ID
     * @returns {object|null}
     */
    async findById(id, userId) {
        const [rows] = await pool.execute(
            'SELECT * FROM transactions WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        return rows[0] || null;
    },

    /**
     * Update a transaction
     * @param {number} id - Transaction ID
     * @param {number} userId - Owner's user ID
     * @param {object} data - Fields to update
     * @returns {object} Update result
     */
    async update(id, userId, { amount, category, description, date }) {
        // Fetch existing row to refresh old snapshot bucket if date/category changed
        const existing = await this.findById(id, userId);

        const [result] = await pool.execute(
            `UPDATE transactions 
             SET amount = COALESCE(?, amount), 
                 category = COALESCE(?, category), 
                 description = COALESCE(?, description), 
                 date = COALESCE(?, date)
             WHERE id = ? AND user_id = ?`,
            [amount, category, description, date, id, userId]
        );

        // Refresh snapshots for old and new period/category
        if (existing) {
            const oldMonth = existing.date.toISOString
                ? existing.date.toISOString().slice(0, 7)
                : String(existing.date).slice(0, 7);
            await this.refreshSnapshot(userId, oldMonth, existing.category);
            // Also refresh new category/month if they changed
            const newMonth  = (date  || existing.date).toString().slice(0, 7);
            const newCat    = category || existing.category;
            if (newMonth !== oldMonth || newCat !== existing.category) {
                await this.refreshSnapshot(userId, newMonth, newCat);
            }
        }

        return result;
    },

    /**
     * Delete a transaction
     * @param {number} id - Transaction ID
     * @param {number} userId - Owner's user ID
     * @returns {object} Delete result
     */
    async delete(id, userId) {
        const existing = await this.findById(id, userId);

        const [result] = await pool.execute(
            'DELETE FROM transactions WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        // Refresh snapshot for the deleted transaction's period
        if (existing) {
            const month = existing.date.toISOString
                ? existing.date.toISOString().slice(0, 7)
                : String(existing.date).slice(0, 7);
            await this.refreshSnapshot(userId, month, existing.category);
        }

        return result;
    },

    /**
     * Get spending summary for a specific month
     * Returns total spending and per-category breakdown
     * @param {number} userId
     * @param {string} month - Format: YYYY-MM
     * @returns {object} Summary object
     */
    async getMonthlySummary(userId, month) {
        // Total spending for the month
        const [totalRows] = await pool.execute(
            `SELECT COALESCE(SUM(amount), 0) as total_spending, COUNT(*) as transaction_count
             FROM transactions 
             WHERE user_id = ? AND DATE_FORMAT(date, "%Y-%m") = ?`,
            [userId, month]
        );

        // Per-category breakdown
        const [categoryRows] = await pool.execute(
            `SELECT category, SUM(amount) as total, COUNT(*) as count
             FROM transactions 
             WHERE user_id = ? AND DATE_FORMAT(date, "%Y-%m") = ?
             GROUP BY category
             ORDER BY total DESC`,
            [userId, month]
        );

        return {
            totalSpending: parseFloat(totalRows[0].total_spending),
            transactionCount: totalRows[0].transaction_count,
            categoryBreakdown: categoryRows.map(r => ({
                category: r.category,
                total: parseFloat(r.total),
                count: r.count
            }))
        };
    },

    /**
     * Get monthly spending trends for the last N months
     * @param {number} userId
     * @param {number} months - Number of months to look back (default 6)
     * @returns {Array} Monthly totals
     */
    async getMonthlyTrend(userId, months = 60) {
        const [rows] = await pool.execute(
            `SELECT DATE_FORMAT(date, "%Y-%m") as month, SUM(amount) as total
             FROM transactions
             WHERE user_id = ? AND date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
             GROUP BY DATE_FORMAT(date, "%Y-%m")
             ORDER BY month ASC`,
            [userId, months]
        );
        return rows.map(r => ({
            month: r.month,
            total: parseFloat(r.total)
        }));
    },

    /**
     * Get daily spending for a specific month
     * @param {number} userId
     * @param {string} month - Format: YYYY-MM
     * @returns {Array} Daily totals
     */
    async getDailySpending(userId, month) {
        const [rows] = await pool.execute(
            `SELECT DATE_FORMAT(date, "%Y-%m-%d") as day, SUM(amount) as total
             FROM transactions
             WHERE user_id = ? AND DATE_FORMAT(date, "%Y-%m") = ?
             GROUP BY date
             ORDER BY date ASC`,
            [userId, month]
        );
        return rows.map(r => ({
            day: r.day,
            total: parseFloat(r.total)
        }));
    }, // Add missing brace and comma

    /**
     * Get savings history (Income vs Expenses) by month
     * @param {number} userId
     * @returns {Array} Monthly savings data
     */
    /**
     * Upsert the monthly category snapshot whenever a transaction changes.
     * Called internally by create / update / delete so the snapshot table
     * always reflects the current state of the transactions table.
     * @param {number} userId
     * @param {string} month - Format: YYYY-MM
     * @param {string} category
     */
    async refreshSnapshot(userId, month, category) {
        // Query the aggregate first to strictly satisfy ONLY_FULL_GROUP_BY in MySQL 8+/9+
        const [aggRows] = await pool.execute(
            `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
             FROM transactions
             WHERE user_id = ? AND DATE_FORMAT(date, '%Y-%m') = ? AND category = ?`,
            [userId, month, category]
        );

        const totalSpent = aggRows[0] ? parseFloat(aggRows[0].total) : 0;
        const count = aggRows[0] ? parseInt(aggRows[0].count, 10) : 0;

        await pool.execute(
            `INSERT INTO category_historical_snapshots
                 (user_id, period_type, period_id, category, total_spent, transaction_count)
             VALUES (?, 'month', ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                 total_spent       = VALUES(total_spent),
                 transaction_count = VALUES(transaction_count),
                 updated_at        = CURRENT_TIMESTAMP`,
            [userId, month, category, totalSpent, count]
        );
    },

    /**
     * Get per-category 3-month rolling baseline (excludes currentMonth).
     * Uses the pre-aggregated snapshot table for speed.
     * @param {number} userId
     * @param {string} currentMonth - Format: YYYY-MM (excluded from baseline)
     * @param {number} months       - How many prior months to average (default 3)
     * @returns {Array<{ category, avgSpent, maxSpent, monthsWithData }>}
     */
    async getCategoryBaseline(userId, currentMonth, months = 3) {
        const [rows] = await pool.execute(
            `SELECT category,
                    AVG(total_spent)       AS avg_spent,
                    MAX(total_spent)       AS max_spent,
                    COUNT(*)               AS months_with_data
             FROM category_historical_snapshots
             WHERE user_id      = ?
               AND period_type  = 'month'
               AND period_id    < ?
               AND period_id   >= DATE_FORMAT(
                       DATE_SUB(STR_TO_DATE(CONCAT(?, '-01'), '%Y-%m-%d'), INTERVAL ? MONTH),
                       '%Y-%m')
             GROUP BY category`,
            [userId, currentMonth, currentMonth, months]
        );
        return rows.map(r => ({
            category:       r.category,
            avgSpent:       parseFloat(r.avg_spent),
            maxSpent:       parseFloat(r.max_spent),
            monthsWithData: parseInt(r.months_with_data, 10)
        }));
    },

    /**
     * Detect micro-leakage: small repeated expenses that quietly drain
     * budget (e.g. chai, quick food, impulse small buys < ₹threshold).
     * @param {number} userId
     * @param {string} month      - Format: YYYY-MM
     * @param {number} threshold  - Max single-transaction amount to qualify (default ₹300)
     * @param {number} minCount   - Minimum frequency to flag (default 4)
     * @returns {Array<{ category, frequency, total, avgAmount }>}
     */
    async getMicroLeakage(userId, month, threshold = 300, minCount = 4) {
        const [rows] = await pool.execute(
            `SELECT category,
                    COUNT(*)     AS frequency,
                    SUM(amount)  AS total,
                    AVG(amount)  AS avg_amount
             FROM transactions
             WHERE user_id = ?
               AND DATE_FORMAT(date, '%Y-%m') = ?
               AND amount <= ?
             GROUP BY category
             HAVING frequency >= ?
             ORDER BY total DESC`,
            [userId, month, threshold, minCount]
        );
        return rows.map(r => ({
            category:  r.category,
            frequency: parseInt(r.frequency, 10),
            total:     parseFloat(r.total),
            avgAmount: parseFloat(r.avg_amount)
        }));
    },

    /**
     * Get the available data range and category list for a user.
     * Used to build the AI's "index" — lightweight orientation context.
     * @param {number} userId
     * @returns {object} { earliestMonth, latestMonth, categories, totalTransactions }
     */
    async getDataRange(userId) {
        const pool = require('../config/db');
        const [rows] = await pool.execute(
            `SELECT
                MIN(DATE_FORMAT(date, '%Y-%m'))                                  AS earliest_month,
                MAX(DATE_FORMAT(date, '%Y-%m'))                                  AS latest_month,
                COUNT(*)                                                          AS total_transactions,
                GROUP_CONCAT(DISTINCT category ORDER BY category SEPARATOR ', ')  AS categories
             FROM transactions
             WHERE user_id = ?`,
            [userId]
        );
        return rows[0];
    },

    /**
     * Aggregate spending across a multi-month range.
     * Returns month-by-month totals AND category totals for the whole period.
     * @param {number} userId
     * @param {string} startMonth - YYYY-MM (inclusive)
     * @param {string} endMonth   - YYYY-MM (inclusive)
     */
    async getPeriodSummary(userId, startMonth, endMonth) {
        const [monthRows] = await pool.execute(
            `SELECT DATE_FORMAT(date, '%Y-%m') AS month,
                    SUM(amount)                AS total,
                    COUNT(*)                   AS count
             FROM transactions
             WHERE user_id = ?
               AND DATE_FORMAT(date, '%Y-%m') >= ?
               AND DATE_FORMAT(date, '%Y-%m') <= ?
             GROUP BY DATE_FORMAT(date, '%Y-%m')
             ORDER BY month ASC`,
            [userId, startMonth, endMonth]
        );

        const [catRows] = await pool.execute(
            `SELECT category,
                    SUM(amount)  AS total,
                    COUNT(*)     AS count
             FROM transactions
             WHERE user_id = ?
               AND DATE_FORMAT(date, '%Y-%m') >= ?
               AND DATE_FORMAT(date, '%Y-%m') <= ?
             GROUP BY category
             ORDER BY total DESC`,
            [userId, startMonth, endMonth]
        );

        const grandTotal = catRows.reduce((s, r) => s + parseFloat(r.total), 0);

        return {
            period:           `${startMonth} to ${endMonth}`,
            totalSpent:       parseFloat(grandTotal.toFixed(2)),
            transactionCount: monthRows.reduce((s, r) => s + r.count, 0),
            byMonth:          monthRows.map(r => ({
                month: r.month,
                total: parseFloat(r.total),
                count: r.count
            })),
            byCategory: catRows.map(r => ({
                category:   r.category,
                total:      parseFloat(r.total),
                count:      r.count,
                percentage: grandTotal > 0 ? Math.round((parseFloat(r.total) / grandTotal) * 100) : 0
            }))
        };
    },

    /**
     * Month-by-month history for ONE category across a date range.
     * Answers questions like "how much did I spend on Food this year?"
     * @param {number} userId
     * @param {string} category
     * @param {string} startMonth - YYYY-MM
     * @param {string} endMonth   - YYYY-MM
     */
    async getCategoryHistory(userId, category, startMonth, endMonth) {
        const [rows] = await pool.execute(
            `SELECT DATE_FORMAT(date, '%Y-%m') AS month,
                    SUM(amount)                AS total,
                    COUNT(*)                   AS count,
                    AVG(amount)                AS avg_txn,
                    MIN(amount)                AS min_txn,
                    MAX(amount)                AS max_txn
             FROM transactions
             WHERE user_id = ?
               AND category = ?
               AND DATE_FORMAT(date, '%Y-%m') >= ?
               AND DATE_FORMAT(date, '%Y-%m') <= ?
             GROUP BY DATE_FORMAT(date, '%Y-%m')
             ORDER BY month ASC`,
            [userId, category, startMonth, endMonth]
        );

        const totals     = rows.map(r => parseFloat(r.total));
        const grandTotal = totals.reduce((s, t) => s + t, 0);
        const avg        = totals.length > 0 ? grandTotal / totals.length : 0;

        const highestMonth = rows.length > 0
            ? rows.reduce((a, b) => parseFloat(a.total) > parseFloat(b.total) ? a : b)
            : null;
        const lowestMonth = rows.length > 0
            ? rows.reduce((a, b) => parseFloat(a.total) < parseFloat(b.total) ? a : b)
            : null;

        return {
            category,
            period:         `${startMonth} to ${endMonth}`,
            grandTotal:     parseFloat(grandTotal.toFixed(2)),
            monthlyAverage: parseFloat(avg.toFixed(2)),
            activeMonths:   rows.length,
            highestMonth:   highestMonth
                ? { month: highestMonth.month, total: parseFloat(highestMonth.total) }
                : null,
            lowestMonth:    lowestMonth
                ? { month: lowestMonth.month, total: parseFloat(lowestMonth.total) }
                : null,
            byMonth: rows.map(r => ({
                month:          r.month,
                total:          parseFloat(r.total),
                count:          r.count,
                avgTransaction: parseFloat(parseFloat(r.avg_txn).toFixed(2))
            }))
        };
    },

    /**
     * Full year breakdown — by month and by category.
     * @param {number} userId
     * @param {number} year
     */
    async getAnnualBreakdown(userId, year) {
        const [monthRows] = await pool.execute(
            `SELECT DATE_FORMAT(date, '%Y-%m') AS month,
                    SUM(amount)                AS total,
                    COUNT(*)                   AS count
             FROM transactions
             WHERE user_id = ? AND YEAR(date) = ?
             GROUP BY DATE_FORMAT(date, '%Y-%m')
             ORDER BY month ASC`,
            [userId, year]
        );

        const [catRows] = await pool.execute(
            `SELECT category,
                    SUM(amount)  AS total,
                    COUNT(*)     AS count
             FROM transactions
             WHERE user_id = ? AND YEAR(date) = ?
             GROUP BY category
             ORDER BY total DESC`,
            [userId, year]
        );

        const annualTotal = catRows.reduce((s, r) => s + parseFloat(r.total), 0);

        const highestMonth = monthRows.length > 0
            ? monthRows.reduce((a, b) => parseFloat(a.total) > parseFloat(b.total) ? a : b)
            : null;
        const lowestMonth = monthRows.length > 0
            ? monthRows.reduce((a, b) => parseFloat(a.total) < parseFloat(b.total) ? a : b)
            : null;

        return {
            year,
            annualTotal:  parseFloat(annualTotal.toFixed(2)),
            activeMonths: monthRows.length,
            highestMonth: highestMonth ? { month: highestMonth.month, total: parseFloat(highestMonth.total) } : null,
            lowestMonth:  lowestMonth  ? { month: lowestMonth.month,  total: parseFloat(lowestMonth.total)  } : null,
            byMonth:    monthRows.map(r => ({ month: r.month, total: parseFloat(r.total), count: r.count })),
            byCategory: catRows.map(r => ({
                category:   r.category,
                total:      parseFloat(r.total),
                count:      r.count,
                percentage: annualTotal > 0 ? Math.round((parseFloat(r.total) / annualTotal) * 100) : 0
            }))
        };
    },

    /**
     * Side-by-side comparison of two date ranges.
     * Answers "compare my spending in Jan-Mar vs Apr-Jun" questions.
     * @param {number} userId
     * @param {string} p1Start  - YYYY-MM
     * @param {string} p1End    - YYYY-MM
     * @param {string} p2Start  - YYYY-MM
     * @param {string} p2End    - YYYY-MM
     */
    async comparePeriods(userId, p1Start, p1End, p2Start, p2End) {
        const [p1, p2] = await Promise.all([
            this.getPeriodSummary(userId, p1Start, p1End),
            this.getPeriodSummary(userId, p2Start, p2End)
        ]);

        // Build unified category comparison
        const catMap = {};
        p1.byCategory.forEach(c => {
            catMap[c.category] = { category: c.category, period1: c.total, period2: 0 };
        });
        p2.byCategory.forEach(c => {
            if (!catMap[c.category]) catMap[c.category] = { category: c.category, period1: 0, period2: c.total };
            else catMap[c.category].period2 = c.total;
        });

        const categoryComparison = Object.values(catMap).map(c => ({
            ...c,
            changePercent: c.period1 > 0
                ? Math.round(((c.period2 - c.period1) / c.period1) * 100)
                : null
        })).sort((a, b) => b.period2 - a.period2);

        return {
            period1:      `${p1Start} to ${p1End}`,
            period2:      `${p2Start} to ${p2End}`,
            period1Total: p1.totalSpent,
            period2Total: p2.totalSpent,
            totalChange:  p1.totalSpent > 0
                ? Math.round(((p2.totalSpent - p1.totalSpent) / p1.totalSpent) * 100)
                : null,
            categoryComparison
        };
    },

    async getSavingsHistory(userId) {
        const [rows] = await pool.execute(
            `SELECT 
                t.month, 
                CAST(IFNULL(b.budget_amount, u.monthly_income) AS DECIMAL(12,2)) as income,
                CAST(t.total_spent AS DECIMAL(12,2)) as spent,
                CAST((IFNULL(b.budget_amount, u.monthly_income) - t.total_spent) AS DECIMAL(12,2)) as savings
             FROM (
                SELECT DATE_FORMAT(date, "%Y-%m") as month, SUM(amount) as total_spent
                FROM transactions
                WHERE user_id = ?
                GROUP BY DATE_FORMAT(date, "%Y-%m")
             ) t
             JOIN users u ON u.id = ?
             LEFT JOIN budgets b ON b.user_id = u.id AND b.month = t.month AND b.category = 'All'
             ORDER BY t.month DESC`,
            [userId, userId]
        );
        return rows.map(r => ({
            month: r.month,
            income: parseFloat(r.income),
            spent: parseFloat(r.spent),
            savings: parseFloat(r.savings)
        }));
    }
};

module.exports = Transaction;
