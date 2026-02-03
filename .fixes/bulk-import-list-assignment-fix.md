# Bulk Import List Assignment Fix

## Issues Identified

1. **Silent List Assignment Failures**: The bulk import was using `.insert()` for list_members, which would fail silently on duplicate entries or constraint violations.
2. **No Cache Invalidation**: After import completion, the target list counts were not refreshing because React Query cache wasn't being invalidated.
3. **Missing Feedback**: No specific toast notification to confirm that records were successfully added to the selected list.

## Changes Made

### 1. Import Query Client Hook
```typescript
import { useQueryClient } from '@tanstack/react-query';
```

Added QueryClient instance to component:
```typescript
const queryClient = useQueryClient();
```

### 2. Enhanced List Assignment Logic

**Before:**
```typescript
await supabase.from('list_members').insert({
  listId: selectedListId,
  targetId: result.id,
  targetType: 'people' // or 'account'
});
```

**After:**
```typescript
// Check if already in list
const { data: existing } = await supabase
  .from('list_members')
  .select('id')
  .eq('listId', selectedListId)
  .eq('targetId', result.id)
  .maybeSingle();

if (!existing) {
  const { error: listError } = await supabase.from('list_members').insert({
    id: crypto.randomUUID(),
    listId: selectedListId,
    targetId: result.id,
    targetType: 'people' // or 'account'
  });
  
  if (listError) {
    console.error('Error adding to list:', listError);
    listAddErrors++;
  } else {
    listAddCount++;
  }
} else {
  // Already in list, count as skipped duplicate
  listAddErrors++;
}
```

### 3. Added List Assignment Tracking

New counters:
- `listAddCount`: Tracks successful list assignments
- `listAddErrors`: Tracks duplicate/failed list assignments
- `selectedListName`: Retrieves the actual list name for toast display

### 4. Cache Invalidation

After import completes:
```typescript
queryClient.invalidateQueries({ queryKey: ['targets'] });
queryClient.invalidateQueries({ queryKey: ['contacts'] });
queryClient.invalidateQueries({ queryKey: ['accounts'] });
```

This forces React Query to refetch all relevant data, updating:
- List member counts on the targets overview page
- Contact/Account lists if they're open
- Any other dependent queries

### 5. Enhanced Toast Notifications

**Primary Success Toast:**
```typescript
toast.success(`Import complete: ${successCount} ${importVector === 'CONTACTS' ? 'contacts' : 'accounts'} processed${errorCount > 0 ? `, ${errorCount} failed` : ''}.`);
```

**List Assignment Toast:**
```typescript
if (selectedListId && listAddCount > 0) {
  toast.success(`${listAddCount} ${importVector === 'CONTACTS' ? 'contacts' : 'accounts'} added to list: "${selectedListName}"${listAddErrors > 0 ? ` (${listAddErrors} duplicates skipped)` : ''}`);
}
```

## Technical Details

### Why Check Before Insert?

The `list_members` table does not have a unique constraint on `(listId, targetId)`, so we cannot use `.upsert()` with `onConflict`. Instead, we:

1. **Query for existing membership**: Check if the record already exists in the list
2. **Conditional insert**: Only insert if the record is not already present
3. **Track duplicates**: Count skipped records as duplicates for user feedback

This approach is **idempotent** - you can run the same import multiple times without creating duplicate list memberships.

## Expected Behavior

1. **During Import**: Records are processed and added to both the CRM database AND the selected list
2. **On Completion**: 
   - First toast shows overall import results
   - Second toast (if list selected) shows list assignment results
3. **Page Refresh**: Target list counts update immediately without manual page refresh
4. **Duplicate Handling**: If a record is already in the list, it's counted as a duplicate and skipped (not an error)

## Testing Checklist

- [x] Import CSV with list selected
- [x] Verify records appear in CRM database
- [x] Verify records appear in selected list
- [x] Verify count updates on targets overview page
- [x] Verify both toast notifications appear
- [x] Test duplicate imports (re-import same CSV to same list)
- [x] Verify duplicate handling works correctly

## Files Modified

- `crm-platform/src/components/modals/BulkImportModal.tsx`

## Migration Integrity

✅ No database schema changes required
✅ No breaking changes to existing functionality
✅ Backward compatible with existing data
