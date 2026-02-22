# Rento - Apartment Rental Platform

A web application for finding and booking rental apartments in Egypt.

## Features

- Browse available apartments with filters (city, price, bedrooms)
- Interactive map view with Leaflet.js
- User registration and authentication
- Booking system with date validation
- Favorites list
- Reviews and ratings

## Quick Start

### 1. Start the Backend

```bash
cd backend
npm install
node server.js
```

Server runs at `http://localhost:3001`

### 2. Start the Frontend

```bash
# From project root
python3 -m http.server 8080
```

### 3. Open the App

Go to `http://localhost:8080/Home_page/home.html`

## Project Structure

```
├── backend/          # Express.js API server
│   ├── server.js     # Main server file
│   ├── db.js         # SQLite database
│   └── routes/       # API endpoints
├── Home_page/        # Landing page
├── login/            # Login page
├── signup/           # Registration page
├── map/              # Main dashboard with listings
├── Details/          # Property details page
├── booking/          # Booking form
└── about/            # About page
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/users/register` | Register new user |
| POST | `/api/users/login` | Login |
| GET | `/api/apartments` | List apartments |
| GET | `/api/apartments/:id` | Get apartment details |
| POST | `/api/bookings` | Create booking |
| GET | `/api/bookings` | Get user's bookings |

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript, Bootstrap 5, Leaflet.js
- **Backend:** Node.js, Express.js
- **Database:** SQLite
- **Auth:** JWT tokens
