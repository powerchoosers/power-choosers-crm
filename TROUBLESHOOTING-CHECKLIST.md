# Troubleshooting Checklist - powerchoosers.com Not Working
## Power Choosers CRM - November 21, 2025

**Status:** Site still shows ERR_CONNECTION_CLOSED despite correct configuration.

---

## Step 1: Test Cloud Run Directly

Test if Cloud Run itself is working:

```
https://power-choosers-crm-792458658491.us-south1.run.app/
```

**Expected:** Should load your CRM or show a response  
**If this fails:** Cloud Run has an issue (not load balancer)

---

## Step 2: Check Load Balancer Backend Health

1. Go to **Network Services** → **Load Balancing**
2. Click `powerchoosers-load-balancer`
3. Click **Backend configuration**
4. Click on `powerchoosers-backend`
5. Check if there are any error messages or warnings
6. Look for backend health status

**What to look for:**
- Backend should show as "Healthy" or "Unknown" (normal for Serverless NEGs)
- Any error messages about connectivity

---

## Step 3: Verify NEG is Connected

1. Go to **Network Services** → **Network Endpoint Groups**
2. Find `powerchoosers-neg`
3. Click on it
4. Check:
   - **Service:** Should show `power-choosers-crm`
   - **Region:** `us-south1`
   - **Status:** Should show endpoints

**If no endpoints:** NEG isn't connected to Cloud Run service

---

## Step 4: Check Load Balancer Logs

1. Go to **Network Services** → **Load Balancing**
2. Click `powerchoosers-load-balancer`
3. Look for a **Logs** or **Monitoring** tab
4. Check for any error messages

**What to look for:**
- 502 errors (backend not responding)
- 503 errors (service unavailable)
- Connection refused errors

---

## Step 5: Test with curl (if you have access)

```bash
# Test load balancer IP directly
curl -I http://136.110.186.2

# Test HTTPS (might fail if SSL not ready, but should show something)
curl -I https://136.110.186.2 -k

# Test Cloud Run directly
curl -I https://power-choosers-crm-792458658491.us-south1.run.app/
```

---

## Step 6: Verify Cloud Run Service Name

Make sure the NEG is pointing to the correct service:

1. Go to **Cloud Run** → Check service name
2. Should be: `power-choosers-crm`
3. Go to **Network Endpoint Groups** → `powerchoosers-neg`
4. Verify it points to: `power-choosers-crm` in `us-south1`

**If names don't match:** NEG won't connect

---

## Step 7: Check Cloud Run Service Status

1. Go to **Cloud Run** → `power-choosers-crm`
2. Check:
   - **Status:** Should be "Active"
   - **URL:** Should be accessible
   - **Revisions:** Should have at least one active revision

**If service is inactive:** That's the problem

---

## Step 8: Verify Routing Rules

1. Go to **Network Services** → **Load Balancing**
2. Click `powerchoosers-load-balancer`
3. Check **Routing rules**:
   - Should have rule for `powerchoosers.com` → `powerchoosers-backend`
   - Default rule should also point to `powerchoosers-backend`

---

## Step 9: Check SSL Certificate Details

1. Go to **Network Services** → **SSL Certificates**
2. Click `powerchoosers-ssl-cert-v2`
3. Verify:
   - `powerchoosers.com` shows **ACTIVE**
   - Certificate is attached to frontend
   - No expiration warnings

---

## Step 10: Wait and Retry

Sometimes changes take time to propagate:

1. **Wait 10-15 minutes** after any changes
2. **Clear browser cache** or use incognito mode
3. **Try different browser** or device
4. **Test from different network** (mobile data vs WiFi)

---

## Most Common Issues

### Issue: Cloud Run service name mismatch
**Solution:** Verify NEG points to exact service name

### Issue: Cloud Run service not running
**Solution:** Check Cloud Run service status, ensure it's deployed

### Issue: Backend service not connected to NEG
**Solution:** Verify backend service has NEG attached

### Issue: SSL certificate not fully provisioned
**Solution:** Wait longer, or recreate certificate

---

## Quick Test Commands

```bash
# Test DNS
nslookup powerchoosers.com
# Should return: 136.110.186.2

# Test Cloud Run directly
curl -I https://power-choosers-crm-792458658491.us-south1.run.app/
# Should return: HTTP/2 200 or similar

# Test load balancer IP (HTTP)
curl -I http://136.110.186.2
# Should return: HTTP response (might redirect to HTTPS)
```

---

**Last Updated:** November 21, 2025


