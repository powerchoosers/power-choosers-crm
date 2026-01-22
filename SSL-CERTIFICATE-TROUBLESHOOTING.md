# SSL Certificate Troubleshooting
## Power Choosers CRM - November 21, 2025

**Problem:** `powerchoosers.com` shows "ERR_CONNECTION_CLOSED" after removing GitHub Pages DNS records.

**Root Cause:** SSL certificate provisioning takes 10-60 minutes after DNS is updated. The load balancer can't serve HTTPS until the certificate is provisioned.

---

## What's Happening

1. ✅ DNS now points to load balancer (`136.110.186.2`)
2. ⏳ SSL certificate is provisioning (Google-managed certificate)
3. ❌ Load balancer can't serve HTTPS until certificate is ready

---

## How to Check SSL Certificate Status

### Option 1: Google Cloud Console
1. Go to **Network Services** → **Load Balancing**
2. Click on `powerchoosers-load-balancer`
3. Click on **Frontend configuration**
4. Click on `powerchoosers-lb`
5. Check **Certificate** status:
   - **Provisioning** = Still waiting (10-60 minutes)
   - **Active** = Ready to use ✅

### Option 2: Command Line
```bash
gcloud compute ssl-certificates describe powerchoosers-ssl-cert --global
```

Look for:
- `managed.status: PROVISIONING` = Still waiting
- `managed.status: ACTIVE` = Ready ✅

---

## Expected Timeline

| Time | Status |
|------|--------|
| **0-10 min** | DNS propagation |
| **10-60 min** | SSL certificate provisioning |
| **60+ min** | Should be fully working |

---

## What to Do Now

### 1. Wait for SSL Certificate (Recommended)
- **Wait 10-60 minutes** for Google to provision the certificate
- Google needs to verify domain ownership via DNS
- Once active, `powerchoosers.com` will work

### 2. Verify DNS is Correct
Run this command to check DNS:
```bash
nslookup powerchoosers.com
```

Should show **only**:
- `136.110.186.2` (Load Balancer IP)

If you see GitHub Pages IPs (`185.199.x.x`), DNS hasn't fully propagated yet.

### 3. Test HTTP (Temporary Workaround)
While waiting for SSL, you can test HTTP:
```
http://powerchoosers.com
```

**Note:** The load balancer is configured to redirect HTTP → HTTPS, so this might not work until SSL is ready.

---

## Common Issues

### Issue: "ERR_CONNECTION_CLOSED"
**Cause:** SSL certificate not provisioned yet  
**Solution:** Wait 10-60 minutes, then check certificate status

### Issue: "SSL Certificate Error"
**Cause:** Certificate provisioning failed  
**Solution:** 
1. Check DNS records are correct
2. Verify domain ownership in Google Cloud Console
3. Re-create certificate if needed

### Issue: "404 Not Found"
**Cause:** SSL works, but routing is wrong  
**Solution:** Check load balancer backend configuration

---

## Next Steps

1. **Wait 10-60 minutes** for SSL certificate to provision
2. **Check certificate status** in Google Cloud Console
3. **Test the domain** once certificate shows "Active"
4. **Verify blog posts load** at `powerchoosers.com/posts/slug`

---

## Quick Status Check

Run this to check if the load balancer is responding:
```bash
curl -I http://136.110.186.2
```

If you get a response, the load balancer is working (just waiting for SSL).

---

**Last Updated:** November 21, 2025

