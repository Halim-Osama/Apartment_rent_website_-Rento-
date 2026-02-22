function toggleFavorite(button) {
    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (!token) {
        alert('Please login to save favorites.');
        window.location.href = '/Final Project/login/login.html';
        return;
    }

    if (button.classList.contains('active')) {
        button.classList.remove('active');
        button.innerHTML = '\u2661';
    } else {
        button.classList.add('active');
        button.innerHTML = '\u2665';
    }
}

function loadMoreProperties() {
    // Redirect to login page since authentication is required to view all properties
    const token = localStorage.getItem('token');
    if (!token) {
        alert('Please login to view more properties.');
        window.location.href = '/Final Project/login/login.html';
    } else {
        window.location.href = '/Final Project/map/map.html';
    }
}
