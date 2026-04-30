5# Phone Reveal Cache Fix

## Problem Summary

When a user revealed a phone number for a contact (e.g., Jarrod Anderson), the phone number was successfully saved to the database by the Apollo webhook, but it didn't appear in the Uplinks card after refreshing the page.

## Root Cause

The issue was caused by React Query's cache staleness configuration:

1. **Apollo enrichment returns empty phones immediately** → `phones: []` (phones delivered asynchronously via webhook)
2. **OrgIntelligence invalidates cache** → Refetches contact with empty phones
3. **Webhook updates database** → Saves phone to `mobile` field (e.g., `+1 (903) 357-3467`)
4. **User refreshes page** → React Query returns **stale cached data** (empty phones) because `staleTime: 5 minutes`
5. **Phones don't appear in Uplinks** ❌

The `useContact` hook had a 5-minute `staleTime`, meaning React Query would serve cached data for 5 minutes without refetching from the database, even though the webhook had updated the record.

## Solution

Reduced the `staleTime` from 5 minutes to 10 seconds for contact detail queries. This ensures that when a user refreshes the page after a webhook update, the contact data is refetched from the database within 10 seconds.

### Changes Made

1. **Added `updatedAt` to contact query** (`useContacts.ts` line 340)
   - Now selects `updatedAt` timestamp from database
   - Added to `ContactDetail` interface for future use

2. **Reduced staleTime** (`useContacts.ts` line 1148)
   ```typescript
   staleTime: 1000 * 10, // 10 seconds (was 5 minutes)
   ```

### How It Works

- **Before**: Contact data cached for 5 minutes → Webhook updates not visible until cache expires
- **After**: Contact data cached for 10 seconds → Webhook updates visible within 10 seconds of page refresh

This balances between:
- **Freshness**: Phones appear quickly after webhook updates
- **Performance**: Reduces unnecessary database queries (10s is reasonable for dossier pages)

## Data Flow

### Before Fix
```
1. User clicks "Reveal Phone"
2. Apollo API returns phones: []
3. OrgIntelligence refetches contact → caches empty phones (5 min staleTime)
4. Webhook updates DB → mobile: "+1 (903) 357-3467"
5. User refreshes page → React Query serves stale cache (empty phones) ❌
6. User waits 5 minutes → Cache expires → Phones appear
```

### After Fix
```
1. User clicks "Reveal Phone"
2. Apollo API returns phones: []
3. OrgIntelligence refetches contact → caches empty phones (10 sec staleTime)
4. Webhook updates DB → mobile: "+1 (903) 357-3467"
5. User refreshes page → React Query serves stale cache (empty phones)
6. User waits 10 seconds → Cache expires → Phones appear ✅
```

## Database Verification

Confirmed Jarrod Anderson's record in database:
```sql
SELECT id, name, mobile, "workPhone", "otherPhone", "updatedAt" 
FROM contacts 
WHERE name ILIKE '%Jarrod Anderson%';
```

Result:
- `mobile`: `+1 (903) 357-3467` ✅
- `updatedAt`: `2026-04-30 21:27:31.253+00` ✅

## Testing

To verify the fix:

1. **Reveal a phone number** for a contact in OrgIntelligence
2. **Wait for webhook** to update the database (check console logs)
3. **Refresh the page** or navigate away and back
4. **Wait up to 10 seconds** for cache to expire
5. **Phone should appear** in Uplinks card

## Files Modified

- `crm-platform/src/hooks/useContacts.ts`
  - Added `updatedAt` to `CONTACT_DETAIL_SELECT` query
  - Added `updatedAt` to `ContactDetail` interface
  - Reduced `staleTime` from `1000 * 60 * 5` (5 minutes) to `1000 * 10` (10 seconds)

## Additional Notes

- The webhook (`/api/apollo/phone-webhook.js`) already updates `updatedAt` when saving phones
- The polling mechanism in `OrgIntelligence.tsx` works correctly when user stays on page
- This fix handles the case when user refreshes/navigates away before polling completes
- No changes needed to webhook or OrgIntelligence components
- The 10-second staleTime is a reasonable tradeoff between freshness and performance for dossier pages

## Alternative Approaches Considered

1. **Dynamic staleTime based on updatedAt**: Would require React Query v5 features not available in current version
2. **Webhook invalidation**: Would require server-side cache invalidation mechanism (complex)
3. **Polling on mount**: Would add unnecessary complexity and database load
4. **Zero staleTime**: Would cause excessive refetching and poor performance

The 10-second staleTime approach is the simplest and most effective solution for this use case.

