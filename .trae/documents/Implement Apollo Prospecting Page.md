# Implementation Plan: Apollo Prospecting Page

I will create a new dedicated **Prospecting** page in your CRM that allows you to toggle between searching for **People** and **Accounts** using the Apollo API. This page will mirror the style and functionality of your existing CRM pages.

## 1. Backend API Implementation

I will create two new server-side endpoints to securely proxy requests to Apollo, keeping your API key safe. I've confirmed that existing endpoints (`contacts.js`, `company.js`) are specialized for other tasks (enrichment/specific lookup), so new dedicated search endpoints are required.

* **Create** **`api/apollo/search/people.js`**:

  * Endpoint: `POST /api/apollo/search/people`

  * Function: Proxies to `https://api.apollo.io/api/v1/mixed_people/search`.

  * Logic: Accepts search filters (keywords, titles, location, revenue) and maps the Apollo response to your CRM's contact format.

  * Dependencies: Uses `_utils.js` for authentication and error handling.

* **Create** **`api/apollo/search/organizations.js`**:

  * Endpoint: `POST /api/apollo/search/organizations`

  * Function: Proxies to `https://api.apollo.io/api/v1/mixed_companies/search`.

  * Logic: Accepts search filters and maps the response to your CRM's account format.

## 2. Frontend Structure (`crm-dashboard.html`)

I will modify the main dashboard HTML to include the new page view and navigation item.

* **Sidebar**: Add a "Prospecting" link to the sidebar navigation.

* **Page Container**: Add a new `<div id="prospecting-page" class="page-content" hidden>` section.

* **Toggle Switch**: Implement the exact view toggle you requested:

  ```html
  <div class="view-toggle" id="prospecting-view-toggle">
      <button class="toggle-btn filter-tab active" data-view="people">People Search</button>
      <button class="toggle-btn filter-tab" data-view="accounts">Account Search</button>
  </div>
  ```

* **Table Layout**: Replicate the exact table structure used in `#people-table` and `#accounts-table` (using `main.css` classes like `.data-table`, `.row-item`, etc.) to ensure visual consistency.

## 3. Frontend Logic (`scripts/pages/prospecting.js`)

I will create a new JavaScript module `ProspectingPage` to handle the page interactivity.

* **State Management**: Track the current view (`people` vs `accounts`), search query, and pagination.

* **Toggle Logic**: Switch between the two search modes, updating the UI and clearing results.

* **Search & Filtering**:

  * Implement a search bar and filters (Title, Location, Company Revenue, etc.) based on the Apollo API capabilities.

  * Call the new backend API endpoints based on the active view.

* **Table Rendering**:

  * Map Apollo results to your CRM's table format.

  * **Action**: Add a "Save to CRM" button for each result that integrates with your existing contact creation logic.

## 4. Integration

* **Navigation**: Update the main navigation logic to handle the `#prospecting` hash and show the new page.

* **Styling**: Ensure all new elements use the existing utility classes from `main.css` for a seamless look.

