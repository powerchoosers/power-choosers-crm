I will reorganize the global search layout to make the Prospect buttons persistent at the top and adjust their styling as requested.

### HTML Structure Changes
1.  **Move Prospect Buttons**: Relocate the `.prospect-actions` container in `crm-dashboard.html` from the `.search-empty` div to the very top of `.search-results-container`.
    *   This ensures they are always visible, regardless of search results.
    *   The structure will be:
        ```html
        <div class="search-results-container">
            <!-- Persistent Buttons -->
            <div class="prospect-actions">...</div>
            <!-- Loading Skeleton -->
            <div class="search-skeleton" ...>...</div>
            <!-- Results List -->
            <div class="search-results" ...>...</div>
            <!-- Empty State (Hidden/Unused) -->
            <div class="search-empty" ...></div>
        </div>
        ```

### CSS Styling Updates
1.  **Fix Button Hover Color**: In `main.css`, update `.prospect-btn:hover` to use `white` text and border color instead of `var(--orange-subtle)`.
2.  **Layout Adjustments**:
    *   Add `padding-bottom` to `.prospect-actions` to separate it from the results/skeleton.
    *   Ensure `.search-results-container` behaves correctly when `.search-results` is empty (it should shrink to fit just the buttons).

### Logic Updates
1.  **Refine Empty State Logic**: Update `global-search.js` to ensure that when no results are found:
    *   The `search-results` div is cleared.
    *   The `search-empty` div is NOT shown (since the buttons are now the "empty state" content and are always visible).
    *   The container will naturally shrink to fit just the buttons.
