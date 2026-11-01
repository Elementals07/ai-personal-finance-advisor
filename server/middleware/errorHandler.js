/**
 * Global Error Handler Middleware
 * Catches all unhandled errors and returns structured JSON responses
 */
const errorHandler = (err, req, res, next) => {
    console.error('🔴 Error:', err.message);
    console.error(err.stack);

    // MySQL duplicate entry error
    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
            success: false,
            message: 'Duplicate entry. This record already exists.'
        });
    }

    // Validation errors from express-validator
    if (err.type === 'validation') {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: err.errors
        });
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'Invalid token.'
        });
    }

    // Default server error
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        message: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;
