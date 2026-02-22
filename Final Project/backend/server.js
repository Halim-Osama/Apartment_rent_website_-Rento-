const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes
const usersRoutes = require('./routes/users');
const apartmentsRoutes = require('./routes/apartments');
const bookingsRoutes = require('./routes/bookings');
const reviewsRoutes = require('./routes/reviews');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// API Routes
app.use('/api/users', usersRoutes);
app.use('/api/apartments', apartmentsRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/reviews', reviewsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Rento API is running',
        timestamp: new Date().toISOString()
    });
});

// Serve static files from frontend (optional - for production)
app.use(express.static(path.join(__dirname, '..')));

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`
    ================================
    Rento API Server
    ================================
    Status: Running
    Port: ${PORT}
    Time: ${new Date().toISOString()}

    Endpoints:
    - GET  /api/health
    - POST /api/users/register
    - POST /api/users/login
    - GET  /api/users/profile
    - GET  /api/apartments
    - GET  /api/apartments/:id
    - POST /api/bookings
    - GET  /api/reviews/apartment/:id
    ================================
    `);
});

module.exports = app;
