# Production AI Analysis Fix

## Issue Diagnosis

The AI document analysis is failing in production because:

1. **Frontend calls wrong endpoint**: The frontend was calling `/api/analyze-document` as a relative URL, which hits the Next.js app instead of the backend API server.
2. **Backend environment variables**: The backend API service may be missing critical environment variables.
3. **Query refetch timing**: The UI wasn't refreshing immediately after upload.

## Fixes Applied

### 1. Frontend API URL Fix (`DataIngestionCard.tsx`)

```typescript
// Now uses backend API URL in production
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '';
const apiUrl = apiBaseUrl ? `${apiBaseUrl}/api/analyze-document` : '/api/analyze-document';
```

### 2. Immediate Query Refetch (`DataIngestionCard.tsx`)

```typescript
// Force immediate refetch after AI completion
await queryClient.invalidateQueries({ queryKey: ['account', accountId] });
await queryClient.refetchQueries({ queryKey: ['account', accountId] });
```

### 3. Cloud Build Configuration (`cloudbuild.yaml`)

Added `NEXT_PUBLIC_API_BASE_URL` environment variable:
```yaml
- '--set-env-vars'
- 'NEXT_PUBLIC_API_BASE_URL=https://nodal-point-network-792458658491.us-central1.run.app'
```

## Required: Backend Environment Variables

The backend service (`nodal-point-network`) MUST have these secrets set:

### Check Current Secrets

```bash
gcloud run services describe nodal-point-network \
  --region=us-central1 \
  --format="value(spec.template.spec.containers[0].env)"
```

### Set Missing Secrets

Run these commands to set the required environment variables on the backend:

```bash
# Get your Gemini API key from .env file
# Set it on Cloud Run
gcloud run services update nodal-point-network \
  --region=us-central1 \
  --set-env-vars="FREE_GEMINI_KEY=YOUR_GEMINI_API_KEY_HERE"

# Set Supabase Service Role Key
gcloud run services update nodal-point-network \
  --region=us-central1 \
  --set-env-vars="SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE"

# Set Supabase URL
gcloud run services update nodal-point-network \
  --region=us-central1 \
  --set-env-vars="SUPABASE_URL=https://gfitvnkaevozbcyostez.supabase.co"
```

### Or Set All at Once

```bash
gcloud run services update nodal-point-network \
  --region=us-central1 \
  --set-env-vars="FREE_GEMINI_KEY=YOUR_KEY,SUPABASE_SERVICE_ROLE_KEY=YOUR_KEY,SUPABASE_URL=https://gfitvnkaevozbcyostez.supabase.co"
```

## Deployment Steps

### 1. Deploy Frontend Changes

```bash
# From project root
gcloud builds submit --config cloudbuild.yaml
```

This will:
- Build the Next.js app with the updated API URL
- Deploy to `power-choosers-crm` service
- Set `NEXT_PUBLIC_API_BASE_URL` environment variable

### 2. Verify Backend Service

```bash
# Check if backend is running
gcloud run services list --region=us-central1 | grep nodal-point-network

# Test backend endpoint
curl -X POST https://nodal-point-network-792458658491.us-central1.run.app/api/analyze-document \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

Expected response (even with test data):
- `400` or `500` status is OK (means endpoint is reachable)
- `404` means the service isn't deployed or route is wrong

### 3. Test Document Upload

1. Go to production: https://nodalpoint.io
2. Navigate to any Account Dossier
3. Upload a bill or contract to Data Locker
4. Check browser console for errors
5. Verify:
   - Toast shows "CONTRACT SECURED" or "BILL ANALYZED"
   - Refraction Event animation plays (blue scan line)
   - Fields update immediately (no refresh needed)
   - Check backend logs: `gcloud run services logs read nodal-point-network --region=us-central1`

## Troubleshooting

### Frontend Not Calling Backend

**Symptom**: Console shows 404 error for `/api/analyze-document`

**Check**:
```bash
# Verify environment variable is set
gcloud run services describe power-choosers-crm \
  --region=us-central1 \
  --format="value(spec.template.spec.containers[0].env)" | grep API_BASE_URL
```

Should show: `NEXT_PUBLIC_API_BASE_URL=https://nodal-point-network-792458658491.us-central1.run.app`

### Backend Returns 500 Error

**Symptom**: Request reaches backend but returns 500

**Check Backend Logs**:
```bash
gcloud run services logs read nodal-point-network \
  --region=us-central1 \
  --limit=50
```

Look for:
- `[Analyze Document] Missing Gemini configuration` → Set FREE_GEMINI_KEY
- `[Analyze Document] Download Error` → Set SUPABASE_SERVICE_ROLE_KEY
- `Failed to download file from storage` → Storage permissions issue

### CORS Errors

**Symptom**: Browser console shows CORS error

**Fix**: Update backend CORS configuration in `api/_cors.js`:
```javascript
const allowedOrigins = [
  'http://localhost:3000',
  'https://nodalpoint.io',
  'https://power-choosers-crm-792458658491.us-central1.run.app'
];
```

### No Refraction Animation

**Symptom**: Upload succeeds but UI doesn't update

**This is now fixed** by the explicit `refetchQueries` call, but if it persists:
1. Check React Query DevTools
2. Verify `accountId` is passed correctly
3. Check if query key matches: `['account', accountId]`

## Local Development

For localhost, the changes are backward compatible:
- `NEXT_PUBLIC_API_BASE_URL` defaults to empty string
- Falls back to relative URL `/api/analyze-document`
- Hits `server.js` on port 3001 (via Next.js rewrites or direct proxy)

No changes needed for local development!

## Summary

✅ **Fixed**: Frontend now calls backend API in production  
✅ **Fixed**: Immediate query refetch after upload  
✅ **Fixed**: Cloud Build sets proper environment variables  
⚠️ **Action Required**: Set backend secrets (GEMINI_KEY, SUPABASE keys)  
⚠️ **Action Required**: Redeploy frontend with `gcloud builds submit`

After redeployment, AI analysis will work in production! 🛰️
