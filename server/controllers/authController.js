/**
 * Auth Controller
 * Handles user registration, login, and profile management
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const {
    DEMO_EMAIL,
    ensureDemoUser,
    seedDemoData
} = require('../services/demoDataService');

// Validation rules
const registerValidation = [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

const loginValidation = [
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required')
];

/**
 * Generate JWT token for a user
 * @param {object} user - User object with id and email
 * @returns {string} JWT token
 */
const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
};

const authController = {
    /**
     * POST /api/auth/register
     * Register a new user account
     */
    register: [
        ...registerValidation,
        async (req, res, next) => {
            try {
                // Check validation errors
                const errors = validationResult(req);
                if (!errors.isEmpty()) {
                    return res.status(400).json({
                        success: false,
                        message: 'Validation failed',
                        errors: errors.array()
                    });
                }

                const { name, email, password } = req.body;

                // The demo identity is always reserved, even before the demo
                // user row is provisioned.
                if (String(email).toLowerCase() === DEMO_EMAIL) {
                    return res.status(409).json({
                        success: false,
                        message: 'That email is reserved for the demo account. Please use another address.'
                    });
                }

                // Check if user already exists
                const existingUser = await User.findByEmail(email);
                if (existingUser) {
                    const message = existingUser.is_demo == 1
                        ? 'That email is reserved for the demo account. Please use another address.'
                        : 'An account with this email already exists';
                    return res.status(409).json({
                        success: false,
                        message
                    });
                }

                // Hash password with bcryptjs (pure JS, no native addon)
                const salt = await bcrypt.genSalt(12);
                const passwordHash = await bcrypt.hash(password, salt);

                // Create user
                const result = await User.create(name, email, passwordHash);

                // Generate token
                const token = generateToken({ id: result.insertId, email });

                res.status(201).json({
                    success: true,
                    message: 'Account created successfully',
                    data: {
                        token,
                        user: {
                            id: result.insertId,
                            name,
                            email,
                            monthly_income: 0
                        }
                    }
                });
            } catch (error) {
                next(error);
            }
        }
    ],

    /**
     * POST /api/auth/login
     * Authenticate user and return JWT
     */
    login: [
        ...loginValidation,
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

                const { email, password } = req.body;

                // Find user
                const user = await User.findByEmail(email);
                if (!user) {
                    return res.status(401).json({
                        success: false,
                        message: 'Invalid email or password'
                    });
                }

                // Verify password
                const isMatch = await bcrypt.compare(password, user.password_hash);
                if (!isMatch) {
                    return res.status(401).json({
                        success: false,
                        message: 'Invalid email or password'
                    });
                }

                // Generate token
                const token = generateToken(user);

                res.json({
                    success: true,
                    message: 'Login successful',
                    data: {
                        token,
                        user: {
                            id: user.id,
                            name: user.name,
                            email: user.email,
                            monthly_income: parseFloat(user.monthly_income)
                        }
                    }
                });
            } catch (error) {
                next(error);
            }
        }
    ],

    /**
     * POST /api/auth/demo
     * Explicit demo login. Provisions the shared demo user (with sample data)
     * on first use and issues a real JWT scoped to the demo user id.
     */
    async demoLogin(req, res, next) {
        try {
            const demoUser = await ensureDemoUser();
            await seedDemoData(demoUser.id);

            const token = generateToken({ id: demoUser.id, email: DEMO_EMAIL });

            res.json({
                success: true,
                message: 'Logged in as demo user',
                data: {
                    token,
                    user: {
                        id: demoUser.id,
                        name: 'Elementals',
                        email: DEMO_EMAIL,
                        monthly_income: 65000,
                        is_demo: true
                    }
                }
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * GET /api/auth/me
     * Get current user profile
     */
    async getProfile(req, res, next) {
        try {
            const user = await User.findById(req.user.id);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            res.json({
                success: true,
                data: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    monthly_income: parseFloat(user.monthly_income),
                    is_demo: user.is_demo === 1 || user.is_demo === true,
                    created_at: user.created_at
                }
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * PUT /api/auth/profile
     * Update user profile (name, monthly income)
     */
    async updateProfile(req, res, next) {
        try {
            const { name, monthly_income } = req.body;

            await User.updateProfile(req.user.id, {
                name,
                monthlyIncome: monthly_income
            });

            const user = await User.findById(req.user.id);

            res.json({
                success: true,
                message: 'Profile updated successfully',
                data: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    monthly_income: parseFloat(user.monthly_income)
                }
            });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = authController;
