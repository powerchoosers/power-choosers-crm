// Fixed Contacts Table with Horizontal Scrolling and Single-Line Text
function renderContactsPageFixed() {
    console.log("renderContactsPageFixed called");
    const contactsView = document.getElementById('contacts-view');
    if (!contactsView) {
        console.log("contactsView not found, returning");
        return;
    }

    console.log("Creating contacts HTML with horizontal scrolling");
    const contactsHTML = `
        <div class="contacts-header" style="
            margin-bottom: 20px;
            padding: 20px;
            background: linear-gradient(135deg, #2c2c2c 0%, #1e1e1e 100%);
            border-radius: 18px;
            border: 1px solid #333;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        ">
            <h2 class="contacts-title" style="
                font-size: 24px;
                font-weight: 600;
                color: #fff;
                margin: 0;
                text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
            ">All Contacts</h2>
        </div>
        <div class="contacts-content" style="display: flex; gap: 20px; flex: 1; overflow: hidden;">
            <!-- Filters Sidebar -->
            <div class="filters-sidebar" style="
                min-width: 280px;
                max-width: 320px;
                flex-shrink: 0;
                background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                padding: 20px;
                border-radius: 18px;
                border: 1px solid #333;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                display: flex;
                flex-direction: column;
                gap: 15px;
            ">
                <h3 class="filters-title" style="color: #fff; margin: 0 0 10px 0; font-size: 18px;">Filters</h3>
                <div class="filter-group">
                    <label class="filter-label" style="color: #ccc; font-size: 14px; margin-bottom: 5px; display: block;">Search</label>
                    <input type="text" id="contact-search-simple" placeholder="Search contacts..." class="filter-input" style="
                        width: 100%;
                        padding: 10px;
                        background: #333;
                        color: #fff;
                        border: 1px solid #555;
                        border-radius: 6px;
                        font-size: 14px;
                    ">
                </div>
                <div class="filter-group">
                    <label class="filter-label" style="color: #ccc; font-size: 14px; margin-bottom: 5px; display: block;">Account</label>
                    <select id="account-filter-simple" class="filter-input" style="
                        width: 100%;
                        padding: 10px;
                        background: #333;
                        color: #fff;
                        border: 1px solid #555;
                        border-radius: 6px;
                        font-size: 14px;
                    ">
                        <option value="">All Accounts</option>
                    </select>
                </div>
                <button onclick="CRMApp.clearContactsFilters()" class="btn btn-clear-filters" style="
                    width: 100%;
                    padding: 12px;
                    background: linear-gradient(135deg, #666 0%, #555 100%);
                    color: #fff;
                    border: 1px solid #777;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                    transition: all 0.2s ease;
                    font-size: 14px;
                ">Clear Filters</button>
            </div>
            <!-- Contacts Table Section -->
            <div class="contacts-table-section" style="
                flex: 1;
                min-width: 0;
                background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                padding: 20px;
                border-radius: 18px;
                border: 1px solid #333;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                display: flex;
                flex-direction: column;
                overflow: hidden;
            ">
                <div id="contacts-count-simple" class="contacts-count" style="
                    color: #ccc;
                    margin-bottom: 15px;
                    font-size: 14px;
                    font-weight: 500;
                    flex-shrink: 0;
                ">Loading contacts...</div>
                <div id="contacts-table-container" class="contacts-table-wrapper" style="
                    flex: 1; 
                    overflow-x: auto; 
                    overflow-y: auto;
                    border-radius: 12px;
                    min-height: 0;
                    scrollbar-width: thin;
                    scrollbar-color: #555 #2a2a2a;
                ">
                    <table class="contacts-table" style="
                        min-width: 1200px;
                        width: max-content;
                        border-collapse: collapse;
                        background: linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%);
                        border-radius: 18px;
                        overflow: hidden;
                        border: 1px solid #444;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
                        table-layout: fixed;
                    ">
                        <thead>
                            <tr class="table-header-row" style="
                                background: linear-gradient(135deg, #444 0%, #333 100%);
                                border-bottom: 2px solid #555;
                            ">
                                <th class="table-header-cell" style="
                                    padding: 15px 12px;
                                    text-align: left;
                                    font-weight: 600;
                                    color: #fff;
                                    border-bottom: 1px solid #555;
                                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
                                    font-size: 14px;
                                    letter-spacing: 0.5px;
                                    white-space: nowrap;
                                    min-width: 150px;
                                ">Name</th>
                                <th class="table-header-cell" style="
                                    padding: 15px 12px;
                                    text-align: left;
                                    font-weight: 600;
                                    color: #fff;
                                    border-bottom: 1px solid #555;
                                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
                                    font-size: 14px;
                                    letter-spacing: 0.5px;
                                    white-space: nowrap;
                                    min-width: 120px;
                                ">Number</th>
                                <th class="table-header-cell" style="
                                    padding: 15px 12px;
                                    text-align: left;
                                    font-weight: 600;
                                    color: #fff;
                                    border-bottom: 1px solid #555;
                                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
                                    font-size: 14px;
                                    letter-spacing: 0.5px;
                                    white-space: nowrap;
                                    min-width: 200px;
                                ">Email</th>
                                <th class="table-header-cell" style="
                                    padding: 15px 12px;
                                    text-align: left;
                                    font-weight: 600;
                                    color: #fff;
                                    border-bottom: 1px solid #555;
                                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
                                    font-size: 14px;
                                    letter-spacing: 0.5px;
                                    white-space: nowrap;
                                    min-width: 150px;
                                ">Company</th>
                                <th class="table-header-cell" style="
                                    padding: 15px 12px;
                                    text-align: left;
                                    font-weight: 600;
                                    color: #fff;
                                    border-bottom: 1px solid #555;
                                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
                                    font-size: 14px;
                                    letter-spacing: 0.5px;
                                    white-space: nowrap;
                                    min-width: 120px;
                                ">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="contacts-table-body-simple" style="
                            background: transparent;
                        "></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    contactsView.innerHTML = contactsHTML;
    contactsView.setAttribute('data-loaded', 'true');
    console.log("Contacts HTML created and injected with horizontal scrolling");

    // Apply layout styles
    contactsView.style.cssText = `
        display: flex !important;
        flex-direction: column !important;
        height: calc(100vh - 120px) !important;
        background: #1a1a1a !important;
        color: #fff !important;
        margin-top: 32px !important;
        padding: 20px !important;
        border-radius: 20px !important;
    `;

    // Initialize contacts functionality
    setTimeout(() => {
        initSimpleContactsUIFixed();
    }, 100);
}

function initSimpleContactsUIFixed() {
    console.log("Initializing simple contacts UI with scrolling");
    
    // Sample contacts data
    const contacts = [
        { id: 1, firstName: 'potter', lastName: '', phone: '1754213779689', email: 'N/A', company: 'N/A' },
        { id: 2, firstName: 'Contact', lastName: '', phone: '1754293386622', email: 'N/A', company: 'N/A' },
        { id: 3, firstName: 'Lewis', lastName: 'Patterson', phone: '972-834-2317', email: 'l.patterson@powerchooser.com', company: 'N/A' }
    ];
    
    renderSimpleContactsTableFixed(contacts);
    
    // Setup search functionality
    const searchInput = document.getElementById('contact-search-simple');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredContacts = contacts.filter(contact => {
                const fullName = `${contact.firstName} ${contact.lastName}`.toLowerCase();
                return fullName.includes(searchTerm) || 
                       (contact.email && contact.email.toLowerCase().includes(searchTerm)) ||
                       (contact.phone && contact.phone.includes(searchTerm));
            });
            renderSimpleContactsTableFixed(filteredContacts);
        });
    }
}

function renderSimpleContactsTableFixed(contacts = []) {
    const tableBody = document.getElementById('contacts-table-body-simple');
    const contactsCount = document.getElementById('contacts-count-simple');
    
    if (!tableBody || !contactsCount) return;
    
    contactsCount.textContent = `${contacts.length} contacts`;
    
    if (contacts.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" style="
                    padding: 20px;
                    text-align: center;
                    color: #888;
                    font-style: italic;
                ">No contacts found</td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = contacts.map(contact => `
        <tr style="
            border-bottom: 1px solid #333;
            transition: background-color 0.2s ease;
        " onmouseover="this.style.backgroundColor='#2a2a2a'" onmouseout="this.style.backgroundColor='transparent'">
            <td style="
                padding: 12px;
                color: #fff;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 150px;
            ">
                <span style="
                    color: #4CAF50;
                    cursor: pointer;
                    font-weight: 500;
                " onclick="alert('View ${contact.firstName} ${contact.lastName}')">
                    ${(contact.firstName || '') + ' ' + (contact.lastName || '')}
                </span>
            </td>
            <td style="
                padding: 12px;
                color: #fff;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 120px;
            ">${contact.phone || contact.id || 'N/A'}</td>
            <td style="
                padding: 12px;
                color: #fff;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 200px;
            ">${contact.email || 'N/A'}</td>
            <td style="
                padding: 12px;
                color: #fff;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 150px;
            ">${contact.company || 'N/A'}</td>
            <td style="
                padding: 12px;
                white-space: nowrap;
            ">
                <button onclick="alert('Call ${contact.firstName}')" style="
                    margin-right: 5px;
                    padding: 4px 8px;
                    background: #28a745;
                    color: #fff;
                    border: none;
                    border-radius: 3px;
                    font-size: 12px;
                    cursor: pointer;
                ">Call</button>
                <button onclick="alert('Email ${contact.email}')" style="
                    padding: 4px 8px;
                    background: #007bff;
                    color: #fff;
                    border: none;
                    border-radius: 3px;
                    font-size: 12px;
                    cursor: pointer;
                ">Email</button>
            </td>
        </tr>
    `).join('');
}

// Add to global scope for testing
window.renderContactsPageFixed = renderContactsPageFixed;
window.initSimpleContactsUIFixed = initSimpleContactsUIFixed;
window.renderSimpleContactsTableFixed = renderSimpleContactsTableFixed;

// Auto-navigate to contacts and show fixed table
function showFixedContactsTable() {
    console.log("Navigating to contacts and showing fixed table");
    
    // Force switch to contacts view first
    const contactsView = document.getElementById('contacts-view');
    if (contactsView) {
        // Clear any existing content
        contactsView.innerHTML = '';
        
        // Hide all other views
        const allViews = document.querySelectorAll('[id$="-view"]');
        allViews.forEach(view => {
            if (view.id !== 'contacts-view') {
                view.style.display = 'none';
            }
        });
        
        // Show contacts view
        contactsView.style.display = 'flex';
        
        // Update sidebar active state
        const sidebarItems = document.querySelectorAll('.sidebar-item');
        sidebarItems.forEach(item => item.classList.remove('active'));
        const contactsItem = document.querySelector('[onclick*="contacts"]');
        if (contactsItem) contactsItem.classList.add('active');
        
        // Now render our fixed version
        renderContactsPageFixed();
    } else {
        console.error("contacts-view element not found");
    }
}

// Add to global scope
window.showFixedContactsTable = showFixedContactsTable;
