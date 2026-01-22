# Quick Test Steps - Find the Problem
## Power Choosers CRM - November 21, 2025

**Issue:** `https://powerchoosers.com/` shows ERR_CONNECTION_CLOSED

---

## Test 1: Cloud Run Direct URL (Most Important!)

Test if Cloud Run itself is working:

```
https://power-choosers-crm-792458658491.us-south1.run.app/
```

**What this tells us:**
- ✅ **If it works:** Cloud Run is fine, issue is with load balancer routing
- ❌ **If it fails:** Cloud Run has a problem (not load balancer)

**Try this first and tell me what happens!**

---

## Test 2: Check Load Balancer Backend Connection

1. Go to **Network Services** → **Load Balancing**
2. Click `powerchoosers-load-balancer`
3. Click **Backend configuration**
4. Click on `powerchoosers-backend`
5. Scroll down to see backend details
6. Look for:
   - **Network endpoint groups:** Should show `powerchoosers-neg`
   - **Status:** Any error messages?

**What to look for:**
- Backend should list the NEG
- No error messages about connectivity

---

## Test 3: Verify NEG Points to Correct Service

1. Go to **Network Services** → **Network Endpoint Groups**
2. Find `powerchoosers-neg`
3. Click on it
4. Check:
   - **Service:** Should be `power-choosers-crm`
   - **Region:** `us-south1`
   - **Cloud Run service URL:** Should match your Cloud Run service

**If service name doesn't match:** That's the problem!

---

## Test 4: Check Cloud Run Service Status

1. Go to **Cloud Run** → `power-choosers-crm`
2. Check:
   - **Status:** Should be "Active" (green)
   - **URL:** Click the URL to test it
   - **Revisions:** Should have at least one active revision

**If service is not active:** That's the problem!

---

## Test 5: Test from Command Line (if you have gcloud CLI)

```bash
# Test Cloud Run directly
curl -I https://power-choosers-crm-792458658491.us-south1.run.app/

# Test load balancer IP (HTTP - might redirect)
curl -I http://136.110.186.2

# Check DNS
nslookup powerchoosers.com
```

---

## Most Likely Issues (In Order)

### 1. Cloud Run Service Not Running
**Check:** Cloud Run → `power-choosers-crm` → Status should be "Active"

### 2. NEG Service Name Mismatch
**Check:** NEG should point to exact service name: `power-choosers-crm`

### 3. Backend Not Connected to NEG
**Check:** Backend service should list `powerchoosers-neg` in its configuration

### 4. SSL Certificate Still Provisioning
**Check:** Certificate shows ACTIVE, but might need more time

---

## What to Do Right Now

**Step 1:** Test Cloud Run URL directly:
```
https://power-choosers-crm-792458658491.us-south1.run.app/
```

**Step 2:** Tell me:
- Does the Cloud Run URL work?
- What do you see when you access it?

This will tell us if the problem is Cloud Run or the load balancer!

---

**Last Updated:** November 21, 2025


