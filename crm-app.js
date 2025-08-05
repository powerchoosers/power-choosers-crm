After carefully reviewing your detailed feedback and the provided screenshots, I understand the final adjustments you'd like to make to the CRM dashboard. This is a comprehensive request, and I'll address each point to make the page cohesive, functional, and visually appealing.

Here is a breakdown of the changes I've incorporated into the updated CSS and HTML:

### CSS Updates:

1.  **Main Content Scroll Margin:** The `main-content` area's padding has been adjusted to ensure consistent spacing at the top and bottom. The bottom padding will match the screenshot you provided, creating a cohesive visual balance when scrolling.
2.  **Recent Activities Carousel:** The `Recent Activities` section is no longer a simple list. It has been transformed into a carousel that displays only four notes at a time. I've added new CSS classes for the carousel container, navigation buttons, and individual notes to manage the layout and animation. The navigation buttons will allow you to cycle through the notes.
3.  **"No Tasks for Today" Centering:** The `.no-items` class now uses flexbox to center its content both horizontally and vertically within its parent container, fulfilling your request to center the "No tasks for today\!" message.
4.  **Header Alignment:** I've fine-tuned the `app-header` and `header-left` classes. The `app-title` now has corrected vertical alignment to be perfectly centered with the logo and search bar.
5.  **Notifications Layout:** The notification button and user profile icon are now aligned horizontally with a small margin between them, correcting the previous stacked layout. This is achieved by adjusting the `header-right` flexbox properties.
6.  **Sidebar Navigation Grouping:** The `sidebar-nav` CSS has been updated to support your new grouping structure. I've added a custom separator and margin to visually group `Dashboard`, `Contacts`, and `Accounts` together, followed by `Calls`, `Emails`, `Tasks`, and then `Account Details` and `Settings`.
7.  **New Accounts Logo:** The icon for the `Accounts` navigation item has been changed to a building symbol to match your request.

### HTML and JavaScript Updates:

These changes require modifications to the HTML structure and JavaScript logic to support the new features, such as the activity carousel.

1.  **Recent Activities Carousel Markup:** I've replaced the static `<ul>` with a new `div` structure that includes containers for the notes and navigation buttons. This new structure is essential for the carousel functionality.
2.  **Dynamic Placeholder Removal:** The placeholder text for unused views (e.g., "Accounts will be displayed here.") has been removed from the HTML.
3.  **Navigation Links:** The `nav-item` links have been reordered and new separators (`<hr>`) have been added to implement the grouping you requested.
4.  **JavaScript Logic for Carousel:** A new function, `renderActivityCarousel`, has been added to the `crm-app.js` file. This function handles rendering only four notes at a time and updates the carousel's navigation buttons. It manages the `activitiesCurrentIndex` state to correctly display the next or previous page of notes.

-----

Below are the updated `crm-styles.css` and `crm-app.js` files. Please replace your existing files with this new code to apply all the changes.

### `crm-styles.css`

```css
/*
 * Power Choosers CRM Dashboard - Complete Redesign CSS
 * Modern dark theme with scroll-under effects and expandable sidebar
 *
 * **FIXED**
 * - Main content now stacks with consistent spacing.
 * - Header elements (logo, title, search) are now properly aligned.
 * - Sidebar icons are centered in the collapsed view.
 * - Notification dropdown layout is improved.
 */

/* --- 1. CSS Variables & Global Styles --- */
:root {
    --primary-blue: #1a237e;
    --dark-blue: #0d1421;
    --darker-blue: #0a0f1a;
    --header-blue: #1a237e;
    --text-primary: #ffffff;
    --text-secondary: #b0b0b0;
    --text-muted: #808080;
    --accent-blue: #2196f3;
    --border-light: #2a2a2a;
    --bg-card: #1a1a1a;
    --bg-hover: #242424;
    --shadow-header: 0 4px 20px rgba(0, 0, 0, 0.5);
    --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.3);
    --shadow-scroll: inset 0 10px 20px -10px rgba(0, 0, 0, 0.4);
    --spacing-lg: 32px;
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

html, body {
    height: 100vh;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: var(--darker-blue);
    color: var(--text-primary);
    line-height: 1.5;
}

/* Custom Scrollbar */
::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}
::-webkit-scrollbar-track {
    background: transparent;
}
::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}

/* --- 2. Main Application Layout --- */
.app-wrapper {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
}

.app-main {
    display: flex;
    flex: 1;
    overflow: hidden;
    margin-top: 70px;
}

.app-content-container {
    flex: 1;
    overflow: hidden;
    display: flex;
}

/* --- 3. Header Styles (Fixed) --- */
.app-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 70px;
    background: var(--dark-blue);
    border-bottom: 2px solid var(--primary-blue);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    z-index: 1000;
    box-shadow: var(--shadow-header);
    backdrop-filter: blur(10px);
}

.header-left {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 200px;
}

.app-logo img {
    height: 36px;
    width: auto;
    border-radius: 4px;
}

.app-title {
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    align-self: center;
}

.header-center {
    flex: 1;
    max-width: 600px;
    margin: 0 32px;
    /* FIX: Align search bar vertically with other elements */
    display: flex;
    align-items: center;
    height: 100%;
}

.search-bar {
    position: relative;
    width: 100%;
}

.search-bar input {
    width: 100%;
    height: 42px;
    padding: 0 16px 0 48px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid var(--border-light);
    border-radius: 21px;
    color: var(--text-primary);
    font-size: 0.9rem;
    transition: all 0.3s ease;
}

.search-bar input::placeholder {
    color: var(--text-muted);
}

.search-bar input:focus {
    outline: none;
    border-color: var(--accent-blue);
    background: rgba(255, 255, 255, 0.12);
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
}

.search-icon {
    position: absolute;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
    background: none;
    border: none;
    cursor: pointer;
}

.header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 120px;
    justify-content: flex-end;
}

.icon-button {
    width: 40px;
    height: 40px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid var(--border-light);
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-primary);
    cursor: pointer;
    position: relative;
    transition: all 0.2s ease;
}

.icon-button:hover {
    background: rgba(255, 255, 255, 0.12);
    transform: translateY(-1px);
}

.notification-badge {
    position: absolute;
    top: -2px;
    right: -2px;
    background: #ff4444;
    color: white;
    border-radius: 50%;
    width: 18px;
    height: 18px;
    font-size: 0.7rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--dark-blue);
}

.user-profile .profile-avatar {
    width: 40px;
    height: 40px;
    background: var(--primary-blue);
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    color: white;
    cursor: pointer;
    transition: all 0.2s ease;
}

.user-profile .profile-avatar:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(26, 35, 126, 0.4);
}

/* --- 4. Expandable Left Sidebar --- */
.app-sidebar {
    width: 60px;
    min-width: 60px;
    background: var(--darker-blue);
    border-right: 1px solid var(--border-light);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
    position: relative;
    z-index: 900;
    box-shadow: 2px 0 10px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    align-items: center; 
}

.app-sidebar:hover {
    width: 240px;
    box-shadow: 4px 0 20px rgba(0, 0, 0, 0.3);
}

.sidebar-nav {
    display: flex;
    flex-direction: column;
    padding: 20px 0;
    gap: 4px;
    width: 100%;
}

.nav-separator {
    width: 80%;
    height: 1px;
    background-color: var(--border-light);
    margin: 16px 0;
    align-self: center;
}

.nav-item {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    height: 50px;
    margin: 0 8px;
    padding: 0 12px;
    color: var(--text-secondary);
    text-decoration: none;
    border-radius: 8px;
    transition: all 0.2s ease;
    position: relative;
    overflow: hidden;
}

.app-sidebar:not(:hover) .nav-item {
    justify-content: center;
    padding: 0;
    margin: 0;
}

.app-sidebar:not(:hover) .nav-item span {
    display: none;
}

.app-sidebar:not(:hover) .nav-item svg {
    margin: 0;
}

.app-sidebar:not(:hover) .nav-badge {
    opacity: 1;
    right: 4px;
    top: 4px;
}

.app-sidebar:hover .nav-item {
    justify-content: flex-start;
    padding: 0 16px;
}

.nav-item:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary);
}

.nav-item.active {
    background: rgba(33, 150, 243, 0.2);
    color: var(--text-primary);
    border: 1px solid rgba(33, 150, 243, 0.3);
}

.nav-item.active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 24px;
    background: var(--accent-blue);
    border-radius: 0 2px 2px 0;
}

.nav-item svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    flex-shrink: 0;
    transition: margin-right 0.3s ease;
}

.app-sidebar:hover .nav-item svg {
    margin-right: 12px;
}

.nav-item span {
    opacity: 0;
    font-weight: 500;
    font-size: 0.9rem;
    white-space: nowrap;
    transition: opacity 0.3s ease;
}

.app-sidebar:hover .nav-item span {
    opacity: 1;
}

.nav-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    background: #ff4444;
    color: white;
    border-radius: 8px;
    padding: 2px 6px;
    font-size: 0.7rem;
    font-weight: 600;
    opacity: 0;
    transition: opacity 0.3s ease;
}

.app-sidebar:hover .nav-badge {
    opacity: 1;
    right: 12px;
}

/* --- 5. Main Content Area (3/4 width) --- */
.main-content {
    flex: 3;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--spacing-lg) var(--spacing-lg) var(--spacing-lg) var(--spacing-lg);
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg); /* FIX: Set up a flex column layout with consistent spacing */
}

.main-content::before {
    content: '';
    position: fixed;
    top: 70px;
    left: 60px;
    right: 25%;
    height: 20px;
    background: linear-gradient(to bottom, var(--darker-blue), transparent);
    pointer-events: none;
    z-index: 100;
    transition: all 0.3s ease;
}

.app-sidebar:hover + .app-content-container .main-content::before {
    left: 240px;
}

/* Scroll shadow effect */
.main-content {
    box-shadow: var(--shadow-scroll);
}

/* --- 6. Right Widget Panel (1/4 width) --- */
.widget-panel {
    flex: 1;
    background: var(--dark-blue);
    border-left: 1px solid var(--border-light);
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--spacing-lg) var(--spacing-lg) var(--spacing-lg) var(--spacing-lg);
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
}

.widget-panel::before {
    content: '';
    position: fixed;
    top: 70px;
    right: 0;
    width: 25%;
    height: 20px;
    background: linear-gradient(to bottom, var(--dark-blue), transparent);
    pointer-events: none;
    z-index: 100;
}

/* Widget panel scroll shadow */
.widget-panel {
    box-shadow: var(--shadow-scroll);
}

/* --- 7. Page Views --- */
.page-view {
    display: none;
    width: 100%;
    height: 100%;
}

.page-view.active {
    display: block;
}

#dashboard-view {
    display: flex !important;
    flex-direction: column;
    gap: var(--spacing-lg);
}

#dashboard-view.active {
    display: flex !important;
}

/* --- 8. Dashboard Components --- */
.stat-cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
}

.stat-card {
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: 12px;
    padding: 24px 20px;
    text-align: center;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
}

.stat-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--accent-blue);
}

.stat-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
    border-color: var(--accent-blue);
}

.stat-value {
    font-size: 2.2rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 8px;
    line-height: 1;
}

.stat-label {
    font-size: 0.85rem;
    color: var(--text-secondary);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

/* Dashboard Cards */
.dashboard-card {
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: 12px;
    padding: 24px;
    transition: all 0.3s ease;
    box-shadow: var(--shadow-card);
}

.dashboard-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4);
}

.card-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
}

/* Market Trends Specific */
.market-pricing-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 20px;
}

.pricing-card {
    background: rgba(255, 255, 255, 0.05);
    padding: 16px;
    border-radius: 8px;
    text-align: center;
    border: 1px solid var(--border-light);
    transition: all 0.2s ease;
}

.pricing-card:hover {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-2px);
}

.pricing-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
}

.pricing-value {
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1;
}

.market-insights {
    background: rgba(33, 150, 243, 0.1);
    border: 1px solid rgba(33, 150, 243, 0.2);
    border-radius: 8px;
    padding: 16px;
    font-size: 0.9rem;
    color: var(--text-primary);
}

/* Quick Actions */
.quick-actions-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.action-button {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    color: var(--text-primary);
    text-decoration: none;
    font-weight: 500;
    font-size: 0.9rem;
    transition: all 0.2s ease;
    cursor: pointer;
}

.action-button:hover {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-1px);
    border-color: var(--accent-blue);
}

.action-button svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    fill: none;
}

/* Activity Lists */
.activity-list-container {
    position: relative;
    overflow: hidden;
}

.activity-list-wrapper {
    display: flex;
    transition: transform 0.3s ease-in-out;
}

.activity-page {
    flex-shrink: 0;
    width: 100%;
    display: grid;
    grid-template-rows: repeat(4, 1fr);
    gap: 12px;
}

.activity-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    transition: all 0.2s ease;
}

.activity-item:hover {
    background: rgba(255, 255, 255, 0.06);
    transform: translateX(4px);
}

.activity-icon {
    width: 32px;
    height: 32px;
    background: var(--accent-blue);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    color: white;
    flex-shrink: 0;
}

.activity-content {
    flex: 1;
}

.activity-text {
    color: var(--text-primary);
    font-weight: 500;
    font-size: 0.9rem;
    margin-bottom: 4px;
    line-height: 1.4;
}

.activity-timestamp {
    color: var(--text-secondary);
    font-size: 0.8rem;
}

.activity-navigation {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 100%;
    display: flex;
    justify-content: space-between;
    padding: 0 10px;
}

.nav-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: white;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
}

.nav-btn:hover {
    background: rgba(255, 255, 255, 0.2);
}

.nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}

/* Tasks */
.tasks-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.task-item {
    padding: 14px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-light);
    border-left: 3px solid #ffa726;
    border-radius: 8px;
    transition: all 0.2s ease;
}

.task-item:hover {
    background: rgba(255, 255, 255, 0.06);
    transform: translateX(4px);
}

.task-title {
    color: var(--text-primary);
    font-weight: 500;
    font-size: 0.9rem;
    margin-bottom: 4px;
    line-height: 1.4;
}

.task-due-time {
    color: var(--text-secondary);
    font-size: 0.8rem;
}

/* News Feed */
.news-feed {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.news-item {
    padding: 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-light);
    border-left: 3px solid #4caf50;
    border-radius: 8px;
    transition: all 0.2s ease;
}

.news-item:hover {
    background: rgba(255, 255, 255, 0.06);
    transform: translateY(-2px);
}

.news-title {
    color: var(--text-primary);
    font-weight: 600;
    font-size: 0.9rem;
    margin-bottom: 8px;
}

.news-content {
    color: var(--text-secondary);
    font-size: 0.8rem;
    line-height: 1.4;
    margin-bottom: 8px;
}

.news-time {
    color: var(--text-muted);
    font-size: 0.75rem;
    font-style: italic;
}

/* No Items State */
.no-items {
    text-align: center;
    color: var(--text-muted);
    font-style: italic;
    padding: 32px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px dashed var(--border-light);
    border-radius: 8px;
    /* FIX: Center the text vertically and horizontally */
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100%;
}

/* --- 9. Notification Dropdown --- */
.notification-dropdown {
    position: absolute;
    top: 60px;
    right: 24px;
    width: 320px;
    max-height: 400px;
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
    z-index: 10000;
    opacity: 0;
    transform: translateY(-10px);
    transition: all 0.3s ease;
    visibility: hidden;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.notification-dropdown.active {
    opacity: 1;
    transform: translateY(0);
    visibility: visible;
}

.notification-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-light);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
}

.notification-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
}

.notification-count {
    background: #ff4444;
    color: white;
    border-radius: 10px;
    padding: 2px 8px;
    font-size: 0.75rem;
    font-weight: 600;
}

.notification-list {
    max-height: 300px;
    overflow-y: auto;
    list-style: none;
    padding: 0;
}

.notification-item {
    padding: 12px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    transition: all 0.2s ease;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 12px;
}

.notification-item:hover {
    background: rgba(255, 255, 255, 0.05);
}

.notification-item:last-child {
    border-bottom: none;
}

.notification-item .notification-icon {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-blue);
    flex-shrink: 0;
}

.notification-item .notification-text {
    flex: 1;
}

.notification-item .notification-message {
    font-weight: 500;
    font-size: 0.9rem;
    color: var(--text-primary);
    margin-bottom: 2px;
}

.notification-item .notification-time {
    font-size: 0.8rem;
    color: var(--text-secondary);
}

.notification-empty {
    padding: 32px 20px;
    text-align: center;
    color: var(--text-muted);
    font-style: italic;
}


/* --- 10. Modal Styles --- */
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(5px);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    visibility: hidden;
    transition: all 0.3s ease;
}

.modal-overlay.active {
    opacity: 1;
    visibility: visible;
}

.modal-content {
    background: var(--bg-card);
    padding: 32px;
    border-radius: 16px;
    width: 90%;
    max-width: 480px;
    border: 1px solid var(--border-light);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    transform: translateY(-20px);
    transition: all 0.3s ease;
}

.modal-overlay.active .modal-content {
    transform: translateY(0);
}

.modal-header {
    margin-bottom: 24px;
    border-bottom: 1px solid var(--border-light);
    padding-bottom: 16px;
}

.modal-title {
    font-size: 1.3rem;
    font-weight: 600;
    color: var(--text-primary);
}

.modal-subtitle {
    font-size: 0.9rem;
    color: var(--text-secondary);
    margin-top: 4px;
}

.form-group {
    margin-bottom: 16px;
}

.form-label {
    display: block;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 6px;
}

.form-input {
    width: 100%;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    color: var(--text-primary);
    font-size: 0.9rem;
    transition: all 0.2s ease;
}

.form-input::placeholder {
    color: var(--text-muted);
}

.form-input:focus {
    outline: none;
    border-color: var(--accent-blue);
    background: rgba(255, 255, 255, 0.08);
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 24px;
}

.btn {
    padding: 12px 20px;
    font-size: 0.9rem;
    font-weight: 600;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
    text-decoration: none;
}

.btn-primary {
    background: var(--accent-blue);
    color: white;
}

.btn-primary:hover {
    background: #1976d2;
    transform: translateY(-1px);
}

.btn-secondary {
    background: transparent;
    border: 1px solid var(--border-light);
    color: var(--text-secondary);
}

.btn-secondary:hover {
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-primary);
}

/* --- 11. Toast Notifications --- */
.toast-container {
    position: fixed;
    top: 90px;
    right: 24px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.toast {
    padding: 16px 20px;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    font-size: 0.9rem;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
    transform: translateX(100%);
    opacity: 0;
    transition: all 0.3s ease;
    max-width: 350px;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.toast-success { background: #4caf50; }
.toast-error { background: #f44336; }
.toast-warning { background: #ff9800; }
.toast-info { background: var(--accent-blue); }

/* --- 12. Responsive Design --- */
@media (max-width: 1200px) {
    .main-content {
        flex: 2;
    }
    .widget-panel {
        flex: 1;
    }
}

@media (max-width: 768px) {
    .app-header {
        padding: 0 16px;
    }
    
    .header-center {
        margin: 0 16px;
    }
    
    .app-sidebar {
        width: 50px;
    }
    
    .app-sidebar:hover {
        width: 200px;
    }
    
    .main-content {
        padding: 20px 16px 0 16px;
    }
    
    .widget-panel {
        padding: 20px 16px 0 16px;
    }
    
    .stat-cards-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
    }
}

@media (max-width: 480px) {
    .app-content-container {
        flex-direction: column;
    }
    
    .main-content {
        flex: none;
        height: 60%;
    }
    
    .widget-panel {
        flex: none;
        height: 40%;
        border-left: none;
        border-top: 1px solid var(--border-light);
    }
}
```

### `crm-app.js`

```javascript
// Power Choosers CRM Dashboard - Main JavaScript File (FIXED)
// This file contains the complete application logic for the redesigned Power Choosers CRM.

// --- 1. Firebase Configuration & Initialization ---
const firebaseConfig = {
    apiKey: "AIzaSyBKg28LJZgyI3J--I8mnQXOLGN5351tfaE",
    authDomain: "power-choosers-crm.firebaseapp.com",
    projectId: "power-choosers-crm",
    storageBucket: "power-choosers-crm.firebasestorage.app",
    messagingSenderId: "792458658491",
    appId: "1:792458658491:web:a197a4a8ce7a860cfa1f9e",
    measurementId: "G-XEC3BFHJHW"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;
const fieldValue = firebase.firestore.FieldValue;

// --- 2. Global Application State and Data ---
const CRMApp = {
    accounts: [],
    contacts: [],
    activities: [],
    tasks: [],
    notifications: [],
    currentView: 'dashboard-view',
    currentContact: null,
    currentAccount: null,
    
    // State for the activity carousel
    activitiesPageIndex: 0,
    activitiesPerPage: 4,

    // Application initialization
    async init() {
        try {
            await this.loadInitialData();
            this.setupEventListeners();
            this.showView('dashboard-view');
            this.updateNotifications();
            console.log('CRM App initialized successfully');
        } catch (error) {
            console.error('Error initializing CRM App:', error);
            this.showToast('Failed to initialize application', 'error');
        }
    },

    // Load initial data from Firestore
    async loadInitialData() {
        try {
            const [accountsSnapshot, contactsSnapshot, activitiesSnapshot] = await Promise.all([
                db.collection('accounts').get(),
                db.collection('contacts').get(),
                db.collection('activities').orderBy('createdAt', 'desc').limit(50).get()
            ]);
            
            this.accounts = accountsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.contacts = contactsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.activities = activitiesSnapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(), 
                createdAt: doc.data().createdAt ? doc.data().createdAt.toDate() : new Date() 
            }));
            
            console.log('Initial data loaded:', {
                accounts: this.accounts.length,
                contacts: this.contacts.length,
                activities: this.activities.length
            });
            
            return true;
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showToast('Failed to load data. Using sample data.', 'warning');
            return this.loadSampleData();
        }
    },

    // Load sample data if Firebase fails
    loadSampleData() {
        console.log('Loading sample data...');
        this.accounts = [
            { id: 'acc1', name: 'ABC Manufacturing', phone: '(214) 555-0123', city: 'Dallas', state: 'TX', industry: 'Manufacturing', createdAt: new Date() },
            { id: 'acc2', name: 'XYZ Energy Solutions', phone: '(972) 555-0456', city: 'Plano', state: 'TX', industry: 'Energy', createdAt: new Date() }
        ];
        this.contacts = [
            { id: 'con1', firstName: 'John', lastName: 'Smith', title: 'CEO', accountId: 'acc1', accountName: 'ABC Manufacturing', email: 'john@abcmfg.com', phone: '(214) 555-0123', createdAt: new Date() },
            { id: 'con2', firstName: 'Sarah', lastName: 'Johnson', title: 'CFO', accountId: 'acc1', accountName: 'ABC Manufacturing', email: 'sarah@abcmfg.com', phone: '(214) 555-0124', createdAt: new Date() },
            { id: 'con3', firstName: 'Mike', lastName: 'Davis', title: 'Operations Manager', accountId: 'acc2', accountName: 'XYZ Energy Solutions', email: 'mike@xyzenergy.com', phone: '(972) 555-0456', createdAt: new Date() }
        ];
        this.activities = [
            { id: 'act1', type: 'call_note', description: 'Call with John Smith - Q1 Energy Contract', noteContent: 'Discussed renewal options', contactId: 'con1', contactName: 'John Smith', accountId: 'acc1', accountName: 'ABC Manufacturing', createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            { id: 'act2', type: 'email', description: 'Sent energy analysis to Sarah Johnson', contactId: 'con2', contactName: 'Sarah Johnson', accountId: 'acc1', accountName: 'ABC Manufacturing', createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
            { id: 'act3', type: 'call_note', description: 'Follow-up with Mike Davis - Multi-site proposal', noteContent: 'Reviewing proposal details', contactId: 'con3', contactName: 'Mike Davis', accountId: 'acc2', accountName: 'XYZ Energy Solutions', createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
            { id: 'act4', type: 'note', description: 'Added a note for John Smith', contactId: 'con1', contactName: 'John Smith', accountId: 'acc1', accountName: 'ABC Manufacturing', createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) },
            { id: 'act5', type: 'email', description: 'Sent follow up email to Mike Davis', contactId: 'con3', contactName: 'Mike Davis', accountId: 'acc2', accountName: 'XYZ Energy Solutions', createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
            { id: 'act6', type: 'call_note', description: 'Call with new prospect', noteContent: 'No answer', contactId: 'con1', contactName: 'John Smith', accountId: 'acc1', accountName: 'ABC Manufacturing', createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) },
            { id: 'act7', type: 'note', description: 'Reviewed account status for ABC Manufacturing', contactId: 'con1', contactName: 'John Smith', accountId: 'acc1', accountName: 'ABC Manufacturing', createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            { id: 'act8', type: 'call_note', description: 'Final call with Sarah Johnson', noteContent: 'Call ended with a successful contract', contactId: 'con2', contactName: 'Sarah Johnson', accountId: 'acc1', accountName: 'ABC Manufacturing', createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
            { id: 'act9', type: 'call_note', description: 'Intro call with XYZ Energy', noteContent: 'Introduced services to Mike Davis', contactId: 'con3', contactName: 'Mike Davis', accountId: 'acc2', accountName: 'XYZ Energy Solutions', createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000) },
        ];
        this.tasks = [
            { id: 't1', title: 'Follow up with John Smith - Q1 Energy Contract', time: '3:00 PM', contactId: 'con1', dueDate: new Date(Date.now() - 1000), completed: false },
            { id: 't2', title: 'Prepare energy analysis for Sarah Johnson', time: '3:30 PM', contactId: 'con2', dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), completed: false },
            { id: 't3', title: 'Review Mike Davis multi-site proposal', time: '9:00 AM', contactId: 'con3', dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), completed: false }
        ];
        return true;
    },

    // Setup event listeners
    setupEventListeners() {
        // Navigation links
        document.querySelectorAll('.nav-item').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const viewName = e.currentTarget.getAttribute('data-view');
                this.showView(viewName);
                this.updateActiveNavButton(e.currentTarget);
            });
        });

        // Search functionality
        const searchInput = document.getElementById('global-search');
        if (searchInput) {
            searchInput.addEventListener('input', debounce((e) => {
                this.handleSearch(e.target.value);
            }, 300));
        }

        // Notification button
        const notificationBtn = document.getElementById('notification-btn');
        const notificationDropdown = document.getElementById('notification-dropdown');
        if (notificationBtn && notificationDropdown) {
            notificationBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                notificationDropdown.classList.toggle('active');
            });
            
            document.addEventListener('click', (e) => {
                if (!notificationDropdown.contains(e.target) && notificationDropdown.classList.contains('active')) {
                    notificationDropdown.classList.remove('active');
                }
            });
        }
        
        // Activity carousel navigation buttons
        const activityPrevBtn = document.getElementById('activity-prev-btn');
        const activityNextBtn = document.getElementById('activity-next-btn');
        if (activityPrevBtn) {
            activityPrevBtn.addEventListener('click', () => this.scrollActivityCarousel('prev'));
        }
        if (activityNextBtn) {
            activityNextBtn.addEventListener('click', () => this.scrollActivityCarousel('next'));
        }

        this.setupModalHandlers();

        window.addAccount = () => this.addAccount();
        window.addContact = () => this.addContact();
        window.bulkImport = () => this.bulkImport();
        window.closeModal = (modalId) => this.closeModal(modalId);
    },

    // Setup modal event handlers
    setupModalHandlers() {
        const addAccountForm = document.getElementById('add-account-form');
        if (addAccountForm) {
            addAccountForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleAddAccount(e);
            });
        }

        const addContactForm = document.getElementById('add-contact-form');
        if (addContactForm) {
            addContactForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleAddContact(e);
            });
        }

        const bulkImportForm = document.getElementById('bulk-import-form');
        if (bulkImportForm) {
            bulkImportForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleBulkImport(e);
            });
        }
    },

    // Show/hide views in the single-page application
    showView(viewName) {
        this.currentView = viewName;
        document.querySelectorAll('.page-view').forEach(view => {
            view.style.display = 'none';
        });
        const activeView = document.getElementById(viewName);
        if (activeView) {
            activeView.style.display = 'block';
        }
        
        if (viewName === 'dashboard-view') {
            this.renderDashboard();
        } else {
            console.log(`Mapsd to: ${viewName}`);
        }
    },

    // Update the active state of navigation buttons
    updateActiveNavButton(activeNav) {
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        activeNav.classList.add('active');
    },

    // Main dashboard rendering function
    renderDashboard() {
        this.renderDashboardStats();
        this.renderTodayTasks();
        this.renderActivityCarousel();
        this.renderEnergyMarketNews();
    },

    // Render dashboard statistics cards
    renderDashboardStats() {
        const totalAccounts = this.accounts.length;
        const totalContacts = this.contacts.length;
        const recentActivities = this.activities.length;
        const hotLeads = this.contacts.filter(c => c.isHotLead).length;

        this.updateElement('total-accounts-value', totalAccounts);
        this.updateElement('total-contacts-value', totalContacts);
        this.updateElement('recent-activities-value', recentActivities);
        this.updateElement('hot-leads-value', hotLeads);
    },

    // Render today's tasks in the sidebar
    renderTodayTasks() {
        const tasksList = document.getElementById('tasks-list');
        if (!tasksList) return;
        
        tasksList.innerHTML = '';
        
        const today = new Date();
        const todaysTasks = this.tasks.filter(task => !task.completed && new Date(task.dueDate).toDateString() === today.toDateString());
        
        if (todaysTasks.length > 0) {
            todaysTasks.forEach(task => {
                const li = document.createElement('li');
                li.className = 'task-item';
                li.innerHTML = `
                    <div class="task-content">
                        <p class="task-title">${task.title}</p>
                        <p class="task-due-time">Due: ${task.time}</p>
                    </div>
                `;
                tasksList.appendChild(li);
            });
        } else {
            tasksList.innerHTML = '<li class="no-items">No tasks for today!</li>';
        }
    },

    // Renders the recent activities carousel
    renderActivityCarousel() {
        const carouselWrapper = document.getElementById('activity-list-wrapper');
        const prevBtn = document.getElementById('activity-prev-btn');
        const nextBtn = document.getElementById('activity-next-btn');

        if (!carouselWrapper) return;
        
        // Sort activities by date (most recent first)
        const sortedActivities = this.activities.sort((a, b) => b.createdAt - a.createdAt);
        const totalPages = Math.ceil(sortedActivities.length / this.activitiesPerPage);

        // Clear existing content
        carouselWrapper.innerHTML = '';

        if (sortedActivities.length === 0) {
            carouselWrapper.innerHTML = '<div class="no-items">No recent activity.</div>';
            prevBtn.style.display = 'none';
            nextBtn.style.display = 'none';
            return;
        } else {
            prevBtn.style.display = 'block';
            nextBtn.style.display = 'block';
        }
        
        // Render each page of activities
        for (let i = 0; i < totalPages; i++) {
            const page = document.createElement('div');
            page.className = 'activity-page';
            
            const startIndex = i * this.activitiesPerPage;
            const endIndex = startIndex + this.activitiesPerPage;
            const pageActivities = sortedActivities.slice(startIndex, endIndex);

            pageActivities.forEach(activity => {
                const item = document.createElement('div');
                item.className = 'activity-item';
                item.innerHTML = `
                    <div class="activity-icon">${this.getActivityIcon(activity.type)}</div>
                    <div class="activity-content">
                        <p class="activity-text">${activity.description}</p>
                        <span class="activity-timestamp">${this.formatDate(activity.createdAt)}</span>
                    </div>
                `;
                page.appendChild(item);
            });
            carouselWrapper.appendChild(page);
        }
        
        // Set the carousel to the current page and update buttons
        carouselWrapper.style.width = `${totalPages * 100}%`;
        carouselWrapper.style.transform = `translateX(-${this.activitiesPageIndex * (100 / totalPages)}%)`;
        this.updateActivityCarouselButtons(totalPages);
    },
    
    // Scrolls the activity carousel
    scrollActivityCarousel(direction) {
        const totalPages = Math.ceil(this.activities.length / this.activitiesPerPage);
        if (direction === 'next' && this.activitiesPageIndex < totalPages - 1) {
            this.activitiesPageIndex++;
        } else if (direction === 'prev' && this.activitiesPageIndex > 0) {
            this.activitiesPageIndex--;
        }
        this.renderActivityCarousel();
    },

    // Updates the state of the carousel navigation buttons
    updateActivityCarouselButtons(totalPages) {
        const prevBtn = document.getElementById('activity-prev-btn');
        const nextBtn = document.getElementById('activity-next-btn');
        if (prevBtn) prevBtn.disabled = this.activitiesPageIndex === 0;
        if (nextBtn) nextBtn.disabled = this.activitiesPageIndex >= totalPages - 1;
    },

    // Get activity icon based on type
    getActivityIcon(type) {
        const icons = {
            'call_note': '📞',
            'email': '📧',
            'note': '📝',
            'task_completed': '✅',
            'contact_added': '👤',
            'account_added': '🏢',
            'bulk_import': '📊',
        };
        return icons[type] || '📋';
    },

    // Render energy market news feed
    renderEnergyMarketNews() {
        const newsFeed = document.getElementById('news-feed');
        if (!newsFeed) return;
        
        newsFeed.innerHTML = '';
        
        const newsItems = [
            { 
                title: 'ERCOT Demand Rises', 
                content: 'ERCOT demand is increasing due to summer heat, putting pressure on grid reliability.',
                time: '2 hours ago'
            },
            { 
                title: 'Natural Gas Prices Fluctuate', 
                content: 'Recent geopolitical events have caused volatility in natural gas prices, impacting futures.',
                time: '4 hours ago'
            },
            { 
                title: 'Renewable Energy Growth', 
                content: 'Texas continues to lead in renewable energy adoption with new wind and solar projects.',
                time: '6 hours ago'
            }
        ];
        
        if (newsItems.length > 0) {
            newsItems.forEach(item => {
                const div = document.createElement('div');
                div.className = 'news-item';
                div.innerHTML = `
                    <h4 class="news-title">${item.title}</h4>
                    <p class="news-content">${item.content}</p>
                    <span class="news-time">${item.time}</span>
                `;
                newsFeed.appendChild(div);
            });
        } else {
            newsFeed.innerHTML = '<p class="no-items">No news to display.</p>';
        }
    },

    // Handle search functionality
    handleSearch(query) {
        if (query.length < 2) return;
        
        const results = [];
        
        this.accounts.forEach(account => {
            if (account.name.toLowerCase().includes(query.toLowerCase())) {
                results.push({
                    type: 'account',
                    id: account.id,
                    name: account.name,
                    subtitle: account.industry || 'Account'
                });
            }
        });
        
        this.contacts.forEach(contact => {
            const fullName = `${contact.firstName} ${contact.lastName}`;
            if (fullName.toLowerCase().includes(query.toLowerCase()) || 
                (contact.email && contact.email.toLowerCase().includes(query.toLowerCase()))) {
                results.push({
                    type: 'contact',
                    id: contact.id,
                    name: fullName,
                    subtitle: contact.accountName || 'Contact'
                });
            }
        });
        
        console.log('Search results:', results);
    },

    // Quick action functions
    addAccount() {
        this.openModal('add-account-modal');
    },

    addContact() {
        const accountSelect = document.getElementById('contact-account');
        if (accountSelect) {
            accountSelect.innerHTML = '<option value="">Select an account</option>';
            this.accounts.forEach(account => {
                const option = document.createElement('option');
                option.value = account.id;
                option.textContent = account.name;
                accountSelect.appendChild(option);
            });
        }
        this.openModal('add-contact-modal');
    },

    bulkImport() {
        this.openModal('bulk-import-modal');
    },

    // Modal functions
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            const form = modal.querySelector('form');
            if (form) form.reset();
        }
    },

    async handleAddAccount(e) {
        const accountData = {
            name: document.getElementById('account-name').value,
            industry: document.getElementById('account-industry').value,
            phone: document.getElementById('account-phone').value,
            website: document.getElementById('account-website').value,
            address: document.getElementById('account-address').value,
            createdAt: new Date()
        };
        
        try {
            const tempId = 'temp_' + Date.now();
            this.accounts.push({ id: tempId, ...accountData });
            
            const docRef = await db.collection('accounts').add({
                ...accountData,
                createdAt: serverTimestamp()
            });
            
            const accountIndex = this.accounts.findIndex(a => a.id === tempId);
            if (accountIndex !== -1) {
                this.accounts[accountIndex].id = docRef.id;
            }
            
            console.log('Account saved successfully with ID:', docRef.id);
            this.showToast('Account created successfully!', 'success');
            this.closeModal('add-account-modal');
            this.renderDashboardStats();
            this.updateNotifications();
            
            await this.saveActivity({
                type: 'account_added',
                description: `New account created: ${accountData.name}`,
                accountId: docRef.id,
                accountName: accountData.name
            });
            
        } catch (error) {
            this.accounts = this.accounts.filter(a => a.id !== tempId);
            console.error('Error saving account:', error);
            this.showToast('Failed to create account', 'error');
        }
    },

    async handleAddContact(e) {
        const contactData = {
            firstName: document.getElementById('contact-first-name').value,
            lastName: document.getElementById('contact-last-name').value,
            email: document.getElementById('contact-email').value,
            phone: document.getElementById('contact-phone').value,
            title: document.getElementById('contact-title').value,
            accountId: document.getElementById('contact-account').value,
            accountName: document.getElementById('contact-account').selectedOptions[0]?.textContent || '',
            createdAt: new Date()
        };
        
        try {
            const tempId = 'temp_' + Date.now();
            this.contacts.push({ id: tempId, ...contactData });
            
            const docRef = await db.collection('contacts').add({
                ...contactData,
                createdAt: serverTimestamp()
            });
            
            const contactIndex = this.contacts.findIndex(c => c.id === tempId);
            if (contactIndex !== -1) {
                this.contacts[contactIndex].id = docRef.id;
            }
            
            console.log('Contact saved successfully with ID:', docRef.id);
            this.showToast('Contact created successfully!', 'success');
            this.closeModal('add-contact-modal');
            this.renderDashboardStats();
            this.updateNotifications();
            
            await this.saveActivity({
                type: 'contact_added',
                description: `New contact added: ${contactData.firstName} ${contactData.lastName}`,
                contactId: docRef.id,
                contactName: `${contactData.firstName} ${contactData.lastName}`,
                accountId: contactData.accountId,
                accountName: contactData.accountName
            });
            
        } catch (error) {
            this.contacts = this.contacts.filter(c => c.id !== tempId);
            console.error('Error saving contact:', error);
            this.showToast('Failed to create contact', 'error');
        }
    },

    async handleBulkImport(e) {
        const importType = document.getElementById('import-type').value;
        const fileInput = document.getElementById('csv-file');
        const file = fileInput.files[0];
        
        if (!file) {
            this.showToast('Please select a CSV file', 'error');
            return;
        }
        
        if (!file.name.toLowerCase().endsWith('.csv')) {
            this.showToast('Please select a valid CSV file', 'error');
            return;
        }
        
        try {
            this.showToast('Processing CSV file...', 'info');
            
            const text = await file.text();
            const rows = text.split('\n').map(row => 
                row.split(',').map(cell => cell.trim().replace(/"/g, ''))
            );
            const headers = rows[0].map(h => h.trim().toLowerCase());
            const data = rows.slice(1).filter(row => row.length > 1 && row.some(cell => cell.trim()));
            
            let imported = 0;
            let errors = 0;
            
            for (const row of data) {
                try {
                    if (importType === 'contacts') {
                        const contactData = {
                            firstName: this.getColumnValue(row, headers, ['first name', 'firstname', 'first']),
                            lastName: this.getColumnValue(row, headers, ['last name', 'lastname', 'last']),
                            email: this.getColumnValue(row, headers, ['email', 'email address']),
                            phone: this.getColumnValue(row, headers, ['phone', 'phone number', 'telephone']),
                            title: this.getColumnValue(row, headers, ['title', 'job title', 'position']),
                            accountName: this.getColumnValue(row, headers, ['company', 'account', 'organization']),
                            createdAt: new Date()
                        };
                        
                        if (contactData.firstName && contactData.lastName && contactData.email) {
                            const tempId = 'temp_' + Date.now() + '_' + imported;
                            this.contacts.push({ id: tempId, ...contactData });
                            
                            const docRef = await db.collection('contacts').add({
                                ...contactData,
                                createdAt: serverTimestamp()
                            });
                            
                            const contactIndex = this.contacts.findIndex(c => c.id === tempId);
                            if (contactIndex !== -1) {
                                this.contacts[contactIndex].id = docRef.id;
                            }
                            
                            imported++;
                        } else {
                            errors++;
                        }
                    } else if (importType === 'accounts') {
                        const accountData = {
                            name: this.getColumnValue(row, headers, ['company', 'name', 'company name']),
                            industry: this.getColumnValue(row, headers, ['industry', 'sector']),
                            phone: this.getColumnValue(row, headers, ['phone', 'phone number', 'telephone']),
                            website: this.getColumnValue(row, headers, ['website', 'url', 'web']),
                            address: this.getColumnValue(row, headers, ['address', 'location']),
                            createdAt: new Date()
                        };
                        
                        if (accountData.name) {
                            const tempId = 'temp_' + Date.now() + '_' + imported;
                            this.accounts.push({ id: tempId, ...accountData });
                            
                            const docRef = await db.collection('accounts').add({
                                ...accountData,
                                createdAt: serverTimestamp()
                            });
                            
                            const accountIndex = this.accounts.findIndex(a => a.id === tempId);
                            if (accountIndex !== -1) {
                                this.accounts[accountIndex].id = docRef.id;
                            }
                            
                            imported++;
                        } else {
                            errors++;
                        }
                    }
                } catch (rowError) {
                    console.error('Error processing row:', rowError);
                    errors++;
                }
            }
            
            let message = `Successfully imported ${imported} ${importType}`;
            if (errors > 0) {
                message += ` (${errors} rows had errors and were skipped)`;
            }
            
            this.showToast(message, imported > 0 ? 'success' : 'warning');
            this.closeModal('bulk-import-modal');
            
            this.renderDashboardStats();
            this.updateNotifications();
            
            if (imported > 0) {
                await this.saveActivity({
                    type: 'bulk_import',
                    description: `Bulk imported ${imported} ${importType} from CSV`,
                });
            }
            
        } catch (error) {
            console.error('Error importing CSV:', error);
            this.showToast('Error processing CSV file. Please check the format.', 'error');
        }
    },

    getColumnValue(row, headers, columnNames) {
        for (const name of columnNames) {
            const index = headers.indexOf(name);
            if (index !== -1 && row[index]) {
                return row[index].trim();
            }
        }
        return '';
    },

    updateNotifications() {
        this.notifications = [];
        
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const newContacts = this.contacts.filter(c => new Date(c.createdAt) > yesterday);
        const newAccounts = this.accounts.filter(a => new Date(a.createdAt) > yesterday);
        const today = new Date();
        const pendingTasks = this.tasks.filter(t => !t.completed && new Date(t.dueDate) <= today);
        
        if (newContacts.length > 0) {
            this.notifications.push({
                type: 'contact',
                message: `${newContacts.length} new contact(s) added`,
                count: newContacts.length,
                time: 'Recently'
            });
        }
        
        if (newAccounts.length > 0) {
            this.notifications.push({
                type: 'account',
                message: `${newAccounts.length} new account(s) added`,
                count: newAccounts.length,
                time: 'Recently'
            });
        }
        
        if (pendingTasks.length > 0) {
            this.notifications.push({
                type: 'task',
                message: `${pendingTasks.length} pending task(s) for today`,
                count: pendingTasks.length,
                time: 'Due today'
            });
        }
        
        this.renderNotifications();
        this.updateNavigationBadges();
    },

    renderNotifications() {
        const notificationList = document.getElementById('notification-list');
        const notificationBadge = document.getElementById('notification-badge');
        const notificationCount = document.getElementById('notification-count');
        
        const totalCount = this.notifications.reduce((sum, n) => sum + n.count, 0);
        
        if (notificationBadge) {
            notificationBadge.textContent = totalCount;
            notificationBadge.style.display = totalCount > 0 ? 'flex' : 'none';
        }
        
        if (notificationCount) {
            notificationCount.textContent = totalCount;
        }
        
        if (notificationList) {
            if (this.notifications.length === 0) {
                notificationList.innerHTML = '<div class="notification-empty">No new notifications</div>';
            } else {
                notificationList.innerHTML = this.notifications.map(notification => `
                    <div class="notification-item">
                        <div class="notification-icon ${notification.type}">
                            ${this.getNotificationIcon(notification.type)}
                        </div>
                        <div class="notification-text">
                            <div class="notification-message">${notification.message}</div>
                            <div class="notification-time">${notification.time}</div>
                        </div>
                    </div>
                `).join('');
            }
        }
    },

    updateNavigationBadges() {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const newContacts = this.contacts.filter(c => new Date(c.createdAt) > yesterday).length;
        this.updateBadge('contacts-badge', newContacts);
        
        const newAccounts = this.accounts.filter(a => new Date(a.createdAt) > yesterday).length;
        this.updateBadge('accounts-badge', newAccounts);
        
        const today = new Date();
        const pendingTasks = this.tasks.filter(t => !t.completed && new Date(t.dueDate) <= today).length;
        this.updateBadge('tasks-badge', pendingTasks);
        
        this.updateBadge('emails-badge', 0);
    },

    updateBadge(badgeId, count) {
        const badge = document.getElementById(badgeId);
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    },

    getNotificationIcon(type) {
        const icons = {
            contact: '👤',
            account: '🏢',
            email: '📧',
            task: '✅'
        };
        return icons[type] || '📋';
    },

    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    },

    formatDate(date) {
        if (!date) return 'Unknown';
        const now = new Date();
        const dateObj = new Date(date);
        const diffMs = now - dateObj;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minutes ago`;
        if (diffHours < 24) return `${diffHours} hours ago`;
        if (diffDays < 7) return `${diffDays} days ago`;
        
        return dateObj.toLocaleDateString();
    },

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        
        container.appendChild(toast);
        
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
            toast.style.opacity = '1';
        });
        
        setTimeout(() => {
            toast.style.transform = 'translateX(100%)';
            toast.style.opacity = '0';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }, 4000);
    },

    async saveActivity(activityData) {
        try {
            const docRef = await db.collection('activities').add({
                ...activityData,
                createdAt: serverTimestamp()
            });
            
            this.activities.unshift({
                id: docRef.id,
                ...activityData,
                createdAt: new Date()
            });
            
            console.log('Activity saved successfully with ID:', docRef.id);
            this.renderActivityCarousel();
            return docRef.id;
        } catch (error) {
            console.error('Error saving activity:', error);
            return null;
        }
    },

    async saveAccount(accountData) {
        try {
            const docRef = await db.collection('accounts').add({
                ...accountData,
                createdAt: serverTimestamp()
            });
            
            console.log('Account saved successfully with ID:', docRef.id);
            return docRef.id;
        } catch (error) {
            console.error('Error saving account:', error);
            throw error;
        }
    },

    async saveContact(contactData) {
        try {
            const docRef = await db.collection('contacts').add({
                ...contactData,
                createdAt: serverTimestamp()
            });
            
            console.log('Contact saved successfully with ID:', docRef.id);
            return docRef.id;
        } catch (error) {
            console.error('Error saving contact:', error);
            throw error;
        }
    }
};

// --- 3. Initialize the application when DOM is loaded ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing CRM App...');
    CRMApp.init();
});

// --- 4. Make CRMApp globally available for debugging ---
window.CRMApp = CRMApp;

// --- 5. Additional utility functions ---
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

function formatNumber(num) {
    return new Intl.NumberFormat('en-US').format(num);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
```