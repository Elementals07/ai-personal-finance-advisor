/**
 * Expense Routes
 * /api/expenses
 */
const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const auth = require('../middleware/auth');

// All expense routes require authentication
router.use(auth);

// Summary must be before :id to avoid route conflict
router.get('/summary', expenseController.summary);
router.get('/savings', expenseController.savings);

router.get('/', expenseController.list);
router.post('/batch', expenseController.createBatch);
router.post('/', expenseController.create);
router.put('/:id', expenseController.update);
router.delete('/:id', expenseController.delete);

module.exports = router;
