# Railway Deployment Guide - Power Choosers CRM

## 🚀 Migration Complete!

Your CRM has been successfully restructured for Railway deployment. All API handlers and frontend code are now consolidated in the `crm-platform/` directory.

---

## 📋 Pre-Deployment Checklist

### 1. Files Backed Up ✓
All legacy Cloud Run files are safely stored in `backups/vercel-migration-2026-02-12/`:
- `server.js` - Legacy Node.js server
- `api/` - API handlers (now in `crm-platform/src/pages/api/`)
- `Dockerfile`, `cloudbuild.yaml` - Cloud Run configs
- Root `package.json` - Merged into crm-platform

### 2. Project Structure ✓
```
Power Choosers CRM/
├── railway.json          # Railway configuration
├── crm-platform/         # Main application
│   ├── src/
│   │   ├── app/         # Next.js App Router
│   │   ├── pages/api/   # API routes (93+ handlers)
│   │   └── components/  # React components
│   ├── package.json     # All dependencies
│   └── next.config.ts   # Railway-optimized config
└── backups/             # Legacy files
```

---

## 🔧 Railway Setup Steps

### Step 1: Create Railway Project
1. Go to [railway.app](https://railway.app)
2. Sign in with GitHub
3. Click **"New Project"** → **"Deploy from GitHub repo"**
4. Select your `Power Choosers CRM` repository
5. Railway will auto-detect the `railway.json` configuration

### Step 2: Configure Build Settings
Railway should automatically:
- Use `crm-platform` as the root directory
- Detect Next.js and install dependencies
- Build using `npm run build`
- Start using `npm start`

**If you need to verify/override:**
- Go to **Service Settings** → **Build**
- Root Directory: `crm-platform`
- Build Command: `npm install && npm run build`
- Start Command: `npm start`

### Step 3: Add Environment Variables (CRITICAL!)
Go to the **Variables** tab and add ALL variables from your `.env` file:

#### Required Variables:
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://gfitvnkaevozbcyostez.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_DB_URL=postgresql://...

# Firebase
FIREBASE_PROJECT_ID=power-choosers-crm
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@...
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=power-choosers-crm.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=power-choosers-crm
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=power-choosers-crm.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=792458658491
NEXT_PUBLIC_FIREBASE_APP_ID=1:792458658491:web:...

# Twilio
TWILIO_ACCOUNT_SID=ACed7d...
TWILIO_AUTH_TOKEN=57fcf5...
TWILIO_API_KEY_SID=SK64e6...
TWILIO_API_KEY_SECRET=F4UevR...
TWILIO_TWIML_APP_SID=AP20de...
TWILIO_PHONE_NUMBER=+1...

# API Keys
APOLLO_API_KEY=b0qMlPXF...
GOOGLE_MAPS_API=AIzaSy...
MAILERSEND_API_KEY=mlsn....
OPEN_ROUTER_API_KEY=sk-or-v1-...
IMGUR_CLIENT_ID=546c25a59c58ad7
EIA_API_KEY=Sm1agx...
PERPLEXITY_API_KEY=pplx-...

# Configuration
PUBLIC_BASE_URL=https://nodalpoint.io
NODE_ENV=production
```

**Important Notes:**
- Do NOT add `PORT` - Railway sets this automatically
- Make sure `FIREBASE_PRIVATE_KEY` includes the full `-----BEGIN PRIVATE KEY-----` block
- Copy-paste exactly as they appear in your `.env` file

### Step 4: Connect Custom Domain
1. Go to **Service Settings** → **Networking**
2. Click **"Add Custom Domain"**
3. Enter your domain: `nodalpoint.io`
4. Select port: **8080** (Railway auto-detected)
5. Railway will provide DNS records:
   - **A Record** or **CNAME**
6. Add these records to your domain provider (GoDaddy, Namecheap, etc.)

**For nodalpoint.io:**
- Type: `A` or `CNAME`
- Name: `@` (for root) or `www`
- Value: (copy from Railway)
- TTL: `3600` or `Auto`

### Step 5: Deploy!
1. Click **"Deploy"** in Railway
2. Watch the build logs for any errors
3. Once deployed, test your Railway URL: `your-app.railway.app`
4. After DNS propagates (5-60 minutes), your domain will be live!

---

## 💰 Pricing Breakdown (Hobby Plan - $5/mo)

### What You Get:
- **Base Cost:** $5/month subscription
- **Included Credits:** $5/month usage credits
- **Resources:** Up to 8 vCPU, 8 GB RAM per service
- **Deployments:** Unlimited
- **Custom Domains:** Yes (included)

### Estimated Monthly Usage:
Based on your CRM size (~100MB code, low-medium traffic):

| Resource | Usage | Cost |
|:---------|:------|:-----|
| CPU (average) | ~0.1 vCPU | ~$2.00 |
| RAM (512MB) | 0.5 GB | ~$5.00 |
| Bandwidth | <50GB | ~$2.50 |
| **Total Estimated** | | **~$9.50** |
| **Minus Credits** | | **-$5.00** |
| **Your Bill** | | **~$4.50** |

**Total Monthly Cost:** $5.00 (base) + $4.50 (overages) = **~$9.50/month**

This assumes moderate usage. With optimization, you might stay within the $5 credit!

---

## 🔍 Troubleshooting

### Build Fails
**Error:** `Cannot find module 'xyz'`
- **Fix:** Check that all dependencies are in `crm-platform/package.json`
- Run `npm install` locally to verify

### API Routes 404
**Error:** `/api/twilio/call` returns 404
- **Fix:** Verify routes are in `crm-platform/src/pages/api/`
- Check Railway build logs for errors

### Environment Variable Issues
**Error:** `TWILIO_ACCOUNT_SID is undefined`
- **Fix:** Double-check all env vars in Railway Dashboard
- Make sure there are no trailing spaces or quotes

### Database Connection Fails
**Error:** `connect ETIMEDOUT` or `Invalid connection string`
- **Fix:** Verify `SUPABASE_DB_URL` is correct
- Check if your Supabase project allows connections from Railway's IPs

### Firebase Storage Issues
**Error:** `Bucket not found` or `Permission denied`
- **Fix:** Ensure `FIREBASE_PRIVATE_KEY` includes `\n` characters
- Try wrapping the key in double quotes in Railway dashboard

---

## 🎯 Post-Deployment

### Testing Checklist:
- [ ] Homepage loads at your Railway URL
- [ ] API routes respond: `/api/twilio/token`
- [ ] Login/Authentication works
- [ ] Database queries succeed
- [ ] Twilio calls work
- [ ] Email sending works (SendGrid/Mailersend)
- [ ] Custom domain resolves correctly
- [ ] SSL certificate is active (https://)

### Performance Optimization:
1. **Monitor Usage:** Check Railway dashboard daily for first week
2. **Set Budget Alerts:** In Railway Settings → Usage
3. **Optimize Cold Starts:** Railway keeps your app warm (no cold starts!)
4. **Database Region:** Ensure Supabase is in same region (us-east-1)

---

## 🔄 Rollback Instructions

If you need to rollback to Cloud Run:

1. Copy files from `backups/vercel-migration-2026-02-12/` back to root
2. Delete `railway.json`
3. Restore `cloudbuild.yaml` and `Dockerfile`
4. Revert `crm-platform/next.config.ts` to original
5. Run `npm install` in both root and crm-platform

---

## 📊 Comparison: Railway vs. Previous Setup

| Feature | Cloud Run | Railway |
|:--------|:----------|:--------|
| **Cost** | Variable (~$20-50/mo) | $5-15/mo |
| **Setup Complexity** | High (Docker, GCP) | Low (Git push) |
| **Cold Starts** | Yes (1-2 seconds) | No (always warm) |
| **Custom Domain** | Manual DNS setup | Built-in management |
| **Database** | Separate (Supabase) | Can host on Railway |
| **Deployments** | Manual builds | Auto on Git push |
| **Developer Experience** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 🎉 You're All Set!

Your CRM is now optimized for Railway. The platform will:
- ✅ Auto-deploy on every Git push
- ✅ Keep your app always warm (no cold starts)
- ✅ Scale automatically based on traffic
- ✅ Provide detailed logs and metrics
- ✅ Handle SSL certificates automatically

**Questions or issues?** Check the [Railway Docs](https://docs.railway.app) or reach out for help!

---

**Last Updated:** February 12, 2026
**Migration From:** Google Cloud Run → Railway
**Project:** Power Choosers CRM
