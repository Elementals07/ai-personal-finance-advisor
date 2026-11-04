/**
 * AI Routes
 * /api/ai
 */
const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const auth = require('../middleware/auth');

// All AI routes require authentication
router.use(auth);

router.get('/config', aiController.config);
router.post('/analyze', aiController.analyze);
router.post('/chat', aiController.chat);
router.post('/scan-bill', aiController.scanBill);
router.post('/parse-sms', aiController.parseSms);

module.exports = router;
