// background.js (v1.30 - Media ID Handling)

// --- Base64 function ---
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
// --- End Base64 function ---


// --- Listener for messages ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle fetch requests
    if (request.action === "fetchImageForExif") {
        const requestMediaId = request.mediaId; // Store the incoming mediaId
        const imageUrl = request.imageUrl;      // Store the image URL

        fetch(imageUrl, { redirect: 'follow', cache: 'no-cache' }) // Added no-cache
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status} for ${imageUrl}`);
                }
                return response.arrayBuffer();
            })
            .then(arrayBuffer => {
                if (!(arrayBuffer instanceof ArrayBuffer)) {
                    throw new Error("Fetched data not ArrayBuffer");
                }
                const base64String = arrayBufferToBase64(arrayBuffer);
                // Include the mediaId in the successful response
                sendResponse({
                    success: true,
                    data: base64String,
                    dataType: 'base64',
                    imageUrl: imageUrl,
                    mediaId: requestMediaId // Pass ID back
                });
            })
            .catch(error => {
                console.error(`BG Fetch Error for ${imageUrl}:`, error);
                // Include the mediaId in the error response
                sendResponse({
                    success: false,
                    error: error.message || "Failed to fetch",
                    imageUrl: imageUrl,
                    mediaId: requestMediaId // Pass ID back even on error
                 });
            });
        return true; // Indicate async response
    }

    // Handle GPS found notification
    if (request.action === "notifyGpsFound") {
        if (sender.tab && sender.tab.id) {
            // console.log(`Background: Received GPS notification for tab ${sender.tab.id}`);
            chrome.action.setBadgeText({ text: 'GPS', tabId: sender.tab.id });
            chrome.action.setBadgeBackgroundColor({ color: '#FF0000', tabId: sender.tab.id });
             sendResponse({status: "badge_set"}); // Acknowledge
        } else {
            console.warn("Background: Received notifyGpsFound without valid sender tab.");
            sendResponse({status: "error", message: "Missing sender tab info"});
        }
         return false; // No async here, response is synchronous
    }

    // Add this to the message listener
    if (request.action === "gpsData") {
        // Forward the GPS data to all tabs that might be running the website
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                if (tab.url && tab.url.startsWith('http')) {
                    chrome.tabs.sendMessage(tab.id, {
                        action: 'gpsData',
                        imageUrl: request.imageUrl,
                        latitude: request.latitude,
                        longitude: request.longitude
                    }).catch(() => {
                        // Ignore errors for tabs that don't have our content script
                    });
                }
            });
        });
        // No need to return true or call sendResponse
    }

    // Optional: Handle unknown actions
    // console.log("Background received unknown message action:", request.action);
    // sendResponse({status: "error", message: "Unknown action"});
    // return false;
});
// --- End Message Listener ---


// --- Clear badge when tab is updated or removed ---
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Clear badge if the tab is loading/reloaded OR url changes and doesn't contain vsco.co
    if (changeInfo.status === 'loading' || (changeInfo.url && !changeInfo.url.includes('vsco.co'))) {
         chrome.action.setBadgeText({
              text: '',
              tabId: tabId
         });
         // Note: If you track gpsFoundOnPage per tab, you'd reset it here too.
    }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    // Badge automatically removed with tab, no action needed, but listener is good practice.
    // If tracking state per tab, clean up here.
});
// --- End Badge Clearing ---

console.log("Background service worker started (v1.30 - Media ID Handling).");