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
