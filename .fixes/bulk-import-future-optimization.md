# Bulk Import - Future Optimization

## Current Implementation (Safe Mode)

The current implementation uses a **check-before-insert** pattern:

```typescript
// Check if already in list
const { data: existing } = await supabase
  .from('list_members')
  .select('id')
  .eq('listId', selectedListId)
  .eq('targetId', result.id)
  .maybeSingle();

if (!existing) {
  await supabase.from('list_members').insert({...});
}
```

**Performance**: 2 queries per record (1 SELECT + 1 INSERT if not exists)

## Future Optimization (After Migration)

Once the migration `20250203_add_list_members_unique_constraint.sql` is applied, we can use a more efficient **upsert** pattern:

```typescript
const { error: listError } = await supabase.from('list_members').upsert({
  id: crypto.randomUUID(), // Only used on insert
  listId: selectedListId,
  targetId: result.id,
  targetType: 'people' // or 'account'
}, {
  onConflict: 'listId,targetId',
  ignoreDuplicates: true
});
```

**Performance**: 1 query per record (upsert with conflict resolution)

## Migration Steps

1. **Backup Data**: Export current `list_members` table
2. **Clean Duplicates**: Run cleanup query to remove any existing duplicates
   ```sql
   DELETE FROM list_members a
   USING list_members b
   WHERE a.id < b.id 
   AND a."listId" = b."listId" 
   AND a."targetId" = b."targetId";
   ```
3. **Apply Migration**: Run `20250203_add_list_members_unique_constraint.sql`
4. **Update Code**: Replace check-before-insert with upsert in `BulkImportModal.tsx`
5. **Test**: Verify bulk imports work correctly with the new constraint

## Benefits of Migration

- **50% faster** list assignments (1 query vs 2)
- **Database-level integrity** preventing duplicates
- **Simpler code** - no need for pre-flight checks
- **Better error handling** - constraint violations are explicit

## Risks

- **Migration failure** if duplicate entries exist in production
- **Requires downtime** or careful zero-downtime migration strategy

## Recommendation

Apply this migration during a maintenance window or when the system has low usage. The current implementation is safe and correct, just not optimally performant.
