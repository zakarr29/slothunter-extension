// SlotHunter Chrome Extension - Background Service Worker
// Enhanced with slot monitoring, config sync, and notifications

const API_BASE = 'https://slothunter-backend.vercel.app';

// Monitoring state
let isMonitoring = false;
let monitoringConfig = {
    checkIntervalMinutes: 5,
    targetUrl: '',
    notificationSound: true
};

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender).then(sendResponse);
    return true; // Keep message channel open for async response
});

async function handleMessage(message, sender) {
    switch (message.type) {
        case 'LICENSE_ACTIVATED':
            console.log('[SlotHunter] License activated');
            await syncConfig();
            return { success: true };

        case 'LICENSE_DEACTIVATED':
            console.log('[SlotHunter] License deactivated');
            await stopMonitoring();
            return { success: true };

        case 'START_MONITORING':
            return await startMonitoring(message.config);

        case 'STOP_MONITORING':
            return await stopMonitoring();

        case 'GET_STATUS':
            return await getStatus();

        case 'SLOTS_FOUND':
            return await handleSlotsFound(message, sender);

        case 'CHECK_NOW':
            return await triggerManualCheck();

        default:
            console.log('[SlotHunter] Unknown message type:', message.type);
            return { success: false, error: 'Unknown message type' };
    }
}

// Sync config from backend
async function syncConfig() {
    try {
        const { accessToken } = await chrome.storage.local.get(['accessToken']);
        if (!accessToken) return null;

        const response = await fetch(`${API_BASE}/api/config/latest`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept-Encoding': 'gzip'
            }
        });

        if (response.ok) {
            const config = await response.json();
            await chrome.storage.local.set({ config });
            monitoringConfig = { ...monitoringConfig, ...config.monitoring };
            console.log('[SlotHunter] Config synced:', config.version);
            return config;
        }
    } catch (error) {
        console.error('[SlotHunter] Config sync error:', error);
    }
    return null;
}

// Start slot monitoring
async function startMonitoring(config = {}) {
    const { license, accessToken } = await chrome.storage.local.get(['license', 'accessToken']);

    if (!license || !accessToken) {
        console.log('[SlotHunter] Cannot start monitoring - no valid license');
        return { success: false, error: 'License required' };
    }

    // Merge config
    if (config.targetUrl) monitoringConfig.targetUrl = config.targetUrl;
    if (config.checkIntervalMinutes) monitoringConfig.checkIntervalMinutes = config.checkIntervalMinutes;

    // Set up alarm for periodic checks
    chrome.alarms.create('slotMonitor', {
        periodInMinutes: monitoringConfig.checkIntervalMinutes
    });

    isMonitoring = true;
    await chrome.storage.local.set({
        isMonitoring: true,
        monitoringConfig,
        monitoringStartedAt: new Date().toISOString()
    });

    // Show notification
    showNotification(
        'Monitoring Started',
        `Checking for slots every ${monitoringConfig.checkIntervalMinutes} minutes`
    );

    console.log('[SlotHunter] Monitoring started');
    return { success: true, config: monitoringConfig };
}

// Stop slot monitoring
async function stopMonitoring() {
    await chrome.alarms.clear('slotMonitor');
    isMonitoring = false;

    await chrome.storage.local.set({
        isMonitoring: false,
        monitoringStoppedAt: new Date().toISOString()
    });

    showNotification('Monitoring Stopped', 'Slot monitoring has been disabled');

    console.log('[SlotHunter] Monitoring stopped');
    return { success: true };
}

// Get current status
async function getStatus() {
    const data = await chrome.storage.local.get([
        'license', 'isMonitoring', 'monitoringConfig',
        'lastCheckAt', 'slotsFound', 'checksCount'
    ]);

    return {
        success: true,
        data: {
            isMonitoring: data.isMonitoring || false,
            config: data.monitoringConfig || monitoringConfig,
            lastCheck: data.lastCheckAt || null,
            slotsFound: data.slotsFound || 0,
            totalChecks: data.checksCount || 0,
            hasLicense: !!data.license
        }
    };
}

// Handle alarm - periodic slot check
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'slotMonitor') {
        await performSlotCheck();
    }
});

// Perform slot check by opening VFS tab
async function performSlotCheck() {
    console.log('[SlotHunter] Performing slot check...');

    const { license, accessToken, monitoringConfig: config } =
        await chrome.storage.local.get(['license', 'accessToken', 'monitoringConfig']);

    if (!license || !accessToken) {
        console.log('[SlotHunter] No valid license, stopping monitoring');
        await stopMonitoring();
        return;
    }

    // Update check count
    const { checksCount = 0 } = await chrome.storage.local.get(['checksCount']);
    await chrome.storage.local.set({
        checksCount: checksCount + 1,
        lastCheckAt: new Date().toISOString()
    });

    // If we have a target URL, try to check it
    if (config?.targetUrl) {
        try {
            // Find existing VFS tab or create new one
            const tabs = await chrome.tabs.query({ url: '*://*.vfsglobal.com/*' });

            if (tabs.length > 0) {
                // Refresh existing tab
                await chrome.tabs.reload(tabs[0].id);
                console.log('[SlotHunter] Refreshed VFS tab');
            } else {
                // Content script will handle detection
                console.log('[SlotHunter] No VFS tab open - waiting for user to navigate');
            }
        } catch (error) {
            console.error('[SlotHunter] Tab check error:', error);
        }
    }

    // Report check to backend (for analytics)
    try {
        await fetch(`${API_BASE}/api/extension/heartbeat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                action: 'slot_check',
                timestamp: new Date().toISOString()
            })
        }).catch(() => { }); // Silent fail for analytics
    } catch { }
}

// Trigger manual check
async function triggerManualCheck() {
    await performSlotCheck();
    return { success: true, message: 'Check triggered' };
}

// Handle slots found from content script
async function handleSlotsFound(message, sender) {
    console.log('[SlotHunter] SLOTS FOUND!', message);

    const { slotsFound = 0 } = await chrome.storage.local.get(['slotsFound']);
    await chrome.storage.local.set({
        slotsFound: slotsFound + message.count,
        lastSlotFoundAt: new Date().toISOString(),
        lastSlotUrl: message.url
    });

    // Show urgent notification
    showNotification(
        '🎉 VISA SLOTS AVAILABLE!',
        `${message.count} slot(s) found! Click to book now.`,
        true,
        message.url
    );

    // Flash the extension icon
    flashIcon();

    // Focus the tab with slots
    if (sender?.tab?.id) {
        chrome.tabs.update(sender.tab.id, { active: true });
        chrome.tabs.highlight({ tabs: [sender.tab.index] });
    }

    return { success: true, acknowledged: true };
}

// Show notification (with error handling)
function showNotification(title, message, urgent = false, url = null) {
    const notificationId = `slothunter-${Date.now()}`;

    try {
        chrome.notifications.create(notificationId, {
            type: 'basic',
            title: title,
            message: message,
            priority: urgent ? 2 : 0,
            requireInteraction: urgent
        }, (createdId) => {
            if (chrome.runtime.lastError) {
                console.log('[SlotHunter] Notification error (ignored):', chrome.runtime.lastError.message);
            } else {
                console.log('[SlotHunter] Notification shown:', title);
            }
        });

        // Handle notification click
        if (url) {
            chrome.notifications.onClicked.addListener(function handler(clickedId) {
                if (clickedId === notificationId) {
                    chrome.tabs.create({ url });
                    chrome.notifications.onClicked.removeListener(handler);
                }
            });
        }
    } catch (error) {
        console.log('[SlotHunter] Notification failed (ignored):', error);
    }
}

// Flash extension icon when slots found
async function flashIcon() {
    const colors = ['#10b981', '#f59e0b', '#ef4444'];

    for (let i = 0; i < 6; i++) {
        await chrome.action.setBadgeBackgroundColor({
            color: colors[i % colors.length]
        });
        await chrome.action.setBadgeText({ text: '!' });
        await new Promise(r => setTimeout(r, 300));
    }

    await chrome.action.setBadgeText({ text: '' });
}

// Extension install/update
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        console.log('[SlotHunter] Extension installed');
        // Open welcome/payment page
        chrome.tabs.create({ url: `${API_BASE}/payment` });
    } else if (details.reason === 'update') {
        console.log('[SlotHunter] Updated to', chrome.runtime.getManifest().version);
        await syncConfig();
    }
});

// Startup - restore monitoring state
chrome.runtime.onStartup.addListener(async () => {
    console.log('[SlotHunter] Browser started');

    const { isMonitoring: wasMonitoring, monitoringConfig: savedConfig } =
        await chrome.storage.local.get(['isMonitoring', 'monitoringConfig']);

    if (wasMonitoring) {
        await startMonitoring(savedConfig);
    }
});

// Keep service worker alive
setInterval(() => {
    chrome.runtime.getPlatformInfo(() => { });
}, 25000);

// Programmatic content script injection as fallback
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Only inject on http/https pages
        if (!tab.url.startsWith('http')) return;

        try {
            // Try to inject content script programmatically
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            });
            console.log('[SlotHunter] Content script injected via programmatic injection:', tab.url);
        } catch (error) {
            // Ignore errors (e.g., chrome:// pages, already injected, etc.)
            console.log('[SlotHunter] Script injection skipped:', error.message);
        }
    }
});

console.log('[SlotHunter] Background service worker loaded');

