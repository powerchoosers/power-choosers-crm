# Google Maps + Gemini not working – gcloud findings and fix

## If both Maps and Gemini stopped: unpaid balance (most likely)

**Google can halt or throttle all APIs on a project until the billing balance is paid.** The Maps API spike (~$77) would show up as an unpaid balance. Until that’s paid, you can see:

- **Maps**: ApiProjectMapError, “This page can’t load Google Maps correctly,” “For development purposes only” watermark.
- **Gemini**: Requests fail or return auth/quota errors even though the key is correct.

**What to do:**

1. **Check and pay the balance**
   - Open: [Billing – Google Cloud](https://console.cloud.google.com/billing)
   - Select the billing account linked to **power-choosers-crm**.
   - Check **Overview** (or **Reports**) for any **unpaid balance** or **past due**.
   - Pay the balance (or update payment method and pay).
2. **Wait and retry**
   - After payment, wait a few minutes (sometimes up to an hour). Google may need to re-enable APIs.
   - Reload the Infrastructure Map and try Gemini chat again.
3. **If Gemini still fails after paying**
   - Ensure the **backend** has a Gemini key: `FREE_GEMINI_KEY` or `GEMINI_API_KEY` in the environment where the Node server runs (root `.env` for local, Cloud Run / deployment env for production). The app uses `api/gemini/chat.js`, which reads `process.env.FREE_GEMINI_KEY || process.env.GEMINI_API_KEY`.
   - In Cloud Console, confirm [Generative Language API](https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com?project=power-choosers-crm) is enabled for **power-choosers-crm**.

---

## What gcloud showed (browser auth used)

| Check | Result |
|-------|--------|
| **Project** | `power-choosers-crm` (project number `792458658491`) |
| **Billing** | Enabled (`billingAccounts/01218C-2F3FEB-6E3CFB`) |
| **Maps-related APIs enabled** | `maps-backend.googleapis.com`, `geocoding-backend.googleapis.com`, `places-backend.googleapis.com`, `maps-embed-backend.googleapis.com`, others |

So billing is on and the Maps backend (Maps JavaScript API) is enabled for this project.

## What ApiProjectMapError means

From [Google’s docs](https://developers.google.com/maps/documentation/javascript/error-messages#api-project-map-error):

> Either the provided API key or the API project with which it is associated could not be resolved. This error may be temporary. If it persists you may need to get a new API key or create a new API project.

So the problem is usually one of:

1. **API key belongs to a different project** – The key in the app (`NEXT_PUBLIC_GOOGLE_MAPS_KEY`) was created in another GCP project. Maps can’t resolve it to **power-choosers-crm**.
2. **Referrer (HTTP) restrictions** – The key is in this project but the current site URL isn’t in the allowed referrers, so the key is effectively “unresolved” for that request.
3. **Temporary resolution issue** – Less common; retry or create a new key.

## Fix steps (Console)

1. **Confirm the key and project**
   - Open: [Credentials – power-choosers-crm](https://console.cloud.google.com/apis/credentials?project=power-choosers-crm)
   - Find the key you use for Maps (the value in `NEXT_PUBLIC_GOOGLE_MAPS_KEY` in your env — never commit this key to git).
   - If it’s **not** listed there, the key was created in a **different project**. Either:
     - Switch to that project in the console and fix referrer/billing there, or  
     - Create a **new** API key in **power-choosers-crm** and put that in `NEXT_PUBLIC_GOOGLE_MAPS_KEY` in `crm-platform/.env.local`.

2. **If the key is in this project – set referrers**
   - Click the key → **Application restrictions** → **HTTP referrers (web sites)**.
   - Add:
     - `http://localhost:3000/*`
     - `https://nodalpoint.io/*`
     - Your Cloud Run / production URL if different (e.g. `https://*.run.app/*` if needed).
   - **API restrictions**: allow at least **Maps JavaScript API** (and any others you use, e.g. Geocoding, Places).
   - Save and wait a couple of minutes.

3. **Optional: ensure Maps JavaScript API is enabled**
   - [Enable Maps JavaScript API](https://console.cloud.google.com/apis/library/maps-backend.googleapis.com?project=power-choosers-crm) (maps-backend) for **power-choosers-crm** if it’s not already.

4. **If it still fails**
   - Create a **new** API key in **power-choosers-crm** (Credentials → Create credentials → API key).
   - Restrict it (HTTP referrers + Maps JavaScript API), then replace `NEXT_PUBLIC_GOOGLE_MAPS_KEY` in `crm-platform/.env.local` with the new key and redeploy/restart.

## Re-authenticate gcloud (browser)

If you need to run more gcloud commands with your account:

```bash
gcloud auth login
```

Complete the sign-in in the browser when it opens.

---

## Gemini keys in this project

| Use | Env var | Where |
|-----|---------|--------|
| Chat (GeminiChat, useAI) | `FREE_GEMINI_KEY` or `GEMINI_API_KEY` | Backend only (root `.env` or Cloud Run env). Used by `api/gemini/chat.js`. |
| Client-side (if any) | `NEXT_PUBLIC_FREE_GEMINI_KEY` | Frontend; not used by `api/gemini/chat.js`. |
| Other backend (doc analysis, call scripts, etc.) | `FREE_GEMINI_KEY` or `GEMINI_API_KEY` | Same as chat. |

If Maps and Gemini both stopped after the API spike, paying the Google Cloud billing balance is the first step; then confirm the backend has `FREE_GEMINI_KEY` or `GEMINI_API_KEY` set where the server runs.
