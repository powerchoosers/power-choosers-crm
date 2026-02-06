# Why "Can't find geolocation" After Restricting the Maps Key

## What happened

We restricted **"API key 1"** to **HTTP referrers** (browser only):

- `http://localhost:3000/*`
- `https://nodalpoint.io/*`
- `https://*.run.app/*`

So only **browser** requests that send one of those as the `Referer` header are allowed.

**Geocode is called from your backend**, not the browser:

1. Browser → `https://nodalpoint.io/api/maps/geocode?address=...` (your backend)
2. **Backend (Cloud Run)** → `https://places.googleapis.com/v1/places:searchText` with the API key

That second request is **server → Google**. Servers don’t send a browser-style `Referer`, so Google rejects it and you see "can't find geolocation".

So: **one key + referrer restriction = server geocode is blocked.**

---

## Fix (choose one)

### Option A – Quick fix: allow the key from anywhere again

So the **same** key works in both the browser and the backend:

1. [Credentials](https://console.cloud.google.com/apis/credentials?project=power-choosers-crm)
2. Open **"API key 1"**
3. **Application restrictions** → choose **"None"**
4. Save

Map and geocode will work again. The key is less protected (anyone with the key can call the APIs).

---

### Option B – Two keys (better security)

Use one key for the **browser** (referrer-restricted) and one for the **server** (no referrer).

**1. Create a server-only key**

1. [Credentials](https://console.cloud.google.com/apis/credentials?project=power-choosers-crm) → **Create credentials** → **API key**
2. Name it e.g. **"Server Geocode/Places"**
3. **Application restrictions** → **None** (so the backend can use it)
4. **API restrictions** → **Restrict key** → enable only:
   - **Places API (New)**
   - **Geocoding API**
5. Save and **copy the key string**

**2. Use it only on the backend**

- **Cloud Run:** add env var `GOOGLE_MAPS_API_KEY` = that key (do **not** set `NEXT_PUBLIC_GOOGLE_MAPS_KEY` to it).
- **Local:** in root `.env` set `GOOGLE_MAPS_API_KEY` = that key.

**3. Keep "API key 1" for the frontend**

- Leave **"API key 1"** with **HTTP referrers** (localhost, nodalpoint.io, *.run.app).
- Keep using it in the app as `NEXT_PUBLIC_GOOGLE_MAPS_KEY` (Maps JavaScript API in the browser).

Your backend (`api/maps/geocode.js`) already uses `GOOGLE_MAPS_API_KEY` first, so once that’s set to the new key on the server, geocode will work again without opening the browser key to the world.
