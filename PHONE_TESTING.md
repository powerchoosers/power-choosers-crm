# Phone Calling - Testing Instructions

## Current Status
✅ Server is running on localhost:3000
✅ JWT endpoint working
✅ Call API working
✅ API_BASE_URL configuration updated

## Quick Test (Local)

1. **Open your CRM locally:**
   ```
   http://localhost:3000/crm-dashboard.html
   ```

2. **Open browser DevTools** (F12) and check console for:
   ```
   🔧 Phone calling config: { ... }
   ```
   Should show `isDevelopment: true` and `apiBase: "http://localhost:3000"`

3. **Click the phone icon** in the top bar (next to search)

4. **Enter a test number** like `+19202683260` and click Call

## Production Test (powerchoosers.com)

### Option A: Use ngrok (Recommended)

1. **In a new terminal, start ngrok:**
   ```bash
   ngrok http 3000
   ```

2. **Copy the HTTPS URL** (e.g., `https://abc123-def456.ngrok-free.app`)

3. **Go to powerchoosers.com/crm-dashboard.html**

4. **Open DevTools console and run:**
   ```javascript
   localStorage.setItem('API_BASE_URL', 'https://your-ngrok-url.ngrok-free.app')
   ```

5. **Refresh the page** and try calling

### Option B: Deploy server to production

- Deploy your server.js to a cloud service (Heroku, Railway, etc.)
- Update localStorage with the production URL

## Troubleshooting

### Browser Calling Issues
- **Check HTTPS:** Browser calling requires HTTPS (localhost:3000 is OK)
- **Check microphone permissions:** Click the 🔒 icon in browser address bar
- **Check console:** Look for Vonage SDK errors

### Fallback Calling Issues
- **Check API_BASE_URL:** Should point to your server
- **Check CORS:** Server has CORS enabled for all origins
- **Check server logs:** Watch terminal running server.js

## Testing Commands (Browser Console)

```javascript
// Check current API config
console.log('API_BASE_URL:', window.API_BASE_URL);

// Test JWT endpoint
fetch(window.API_BASE_URL + '/api/vonage/jwt?user=agent')
  .then(r => r.json())
  .then(console.log);

// Test server calling directly
window.callPSTN('+19202683260');

// Test browser calling (if supported)
window.callBrowser('+19202683260');
```

## Expected Behavior

1. **Click phone button** → Phone widget opens in right panel
2. **Enter number** → Number is normalized to E.164 format
3. **Click Call** → Attempts browser call first, falls back to server call
4. **Success** → Toast shows "Calling..." then either "Call connected" or "Fallback: ringing your phone now"

## Common Issues

- **405 Method Not Allowed:** You accessed /api/vonage/call with GET instead of POST
- **Missing API_BASE_URL:** Check the configuration script worked
- **CORS Error:** Server should allow all origins (*)
- **JWT Error:** Check private.key file exists and is readable
