# Step-by-Step Guide: Recreate Load Balancer as HTTP(S) Application Load Balancer
## Power Choosers CRM - November 22, 2025

**Goal:** Create a Global External Application Load Balancer (HTTP/S) that properly handles SSL termination.

---

## ✅ Pre-Creation Checklist

Before starting, verify these resources still exist (they should be preserved):

- [ ] **Static IP:** `powerchoosers-ip` (136.110.186.2)
  - Location: Network Services → VPC network → IP addresses
- [ ] **SSL Certificate:** `powerchoosers-ssl-cert-v2`
  - Location: Network Services → SSL Certificates
  - Status: Should show ACTIVE for `powerchoosers.com`
- [ ] **Backend Service:** `powerchoosers-backend`
  - Location: Network Services → Load balancing → Backend services
- [ ] **Serverless NEG:** `powerchoosers-neg`
  - Location: Network Services → Network Endpoint Groups
  - Should point to: `power-choosers-crm` in `us-south1`

**If any are missing, stop and check what happened!**

---

## Step 1: Start Load Balancer Creation

1. Go to **Network Services** → **Load balancing**
2. Click **Create load balancer** (blue button at top)
3. You'll see load balancer type options

---

## Step 2: Select Load Balancer Type ⚠️ CRITICAL STEP

**IMPORTANT:** You must select the correct type!

1. Under **"Application Load Balancer (HTTP/S)"** section
2. Click **"Start configuration"** button
   - **DO NOT** select "Network Load Balancer (TCP/UDP)" 
   - **DO NOT** select "Internal Application Load Balancer"
   - **DO NOT** select "Internal TCP/UDP Load Balancer"

3. You should see:
   - **Load balancer type:** Application Load Balancer (HTTP/S) ✅
   - **Internet-facing or internal:** Select **"From Internet to my VMs or serverless services"**
   - **Global or single region deployment:** Select **"Global external Application Load Balancer"**

4. Click **"Configure"** button

---

## Step 3: Basic Configuration

1. **Name:** Enter `powerchoosers-load-balancer`
   - You can reuse the same name since the old one is deleted

2. Click **"Next"** or continue to Frontend configuration

---

## Step 4: Frontend Configuration ⚠️ CRITICAL

This is where you set up HTTPS with SSL termination.

### 4.1: Add Frontend IP and Port

1. Click **"Frontend configuration"** section
2. Click **"Add frontend IP and port"** button

### 4.2: Configure Frontend

Fill in these fields:

- **Name:** `powerchoosers-lb`
- **Description:** (optional) "HTTPS frontend for powerchoosers.com"
- **Protocol:** Select **"HTTPS"** from dropdown
  - ⚠️ **MUST BE HTTPS, NOT TCP!**
- **Network Service Tier:** `Premium` (should be default)
- **IP version:** `IPv4`
- **IP address:** 
  - Select **"Select an existing IP address"**
  - Choose: **`powerchoosers-ip`** (136.110.186.2)
- **Port:** `443`
- **Certificate:** 
  - Select **"Select a certificate"**
  - Choose: **`powerchoosers-ssl-cert-v2`**
- **SSL Policy:** Leave as **"GCP default"** (or customize if needed)

### 4.3: HTTP to HTTPS Redirect (Optional but Recommended)

1. Check the box: **"Enable HTTP to HTTPS redirect"**
   - This automatically redirects HTTP (port 80) to HTTPS (port 443)

2. Click **"Done"** to save frontend configuration

---

## Step 5: Backend Configuration

### 5.1: Add Backend Service

1. Click **"Backend configuration"** section
2. Click **"Backend services"** → **"Select a backend service or create a new one"**

### 5.2: Select Existing Backend

1. In the dropdown, find and select: **`powerchoosers-backend`**
   - This backend already has your Serverless NEG attached
   - The NEG points to your Cloud Run service

2. Click **"Done"** to save backend configuration

**Note:** You don't need to configure the NEG here - it's already attached to the backend service.

---

## Step 6: Routing Rules

### 6.1: Configure Host and Path Rules

1. Click **"Routing rules"** section
2. You'll see default routing configuration

### 6.2: Default Rule (Should be Sufficient)

The default rule should work:
- **Hosts:** All unmatched (default)
- **Paths:** All unmatched (default)  
- **Backend:** `powerchoosers-backend`

### 6.3: Optional - Add Specific Domain Rule

If you want to be explicit (optional):

1. Click **"Add host and path rule"**
2. Configure:
   - **Hosts:** 
     - `powerchoosers.com`
     - `www.powerchoosers.com`
   - **Paths:** `/*` (all paths)
   - **Backend:** `powerchoosers-backend`
3. Click **"Done"**

4. Click **"Done"** to save routing rules

---

## Step 7: Review and Finalize ⚠️ DOUBLE-CHECK EVERYTHING

### 7.1: Review All Settings

Before creating, verify:

- [ ] **Load Balancer Type:** Application Load Balancer (HTTP/S) ✅
- [ ] **Frontend Protocol:** HTTPS (NOT TCP!) ✅
- [ ] **Frontend Port:** 443 ✅
- [ ] **Frontend IP:** `powerchoosers-ip` (136.110.186.2) ✅
- [ ] **Certificate:** `powerchoosers-ssl-cert-v2` ✅
- [ ] **Backend Service:** `powerchoosers-backend` ✅
- [ ] **Routing:** Points to `powerchoosers-backend` ✅

### 7.2: Create Load Balancer

1. Click **"Review and finalize"** button
2. Review the summary page
3. **CRITICAL CHECK:** Look at the frontend configuration summary
   - Should say: **"Protocol: HTTPS"**
   - Should NOT say: **"Protocol: TCP"**
4. If everything looks correct, click **"Create"** button

---

## Step 8: Wait for Provisioning

1. You'll see a progress indicator
2. **Wait 2-5 minutes** for the load balancer to provision
3. You'll see a success message when it's ready

---

## Step 9: Verification

### 9.1: Check Load Balancer Status

1. Go to **Network Services** → **Load balancing**
2. Find `powerchoosers-load-balancer`
3. Verify:
   - **Load balancer type:** Application ✅
   - **Protocols:** HTTPS ✅
   - **Status:** Should show as active/healthy

### 9.2: Check Frontend Configuration

1. Click on `powerchoosers-load-balancer`
2. Go to **Frontend configuration** tab
3. Verify:
   - **Protocol:** HTTPS (NOT TCP!) ✅
   - **Port:** 443 ✅
   - **IP:** 136.110.186.2 ✅
   - **Certificate:** `powerchoosers-ssl-cert-v2` ✅

### 9.3: Test the Site

1. **Wait 5-15 minutes** for global propagation
2. Open browser in **incognito/private window**
3. Navigate to: `https://powerchoosers.com/`
4. Should load your Cloud Run service ✅

### 9.4: Verify SSL Certificate

1. Click the **padlock icon** in browser address bar
2. Check certificate details
3. Should show: `powerchoosers-ssl-cert-v2`
4. Should be valid for `powerchoosers.com` ✅

### 9.5: Test Blog Post Route

Try accessing a blog post:
```
https://powerchoosers.com/posts/grid-modernization-2025-resilience-ai-and-renewable-integration-trends
```

Should load the blog post from Firebase Storage ✅

---

## Troubleshooting

### Issue: "IP address already in use"
**Solution:** Wait a few minutes for the old forwarding rule to be fully deleted, then try again.

### Issue: "Certificate not found"
**Solution:** Verify `powerchoosers-ssl-cert-v2` exists in SSL Certificates. If it was deleted, you'll need to create a new one.

### Issue: "Backend service not found"
**Solution:** Verify `powerchoosers-backend` exists. If it was deleted, you'll need to recreate it and attach the NEG.

### Issue: Frontend still shows TCP after creation
**Solution:** You selected the wrong load balancer type. Delete and recreate, making sure to select "Application Load Balancer (HTTP/S)".

### Issue: Site still not working after 15 minutes
**Check:**
1. Load balancer status is "Active"
2. Frontend shows Protocol: HTTPS (not TCP)
3. Certificate is attached and ACTIVE
4. Backend service lists the NEG
5. DNS still points to 136.110.186.2

---

## Common Mistakes to Avoid

❌ **Selecting "Network Load Balancer (TCP/UDP)"** - This creates a TCP Proxy
❌ **Selecting "Internal" load balancer** - This won't be accessible from internet
❌ **Setting Frontend Protocol to TCP** - Must be HTTPS
❌ **Forgetting to attach SSL certificate** - Won't work without it
❌ **Using wrong IP address** - Must use `powerchoosers-ip`

---

## Success Criteria

After completing these steps, you should have:

✅ Load balancer type: Application Load Balancer (HTTP/S)
✅ Frontend Protocol: HTTPS (not TCP)
✅ SSL termination working at load balancer
✅ `https://powerchoosers.com/` loads your Cloud Run service
✅ Blog posts accessible at `https://powerchoosers.com/posts/slug`
✅ No ERR_CONNECTION_RESET errors

---

## Quick Reference: Resource Names

- **Load Balancer Name:** `powerchoosers-load-balancer`
- **Frontend Name:** `powerchoosers-lb`
- **Static IP:** `powerchoosers-ip` (136.110.186.2)
- **SSL Certificate:** `powerchoosers-ssl-cert-v2`
- **Backend Service:** `powerchoosers-backend`
- **Serverless NEG:** `powerchoosers-neg`
- **Cloud Run Service:** `power-choosers-crm` (us-south1)

---

**Last Updated:** November 22, 2025  
**Status:** Ready to use - Follow steps in order


