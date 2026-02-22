const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

// Use in-memory database for tests
const testDb = new sqlite3.Database(':memory:');

// Promisify database methods
testDb.runAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
        this.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
};

testDb.getAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
        this.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

testDb.allAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
        this.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
};

// Initialize test database
async function initTestDb() {
    return new Promise((resolve, reject) => {
        testDb.serialize(() => {
            testDb.run('PRAGMA foreign_keys = ON');

            testDb.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    phone TEXT,
                    password TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            testDb.run(`
                CREATE TABLE IF NOT EXISTS apartments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_id INTEGER,
                    title TEXT NOT NULL,
                    description TEXT,
                    price INTEGER NOT NULL,
                    location TEXT NOT NULL,
                    region TEXT NOT NULL,
                    address TEXT,
                    bedrooms INTEGER DEFAULT 1,
                    bathrooms INTEGER DEFAULT 1,
                    area INTEGER,
                    lat REAL,
                    lng REAL,
                    available INTEGER DEFAULT 1,
                    image_url TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (owner_id) REFERENCES users(id)
                )
            `);

            testDb.run(`
                CREATE TABLE IF NOT EXISTS bookings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    apartment_id INTEGER NOT NULL,
                    start_date DATE NOT NULL,
                    end_date DATE NOT NULL,
                    status TEXT DEFAULT 'pending',
                    total_price INTEGER,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    phone TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    FOREIGN KEY (apartment_id) REFERENCES apartments(id)
                )
            `);

            testDb.run(`
                CREATE TABLE IF NOT EXISTS reviews (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    apartment_id INTEGER NOT NULL,
                    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
                    comment TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    FOREIGN KEY (apartment_id) REFERENCES apartments(id)
                )
            `);

            testDb.run(`
                CREATE TABLE IF NOT EXISTS favorites (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    apartment_id INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    FOREIGN KEY (apartment_id) REFERENCES apartments(id),
                    UNIQUE(user_id, apartment_id)
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });
}

// Seed test data
async function seedTestData() {
    // Create test user
    const hashedPassword = await bcrypt.hash('password123', 10);
    await testDb.runAsync(
        'INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)',
        ['Test User', 'test@test.com', '01234567890', hashedPassword]
    );

    // Create test apartments
    const apartments = [
        { title: 'Available Apartment', price: 10000, location: 'Cairo', region: 'Heliopolis', available: 1 },
        { title: 'Unavailable Apartment', price: 8000, location: 'Alexandria', region: 'Smouha', available: 0 },
        { title: 'Luxury Apartment', price: 15000, location: 'Cairo', region: 'Zamalek', available: 1 }
    ];

    for (const apt of apartments) {
        await testDb.runAsync(
            'INSERT INTO apartments (title, price, location, region, available) VALUES (?, ?, ?, ?, ?)',
            [apt.title, apt.price, apt.location, apt.region, apt.available]
        );
    }
}

// Clear test data
async function clearTestData() {
    await testDb.runAsync('DELETE FROM favorites');
    await testDb.runAsync('DELETE FROM reviews');
    await testDb.runAsync('DELETE FROM bookings');
    await testDb.runAsync('DELETE FROM apartments');
    await testDb.runAsync('DELETE FROM users');
}

module.exports = {
    testDb,
    initTestDb,
    seedTestData,
    clearTestData
};
