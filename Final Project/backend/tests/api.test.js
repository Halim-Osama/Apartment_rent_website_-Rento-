const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create test database
const testDbPath = path.join(__dirname, 'test.db');
const db = new sqlite3.Database(testDbPath);

// Promisify database methods
db.runAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
        this.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
};

db.getAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
        this.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

db.allAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
        this.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
};

// JWT Secret
const JWT_SECRET = 'test-secret-key';

// Create Express app for testing
const app = express();
app.use(express.json());

// Auth middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Access token required' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Invalid token' });
        req.user = user;
        next();
    });
}

function generateToken(user) {
    return jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '1h' });
}

// Routes
app.post('/api/users/register', async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }
        const existing = await db.getAsync('SELECT id FROM users WHERE email = ?', [email]);
        if (existing) {
            return res.status(409).json({ success: false, message: 'Email already registered' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await db.runAsync(
            'INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)',
            [name, email, phone || null, hashedPassword]
        );
        const user = { id: result.lastID, name, email, phone };
        const token = generateToken(user);
        res.status(201).json({ success: true, message: 'Registration successful', data: { user, token } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/users/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }
        const user = await db.getAsync('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }
        const token = generateToken({ id: user.id, email: user.email, name: user.name });
        res.json({ success: true, data: { user: { id: user.id, name: user.name, email: user.email }, token } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const user = await db.getAsync('SELECT id, name, email, phone FROM users WHERE id = ?', [req.user.id]);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/apartments', async (req, res) => {
    try {
        const apartments = await db.allAsync('SELECT * FROM apartments');
        res.json({ success: true, count: apartments.length, data: apartments });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/apartments/:id', async (req, res) => {
    try {
        const apartment = await db.getAsync('SELECT * FROM apartments WHERE id = ?', [req.params.id]);
        if (!apartment) return res.status(404).json({ success: false, message: 'Apartment not found' });
        res.json({ success: true, data: apartment });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/bookings', authenticateToken, async (req, res) => {
    try {
        const { apartment_id, start_date, end_date, name, email, phone } = req.body;
        if (!apartment_id || !start_date || !end_date || !name || !email || !phone) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }
        const apartment = await db.getAsync('SELECT * FROM apartments WHERE id = ?', [apartment_id]);
        if (!apartment) {
            return res.status(404).json({ success: false, message: 'Apartment not found' });
        }
        if (!apartment.available) {
            return res.status(400).json({ success: false, message: 'Apartment is not available' });
        }
        const start = new Date(start_date);
        const end = new Date(end_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (start < today) {
            return res.status(400).json({ success: false, message: 'Start date cannot be in the past' });
        }
        if (end <= start) {
            return res.status(400).json({ success: false, message: 'End date must be after start date' });
        }
        const overlapping = await db.getAsync(`
            SELECT id FROM bookings WHERE apartment_id = ? AND status != 'cancelled'
            AND ((start_date <= ? AND end_date >= ?) OR (start_date <= ? AND end_date >= ?) OR (start_date >= ? AND end_date <= ?))
        `, [apartment_id, start_date, start_date, end_date, end_date, start_date, end_date]);
        if (overlapping) {
            return res.status(400).json({ success: false, message: 'Apartment already booked for selected dates' });
        }
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        const months = Math.ceil(days / 30);
        const total_price = months * apartment.price;
        const result = await db.runAsync(
            `INSERT INTO bookings (user_id, apartment_id, start_date, end_date, name, email, phone, total_price, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [req.user.id, apartment_id, start_date, end_date, name, email, phone, total_price]
        );
        res.status(201).json({ success: true, message: 'Booking created', data: { id: result.lastID, total_price } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/users/favorites/:apartmentId', authenticateToken, async (req, res) => {
    try {
        const { apartmentId } = req.params;
        const apartment = await db.getAsync('SELECT id FROM apartments WHERE id = ?', [apartmentId]);
        if (!apartment) return res.status(404).json({ success: false, message: 'Apartment not found' });
        try {
            await db.runAsync('INSERT INTO favorites (user_id, apartment_id) VALUES (?, ?)', [req.user.id, apartmentId]);
        } catch (err) {
            if (err.message.includes('UNIQUE')) {
                return res.status(409).json({ success: false, message: 'Already in favorites' });
            }
            throw err;
        }
        res.status(201).json({ success: true, message: 'Added to favorites' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/reviews', authenticateToken, async (req, res) => {
    try {
        const { apartment_id, rating, comment } = req.body;
        if (!apartment_id || !rating) {
            return res.status(400).json({ success: false, message: 'Apartment ID and rating required' });
        }
        if (rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: 'Rating must be 1-5' });
        }
        const apartment = await db.getAsync('SELECT id FROM apartments WHERE id = ?', [apartment_id]);
        if (!apartment) return res.status(404).json({ success: false, message: 'Apartment not found' });
        const existing = await db.getAsync('SELECT id FROM reviews WHERE user_id = ? AND apartment_id = ?', [req.user.id, apartment_id]);
        if (existing) return res.status(409).json({ success: false, message: 'Already reviewed' });
        const result = await db.runAsync(
            'INSERT INTO reviews (user_id, apartment_id, rating, comment) VALUES (?, ?, ?, ?)',
            [req.user.id, apartment_id, rating, comment || null]
        );
        res.status(201).json({ success: true, data: { id: result.lastID } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Test setup and teardown
beforeAll(async () => {
    await new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, phone TEXT, password TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
            db.run('CREATE TABLE IF NOT EXISTS apartments (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id INTEGER, title TEXT NOT NULL, description TEXT, price INTEGER NOT NULL, location TEXT NOT NULL, region TEXT NOT NULL, address TEXT, bedrooms INTEGER DEFAULT 1, bathrooms INTEGER DEFAULT 1, area INTEGER, lat REAL, lng REAL, available INTEGER DEFAULT 1, image_url TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
            db.run('CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, apartment_id INTEGER NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL, status TEXT DEFAULT "pending", total_price INTEGER, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
            db.run('CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, apartment_id INTEGER NOT NULL, rating INTEGER NOT NULL, comment TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
            db.run('CREATE TABLE IF NOT EXISTS favorites (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, apartment_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, apartment_id))', resolve);
        });
    });
});

beforeEach(async () => {
    await db.runAsync('DELETE FROM favorites');
    await db.runAsync('DELETE FROM reviews');
    await db.runAsync('DELETE FROM bookings');
    await db.runAsync('DELETE FROM apartments');
    await db.runAsync('DELETE FROM users');

    // Reset auto-increment counters
    await db.runAsync('DELETE FROM sqlite_sequence');

    // Seed test data
    const hashedPassword = await bcrypt.hash('password123', 10);
    await db.runAsync('INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)', ['Test User', 'test@test.com', '01234567890', hashedPassword]);
    await db.runAsync('INSERT INTO apartments (title, price, location, region, available) VALUES (?, ?, ?, ?, ?)', ['Available Apt', 10000, 'Cairo', 'Heliopolis', 1]);
    await db.runAsync('INSERT INTO apartments (title, price, location, region, available) VALUES (?, ?, ?, ?, ?)', ['Unavailable Apt', 8000, 'Alex', 'Smouha', 0]);
    await db.runAsync('INSERT INTO apartments (title, price, location, region, available) VALUES (?, ?, ?, ?, ?)', ['Luxury Apt', 15000, 'Cairo', 'Zamalek', 1]);
});

afterAll(async () => {
    await new Promise(resolve => db.close(resolve));
    const fs = require('fs');
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
});

// ==================== TESTS ====================

describe('User Registration', () => {
    test('should register a new user successfully', async () => {
        const res = await request(app)
            .post('/api/users/register')
            .send({ name: 'New User', email: 'new@test.com', phone: '01111111111', password: 'password123' });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.token).toBeDefined();
        expect(res.body.data.user.email).toBe('new@test.com');
    });

    test('should reject registration with missing fields', async () => {
        const res = await request(app)
            .post('/api/users/register')
            .send({ name: 'Test', email: 'test2@test.com' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('should reject registration with short password', async () => {
        const res = await request(app)
            .post('/api/users/register')
            .send({ name: 'Test', email: 'test3@test.com', password: '123' });
        expect(res.status).toBe(400);
        expect(res.body.message).toContain('6 characters');
    });

    test('should reject duplicate email', async () => {
        const res = await request(app)
            .post('/api/users/register')
            .send({ name: 'Dup', email: 'test@test.com', password: 'password123' });
        expect(res.status).toBe(409);
        expect(res.body.message).toContain('already registered');
    });
});

describe('User Login', () => {
    test('should login with valid credentials', async () => {
        const res = await request(app)
            .post('/api/users/login')
            .send({ email: 'test@test.com', password: 'password123' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.token).toBeDefined();
    });

    test('should reject invalid email', async () => {
        const res = await request(app)
            .post('/api/users/login')
            .send({ email: 'wrong@test.com', password: 'password123' });
        expect(res.status).toBe(401);
        expect(res.body.message).toContain('Invalid');
    });

    test('should reject invalid password', async () => {
        const res = await request(app)
            .post('/api/users/login')
            .send({ email: 'test@test.com', password: 'wrongpassword' });
        expect(res.status).toBe(401);
        expect(res.body.message).toContain('Invalid');
    });

    test('should reject missing credentials', async () => {
        const res = await request(app)
            .post('/api/users/login')
            .send({ email: 'test@test.com' });
        expect(res.status).toBe(400);
    });
});

describe('User Profile', () => {
    let token;
    beforeEach(async () => {
        const res = await request(app).post('/api/users/login').send({ email: 'test@test.com', password: 'password123' });
        token = res.body.data.token;
    });

    test('should get profile with valid token', async () => {
        const res = await request(app)
            .get('/api/users/profile')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.data.email).toBe('test@test.com');
    });

    test('should reject without token', async () => {
        const res = await request(app).get('/api/users/profile');
        expect(res.status).toBe(401);
    });

    test('should reject with invalid token', async () => {
        const res = await request(app)
            .get('/api/users/profile')
            .set('Authorization', 'Bearer invalidtoken');
        expect(res.status).toBe(403);
    });
});

describe('Apartments', () => {
    test('should get all apartments', async () => {
        const res = await request(app).get('/api/apartments');
        expect(res.status).toBe(200);
        expect(res.body.count).toBe(3);
        expect(res.body.data).toHaveLength(3);
    });

    test('should get single apartment by id', async () => {
        const res = await request(app).get('/api/apartments/1');
        expect(res.status).toBe(200);
        expect(res.body.data.title).toBe('Available Apt');
    });

    test('should return 404 for non-existent apartment', async () => {
        const res = await request(app).get('/api/apartments/999');
        expect(res.status).toBe(404);
    });
});

describe('Bookings', () => {
    let token;
    beforeEach(async () => {
        const res = await request(app).post('/api/users/login').send({ email: 'test@test.com', password: 'password123' });
        token = res.body.data.token;
    });

    test('should create booking for available apartment', async () => {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 10);
        const endDate = new Date(futureDate);
        endDate.setDate(endDate.getDate() + 30);

        const res = await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${token}`)
            .send({
                apartment_id: 1,
                start_date: futureDate.toISOString().split('T')[0],
                end_date: endDate.toISOString().split('T')[0],
                name: 'Test User',
                email: 'test@test.com',
                phone: '01234567890'
            });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.total_price).toBe(10000);
    });

    test('should reject booking for unavailable apartment', async () => {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 10);
        const endDate = new Date(futureDate);
        endDate.setDate(endDate.getDate() + 30);

        const res = await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${token}`)
            .send({
                apartment_id: 2,
                start_date: futureDate.toISOString().split('T')[0],
                end_date: endDate.toISOString().split('T')[0],
                name: 'Test User',
                email: 'test@test.com',
                phone: '01234567890'
            });
        expect(res.status).toBe(400);
        expect(res.body.message).toContain('not available');
    });

    test('should reject booking with past start date', async () => {
        const res = await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${token}`)
            .send({
                apartment_id: 1,
                start_date: '2020-01-01',
                end_date: '2020-02-01',
                name: 'Test User',
                email: 'test@test.com',
                phone: '01234567890'
            });
        expect(res.status).toBe(400);
        expect(res.body.message).toContain('past');
    });

    test('should reject booking with end date before start date', async () => {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 30);
        const startDate = new Date(futureDate);
        startDate.setDate(startDate.getDate() + 10);

        const res = await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${token}`)
            .send({
                apartment_id: 1,
                start_date: startDate.toISOString().split('T')[0],
                end_date: futureDate.toISOString().split('T')[0],
                name: 'Test User',
                email: 'test@test.com',
                phone: '01234567890'
            });
        expect(res.status).toBe(400);
        expect(res.body.message).toContain('after start');
    });

    test('should reject overlapping bookings', async () => {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 10);
        const endDate = new Date(futureDate);
        endDate.setDate(endDate.getDate() + 30);

        // First booking
        await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${token}`)
            .send({
                apartment_id: 1,
                start_date: futureDate.toISOString().split('T')[0],
                end_date: endDate.toISOString().split('T')[0],
                name: 'Test User',
                email: 'test@test.com',
                phone: '01234567890'
            });

        // Overlapping booking
        const res = await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${token}`)
            .send({
                apartment_id: 1,
                start_date: futureDate.toISOString().split('T')[0],
                end_date: endDate.toISOString().split('T')[0],
                name: 'Test User',
                email: 'test@test.com',
                phone: '01234567890'
            });
        expect(res.status).toBe(400);
        expect(res.body.message).toContain('already booked');
    });

    test('should reject booking without auth', async () => {
        const res = await request(app)
            .post('/api/bookings')
            .send({ apartment_id: 1, start_date: '2025-12-26', end_date: '2026-01-26', name: 'Test', email: 'test@test.com', phone: '123' });
        expect(res.status).toBe(401);
    });
});

describe('Favorites', () => {
    let token;
    beforeEach(async () => {
        const res = await request(app).post('/api/users/login').send({ email: 'test@test.com', password: 'password123' });
        token = res.body.data.token;
    });

    test('should add apartment to favorites', async () => {
        const res = await request(app)
            .post('/api/users/favorites/1')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(201);
        expect(res.body.message).toContain('favorites');
    });

    test('should reject duplicate favorite', async () => {
        await request(app).post('/api/users/favorites/1').set('Authorization', `Bearer ${token}`);
        const res = await request(app).post('/api/users/favorites/1').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(409);
    });

    test('should reject favorite for non-existent apartment', async () => {
        const res = await request(app)
            .post('/api/users/favorites/999')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(404);
    });
});

describe('Reviews', () => {
    let token;
    beforeEach(async () => {
        const res = await request(app).post('/api/users/login').send({ email: 'test@test.com', password: 'password123' });
        token = res.body.data.token;
    });

    test('should create review', async () => {
        const res = await request(app)
            .post('/api/reviews')
            .set('Authorization', `Bearer ${token}`)
            .send({ apartment_id: 1, rating: 5, comment: 'Great place!' });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
    });

    test('should reject invalid rating', async () => {
        const res = await request(app)
            .post('/api/reviews')
            .set('Authorization', `Bearer ${token}`)
            .send({ apartment_id: 1, rating: 6 });
        expect(res.status).toBe(400);
        expect(res.body.message).toContain('1-5');
    });

    test('should reject duplicate review', async () => {
        await request(app).post('/api/reviews').set('Authorization', `Bearer ${token}`).send({ apartment_id: 1, rating: 5 });
        const res = await request(app)
            .post('/api/reviews')
            .set('Authorization', `Bearer ${token}`)
            .send({ apartment_id: 1, rating: 4 });
        expect(res.status).toBe(409);
    });

    test('should reject review for non-existent apartment', async () => {
        const res = await request(app)
            .post('/api/reviews')
            .set('Authorization', `Bearer ${token}`)
            .send({ apartment_id: 999, rating: 5 });
        expect(res.status).toBe(404);
    });
});
