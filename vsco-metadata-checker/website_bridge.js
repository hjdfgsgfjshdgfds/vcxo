chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'gpsData') {
        window.postMessage({
            type: 'VSCO_GPS_DATA',
            imageUrl: request.imageUrl,
            latitude: request.latitude,
            longitude: request.longitude,
            postUrl: request.postUrl || null,
            pageUrl: request.pageUrl || null,
            exif: request.exif || null
        }, '*');
        console.log('[VSCO EXTENSION] Forwarded GPS data to map website:', request.imageUrl, request.latitude, request.longitude, request.postUrl, request.pageUrl, request.exif);
    }
}); 