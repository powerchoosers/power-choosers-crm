/**
 * Prospecting Page Logic
 * Handles Apollo search for People and Accounts
 */

const ProspectingPage = (function() {
    // State
    let initialized = false;
    const state = {
        view: 'people', // 'people' or 'accounts'
        searchQuery: '',
        pagination: {
            page: 1,
            per_page: 10,
            total_pages: 1,
            total_entries: 0
        },
        isLoading: false
    };

    // DOM Elements
    const elements = {
        container: null,
        toggleBtns: null,
        searchInput: null,
        searchBtn: null,
        tableHeader: null,
        tableBody: null,
        pagination: null,
        paginationSummary: null,
        filtersContainer: null
    };

    function init() {
        if (initialized) return;
        console.log('[Prospecting] Initializing...');
        
        // Cache DOM elements
        elements.container = document.getElementById('prospecting-page');
        if (!elements.container) return;

        elements.toggleBtns = elements.container.querySelectorAll('.toggle-btn');
        elements.searchInput = document.getElementById('prospecting-search');
        elements.searchBtn = document.getElementById('prospecting-search-btn');
        elements.tableHeader = document.getElementById('prospecting-table-header');
        elements.tableBody = document.getElementById('prospecting-table-body');
        elements.pagination = document.getElementById('prospecting-pagination');
        elements.paginationSummary = document.getElementById('prospecting-pagination-summary');
        elements.filtersContainer = document.getElementById('prospecting-filters');

        // Event Listeners
        elements.toggleBtns.forEach(btn => {
            btn.addEventListener('click', () => toggleView(btn.dataset.view));
        });

        elements.searchBtn.addEventListener('click', handleSearch);
        elements.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSearch();
        });

        elements.tableBody.addEventListener('click', (e) => {
            const btn = e.target.closest('.qa-btn');
            if (!btn) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            if (!action) return;
            if (action === 'save' && id) {
                saveOrganization(id);
                return;
            }
            if (action === 'linkedin' && btn.dataset.linkedin) {
                const url = btn.dataset.linkedin;
                try { window.open(url, '_blank', 'noopener'); } catch (_) { location.href = url; }
                return;
            }
            if (action === 'website') {
                const site = btn.dataset.website;
                if (!site) return;
                let url = site;
                if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
                try { window.open(url, '_blank', 'noopener'); } catch (_) { location.href = url; }
                return;
            }
        });

        // Initial render
        updateTableHeader();
        updatePagination({ page: 1, total_pages: 1, total_entries: 0 });
        initialized = true;
    }

    function toggleView(viewType) {
        if (state.view === viewType) return;
        
        state.view = viewType;
        state.pagination.page = 1;
        state.searchQuery = '';
        elements.searchInput.value = '';
        elements.tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Use the search bar to find prospects</td></tr>';
        elements.pagination.innerHTML = '';
        if (elements.paginationSummary) elements.paginationSummary.textContent = '';

        // Update Toggle UI
        elements.toggleBtns.forEach(btn => {
            if (btn.dataset.view === viewType) {
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
            } else {
                btn.classList.remove('active');
                btn.setAttribute('aria-selected', 'false');
            }
        });

        updateTableHeader();
    }

    function updateTableHeader() {
        if (state.view === 'people') {
            elements.tableHeader.innerHTML = `
                <th>Name</th>
                <th>Title</th>
                <th>Company</th>
                <th>Location</th>
                <th>Email</th>
                <th>Actions</th>
            `;
            elements.searchInput.placeholder = 'Search people by name, title, or company...';
        } else {
            elements.tableHeader.innerHTML = `
                <th>Company Name</th>
                <th>Industry</th>
                <th>Location</th>
                <th>Employees</th>
                <th>Website</th>
                <th>Actions</th>
            `;
            elements.searchInput.placeholder = 'Search companies by name or domain...';
        }
    }

    async function handleSearch() {
        const query = elements.searchInput.value.trim();
        if (!query && state.view === 'people') {
            // allow empty search? maybe not for prospecting to save credits
            // return; 
        }

        state.searchQuery = query;
        state.pagination.page = 1; // Reset to page 1 on new search
        await fetchResults();
    }

    function emptyHtml() {
        const msg = state.isLoading ? 'Loading...' : 'No results found';
        const colCount = state.view === 'people' ? 6 : 6;
        return `<tr><td colspan="${colCount}" style="text-align: center; padding: 20px;">${msg}</td></tr>`;
    }

    async function fetchResults() {
        state.isLoading = true;
        elements.tableBody.innerHTML = emptyHtml();

        try {
            const endpoint = state.view === 'people' 
                ? '/api/apollo/search/people' 
                : '/api/apollo/search/organizations';
            
            const payload = {
                page: state.pagination.page,
                per_page: state.pagination.per_page
            };

            if (state.view === 'people') {
                payload.q_keywords = state.searchQuery;
            } else {
                payload.q_organization_name = state.searchQuery;
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Search failed');

            const data = await response.json();
            console.warn('[Prospecting] Search Data Received:', data);
            
            if (state.view === 'people') {
                renderPeople(data.people || []);
                updatePagination(data.pagination);
            } else {
                renderOrganizations(data.organizations || []);
                updatePagination(data.pagination);
            }

        } catch (error) {
            console.error('[Prospecting] Search error:', error);
            elements.tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: red; padding: 20px;">Error: ${error.message}</td></tr>`;
        } finally {
            state.isLoading = false;
        }
    }

    function renderPeople(people) {
        if (!people.length) {
            elements.tableBody.innerHTML = emptyHtml();
            return;
        }

        elements.tableBody.innerHTML = people.map(person => `
            <tr>
                <td>
                    <div class="user-info">
                        ${person.photoUrl ? `<img src="${person.photoUrl}" alt="" class="user-avatar-small">` : `<div class="user-avatar-small fallback">${person.firstName?.[0] || ''}${person.lastName?.[0] || ''}</div>`}
                        <div>
                            <div class="user-name">${person.name}</div>
                            ${person.linkedin ? `<a href="${person.linkedin}" target="_blank" class="linkedin-icon-small">in</a>` : ''}
                        </div>
                    </div>
                </td>
                <td>${person.title || '-'}</td>
                <td>
                    ${person.organization?.name || '-'}
                    ${person.organization?.domain ? `<div class="text-muted text-xs">${person.organization.domain}</div>` : ''}
                </td>
                <td>${person.location || '-'}</td>
                <td>
                    ${person.email ? `
                        <div class="email-badge ${person.emailStatus === 'verified' ? 'verified' : ''}">
                            ${person.email}
                        </div>
                    ` : '<span class="text-muted">Not revealed</span>'}
                </td>
                <td>
                    <button class="btn-icon btn-save-prospect" onclick="ProspectingPage.savePerson('${person.id}')" title="Save to CRM">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                            <polyline points="17 21 17 13 7 13 7 21"></polyline>
                            <polyline points="7 3 7 8 15 8"></polyline>
                        </svg>
                    </button>
                </td>
            </tr>
        `).join('');

        // Store current results for save functionality
        state.currentResults = people;
    }

    function renderOrganizations(orgs) {
        if (!orgs.length) {
            elements.tableBody.innerHTML = emptyHtml();
            return;
        }

        const formatEmployees = (val) => {
            if (!val) return '-';
            const num = parseInt(val);
            if (isNaN(num)) return '-'; // STRICT: No growth metrics or non-numeric strings
            return num.toLocaleString() + ' employees';
        };

        elements.tableBody.innerHTML = orgs.map(org => {
            // Use global favicon helper for consistent icons
            const domain = org.domain || (org.website ? (new URL(org.website).hostname).replace(/^www\./, '') : '');
            const logoUrl = org.logoUrl;
            
            let iconHtml = '';
            if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
                iconHtml = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl, domain, size: 32 });
            } else {
                 iconHtml = logoUrl ? `<img src="${logoUrl}" alt="" class="company-logo-small">` : `<div class="company-logo-small fallback">${org.name?.[0] || 'C'}</div>`;
            }

            return `
            <tr>
                <td class="name-cell">
                    <span class="company-cell__wrap">
                        ${iconHtml}
                        <span class="name-text account-name">${org.name}</span>
                        ${org.linkedin ? `<a href="${org.linkedin}" target="_blank" class="linkedin-icon-small" title="LinkedIn">in</a>` : ''}
                    </span>
                </td>
                <td>${org.industry || '-'}</td>
                <td>${org.location || '-'}</td>
                <td>${formatEmployees(org.employees)}</td>
                <td>${org.website ? `<a href="${org.website}" target="_blank" class="text-link">${org.domain || 'Website'}</a>` : '-'}</td>
                <td>
                    <div class="qa-actions">
                        ${org.linkedin ? `<button type="button" class="qa-btn" data-action="linkedin" data-id="${org.id}" data-linkedin="${org.linkedin}" title="LinkedIn page" aria-label="LinkedIn page"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5z" transform="translate(4 4)"/><path d="M2 8h4v10H2z" transform="translate(4 4)"/><path d="M9 8h3v1.7c.6-1 1.6-1.7 3.2-1.7 3 0 4.8 2 4.8 5.6V18h-4v-3.7c0-1.4-.5-2.4-1.7-2.4-1 0-1.5.7-1.8 1.4-.1.2-.1.6-.1.9V18H9z" transform="translate(4 4)"/></svg></button>` : ''}
                        ${org.website ? `<button type="button" class="qa-btn" data-action="website" data-id="${org.id}" data-website="${org.website}" title="Company website" aria-label="Company website"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4"/><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 20"/></svg></button>` : ''}
                        <button type="button" class="qa-btn" data-action="save" data-id="${org.id}" title="Save Account" aria-label="Save Account"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg></button>
                    </div>
                </td>
            </tr>
        `}).join('');
        
        state.currentResults = orgs;
    }

    function updatePagination(pagination) {
        if (!pagination) {
            pagination = { page: 1, total_pages: 1, total_entries: 0 };
        }
        
        state.pagination.page = pagination.page;
        state.pagination.total_pages = pagination.total_pages;
        state.pagination.total_entries = pagination.total_entries || state.pagination.total_entries || 0;
        
        // Hide pagination if only 1 page
        if (state.pagination.total_pages <= 1) {
            elements.pagination.innerHTML = '';
        } else if (window.crm && typeof window.crm.createPagination === 'function') {
            window.crm.createPagination(pagination.page, pagination.total_pages, (page) => {
                changePage(page);
                try {
                    requestAnimationFrame(() => {
                        const scroller = elements.container ? elements.container.querySelector('.table-scroll') : null;
                        if (scroller && typeof scroller.scrollTo === 'function') scroller.scrollTo({ top: 0, behavior: 'auto' });
                        else if (scroller) scroller.scrollTop = 0;
                        window.scrollTo(0, 0);
                    });
                } catch (_) {}
            }, elements.pagination.id);
        } else {
            const current = pagination.page;
            const totalPages = pagination.total_pages;
            elements.pagination.innerHTML = `
            <div class="unified-pagination">
                <button class="pagination-arrow" ${current <= 1 ? 'disabled' : ''} onclick="ProspectingPage.changePage(${Math.max(1, current - 1)})" aria-label="Previous page">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"></polyline></svg>
                </button>
                <div class="pagination-current">${current} / ${totalPages}</div>
                <button class="pagination-arrow" ${current >= totalPages ? 'disabled' : ''} onclick="ProspectingPage.changePage(${Math.min(totalPages, current + 1)})" aria-label="Next page">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"></polyline></svg>
                </button>
            </div>`;
        }

        if (elements.paginationSummary) {
            const total = state.pagination.total_entries || 0;
            const page = state.pagination.page || 1;
            const size = state.pagination.per_page || 10;
            const start = total === 0 ? 0 : (page - 1) * size + 1;
            const end = total === 0 ? 0 : Math.min(total, page * size);
            const label = total === 1 ? 'organization' : 'organizations';
            elements.paginationSummary.textContent = `Showing ${start}\u2013${end} of ${total} ${label}`;
        }
    }

    function changePage(newPage) {
        if (newPage < 1 || newPage > state.pagination.total_pages) return;
        state.pagination.page = newPage;
        fetchResults();
    }

    async function savePerson(id) {
        const person = state.currentResults.find(p => p.id === id);
        if (!person) return;
        
        if (!confirm(`Import ${person.name} into CRM?`)) return;

        try {
            // Call existing contact creation API
            // Note: In a real implementation, we'd probably use a specific import endpoint
            // For now, we'll simulate it or use the generic contact create if available
            console.log('[Prospecting] Saving person:', person);
            alert(`Simulated import for ${person.name}. In production, this would call /api/contacts/create.`);
            
        } catch (error) {
            console.error('Import failed', error);
            alert('Import failed');
        }
    }
    
    async function saveOrganization(id) {
        const org = state.currentResults.find(o => o.id === id);
        if (!org) return;

        if (!confirm(`Import ${org.name} into CRM?`)) return;
        
        console.log('[Prospecting] Saving org:', org);
        alert(`Simulated import for ${org.name}.`);
    }

    // Public API
    return {
        init,
        changePage,
        savePerson,
        saveOrganization
    };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Check if we are on the prospecting page (hash check handled by router, but we can init logic)
    window.ProspectingPage = ProspectingPage;
    ProspectingPage.init();
});
