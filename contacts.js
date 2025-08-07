document.addEventListener('DOMContentLoaded', () => {
    // Ensure Firebase is initialized before using it
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        console.error('Firebase is not initialized. Make sure firebase-config.js is loaded and configured correctly.');
        return;
    }

    const db = firebase.firestore();

    // --- DOM Element References ---
    const tableBody = document.getElementById('contacts-table-body');
    const tableHead = document.querySelector('#contacts-table thead');
    const filtersContent = document.getElementById('filters-content');
    const selectedFiltersContainer = document.querySelector('.selected-filters-container');

    // --- Configuration ---
    // IMPORTANT: Update this with your actual contact fields from Firebase
    const contactFields = ['name', 'email', 'phone', 'company', 'title', 'location'];
    const filterableFields = ['company', 'title', 'location']; // Fields that will appear in the filter sidebar

    let allContacts = [];
    let activeFilters = {};

    // --- Main Functions ---

    /**
     * Fetches contacts from the 'contacts' collection in Firestore.
     */
    async function fetchContacts() {
        try {
            const snapshot = await db.collection('contacts').get();
            allContacts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderUI();
        } catch (error) {
            console.error('Error fetching contacts:', error);
            tableBody.innerHTML = `<tr><td colspan="${contactFields.length + 1}">Error loading contacts.</td></tr>`;
        }
    }

    /**
     * Renders the entire UI (headers, filters, table).
     */
    function renderUI() {
        renderTableHeaders();
        renderFilters();
        applyFiltersAndRenderTable();
    }

    /**
     * Renders the table headers based on contactFields.
     */
    function renderTableHeaders() {
        const headerRow = `<tr>
            ${contactFields.map(field => `<th>${field.charAt(0).toUpperCase() + field.slice(1)}</th>`).join('')}
            <th>Actions</th>
        </tr>`;
        tableHead.innerHTML = headerRow;
    }

    /**
     * Renders the filter input fields in the sidebar.
     */
    function renderFilters() {
        let filtersHtml = '';
        filterableFields.forEach(field => {
            filtersHtml += `
                <div class="filter-category">
                    <h3>${field.charAt(0).toUpperCase() + field.slice(1)}</h3>
                    <input type="text" id="filter-${field}" data-field="${field}" placeholder="Filter by ${field}...">
                </div>
            `;
        });
        filtersContent.innerHTML = filtersHtml;

        // Add event listeners to the new input fields
        filterableFields.forEach(field => {
            document.getElementById(`filter-${field}`).addEventListener('keyup', (e) => {
                activeFilters[field] = e.target.value.toLowerCase();
                applyFiltersAndRenderTable();
                updateFilterChips();
            });
        });
    }

    /**
     * Applies current filters and re-renders the contacts table.
     */
    function applyFiltersAndRenderTable() {
        const filteredContacts = allContacts.filter(contact => {
            return Object.entries(activeFilters).every(([field, value]) => {
                if (!value) return true; // If filter value is empty, it passes
                return contact[field] && contact[field].toLowerCase().includes(value);
            });
        });
        renderTable(filteredContacts);
    }

    /**
     * Renders the rows of the contacts table.
     * @param {Array} contacts - The array of contact objects to render.
     */
    function renderTable(contacts) {
        if (contacts.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="${contactFields.length + 1}">No contacts found.</td></tr>`;
            return;
        }

        // TODO: Implement pagination (showing max 50)
        const contactsToDisplay = contacts.slice(0, 50);

        let tableHtml = '';
        contactsToDisplay.forEach(contact => {
            tableHtml += `<tr>`;
            contactFields.forEach(field => {
                tableHtml += `<td>${createCellContent(contact, field)}</td>`;
            });
            tableHtml += `<td class="action-buttons">
                            <button title="Email">📧</button>
                            <button title="Call">📞</button>
                            <button title="Add to Sequence">➕</button>
                         </td>`;
            tableHtml += `</tr>`;
        });
        tableBody.innerHTML = tableHtml;
    }

    /**
     * Creates the HTML content for a table cell, adding profile pics and favicons.
     * @param {Object} contact - The contact object.
     * @param {String} field - The field key.
     */
    function createCellContent(contact, field) {
        const value = contact[field] || '';
        if (field === 'name') {
            // TODO: Replace with actual profile picture logic
            const profilePicUrl = 'https://via.placeholder.com/24'; // Placeholder
            return `<div class="contact-name-cell">
                        <img src="${profilePicUrl}" class="profile-pic" alt="Profile">
                        <span>${value}</span>
                    </div>`;
        }
        if (field === 'company' && contact.domain) {
            // Fetches favicon from Google's S2 service
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${contact.domain}`;
            return `<div class="account-name-cell">
                        <img src="${faviconUrl}" class="favicon" alt="Favicon">
                        <span>${value}</span>
                    </div>`;
        }
        return value;
    }

    /**
     * Updates the filter chips displayed above the table.
     */
    function updateFilterChips() {
        let chipsHtml = '';
        Object.entries(activeFilters).forEach(([field, value]) => {
            if (value) {
                chipsHtml += `<div class="filter-chip">
                                ${field}: ${value}
                                <span class="remove-filter" data-field="${field}">x</span>
                              </div>`;
            }
        });
        selectedFiltersContainer.innerHTML = chipsHtml;

        // Add event listeners to remove buttons
        document.querySelectorAll('.remove-filter').forEach(button => {
            button.addEventListener('click', (e) => {
                const fieldToRemove = e.target.dataset.field;
                activeFilters[fieldToRemove] = '';
                document.getElementById(`filter-${fieldToRemove}`).value = '';
                applyFiltersAndRenderTable();
                updateFilterChips();
            });
        });
    }

    // --- Initial Load ---
    fetchContacts();
});
