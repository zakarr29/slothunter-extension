// SlotHunter Chrome Extension - Content Script for VFS Global

console.log('[SlotHunter] Content script loaded on VFS Global');

// Check if license is active before doing anything
(async () => {
    const { license, accessToken } = await chrome.storage.local.get(['license', 'accessToken']);

    if (!license || !accessToken) {
        console.log('[SlotHunter] No active license');
        return;
    }

    console.log('[SlotHunter] License active, initializing...');

    // Initialize slot detection
    initSlotDetection();
})();

function initSlotDetection() {
    // TODO: Implement VFS-specific slot detection
    // This will vary based on the specific VFS website structure

    // Example: Look for appointment slot indicators
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.addedNodes.length) {
                checkForSlots();
            }
        }
    });

    // Observe the whole document for changes
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Initial check
    checkForSlots();
}

function checkForSlots() {
    // TODO: Implement actual slot detection logic
    // This is a placeholder that will need to be customized for VFS

    // Example selectors (will need to be updated for actual VFS site)
    const slotIndicators = document.querySelectorAll('.slot-available, .appointment-slot');

    if (slotIndicators.length > 0) {
        console.log('[SlotHunter] Potential slots found:', slotIndicators.length);

        // Notify background script
        chrome.runtime.sendMessage({
            type: 'SLOTS_FOUND',
            count: slotIndicators.length,
            url: window.location.href
        });
    }
}

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'CHECK_SLOTS':
            checkForSlots();
            sendResponse({ status: 'checked' });
            break;

        case 'GET_PAGE_INFO':
            sendResponse({
                url: window.location.href,
                title: document.title
            });
            break;
    }

    return true; // Keep message channel open for async response
});
