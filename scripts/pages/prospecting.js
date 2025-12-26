/**
 * Prospecting Page Logic
 * Handles Apollo search for People and Accounts
 */

const ProspectingPage = (function() {
    // State
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
        filtersContainer: null
    };

    function init() {
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
        elements.filtersContainer = document.getElementById('prospecting-filters');

        // Event Listeners
        elements.toggleBtns.forEach(btn => {
            btn.addEventListener('click', () => toggleView(btn.dataset.view));
        });

        elements.searchBtn.addEventListener('click', handleSearch);
        elements.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSearch();
        });

        // Initial render
        updateTableHeader();
    }

    function toggleView(viewType) {
        if (state.view === viewType) return;
        
        state.view = viewType;
        state.pagination.page = 1;
        state.searchQuery = '';
        elements.searchInput.value = '';
        elements.tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Use the search bar to find prospects</td></tr>';
        elements.pagination.innerHTML = '';

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

    async function fetchResults() {
        state.isLoading = true;
        elements.tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Loading...</td></tr>';

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
            elements.tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">No results found</td></tr>';
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
            elements.tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">No results found</td></tr>';
            return;
        }

        elements.tableBody.innerHTML = orgs.map(org => `
            <tr>
                <td>
                    <div class="user-info">
                        ${org.logoUrl ? `<img src="${org.logoUrl}" alt="" class="company-logo-small">` : `<div class="company-logo-small fallback">${org.name?.[0] || 'C'}</div>`}
                        <div>
                            <div class="user-name">${org.name}</div>
                            ${org.linkedin ? `<a href="${org.linkedin}" target="_blank" class="linkedin-icon-small">in</a>` : ''}
                        </div>
                    </div>
                </td>
                <td>${org.industry || '-'}</td>
                <td>${org.location || '-'}</td>
                <td>${org.employees || '-'} employees</td>
                <td>${org.website ? `<a href="${org.website}" target="_blank">${org.domain || 'Website'}</a>` : '-'}</td>
                <td>
                    <button class="btn-icon btn-save-prospect" onclick="ProspectingPage.saveOrganization('${org.id}')" title="Save Account">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                            <polyline points="17 21 17 13 7 13 7 21"></polyline>
                            <polyline points="7 3 7 8 15 8"></polyline>
                        </svg>
                    </button>
                </td>
            </tr>
        `).join('');
        
        state.currentResults = orgs;
    }

    function updatePagination(pagination) {
        if (!pagination) return;
        
        state.pagination.page = pagination.page;
        state.pagination.total_pages = pagination.total_pages;
        
        elements.pagination.innerHTML = `
            <button ${pagination.page <= 1 ? 'disabled' : ''} onclick="ProspectingPage.changePage(${pagination.page - 1})">Previous</button>
            <span>Page ${pagination.page} of ${pagination.total_pages}</span>
            <button ${pagination.page >= pagination.total_pages ? 'disabled' : ''} onclick="ProspectingPage.changePage(${pagination.page + 1})">Next</button>
        `;
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
