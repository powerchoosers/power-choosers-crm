/* === CONTACTS MANAGER === */
/* Apollo-inspired contacts interface with advanced filtering, drag-drop, and quick actions */

class ContactsManager {
    constructor() {
        this.contacts = [];
        this.filteredContacts = [];
        this.currentPage = 1;
        this.pageSize = 25;
        this.sortColumn = 'name';
        this.sortDirection = 'asc';
        this.filters = {};
        this.selectedContacts = new Set();
        this.columnOrder = ['select', 'name', 'company', 'title', 'email', 'phone', 'location', 'actions'];
        this.draggedColumn = null;
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadContacts();
        this.initDragAndDrop();
    }

    bindEvents() {
        // Apollo-style filter panel interactivity
        this.initApolloFilterPanel();
        // Search functionality
        document.getElementById('contacts-search')?.addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });

        // Filter toggles
        document.getElementById('toggle-filters-btn')?.addEventListener('click', () => {
            this.toggleFilters();
        });

        // Clear filters
        document.getElementById('clear-filters')?.addEventListener('click', () => {
            this.clearFilters();
        });

        // Select all checkbox
        document.getElementById('select-all')?.addEventListener('change', (e) => {
            this.handleSelectAll(e.target.checked);
        });

        // Pagination
        document.getElementById('prev-page')?.addEventListener('click', () => this.prevPage());
        document.getElementById('next-page')?.addEventListener('click', () => this.nextPage());
        document.getElementById('page-size')?.addEventListener('change', (e) => {
            this.changePageSize(parseInt(e.target.value));
        });

        // View toggles
        document.getElementById('table-view')?.addEventListener('click', () => this.setView('table'));
        document.getElementById('card-view')?.addEventListener('click', () => this.setView('card'));

        // Add contact
        document.getElementById('add-contact-btn')?.addEventListener('click', () => {
            this.showAddContactModal();
        });

        // Filter inputs
        this.bindFilterEvents();
    }

    bindFilterEvents() {
        // Apollo-style filter search and checkboxes
        document.querySelectorAll('.filter-category-header').forEach(header => {
            header.addEventListener('click', (e) => {
                const category = header.parentElement;
                category.classList.toggle('expanded');
            });
        });

        // Filter option selection (checkboxes, etc.)
        document.querySelectorAll('.filter-options input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                this.handleApolloFilterChange();
            });
        });
        document.querySelectorAll('.filter-search').forEach(input => {
            input.addEventListener('input', (e) => {
                this.handleApolloFilterChange();
            });
        });
    }

    // Apollo filter panel logic
    initApolloFilterPanel() {
        // Collapse panel
        const collapseBtn = document.getElementById('collapse-filters');
        const panel = document.getElementById('contacts-filter-panel');
        if (collapseBtn && panel) {
            collapseBtn.addEventListener('click', () => {
                panel.classList.toggle('collapsed');
            });
        }
        // Active filter chips
        this.renderActiveFilterChips();
        // Listen for chip remove
        document.getElementById('active-filters')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('chip-remove')) {
                const field = e.target.getAttribute('data-filter');
                const value = e.target.getAttribute('data-value');
                this.removeApolloFilter(field, value);
            }
        });
    }

    handleApolloFilterChange() {
        // Collect all checked/filled filter values
        const filters = {};
        document.querySelectorAll('.filter-category').forEach(cat => {
            const category = cat.getAttribute('data-category');
            // Checkboxes
            cat.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
                if (!filters[category]) filters[category] = [];
                filters[category].push(cb.value);
            });
            // Text search
            cat.querySelectorAll('input.filter-search').forEach(input => {
                if (input.value.trim()) {
                    filters[category] = [input.value.trim()];
                }
            });
        });
        this.apolloFilters = filters;
        this.renderActiveFilterChips();
        this.applyApolloFilters();
    }

    renderActiveFilterChips() {
        const chipContainer = document.getElementById('active-filters');
        if (!chipContainer) return;
        chipContainer.innerHTML = '';
        if (!this.apolloFilters) return;
        Object.entries(this.apolloFilters).forEach(([field, values]) => {
            if (!values) return;
            values.forEach(val => {
                const chip = document.createElement('div');
                chip.className = 'filter-chip';
                chip.innerHTML = `${field.charAt(0).toUpperCase() + field.slice(1)}: ${val} <span class="chip-remove" data-filter="${field}" data-value="${val}">&times;</span>`;
                chipContainer.appendChild(chip);
            });
        });
    }

    removeApolloFilter(field, value) {
        if (!this.apolloFilters || !this.apolloFilters[field]) return;
        this.apolloFilters[field] = this.apolloFilters[field].filter(v => v !== value);
        if (this.apolloFilters[field].length === 0) delete this.apolloFilters[field];
        // Uncheck or clear input
        document.querySelectorAll(`.filter-category[data-category="${field}"] input`).forEach(input => {
            if (input.type === 'checkbox' && input.value === value) input.checked = false;
            if (input.classList.contains('filter-search') && input.value === value) input.value = '';
        });
        this.renderActiveFilterChips();
        this.applyApolloFilters();
    }

    applyApolloFilters() {
        let filtered = [...this.contacts];
        if (this.apolloFilters) {
            Object.entries(this.apolloFilters).forEach(([field, values]) => {
                if (!values || values.length === 0) return;
                filtered = filtered.filter(contact => {
                    if (field === 'company') {
                        return values.some(val => contact.company.toLowerCase().includes(val.toLowerCase()));
                    }
                    if (field === 'job-title') {
                        return values.some(val => contact.jobTitle.toLowerCase().includes(val.toLowerCase()));
                    }
                    if (field === 'location') {
                        return values.some(val => contact.location.toLowerCase().includes(val.toLowerCase()));
                    }
                    if (field === 'status') {
                        return values.some(val => {
                            if (val === 'verified') return contact.phoneStatus === 'verified';
                            if (val === 'email-verified') return contact.emailStatus === 'verified';
                            if (val === 'bounced') return contact.emailStatus === 'bounced';
                            return false;
                        });
                    }
                    return true;
                });
            });
        }
        this.filteredContacts = filtered;
        this.currentPage = 1;
        this.renderContacts();
        this.updatePagination();
    }


    async loadContacts() {
        try {
            this.showLoadingState();
            this.contacts = this.generateSampleContacts();
            this.applyFilters();
            this.updateStats();
            this.populateFilterOptions();
        } catch (error) {
            console.error('Error loading contacts:', error);
            this.showErrorState();
        }
    }

    generateSampleContacts() {
        const companies = [
            { name: 'Salesforce', domain: 'salesforce.com' },
            { name: 'Microsoft', domain: 'microsoft.com' },
            { name: 'Google', domain: 'google.com' },
            { name: 'Apple', domain: 'apple.com' },
            { name: 'Amazon', domain: 'amazon.com' }
        ];

        const jobTitles = ['CEO', 'CTO', 'VP Sales', 'Sales Director', 'Account Manager', 'Marketing Director'];
        const locations = ['San Francisco, CA', 'New York, NY', 'Austin, TX', 'Seattle, WA', 'Boston, MA'];
        const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Robert', 'Lisa'];
        const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller'];

        const contacts = [];
        for (let i = 0; i < 435; i++) {
            const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
            const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
            const company = companies[Math.floor(Math.random() * companies.length)];
            const jobTitle = jobTitles[Math.floor(Math.random() * jobTitles.length)];
            const location = locations[Math.floor(Math.random() * locations.length)];
            
            contacts.push({
                id: `contact_${i + 1}`,
                firstName,
                lastName,
                name: `${firstName} ${lastName}`,
                email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${company.domain}`,
                phone: this.generatePhoneNumber(),
                company: company.name,
                companyDomain: company.domain,
                jobTitle,
                location,
                phoneStatus: Math.random() > 0.3 ? 'verified' : 'unverified',
                emailStatus: Math.random() > 0.2 ? 'verified' : 'bounced',
                tags: [],
                createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000)
            });
        }
        return contacts;
    }

    generatePhoneNumber() {
        const areaCode = Math.floor(Math.random() * 900) + 100;
        const exchange = Math.floor(Math.random() * 900) + 100;
        const number = Math.floor(Math.random() * 9000) + 1000;
        return `(${areaCode}) ${exchange}-${number}`;
    }

    handleSearch(query) {
        this.searchQuery = query.toLowerCase();
        this.applyFilters();
    }

    applyFilters() {
        let filtered = [...this.contacts];

        if (this.searchQuery) {
            filtered = filtered.filter(contact => 
                contact.name.toLowerCase().includes(this.searchQuery) ||
                contact.email.toLowerCase().includes(this.searchQuery) ||
                contact.company.toLowerCase().includes(this.searchQuery)
            );
        }

        filtered.sort((a, b) => {
            let aVal = a[this.sortColumn];
            let bVal = b[this.sortColumn];
            
            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }
            
            return this.sortDirection === 'asc' ? 
                (aVal < bVal ? -1 : aVal > bVal ? 1 : 0) :
                (aVal > bVal ? -1 : aVal < bVal ? 1 : 0);
        });

        this.filteredContacts = filtered;
        this.currentPage = 1;
        this.renderContacts();
        this.updatePagination();
    }

    renderContacts() {
        const tbody = document.getElementById('contacts-table-body');
        if (!tbody) return;

        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = startIndex + this.pageSize;
        const pageContacts = this.filteredContacts.slice(startIndex, endIndex);

        if (pageContacts.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No contacts found</td></tr>`;
            return;
        }

        tbody.innerHTML = pageContacts.map(contact => this.renderContactRow(contact)).join('');
        this.bindRowEvents();
    }

    renderContactRow(contact) {
        const isSelected = this.selectedContacts.has(contact.id);
        
        return `
            <tr data-contact-id="${contact.id}" class="${isSelected ? 'selected' : ''}">
                <td><input type="checkbox" ${isSelected ? 'checked' : ''} onchange="contactsManager.toggleContactSelection('${contact.id}')"></td>
                <td>
                    <div class="contact-name">
                        <div class="contact-avatar">
                            <img src="https://www.gravatar.com/avatar/${this.md5(contact.email)}?d=identicon&s=32" alt="${contact.name}">
                        </div>
                        <div class="contact-info">
                            <div class="contact-name-text">${contact.name}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="company-info">
                        <img class="company-favicon" src="https://www.google.com/s2/favicons?domain=${contact.companyDomain}&sz=16" alt="${contact.company}">
                        <span class="company-name">${contact.company}</span>
                    </div>
                </td>
                <td>${contact.jobTitle}</td>
                <td><a href="mailto:${contact.email}" class="email-address">${contact.email}</a></td>
                <td><a href="tel:${contact.phone}" class="phone-number">${contact.phone}</a></td>
                <td>${contact.location}</td>
                <td>
                    <div class="quick-actions">
                        <button class="action-btn call" title="Call" onclick="contactsManager.callContact('${contact.id}')">📞</button>
                        <button class="action-btn email" title="Email" onclick="contactsManager.emailContact('${contact.id}')">✉️</button>
                        <button class="action-btn sequence" title="Add to Sequence" onclick="contactsManager.addToSequence('${contact.id}')">⭐</button>
                    </div>
                </td>
            </tr>
        `;
    }

    bindRowEvents() {
        document.querySelectorAll('.contacts-table th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const column = th.dataset.column;
                this.sortBy(column);
            });
        });
    }

    sortBy(column) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }

        document.querySelectorAll('.contacts-table th').forEach(th => {
            th.classList.remove('sorted', 'desc');
        });

        const currentTh = document.querySelector(`[data-column="${column}"]`);
        if (currentTh) {
            currentTh.classList.add('sorted');
            if (this.sortDirection === 'desc') currentTh.classList.add('desc');
        }

        this.applyFilters();
    }

    initDragAndDrop() {
        const headers = document.querySelectorAll('.contacts-table th.draggable');
        
        headers.forEach(header => {
            header.draggable = true;
            
            header.addEventListener('dragstart', (e) => {
                this.draggedColumn = header.dataset.column;
                header.classList.add('dragging');
            });
            
            header.addEventListener('dragend', () => {
                header.classList.remove('dragging');
                this.draggedColumn = null;
            });
            
            header.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (this.draggedColumn && this.draggedColumn !== header.dataset.column) {
                    this.showDropIndicator(header);
                }
            });
            
            header.addEventListener('drop', (e) => {
                e.preventDefault();
                if (this.draggedColumn && this.draggedColumn !== header.dataset.column) {
                    this.reorderColumns(this.draggedColumn, header.dataset.column);
                }
            });
        });
    }

    showDropIndicator(targetHeader) {
        // Visual feedback for drag and drop
        targetHeader.style.borderLeft = '2px solid var(--cch-blue)';
        setTimeout(() => {
            targetHeader.style.borderLeft = '';
        }, 200);
    }

    reorderColumns(draggedColumn, targetColumn) {
        const draggedIndex = this.columnOrder.indexOf(draggedColumn);
        const targetIndex = this.columnOrder.indexOf(targetColumn);
        
        this.columnOrder.splice(draggedIndex, 1);
        const newTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
        this.columnOrder.splice(newTargetIndex, 0, draggedColumn);
        
        this.renderContacts();
    }

    toggleContactSelection(contactId) {
        if (this.selectedContacts.has(contactId)) {
            this.selectedContacts.delete(contactId);
        } else {
            this.selectedContacts.add(contactId);
        }
        this.renderContacts();
    }

    handleSelectAll(checked) {
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = startIndex + this.pageSize;
        const pageContacts = this.filteredContacts.slice(startIndex, endIndex);
        
        if (checked) {
            pageContacts.forEach(contact => this.selectedContacts.add(contact.id));
        } else {
            pageContacts.forEach(contact => this.selectedContacts.delete(contact.id));
        }
        
        this.renderContacts();
    }

    // Quick Actions
    callContact(contactId) {
        const contact = this.contacts.find(c => c.id === contactId);
        if (contact) {
            window.open(`tel:${contact.phone}`);
            console.log(`Calling ${contact.name}`);
        }
    }

    emailContact(contactId) {
        const contact = this.contacts.find(c => c.id === contactId);
        if (contact) {
            window.open(`mailto:${contact.email}`);
            console.log(`Emailing ${contact.name}`);
        }
    }

    addToSequence(contactId) {
        const contact = this.contacts.find(c => c.id === contactId);
        if (contact) {
            alert(`${contact.name} added to sequence!`);
        }
    }

    // Utility Methods
    toggleFilters() {
        const filtersPanel = document.getElementById('filters-panel');
        if (filtersPanel) {
            filtersPanel.classList.toggle('collapsed');
        }
    }

    clearFilters() {
        this.filters = {};
        this.searchQuery = '';
        document.getElementById('contacts-search').value = '';
        this.applyFilters();
    }

    setView(view) {
        document.querySelectorAll('.view-options .btn-icon').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`${view}-view`).classList.add('active');
    }

    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.renderContacts();
            this.updatePagination();
        }
    }

    nextPage() {
        const totalPages = Math.ceil(this.filteredContacts.length / this.pageSize);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.renderContacts();
            this.updatePagination();
        }
    }

    changePageSize(newSize) {
        this.pageSize = newSize;
        this.currentPage = 1;
        this.renderContacts();
        this.updatePagination();
    }

    updatePagination() {
        const totalContacts = this.filteredContacts.length;
        const startIndex = (this.currentPage - 1) * this.pageSize + 1;
        const endIndex = Math.min(startIndex + this.pageSize - 1, totalContacts);

        const paginationInfo = document.getElementById('pagination-info');
        if (paginationInfo) {
            paginationInfo.textContent = `${startIndex}-${endIndex} of ${totalContacts}`;
        }

        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        const totalPages = Math.ceil(totalContacts / this.pageSize);
        
        if (prevBtn) prevBtn.disabled = this.currentPage === 1;
        if (nextBtn) nextBtn.disabled = this.currentPage === totalPages;
    }

    updateStats() {
        const total = this.contacts.length;
        const newContacts = this.contacts.filter(c => {
            const daysSinceCreated = (Date.now() - c.createdAt.getTime()) / (1000 * 60 * 60 * 24);
            return daysSinceCreated <= 7;
        }).length;

        document.getElementById('total-contacts').textContent = total;
        document.getElementById('new-contacts').textContent = newContacts;
        document.getElementById('saved-contacts').textContent = Math.floor(total * 0.3);
    }

    populateFilterOptions() {
        const companies = [...new Set(this.contacts.map(c => c.company))].sort();
        const companySelect = document.getElementById('filter-company');
        if (companySelect) {
            companySelect.innerHTML = '<option value="">All Companies</option>' +
                companies.map(company => `<option value="${company}">${company}</option>`).join('');
        }
    }

    showLoadingState() {
        const tbody = document.getElementById('contacts-table-body');
        if (tbody) {
            tbody.innerHTML = `<tr class="loading-row"><td colspan="8">Loading contacts...</td></tr>`;
        }
    }

    showErrorState() {
        const tbody = document.getElementById('contacts-table-body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Error loading contacts</td></tr>`;
        }
    }

    showAddContactModal() {
        alert('Add contact modal would open here');
    }

    // Simple MD5 hash for Gravatar
    md5(str) {
        return str.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0).toString(16);
    }
}

// Initialize contacts manager when DOM is ready
let contactsManager;
document.addEventListener('DOMContentLoaded', () => {
    contactsManager = new ContactsManager();
});
