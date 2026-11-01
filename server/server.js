/**
 * AI Personal Finance Advisor — Express Server
 * Main application entry point
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes
const authRoutes = require('./routes/authRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const budgetRoutes = require('./routes/budgetRoutes');
const aiRoutes = require('./routes/aiRoutes');
const categoryRoutes = require('./routes/categoryRoutes');

// Import middleware
const errorHandler = require('./middleware/errorHandler');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ───────────────────────────────────────────
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging in development
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`${req.method} ${req.path}`);
        next();
    });
}

// ─── API Routes ───────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/categories', categoryRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'AI Personal Finance Advisor API is running',
        timestamp: new Date().toISOString()
    });
});

// ─── Global Error Handler ─────────────────────────────────
app.use(errorHandler);

// ─── Start Server with Port Fallback ──────────────────────
const startServer = (port, retries = 10) => {
    const server = app.listen(port, () => {
        console.log(`\n🚀 Server running on http://localhost:${port}`);
        console.log(`📊 API Health: http://localhost:${port}/api/health`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && retries > 0) {
            console.log(`⚠️  Port ${port} is busy, trying ${port + 1}...`);
            server.close();
            startServer(port + 1, retries - 1);
        } else {
            console.error('❌ Failed to start server:', err.message);
            process.exit(1);
        }
    });
};

startServer(parseInt(PORT));

module.exports = app;
