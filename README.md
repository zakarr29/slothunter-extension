# SlotHunter Chrome Extension

Automate visa slot hunting. Never miss a slot again.

## Installation (Developer Mode)

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select this folder (`slothunter-extension`)
5. Extension is now installed!

## Usage

1. **Get a License**: Visit [SlotHunter Payment](https://slothunter-backend.vercel.app/payment)
2. **Activate**: Click the extension icon, enter your license key
3. **Monitor**: Start slot monitoring for VFS Global websites

## Features

- ✅ License activation with device binding
- ✅ Device fingerprinting (browser + hardware)
- ✅ Secure token storage in chrome.storage
- ⏳ VFS Global slot detection (coming soon)
- ⏳ Auto-booking (coming soon)
- ⏳ Notifications when slots available

## Files

- `manifest.json` - Extension configuration (Manifest V3)
- `popup.html/css/js` - Extension popup UI
- `background.js` - Background service worker
- `content.js` - VFS website content script

## Development

### Icons
Create PNG icons from the SVG:
```bash
# Install imagemagick if needed
brew install imagemagick

# Convert SVG to PNGs
convert icons/icon128.svg -resize 128x128 icons/icon128.png
convert icons/icon128.svg -resize 48x48 icons/icon48.png
convert icons/icon128.svg -resize 16x16 icons/icon16.png
```

### Testing License Activation
1. Create a test payment at `/payment`
2. Copy the generated license key
3. Paste in extension popup
4. Check Chrome DevTools for activation logs

## API Endpoints

- `POST /api/licenses/activate` - Activate license with device binding
- `GET /api/licenses/status` - Check license status
- `POST /api/payment/create-mock` - Create test payment (mock)

## License

Proprietary - SlotHunter Team
