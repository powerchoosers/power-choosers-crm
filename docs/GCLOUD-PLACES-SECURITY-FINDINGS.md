# gcloud Places API & Security Findings

Findings from `gcloud` (project: **power-choosers-crm**, project number: **792458658491**).

---

## 1. Where Places API was being used (key configuration)

**API key “API key 1”** (ID: `4dfb364a-f32f-4831-91a1-b798291a4317`):

- **API restrictions:** Key is restricted to many Maps-related services, including:
  - `places-backend.googleapis.com` (old Places API)
  - `places.googleapis.com` (Places API New)
  - `maps-backend.googleapis.com`, `geocoding-backend.googleapis.com`, etc.
- **Application restrictions:** **None.** There are no `browserKeyRestrictions` (HTTP referrers) or `serverKeyRestrictions` (IPs). So **any** site or server that has this key can call these APIs.

**Why that led to abuse:** Once the key was exposed (e.g. in the repo or in a client bundle), anyone could use it. With no referrer or IP restrictions, Google could not tell your app from an attacker.

**Created/updated:** 2026-02-05 16:25 UTC.

---

## 2. Other keys in the project

| Display name                     | Purpose                         | Restrictions                                                                 |
|----------------------------------|----------------------------------|-------------------------------------------------------------------------------|
| **API key 1**                    | Maps / Places / Geocoding       | API-only (many services). **No referrer or IP restrictions** → fix this.   |
| **Generative Language API Key**  | Gemini                          | Restricted to `generativelanguage.googleapis.com` only. OK.                  |
| **Browser key (auto by Firebase)** | Firebase                       | Many Firebase services; `browserKeyRestrictions` present (check in Console). |

---

## 3. Enabled Places/Maps-related APIs

- Geocoding API  
- Maps JavaScript API  
- Maps Embed API  
- **Places API (New)** (`places.googleapis.com`)  
- Maps Static API  
- Maps SDK for Android / iOS  

(Old “Places API” product can be disabled in Console if you no longer use it.)

---

## 4. Audit logs for Places usage

A read for `places-backend.googleapis.com` and `places.googleapis.com` returned no rows. Usage details (caller IP, referrer, etc.) are best seen in:

- **Google Cloud Console** → APIs & Services → Dashboard → select **Places API** or **Places API (New)** → view metrics / quotas.
- Optionally enable **Data Access** audit logs for these APIs if you want caller identity and IP in Cloud Logging.

---

## 5. IAM

No `allUsers` or `allAuthenticatedUsers` bindings were found on the project. No obvious public IAM leak from this check.

---

## 6. Recommended fixes (Places key and related)

1. **Add application restrictions to “API key 1”**  
   In [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials?project=power-choosers-crm), edit the key:
   - **Application restrictions** → **HTTP referrers**.
   - Add: `http://localhost:3000/*`, `https://nodalpoint.io/*`, your Cloud Run URL (e.g. `https://*.run.app/*`).
   - Save.

2. **Tighten API restrictions on the same key**  
   Keep only what the CRM uses:
   - Maps JavaScript API  
   - Places API (New)  
   - Geocoding API  
   Remove **Places API (old)** and other unused Maps services from this key.

3. **Optional: separate keys**  
   Use one key for browser (Maps JS + referrer restrictions) and another for server (Geocode/Places New + IP restrictions if you have a fixed outbound IP).

4. **Keep the key out of the repo**  
   Use env vars only (e.g. `NEXT_PUBLIC_GOOGLE_MAPS_KEY` in `.env.local` / Cloud Run). Never commit the key.

---

## 7. Commands used

```bash
gcloud config get-value project
gcloud services api-keys list --project=power-choosers-crm --format="table(displayName,name,restrictions)"
gcloud services api-keys describe 4dfb364a-f32f-4831-91a1-b798291a4317 --project=power-choosers-crm --format=yaml
gcloud services list --enabled --project=power-choosers-crm --filter="config.name:places OR config.name:maps OR config.name:geocod"
gcloud logging read "protoPayload.serviceName=places-backend.googleapis.com OR ..." --project=power-choosers-crm --limit=10
gcloud projects get-iam-policy power-choosers-crm --filter="bindings.members:allUsers OR bindings.members:allAuthenticatedUsers"
```
