I will fix the Recent Calls issues in Task and Contact details by:

1.  **Fixing Skeleton Spacing**: Updating `scripts/ui/pc-skeletons.js` and `scripts/pages/task-detail.js` (fallback) to add `margin-bottom: 8px` to the `.rc-item` elements in the loading state, preventing them from touching.
2.  **Ensuring Skeleton Visibility**: Modifying `scripts/pages/task-detail.js` to call `taskRcSetLoading` immediately during the content render phase (`renderCallTaskContent`, etc.) so the skeleton appears before the data fetch begins.
3.  **Standardizing Pagination**:
    *   Refactoring `scripts/pages/task-detail.js` and `scripts/pages/contact-detail.js` to move the pagination container into the section header.
    *   Updating the pagination HTML generation in both files to match the `unified-pagination` structure used in `accounts.js` (using `.unified-pagination`, `.pagination-arrow`, `.pagination-current-container` classes).

This will resolve the visibility, layout, and styling consistency issues reported.