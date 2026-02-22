const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/reviews/apartment/:apartmentId - Get reviews for an apartment
router.get('/apartment/:apartmentId', async (req, res) => {
    try {
        const { apartmentId } = req.params;

        // Check apartment exists
        const apartment = await db.getAsync('SELECT id FROM apartments WHERE id = ?', [apartmentId]);
        if (!apartment) {
            return res.status(404).json({
                success: false,
                message: 'Apartment not found'
            });
        }

        const reviews = await db.allAsync(`
            SELECT r.*, u.name as user_name
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.apartment_id = ?
            ORDER BY r.created_at DESC
        `, [apartmentId]);

        // Calculate average rating
        const stats = await db.getAsync(`
            SELECT
                COUNT(*) as total_reviews,
                COALESCE(AVG(rating), 0) as average_rating
            FROM reviews WHERE apartment_id = ?
        `, [apartmentId]);

        res.json({
            success: true,
            data: {
                reviews,
                stats: {
                    total_reviews: stats.total_reviews,
                    average_rating: Math.round(stats.average_rating * 10) / 10
                }
            }
        });
    } catch (error) {
        console.error('Get reviews error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// POST /api/reviews - Create new review
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { apartment_id, rating, comment } = req.body;

        // Validation
        if (!apartment_id || !rating) {
            return res.status(400).json({
                success: false,
                message: 'Apartment ID and rating are required'
            });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be between 1 and 5'
            });
        }

        // Check apartment exists
        const apartment = await db.getAsync('SELECT id FROM apartments WHERE id = ?', [apartment_id]);
        if (!apartment) {
            return res.status(404).json({
                success: false,
                message: 'Apartment not found'
            });
        }

        // Check if user has already reviewed this apartment
        const existingReview = await db.getAsync(
            'SELECT id FROM reviews WHERE user_id = ? AND apartment_id = ?',
            [req.user.id, apartment_id]
        );

        if (existingReview) {
            return res.status(409).json({
                success: false,
                message: 'You have already reviewed this apartment. Please update your existing review.'
            });
        }

        // Create review
        const result = await db.runAsync(
            'INSERT INTO reviews (user_id, apartment_id, rating, comment) VALUES (?, ?, ?, ?)',
            [req.user.id, apartment_id, rating, comment || null]
        );

        const review = await db.getAsync(`
            SELECT r.*, u.name as user_name
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.id = ?
        `, [result.lastID]);

        res.status(201).json({
            success: true,
            message: 'Review created successfully',
            data: review
        });
    } catch (error) {
        console.error('Create review error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// PUT /api/reviews/:id - Update review
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, comment } = req.body;

        // Check review exists and belongs to user
        const review = await db.getAsync('SELECT * FROM reviews WHERE id = ?', [id]);

        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        if (review.user_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this review'
            });
        }

        if (rating && (rating < 1 || rating > 5)) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be between 1 and 5'
            });
        }

        await db.runAsync(
            'UPDATE reviews SET rating = COALESCE(?, rating), comment = COALESCE(?, comment) WHERE id = ?',
            [rating, comment, id]
        );

        const updated = await db.getAsync(`
            SELECT r.*, u.name as user_name
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.id = ?
        `, [id]);

        res.json({
            success: true,
            message: 'Review updated successfully',
            data: updated
        });
    } catch (error) {
        console.error('Update review error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// DELETE /api/reviews/:id - Delete review
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Check review exists and belongs to user
        const review = await db.getAsync('SELECT * FROM reviews WHERE id = ?', [id]);

        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        if (review.user_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this review'
            });
        }

        await db.runAsync('DELETE FROM reviews WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Review deleted successfully'
        });
    } catch (error) {
        console.error('Delete review error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// GET /api/reviews/user - Get current user's reviews
router.get('/user', authenticateToken, async (req, res) => {
    try {
        const reviews = await db.allAsync(`
            SELECT r.*, a.title as apartment_title, a.location, a.region
            FROM reviews r
            JOIN apartments a ON r.apartment_id = a.id
            WHERE r.user_id = ?
            ORDER BY r.created_at DESC
        `, [req.user.id]);

        res.json({
            success: true,
            count: reviews.length,
            data: reviews
        });
    } catch (error) {
        console.error('Get user reviews error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

module.exports = router;
