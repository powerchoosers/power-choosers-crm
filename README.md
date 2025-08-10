# Power Choosers CRM - Vonage Voice Integration

## Quick Start
1. Copy `.env.example` to `.env` and set:
   - `VONAGE_APPLICATION_ID=e29347ed-7cb3-4d58-b461-6f47647760bf` (or your app ID)
   - `VONAGE_FROM_NUMBER=14693518845` (E.164 without + is fine in env)
   - `PORT=5550` (or any free port)
2. Place your Vonage application private key file as `private.key` in the project root.
3. Install deps (if any) and run server:
   ```bash
   node server.js
   ```
4. Open `http://localhost:<PORT>/crm-dashboard.html`, click the phone icon, dial a number in E.164 (e.g. `9728342317` for +1 972-834-2317) and press Call.

## Notes
- Backend `server.js` proxies to Vonage Voice API using JWT (RS256). It reads:
  - `VONAGE_APPLICATION_ID`
  - `VONAGE_FROM_NUMBER`
  - `private.key`
- The Vonage application must be a Voice API app (not VBC), and your number must be linked under the app's Voice settings.
- For trial accounts, destination numbers must be verified in the Vonage dashboard.

## Security
- `.gitignore` excludes `private.key` and `.env`. Never commit secrets.
- If you ever exposed your private key, rotate it in the Vonage dashboard and replace `private.key`.

## Troubleshooting
- If calls fail with `to.type: vbc`, disable VBC capability on the application or create a Voice-only app and link your number.
- If you need detailed events, you can temporarily add an `event_url` in `server.js` (not needed for production).

## Environment Variables
- `VONAGE_APPLICATION_ID` (required) — Voice API Application ID.
- `VONAGE_FROM_NUMBER` (required) — Your Vonage phone number in E.164 (e.g. +14693518845). You can store without `+` in `.env` if preferred.
- `VONAGE_PRIVATE_KEY` (optional) — The PEM private key contents for the application. If not provided, backend will read `private.key` file from the project root.
- `PORT` (optional) — HTTP port for `server.js` (default 5500 as coded; README uses 5550 as an example).
- `ALLOWED_ORIGINS` (optional) — Comma-separated list of extra origins to allow via CORS (e.g. `https://app.example.com,https://admin.example.com`).

## CORS and Cross-Origin Setup
Backend CORS allowlist in `server.js` includes by default:
- `https://powerchoosers.com`
- `http://localhost:5555` and `http://localhost:5550`
- Any `*.ngrok-free.app` subdomain

You can extend this list via `ALLOWED_ORIGINS` in `.env`. Restart the server after changes.

## Frontend API Base URL
The frontend module `js/modules/calls.js` reads an API base URL so the site can call a remote backend:
- `window.CRM_API_BASE_URL = 'https://<your-api-host>'` set in an inline `<script>` on the page, or
- `localStorage.setItem('CRM_API_BASE_URL', 'https://<your-api-host>')`

If not set, it uses relative paths (same origin), i.e. `/api/...`.

## Running Locally
1. Create `.env` and `private.key` as above.
2. Run: `node server.js`
3. Open `http://localhost:<PORT>/crm-dashboard.html`

## Testing via ngrok (public URL)
1. Start the backend: `node server.js`
2. In another terminal: `ngrok http <PORT>`
3. Copy the `https://<subdomain>.ngrok-free.app` URL
4. In the browser (on `powerchoosers.com` or localhost), set:
   ```js
   localStorage.setItem('CRM_API_BASE_URL', 'https://<subdomain>.ngrok-free.app');
   location.reload();
   ```
By default, ngrok domains are allowed by CORS. If you use a different domain, add it to `ALLOWED_ORIGINS`.

## Deploying the Frontend
Static files are under the project root:
- HTML: `crm-dashboard.html`, `index.html`
- JS: `js/` and `js/modules/`
- CSS: `css/` and root CSS files

Ensure the entire `js/` folder is uploaded so URLs like `/js/main.js` and `/js/modules/calls.js` resolve. Verify in the browser console that no 404s occur.

## Deploying the Backend
Option A: Run `server.js` on a Node-capable host (VPS/VM/PM2). Set env vars (`.env`) and keep `private.key` secure. Expose port via reverse proxy (e.g., Nginx).

Option B: Serverless/runtime platforms (reference implementation required):
- Vonage Cloud Runtime requires functions added to an Instance, with secrets as environment variables. Adapt `/api/vonage/call` and `/api/vonage/call/status` to separate function handlers and add CORS headers in each.

## API Endpoints
- `POST /api/vonage/call` — Body `{ to: "+19725551234" }`. Returns JSON from Vonage; includes `uuid` when accepted.
- `GET /api/vonage/call/status?uuid=<id>` — Returns current call status JSON.

## Project Structure (suggested)
```
power-choosers-crm/
├─ crm-dashboard.html
├─ index.html
├─ js/
│  ├─ main.js
│  └─ modules/
│     ├─ calls.js
│     ├─ utils.js
│     └─ ...
├─ css/
├─ images/
├─ server.js
├─ .env.example
├─ .gitignore
├─ README.md
└─ package.json (optional)
