# Vercel Migration Complete - 2026-02-12

## What Was Changed

### Files Moved to Backup
All legacy Cloud Run files have been moved to `backups/vercel-migration-2026-02-12/`:
- `server.js` - Legacy Node.js HTTP server
- `api/` - API handlers (now in `crm-platform/src/pages/api/`)
- `crm-dashboard.html` - Legacy dashboard (replaced by React app)
- `about.html`, `index-legacy.html` - Legacy static pages
- `Dockerfile`, `cloudbuild.yaml` - Cloud Run deployment configs
- `package.json`, `package-lock.json` - Root package files

### New Structure
The application is now fully consolidated in the `crm-platform/` directory:
- **Frontend**: Next.js React app in `crm-platform/src/`
- **Backend**: API routes in `crm-platform/src/pages/api/`
- **Dependencies**: All merged into `crm-platform/package.json`

### Key Changes
1. **API Handlers**: Migrated 93+ handlers from root `/api` to `crm-platform/src/pages/api/`
2. **Blog Posts**: Created Next.js handler at `crm-platform/src/pages/api/posts/[slug].js`
3. **Dependencies**: Merged backend dependencies (twilio, sendgrid, etc.) into platform
4. **Routing**: Removed external rewrites, added internal `/posts/:slug` rewrite
5. **Configuration**: Created `vercel.json` for Vercel deployment

## Running Locally

### Development Mode
```bash
cd crm-platform
npm install
npm run dev
```
This starts the Next.js dev server on port 3000 with all API routes included.

### Production Build
```bash
cd crm-platform
npm run build
npm start
```

## Deploying to Vercel

### Initial Setup
1. Install Vercel CLI: `npm i -g vercel`
2. Link project: `vercel link` (run from repo root)
3. Add environment variables in Vercel Dashboard

### Deploy
```bash
# Preview deployment
vercel

# Production deployment
vercel --prod
```

### Environment Variables
Make sure to add all variables from `.env` to your Vercel project:
- Supabase credentials
- Firebase credentials
- Twilio credentials
- API keys (Apollo, SendGrid, etc.)

## Important Notes

### Cron Jobs
The `vercel.json` includes a cron job for Apollo news refresh. You may need to add more cron jobs for other scheduled tasks that were previously handled by `node-cron` in `server.js`.

### Stateless Functions
Vercel functions are stateless. Any in-memory storage (like the `emailTrackingEvents` Map in the old `server.js`) must be replaced with database storage (Supabase).

### File Uploads
If you use `formidable` for file uploads, make sure to configure body parsing correctly in Next.js API routes:
```js
export const config = {
  api: {
    bodyParser: false,
  },
};
```

## Rollback Instructions
If you need to rollback to the Cloud Run setup:
1. Copy files from `backups/vercel-migration-2026-02-12/` back to root
2. Delete `crm-platform/src/pages/api/`
3. Revert `crm-platform/package.json` and `next.config.ts`
4. Run `npm install` in root and `crm-platform/`

## Next Steps
1. Test all API endpoints locally
2. Run `npm run build` in `crm-platform/` to verify build succeeds
3. Deploy to Vercel preview environment
4. Test thoroughly before promoting to production
5. Update DNS/domain settings if needed
