# Vercel Deployment Guide - Power Choosers CRM

## 🚀 Production Deployment on Vercel

Your CRM platform is now configured for Vercel deployment with the following domains:
- **Primary Domain:** `nodalpoint.io`
- **Vercel Domain:** `nodal-point-network.vercel.app`
- **WWW Redirect:** `www.nodalpoint.io` → `nodalpoint.io` (automatic)

---

## 📋 Current Configuration

### Project Structure
```
Power Choosers CRM/
├── crm-platform/         # Main Next.js application (ROOT DIRECTORY)
│   ├── vercel.json       # Vercel configuration (MOVED HERE)
│   ├── src/
│   │   ├── app/         # Next.js App Router
│   │   ├── pages/api/   # API routes
│   │   └── components/  # React components
│   ├── package.json     # All dependencies
│   └── next.config.ts   # Vercel-optimized config
└── .env                 # Environment variables (local only)
```

### Vercel Configuration (`vercel.json`)
Your `vercel.json` is configured with:
- ✅ Build directory: `crm-platform`
- ✅ Output directory: `crm-platform/.next`
- ✅ Framework: `nextjs`
- ✅ API rewrites for `/posts/:slug`
- ✅ Cron job: Daily Apollo news refresh at 9 AM

### Next.js Configuration (`next.config.ts`)
- ✅ www → non-www redirect (www.nodalpoint.io → nodalpoint.io)
- ✅ API rewrites for blog posts
- ✅ Image optimization disabled (for compatibility)
- ✅ Dev indicators positioned bottom-right

---

## 🔧 Deployment Steps

### Step 1: Connect to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **"Add New Project"**
3. Select your **Power Choosers CRM** repository
4. Vercel will auto-detect the configuration from `vercel.json`

If you need to verify/override:
- Go to **Project Settings** → **General**
- **CRITICAL:** Set the **Root Directory** to `crm-platform`
- Vercel will then correctly find the `package.json` and `vercel.json`
- Framework Preset should be **Next.js**
- Build & Development Settings can usually be left at defaults once Root Directory is set.
```
### Step 3: Add Environment Variables (CRITICAL!)

Go to **Project Settings** → **Environment Variables** and add the following:

#### Supabase
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SUPABASE_DB_URL=your_supabase_db_url
```

#### Firebase
```bash
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_PRIVATE_KEY="your_firebase_private_key"
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id
```

#### Twilio
```bash
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_API_KEY_SID=your_twilio_api_key_sid
TWILIO_API_KEY_SECRET=your_twilio_api_key_secret
TWILIO_TWIML_APP_SID=your_twilio_twiml_app_sid
TWILIO_PHONE_NUMBER=your_twilio_phone_number
TWILIO_INTELLIGENCE_SERVICE_SID=your_twilio_intelligence_service_sid
```

#### API Keys
```bash
APOLLO_API_KEY=your_apollo_api_key
GOOGLE_MAPS_API=your_google_maps_api_key
MAILERSEND_API_KEY=your_mailersend_api_key
OPEN_ROUTER_API_KEY=your_open_router_api_key
PERPLEXITY_API_KEY=your_perplexity_api_key
IMGUR_CLIENT_ID=your_imgur_client_id
FREE_GEMINI_KEY=your_gemini_api_key
```

#### Energy API Keys
```bash
EIA_API_KEY=your_eia_api_key
ERCOT_API_KEY=your_ercot_api_key
ERCOT_PUBLIC_API_KEY=your_ercot_public_api_key
ERCOT_USERNAME=your_ercot_username
ERCOT_PASSWORD=your_ercot_password
```

#### Google Service Account (for Gmail)
```bash
GOOGLE_SERVICE_ACCOUNT_KEY=your_google_service_account_json_base64
```

#### Platform Configuration
```bash
API_BASE_URL=https://nodalpoint.io
PUBLIC_BASE_URL=https://nodalpoint.io
NODE_ENV=production
CI_AUTO_PROCESS=false
```

**Important Notes:**
- Set environment variables for **Production**, **Preview**, and **Development**
- Make sure `FIREBASE_PRIVATE_KEY` includes the full key with `\n` escape sequences
- Do NOT add `PORT` - Vercel sets this automatically

### Step 4: Configure Custom Domain

1. Go to **Project Settings** → **Domains**
2. Click **"Add Domain"**
3. Enter your primary domain: `nodalpoint.io`
4. Vercel will provide DNS records to configure:

#### For nodalpoint.io:
Add these records at your domain registrar:

**A Record (or CNAME):**
- Type: `A` or `CNAME`
- Name: `@`
- Value: `76.76.21.21` (or CNAME value from Vercel)
- TTL: `3600`

**CNAME for www:**
- Type: `CNAME`
- Name: `www`
- Value: `cname.vercel-dns.com`
- TTL: `3600`

5. DNS propagation takes 5-60 minutes
6. Vercel will automatically provision SSL certificates

### Step 5: Deploy!

1. Click **"Deploy"** in Vercel
2. Watch the build logs for any errors
3. Once deployed, test:
   - Vercel URL: `https://nodal-point-network.vercel.app`
   - Custom domain: `https://nodalpoint.io`
   - www redirect: `https://www.nodalpoint.io` → should redirect to `https://nodalpoint.io`

---

## 🔄 Automatic Deployments

Vercel automatically deploys when you:
- **Push to main branch** → Production deployment
- **Push to other branches** → Preview deployment
- **Open a Pull Request** → Preview deployment with unique URL

---

## 📊 Vercel Features You're Using

### Edge Functions
All your API routes (`/api/*`) run as Edge Functions for:
- ✅ Global low-latency
- ✅ Automatic scaling
- ✅ No cold starts

### Cron Jobs
From `vercel.json`:
- **Apollo News Refresh:** Runs daily at 9 AM UTC
- Path: `/api/cron/refresh-apollo-news`
- Vercel handles scheduling automatically

### Image Optimization
- Currently disabled (`unoptimized: true`)
- Consider enabling for better performance once deployed

---

## 💰 Vercel Pricing

### Hobby Plan (Current)
- **Cost:** $0/month
- **Bandwidth:** 100 GB/month
- **Builds:** 100 hours/month
- **Edge Function Executions:** 1M/month
- **Edge Function Duration:** 100 GB-Hours
- **Serverless Functions:** 100 GB-Hours

For your CRM usage, the **Hobby plan should be sufficient** for development and low-medium traffic. 

### Pro Plan ($20/month)
If you exceed hobby limits:
- Unlimited bandwidth
- Unlimited builds
- Advanced analytics
- Team collaboration
- Priority support

---

## 🔍 Troubleshooting

### Build Fails

**Error:** `Cannot find module 'xyz'`
- **Fix:** Check that all dependencies are in `crm-platform/package.json`
- Run `npm install` locally to verify

**Error:** `Build exceeded maximum duration`
- **Fix:** Check for infinite loops in build scripts
- Consider upgrading to Pro plan for longer build times

### API Routes 404

**Error:** `/api/twilio/call` returns 404
- **Fix:** Verify routes exist in `crm-platform/src/pages/api/`
- Check build logs for errors during API route compilation

### Environment Variable Issues

**Error:** `TWILIO_ACCOUNT_SID is undefined`
- **Fix:** Double-check all env vars in Vercel Dashboard
- Ensure variables are set for the correct environment (Production/Preview/Development)
- Redeploy after adding new environment variables

### Database Connection Fails

**Error:** `connect ETIMEDOUT` or `Invalid connection string`
- **Fix:** Verify `SUPABASE_DB_URL` is correct
- Check Supabase dashboard for connection pooler settings
- Ensure Supabase allows connections from Vercel's edge network

### Firebase Storage Issues

**Error:** `Bucket not found` or `Permission denied`
- **Fix:** Ensure `FIREBASE_PRIVATE_KEY` includes `\n` escape sequences
- Verify Firebase service account has correct permissions

### Custom Domain Not Working

**Error:** Domain shows "This domain is not configured"
- **Fix:** Verify DNS records are correct
- Wait for DNS propagation (up to 48 hours, usually 5-60 minutes)
- Check DNS with: `nslookup nodalpoint.io`

---

## 🎯 Post-Deployment Checklist

### Testing
- [ ] Homepage loads at `https://nodalpoint.io`
- [ ] Vercel URL works: `https://nodal-point-network.vercel.app`
- [ ] www redirect works: `https://www.nodalpoint.io` → `https://nodalpoint.io`
- [ ] API routes respond: `/api/twilio/token`
- [ ] Login/Authentication works
- [ ] Database queries succeed
- [ ] Twilio calls work
- [ ] Email sending works (Mailersend)
- [ ] SSL certificate is active (https://)
- [ ] Apollo news cron job runs successfully

### Performance Optimization
1. **Enable Analytics:** Vercel Dashboard → Analytics
2. **Monitor Edge Functions:** Check execution times and errors
3. **Set Up Alerts:** Configure deployment and error alerts
4. **Review Logs:** Check Vercel logs for any warnings
5. **Consider Image Optimization:** Remove `unoptimized: true` for better performance

### Security
- [ ] Review environment variables (no secrets in code)
- [ ] Check Firebase security rules
- [ ] Verify Supabase RLS policies
- [ ] Enable Vercel password protection for preview deployments (optional)
- [ ] Set up Vercel Web Application Firewall if needed

---

## 🔄 Migration Summary

### From Cloud Run to Vercel

| Feature | Cloud Run | Vercel |
|:--------|:----------|:-------|
| **Cost** | Variable (~$20-50/mo) | $0-20/mo |
| **Setup** | Complex (Docker, GCP) | Simple (Git push) |
| **Cold Starts** | Yes (1-2 seconds) | No (edge network) |
| **Custom Domain** | Manual DNS setup | Built-in management |
| **Deployments** | Manual builds | Auto on Git push |
| **Global CDN** | Manual CloudCDN | Built-in edge network |
| **Environment Variables** | GCP Secret Manager | Built-in dashboard |
| **Developer Experience** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 🗑️ Cleanup - Files No Longer Needed

The following files are **NOT needed** for Vercel deployment and have been archived or can be removed:

### Archived
- ✅ `RAILWAY_DEPLOYMENT.md` → Moved to `backups/`

### Can Be Removed (but kept for reference)
- `crm-platform/Dockerfile` - Docker config (Cloud Run only)
- `.dockerignore` - Docker ignore file
- `.gcloudignore` - Google Cloud ignore file

**Note:** These files won't affect Vercel deployment, but you can remove them to clean up the repo.

---

## 🎉 You're All Set for Vercel!

Your CRM is now optimized for Vercel deployment. The platform will:
- ✅ Auto-deploy on every Git push to main
- ✅ Provide preview deployments for PRs
- ✅ Run on a global edge network (no cold starts)
- ✅ Handle SSL certificates automatically
- ✅ Scale automatically based on traffic
- ✅ Provide detailed analytics and logs

### Next Steps
1. Deploy to Vercel using the steps above
2. Configure your custom domain DNS
3. Test all functionality
4. Monitor analytics and performance
5. Optimize as needed

**Questions or issues?** Check the [Vercel Docs](https://vercel.com/docs) or reach out for help!

---

**Last Updated:** February 12, 2026  
**Migration From:** Google Cloud Run → Railway → **Vercel** ✅  
**Project:** Power Choosers CRM  
**Production URLs:**
- https://nodalpoint.io
- https://nodal-point-network.vercel.app
