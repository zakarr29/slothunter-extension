// SlotHunter Chrome Extension - Popup Script

const API_BASE = 'https://slothunter-backend.vercel.app';

// DOM Elements
const statusBadge = document.getElementById('status-badge');
const statusText = document.querySelector('.status-text');
const activationSection = document.getElementById('activation-section');
const licenseSection = document.getElementById('license-section');
const licenseKeyInput = document.getElementById('license-key');
const activateBtn = document.getElementById('activate-btn');
const errorMessage = document.getElementById('error-message');
const deactivateBtn = document.getElementById('deactivate-btn');

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
    await checkLicenseStatus();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    activateBtn.addEventListener('click', handleActivation);
    deactivateBtn.addEventListener('click', handleDeactivation);

    // Format license key input
    licenseKeyInput.addEventListener('input', (e) => {
        let value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
        e.target.value = value;
    });

    // Enter key to submit
    licenseKeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleActivation();
    });

    // Monitoring controls
    const startBtn = document.getElementById('start-monitoring');
    const stopBtn = document.getElementById('stop-monitoring');

    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            startBtn.disabled = true;
            startBtn.textContent = 'Starting...';

            const response = await chrome.runtime.sendMessage({
                type: 'START_MONITORING',
                config: { checkIntervalMinutes: 5 }
            });

            if (response?.success) {
                startBtn.style.display = 'none';
                stopBtn.style.display = 'block';
                updateMonitoringStats();
            }
            startBtn.disabled = false;
            startBtn.textContent = '▶️ Start Monitoring';
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', async () => {
            stopBtn.disabled = true;
            await chrome.runtime.sendMessage({ type: 'STOP_MONITORING' });
            stopBtn.style.display = 'none';
            startBtn.style.display = 'block';
            stopBtn.disabled = false;
        });
    }
}

// Check license status from storage
async function checkLicenseStatus() {
    try {
        const result = await chrome.storage.local.get(['license', 'accessToken']);

        if (result.license && result.accessToken) {
            // Validate with server
            const isValid = await validateLicenseWithServer(result.accessToken);

            if (isValid) {
                showActivatedState(result.license);
            } else {
                showDeactivatedState();
            }
        } else {
            showDeactivatedState();
        }
    } catch (error) {
        console.error('Error checking license:', error);
        showDeactivatedState();
    }
}

// Validate license with server
async function validateLicenseWithServer(accessToken) {
    try {
        const response = await fetch(`${API_BASE}/api/licenses/status`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) return false;

        const data = await response.json();
        return data.success && data.data?.status === 'ACTIVE';
    } catch {
        return false;
    }
}

// Handle license activation
async function handleActivation() {
    const licenseKey = licenseKeyInput.value.trim();

    if (!licenseKey) {
        showError('Please enter your license key');
        return;
    }

    // Validate format
    if (!isValidLicenseFormat(licenseKey)) {
        showError('Invalid license key format');
        return;
    }

    setLoading(true);
    clearError();

    try {
        // Generate device fingerprints
        const fingerprints = await generateFingerprints();

        const response = await fetch(`${API_BASE}/api/extension/activate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                licenseKey,
                browserFingerprint: fingerprints.browser,
                hardwareFingerprint: fingerprints.hardware
            })
        });

        const data = await response.json();

        if (data.success) {
            // Store license info
            await chrome.storage.local.set({
                license: {
                    key: licenseKey,
                    planType: data.data.planType,
                    expiresAt: data.data.expiresAt,
                    activatedAt: new Date().toISOString()
                },
                accessToken: data.data.accessToken,
                refreshToken: data.data.refreshToken
            });

            showActivatedState({
                key: licenseKey,
                planType: data.data.planType,
                expiresAt: data.data.expiresAt
            });

            // Notify background script
            chrome.runtime.sendMessage({ type: 'LICENSE_ACTIVATED' });

        } else {
            showError(data.error || 'Activation failed');
        }

    } catch (error) {
        console.error('Activation error:', error);
        showError('Connection error. Please try again.');
    } finally {
        setLoading(false);
    }
}

// Handle deactivation
async function handleDeactivation() {
    if (!confirm('Deactivate this device? You can reactivate later.')) return;

    await chrome.storage.local.remove(['license', 'accessToken', 'refreshToken']);
    showDeactivatedState();

    // Notify background script
    chrome.runtime.sendMessage({ type: 'LICENSE_DEACTIVATED' });
}

// Generate device fingerprints
async function generateFingerprints() {
    const components = [];

    // Screen info
    components.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);

    // Timezone
    components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);

    // Languages
    components.push(navigator.languages?.join(',') || navigator.language);

    // Platform
    components.push(navigator.platform);

    // Hardware concurrency
    components.push(navigator.hardwareConcurrency || 'unknown');

    // Device memory (if available)
    components.push(navigator.deviceMemory || 'unknown');

    // Canvas fingerprint
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('SlotHunter Fingerprint', 2, 2);
    const canvasData = canvas.toDataURL();

    // Generate hashes
    const browserHash = await hashString(components.join('|'));
    const hardwareHash = await hashString(canvasData + components.slice(0, 5).join('|'));

    return {
        browser: `BFP-${browserHash.slice(0, 16)}`,
        hardware: `HFP-${hardwareHash.slice(0, 16)}`
    };
}

// Simple hash function
async function hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Validate license key format
function isValidLicenseFormat(key) {
    // Format: SH-XXXX-XXXX-XXXX-XXXX
    return /^SH-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key);
}

// UI State Functions
function showActivatedState(license) {
    statusBadge.className = 'status-badge active';
    statusText.textContent = 'Active';

    activationSection.style.display = 'none';
    licenseSection.style.display = 'block';

    document.getElementById('license-display').textContent = formatLicenseKey(license.key);
    document.getElementById('plan-display').textContent = license.planType;
    document.getElementById('expires-display').textContent =
        license.expiresAt ? new Date(license.expiresAt).toLocaleDateString() : 'Lifetime';
}

function showDeactivatedState() {
    statusBadge.className = 'status-badge inactive';
    statusText.textContent = 'Not Activated';

    activationSection.style.display = 'block';
    licenseSection.style.display = 'none';
    licenseKeyInput.value = '';
}

function formatLicenseKey(key) {
    if (!key) return '-';
    // Show first and last parts: SH-XXXX-****-****-XXXX
    const parts = key.split('-');
    if (parts.length >= 5) {
        return `${parts[0]}-${parts[1]}-****-****-${parts[4]}`;
    }
    return key;
}

function setLoading(loading) {
    activateBtn.disabled = loading;
    activateBtn.querySelector('.btn-text').style.display = loading ? 'none' : 'inline';
    activateBtn.querySelector('.btn-loading').style.display = loading ? 'inline' : 'none';
}

function showError(message) {
    errorMessage.textContent = message;
}

function clearError() {
    errorMessage.textContent = '';
}

// Update monitoring stats display
async function updateMonitoringStats() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
        if (response?.success) {
            const stats = response.data;
            console.log('[SlotHunter] Monitoring stats:', stats);

            // Update button visibility based on monitoring state
            const startBtn = document.getElementById('start-monitoring');
            const stopBtn = document.getElementById('stop-monitoring');

            if (stats.isMonitoring) {
                if (startBtn) startBtn.style.display = 'none';
                if (stopBtn) stopBtn.style.display = 'block';
            } else {
                if (startBtn) startBtn.style.display = 'block';
                if (stopBtn) stopBtn.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('[SlotHunter] Error getting stats:', error);
    }
}

// Check monitoring status on load
async function initMonitoringState() {
    const { isMonitoring } = await chrome.storage.local.get(['isMonitoring']);
    const startBtn = document.getElementById('start-monitoring');
    const stopBtn = document.getElementById('stop-monitoring');

    if (isMonitoring) {
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'block';
    }
}

// Call on load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initMonitoringState, 100);
});

