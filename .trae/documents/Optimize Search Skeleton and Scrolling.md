I will optimize the global search skeleton and container to address the scrolling, height mismatch, and animation issues.

### 1. CSS Adjustments (`styles/main.css`)

* **Fix Scrolling**:

  * Change `.search-results-container.expanded` `max-height` from `800px` to `80vh`. This ensures the container fits within the viewport on most screens and enables proper scrolling for long lists.

  * Add `padding-bottom: 20px` to ensure the last item isn't cut off at the bottom edge.

* **Fix Height Mismatch**:

  * Explicitly set `height` on `.skeleton-header` (38px) and `.skeleton-item` (54px) to exactly match the rendered height of the real search results (calculated from padding + content + borders).

  * Adjust padding on skeleton elements to `0 12px` combined with flex centering to ensure consistent vertical alignment.

* **Fix Animation Cutoff**:

  * Add a `min-height: 220px` (approx height of one section) to `.search-results-container.expanded`. This ensures that when the dropdown opens, it immediately reserves enough space for at least one full section (Header + 3 items), preventing the "cut off" feeling during the animation.

### 2. File Updates

* **`styles/main.css`**: Apply the CSS changes described above.

* **`crm-dashboard.html`**: No changes needed (existing skeleton structure is sufficient).

* **`scripts/global-search.js`**: No logic changes needed (CSS handles the presentation).

