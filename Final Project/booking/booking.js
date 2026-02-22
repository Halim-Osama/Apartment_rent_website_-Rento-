const API_BASE_URL = 'http://localhost:3001/api';

// Check authentication and load user data on page load
document.addEventListener('DOMContentLoaded', function() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login/login.html';
        return;
    }

    // Pre-fill user data if available
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.name) document.getElementById('name').value = user.name;
    if (user.email) document.getElementById('email').value = user.email;
    if (user.phone) document.getElementById('phone').value = user.phone;

    // Set minimum date to today
    const today = new Date().toISOString().split('T')[0];
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');

    if (startDateInput) {
        startDateInput.setAttribute('min', today);
    }

    // Update end date minimum when start date changes
    startDateInput?.addEventListener('change', function() {
        const selectedStartDate = this.value;
        if (endDateInput) {
            endDateInput.setAttribute('min', selectedStartDate);

            // Clear end date if it's before the new start date
            if (endDateInput.value && endDateInput.value <= selectedStartDate) {
                endDateInput.value = '';
            }
        }
    });
});

async function handleBooking(event) {
    event.preventDefault();

    const token = localStorage.getItem('token');
    if (!token) {
        showMessage('Please login to make a booking', 'error');
        window.location.href = '/login/login.html';
        return;
    }

    // Get form values
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    // Get apartment ID from session storage or URL
    const apartmentId = sessionStorage.getItem('selectedPropertyId') ||
                        new URLSearchParams(window.location.search).get('apartment_id');

    // Validate all fields
    if (!name || !email || !phone || !startDate || !endDate) {
        showMessage('Please fill in all fields.', 'error');
        return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showMessage('Please enter a valid email address.', 'error');
        return;
    }

    // Validate phone number
    const phoneRegex = /^[0-9]{10,15}$/;
    if (!phoneRegex.test(phone.replace(/\s+/g, ''))) {
        showMessage('Please enter a valid phone number (10-15 digits).', 'error');
        return;
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (start < today) {
        showMessage('Start date cannot be in the past.', 'error');
        return;
    }

    if (end <= start) {
        showMessage('End date must be after start date.', 'error');
        return;
    }

    // Show loading state
    const submitBtn = document.querySelector('.btn-book');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Processing...';
    submitBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/bookings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                apartment_id: apartmentId || 1, // Default to 1 if not specified
                start_date: startDate,
                end_date: endDate,
                name,
                email,
                phone
            })
        });

        const data = await response.json();

        if (data.success) {
            // Calculate duration for display
            const duration = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

            showMessage('Booking successful!', 'success');

            // Show confirmation
            setTimeout(() => {
                alert(`Booking Confirmed!\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nRental Period: ${duration} days\nTotal: L.E ${data.data.total_price.toLocaleString()}\n\nYou will receive a confirmation email shortly.`);
                window.location.href = '/map/map.html';
            }, 1000);
        } else {
            showMessage(data.message || 'Booking failed. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Booking error:', error);
        showMessage('Unable to connect to server. Please try again later.', 'error');
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

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

// Auto-format phone number as user types
document.getElementById('phone')?.addEventListener('input', function(e) {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 15) {
        value = value.slice(0, 15);
    }
    e.target.value = value;
});

// Prevent form submission on Enter key in input fields
document.querySelectorAll('#bookingForm input').forEach(input => {
    input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const inputs = Array.from(document.querySelectorAll('#bookingForm input'));
            const index = inputs.indexOf(e.target);
            if (index < inputs.length - 1) {
                inputs[index + 1].focus();
            }
        }
    });
});
