I will add the missing "Recent Calls" skeleton to the initial page loading state in `scripts/pages/task-detail.js`.

1.  **Modify `scripts/pages/task-detail.js`**:
    *   Locate the `markTaskLoading` function (around line 78).
    *   Inside the `els.content.innerHTML` template string, find the `.sidebar-content` section.
    *   Insert a new `.contact-info-section.td-loading-card` block for "Recent Calls" between the "Energy & Contract" section and the "Recent Activity" section.
    *   The new block will contain 4 skeleton items matching the structure used in `pc-skeletons.js` (with the correct layout: title/subline, outcome pill, and eye button placeholder) to ensure visual consistency with the final loaded state.

This will ensure the "Recent Calls" section appears immediately with a loading animation when the user navigates to a task, resolving the issue where it was missing during the initial load.