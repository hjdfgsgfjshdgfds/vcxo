console.log('app.js loaded');

window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'VSCO_GPS_DATA') {
        addImage({
            url: event.data.imageUrl,
            latitude: event.data.latitude,
            longitude: event.data.longitude,
            postUrl: event.data.postUrl || null,
            exif: event.data.exif || null
        }, true);
    }
});

// Initialize the map
const map = L.map('map').setView([0, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Marker cluster group
const markerCluster = L.markerClusterGroup();
map.addLayer(markerCluster);

// Store for image data
let images = [];
let markers = [];

// Load from localStorage
function loadImages() {
    const data = localStorage.getItem('vsco_gps_images');
    if (data) {
        try {
            images = JSON.parse(data);
        } catch (e) { images = []; }
    }
    // Clear map and sidebar, then re-add all
    markerCluster.clearLayers();
    markers = [];
    renderSidebar();
    images.forEach(img => {
        const marker = createMarker(img);
        markerCluster.addLayer(marker);
        markers.push(marker);
    });
}

// Save to localStorage
function saveImages() {
    localStorage.setItem('vsco_gps_images', JSON.stringify(images));
}

// Function to format coordinates
function formatCoordinates(lat, lng) {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

// Function to create a marker for an image
function createMarker(image) {
    const vscoLink = image.postUrl;
    let exifHtml = '';
    if (image.exif && typeof image.exif === 'object') {
        exifHtml = '<div class="exif-meta"><b>EXIF:</b><br>' + Object.entries(image.exif).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('<br>') + '</div>';
    }
    const marker = L.marker([image.latitude, image.longitude]);
    marker.bindPopup(`
        <div>
            <img src="${image.imageUrl || ''}" alt="VSCO Image">
            <div class="location">${formatCoordinates(image.latitude, image.longitude)}</div>
            ${vscoLink ? `<a class="vsco-link" href="${vscoLink}" target="_blank">Open VSCO Post</a>` : `<span class="vsco-link disabled">No VSCO Post</span>`}
            <button class="stalk-btn" onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${image.latitude},${image.longitude}','_blank')">Stalk Her!</button>
            ${exifHtml}
        </div>
    `);
    marker.image = image;
    return marker;
}

// Function to add an image to the map and sidebar
function addImage(imageData, save = true) {
    // Prevent duplicates
    if (images.some(img => img.url === imageData.url && img.latitude === imageData.latitude && img.longitude === imageData.longitude)) return;
    const image = {
        url: imageData.url,
        thumbnail: imageData.thumbnail || imageData.url,
        latitude: imageData.latitude,
        longitude: imageData.longitude,
        timestamp: imageData.timestamp || new Date().toISOString(),
        postUrl: imageData.postUrl || null,
        pageUrl: imageData.pageUrl || null,
        exif: imageData.exif || null
    };
    images.push(image);
    if (save) saveImages();

    // Create and add marker
    const marker = createMarker(image);
    markerCluster.addLayer(marker);
    markers.push(marker);

    // Add to sidebar
    renderSidebar();
}

function renderSidebar() {
    const list = document.getElementById('image-list');
    list.innerHTML = '';
    const search = document.getElementById('search-bar').value.trim().toLowerCase();
    let filtered = images;
    if (search) {
        filtered = images.filter(img =>
            (img.postUrl && img.postUrl.toLowerCase().includes(search)) ||
            formatCoordinates(img.latitude, img.longitude).includes(search)
        );
    }
    // --- Top 5 Hotspots by cluster size ---
    const clusterMap = {};
    images.forEach(img => {
        const key = `${img.latitude.toFixed(2)},${img.longitude.toFixed(2)}`;
        if (!clusterMap[key]) clusterMap[key] = [];
        clusterMap[key].push(img);
    });
    const clusters = Object.entries(clusterMap).map(([key, imgs]) => ({
        key,
        count: imgs.length,
        lat: imgs[0].latitude,
        lng: imgs[0].longitude,
        imgs
    }));
    clusters.sort((a, b) => b.count - a.count);
    const top5List = document.getElementById('top-5');
    top5List.innerHTML = '';
    clusters.slice(0, 5).forEach((cluster, idx) => {
        const li = document.createElement('li');
        li.innerHTML = `<a href="#">${cluster.key}</a> <span style="color:#ff4444;font-weight:700;">(${cluster.count})</span>`;
        li.querySelector('a').onclick = (e) => {
            e.preventDefault();
            map.setView([cluster.lat, cluster.lng], 13, { animate: true });
        };
        top5List.appendChild(li);
    });
    // Main image list
    filtered.slice().reverse().forEach((image, idx) => {
        const vscoLink = image.postUrl;
        const item = document.createElement('div');
        item.className = 'image-item';
        item.innerHTML = `
            <img src="${image.imageUrl || ''}" alt="VSCO Image">
            <div class="info">
                <div class="location">${formatCoordinates(image.latitude, image.longitude)}</div>
                ${vscoLink ? `<a class="vsco-link" href="${vscoLink}" target="_blank">Open VSCO Post</a>` : `<span class="vsco-link disabled">No VSCO Post</span>`}
            </div>
            <button class="fly-btn">Fly To</button>
            <button class="stalk-btn">Stalk Her!</button>
        `;
        item.querySelector('.fly-btn').onclick = () => {
            map.setView([image.latitude, image.longitude], 13, { animate: true });
            const marker = markers.find(m => m.image.postUrl === image.postUrl && m.image.latitude === image.latitude && m.image.longitude === image.longitude);
            if (marker) marker.openPopup();
        };
        item.querySelector('.stalk-btn').onclick = () => {
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${image.latitude},${image.longitude}`, '_blank');
        };
        list.appendChild(item);
    });
    // Update stats
    document.getElementById('total-images').textContent = images.length;
    document.getElementById('gps-images').textContent = images.length;
}

document.getElementById('search-bar').addEventListener('input', renderSidebar);

// Remove Clear All button if present
const clearBtn = document.querySelector('button');
if (clearBtn && clearBtn.textContent && clearBtn.textContent.toLowerCase().includes('clear')) {
    clearBtn.remove();
}

// Load images from localStorage on page load
loadImages();

console.log('Map initialized'); 