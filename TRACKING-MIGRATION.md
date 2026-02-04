# Email Tracking Migration to Supabase

**Date:** February 4, 2026  
**Status:** ✅ Complete  
**Migration Type:** Firebase Firestore → Supabase

---

## Overview

All email tracking (opens & clicks) has been migrated from Firebase Firestore to Supabase. The tracking infrastructure is now fully functional and writes directly to the production database.

---

## What Changed

### 1. **Open Tracking** (`/api/email/track/{trackingId}`)
- **Before:** Wrote to `admin.firestore().collection('emails').doc(trackingId)`
- **After:** Writes to `supabaseAdmin.from('emails').update({openCount, opens})`
- **Features Preserved:**
  - In-memory deduplication (30s window)
  - Database deduplication check
  - Device type detection
  - IP address masking
  - Bot flagging
  - 1x1 transparent pixel response

### 2. **Click Tracking** (`/api/email/click/{trackingId}?url=...`)
- **Before:** Wrote to `admin.firestore().collection('emails').doc(trackingId)`
- **After:** Writes to `supabaseAdmin.from('emails').update({clickCount, clicks})`
- **Features Preserved:**
  - Click event metadata (URL, device, IP)
  - 302 redirect to original URL
  - Link indexing

### 3. **Email Stats API** (`/api/email/stats?trackingId=...`)
- **Before:** Returned mock data
- **After:** Fetches real-time stats from Supabase
- **Returns:** `{ openCount, clickCount, opens[], clicks[], metadata }`

---

## Database Schema (Already Exists)

```sql
-- emails table (supabase/migrations/20240124103000_full_schema.sql)
CREATE TABLE emails (
  id text primary key,
  "openCount" int default 0,
  "clickCount" int default 0,
  opens jsonb default '[]'::jsonb,
  clicks jsonb default '[]'::jsonb,
  -- ... other fields
);
```

---

## Email Sending Flow

### Sending via Gmail API (`/api/email/sendgrid-send`)

1. **Pre-Send:** Email record created in Supabase with `trackingId`
2. **Tracking Injection:** HTML content gets:
   - Open tracking pixel: `<img src="https://[domain]/api/email/track/{trackingId}" />`
   - Click tracking: All links wrapped with `https://[domain]/api/email/click/{trackingId}?url=...`
3. **Send:** Email sent via Gmail Service Account
4. **Post-Send:** Record updated with `status: 'sent'`, `gmailMessageId`, `threadId`

---

## Frontend Integration

### UI Components Already Wired

**File:** `crm-platform/src/components/emails/EmailList.tsx`

```tsx
// Telemetry Column (Forensic Design)
{email.type === 'sent' && (
  <div className="flex items-center gap-3 bg-white/5 rounded px-2 py-1 border border-white/5">
    {/* Opens */}
    <Eye size={12} className={openCount > 0 ? "text-emerald-400" : "text-zinc-600"} />
    <span className={openCount > 2 ? "text-white" : "text-emerald-400"}>{openCount}</span>
    
    {/* Clicks */}
    <MousePointer2 size={12} className={clickCount > 0 ? "text-[#002FA7]" : "text-zinc-600"} />
    <span className={clickCount > 0 ? "text-[#002FA7]" : "text-zinc-600"}>{clickCount}</span>
  </div>
)}

// Hot Lead Highlighting
<div className={cn(
  "border-l-2",
  clickCount > 0 ? "border-[#002FA7]" : "border-transparent"
)}>
```

### Data Hooks (`crm-platform/src/hooks/useEmails.ts`)

```ts
export interface Email {
  openCount?: number
  clickCount?: number
  // ... other fields
}

// Fetches from Supabase emails table
const emails = data.map(item => ({
  openCount: item.openCount,
  clickCount: item.clickCount
  // ...
}))
```

### CRM-Sent vs Gmail-Sent Distinction

**UPLINK_OUT Tab Behavior:**
- Only shows emails sent **through the CRM** (Compose Modal → `/api/email/sendgrid-send`)
- **Excludes** emails sent directly from Gmail web/mobile app
- **Identifier:** CRM emails have tracking IDs starting with `gmail_` (e.g., `gmail_1738713600000_abc123`)
- **Reason:** Only CRM-sent emails have tracking pixels/click wrapping and telemetry data

**Gmail-Synced Sent Emails:**
- Emails sent from Gmail (not CRM) are synced but **hidden** from UPLINK_OUT
- These have Gmail message IDs (alphanumeric, no prefix)
- No tracking data (openCount/clickCount remain null)
- Accessible via search if needed

**Filter Logic:**
```ts
// In EmailList.tsx
if (filter === 'sent') {
  const isCrmSent = email.id.startsWith('gmail_') // Tracking ID format
  return email.type === 'sent' && isCrmSent
}
```

---

## Files Modified

### Backend
- ✅ `server.js` (lines 2110-2180, 2243-2281, 2487-2500)
  - Added `import { supabaseAdmin } from './api/_supabase.js'`
  - Replaced Firebase logic with Supabase queries
  - Updated stats endpoint to fetch real data

### Frontend (Already Complete)
- ✅ `crm-platform/src/components/emails/EmailList.tsx`
  - Segmented control navigation
  - Telemetry column with Opens/Clicks
  - Hot lead highlighting (Klein Blue border)

### Infrastructure (Already Exists)
- ✅ `api/email/sendgrid-send.js` - Creates tracking records
- ✅ `api/email/tracking-helper.js` - Injects pixels/links
- ✅ `api/_supabase.js` - Supabase admin client
- ✅ `supabase/migrations/20240124103000_full_schema.sql` - Schema

---

## Testing Checklist

### 1. Send Test Email
```bash
# Via Compose Modal in UI
POST /api/email/sendgrid-send
{
  "to": "test@example.com",
  "subject": "Test Tracking",
  "content": "<p>Hello World</p>",
  "userEmail": "trey@nodalpoint.io"
}
```

### 2. Verify Tracking Record
```sql
-- Check Supabase
SELECT id, "openCount", "clickCount", opens, clicks 
FROM emails 
WHERE id LIKE 'gmail_%' 
ORDER BY timestamp DESC 
LIMIT 5;
```

### 3. Trigger Open Event
- Open the test email in Gmail
- Tracking pixel should fire: `GET /api/email/track/{trackingId}`
- Check `openCount` increments in Supabase

### 4. Trigger Click Event
- Click a link in the test email
- Should redirect through: `GET /api/email/click/{trackingId}?url=...`
- Check `clickCount` increments in Supabase

### 5. View in UI
- Go to `/network/emails`
- Filter to "UPLINK_OUT" (sent emails)
- Verify telemetry column shows Opens/Clicks
- Verify hot lead border appears for emails with clicks

---

## Environment Variables Required

```env
# Supabase (already configured)
NEXT_PUBLIC_SUPABASE_URL=https://gfitvnkaevozbcyostez.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

# Gmail Service Account (already configured)
GOOGLE_SERVICE_ACCOUNT_KEY=<json_key>
```

---

## Rollback Plan (If Needed)

If issues arise, the original Firebase code is preserved in git history. To rollback:

```bash
git diff HEAD~1 server.js  # Review changes
git checkout HEAD~1 -- server.js  # Restore previous version
```

However, **rollback is not recommended** because:
1. Supabase is the source of truth for the UI
2. Gmail sync writes to Supabase only
3. Firebase would create data fragmentation

---

## Migration Benefits

1. **Single Source of Truth:** All email data (content + tracking) in Supabase
2. **Real-Time UI:** No sync lag between tracking and display
3. **Cost Reduction:** Eliminates Firebase read/write costs for tracking
4. **Forensic Precision:** UI now shows accurate engagement metrics
5. **Query Performance:** Supabase Postgres > Firebase for relational queries

---

## Next Steps (Optional Enhancements)

1. **Email Detail Page:** Show individual open/click events with device breakdown
2. **Analytics Dashboard:** Aggregate stats (avg opens, click-through rate)
3. **Lead Scoring:** Auto-tag contacts with high engagement
4. **Sequence Optimization:** Track which templates perform best
5. **A/B Testing:** Compare subject lines, send times, content styles

---

## Support

If tracking stops working:
1. Check server logs: `journalctl -u server.service -f` (production)
2. Verify Supabase connection: Check `SUPABASE_SERVICE_ROLE_KEY` in `.env`
3. Test tracking pixel: `curl https://nodalpoint.io/api/email/track/test_id`
4. Inspect database: Query `emails` table for recent `openCount` updates

---

**Status:** 🚀 Live in Production  
**Author:** Builder Agent (Nodal Point Migration)  
**Verified By:** Trey
