# Load Balancer Backend Protocol Fix
## Power Choosers CRM - November 21, 2025

**Problem:** `powerchoosers.com` shows "ERR_CONNECTION_CLOSED" even though SSL certificate is ACTIVE.

**Root Cause:** Backend service is configured to use HTTPS, but Cloud Run services should use HTTP for internal communication.

---

## The Issue

In your load balancer configuration:
- **Backend Protocol:** HTTPS ❌ (Wrong)
- **Should be:** HTTP ✅ (Correct)

Cloud Run services communicate with load balancers over HTTP, not HTTPS. The load balancer handles SSL termination (HTTPS → HTTP).

---

## How to Fix

### Step 1: Edit Backend Service

1. Go to **Network Services** → **Load Balancing**
2. Click `powerchoosers-load-balancer`
3. Click **Backend configuration** tab
4. Click **Edit** on `powerchoosers-backend`
5. Find **Endpoint protocol** or **Protocol** setting
6. Change from **HTTPS** to **HTTP**
7. **Save**

### Step 2: Verify Network Endpoint Group

Make sure the NEG is correctly configured:
- **Name:** `powerchoosers-neg`
- **Type:** Serverless Network Endpoint Group
- **Service:** `power-choosers-crm`
- **Region:** `us-south1`

### Step 3: Wait for Propagation

- Changes take 2-5 minutes to propagate
- Test `https://powerchoosers.com/` after waiting

---

## Why This Matters

**Load Balancer Flow:**
```
User → HTTPS (443) → Load Balancer → HTTP (8080) → Cloud Run
```

The load balancer:
1. Receives HTTPS from users (SSL termination)
2. Forwards HTTP to Cloud Run (internal communication)
3. Cloud Run responds with HTTP
4. Load balancer converts back to HTTPS for users

**If backend is HTTPS:**
- Load balancer tries to connect via HTTPS
- Cloud Run doesn't expect HTTPS
- Connection fails → ERR_CONNECTION_CLOSED

---

## Verification

After changing to HTTP:

1. **Wait 2-5 minutes** for changes to propagate
2. **Test:** `https://powerchoosers.com/`
3. **Should work:** Site loads correctly
4. **Test blog post:** `https://powerchoosers.com/posts/slug`

---

## Alternative: Check Cloud Run Ingress

If changing to HTTP doesn't work, verify Cloud Run ingress settings:

1. Go to **Cloud Run** → `power-choosers-crm`
2. Check **Connections** tab
3. **Ingress:** Should be "All" or "Internal and Cloud Load Balancing"
4. If it's "Internal", change to "All" or "Internal and Cloud Load Balancing"

---

**Last Updated:** November 21, 2025


