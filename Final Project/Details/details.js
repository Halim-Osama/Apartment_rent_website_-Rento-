const API_BASE_URL = 'http://localhost:3001/api';

let currentProperty = null;
let currentSlide = 0;
let slides = [];
let autoPlayInterval = null;

// Initialize
document.addEventListener('DOMContentLoaded', async function() {
    // Check authentication
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login/login.html';
        return;
    }

    // Get property ID from URL or session storage
    const urlParams = new URLSearchParams(window.location.search);
    const propertyId = urlParams.get('id') || sessionStorage.getItem('selectedPropertyId');

    if (propertyId) {
        await loadPropertyDetails(propertyId);
    } else {
        showMessage('No property selected', 'error');
        setTimeout(() => {
            window.location.href = '/map/map.html';
        }, 2000);
    }

    initializeSlider();
});

// Load property details from backend
async function loadPropertyDetails(id) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/apartments/${id}`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });

        const data = await response.json();

        if (data.success) {
            currentProperty = data.data;
            updatePropertyDisplay(currentProperty);
        } else {
            showMessage('Property not found', 'error');
        }
    } catch (error) {
        console.error('Error loading property:', error);
        showMessage('Unable to load property details', 'error');
    }
}

// Update the display with property data
function updatePropertyDisplay(property) {
    // Update price
    const priceTitle = document.querySelector('.price-title');
    if (priceTitle) {
        priceTitle.textContent = `L.E ${property.price.toLocaleString()} per/month + security deposit`;
    }

    // Update description
    const descriptionText = document.querySelector('.description-text');
    if (descriptionText && property.description) {
        descriptionText.innerHTML = property.description.replace(/\n/g, '<br>');
    }

    // Update favorite button state
    const favoriteBtn = document.querySelector('.favorite-btn-large');
    if (favoriteBtn && property.favorite) {
        favoriteBtn.classList.add('active');
    }

    // Update book now button link
    const bookBtn = document.querySelector('.btn-book a');
    if (bookBtn) {
        bookBtn.href = `/booking/booking.html?apartment_id=${property.id}`;
    }
}

// Initialize Slider
function initializeSlider() {
    slides = document.querySelectorAll('.slider-image');

    if (slides.length === 0) return;

    // Start auto-play
    startAutoPlay();

    // Pause auto-play on hover
    const slider = document.querySelector('.image-slider');
    slider?.addEventListener('mouseenter', stopAutoPlay);
    slider?.addEventListener('mouseleave', startAutoPlay);

    // Touch support
    initTouchSupport();

    // Keyboard navigation
    document.addEventListener('keydown', handleKeyNavigation);
}

function showSlide(index) {
    slides.forEach((slide, i) => {
        slide.classList.remove('active');
        if (i === index) {
            slide.classList.add('active');
        }
    });
}

function changeSlide(direction) {
    currentSlide += direction;

    if (currentSlide >= slides.length) {
        currentSlide = 0;
    } else if (currentSlide < 0) {
        currentSlide = slides.length - 1;
    }

    showSlide(currentSlide);
}

function startAutoPlay() {
    stopAutoPlay();
    autoPlayInterval = setInterval(() => {
        changeSlide(1);
    }, 5000);
}

function stopAutoPlay() {
    if (autoPlayInterval) {
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
    }
}

// Toggle Favorite
async function toggleFavoriteDetail(button) {
    const token = localStorage.getItem('token');
    if (!token) {
        showMessage('Please login to add favorites', 'error');
        return;
    }

    if (!currentProperty) return;

    const isFavorite = button.classList.contains('active');

    try {
        const response = await fetch(`${API_BASE_URL}/users/favorites/${currentProperty.id}`, {
            method: isFavorite ? 'DELETE' : 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (data.success || response.status === 409) {
            button.classList.toggle('active');
            currentProperty.favorite = !isFavorite;
            showMessage(currentProperty.favorite ? 'Added to favorites' : 'Removed from favorites', 'success');
        }
    } catch (error) {
        console.error('Favorite error:', error);
        showMessage('Failed to update favorites', 'error');
    }
}

// Book Now Function
function bookNow() {
    if (currentProperty) {
        sessionStorage.setItem('selectedPropertyId', currentProperty.id);
    }
    window.location.href = '/booking/booking.html';
}

// Toggle Description (Read More/Less)
function toggleDescription(event) {
    event.preventDefault();
    const descriptionText = document.querySelector('.description-text');
    const readMoreBtn = event.target;

    if (descriptionText.style.maxHeight) {
        descriptionText.style.maxHeight = null;
        readMoreBtn.textContent = 'Read More...';
    } else {
        descriptionText.style.maxHeight = descriptionText.scrollHeight + 'px';
        readMoreBtn.textContent = 'Read Less...';
    }
}

// Keyboard navigation for slider
function handleKeyNavigation(e) {
    if (e.key === 'ArrowLeft') {
        changeSlide(-1);
    } else if (e.key === 'ArrowRight') {
        changeSlide(1);
    }
}

// Touch swipe support for mobile
function initTouchSupport() {
    let touchStartX = 0;
    let touchEndX = 0;

    const slider = document.querySelector('.image-slider');

    slider?.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    });

    slider?.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe(touchStartX, touchEndX);
    });
}

function handleSwipe(startX, endX) {
    if (endX < startX - 50) {
        changeSlide(1); // Swipe left
    }
    if (endX > startX + 50) {
        changeSlide(-1); // Swipe right
    }
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
`;
document.head.appendChild(style);
