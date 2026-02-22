const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'db', 'Rento DB.db');
const db = new sqlite3.Database(dbPath);

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

// Initialize database tables
async function initializeDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Enable foreign keys
            db.run('PRAGMA foreign_keys = ON');

            // Users table
            db.run(`
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

            // Apartments table
            db.run(`
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

            // Bookings table
            db.run(`
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

            // Reviews table
            db.run(`
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

            // Favorites table
            db.run(`
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
                if (err) {
                    reject(err);
                } else {
                    // Check if we need to seed apartments
                    db.get('SELECT COUNT(*) as count FROM apartments', [], async (err, row) => {
                        if (err) {
                            reject(err);
                        } else if (row.count === 0) {
                            await seedApartments();
                            resolve();
                        } else {
                            resolve();
                        }
                    });
                }
            });
        });
    });
}

async function seedApartments() {
    const apartments = [
        {
            title: 'Modern Apartment in New Borg El-Arab',
            description: 'شقة للإيجار في مكان هادئ وموقع، قريبة من كل الخدمات الأساسية للحياة مساحتها 120 متر مفروشة كويس جداً وجاهزة للسكن فوراً.',
            price: 8000,
            location: 'Alexandria',
            region: 'New Borg El-Arab',
            bedrooms: 2,
            bathrooms: 1,
            area: 120,
            lat: 31.2001,
            lng: 29.9187,
            available: 0,
            image_url: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=500'
        },
        {
            title: 'Spacious Flat in Heliopolis',
            description: 'Beautiful spacious apartment in the heart of Heliopolis with modern amenities.',
            price: 12000,
            location: 'Cairo',
            region: 'Heliopolis',
            bedrooms: 3,
            bathrooms: 2,
            area: 150,
            lat: 30.0444,
            lng: 31.2357,
            available: 1,
            image_url: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=500'
        },
        {
            title: 'Cozy Home in Banha',
            description: 'Comfortable family apartment with great neighborhood.',
            price: 10000,
            location: 'Qalyubia',
            region: 'Banha',
            bedrooms: 2,
            bathrooms: 2,
            area: 130,
            lat: 30.4658,
            lng: 31.1844,
            available: 1,
            image_url: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=500'
        },
        {
            title: 'Luxury Apartment in Heliopolis',
            description: 'Premium luxury apartment with high-end finishes.',
            price: 15000,
            location: 'Cairo',
            region: 'Heliopolis',
            bedrooms: 3,
            bathrooms: 2,
            area: 180,
            lat: 30.0888,
            lng: 31.3123,
            available: 1,
            image_url: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=500'
        },
        {
            title: 'Family Home in 6th of October',
            description: 'Perfect for families, close to schools and amenities.',
            price: 11000,
            location: 'Giza',
            region: '6th of October',
            bedrooms: 2,
            bathrooms: 1,
            area: 140,
            lat: 29.9787,
            lng: 31.0087,
            available: 1,
            image_url: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=500'
        },
        {
            title: 'Premium Villa in Smouha',
            description: 'Elegant villa with garden in prestigious Smouha area.',
            price: 13000,
            location: 'Alexandria',
            region: 'Smouha',
            bedrooms: 4,
            bathrooms: 3,
            area: 200,
            lat: 31.2156,
            lng: 29.9553,
            available: 1,
            image_url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=500'
        }
    ];

    const insertSql = `
        INSERT INTO apartments (title, description, price, location, region, bedrooms, bathrooms, area, lat, lng, available, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const apt of apartments) {
        await db.runAsync(insertSql, [
            apt.title, apt.description, apt.price, apt.location, apt.region,
            apt.bedrooms, apt.bathrooms, apt.area, apt.lat, apt.lng, apt.available, apt.image_url
        ]);
    }

    console.log('Sample apartments seeded successfully');
}

// Initialize on module load
initializeDatabase().catch(err => {
    console.error('Database initialization error:', err);
});

module.exports = db;
