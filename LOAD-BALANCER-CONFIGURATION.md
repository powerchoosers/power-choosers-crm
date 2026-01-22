# Power Choosers Load Balancer Configuration

**Date Created:** November 21, 2025  
**Purpose:** Custom domain setup for `powerchoosers.com` to serve blog posts from Cloud Run service

## Quick Reference

- **Load Balancer IP Address:** `136.110.186.2`
- **Load Balancer Name:** `powerchoosers-load-balancer`
- **Static IP Name:** `powerchoosers-ip`
- **Domain:** `powerchoosers.com` and `www.powerchoosers.com`
- **Status:** ✅ Created - Ready for DNS configuration

---

## Overview

This document tracks the Google Cloud Application Load Balancer configuration that routes `powerchoosers.com` and `www.powerchoosers.com` to the Cloud Run service `power-choosers-crm` in the `us-south1` region.

**Why Load Balancer?**  
Domain mappings are not available in the `us-south1` region. Using an Application Load Balancer is the recommended solution for custom domains with Cloud Run services in this region.

---

## Load Balancer Configuration

### Basic Settings

- **Load Balancer Name:** `powerchoosers-load-balancer`
- **Type:** Application Load Balancer (HTTP/HTTPS)
- **Scheme:** Internet facing (Public)
- **Deployment:** Global (Best for global workloads)
- **Network Service Tier:** Premium (Required for global HTTP(S) load balancing)
- **Generation:** Global external Application Load Balancer

---

## Frontend Configuration

### Frontend IP and Port

- **Name:** `powerchoosers-lb`
- **Protocol:** HTTPS (includes HTTP/2 and HTTP/3)
- **IP Version:** IPv4
- **IP Address:** `powerchoosers-ip` (Static, Global)
- **Port:** 443
- **HTTP Keepalive Timeout:** 610 seconds (default)
- **HTTP to HTTPS Redirect:** Enabled ✓
  - Automatically redirects HTTP traffic to HTTPS
  - Requires reserved external IP address (already configured)

### SSL Certificate

- **Certificate Name:** `powerchoosers-ssl-cert`
- **Type:** Google-managed certificate
- **Domains:**
  - `powerchoosers.com`
  - `www.powerchoosers.com`
- **Status:** Provisioning (will be active after DNS is configured)
- **SSL Policy:** GCP default
- **HTTP/3 (QUIC) Negotiation:** Automatic (default)
- **Early Data (0-RTT):** Disabled

**Note:** SSL certificate provisioning takes 10-60 minutes after DNS records are configured.

---

## Backend Configuration

### Backend Service

- **Name:** `powerchoosers-backend`
- **Endpoint Protocol:** HTTPS
- **IP Address Selection Policy:** Only IPv4
- **Health Check:** None configured (Cloud Run handles health checks)
- **Cloud CDN:** Enabled
  - **Cache Mode:** Cache static content (recommended)
  - **Client TTL:** 1 hour
  - **Default TTL:** 1 hour
  - **Maximum TTL:** 1 day
  - **Cache Key:** Default (include all components of a request URL)
- **Logging:** Enabled
  - **Sample Rate:** 1 (100% of requests logged)
  - **All optional fields excluded**

### Backend Security

- **Cloud Armor Backend Security Policy:** `default-security-policy-for-powerchoosers-backend`
  - **Policy Name:** `default-security-policy-for-powerchoosers-backend`
  - **Request Count:** 500 requests per minute per IP
  - **Interval:** 1 minute
  - **Enforce on Key:** IP address
- **Identity-Aware Proxy (IAP):** Disabled (blog posts should be public)

### Network Endpoint Group (NEG)

- **Name:** `powerchoosers-neg`
- **Type:** Serverless Network Endpoint Group
- **Region:** `us-south1` (Dallas)
- **Service Type:** Cloud Run
- **Service:** `power-choosers-crm` (us-south1)
- **Traffic Tag:** Not configured (default)
- **URL Mask:** Not configured (routes all traffic)
- **Scope:** us-south1
- **Autoscaling:** No configuration
- **Balancing Mode:** N/A (serverless)
- **Capacity:** N/A (serverless)
- **Preference Level:** None

---

## Routing Rules

### Host and Path Rules

**Mode:** Simple host and path rule

**Rule 1 (Default):**
- **Host:** All unmatched (Default)
- **Path:** All unmatched (Default)
- **Backend:** `powerchoosers-backend`

**Rule 2 (Specific):**
- **Hosts:**
  - `powerchoosers.com`
  - `www.powerchoosers.com`
- **Path:** `/*` (all paths)
- **Backend:** `powerchoosers-backend`

**Note:** Rule 2 takes priority over Rule 1. All traffic to `powerchoosers.com` and `www.powerchoosers.com` routes to the Cloud Run service.

---

## IP Address Configuration

- **Name:** `powerchoosers-ip`
- **Type:** Global static IP address
- **Purpose:** Frontend IP for the load balancer
- **Status:** Reserved
- **IP Address:** `136.110.186.2`
  - **Location:** VPC Network > IP addresses > `powerchoosers-ip`
  - **Or:** Load Balancing > Load balancers > `powerchoosers-load-balancer` > Frontend tab

**DNS Configuration Required:**
After the load balancer is created, you'll need to update your DNS records to point to this IP address.

---

## Cloud Run Service

- **Service Name:** `power-choosers-crm`
- **Region:** `us-south1` (Dallas)
- **URL:** `https://power-choosers-crm-792458658491.us-south1.run.app`
- **Custom Domain Route:** `/posts/:slug` (handled by `server.js`)

---

## DNS Configuration (To Be Completed)

After the load balancer is created, update your DNS records at your domain registrar:

### Required DNS Records

1. **A Record (Root Domain):**
   - **Type:** A
   - **Name:** `@` or `powerchoosers.com`
   - **Value:** `136.110.186.2`
   - **TTL:** 3600 (1 hour)

2. **CNAME Record (WWW Subdomain):**
   - **Type:** CNAME
   - **Name:** `www`
   - **Value:** `powerchoosers.com`
   - **TTL:** 3600 (1 hour)

**Note:** The load balancer has been created and the IP address is ready. You can update DNS records now.

---

## Route Handler Implementation

The blog post route handler is already implemented in `server.js`:

```javascript
// Route: /posts/:slug
// Handler: handlePostRoute()
// Fetches HTML from Firebase Storage: posts/{slug}.html
// Serves with proper headers and caching
```

**Test URL after DNS is configured:**
- `https://powerchoosers.com/posts/ercot-forecasts-stable-winter-grid`

---

## Cost Considerations

### Services Used

1. **Application Load Balancer:** 
   - Forwarding rules: ~$18/month
   - Data processing: ~$0.008-0.025 per GB
   - [Pricing details](https://cloud.google.com/load-balancing/pricing)

2. **Cloud CDN:**
   - Cache egress: ~$0.08 per GB
   - Cache fill: ~$0.12 per GB
   - [Pricing details](https://cloud.google.com/cdn/pricing)

3. **Cloud Armor:**
   - Standard tier: Included with load balancer
   - [Pricing details](https://cloud.google.com/armor/pricing)

4. **SSL Certificate:**
   - Google-managed certificates: Free

**Estimated Monthly Cost:** ~$20-50 depending on traffic volume

---

## Next Steps

1. ✅ Load balancer created
2. ✅ Static IP address obtained: `136.110.186.2`
3. ⏳ Update DNS records at domain registrar (see DNS Configuration section below)
4. ⏳ Wait for SSL certificate provisioning (10-60 minutes after DNS)
5. ⏳ Test: `https://powerchoosers.com/posts/[slug]`

---

## Troubleshooting

### SSL Certificate Not Provisioning
- Verify DNS records are correctly configured
- Check that DNS has propagated (use `dig` or online DNS checker)
- Ensure both `powerchoosers.com` and `www.powerchoosers.com` point to the load balancer IP

### 404 Errors on Blog Posts
- Verify route handler is working: Check `server.js` `handlePostRoute()` function
- Check Firebase Storage: Ensure posts exist in `posts/{slug}.html`
- Check Cloud Run service logs for errors

### Load Balancer Not Routing
- Verify host and path rules are configured correctly
- Check backend service health
- Verify NEG is correctly linked to Cloud Run service

---

## Related Files

- `server.js` - Route handler for `/posts/:slug`
- `api/posts/generate-static.js` - Generates static HTML files
- `api/posts/list.js` - Lists published posts

---

## Maintenance Notes

- **SSL Certificate Renewal:** Google-managed certificates auto-renew
- **Load Balancer Updates:** Changes require redeployment
- **DNS Changes:** Allow 24-48 hours for full propagation
- **Monitoring:** Check Cloud Console > Load Balancing > Monitoring tab

---

## Contact Information

**Project:** Power Choosers CRM  
**Project ID:** `power-choosers-crm`  
**Region:** `us-south1`  
**Created By:** Lewis Patterson  
**Date:** November 21, 2025

---

**Last Updated:** November 21, 2025

