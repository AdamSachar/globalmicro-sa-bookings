// GlobalMicro South Africa - Booking System
// Simple localStorage-based booking management

// Resource data
const rooms = [
    "Boardroom A",
    "Boardroom B",
    "Meeting Room 1",
    "Meeting Room 2",
    "Training Room"
];

const equipment = [
    "Projector",
    "Demo Laptop",
    "Test Tablet",
    "Video Camera",
    "Presentation Clicker"
];

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    setDefaultDate();
    showBookings('today');
});

// Set default date to today
function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('bookingDate').value = today;
    document.getElementById('bookingDate').min = today;
}

// Update resource dropdown based on type selection
function updateResourceOptions() {
    const resourceType = document.getElementById('resourceType').value;
    const resourceSelect = document.getElementById('resource');

    resourceSelect.innerHTML = '<option value="">-- Select Resource --</option>';

    let options = [];
    if (resourceType === 'room') {
        options = rooms;
    } else if (resourceType === 'equipment') {
        options = equipment;
    }

    options.forEach(function(item) {
        const option = document.createElement('option');
        option.value = item;
        option.textContent = item;
        resourceSelect.appendChild(option);
    });
}

// Handle form submission
document.getElementById('bookingForm').addEventListener('submit', function(e) {
    e.preventDefault();

    const staffName = document.getElementById('staffName').value.trim();
    const resourceType = document.getElementById('resourceType').value;
    const resource = document.getElementById('resource').value;
    const bookingDate = document.getElementById('bookingDate').value;
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;

    // Validate times
    if (startTime >= endTime) {
        document.getElementById('formMessage').textContent = 'Error: End time must be after start time.';
        document.getElementById('formMessage').style.color = 'red';
        return;
    }

    // Check for conflicts
    const bookings = getBookings();
    const hasConflict = bookings.some(function(booking) {
        if (booking.resource !== resource || booking.date !== bookingDate) {
            return false;
        }
        // Check time overlap
        return (startTime < booking.endTime && endTime > booking.startTime);
    });

    if (hasConflict) {
        document.getElementById('formMessage').textContent = 'Error: This resource is already booked for the selected time.';
        document.getElementById('formMessage').style.color = 'red';
        return;
    }

    // Create booking
    const booking = {
        id: Date.now(),
        staffName: staffName,
        resourceType: resourceType,
        resource: resource,
        date: bookingDate,
        startTime: startTime,
        endTime: endTime
    };

    bookings.push(booking);
    saveBookings(bookings);

    document.getElementById('formMessage').textContent = 'Booking created successfully!';
    document.getElementById('formMessage').style.color = 'green';

    // Reset form
    document.getElementById('bookingForm').reset();
    setDefaultDate();
    document.getElementById('resource').innerHTML = '<option value="">-- Select Resource --</option>';

    // Refresh bookings display
    showBookings('today');

    // Clear message after 3 seconds
    setTimeout(function() {
        document.getElementById('formMessage').textContent = '';
    }, 3000);
});

// Get bookings from localStorage
function getBookings() {
    const data = localStorage.getItem('globalmicro_bookings');
    return data ? JSON.parse(data) : [];
}

// Save bookings to localStorage
function saveBookings(bookings) {
    localStorage.setItem('globalmicro_bookings', JSON.stringify(bookings));
}

// Show bookings based on filter
function showBookings(filter) {
    const bookings = getBookings();
    const tbody = document.getElementById('bookingsBody');
    const title = document.getElementById('bookingsTitle');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let filtered = [];

    if (filter === 'today') {
        title.textContent = "Today's Bookings";
        const todayStr = today.toISOString().split('T')[0];
        filtered = bookings.filter(function(b) {
            return b.date === todayStr;
        });
    } else if (filter === 'tomorrow') {
        title.textContent = "Tomorrow's Bookings";
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        filtered = bookings.filter(function(b) {
            return b.date === tomorrowStr;
        });
    } else if (filter === 'upcoming') {
        title.textContent = "All Upcoming Bookings";
        const todayStr = today.toISOString().split('T')[0];
        filtered = bookings.filter(function(b) {
            return b.date >= todayStr;
        });
    }

    // Sort by date and time
    filtered.sort(function(a, b) {
        if (a.date !== b.date) {
            return a.date.localeCompare(b.date);
        }
        return a.startTime.localeCompare(b.startTime);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No bookings found.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    filtered.forEach(function(booking) {
        const tr = document.createElement('tr');
        tr.innerHTML =
            '<td>' + escapeHtml(booking.staffName) + '</td>' +
            '<td>' + escapeHtml(booking.resource) + '</td>' +
            '<td>' + formatDate(booking.date) + '</td>' +
            '<td>' + booking.startTime + ' - ' + booking.endTime + '</td>' +
            '<td><button class="cancel-btn" onclick="cancelBooking(' + booking.id + ')">Cancel</button></td>';
        tbody.appendChild(tr);
    });
}

// Cancel a booking
function cancelBooking(id) {
    if (!confirm('Are you sure you want to cancel this booking?')) {
        return;
    }

    let bookings = getBookings();
    bookings = bookings.filter(function(b) {
        return b.id !== id;
    });
    saveBookings(bookings);

    // Refresh display
    showBookings('today');
}

// Format date for display
function formatDate(dateStr) {
    const parts = dateStr.split('-');
    return parts[2] + '/' + parts[1] + '/' + parts[0];
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
