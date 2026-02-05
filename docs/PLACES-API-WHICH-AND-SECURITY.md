# Which Places API We Use + If You're Worried About Abuse

## Which API does the CRM use?

| In the CRM (Nodal Point) | Google Cloud product name | Endpoint / usage |
|--------------------------|---------------------------|-------------------|
| **Backend only** (Satellite Uplink search, geocode, backfill script) | **Places API (New)** | `https://places.googleapis.com/v1/places:searchText` |

- **`api/maps/geocode.js`** → `places:searchText` (Places API **New**)
- **`api/maps/search.js`** → `places:searchText` (Places API **New**)
- **`scripts/backfill-geocoordinates.js`** → `places:searchText` (Places API **New**)

So in the dashboard, the traffic that matters for the **current CRM** is **"Places API (New)"**. The **"Places API"** (old) traffic is **not** from these backend routes.

## Where can "Places API" (old) traffic come from?

1. **Legacy scripts** – `scripts/widgets/maps.js` and `crm-platform/public/scripts/widgets/maps.js` load the Maps JavaScript API with the **Places library** (`libraries=places`) and call `Place.searchByText()`. That can bill under the old **"Places API"** in the dashboard. If any legacy dashboard or page still loads that script with your key, that would show as "Places API" traffic.
2. **Another app or key** – Another site or app using the same API key with the old Places API.
3. **Key leaked or abused** – If the key was ever unrestricted (no HTTP referrer or API restrictions), someone else could be calling it.

So "Places API" traffic is not proof of a hack; it might be legacy usage or another app. But if you're worried, locking down and rotating the key is the right move.

## What to do (step by step)

### 1. Don’t panic – you’re not removing the key forever

You will **create a new key**, **restrict it**, **use it in the app**, then **delete the old key**. The CRM will keep working with the new key.

### 2. Disable the old "Places API" (stops cost/abuse from that product)

- Go to [APIs & Services → Enabled APIs](https://console.cloud.google.com/apis/library?project=power-choosers-crm).
- Find **"Places API"** (the old one, not "Places API (New)").
- Open it → **Disable**.
- The **current CRM only uses Places API (New)** and Geocoding / Maps JavaScript API, so disabling old Places API does not break the CRM.

### 3. Create a new API key and restrict it

- [Credentials](https://console.cloud.google.com/apis/credentials?project=power-choosers-crm) → **Create credentials** → **API key**.
- Copy the new key; you’ll put it in `.env` in the next step.
- Click the new key to edit:
  - **Application restrictions** → **HTTP referrers (web sites)**.
  - Add:
    - `http://localhost:3000/*`
    - `https://nodalpoint.io/*`
    - Your production URL if different (e.g. `https://*.run.app/*`).
  - **API restrictions** → **Restrict key** → enable **only**:
    - **Maps JavaScript API**
    - **Places API (New)**  
      (If you don’t see "Places API (New)", look for the product that corresponds to `places.googleapis.com/v1`.)
    - **Geocoding API**
  - Save.

### 4. Use the new key in the app

- **Local:** In `crm-platform/.env.local` (and root `.env` if the backend reads from there), set:
  - `NEXT_PUBLIC_GOOGLE_MAPS_KEY=<new-key>`
  - `NEXT_PUBLIC_GOOGLE_MAPS_API=<new-key>`  
  - `GOOGLE_MAPS_API_KEY=<new-key>` (if used by the backend)
- **Production (e.g. Cloud Run):** Set the same env vars for the backend and frontend build.
- Redeploy / restart so the new key is in use.

### 5. Delete the old API key

- Back in [Credentials](https://console.cloud.google.com/apis/credentials?project=power-choosers-crm), open the **old** key → **Delete**.  
- Any traffic or abuse on that key stops immediately.

### 6. Keep Places API (New) – don’t remove it

- You **must** keep **Places API (New)** enabled and allow it on the (new) key. The CRM backend uses it for geocode and search.  
- You are **not** “removing the Places API key” – you are **replacing** the key with a new, restricted one.

## Summary

| Question | Answer |
|----------|--------|
| Which API does the CRM use? | **Places API (New)** only (for backend geocode/search). |
| Is "Places API" (old) traffic a hack? | Not necessarily; can be legacy scripts or another app. Disable old Places API and restrict/rotate the key to be safe. |
| Should I delete my API key? | Create a **new** key, restrict it, use it in the app, then **delete the old** key. Don’t remove the key entirely or the map/search will break. |
| Should I remove Places API? | No. **Disable** the old **"Places API"** product. **Keep** **"Places API (New)"** enabled and on the new key. |
