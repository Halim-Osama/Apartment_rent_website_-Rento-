const API_BASE_URL = 'http://localhost:3001/api';

let properties = [];
let filteredProperties = [];
let map, markers = [];

// Initialize
document.addEventListener('DOMContentLoaded', async function() {
    // Check authentication
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login/login.html';
        return;
    }

    await loadProperties();
    initMap();
});

// Load properties from backend
async function loadProperties() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/apartments`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });

        const data = await response.json();

        if (data.success) {
            properties = data.data.map(apt => ({
                id: apt.id,
                image: apt.image_url || 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=500',
                rating: apt.rating || 0,
                location: apt.location,
                region: apt.region,
                price: apt.price,
                bedrooms: apt.bedrooms,
                bathrooms: apt.bathrooms,
                available: apt.available === 1,
                lat: apt.lat,
                lng: apt.lng,
                favorite: apt.favorite || false
            }));
            filteredProperties = [...properties];
            renderProperties();
        } else {
            showMessage('Failed to load properties', 'error');
        }
    } catch (error) {
        console.error('Error loading properties:', error);
        showMessage('Unable to connect to server', 'error');
    }
}

// Render Properties
function renderProperties() {
    const grid = document.getElementById('propertiesGrid');
    grid.innerHTML = '';

    if (filteredProperties.length === 0) {
        grid.innerHTML = '<div class="no-results"><p>No properties found matching your criteria.</p></div>';
    } else {
        filteredProperties.forEach(property => {
            const card = createPropertyCard(property);
            grid.appendChild(card);
        });
    }

    document.getElementById('resultsCount').textContent = filteredProperties.length;
}

// Create Property Card
function createPropertyCard(property) {
    const card = document.createElement('div');
    card.className = 'property-card';

    const fullStars = Math.floor(property.rating);
    const stars = '\u2605'.repeat(fullStars) + '\u2606'.repeat(5 - fullStars);

    card.innerHTML = `
        <div class="property-image-container">
            <img src="${property.image}" alt="Property" class="property-image" onerror="this.src='https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=500'">
            <button class="favorite-btn ${property.favorite ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite(${property.id}, this)">
                ${property.favorite ? '\u2665' : '\u2661'}
            </button>
        </div>
        <div class="property-details">
            <div class="rating">
                ${stars} <span class="rating-text">${property.rating.toFixed(1)}/5</span>
            </div>
            <div class="location-info">
                <p>Location: ${property.location}</p>
                <p>Region: ${property.region}</p>
            </div>
            <div class="price">L.E ${property.price.toLocaleString()} per/month</div>
            <div class="card-actions">
                <span class="availability-badge ${property.available ? 'badge-available' : 'badge-unavailable'}">
                    ${property.available ? 'Available' : 'Unavailable'}
                </span>
                <button class="btn-details" onclick="event.stopPropagation(); viewPropertyDetails(${property.id})">More details</button>
            </div>
        </div>
    `;

    return card;
}

// Toggle Favorite
async function toggleFavorite(id, button) {
    const token = localStorage.getItem('token');
    if (!token) {
        showMessage('Please login to add favorites', 'error');
        return;
    }

    const property = properties.find(p => p.id === id);
    const isFavorite = property.favorite;

    try {
        const response = await fetch(`${API_BASE_URL}/users/favorites/${id}`, {
            method: isFavorite ? 'DELETE' : 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (data.success || response.status === 409) {
            property.favorite = !isFavorite;
            button.classList.toggle('active');
            button.innerHTML = property.favorite ? '\u2665' : '\u2661';

            // Update filtered properties
            const filteredProperty = filteredProperties.find(p => p.id === id);
            if (filteredProperty) {
                filteredProperty.favorite = property.favorite;
            }

            showMessage(property.favorite ? 'Added to favorites' : 'Removed from favorites', 'success');
        }
    } catch (error) {
        console.error('Favorite error:', error);
        showMessage('Failed to update favorites', 'error');
    }
}

// View Property Details - Navigate to details.html
function viewPropertyDetails(id) {
    sessionStorage.setItem('selectedPropertyId', id);
    window.location.href = '/Details/details.html?id=' + id;
}

// Apply Filters
function applyFilters() {
    const city = document.getElementById('filterCity').value;
    const region = document.getElementById('filterRegion').value;
    const minPrice = parseInt(document.getElementById('minPrice').value) || 0;
    const maxPrice = parseInt(document.getElementById('maxPrice').value) || Infinity;
    const bedrooms = parseInt(document.getElementById('filterBedrooms').value) || 0;
    const bathrooms = parseInt(document.getElementById('filterBathrooms').value) || 0;
    const availableOnly = document.getElementById('filterAvailable').checked;
    const sortBy = document.getElementById('sortBy').value;

    filteredProperties = properties.filter(property => {
        return (!city || property.location.toLowerCase() === city) &&
               (!region || property.region.toLowerCase().includes(region)) &&
               (property.price >= minPrice && property.price <= maxPrice) &&
               (property.bedrooms >= bedrooms) &&
               (property.bathrooms >= bathrooms) &&
               (!availableOnly || property.available);
    });

    // Sort
    switch (sortBy) {
        case 'price-low':
            filteredProperties.sort((a, b) => a.price - b.price);
            break;
        case 'price-high':
            filteredProperties.sort((a, b) => b.price - a.price);
            break;
        case 'rating':
            filteredProperties.sort((a, b) => b.rating - a.rating);
            break;
        default:
            // newest - keep original order
            break;
    }

    renderProperties();
    updateMapMarkers();
}

// Reset Filters
function resetFilters() {
    document.getElementById('filtersForm').reset();
    filteredProperties = [...properties];
    renderProperties();
    updateMapMarkers();
}

// Initialize Map
function initMap() {
    map = L.map('map').setView([30.0444, 31.2357], 8);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    updateMapMarkers();
}

// Update Map Markers
function updateMapMarkers() {
    // Clear existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];

    // Add new markers
    filteredProperties.forEach(property => {
        if (property.lat && property.lng) {
            const marker = L.marker([property.lat, property.lng]).addTo(map);
            marker.on('click', () => showMapPropertyCard(property));
            markers.push(marker);
        }
    });

    // Fit bounds if properties exist
    if (filteredProperties.length > 0) {
        const validProperties = filteredProperties.filter(p => p.lat && p.lng);
        if (validProperties.length > 0) {
            const bounds = L.latLngBounds(validProperties.map(p => [p.lat, p.lng]));
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }
}

// Show Property Card on Map
function showMapPropertyCard(property) {
    const card = document.getElementById('mapPropertyCard');
    const fullStars = Math.floor(property.rating);
    const stars = '\u2605'.repeat(fullStars) + '\u2606'.repeat(5 - fullStars);

    document.getElementById('mapCardImage').src = property.image;
    document.getElementById('mapCardRating').textContent = stars;
    document.getElementById('mapCardRatingValue').textContent = property.rating.toFixed(1) + '/5';
    document.getElementById('mapCardLocation').textContent = `${property.location}, ${property.region}`;
    document.getElementById('mapCardPrice').textContent = `L.E ${property.price.toLocaleString()} per/month`;
    document.getElementById('mapCardDetailsBtn').onclick = () => viewPropertyDetails(property.id);

    card.style.display = 'block';
}

// Close Map Card
function closeMapCard() {
    document.getElementById('mapPropertyCard').style.display = 'none';
}

// Toggle View
function toggleView() {
    const listView = document.getElementById('listView');
    const mapView = document.getElementById('mapView');
    const btnText = document.getElementById('viewToggleText');

    if (listView.style.display === 'none') {
        listView.style.display = 'block';
        mapView.style.display = 'none';
        btnText.textContent = 'Map View';
    } else {
        listView.style.display = 'none';
        mapView.style.display = 'block';
        btnText.textContent = 'List View';

        // Refresh map after showing
        setTimeout(() => {
            map.invalidateSize();
        }, 100);
    }
}

// Logout function
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/Home_page/home.html';
}

// Show message toast
function showMessage(message, type = 'info') {
    const existingMsg = document.querySelector('.message-toast');
    if (existingMsg) {
        existingMsg.remove();
    }

    const toast = document.createElement('div');
    toast.className = `message-toast message-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        ${type === 'success' ? 'background-color: #27ae60;' : ''}
        ${type === 'error' ? 'background-color: #e74c3c;' : ''}
        ${type === 'info' ? 'background-color: #3498db;' : ''}
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    .no-results {
        text-align: center;
        padding: 40px;
        color: #666;
        grid-column: 1 / -1;
    }
`;
document.head.appendChild(style);
