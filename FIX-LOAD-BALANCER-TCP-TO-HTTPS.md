# Fix Load Balancer: Convert TCP Proxy to HTTP(S) Application Load Balancer
## Power Choosers CRM - November 22, 2025

**Problem Confirmed:** Load balancer was created as TCP Proxy instead of HTTP(S) Application Load Balancer.

**Solution:** Delete TCP Proxy Load Balancer and recreate as Global External Application Load Balancer.

---

## ⚠️ Important: What Gets Deleted vs. Preserved

### ✅ WILL BE PRESERVED (Don't Delete These):
- Static IP: `powerchoosers-ip` (136.110.186.2)
- SSL Certificate: `powerchoosers-ssl-cert-v2`
- Backend Service: `powerchoosers-backend`
- Serverless NEG: `powerchoosers-neg`
- Cloud Run Service: `power-choosers-crm`

### ❌ WILL BE DELETED (Only the Load Balancer Components):
- Forwarding Rule: `powerchoosers-lb`
- Target TCP/SSL Proxy (associated with forwarding rule)
- Load Balancer configuration (but resources above remain)

---

## Phase 1: Delete TCP Proxy Load Balancer

### Step 1: Navigate to Load Balancing
1. Go to **Network Services** → **Load balancing**
2. Find `powerchoosers-load-balancer`

### Step 2: Delete Frontend Forwarding Rule
1. Click on `powerchoosers-load-balancer`
2. Go to **Frontend configuration** tab
3. Find the forwarding rule: `powerchoosers-lb`
   - Protocol: TCP
   - Port: 443
   - IP: 136.110.186.2
4. Click the **checkbox** next to it
5. Click **Delete**
6. Confirm deletion

**Note:** This will also delete the associated Target TCP/SSL Proxy automatically.

### Step 3: Verify Resources Still Exist
Check that these are still there (they should be):
- ✅ Static IP: `powerchoosers-ip` (Network Services → VPC network → IP addresses)
- ✅ SSL Certificate: `powerchoosers-ssl-cert-v2` (Network Services → SSL Certificates)
- ✅ Backend Service: `powerchoosers-backend` (Network Services → Load balancing → Backend services)
- ✅ Serverless NEG: `powerchoosers-neg` (Network Services → Network Endpoint Groups)

---

## Phase 2: Create Global External Application Load Balancer

### Step 1: Start Load Balancer Creation
1. Go to **Network Services** → **Load balancing**
2. Click **Create load balancer**
3. Select **Application Load Balancer (HTTP/S)**
4. Select **From Internet to my VMs or serverless services**
5. Select **Global external Application Load Balancer**
6. Click **Configure**

### Step 2: Basic Configuration
- **Name:** `powerchoosers-load-balancer` (can reuse same name)

### Step 3: Frontend Configuration
1. Click **Frontend configuration**
2. **Protocol:** Select **HTTPS** (not TCP!)
3. **IP address:** Select existing **`powerchoosers-ip`** (136.110.186.2)
4. **Port:** `443`
5. **Certificate:** Select **`powerchoosers-ssl-cert-v2`**
6. **SSL Policy:** Leave as "Default SSL Policy" (or customize if needed)
7. Click **Done**

### Step 4: Backend Configuration
1. Click **Backend configuration**
2. **Backend type:** Select **Serverless network endpoint group**
3. **Backend services:** 
   - Click dropdown "Select a backend service or create a new one"
   - Select existing: **`powerchoosers-backend`**
4. Click **Done**

**Note:** The backend service already knows about `powerchoosers-neg`, so you just select the backend service.

### Step 5: Routing Rules
1. Click **Routing rules**
2. Default rule should be sufficient:
   - **Hosts:** All unmatched (default)
   - **Paths:** All unmatched (default)
   - **Backend:** `powerchoosers-backend`
3. (Optional) Add specific rule for your domains:
   - **Hosts:** `powerchoosers.com, www.powerchoosers.com`
   - **Paths:** `/*`
   - **Backend:** `powerchoosers-backend`
4. Click **Done**

### Step 6: Review and Create
1. Click **Review and finalize**
2. **VERIFY:**
   - ✅ Frontend Protocol: **HTTPS** (not TCP!)
   - ✅ Certificate: `powerchoosers-ssl-cert-v2`
   - ✅ Backend: `powerchoosers-backend`
   - ✅ IP: `powerchoosers-ip` (136.110.186.2)
3. Click **Create**

---

## Phase 3: Verification

### Step 1: Wait for Deployment
- Takes 2-5 minutes for load balancer to provision
- Changes propagate globally in 5-15 minutes

### Step 2: Test the Site
1. Open browser (use incognito/private window)
2. Navigate to: `https://powerchoosers.com/`
3. Should load your Cloud Run service

### Step 3: Verify SSL Certificate
1. Click the **padlock icon** in browser address bar
2. Check certificate details
3. Should show: `powerchoosers-ssl-cert-v2`
4. Should be valid for `powerchoosers.com`

### Step 4: Test Blog Posts
Try accessing a blog post:
```
https://powerchoosers.com/posts/grid-modernization-2025-resilience-ai-and-renewable-integration-trends
```

---

## Troubleshooting

### Issue: "IP address already in use"
**Solution:** The IP is still attached to the old forwarding rule. Wait a few minutes or manually release it from the old rule first.

### Issue: "Backend service not found"
**Solution:** Make sure you didn't accidentally delete `powerchoosers-backend`. It should still exist.

### Issue: "SSL certificate not found"
**Solution:** Verify `powerchoosers-ssl-cert-v2` still exists in SSL Certificates.

### Issue: Site still not working after 15 minutes
**Check:**
1. Load balancer status shows "Active"
2. Frontend shows Protocol: **HTTPS** (not TCP)
3. Certificate is attached
4. Backend service lists the NEG

---

## Quick Checklist

**Before Deleting:**
- [ ] Verified all resources exist (IP, certificate, backend, NEG)
- [ ] Noted down all resource names

**During Creation:**
- [ ] Selected **Application Load Balancer (HTTP/S)** (not TCP Proxy!)
- [ ] Frontend Protocol: **HTTPS**
- [ ] Selected existing IP: `powerchoosers-ip`
- [ ] Selected existing certificate: `powerchoosers-ssl-cert-v2`
- [ ] Selected existing backend: `powerchoosers-backend`

**After Creation:**
- [ ] Waited 5-15 minutes for propagation
- [ ] Tested `https://powerchoosers.com/`
- [ ] Verified SSL certificate in browser
- [ ] Tested blog post URL

---

## Expected Result

After completing these steps:
- ✅ `https://powerchoosers.com/` loads your Cloud Run service
- ✅ SSL certificate works properly
- ✅ Blog posts accessible at `https://powerchoosers.com/posts/slug`
- ✅ No more ERR_CONNECTION_RESET errors

---

**Last Updated:** November 22, 2025  
**Based on:** Google Cloud AI Assistant response


