# Mailwarming Email Filter

**Date:** February 4, 2026  
**Status:** ✅ Active  
**Purpose:** Prevent Apollo and other mailwarming emails from cluttering the CRM inbox

---

## Overview

This filter automatically excludes mailwarming and automated warmup emails from:
1. **Gmail Sync** - Prevents them from being synced into Supabase
2. **Email List UI** - Hides any existing mailwarming emails from the inbox view
3. **Email Search** - Excludes them from search results
4. **Email Counts** - Doesn't count them in total email metrics

---

## Filtered Patterns

The system automatically excludes emails matching any of these patterns:

### Subject Line Patterns
- Contains "mailwarming"
- Contains "mail warming"
- Contains "test email"

### Sender Patterns
- From `apollo.io` domains
- From `mailwarm` domains
- From `lemwarm` domains
- From `warmup` domains

### Gmail Label Patterns (Sync Only)
- Labels containing "mailwarm"
- Labels containing "apollo"

---

## Implementation Details

### 1. Gmail Sync Filter (`useGmailSync.ts`)

**Location:** `crm-platform/src/hooks/useGmailSync.ts`

```ts
// During sync, check each email before saving
const isMailwarming = 
  emailData.subject.toLowerCase().includes('mailwarming') ||
  emailData.subject.toLowerCase().includes('mail warming') ||
  emailData.from.toLowerCase().includes('apollo.io') ||
  emailData.from.toLowerCase().includes('mailwarm') ||
  emailData.from.toLowerCase().includes('lemwarm') ||
  emailData.from.toLowerCase().includes('warmup') ||
  emailData.subject.toLowerCase().includes('test email') ||
  (msgData.labelIds && msgData.labelIds.some(label => 
    label.toLowerCase().includes('mailwarm') || 
    label.toLowerCase().includes('apollo')
  ));

if (isMailwarming) {
  console.log('[Gmail Sync] Skipping mailwarming email:', emailData.subject);
  continue; // Skip syncing to Supabase
}
```

**Effect:** New mailwarming emails will NOT be synced to Supabase going forward.

---

### 2. Email List Filter (`useEmails.ts`)

**Location:** `crm-platform/src/hooks/useEmails.ts`

```ts
// In useEmails query
query = query
  .not('subject', 'ilike', '%mailwarming%')
  .not('subject', 'ilike', '%mail warming%')
  .not('subject', 'ilike', '%test email%')
  .not('from', 'ilike', '%apollo.io%')
  .not('from', 'ilike', '%mailwarm%')
  .not('from', 'ilike', '%lemwarm%')
  .not('from', 'ilike', '%warmup%')
```

**Effect:** Existing mailwarming emails in Supabase are hidden from the UI.

---

### 3. Email Search Filter (`useSearchEmails`)

Same patterns applied to search query to exclude mailwarming emails from autocomplete and search results.

---

### 4. Email Count Filter (`useEmailsCount`)

Same patterns applied to count query so Total_Entropy metric doesn't include mailwarming emails.

---

## Cleanup Script

For existing mailwarming emails already in the database, use the cleanup script:

### Dry Run (Preview Only)
```bash
node scripts/cleanup-mailwarming-emails.js --dry-run
```

Shows what would be deleted without actually deleting anything.

### Execute Cleanup
```bash
node scripts/cleanup-mailwarming-emails.js
```

Permanently removes all mailwarming emails from Supabase.

**Script Features:**
- ✅ Pattern-by-pattern deletion with progress logging
- ✅ Total count of deleted emails
- ✅ Remaining email count after cleanup
- ✅ Dry-run mode for safety
- ✅ Error handling per pattern (continues if one pattern fails)

---

## Testing

### 1. Verify Sync Filter
1. Send yourself a test email with subject "Test Email - Mailwarming"
2. Run Gmail sync
3. Check Supabase - email should NOT appear
4. Console log should show: `[Gmail Sync] Skipping mailwarming email: Test Email - Mailwarming`

### 2. Verify UI Filter
1. Check `/network/emails` page
2. Mailwarming emails should not appear in any tab (All Nodes, Uplink In, Uplink Out)
3. Total_Entropy count should exclude mailwarming emails

### 3. Verify Search Filter
1. Search for "apollo" or "mailwarming" in email search
2. Should return zero results (or only non-mailwarming emails containing those terms)

---

## Adding More Patterns

To filter additional mailwarming services:

### 1. Update Gmail Sync Filter
Edit `crm-platform/src/hooks/useGmailSync.ts`:

```ts
const isMailwarming = 
  emailData.subject.toLowerCase().includes('your-new-pattern') ||
  emailData.from.toLowerCase().includes('new-service.com') ||
  // ... existing patterns
```

### 2. Update Supabase Query Filters
Edit `crm-platform/src/hooks/useEmails.ts`:

```ts
query = query
  .not('subject', 'ilike', '%your-new-pattern%')
  .not('from', 'ilike', '%new-service.com%')
  // ... existing patterns
```

Apply to all three query functions:
- `useEmails`
- `useSearchEmails`
- `useEmailsCount`

### 3. Update Cleanup Script
Edit `scripts/cleanup-mailwarming-emails.js`:

```js
const MAILWARMING_PATTERNS = [
  { field: 'subject', pattern: '%your-new-pattern%' },
  { field: 'from', pattern: '%new-service.com%' },
  // ... existing patterns
];
```

---

## Performance Considerations

**Query Performance:**
- `.not()` filters are applied server-side by Postgres
- Indexed columns (`subject`, `from`) make filtering fast
- Multiple `.not()` filters have minimal performance impact

**Sync Performance:**
- Filtering happens in-memory during sync loop
- Skipped emails don't trigger Supabase writes (faster sync)
- No additional API calls required

---

## Alternative Approaches (Not Implemented)

### Option 1: Gmail Filter Rules
Create a Gmail filter to auto-archive or delete mailwarming emails before sync.

**Pros:** Removes emails from Gmail entirely  
**Cons:** Manual setup per user, no centralized control

### Option 2: Database Flags
Add an `is_mailwarming` boolean field to the emails table.

**Pros:** Easy to toggle visibility  
**Cons:** Still syncs and stores unwanted emails, uses database space

### Option 3: Separate Table
Store mailwarming emails in a separate `mailwarming_emails` table.

**Pros:** Complete separation  
**Cons:** More complex, requires schema changes

**Why We Chose Current Approach:**
- No schema changes required
- Works immediately for new and existing data
- Easy to extend with new patterns
- Low maintenance overhead

---

## Troubleshooting

### Mailwarming Emails Still Appearing

**Check 1: Verify patterns match**
```sql
-- Check a sample mailwarming email in database
SELECT subject, from 
FROM emails 
WHERE subject ILIKE '%mailwarming%' 
LIMIT 1;
```

If found, pattern should match. If not, add new pattern.

**Check 2: Clear React Query cache**
```ts
// In browser console
queryClient.invalidateQueries({ queryKey: ['emails'] })
```

**Check 3: Check for typos in filter logic**
Review filter code in `useEmails.ts` - ensure `.not()` syntax is correct.

### Cleanup Script Not Working

**Error: "Missing Supabase credentials"**
- Ensure `.env` has `SUPABASE_SERVICE_ROLE_KEY` (not just anon key)

**Error: "permission denied"**
- Service role key may be incorrect or expired
- Check key in Supabase Dashboard → Settings → API

**Dry run shows 0 emails**
- Good! No mailwarming emails in database
- Or patterns don't match - check email samples manually

---

## Files Modified

1. ✅ `crm-platform/src/hooks/useGmailSync.ts` - Sync filter
2. ✅ `crm-platform/src/hooks/useEmails.ts` - Query filters (3 functions)
3. ✅ `scripts/cleanup-mailwarming-emails.js` - Cleanup utility
4. ✅ `MAILWARMING-FILTER.md` - This documentation

---

## Future Enhancements

1. **Admin UI:** Toggle mailwarming filters on/off per user
2. **Pattern Management:** Store patterns in Supabase for dynamic updates
3. **Analytics:** Track how many mailwarming emails are being filtered
4. **Label Auto-Archive:** Auto-apply Gmail labels to filtered emails for manual review
5. **Whitelist:** Allow specific senders even if they match patterns (edge cases)

---

**Status:** 🚀 Active and Filtering  
**Impact:** Cleaner inbox, faster sync, accurate metrics  
**Maintenance:** Add new patterns as new warmup services emerge
