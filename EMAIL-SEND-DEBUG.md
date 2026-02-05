# Email Sending Debugging Guide

**Date:** February 4, 2026  
**Issue:** Emails sent from ComposeModal not appearing in EmailList  
**Status:** ✅ Fixed (UI filtering + enhanced query refresh)

---

## Investigation Summary

### Database Schema ✅
Used MCP debugger to verify Supabase `emails` table schema:
- All required fields exist (`id`, `subject`, `from`, `to`, `type`, `status`, etc.)
- Tracking fields present (`openCount`, `clickCount`, `opens`, `clicks`)
- `type` field accepts 'sent' value
- `metadata` jsonb field stores `ownerId`

### Email Flow Architecture

**CRM-Sent Emails:**
1. User composes email in `ComposeModal.tsx`
2. Calls `sendEmail()` from `useEmails.ts` hook
3. Hook calls `/api/email/sendgrid-send` endpoint
4. Endpoint creates tracking record in Supabase with ID: `gmail_${timestamp}_${random}`
5. Endpoint sends email via Gmail Service Account
6. Hook invalidates React Query cache
7. EmailList refetches and displays new email

**Gmail-Synced Emails:**
1. `GlobalSync` component runs every 3 minutes
2. Fetches emails from Gmail API
3. Saves to Supabase with Gmail message ID (e.g., `19c29975668fa966`)
4. These show in ALL_NODES and UPLINK_IN tabs

---

## Current State (After Fixes)

### ✅ Fix 1: Total_Nodes Now Reflects Active Filter

**Before:**
```tsx
<span>Total_Nodes: {totalEmails ?? filteredEmails.length}</span>
```
- Always showed total email count (ignoring active filter)

**After:**
```tsx
<span>Total_Nodes: {filteredEmails.length}</span>
```
- Shows count for active filter:
  - ALL_NODES → All emails
  - UPLINK_IN → Only received emails
  - UPLINK_OUT → Only CRM-sent emails

**Location:** `EmailList.tsx` (header line 169, footer line 297)

---

### ✅ Fix 2: Enhanced Email Send Mutation

**Before:**
```ts
onSuccess: () => {
  toast.success('Email sent successfully');
  queryClient.invalidateQueries({ queryKey: ['emails'] });
}
```
- Only invalidated query
- No confirmation of backend processing
- No forced refetch

**After:**
```ts
onSuccess: (data) => {
  console.log('[Email Sent] Success:', data); // Log trackingId response
  toast.success('Email sent successfully');
  queryClient.invalidateQueries({ queryKey: ['emails'] });
  queryClient.invalidateQueries({ queryKey: ['emails-count'] });
  // Force refetch after backend processing
  setTimeout(() => {
    queryClient.refetchQueries({ queryKey: ['emails'] });
  }, 500);
}
```
- Logs success response (includes `trackingId`)
- Invalidates both emails and count queries
- Force refetches after 500ms to ensure backend processed

**Location:** `useEmails.ts` lines 175-183

---

## How to Verify Email Sending Works

### 1. Send Test Email
1. Go to `/network/emails`
2. Click "Compose" button
3. Fill in:
   - To: `your-test-email@example.com`
   - Subject: `Test CRM Email`
   - Body: `Testing email tracking`
4. Click "Send"

### 2. Check Browser Console
Look for success log:
```
[Email Sent] Success: {
  success: true,
  messageId: "...",
  threadId: "...",
  trackingId: "gmail_1738713600000_abc123"
}
```

**If you see this:**
- ✅ Email was sent successfully
- ✅ Tracking record created in Supabase
- ✅ Query invalidation triggered

**If you DON'T see this:**
- ❌ API call failed
- Check Network tab for `/api/email/sendgrid-send` response
- Check for error messages

### 3. Check Supabase (via MCP)
```sql
-- Find CRM-sent emails
SELECT id, subject, type, "from", "to", "createdAt"
FROM emails 
WHERE id LIKE 'gmail_%' 
ORDER BY "createdAt" DESC 
LIMIT 10;
```

**Expected Result:**
- Rows with IDs like `gmail_1738713600000_abc123`
- `type` = 'sent'
- `from` = your email address

**If NO results:**
- Email record was NOT created in Supabase
- Check backend logs for errors
- Verify `SUPABASE_SERVICE_ROLE_KEY` is set in `.env`

### 4. Check EmailList UI
1. Go to `/network/emails`
2. Click "UPLINK_OUT" tab
3. Look for your test email

**Expected:**
- Email appears at top of list
- Shows Opens: 0, Clicks: 0 (telemetry)
- Has squircle avatar with "NP"

**If NOT visible:**
- Check browser console for `[Email Sent] Success` log
- Check if filtering logic is working (EmailList.tsx line 47)
- Verify `filteredEmails` includes CRM-sent emails

---

## Common Issues & Solutions

### Issue 1: "Failed to send: [error message]"

**Cause:** API call to `/api/email/sendgrid-send` failed

**Debug Steps:**
1. Check browser Network tab → `/api/email/sendgrid-send`
2. Look at response body for error details
3. Common errors:
   - "Missing Gmail service account key" → Check `GOOGLE_SERVICE_ACCOUNT_KEY` in `.env`
   - "Gmail service initialized" (dryRun) → Remove `dryRun: true` flag
   - "Permission denied" → Gmail service account not authorized

**Fix:**
```bash
# Check .env file has required keys
cat .env | grep GOOGLE_SERVICE_ACCOUNT_KEY
cat .env | grep SUPABASE_SERVICE_ROLE_KEY
```

---

### Issue 2: Email Sends But Doesn't Appear in List

**Cause:** Supabase insert failed silently, or query not refetching

**Debug Steps:**
1. Check browser console for `[Email Sent] Success` log
2. If success log present, check MCP:
   ```sql
   SELECT * FROM emails WHERE id LIKE 'gmail_%' ORDER BY "createdAt" DESC LIMIT 5;
   ```
3. If record exists in Supabase but not in UI:
   - Check filter logic (EmailList.tsx line 47-53)
   - Verify `email.id.startsWith('gmail_')` condition
   - Check if React Query cache is stale

**Fix:**
- Clear browser cache and reload
- Force refetch: Open DevTools → React Query DevTools → Invalidate `emails`

---

### Issue 3: Email Appears in ALL_NODES But Not UPLINK_OUT

**Cause:** Email doesn't have CRM tracking ID format

**Debug Steps:**
1. Check email `id` in Supabase:
   ```sql
   SELECT id, subject, type FROM emails WHERE type = 'sent' ORDER BY "createdAt" DESC LIMIT 5;
   ```
2. If ID is like `19c29975668fa966` (not `gmail_*`):
   - Email was synced FROM Gmail, not sent via CRM
   - Only shows in ALL_NODES and UPLINK_IN

**Expected Behavior:**
- **CRM-sent emails:** ID starts with `gmail_` → Shows in UPLINK_OUT
- **Gmail-synced emails:** Gmail message ID → Shows in ALL_NODES only

---

### Issue 4: Total_Nodes Count Wrong

**Cause:** Was showing `totalEmails` instead of filtered count

**Status:** ✅ FIXED (lines 169, 297 in EmailList.tsx)

**Verify Fix:**
1. Go to `/network/emails`
2. Click each tab and check Total_Entropy count:
   - ALL_NODES → Should show all emails count
   - UPLINK_IN → Should show only received count
   - UPLINK_OUT → Should show only CRM-sent count

---

## Backend Email Creation Flow

### Step-by-Step (`/api/email/sendgrid-send`)

1. **Generate Tracking ID**
   ```js
   const trackingId = `gmail_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
   ```

2. **Inject Tracking**
   ```js
   const trackedContent = injectTracking(content, trackingId, {
     enableOpenTracking: true,
     enableClickTracking: true
   });
   ```
   - Adds 1x1 pixel: `<img src="/api/email/track/{trackingId}" />`
   - Wraps links: `<a href="/api/email/click/{trackingId}?url=..." />`

3. **Create Supabase Record**
   ```js
   const emailRecord = {
     id: trackingId,
     to: [to],
     subject,
     html: trackedContent,
     text: textContent,
     from: ownerEmail,
     type: 'sent',
     status: 'sending',
     openCount: 0,
     clickCount: 0,
     timestamp: new Date().toISOString(),
     metadata: { ownerId: ownerEmail, provider: 'gmail' }
   };
   
   await supabaseAdmin.from('emails').insert(emailRecord);
   ```

4. **Send via Gmail**
   ```js
   const result = await gmailService.sendEmail({...});
   ```

5. **Update Status**
   ```js
   await supabaseAdmin
     .from('emails')
     .update({ status: 'sent', metadata: { gmailMessageId: result.messageId } })
     .eq('id', trackingId);
   ```

6. **Return Response**
   ```js
   res.end(JSON.stringify({
     success: true,
     messageId: result.messageId,
     trackingId
   }));
   ```

---

## Testing Checklist

- [ ] Send test email from ComposeModal
- [ ] Check browser console for success log
- [ ] Verify email appears in UPLINK_OUT tab
- [ ] Check telemetry shows 0 Opens, 0 Clicks
- [ ] Click on email to verify detail view
- [ ] Send another test email
- [ ] Verify Total_Nodes count increases
- [ ] Switch between tabs and verify counts change
- [ ] Open sent email in Gmail
- [ ] Wait 30 seconds, refresh EmailList
- [ ] Verify Opens count increments
- [ ] Click a link in the email
- [ ] Verify Clicks count increments
- [ ] Check row has Klein Blue border (hot lead)

---

## MCP Debugger Queries

### Check Recent CRM-Sent Emails
```sql
SELECT id, subject, type, "from", "to", "openCount", "clickCount", "createdAt"
FROM emails 
WHERE id LIKE 'gmail_%' 
ORDER BY "createdAt" DESC 
LIMIT 20;
```

### Check Recent Gmail-Synced Emails
```sql
SELECT id, subject, type, "from", metadata->>'gmailMessageId', "createdAt"
FROM emails 
WHERE id NOT LIKE 'gmail_%' AND type = 'sent'
ORDER BY "createdAt" DESC 
LIMIT 20;
```

### Find Emails With Tracking Data
```sql
SELECT id, subject, "openCount", "clickCount", 
       jsonb_array_length(opens) as open_events,
       jsonb_array_length(clicks) as click_events
FROM emails 
WHERE "openCount" > 0 OR "clickCount" > 0
ORDER BY "createdAt" DESC;
```

### Check Email by Tracking ID
```sql
SELECT * FROM emails WHERE id = 'gmail_1738713600000_abc123';
```

---

## Files Modified

1. ✅ `crm-platform/src/components/emails/EmailList.tsx`
   - Line 169: Header Total_Entropy → `filteredEmails.length`
   - Line 297: Footer Total_Nodes → `filteredEmails.length`

2. ✅ `crm-platform/src/hooks/useEmails.ts`
   - Lines 175-183: Enhanced `sendEmailMutation.onSuccess`
   - Added console logging
   - Added count query invalidation
   - Added forced refetch with 500ms delay

3. ✅ `EMAIL-SEND-DEBUG.md` - This documentation

---

## Next Steps (If Issues Persist)

1. **Add Debug Logging to Backend**
   ```js
   // In api/email/sendgrid-send.js after line 165
   logger.info('[Gmail] Email record created in Supabase:', { 
     trackingId, 
     to, 
     subject,
     ownerId: ownerEmail 
   });
   ```

2. **Add Error Toast for Failed Supabase Insert**
   ```js
   // In api/email/sendgrid-send.js line 167
   logger.error('[Gmail] Failed to create email record:', dbError);
   // Send error in response so frontend knows
   ```

3. **Add React Query DevTools**
   ```tsx
   // In crm-platform/src/app/network/layout.tsx
   import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
   
   <ReactQueryDevtools initialIsOpen={false} />
   ```

4. **Create Email Send Test Page**
   ```tsx
   // crm-platform/src/app/test-email/page.tsx
   // Simple form to test email sending with detailed logging
   ```

---

**Status:** ✅ Monitoring for issues  
**Last Updated:** February 4, 2026  
**Author:** Builder Agent (Nodal Point)
