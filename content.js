// SlotHunter Chrome Extension - Content Script for VFS Global
// Detects available visa appointment slots

console.log('[SlotHunter] Content script loaded on:', window.location.href);

// VFS slot detection configuration
const VFS_SELECTORS = {
    // Common slot indicators (these may need adjustment based on VFS version/country)
    slotAvailable: [
        '.appointment-slot.available',
        '.slot-available',
        '.available-slot',
        '.calendar-day.available',
        'td.available',
        '[data-available="true"]',
        '.slot:not(.disabled):not(.unavailable)',
        '.timeslot:not(.disabled)',
        'button.slot-btn:not(:disabled)'
    ],

    // No slots indicators
    noSlots: [
        '.no-slots',
        '.no-appointments',
        '.fully-booked',
        '.no-availability',
        'p:contains("no available appointments")',
        'span:contains("no slots available")'
    ],

    // Page elements that indicate we're on booking page
    bookingPage: [
        '#appointment-table',
        '.appointment-calendar',
        '.booking-calendar',
        '.slot-selection',
        '#calendarTable',
        '.time-slots-container',
        '#dvCalendar'
    ],

    // Date/time slot buttons
    dateSlots: [
        '.calendar-day:not(.disabled)',
        'td.calendar-cell:not(.disabled)',
        '.date-slot',
        '.available-date'
    ]
};

// State tracking
let lastSlotCount = 0;
let isChecking = false;
let observer = null;

// Initialize
(async () => {
    const { license, accessToken } = await chrome.storage.local.get(['license', 'accessToken']);

    if (!license || !accessToken) {
        console.log('[SlotHunter] No active license - readonly mode');
        return;
    }

    console.log('[SlotHunter] Licensed - initializing slot detection');
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

    try {
        // First check if we're on a booking page
        const isBookingPage = VFS_SELECTORS.bookingPage.some(selector => {
            try {
                return document.querySelector(selector) !== null;
            } catch {
                return false;
            }
        });

        if (!isBookingPage) {
            console.log('[SlotHunter] Not on booking page');
            isChecking = false;
            return;
        }

        console.log('[SlotHunter] On booking page, checking slots...');

        // Count available slots
        let slotCount = 0;
        const foundSlots = [];

        for (const selector of VFS_SELECTORS.slotAvailable) {
            try {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    slotCount += elements.length;
                    elements.forEach(el => {
                        foundSlots.push({
                            text: el.textContent?.trim().slice(0, 50),
                            selector: selector
                        });
                    });
                }
            } catch (e) {
                // Invalid selector, skip
            }
        }

        // Also try to detect by text content
        const textIndicators = [
            'available',
            'book now',
            'select appointment',
            'choose this slot'
        ];

        const allButtons = document.querySelectorAll('button, a.btn, input[type="button"]');
        allButtons.forEach(btn => {
            const text = btn.textContent?.toLowerCase() || '';
            if (textIndicators.some(t => text.includes(t)) && !btn.disabled) {
                slotCount++;
                foundSlots.push({
                    text: btn.textContent?.trim().slice(0, 30),
                    type: 'button'
                });
            }
        });

        // Highlight found slots
        if (slotCount > 0) {
            highlightSlots();
        }

        // If slots found and count changed, notify background
        if (slotCount > 0 && slotCount !== lastSlotCount) {
            console.log('[SlotHunter] 🎉 SLOTS FOUND:', slotCount);

            // Play sound alert
            playAlertSound();

            // Show visual indicator
            showSlotIndicator(slotCount);

            // Notify background script
            chrome.runtime.sendMessage({
                type: 'SLOTS_FOUND',
                count: slotCount,
                url: window.location.href,
                slots: foundSlots.slice(0, 5), // First 5 slots info
                timestamp: new Date().toISOString()
            });

            lastSlotCount = slotCount;
        } else if (slotCount === 0) {
            console.log('[SlotHunter] No slots available');
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

    // Highlight slot elements
    for (const selector of VFS_SELECTORS.slotAvailable) {
        try {
            document.querySelectorAll(selector).forEach(el => {
                el.classList.add('slothunter-highlight');
            });
        } catch { }
    }
}

// Show floating indicator
function showSlotIndicator(count) {
    let indicator = document.getElementById('slothunter-indicator');

    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'slothunter-indicator';
        indicator.className = 'slothunter-indicator';
        document.body.appendChild(indicator);
    }

    indicator.innerHTML = `🎯 ${count} SLOT${count > 1 ? 'S' : ''} AVAILABLE!`;
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
