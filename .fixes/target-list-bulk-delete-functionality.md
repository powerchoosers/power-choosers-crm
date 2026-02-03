# Target List Bulk Delete Functionality

## Issue
The targets detail page (`/network/targets/[id]`) had checkboxes for selecting rows, but clicking them did nothing. Unlike the People and Accounts pages, there was no bulk action functionality to delete selected records from the CRM.

## Solution
Added the complete bulk delete workflow to the targets detail page, matching the functionality on People and Accounts pages.

## Changes Made

### 1. Imports Added
```typescript
import { useDeleteContacts, useDeleteAccounts } from '@/hooks/useContacts' and '@/hooks/useAccounts'
import BulkActionDeck from '@/components/network/BulkActionDeck'
import DestructModal from '@/components/network/DestructModal'
```

### 2. State Management
Added state for row selection and modal control:
```typescript
const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
const [isDestructModalOpen, setIsDestructModalOpen] = useState(false)
```

### 3. Delete Mutation Hooks
```typescript
const { mutateAsync: deleteContacts } = useDeleteContacts()
const { mutateAsync: deleteAccounts } = useDeleteAccounts()
```

### 4. Bulk Action Handlers

**Select Count Handler:**
```typescript
const handleSelectCount = async (count: number) => {
  const newSelection: RowSelectionState = {}
  for (let i = 0; i < count; i++) {
    newSelection[i] = true
  }
  setRowSelection(newSelection)
}
```

**Bulk Action Handler:**
```typescript
const handleBulkAction = async (action: string) => {
  if (action === 'delete') {
    setIsDestructModalOpen(true)
  } else {
    console.log(`Executing ${action} for ${selectedCount} nodes`)
    // Other actions can be implemented here
  }
}
```

**Purge Confirmation Handler:**
```typescript
const handleConfirmPurge = async () => {
  const selectedIndices = Object.keys(rowSelection).map(Number)
  const selectedIds = selectedIndices.map(index => data[index]?.id).filter(Boolean)
  
  if (selectedIds.length > 0) {
    if (isPeopleList) {
      await deleteContacts(selectedIds)
    } else {
      await deleteAccounts(selectedIds)
    }
    setRowSelection({})
    setIsDestructModalOpen(false)
  }
}
```

### 5. Table Configuration Update
Added row selection state to the table:
```typescript
const table = useReactTable({
  // ... other config
  state: {
    pagination: { pageIndex, pageSize },
    rowSelection, // Added
  },
  onRowSelectionChange: setRowSelection, // Added
  // ... other config
})
```

### 6. UI Components Added
At the bottom of the page, added:
```typescript
<BulkActionDeck 
  selectedCount={selectedCount}
  totalAvailable={totalRecords}
  onClear={() => setRowSelection({})}
  onAction={handleBulkAction}
  onSelectCount={handleSelectCount}
/>

<DestructModal 
  isOpen={isDestructModalOpen}
  onClose={() => setIsDestructModalOpen(false)}
  onConfirm={handleConfirmPurge}
  count={selectedCount}
/>
```

## User Experience Flow

1. **Selection**: Click checkboxes next to contacts or accounts in the target list
2. **Bulk Action Deck Appears**: A modal slides up from the bottom showing:
   - Number of selected nodes
   - Action buttons: ADD_TO_TARGET, INITIATE_PROTOCOL, ENRICH_DATA
   - Delete button with "PURGE_PROTOCOL" label
3. **Click Delete**: Opens the DestructModal with a forensic UI
4. **Confirm Deletion**: Hold down the "Execute" button for 1.5 seconds
5. **Purge Complete**: Records are deleted from the CRM and the selection is cleared

## Features

### BulkActionDeck
- **Editable Counter**: Click the number to manually type how many records to select
- **Clear Selection**: X button to deselect all
- **Multiple Actions**: Add to list, initiate protocol, enrich data, and delete
- **Forensic Aesthetic**: Matches the Nodal Point design system

### DestructModal
- **Two-Step Safety**: Must hold button for 1.5 seconds to confirm
- **Visual Feedback**: Progress bar fills as you hold
- **Clear Warning**: Shows count and warns action is irreversible
- **Abort Option**: Can release or click "Abort_Mission" to cancel

## Dynamic Behavior

The functionality adapts based on the list type:
- **People Lists**: Deletes contacts using `useDeleteContacts`
- **Account Lists**: Deletes accounts using `useDeleteAccounts`

## Files Modified

- `crm-platform/src/app/network/targets/[id]/page.tsx`

## Testing Checklist

- [x] Click checkbox next to a contact/account in target list
- [x] Verify BulkActionDeck appears at bottom
- [x] Click "Select Count" and type a number to select multiple
- [x] Click delete button (trash icon)
- [x] Verify DestructModal opens with PURGE_PROTOCOL warning
- [x] Hold "Execute" button for 1.5 seconds
- [x] Verify records are deleted from CRM
- [x] Verify selection clears after deletion
- [x] Test with both People and Account target lists

## Migration Integrity

✅ No database schema changes
✅ No breaking changes
✅ Follows existing patterns from People/Accounts pages
✅ Maintains forensic aesthetic and UX consistency
