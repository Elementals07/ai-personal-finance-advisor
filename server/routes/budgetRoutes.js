/**
 * Budget Routes
 * /api/budgets
 */
const express = require('express');
const router = express.Router();
const budgetController = require('../controllers/budgetController');
const auth = require('../middleware/auth');

// All budget routes require authentication
router.use(auth);

router.get('/', budgetController.get);
router.post('/', budgetController.set);
router.get('/history', budgetController.history);

module.exports = router;
