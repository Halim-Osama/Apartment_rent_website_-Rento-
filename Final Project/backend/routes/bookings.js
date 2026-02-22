const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/bookings - Create new booking
router.post('/', authenticateToken, async (req, res) => {
    try {
        const {
            apartment_id,
            start_date,
            end_date,
            name,
            email,
            phone
        } = req.body;

        // Validation
        if (!apartment_id || !start_date || !end_date || !name || !email || !phone) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Check apartment exists and is available
        const apartment = await db.getAsync('SELECT * FROM apartments WHERE id = ?', [apartment_id]);
        if (!apartment) {
            return res.status(404).json({
                success: false,
                message: 'Apartment not found'
            });
        }

        if (!apartment.available) {
            return res.status(400).json({
                success: false,
                message: 'Apartment is not available'
            });
        }

        // Validate dates
        const start = new Date(start_date);
        const end = new Date(end_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (start < today) {
            return res.status(400).json({
                success: false,
                message: 'Start date cannot be in the past'
            });
        }

        if (end <= start) {
            return res.status(400).json({
                success: false,
                message: 'End date must be after start date'
            });
        }

        // Check for overlapping bookings
        const overlapping = await db.getAsync(`
            SELECT id FROM bookings
            WHERE apartment_id = ?
            AND status != 'cancelled'
            AND ((start_date <= ? AND end_date >= ?) OR (start_date <= ? AND end_date >= ?) OR (start_date >= ? AND end_date <= ?))
        `, [apartment_id, start_date, start_date, end_date, end_date, start_date, end_date]);

        if (overlapping) {
            return res.status(400).json({
                success: false,
                message: 'This apartment is already booked for the selected dates'
            });
        }

        // Calculate total price (months * price)
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        const months = Math.ceil(days / 30);
        const total_price = months * apartment.price;

        // Create booking
        const result = await db.runAsync(`
            INSERT INTO bookings (user_id, apartment_id, start_date, end_date, name, email, phone, total_price, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `, [req.user.id, apartment_id, start_date, end_date, name, email, phone, total_price]);

        const booking = await db.getAsync(`
            SELECT b.*, a.title as apartment_title, a.location, a.region
            FROM bookings b
            JOIN apartments a ON b.apartment_id = a.id
            WHERE b.id = ?
        `, [result.lastID]);

        res.status(201).json({
            success: true,
            message: 'Booking created successfully',
            data: booking
        });
    } catch (error) {
        console.error('Create booking error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// GET /api/bookings - Get user's bookings
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { status } = req.query;

        let query = `
            SELECT b.*, a.title as apartment_title, a.location, a.region, a.image_url
            FROM bookings b
            JOIN apartments a ON b.apartment_id = a.id
            WHERE b.user_id = ?
        `;
        const params = [req.user.id];

        if (status) {
            query += ' AND b.status = ?';
            params.push(status);
        }

        query += ' ORDER BY b.created_at DESC';

        const bookings = await db.allAsync(query, params);

        res.json({
            success: true,
            count: bookings.length,
            data: bookings
        });
    } catch (error) {
        console.error('Get bookings error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// GET /api/bookings/:id - Get single booking
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const booking = await db.getAsync(`
            SELECT b.*, a.title as apartment_title, a.location, a.region,
                   a.image_url, a.price as monthly_price, a.description as apartment_description
            FROM bookings b
            JOIN apartments a ON b.apartment_id = a.id
            WHERE b.id = ? AND b.user_id = ?
        `, [id, req.user.id]);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        res.json({
            success: true,
            data: booking
        });
    } catch (error) {
        console.error('Get booking error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// PUT /api/bookings/:id/cancel - Cancel booking
router.put('/:id/cancel', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Check booking exists and belongs to user
        const booking = await db.getAsync('SELECT * FROM bookings WHERE id = ? AND user_id = ?', [id, req.user.id]);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        if (booking.status === 'cancelled') {
            return res.status(400).json({
                success: false,
                message: 'Booking is already cancelled'
            });
        }

        // Check if booking hasn't started yet
        const startDate = new Date(booking.start_date);
        if (startDate < new Date()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot cancel a booking that has already started'
            });
        }

        await db.runAsync(
            "UPDATE bookings SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [id]
        );

        res.json({
            success: true,
            message: 'Booking cancelled successfully'
        });
    } catch (error) {
        console.error('Cancel booking error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// PUT /api/bookings/:id/confirm - Confirm booking (owner only)
router.put('/:id/confirm', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Get booking with apartment owner
        const booking = await db.getAsync(`
            SELECT b.*, a.owner_id
            FROM bookings b
            JOIN apartments a ON b.apartment_id = a.id
            WHERE b.id = ?
        `, [id]);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        // Check if user is the apartment owner
        if (booking.owner_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Only the apartment owner can confirm bookings'
            });
        }

        if (booking.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Can only confirm pending bookings'
            });
        }

        await db.runAsync(
            "UPDATE bookings SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [id]
        );

        res.json({
            success: true,
            message: 'Booking confirmed successfully'
        });
    } catch (error) {
        console.error('Confirm booking error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

module.exports = router;
