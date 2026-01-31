// SlotHunter Chrome Extension - Background Service Worker

const API_BASE = 'https://slothunter-backend.vercel.app';

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'LICENSE_ACTIVATED':
            console.log('License activated');
            // Could start periodic validation here
            break;

        case 'LICENSE_DEACTIVATED':
            console.log('License deactivated');
            // Stop any monitoring
            chrome.alarms.clear('slotMonitor');
            break;

        case 'START_MONITORING':
            startMonitoring();
            break;

        case 'STOP_MONITORING':
            stopMonitoring();
            break;
    }
});

// Start slot monitoring
async function startMonitoring() {
    console.log('Starting slot monitoring...');

    // Check license first
    const { license, accessToken } = await chrome.storage.local.get(['license', 'accessToken']);

    if (!license || !accessToken) {
        console.log('No valid license, cannot start monitoring');
        return;
    }

    // Set up alarm for periodic checks
    chrome.alarms.create('slotMonitor', {
        periodInMinutes: 5 // Check every 5 minutes
    });

    // Store monitoring state
    await chrome.storage.local.set({ isMonitoring: true });

    // Send notification
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'SlotHunter',
        message: 'Slot monitoring started! We\'ll notify you when slots are available.'
    });
}

// Stop slot monitoring
async function stopMonitoring() {
    console.log('Stopping slot monitoring...');

    chrome.alarms.clear('slotMonitor');
    await chrome.storage.local.set({ isMonitoring: false });

    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'SlotHunter',
        message: 'Slot monitoring stopped.'
    });
}

// Handle alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'slotMonitor') {
        await checkSlots();
    }
});

// Check for available slots
async function checkSlots() {
    console.log('Checking for available slots...');

    const { accessToken } = await chrome.storage.local.get(['accessToken']);

    if (!accessToken) {
        console.log('No access token, stopping monitoring');
        stopMonitoring();
        return;
    }

    try {
        // TODO: Implement VFS slot checking logic
        // This will be expanded later with actual VFS integration

        console.log('Slot check completed');

    } catch (error) {
        console.error('Slot check error:', error);
    }
}

// Extension install/update
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('SlotHunter installed!');
    } else if (details.reason === 'update') {
        console.log('SlotHunter updated to', chrome.runtime.getManifest().version);
    }
});

// Keep service worker alive (if needed for long-running tasks)
const keepAlive = () => setInterval(chrome.runtime.getPlatformInfo, 20000);
chrome.runtime.onStartup.addListener(keepAlive);
keepAlive();
