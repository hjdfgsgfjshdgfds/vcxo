// content.js (v1.30 - Media ID Targeting)
console.log("VSCO EXIF GPS Checker: Content script loaded (v1.30 - Media ID Targeting).");

const processedImages = new Set(); // Track processed image URLs
let gpsFoundOnPage = false; // Track if GPS has been found on this page load

// --- Keep base64ToArrayBuffer, convertDMSToDD, parseExifData functions ---
function base64ToArrayBuffer(base64) { try { const b = atob(base64); const l = b.length; const B = new Uint8Array(l); for (let i = 0; i < l; i++) { B[i] = b.charCodeAt(i); } return B.buffer; } catch (e) { console.error("Base64 Decode Err:", e); return null; } }
// Converts Degrees Minutes Seconds + Indicator (N/S/E/W) to Decimal Degrees
function convertDMSToDD(d, m, s, i) { d = Number(d) || 0; m = Number(m) || 0; s = Number(s) || 0; var dd = d + m / 60 + s / 3600; i = String(i).toUpperCase(); if (i == "S" || i == "W") { dd = dd * -1; } return dd; }
// Parses EXIF data from an ArrayBuffer
function parseExifData(a, f) { if (!(a instanceof ArrayBuffer)) { console.error("ParseInputErr: Not ArrayBuffer", f); return { success: false, data: null, message: `Internal Error: Invalid data type for parsing.`, fetchedUrl: f }; } try { const e = EXIF.readFromBinaryFile(a); if (e !== null && typeof e === 'object') { return { success: true, data: e, message: null, fetchedUrl: f }; } else { return { success: false, data: null, message: "No EXIF data object found", fetchedUrl: f }; } } catch (r) { console.error("EXIF Parsing Error:", f, r); return { success: false, data: null, message: `EXIF Parsing Error: ${r.message}`, fetchedUrl: f }; } }
// --- End unchanged functions ---


// +++ addGpsOverlay Function (Accepts container, status, mapUrl) +++
function addGpsOverlay(targetContainer, status, mapUrl) {
    if (!targetContainer) { console.warn("Overlay: Invalid target container provided."); return; }
    if (targetContainer.querySelector(':scope > .vsco-gps-overlay')) { return; } // Prevent duplicates

    const overlay = document.createElement('div');
    overlay.classList.add('vsco-gps-overlay', `vsco-gps-${status}`);

    let overlayContentSet = false;
    if (status === 'has-gps') {
        overlay.appendChild(document.createTextNode('📍 GPS '));
        if (mapUrl) {
            const link = document.createElement('a');
            link.href = mapUrl; link.textContent = 'View Map'; link.target = '_blank';
            link.rel = 'noopener noreferrer'; link.classList.add('vsco-gps-map-link');
            link.addEventListener('click', (e) => e.stopPropagation());
            overlay.appendChild(link);
            overlayContentSet = true;
            if (!gpsFoundOnPage) {
                gpsFoundOnPage = true;
                chrome.runtime.sendMessage({ action: 'notifyGpsFound' }, (response) => {
                    if (chrome.runtime.lastError) console.error("Notify Msg Error:", chrome.runtime.lastError.message);
                });
            }
        } else {
            overlay.appendChild(document.createTextNode('(Link Error)'));
            overlay.title = 'GPS data found, but failed to create map link.';
            overlayContentSet = true;
        }
    } else if (status === 'has-exif') {
        overlay.textContent = '✓ EXIF (No GPS)';
        overlay.title = 'EXIF data found, but no GPS coordinates.';
        overlayContentSet = true;
    } else if (status === 'no-exif') {
        overlay.textContent = '○ No EXIF';
        overlay.title = 'No EXIF data found for this image.';
        overlayContentSet = true;
    } else { // error
        overlay.textContent = '⚠︎ EXIF Error';
        overlay.title = 'Error processing EXIF data.';
        overlayContentSet = true;
    }

    if (overlayContentSet) { targetContainer.appendChild(overlay); }
}


// --- processParseResult Function (Uses mediaId for Targeting) ---
function processParseResult(result, originalSrcUrl, mediaId) { // Added mediaId parameter
    let status = 'error'; let message = result.message || 'Unknown result state'; let payload = null;
    let isGps = false;
    let mapUrl = null;

    // Determine status and parse GPS if available
    if (result.success && result.data) {
        payload = result.data; const keys = Object.keys(payload);
        if (keys.length > 0) {
            isGps = payload.GPSLatitude && Array.isArray(payload.GPSLatitude) && payload.GPSLatitude.length === 3 &&
                    payload.GPSLongitude && Array.isArray(payload.GPSLongitude) && payload.GPSLongitude.length === 3 &&
                    payload.GPSLatitudeRef && payload.GPSLongitudeRef;
            status = isGps ? 'has-gps' : 'has-exif';
            if (isGps) {
                try {
                    const latitudeDD = convertDMSToDD(payload.GPSLatitude[0], payload.GPSLatitude[1], payload.GPSLatitude[2], payload.GPSLatitudeRef);
                    const longitudeDD = convertDMSToDD(payload.GPSLongitude[0], payload.GPSLongitude[1], payload.GPSLongitude[2], payload.GPSLongitudeRef);
                    if (typeof latitudeDD === 'number' && typeof longitudeDD === 'number' && !isNaN(latitudeDD) && !isNaN(longitudeDD)) {
                        mapUrl = `https://www.google.com/maps?q=${latitudeDD},${longitudeDD}`;

                        // Try to extract the VSCO post URL from the closest anchor tag with /media/ in the href
                        let postUrl = null;
                        if (mediaId) {
                            let anchor = null;
                            if (typeof originalSrcUrl === 'string') {
                                const imgEl = document.querySelector(`img[src='${originalSrcUrl}'],img[currentSrc='${originalSrcUrl}']`);
                                if (imgEl) {
                                    anchor = imgEl.closest('a[href*="/media/"]');
                                }
                            }
                            if (anchor && anchor.href && anchor.href.includes('/media/')) {
                                postUrl = anchor.href;
                            } else {
                                let username = null;
                                const userLink = document.querySelector('a[href^="https://vsco.co/"]');
                                if (userLink && userLink.href) {
                                    const match = userLink.href.match(/vsco\.co\/([^\/]+)/);
                                    if (match && match[1]) username = match[1];
                                }
                                if (!username) {
                                    const pathMatch = window.location.pathname.match(/\/([^\/]+)(?:\/media)?/);
                                    if (pathMatch && pathMatch[1]) username = pathMatch[1];
                                }
                                if (username) {
                                    postUrl = `https://vsco.co/${username}/media/${mediaId}`;
                                }
                            }
                        }

                        // Log all three
                        console.log('%c[HOTSPOTTING] GPS FOUND', 'background: #ff4444; color: white; font-weight: bold; padding: 2px 4px; border-radius: 2px;');
                        if (postUrl) console.log('VSCO Post URL:', postUrl);
                        console.log('AWS Image Source:', originalSrcUrl);
                        console.log('EXIF Metadata:', payload);

                        chrome.runtime.sendMessage({
                            action: 'gpsData',
                            postUrl: postUrl && postUrl.includes('/media/') ? postUrl : null,
                            imageUrl: originalSrcUrl,
                            exif: payload || null
                        }, response => {
                            if (chrome.runtime.lastError) {
                                console.error('Error sending message:', chrome.runtime.lastError);
                            } else {
                                console.log('Message sent successfully:', response);
                            }
                        });
                    } else {
                        message = "GPS data present but conversion failed.";
                    }
                } catch (convError) {
                    status = 'error';
                    message = `GPS Conversion Error: ${convError.message}`;
                    mapUrl = null;
                }
            }
        } else { status = 'no-exif'; message = 'EXIF data object was empty'; }
    } else if (!result.success) {
        if (message && (message.includes("Error") || message.includes("Failed"))) { status = 'error'; }
        else { status = 'no-exif'; message = message || "No EXIF data found"; }
    }

    // --- Log to console (Keep your existing simplified log here) ---
    const logStyle = { /* ... your styles ... */ };
    const logPrefix = { /* ... your prefixes ... */ };
    console.log( /* ... your console log call ... */ );
    if (mapUrl) { console.log( /* ... your map link log call ... */ ); }
    // --- End Console Log ---


    // --- Add Visual Overlay ---
    try {
        let targetContainer = null;
        let foundBy = "none"; // For debugging

        if (mediaId) {
            // --- Primary Method: Find by Media ID ---
            const targetLink = document.querySelector(`a[href*="/media/${mediaId}"]`);
            if (targetLink) {
                 targetContainer = targetLink.querySelector('div.MediaImage'); // Ideal container
                 if (targetContainer) {
                     foundBy = "mediaId > div.MediaImage";
                 } else {
                     targetContainer = targetLink.closest('figure.MediaThumbnail') || targetLink.parentElement;
                     if (targetContainer) {
                         foundBy = "mediaId > parent fallback";
                         console.warn(`Overlay: 'div.MediaImage' not found for mediaId ${mediaId}. Using parent:`, targetContainer);
                         const containerPosition = window.getComputedStyle(targetContainer).position;
                         if (!['relative', 'absolute', 'fixed', 'sticky'].includes(containerPosition)) {
                              try { targetContainer.style.position = 'relative'; } catch(e){}
                         }
                     }
                 }
            }
        }

        // --- Fallback: If no mediaId or link not found, check for Profile Pic ---
        if (!targetContainer) {
             const profilePicElement = document.querySelector('img[data-testid="UserProfileAvatarImage"]');
              if (profilePicElement && (profilePicElement.src === originalSrcUrl || profilePicElement.currentSrc === originalSrcUrl)) {
                   targetContainer = profilePicElement.closest('div[style*="position: relative"]') || profilePicElement.parentElement;
                   if(targetContainer) foundBy = "profilePic fallback";
              }
        }

        // --- Fallback: direct match on image src for standalone media pages ---
        if (!targetContainer && originalSrcUrl) {
            try {
                const escapedUrl = originalSrcUrl.replace(/"/g, '\\"');
                const imgEl = document.querySelector(`img[src="${escapedUrl}"],img[currentSrc="${escapedUrl}"]`);
                if (imgEl) {
                    targetContainer = imgEl.closest('figure') || imgEl.parentElement;
                    foundBy = 'src match';
                    const containerPosition = window.getComputedStyle(targetContainer).position;
                    if (!['relative', 'absolute', 'fixed', 'sticky'].includes(containerPosition)) {
                        try { targetContainer.style.position = 'relative'; } catch(e){}
                    }
                }
            } catch(err) {
                console.warn('Overlay src match error:', err);
            }
        }

        // --- Add Overlay if container found ---
        if (targetContainer) {
            if (!targetContainer.querySelector(':scope > .vsco-gps-overlay')) { // Check before adding
                // console.log(`Overlay: Adding (${foundBy}) for ${originalSrcUrl.substring(originalSrcUrl.lastIndexOf('/')+1)}`);
                addGpsOverlay(targetContainer, status, mapUrl);
            }
        } else {
            console.warn("Overlay Check: FAILED to find a suitable container for:", originalSrcUrl, `(Media ID: ${mediaId || 'N/A'})`);
        }
    } catch(e) {
        console.error("Overlay: Error during container finding/overlay process:", e, originalSrcUrl, mediaId);
    }
    // --- End Visual Overlay Logic ---
}
// --- End processParseResult ---


// --- requestImageCheck Function (Accepts and Sends mediaId) ---
function requestImageCheck(imgElement, mediaId) { // Added mediaId parameter
    let originalSrcUrl;
    try { originalSrcUrl = new URL(imgElement.currentSrc || imgElement.src, document.baseURI).href; } catch (e) { console.warn("Invalid image src in requestImageCheck:", imgElement.src, e); return; }

    if (processedImages.has(originalSrcUrl)) { return; }
    processedImages.add(originalSrcUrl);

    let fetchUrl;
    try { const r = new URL(originalSrcUrl); r.search = ''; fetchUrl = r.href; } catch (e) {
        console.error("Failed to create fetch URL:", originalSrcUrl, e);
        processParseResult({ success: false, message: "Internal Error: Failed to create fetch URL" }, originalSrcUrl, mediaId);
        return;
    }

    chrome.runtime.sendMessage( { action: "fetchImageForExif", imageUrl: fetchUrl, mediaId: mediaId },
        (response) => {
            if (chrome.runtime.lastError) {
                if (!chrome.runtime.lastError.message?.includes("Extension context invalidated")) {
                     console.error(`Msg Runtime Error: ${chrome.runtime.lastError.message || 'Unknown'} for ${fetchUrl}`);
                     processParseResult({ success: false, message: `Runtime Error: ${chrome.runtime.lastError.message}` }, originalSrcUrl, mediaId); // Pass ID
                } return;
            }
            if (response) {
                const receivedMediaId = response.mediaId; // Get ID back from response
                if (response.success) {
                    if (response.dataType === 'base64' && typeof response.data === 'string') {
                        const d = base64ToArrayBuffer(response.data);
                        if (d) {
                            const p = parseExifData(d, response.imageUrl);
                            processParseResult(p, originalSrcUrl, receivedMediaId); // Pass ID
                        } else { processParseResult({ success: false, message: "Error: Failed to decode Base64.", fetchedUrl: response.imageUrl }, originalSrcUrl, receivedMediaId); } // Pass ID
                    } else { processParseResult({ success: false, message: "Error: Invalid data format.", fetchedUrl: response.imageUrl }, originalSrcUrl, receivedMediaId); } // Pass ID
                } else { processParseResult({ success: false, message: `Background Error: ${response.error}`, fetchedUrl: response.imageUrl }, originalSrcUrl, receivedMediaId); } // Pass ID
            } else { processParseResult({ success: false, message: "No response from script.", fetchedUrl: fetchUrl }, originalSrcUrl, mediaId); } // Pass original ID if no response
        }
    );
}
// --- End requestImageCheck ---


// --- processImageElement Function (Extracts mediaId) ---
function processImageElement(imgElement) {
    if (!imgElement || typeof imgElement.src !== 'string' || !imgElement.src || imgElement.closest('a[href*="/settings"]')) { return; }
    if (imgElement.src.startsWith('data:') || imgElement.src.startsWith('blob:')) { return; }

    let srcUrl;
    try { srcUrl = new URL(imgElement.currentSrc || imgElement.src, document.baseURI).href; } catch { console.warn("Could not parse URL for img:", imgElement); return; }

    if (processedImages.has(srcUrl)) { return; }

    let mediaId = null;
    const mediaLink = imgElement.closest('a[href*="/media/"]');
    if (mediaLink && mediaLink.href) {
         const match = mediaLink.href.match(/\/media\/([a-f0-9]{24,})/);
         if (match && match[1]) { mediaId = match[1]; }
    }
    // Fallback: derive media ID from current page URL on standalone media pages
    if (!mediaId) {
        const pathMatch = window.location.pathname.match(/\/media\/([a-f0-9]{24,})/);
        if (pathMatch && pathMatch[1]) { mediaId = pathMatch[1]; }
    }

    if (imgElement.complete && imgElement.naturalWidth > 0) {
        requestImageCheck(imgElement, mediaId); // Pass mediaId
    } else if (!imgElement.complete) {
        const loadHandler = () => { if(!processedImages.has(srcUrl)) { requestImageCheck(imgElement, mediaId); } cleanupListeners(); };
        const errorHandler = () => {
             let errorUrl; try { errorUrl = new URL(imgElement.src, document.baseURI).href; } catch { errorUrl = imgElement.src; }
              if (!processedImages.has(errorUrl)) { processedImages.add(errorUrl); console.warn(`Image failed to load: ${errorUrl}`); }
            cleanupListeners();
        };
        const cleanupListeners = () => { imgElement.removeEventListener('load', loadHandler); imgElement.removeEventListener('error', errorHandler); }
        imgElement.addEventListener('load', loadHandler, { once: true });
        imgElement.addEventListener('error', errorHandler, { once: true });
    } else { if (!processedImages.has(srcUrl)) { processedImages.add(srcUrl); } }
}


// --- scanForImages Function ---
function scanForImages(targetNode = document.body) {
    if (!targetNode || typeof targetNode.querySelectorAll !== 'function') return;
    const images = targetNode.querySelectorAll('img');
    images.forEach(processImageElement);
}

// --- MutationObserver ---
const observer = new MutationObserver(mutations => {
    window.requestAnimationFrame(() => { // Batch processing
        let imagesToCheck = new Set();
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.tagName === 'IMG') { imagesToCheck.add(node); }
                    else if (typeof node.querySelectorAll === 'function') { node.querySelectorAll('img').forEach(img => imagesToCheck.add(img)); }
                }
            });
            if (mutation.type === 'attributes' && mutation.attributeName === 'src' && mutation.target.tagName === 'IMG') { imagesToCheck.add(mutation.target); }
        });
        imagesToCheck.forEach(img => processImageElement(img));
    });
});

observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

// --- Initial Scan ---
setTimeout(() => { console.log("Running initial scan..."); scanForImages(document.body); }, 3000);
console.log("VSCO EXIF GPS Checker: Observer started and initial scan scheduled.");
// --- End Observer ---
