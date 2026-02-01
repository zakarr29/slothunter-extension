// SlotHunter Chrome Extension - Content Script for VFS Global
// Detects available visa appointment slots

// ========== INJECTION DEBUG ==========
console.log('%c[SlotHunter] 🚀 CONTENT SCRIPT LOADED!', 'color: #10b981; font-size: 16px; font-weight: bold;');
console.log('[SlotHunter] URL:', window.location.href);
console.log('[SlotHunter] Hostname:', window.location.hostname);

// ========== VFS HOSTNAME CHECK ==========
const isVFSPage = window.location.hostname.includes('vfsglobal.com') ||
    window.location.hostname.includes('vfs') ||
    window.location.href.includes('visa') ||
    window.location.href.includes('appointment');

if (!isVFSPage) {
    console.log('[SlotHunter] ⚠️ Not a VFS/visa page, skipping slot detection');
    // Don't run slot detection on non-VFS pages
} else {
    console.log('[SlotHunter] ✅ VFS/visa page detected, initializing slot detection...');
}

// Slot text patterns to search for (regex patterns)
const SLOT_PATTERNS = [
    /earliest\s+available\s+slot.*?(\d{2}[-\/]\d{2}[-\/]\d{4})/i,
    /available\s+slot\s+(?:is|for).*?(\d{2}[-\/]\d{2}[-\/]\d{4})/i,
    /next\s+available.*?(\d{2}[-\/]\d{2}[-\/]\d{4})/i,
    /appointment\s+available.*?(\d{2}[-\/]\d{2}[-\/]\d{4})/i,
    /(\d{2}[-\/]\d{2}[-\/]\d{4}).*?(?:available|slot)/i
];

// State tracking
let lastSlotCount = 0;
let isChecking = false;
let observer = null;
let hasAlerted = false;

// Initialize only on VFS pages
(async () => {
    if (!isVFSPage) {
        console.log('[SlotHunter] Skipping - not a VFS page');
        return;
    }

    const { license, accessToken } = await chrome.storage.local.get(['license', 'accessToken']);

    if (!license || !accessToken) {
        console.log('[SlotHunter] No active license - readonly mode');
        return;
    }

    console.log('[SlotHunter] Licensed + VFS page - starting slot detection!');
    initSlotDetection();
})();

function initSlotDetection() {
    // Initial check
    setTimeout(checkForSlots, 2000);

    // Set up mutation observer for dynamic content
    observer = new MutationObserver((mutations) => {
        // Debounce rapid mutations
        clearTimeout(window.slotHunterDebounce);
        window.slotHunterDebounce = setTimeout(() => {
            checkForSlots();
        }, 500);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });

    // Also check on page visibility change
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkForSlots();
        }
    });

    // Periodic check every 30 seconds
    setInterval(checkForSlots, 30000);
}

function checkForSlots() {
    if (isChecking) return;
    isChecking = true;

    console.log('[SlotHunter] Checking for available slots via text patterns...');

    try {
        // Get full page text content
        const pageText = document.body.innerText || document.body.textContent || '';

        let slotCount = 0;
        const foundSlots = [];

        // Check each pattern against page text
        for (const pattern of SLOT_PATTERNS) {
            const match = pageText.match(pattern);
            if (match) {
                slotCount++;
                const slotInfo = {
                    fullMatch: match[0].slice(0, 100),
                    date: match[1],
                    pattern: pattern.toString().slice(0, 50)
                };
                foundSlots.push(slotInfo);
                console.log('%c[SlotHunter] 🎯 SLOT DATE FOUND!', 'color: #f59e0b; font-size: 14px; font-weight: bold;', slotInfo);
            }
        }

        // Also try direct date search with context
        const datePattern = /(\d{2}[-\/]\d{2}[-\/]\d{4})/g;
        const allDates = pageText.match(datePattern);
        if (allDates && allDates.length > 0) {
            console.log('[SlotHunter] Dates found on page:', allDates);

            // Check if any date is near "available" or "slot" text
            allDates.forEach(date => {
                const dateIndex = pageText.indexOf(date);
                const context = pageText.slice(Math.max(0, dateIndex - 100), dateIndex + 50).toLowerCase();

                if (context.includes('available') || context.includes('slot') || context.includes('earliest')) {
                    if (!foundSlots.find(s => s.date === date)) {
                        slotCount++;
                        foundSlots.push({
                            date: date,
                            context: context.slice(0, 80),
                            type: 'date-context'
                        });
                        console.log('[SlotHunter] 🎯 Date with slot context:', date, context.slice(0, 50));
                    }
                }
            });
        }

        // If slots found and not already alerted
        if (slotCount > 0 && !hasAlerted) {
            console.log('%c[SlotHunter] 🎉🎉🎉 SLOTS AVAILABLE! 🎉🎉🎉', 'color: #10b981; font-size: 20px; font-weight: bold;');

            hasAlerted = true;

            // Play sound alert
            playAlertSound();

            // Show visual indicator
            showSlotIndicator(slotCount, foundSlots[0]?.date);

            // Notify background script
            chrome.runtime.sendMessage({
                type: 'SLOTS_FOUND',
                count: slotCount,
                url: window.location.href,
                slots: foundSlots.slice(0, 5),
                timestamp: new Date().toISOString()
            });

            lastSlotCount = slotCount;
        } else if (slotCount === 0) {
            console.log('[SlotHunter] No slots found in page text');
            hideSlotIndicator();
        }

    } catch (error) {
        console.error('[SlotHunter] Slot check error:', error);
    } finally {
        isChecking = false;
    }
}

// Highlight available slot elements
function highlightSlots() {
    const style = document.getElementById('slothunter-style') || (() => {
        const s = document.createElement('style');
        s.id = 'slothunter-style';
        document.head.appendChild(s);
        return s;
    })();

    style.textContent = `
    .slothunter-highlight {
      outline: 3px solid #10b981 !important;
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.5) !important;
      animation: slothunter-pulse 1s infinite !important;
    }
    
    @keyframes slothunter-pulse {
      0%, 100% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.5); }
      50% { box-shadow: 0 0 40px rgba(16, 185, 129, 0.8); }
    }
    
    .slothunter-indicator {
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #10b981, #06b6d4);
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      font-size: 18px;
      font-weight: bold;
      z-index: 999999;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      animation: slothunter-bounce 0.5s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    @keyframes slothunter-bounce {
      0% { transform: scale(0); }
      50% { transform: scale(1.1); }
      100% { transform: scale(1); }
    }
  `;
}

// Show floating indicator
function showSlotIndicator(count, date) {
    // Inject styles first
    highlightSlots();

    let indicator = document.getElementById('slothunter-indicator');

    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'slothunter-indicator';
        indicator.className = 'slothunter-indicator';
        document.body.appendChild(indicator);
    }

    const dateText = date ? ` - ${date}` : '';
    indicator.innerHTML = `🎯 ${count} SLOT${count > 1 ? 'S' : ''} FOUND!${dateText}`;
    indicator.style.display = 'block';
}

function hideSlotIndicator() {
    const indicator = document.getElementById('slothunter-indicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

// Play alert sound
function playAlertSound() {
    try {
        // Create audio context for alert sound
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.3;

        oscillator.start();

        // Beep pattern: beep-beep-beep
        setTimeout(() => gainNode.gain.value = 0, 200);
        setTimeout(() => gainNode.gain.value = 0.3, 300);
        setTimeout(() => gainNode.gain.value = 0, 500);
        setTimeout(() => gainNode.gain.value = 0.3, 600);
        setTimeout(() => gainNode.gain.value = 0, 800);
        setTimeout(() => oscillator.stop(), 900);

    } catch (e) {
        console.error('[SlotHunter] Audio error:', e);
    }
}

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'CHECK_SLOTS':
            checkForSlots();
            sendResponse({ status: 'checked', slotCount: lastSlotCount });
            break;

        case 'GET_PAGE_INFO':
            sendResponse({
                url: window.location.href,
                title: document.title,
                isBookingPage: VFS_SELECTORS.bookingPage.some(s => {
                    try { return document.querySelector(s) !== null; } catch { return false; }
                }),
                lastSlotCount
            });
            break;

        case 'HIGHLIGHT_SLOTS':
            highlightSlots();
            sendResponse({ success: true });
            break;
    }

    return true;
});

console.log('[SlotHunter] Content script initialized');
