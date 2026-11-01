/**
 * Budget Model
 * Handles database operations for the budgets table
 */
const pool = require('../config/db');

const Budget = {
    /**
     * Create or update a budget for a specific month and category
     * @param {number} userId
     * @param {string} month - Format: YYYY-MM
     * @param {Array} allocations - Array of { category, amount }
     */
    async upsert(userId, month, allocations) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            
            for (const { category, amount } of allocations) {
                await connection.execute(
                    `INSERT INTO budgets (user_id, month, category, budget_amount) 
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE budget_amount = VALUES(budget_amount)`,
                    [userId, month, category || 'All', amount]
                );
            }
            
            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    },

    /**
     * Get all budgets for a specific user and month
     * @param {number} userId
     * @param {string} month - Format: YYYY-MM
     * @returns {Array} Array of budgets for that month
     */
    async findByUserAndMonth(userId, month) {
        const [rows] = await pool.execute(
            'SELECT * FROM budgets WHERE user_id = ? AND month = ?',
            [userId, month]
        );
        return rows;
    },

    /**
     * Get all budgets for a user (for history)
     * @param {number} userId
     * @returns {Array}
     */
    async findAllByUser(userId) {
        const [rows] = await pool.execute(
            'SELECT * FROM budgets WHERE user_id = ? ORDER BY month DESC, category ASC',
            [userId]
        );
        return rows;
    }
};

module.exports = Budget;
