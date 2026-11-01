const pool = require('../config/db');

const Category = {
    /**
     * Find all categories available to a user (globals + their own)
     */
    async findByUserId(userId) {
        const [rows] = await pool.execute(
            'SELECT id, name, color, user_id FROM categories WHERE user_id IS NULL OR user_id = ? ORDER BY user_id DESC, id ASC',
            [userId]
        );
        return rows;
    },

    /**
     * Create a new custom category for a user
     */
    async create(userId, name, color) {
        const [result] = await pool.execute(
            'INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)',
            [userId, name, color]
        );
        return { id: result.insertId, user_id: userId, name, color };
    },

    /**
     * Delete a custom category
     */
    async delete(id, userId) {
        const [result] = await pool.execute(
            'DELETE FROM categories WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        return result.affectedRows > 0;
    },

    /**
     * Update an existing category (e.g. color)
     */
    async update(id, userId, color) {
        const [result] = await pool.execute(
            'UPDATE categories SET color = ? WHERE id = ? AND user_id = ?',
            [color, id, userId]
        );
        return result.affectedRows > 0;
    }
};

module.exports = Category;
