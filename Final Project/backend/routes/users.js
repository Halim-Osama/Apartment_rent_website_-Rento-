const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticateToken, generateToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/users/register - Register new user
router.post('/register', async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Name, email, and password are required'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters'
            });
        }

        // Check if email already exists
        const existingUser = await db.getAsync('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Email already registered'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user
        const result = await db.runAsync(
            'INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)',
            [name, email, phone || null, hashedPassword]
        );

        const user = {
            id: result.lastID,
            name,
            email,
            phone
        };

        // Generate token
        const token = generateToken(user);

        res.status(201).json({
            success: true,
            message: 'Registration successful',
            data: {
                user,
                token
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during registration'
        });
    }
});

// POST /api/users/login - Login user
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find user
        const user = await db.getAsync('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Generate token
        const token = generateToken({
            id: user.id,
            email: user.email,
            name: user.name
        });

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone
                },
                token
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login'
        });
    }
});

// GET /api/users/profile - Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const user = await db.getAsync(
            'SELECT id, name, email, phone, created_at FROM users WHERE id = ?',
            [req.user.id]
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// PUT /api/users/profile - Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { name, phone } = req.body;

        await db.runAsync(
            'UPDATE users SET name = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [name, phone, req.user.id]
        );

        const user = await db.getAsync(
            'SELECT id, name, email, phone, created_at FROM users WHERE id = ?',
            [req.user.id]
        );

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: user
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// POST /api/users/favorites/:apartmentId - Add to favorites
router.post('/favorites/:apartmentId', authenticateToken, async (req, res) => {
    try {
        const { apartmentId } = req.params;

        // Check if apartment exists
        const apartment = await db.getAsync('SELECT id FROM apartments WHERE id = ?', [apartmentId]);
        if (!apartment) {
            return res.status(404).json({
                success: false,
                message: 'Apartment not found'
            });
        }

        // Add to favorites
        try {
            await db.runAsync(
                'INSERT INTO favorites (user_id, apartment_id) VALUES (?, ?)',
                [req.user.id, apartmentId]
            );
        } catch (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({
                    success: false,
                    message: 'Already in favorites'
                });
            }
            throw err;
        }

        res.status(201).json({
            success: true,
            message: 'Added to favorites'
        });
    } catch (error) {
        console.error('Add favorite error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// DELETE /api/users/favorites/:apartmentId - Remove from favorites
router.delete('/favorites/:apartmentId', authenticateToken, async (req, res) => {
    try {
        const { apartmentId } = req.params;

        const result = await db.runAsync(
            'DELETE FROM favorites WHERE user_id = ? AND apartment_id = ?',
            [req.user.id, apartmentId]
        );

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'Favorite not found'
            });
        }

        res.json({
            success: true,
            message: 'Removed from favorites'
        });
    } catch (error) {
        console.error('Remove favorite error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// GET /api/users/favorites - Get user's favorites
router.get('/favorites', authenticateToken, async (req, res) => {
    try {
        const favorites = await db.allAsync(`
            SELECT a.*,
                   COALESCE(AVG(r.rating), 0) as rating,
                   COUNT(r.id) as review_count
            FROM favorites f
            JOIN apartments a ON f.apartment_id = a.id
            LEFT JOIN reviews r ON a.id = r.apartment_id
            WHERE f.user_id = ?
            GROUP BY a.id
            ORDER BY f.created_at DESC
        `, [req.user.id]);

        res.json({
            success: true,
            data: favorites
        });
    } catch (error) {
        console.error('Get favorites error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

module.exports = router;
