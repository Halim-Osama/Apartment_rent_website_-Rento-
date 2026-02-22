const express = require('express');
const db = require('../db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/apartments - Get all apartments with filters
router.get('/', optionalAuth, async (req, res) => {
    try {
        const {
            city,
            region,
            minPrice,
            maxPrice,
            bedrooms,
            bathrooms,
            available,
            sortBy = 'newest'
        } = req.query;

        let query = `
            SELECT a.*,
                   COALESCE(AVG(r.rating), 0) as rating,
                   COUNT(r.id) as review_count
            FROM apartments a
            LEFT JOIN reviews r ON a.id = r.apartment_id
            WHERE 1=1
        `;
        const params = [];

        // Apply filters
        if (city) {
            query += ' AND LOWER(a.location) = LOWER(?)';
            params.push(city);
        }

        if (region) {
            query += ' AND LOWER(a.region) LIKE LOWER(?)';
            params.push(`%${region}%`);
        }

        if (minPrice) {
            query += ' AND a.price >= ?';
            params.push(parseInt(minPrice));
        }

        if (maxPrice) {
            query += ' AND a.price <= ?';
            params.push(parseInt(maxPrice));
        }

        if (bedrooms) {
            query += ' AND a.bedrooms >= ?';
            params.push(parseInt(bedrooms));
        }

        if (bathrooms) {
            query += ' AND a.bathrooms >= ?';
            params.push(parseInt(bathrooms));
        }

        if (available === 'true' || available === '1') {
            query += ' AND a.available = 1';
        }

        query += ' GROUP BY a.id';

        // Apply sorting
        switch (sortBy) {
            case 'price-low':
                query += ' ORDER BY a.price ASC';
                break;
            case 'price-high':
                query += ' ORDER BY a.price DESC';
                break;
            case 'rating':
                query += ' ORDER BY rating DESC';
                break;
            case 'newest':
            default:
                query += ' ORDER BY a.created_at DESC';
        }

        const apartments = await db.allAsync(query, params);

        // If user is authenticated, mark favorites
        if (req.user) {
            const favorites = await db.allAsync(
                'SELECT apartment_id FROM favorites WHERE user_id = ?',
                [req.user.id]
            );
            const favoriteIds = favorites.map(f => f.apartment_id);

            apartments.forEach(apt => {
                apt.favorite = favoriteIds.includes(apt.id);
            });
        }

        res.json({
            success: true,
            count: apartments.length,
            data: apartments
        });
    } catch (error) {
        console.error('Get apartments error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// GET /api/apartments/:id - Get single apartment
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const apartment = await db.getAsync(`
            SELECT a.*,
                   COALESCE(AVG(r.rating), 0) as rating,
                   COUNT(r.id) as review_count
            FROM apartments a
            LEFT JOIN reviews r ON a.id = r.apartment_id
            WHERE a.id = ?
            GROUP BY a.id
        `, [id]);

        if (!apartment) {
            return res.status(404).json({
                success: false,
                message: 'Apartment not found'
            });
        }

        // Get reviews
        const reviews = await db.allAsync(`
            SELECT r.*, u.name as user_name
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.apartment_id = ?
            ORDER BY r.created_at DESC
        `, [id]);

        apartment.reviews = reviews;

        // Check if favorite (if authenticated)
        if (req.user) {
            const favorite = await db.getAsync(
                'SELECT id FROM favorites WHERE user_id = ? AND apartment_id = ?',
                [req.user.id, id]
            );
            apartment.favorite = !!favorite;
        }

        res.json({
            success: true,
            data: apartment
        });
    } catch (error) {
        console.error('Get apartment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// POST /api/apartments - Create new apartment (requires auth)
router.post('/', authenticateToken, async (req, res) => {
    try {
        const {
            title,
            description,
            price,
            location,
            region,
            address,
            bedrooms,
            bathrooms,
            area,
            lat,
            lng,
            image_url
        } = req.body;

        // Validation
        if (!title || !price || !location || !region) {
            return res.status(400).json({
                success: false,
                message: 'Title, price, location, and region are required'
            });
        }

        const result = await db.runAsync(`
            INSERT INTO apartments (
                owner_id, title, description, price, location, region,
                address, bedrooms, bathrooms, area, lat, lng, image_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            req.user.id,
            title,
            description || null,
            price,
            location,
            region,
            address || null,
            bedrooms || 1,
            bathrooms || 1,
            area || null,
            lat || null,
            lng || null,
            image_url || null
        ]);

        const apartment = await db.getAsync('SELECT * FROM apartments WHERE id = ?', [result.lastID]);

        res.status(201).json({
            success: true,
            message: 'Apartment created successfully',
            data: apartment
        });
    } catch (error) {
        console.error('Create apartment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// PUT /api/apartments/:id - Update apartment (owner only)
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Check ownership
        const apartment = await db.getAsync('SELECT owner_id FROM apartments WHERE id = ?', [id]);
        if (!apartment) {
            return res.status(404).json({
                success: false,
                message: 'Apartment not found'
            });
        }

        if (apartment.owner_id && apartment.owner_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this apartment'
            });
        }

        const {
            title,
            description,
            price,
            location,
            region,
            address,
            bedrooms,
            bathrooms,
            area,
            lat,
            lng,
            available,
            image_url
        } = req.body;

        await db.runAsync(`
            UPDATE apartments SET
                title = COALESCE(?, title),
                description = COALESCE(?, description),
                price = COALESCE(?, price),
                location = COALESCE(?, location),
                region = COALESCE(?, region),
                address = COALESCE(?, address),
                bedrooms = COALESCE(?, bedrooms),
                bathrooms = COALESCE(?, bathrooms),
                area = COALESCE(?, area),
                lat = COALESCE(?, lat),
                lng = COALESCE(?, lng),
                available = COALESCE(?, available),
                image_url = COALESCE(?, image_url),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            title, description, price, location, region,
            address, bedrooms, bathrooms, area, lat, lng,
            available, image_url, id
        ]);

        const updated = await db.getAsync('SELECT * FROM apartments WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Apartment updated successfully',
            data: updated
        });
    } catch (error) {
        console.error('Update apartment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// DELETE /api/apartments/:id - Delete apartment (owner only)
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Check ownership
        const apartment = await db.getAsync('SELECT owner_id FROM apartments WHERE id = ?', [id]);
        if (!apartment) {
            return res.status(404).json({
                success: false,
                message: 'Apartment not found'
            });
        }

        if (apartment.owner_id && apartment.owner_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this apartment'
            });
        }

        // Delete related records first
        await db.runAsync('DELETE FROM reviews WHERE apartment_id = ?', [id]);
        await db.runAsync('DELETE FROM favorites WHERE apartment_id = ?', [id]);
        await db.runAsync('DELETE FROM bookings WHERE apartment_id = ?', [id]);
        await db.runAsync('DELETE FROM apartments WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Apartment deleted successfully'
        });
    } catch (error) {
        console.error('Delete apartment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

module.exports = router;
