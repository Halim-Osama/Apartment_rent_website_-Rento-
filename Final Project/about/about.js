function handleSearch(event) {
    event.preventDefault();

    // Get form values
    const city = document.getElementById('city').value;
    const region = document.getElementById('region').value;
    const minPrice = document.getElementById('minPrice').value;
    const maxPrice = document.getElementById('maxPrice').value;

    // Validate form
    if (!city || !region || !minPrice || !maxPrice) {
        alert('Please fill in all fields.');
        return;
    }

    // Validate price range
    if (parseInt(minPrice) > parseInt(maxPrice)) {
        alert('Minimum price cannot be greater than maximum price.');
        return;
    }

    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (!token) {
        alert('Please login to search for properties.');
        window.location.href = '/login/login.html';
        return;
    }

    // Build query parameters and redirect to map page
    const params = new URLSearchParams({
        city: city,
        region: region,
        minPrice: minPrice,
        maxPrice: maxPrice
    });

    window.location.href = `/map/map.html?${params.toString()}`;
}

// Update region dropdown based on city selection
document.getElementById('city')?.addEventListener('change', function() {
    const city = this.value;
    const regionSelect = document.getElementById('region');

    // Clear current regions
    regionSelect.innerHTML = '<option value="">Label*</option>';

    // Region data for Egyptian cities
    const regions = {
        'alexandria': ['New Borg El-Arab', 'Smouha', 'Sidi Gaber', 'Miami', 'Stanley'],
        'cairo': ['Heliopolis', 'Nasr City', 'Maadi', 'Downtown', 'New Cairo', 'Zamalek'],
        'giza': ['6th of October', 'Sheikh Zayed', 'Dokki', 'Mohandessin', 'Haram'],
        'qalyubia': ['Banha', 'Shubra El-Kheima', 'Qalyub']
    };

    if (regions[city]) {
        regions[city].forEach(region => {
            const option = document.createElement('option');
            option.value = region.toLowerCase().replace(/\s+/g, '-');
            option.textContent = region;
            regionSelect.appendChild(option);
        });
    }
});
