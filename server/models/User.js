/**
 * User Model
 * Handles all database operations for the users table
 */
const pool = require('../config/db');

const User = {
    /**
     * Create a new user
     * @param {string} name - User's full name
     * @param {string} email - User's email address
     * @param {string} passwordHash - Bcrypt hashed password
     * @returns {object} Insert result with insertId
     */
    async create(name, email, passwordHash) {
        const [result] = await pool.execute(
            'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
            [name, email, passwordHash]
        );
        return result;
    },

    /**
     * Find user by email address
     * @param {string} email
     * @returns {object|null} User record or null
     */
    async findByEmail(email) {
        const [rows] = await pool.execute(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        return rows[0] || null;
    },

    /**
     * Find user by ID (excludes password hash)
     * @param {number} id
     * @returns {object|null} User record or null
     */
    async findById(id) {
        const [rows] = await pool.execute(
            'SELECT id, name, email, monthly_income, created_at FROM users WHERE id = ?',
            [id]
        );
        return rows[0] || null;
    },

    /**
     * Update user's monthly income
     * @param {number} id - User ID
     * @param {number} monthlyIncome - New monthly income value
     */
    async updateProfile(id, { name, monthlyIncome }) {
        const fields = [];
        const values = [];

        if (name !== undefined) {
            fields.push('name = ?');
            values.push(name);
        }
        if (monthlyIncome !== undefined) {
            fields.push('monthly_income = ?');
            values.push(monthlyIncome);
        }

        if (fields.length === 0) return;

        values.push(id);
        await pool.execute(
            `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
    }
};

module.exports = User;
