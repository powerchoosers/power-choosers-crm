// Sequences Module - Rebuilt from scratch for reliability
const SequencesModule = {
    sequences: [],
    currentSequence: null,
    // Pagination/search state for Sequences page (Apollo-like table)
    currentSequencesPage: 1,
    sequencesPageSize: 10,
    currentSequencesSearch: '',

    // Initialize the sequences module
    init() {
        console.log('Sequences module initialized');
        // Load sequences from storage if available
        this.loadSequences();
    },

    // Load sequences from Firebase via core module
    loadSequences() {
        // Get sequences from the core module (which loads from Firebase)
        if (window.CRMApp && window.CRMApp.sequences) {
            this.sequences = window.CRMApp.sequences;
            console.log('Loaded', this.sequences.length, 'sequences from Firebase');
        } else if (window.crmCore && window.crmCore.sequences) {
            // Fallback to old reference name
            this.sequences = window.crmCore.sequences;
            console.log('Loaded', this.sequences.length, 'sequences from Firebase (fallback)');
        } else {
            console.log('Core module not available or no sequences found');
            console.log('Available global objects:', Object.keys(window).filter(key => key.includes('CRM') || key.includes('crm')));
            this.sequences = [];
        }
    },

    // Render the main sequences page
    renderSequencesPage() {
        console.log("renderSequencesPage called");
        const sequencesView = document.getElementById('sequences-view');
        if (!sequencesView) {
            console.error('sequences-view element not found');
            return;
        }

        // Refresh sequences data from core module before rendering
        this.loadSequences();

        // Initialize sequences if not exists
        if (!this.sequences) {
            this.sequences = [];
        }

        console.log("Creating new sequences page HTML");
        const sequencesHTML = `
          <div class="sequences-page-container">
            <div class="seq-header">
              <div>
                <h2 class="page-title">Sequences</h2>
                <div class="seq-sub">Automate your outreach with multi-step flows</div>
              </div>
              <button id="new-sequence-btn" class="seq-btn seq-btn-primary">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                  <path d="M22 2L11 13"></path>
                  <path d="M22 2l-7 20-4-9-9-4 20-7z"></path>
                </svg>
                <span>New Sequence</span>
              </button>
            </div>

            <div class="seq-toolbar">
              <div class="left-tools" style="display:flex; align-items:center; gap:12px;">
                <div class="seq-search"><input id="sequences-search-input" type="text" placeholder="Search sequences..." /></div>
              </div>
              <div class="right-tools" style="display:flex; align-items:center; gap:12px;">
                <span class="seq-results"><span id="sequences-count">${this.sequences.length}</span> total</span>
              </div>
            </div>

            <div class="sequences-table-container">
              <table class="sequences-table">
                <thead>
                  <tr>
                    <th style="width: 40%">Name</th>
                    <th>Steps</th>
                    <th>Active Contacts</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="sequences-table-body"></tbody>
              </table>
            </div>

            <div class="seq-footer">
              <div class="seq-results" id="sequences-pagination-info"></div>
              <div class="sequences-pagination" style="display:flex; align-items:center;">
                <button id="sequences-prev-page" class="pagination-btn" title="Previous" aria-label="Previous">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <span id="sequences-pagination-numbers" style="display:inline-flex; align-items:center; margin: 0 6px;"></span>
                <button id="sequences-next-page" class="pagination-btn" title="Next" aria-label="Next">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
              </div>
            </div>
          </div>
        `;

        sequencesView.innerHTML = sequencesHTML;
        
        // Initialize the new table UI, search, and pagination
        this.initSequencesUI();

        console.log('Sequences page rendered (table with pagination)');
        // Note: Don't call showView here - it creates infinite loop with utils.js
    },

    // Initialize Sequences page interactions (search, pagination, delegated actions)
    initSequencesUI() {
        // Initial render
        this.renderSequencesTable(this.currentSequencesSearch);

        // Search input
        const searchInput = document.getElementById('sequences-search-input');
        if (searchInput) {
            searchInput.value = this.currentSequencesSearch || '';
            searchInput.addEventListener('input', this.debounce((e) => {
                this.currentSequencesSearch = e.target.value || '';
                this.currentSequencesPage = 1;
                this.renderSequencesTable(this.currentSequencesSearch);
            }, 300));
        }

        // New sequence button
        const newBtn = document.getElementById('new-sequence-btn');
        if (newBtn) newBtn.addEventListener('click', () => this.showCreateSequenceModal());

        // Delegated table actions
        const tbody = document.getElementById('sequences-table-body');
        if (tbody) {
            tbody.addEventListener('click', (e) => {
                const target = e.target.closest('button, tr');
                if (!target) return;
                // Ignore row open when clicking the active toggle or its label
                if (e.target.closest('.seq-active-toggle') || e.target.closest('label.toggle-switch')) {
                    e.stopPropagation();
                    return;
                }
                const row = target.closest('tr');
                const id = row?.getAttribute('data-sequence-id');
                if (!id) return;
                if (target.classList.contains('edit-sequence-btn')) { e.stopPropagation(); this.editSequence(id); return; }
                if (target.classList.contains('delete-sequence-btn')) { e.stopPropagation(); this.deleteSequence(id); return; }
                // Row click opens builder
                const seq = (this.sequences || []).find(s => String(s.id ?? s._id ?? s.docId ?? s.docID ?? s.uid) === String(id));
                if (seq) this.openSequenceBuilder(seq);
            });
            tbody.addEventListener('change', (e) => {
                const input = e.target;
                if (input && input.classList.contains('seq-active-toggle')) {
                    const row = input.closest('tr');
                    const id = row?.getAttribute('data-sequence-id');
                    if (id) this.toggleSequenceStatus(id, input.checked);
                    e.stopPropagation();
                }
            });
            // Keyboard support: Enter/Space on focused row opens builder (but not when focus is on toggle or action buttons)
            tbody.addEventListener('keydown', (e) => {
                const isEnter = e.key === 'Enter';
                const isSpace = e.key === ' ' || e.key === 'Spacebar';
                if (!isEnter && !isSpace) return;
                // Do not hijack space/enter when focusing interactive controls inside the row
                const active = document.activeElement;
                if (active && (active.tagName === 'INPUT' || active.closest('button') || active.closest('label.toggle-switch'))) {
                    return;
                }
                const row = (e.target.closest && e.target.closest('tr')) || (active && active.closest && active.closest('tr'));
                if (!row) return;
                const id = row.getAttribute('data-sequence-id');
                if (!id) return;
                e.preventDefault();
                const seq = (this.sequences || []).find(s => String(s.id ?? s._id ?? s.docId ?? s.docID ?? s.uid) === String(id));
                if (seq) this.openSequenceBuilder(seq);
            });
        }
    },

    // Filter sequences by search term
    getFilteredSequences(searchTerm = '') {
        const term = (searchTerm || '').toLowerCase().trim();
        if (!term) return this.sequences || [];
        return (this.sequences || []).filter(s => {
            const name = (s.name || '').toLowerCase();
            const desc = (s.description || '').toLowerCase();
            return name.includes(term) || desc.includes(term);
        });
    },

    // Render the sequences table body with pagination
    renderSequencesTable(searchTerm = '') {
        const tableBody = document.getElementById('sequences-table-body');
        const countEl = document.getElementById('sequences-count');
        if (!tableBody) return;

        const filtered = this.getFilteredSequences(searchTerm);
        const total = filtered.length;
        const pageSize = this.sequencesPageSize || 10;
        const pages = Math.max(1, Math.ceil(total / pageSize));
        if (!this.currentSequencesPage || this.currentSequencesPage < 1) this.currentSequencesPage = 1;
        if (this.currentSequencesPage > pages) this.currentSequencesPage = pages;
        const page = this.currentSequencesPage;
        const start = (page - 1) * pageSize;
        const end = Math.min(start + pageSize, total);
        const pageItems = filtered.slice(start, end);

        tableBody.innerHTML = '';
        if (pageItems.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:16px;">No sequences found</td></tr>`;
        } else {
            tableBody.innerHTML = pageItems.map(seq => this.getSequenceRowHTML(seq)).join('');
        }

        if (countEl) countEl.textContent = String(total);
        this.renderSequencesPagination(total, page, pageSize);
    },

    // Render pagination controls for sequences table
    renderSequencesPagination(total, page, pageSize) {
        const info = document.getElementById('sequences-pagination-info');
        const numbers = document.getElementById('sequences-pagination-numbers');
        const prevBtn = document.getElementById('sequences-prev-page');
        const nextBtn = document.getElementById('sequences-next-page');
        if (!info || !numbers || !prevBtn || !nextBtn) return;

        const pages = Math.max(1, Math.ceil(total / pageSize));
        const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
        const endItem = Math.min(page * pageSize, total);
        info.textContent = `Showing ${startItem}–${endItem} of ${total}`;

        // Page numbers
        numbers.innerHTML = '';
        const makeBtn = (p) => {
            const b = document.createElement('button');
            b.className = 'pagination-btn page-num' + (p === page ? ' active' : '');
            b.textContent = String(p);
            b.addEventListener('click', () => {
                this.currentSequencesPage = p;
                this.renderSequencesTable(document.getElementById('sequences-search-input')?.value || '');
            });
            return b;
        };

        const maxShown = 7;
        if (pages <= maxShown) {
            for (let p = 1; p <= pages; p++) numbers.appendChild(makeBtn(p));
        } else {
            const addEllipsis = () => {
                const ell = document.createElement('span');
                ell.textContent = '…';
                ell.style.color = '#9aa5b1';
                ell.style.padding = '0 6px';
                numbers.appendChild(ell);
            };
            numbers.appendChild(makeBtn(1));
            if (page > 3) addEllipsis();
            const start = Math.max(2, page - 1);
            const end = Math.min(pages - 1, page + 1);
            for (let p = start; p <= end; p++) numbers.appendChild(makeBtn(p));
            if (page < pages - 2) addEllipsis();
            numbers.appendChild(makeBtn(pages));
        }

        // Prev/Next
        prevBtn.disabled = page <= 1;
        nextBtn.disabled = page >= pages;
        prevBtn.onclick = () => {
            if (this.currentSequencesPage > 1) {
                this.currentSequencesPage--;
                this.renderSequencesTable(document.getElementById('sequences-search-input')?.value || '');
            }
        };
        nextBtn.onclick = () => {
            if (this.currentSequencesPage < pages) {
                this.currentSequencesPage++;
                this.renderSequencesTable(document.getElementById('sequences-search-input')?.value || '');
            }
        };
    },

    // Build a single table row for a sequence
    getSequenceRowHTML(sequence) {
        const steps = Array.isArray(sequence.steps) ? sequence.steps.length : 0;
        const active = sequence.activeContacts || 0;
        const created = this.formatDate(sequence.createdAt || sequence.created || sequence.created_at);
        const isActive = !!sequence.isActive;
        const desc = sequence.description || '';
        const name = sequence.name || 'Untitled';
        // Support various id property names and normalize to string for dataset
        const seqId = String(sequence.id ?? sequence._id ?? sequence.docId ?? sequence.docID ?? sequence.uid ?? '');
        return `
          <tr data-sequence-id="${seqId}" class="sequence-row" tabindex="0" role="button" aria-label="Open sequence builder for ${name}">
            <td class="col-name">
              <div class="name-with-toggle" style="display:flex; align-items:center; gap:10px;">
                <label class="toggle-switch" title="Activate sequence">
                  <input type="checkbox" class="seq-active-toggle" ${isActive ? 'checked' : ''} />
                  <span class="toggle-slider"></span>
                </label>
                <div class="title-wrap" style="display:flex; flex-direction:column; gap:2px;">
                  <div class="name">${name}</div>
                  ${desc ? `<div class=\"sub\">${desc}</div>` : ''}
                </div>
              </div>
            </td>
            <td class="col-steps">${steps}</td>
            <td class="col-contacts">${active}</td>
            <td class="col-created">${created}</td>
            <td class="row-actions">
              <button type="button" class="seq-btn-light edit-sequence-btn">Edit</button>
              <button type="button" class="seq-btn-light delete-sequence-btn">Delete</button>
            </td>
          </tr>
        `;
    },

    // Lightweight debounce utility bound to module context
    debounce(func, wait = 300) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    },

    // Render the sequences list
    renderSequencesList() {
        if (!this.sequences || this.sequences.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-icon">📧</div>
                    <h3>No sequences yet</h3>
                    <p>Create your first email sequence to get started</p>
                </div>
            `;
        }

        return this.sequences.map(sequence => {
            const sequenceHtml = `
                <div class="sequence-item" data-sequence-id="${sequence.id}" style="cursor: pointer;">
                    <div class="sequence-main">
                        <div class="sequence-info">
                            <h3 class="sequence-name">${sequence.name}</h3>
                            <p class="sequence-description">${sequence.description || 'No description'}</p>
                            <div class="sequence-meta">
                                <span class="sequence-steps">${sequence.steps ? sequence.steps.length : 0} steps</span>
                                <span class="sequence-contacts">${sequence.activeContacts || 0} contacts</span>
                                <span class="sequence-created">Created ${this.formatDate(sequence.created)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="sequence-status">
                        <div class="status-toggle">
                            <label class="toggle-switch">
                                <input type="checkbox" ${sequence.isActive ? 'checked' : ''} 
                                       onchange="SequencesModule.toggleSequenceStatus('${sequence.id}', this.checked)">
                                <span class="toggle-slider"></span>
                            </label>
                            <span class="status-label ${sequence.isActive ? 'active' : 'inactive'}">
                                ${sequence.isActive ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                        <div class="sequence-actions">
                            <button class="btn-secondary" onclick="SequencesModule.editSequence('${sequence.id}')">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                                Edit
                            </button>
                            <button class="btn-danger" onclick="SequencesModule.deleteSequence('${sequence.id}')">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3,6 5,6 21,6"></polyline>
                                    <path d="M19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"></path>
                                </svg>
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            `;
            return sequenceHtml;
        }).join('');
    },

    // Format date for display
    formatDate(dateString) {
        if (!dateString) return 'Unknown';
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) return 'Today';
        if (diffDays === 2) return 'Yesterday';
        if (diffDays <= 7) return `${diffDays - 1} days ago`;
        return date.toLocaleDateString();
    },

    // Create and show modal for new sequence
    showCreateSequenceModal() {
        console.log('Creating new sequence modal...');
        
        // Remove ALL existing modals first
        const existingModals = document.querySelectorAll('.modal-overlay');
        existingModals.forEach(modal => modal.remove());
        
        // Also remove any modals that might have different class names
        const allModals = document.querySelectorAll('[class*="modal"]');
        allModals.forEach(modal => {
            if (modal.style.position === 'fixed' || modal.style.zIndex) {
                modal.remove();
            }
        });

        // Create modal element with unique ID
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay sequence-modal';
        modalOverlay.id = 'sequence-create-modal';
        modalOverlay.style.cssText = `
            display: flex !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(0, 0, 0, 0.7) !important;
            z-index: 99999 !important;
            backdrop-filter: blur(4px) !important;
            align-items: center !important;
            justify-content: center !important;
            visibility: visible !important;
            opacity: 1 !important;
        `;

        // Create modal content
        modalOverlay.innerHTML = `
            <div class="modal-content" style="
                background: #2c3e50 !important; 
                border-radius: 16px !important; 
                padding: 24px !important; 
                width: 90% !important; 
                max-width: 500px !important; 
                max-height: 90vh !important;
                overflow-y: auto !important;
                position: relative !important;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5) !important;
                z-index: 100000 !important;
                margin: auto !important;
            ">
                <div class="modal-header" style="display: flex !important; justify-content: space-between !important; align-items: center !important; margin-bottom: 20px !important;">
                    <h3 style="color: #fff !important; margin: 0 !important; font-size: 1.2rem !important;">Create New Sequence</h3>
                    <button class="modal-close" style="background: none !important; border: none !important; color: #bdc3c7 !important; font-size: 24px !important; cursor: pointer !important; padding: 0 !important; width: 30px !important; height: 30px !important; display: flex !important; align-items: center !important; justify-content: center !important;">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="create-sequence-form">
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label for="sequence-name" style="display: block; color: #bdc3c7; margin-bottom: 8px; font-size: 0.9rem;">Sequence Name</label>
                            <input type="text" id="sequence-name" name="sequenceName" required 
                                   style="width: 100%; padding: 12px; border: 1px solid #34495e; border-radius: 4px; background: #34495e; color: #fff; font-size: 1rem; box-sizing: border-box;"
                                   placeholder="Enter sequence name">
                        </div>
                        <div class="form-group" style="margin-bottom: 24px;">
                            <label for="sequence-description" style="display: block; color: #bdc3c7; margin-bottom: 8px; font-size: 0.9rem;">Description (Optional)</label>
                            <textarea id="sequence-description" name="sequenceDescription" rows="3"
                                     style="width: 100%; padding: 12px; border: 1px solid #34495e; border-radius: 4px; background: #34495e; color: #fff; font-size: 1rem; resize: vertical; box-sizing: border-box;"
                                     placeholder="Describe your sequence"></textarea>
                        </div>
                        <div class="modal-actions" style="display: flex; gap: 12px; justify-content: flex-end;">
                            <button type="button" class="btn-cancel" style="padding: 10px 20px; border: 1px solid #7f8c8d; border-radius: 4px; background: transparent; color: #bdc3c7; cursor: pointer; font-size: 0.9rem;">Cancel</button>
                            <button type="submit" class="btn-primary" style="padding: 10px 20px; border: none; border-radius: 4px; background: #3498db; color: #fff; cursor: pointer; font-size: 0.9rem;">Create Sequence</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        // Add modal to body
        document.body.appendChild(modalOverlay);
        
        // Activate overlay to apply CSS animations and visibility
        modalOverlay.classList.add('active');
        
        // Force the modal to be visible with additional checks
        setTimeout(() => {
            modalOverlay.style.display = 'flex';
            modalOverlay.style.visibility = 'visible';
            modalOverlay.style.opacity = '1';
            modalOverlay.style.zIndex = '99999';
            console.log('Modal forced to be visible');
        }, 10);
        
        // Get modal elements
        const closeBtn = modalOverlay.querySelector('.modal-close');
        const cancelBtn = modalOverlay.querySelector('.btn-cancel');
        const form = modalOverlay.querySelector('#create-sequence-form');
        const nameInput = modalOverlay.querySelector('#sequence-name');

        console.log('Modal created and added to DOM');
        console.log('Modal element:', modalOverlay);
        console.log('Modal is visible:', modalOverlay.style.display);
        console.log('Modal computed style:', window.getComputedStyle(modalOverlay).display);
        console.log('Modal z-index:', window.getComputedStyle(modalOverlay).zIndex);
        console.log('Body children count:', document.body.children.length);
        console.log('Modal should now be visible');

        // Focus on name input
        setTimeout(() => {
            nameInput.focus();
            console.log('Input focused');
        }, 100);

        // Close modal handlers
        const closeModal = () => {
            console.log('Closing modal...');
            if (modalOverlay && modalOverlay.parentNode) {
                modalOverlay.remove();
            }
        };

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        
        // Close on overlay click
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeModal();
            }
        });

        // Handle form submission - capture 'this' context
        const self = this;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            console.log('Form submitted');
            
            const formData = new FormData(form);
            const sequenceName = formData.get('sequenceName').trim();
            const sequenceDescription = formData.get('sequenceDescription').trim();

            if (!sequenceName) {
                alert('Please enter a sequence name');
                return;
            }

            // Create new sequence
            const newSequence = {
                name: sequenceName,
                description: sequenceDescription || 'No description',
                steps: [],
                activeContacts: 0,
                isActive: true,
                createdAt: new Date()
            };

            console.log('Creating new sequence:', newSequence);

            // Save to Firebase
            if (typeof db !== 'undefined') {
                db.collection('sequences').add(newSequence)
                    .then((docRef) => {
                        console.log('Sequence saved to Firebase with ID:', docRef.id);
                        
                        // Add to local array with Firebase ID
                        const sequenceWithId = { id: docRef.id, ...newSequence };
                        self.sequences.push(sequenceWithId);
                        
                        // Also update the core module's sequences
                        if (window.crmCore) {
                            window.crmCore.sequences.push(sequenceWithId);
                        }
                        
                        // Close modal and open sequence builder
                        closeModal();
                        
                        // Open the sequence builder for the new sequence
                        console.log('Opening sequence builder with context:', self);
                        self.openSequenceBuilder(sequenceWithId);
                        
                        // Show success message
                        self.showNotification('Sequence created successfully!', 'success');
                    })
                    .catch((error) => {
                        console.error('Error saving sequence to Firebase:', error);
                        self.showNotification('Error saving sequence. Please try again.', 'error');
                    });
            } else {
                // Fallback if Firebase not available
                const sequenceWithId = { id: 'seq_' + Date.now(), ...newSequence };
                self.sequences.push(sequenceWithId);
                
                closeModal();
                
                // Open the sequence builder for the new sequence
                console.log('Opening sequence builder with context (offline):', self);
                self.openSequenceBuilder(sequenceWithId);
                
                self.showNotification('Sequence created (offline mode)', 'success');
            }
        });

        // Prevent modal from closing when clicking inside content
        modalOverlay.querySelector('.modal-content').addEventListener('click', (e) => {
            e.stopPropagation();
        });

        console.log('Modal should now be visible');
    },

    // Toggle sequence status
    toggleSequenceStatus(sequenceId, isActive) {
        const sequence = (this.sequences || []).find(s => String(s.id ?? s._id ?? s.docId ?? s.docID ?? s.uid) === String(sequenceId));
        if (!sequence) return;
        sequence.isActive = isActive;
        console.log(`Toggled sequence ${sequenceId} to ${isActive ? 'active' : 'inactive'}`);
        // Re-render only the table to preserve pagination/search
        this.renderSequencesTable(document.getElementById('sequences-search-input')?.value || '');
        this.showNotification(`Sequence ${isActive ? 'activated' : 'deactivated'}`, 'success');
    },

    // Edit sequence
    editSequence(sequenceId) {
        console.log('Edit sequence:', sequenceId);
        const sequence = (this.sequences || []).find(s => String(s.id ?? s._id ?? s.docId ?? s.docID ?? s.uid) === String(sequenceId));
        if (sequence) {
            console.log('Opening sequence builder for editing:', sequence.name);
            this.openSequenceBuilder(sequence);
        } else {
            console.error('Sequence not found for editing:', sequenceId);
            this.showNotification('Sequence not found', 'error');
        }
    },

    // Delete sequence
    deleteSequence(sequenceId) {
        if (!confirm('Are you sure you want to delete this sequence?')) return;
        // Find canonical id string to filter reliably regardless of id property type
        const target = (this.sequences || []).find(s => String(s.id ?? s._id ?? s.docId ?? s.docID ?? s.uid) === String(sequenceId));
        const canonicalId = target ? String(target.id ?? target._id ?? target.docId ?? target.docID ?? target.uid) : String(sequenceId);
        this.sequences = (this.sequences || []).filter(s => String(s.id ?? s._id ?? s.docId ?? s.docID ?? s.uid) !== canonicalId);
        // Keep current page within bounds after deletion
        const total = (this.getFilteredSequences(this.currentSequencesSearch) || []).length;
        const pages = Math.max(1, Math.ceil(total / this.sequencesPageSize));
        if (this.currentSequencesPage > pages) this.currentSequencesPage = pages;
        this.renderSequencesTable(document.getElementById('sequences-search-input')?.value || '');
        this.showNotification('Sequence deleted', 'success');
    },

    // Use global showView method instead of custom one
    showView(viewId) {
        console.log('SequencesModule: Delegating to global showView:', viewId);
        
        // Clear any !important styles that might interfere with global navigation
        const views = document.querySelectorAll('.view, .page-view');
        views.forEach(view => {
            // Remove any !important overrides that might block global navigation
            view.style.removeProperty('display');
            view.style.removeProperty('visibility');
            view.style.removeProperty('opacity');
            view.style.removeProperty('pointer-events');
            view.style.removeProperty('position');
            view.style.removeProperty('z-index');
            view.style.removeProperty('left');
            view.style.removeProperty('top');
            view.style.removeProperty('transform');
        });
        
        // Use the global CRMApp showView method
        if (window.CRMApp && window.CRMApp.showView) {
            window.CRMApp.showView(viewId);
        } else {
            console.error('Global CRMApp.showView not available');
        }
    }
,

    // Open sequence builder for a specific sequence
    openSequenceBuilder(sequence) {
        console.log('Opening sequence builder for:', sequence);
        this.currentSequence = sequence;
        
        // Switch to sequence builder view
        this.showView('sequence-builder-view');
        
        // Render the sequence builder
        this.renderSequenceBuilder(sequence);
    },

    // Render the sequence builder with Apollo.io-inspired design and Power Choosers twist
    renderSequenceBuilder(sequence) {
        console.log('Rendering sequence builder for:', sequence.name);
        console.log('Sequence object:', sequence);
        
        const builderView = document.getElementById('sequence-builder-view');
        if (!builderView) {
            console.error('sequence-builder-view element not found');
            console.log('All elements with sequence in ID:', Array.from(document.querySelectorAll('[id*="sequence"]')).map(el => el.id));
            return;
        }
        
        console.log('Found builder view element:', builderView);
        console.log('Builder view current display:', builderView.style.display);
        console.log('Builder view computed display:', window.getComputedStyle(builderView).display);

        // Create the sequence builder HTML with tabs and themed classes
        builderView.innerHTML = `
            <div class="sequence-builder-container">
                <!-- Header -->
                <div class="builder-header">
                    <div class="header-left">
                        <button id="back-to-sequences" class="btn-back">← Back</button>
                        <h1 class="builder-title">${sequence.name}</h1>
                    </div>
                    <div class="header-right">
                        <button id="add-contacts-btn" class="btn-primary">+ Add Contacts</button>
                    </div>
                </div>

                <!-- Tab System -->
                <div class="builder-tabs">
                    <button class="tab-btn active" data-tab="overview">Overview</button>
                    <button class="tab-btn" data-tab="contacts">Contacts (${sequence.activeContacts || 0})</button>
                </div>

                <!-- Tab Content -->
                <div id="overview-tab" class="tab-content active">
                    ${this.renderOverviewTab(sequence)}
                </div>
                
                <div id="contacts-tab" class="tab-content">
                    ${this.renderContactsTab(sequence)}
                </div>
            </div>
        `;

        // Add event listeners
        this.attachBuilderEventListeners(sequence);
    },

    // Render the overview tab with Apollo.io-inspired design
    renderOverviewTab(sequence) {
        const hasSteps = sequence.steps && sequence.steps.length > 0;
        
        if (!hasSteps) {
            // Show inspirational content when no steps exist
            return `
                <div class="sequence-intro">
                    <div class="intro-icon">
                        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                        </svg>
                    </div>
                    <h2 class="intro-title">⚡ AI-driven writing</h2>
                    <h3 class="intro-subtitle">Supercharge your workflow with sequences</h3>
                    <p class="intro-desc">Harness the power of Power Choosers AI to create multi-step sequences that help you scale your outreach efforts, book more meetings, and close more deals.</p>
                    <button id="add-step-btn" class="btn-accent">⚡ Add Step</button>
                </div>
            `;
        } else {
            // Show sequence steps when they exist
            return `
                <div class="sequence-steps">
                    <div class="steps-header">
                        <h3 class="steps-title">Sequence Steps</h3>
                        <button id="add-step-btn" class="btn-accent btn-sm">+ Add Step</button>
                    </div>
                    <div class="steps-list">
                        ${sequence.steps.map((step, index) => `
                            ${this.renderSequenceStep(step, index)}
                            ${index < sequence.steps.length - 1 ? this.renderStepInterval(sequence.steps[index], sequence.steps[index + 1], index) : ''}
                        `).join('')}
                    </div>
                </div>
            `;
        }
    },

    // Render individual sequence step
    renderSequenceStep(step, index) {
        const stepIcons = {
            'automatic-email': '📧',
            'manual-email': '✍️',
            'phone-call': '📞',
            'action-item': '✅',
            'linkedin-connection': '🔗',
            'linkedin-message': '💬',
            'linkedin-profile': '👤',
            'linkedin-interact': '👍'
        };

        return `
            <div class="sequence-step">
                <div class="step-icon">${stepIcons[step.type] || '⚡'}</div>
                
                <div class="step-body">
                    <h4 class="step-title">
                        Day ${index + 1}: ${step.name || this.getStepTypeName(step.type)}
                    </h4>
                    <p class="step-desc">
                        ${step.description || this.getStepTypeDescription(step.type)}
                    </p>
                    ${step.note ? `<p class="step-note">Note: ${step.note}</p>` : ''}
                </div>
                
                <div class="step-actions">
                    <button class="edit-step-btn btn-secondary btn-sm" data-step-index="${index}">Edit</button>
                    <button class="delete-step-btn btn-danger btn-sm" data-step-index="${index}">Delete</button>
                </div>
            </div>
        `;
    },

    // Render the visual interval indicator between two steps
    renderStepInterval(prevStep, nextStep, index) {
        // Determine label based on next step's timing
        let label = 'Immediately after last step';
        if (nextStep && nextStep.startTiming === 'delayed' && nextStep.delay && Number(nextStep.delay.amount) > 0) {
            const amount = Number(nextStep.delay.amount);
            const unit = String(nextStep.delay.unit || '').toLowerCase();
            // Normalize unit pluralization
            const plural = amount === 1 ? unit.replace(/s$/, '') : (unit.endsWith('s') ? unit : unit + 's');
            label = `Wait ${amount} ${plural}`;
        } else if (nextStep && nextStep.startTiming === 'immediate') {
            label = 'Immediately after last step';
        }

        return `
            <div class="step-interval">
                <div class="line"></div>
                <div class="label">⏱ ${label}</div>
                <div class="line"></div>
            </div>
        `;
    },

    // Render the contacts tab
    renderContactsTab(sequence) {
        return `
            <div class="contacts-content">
                <h3 class="contacts-title">Contacts in Sequence</h3>
                <p class="contacts-sub">Currently ${sequence.activeContacts || 0} contacts in this sequence</p>
                <button id="add-contacts-from-tab" class="btn-accent">+ Add Contacts</button>
            </div>
        `;
    },

    // Get step type display name
    getStepTypeName(type) {
        const names = {
            'automatic-email': 'Automatic Email',
            'manual-email': 'Manual Email',
            'phone-call': 'Phone Call',
            'action-item': 'Action Item',
            'linkedin-connection': 'LinkedIn Connection Request',
            'linkedin-message': 'LinkedIn Message',
            'linkedin-profile': 'LinkedIn Profile View',
            'linkedin-interact': 'LinkedIn Post Interaction'
        };
        return names[type] || 'Custom Step';
    },

    // Get step type description
    getStepTypeDescription(type) {
        const descriptions = {
            'automatic-email': 'AI-generated template',
            'manual-email': 'Personalized with AI',
            'phone-call': 'Task is created to call prospect',
            'action-item': 'Task is created to perform custom action',
            'linkedin-connection': 'Send personalized invitations to connect',
            'linkedin-message': 'Send personalized direct messages',
            'linkedin-profile': 'View contact\'s LinkedIn profile',
            'linkedin-interact': 'Interact with their recent posts'
        };
        return descriptions[type] || 'Custom action';
    },

    // Switch tabs in the sequence builder
    switchTab(tabName) {
        // Update tab buttons
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update tab content
        const tabContents = document.querySelectorAll('.tab-content');
        tabContents.forEach(content => {
            if (content.id === `${tabName}-tab`) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });
    },

    // Attach event listeners for the sequence builder
    attachBuilderEventListeners(sequence) {
        // Back button
        const backBtn = document.getElementById('back-to-sequences');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.showView('sequences-view');
                this.renderSequencesPage();
            });
        }

        // Tab switching
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Add step button
        const addStepBtn = document.getElementById('add-step-btn');
        if (addStepBtn) {
            addStepBtn.addEventListener('click', () => {
                this.showAddStepModal(sequence);
            });
        }

        // Add contacts buttons
        const addContactsBtns = document.querySelectorAll('#add-contacts-btn, #add-contacts-from-tab');
        addContactsBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.showNotification('Add Contacts functionality coming soon!', 'info');
            });
        });

        // Step edit/delete buttons
        const editBtns = document.querySelectorAll('.edit-step-btn');
        const deleteBtns = document.querySelectorAll('.delete-step-btn');
        
        editBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const stepIndex = parseInt(e.target.dataset.stepIndex);
                this.editSequenceStep(sequence, stepIndex);
            });
        });
        
        deleteBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const stepIndex = parseInt(e.target.dataset.stepIndex);
                this.deleteSequenceStep(sequence, stepIndex);
            });
        });
    },

    // Show the Add Step modal (two-step process)
    showAddStepModal(sequence) {
        console.log('Showing add step modal for sequence:', sequence.name);
        
        // Remove any existing modals
        const existingModals = document.querySelectorAll('.modal-overlay');
        existingModals.forEach(modal => modal.remove());

        // Create modal overlay
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay step-modal';
        modalOverlay.style.cssText = `
            display: flex !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(0, 0, 0, 0.8) !important;
            z-index: 99999 !important;
            backdrop-filter: blur(8px) !important;
            align-items: center !important;
            justify-content: center !important;
            visibility: visible !important;
            opacity: 1 !important;
        `;

        // Step 1: Step selection
        modalOverlay.innerHTML = this.renderStepSelectionModal(sequence);
        
        document.body.appendChild(modalOverlay);
        
        // Activate overlay to apply CSS visibility/transform rules
        modalOverlay.classList.add('active');
        
        // Add event listeners
        this.attachStepModalListeners(modalOverlay, sequence);
    },

    // Render the step selection modal (Step 1)
    renderStepSelectionModal(sequence) {
        return `
            <div class="modal-content" style="
                background: #2c3e50 !important;
                border-radius: 16px !important;
                padding: 0 !important;
                width: 90% !important;
                max-width: 700px !important;
                max-height: 90vh !important;
                overflow-y: auto !important;
                position: relative !important;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5) !important;
            ">
                <!-- Header -->
                <div style="
                    padding: 24px 32px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <div>
                        <h2 style="color: #fff; margin: 0 0 8px 0; font-size: 1.5rem; font-weight: 600;">Select a sequence step</h2>
                        <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 0.9rem;">Add a step for the sequence to follow and automate for you.</p>
                    </div>
                    <button class="modal-close" style="
                        background: none;
                        border: none;
                        color: #bdc3c7;
                        font-size: 24px;
                        cursor: pointer;
                        width: 36px;
                        height: 36px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 4px;
                        transition: background 0.2s;
                    ">&times;</button>
                </div>

                <!-- Content -->
                <div style="padding: 32px;">
                    <!-- Automatic Section -->
                    <div style="margin-bottom: 32px;">
                        <h3 style="color: #fff; margin: 0 0 16px 0; font-size: 1.1rem; font-weight: 500;">Automatic</h3>
                        
                        <div class="step-option" data-step-type="automatic-email" style="
                            background: rgba(255, 255, 255, 0.05);
                            border: 1px solid rgba(255, 255, 255, 0.1);
                            border-radius: 12px;
                            padding: 20px;
                            margin-bottom: 12px;
                            cursor: pointer;
                            transition: all 0.3s ease;
                            display: flex;
                            align-items: center;
                            gap: 16px;
                        ">
                            <div style="
                                width: 48px;
                                height: 48px;
                                background: linear-gradient(45deg, #3498db, #2980b9);
                                border-radius: 12px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-size: 20px;
                            ">📧</div>
                            <div style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                    <h4 style="color: #fff; margin: 0; font-size: 1rem; font-weight: 500;">Automatic email</h4>
                                    <span style="
                                        background: linear-gradient(45deg, #e74c3c, #c0392b);
                                        color: white;
                                        padding: 2px 8px;
                                        border-radius: 12px;
                                        font-size: 0.7rem;
                                        font-weight: 500;
                                        text-transform: uppercase;
                                    ">AI available!</span>
                                </div>
                                <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 0.85rem;">Sends automatically to the prospect based on the schedule—no action needed.</p>
                            </div>
                        </div>
                    </div>

                    <!-- Tasks Section -->
                    <div style="margin-bottom: 32px;">
                        <h3 style="color: #fff; margin: 0 0 16px 0; font-size: 1.1rem; font-weight: 500;">Tasks</h3>
                        
                        <div class="step-option" data-step-type="manual-email" style="
                            background: rgba(255, 255, 255, 0.05);
                            border: 1px solid rgba(255, 255, 255, 0.1);
                            border-radius: 12px;
                            padding: 20px;
                            margin-bottom: 12px;
                            cursor: pointer;
                            transition: all 0.3s ease;
                            display: flex;
                            align-items: center;
                            gap: 16px;
                        ">
                            <div style="
                                width: 48px;
                                height: 48px;
                                background: linear-gradient(45deg, #9b59b6, #8e44ad);
                                border-radius: 12px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-size: 20px;
                            ">✍️</div>
                            <div style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                    <h4 style="color: #fff; margin: 0; font-size: 1rem; font-weight: 500;">Manual email</h4>
                                    <span style="
                                        background: linear-gradient(45deg, #e74c3c, #c0392b);
                                        color: white;
                                        padding: 2px 8px;
                                        border-radius: 12px;
                                        font-size: 0.7rem;
                                        font-weight: 500;
                                        text-transform: uppercase;
                                    ">AI available!</span>
                                </div>
                                <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 0.85rem;">Creates a draft for your review—you'll send it when ready.</p>
                            </div>
                        </div>

                        <div class="step-option" data-step-type="phone-call" style="
                            background: rgba(255, 255, 255, 0.05);
                            border: 1px solid rgba(255, 255, 255, 0.1);
                            border-radius: 12px;
                            padding: 20px;
                            margin-bottom: 12px;
                            cursor: pointer;
                            transition: all 0.3s ease;
                            display: flex;
                            align-items: center;
                            gap: 16px;
                        ">
                            <div style="
                                width: 48px;
                                height: 48px;
                                background: linear-gradient(45deg, #e67e22, #d35400);
                                border-radius: 12px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-size: 20px;
                            ">📞</div>
                            <div style="flex: 1;">
                                <h4 style="color: #fff; margin: 0 0 4px 0; font-size: 1rem; font-weight: 500;">Phone call</h4>
                                <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 0.85rem;">Task is created to call prospect.</p>
                            </div>
                        </div>

                        <div class="step-option" data-step-type="action-item" style="
                            background: rgba(255, 255, 255, 0.05);
                            border: 1px solid rgba(255, 255, 255, 0.1);
                            border-radius: 12px;
                            padding: 20px;
                            margin-bottom: 12px;
                            cursor: pointer;
                            transition: all 0.3s ease;
                            display: flex;
                            align-items: center;
                            gap: 16px;
                        ">
                            <div style="
                                width: 48px;
                                height: 48px;
                                background: linear-gradient(45deg, #f39c12, #e67e22);
                                border-radius: 12px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-size: 20px;
                            ">✅</div>
                            <div style="flex: 1;">
                                <h4 style="color: #fff; margin: 0 0 4px 0; font-size: 1rem; font-weight: 500;">Action item</h4>
                                <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 0.85rem;">Task is created to perform custom action.</p>
                            </div>
                        </div>
                    </div>

                    <!-- LinkedIn Tasks Section -->
                    <div>
                        <h3 style="color: #fff; margin: 0 0 16px 0; font-size: 1.1rem; font-weight: 500;">LinkedIn tasks</h3>
                        
                        <div class="step-option" data-step-type="linkedin-connection" style="
                            background: rgba(255, 255, 255, 0.05);
                            border: 1px solid rgba(255, 255, 255, 0.1);
                            border-radius: 12px;
                            padding: 20px;
                            margin-bottom: 12px;
                            cursor: pointer;
                            transition: all 0.3s ease;
                            display: flex;
                            align-items: center;
                            gap: 16px;
                        ">
                            <div style="
                                width: 48px;
                                height: 48px;
                                background: linear-gradient(45deg, #0077b5, #005885);
                                border-radius: 12px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-size: 20px;
                            ">🔗</div>
                            <div style="flex: 1;">
                                <h4 style="color: #fff; margin: 0 0 4px 0; font-size: 1rem; font-weight: 500;">LinkedIn - Send connection request</h4>
                                <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 0.85rem;">Send personalized invitations to connect with contacts for a positive first impression.</p>
                            </div>
                        </div>

                        <div class="step-option" data-step-type="linkedin-message" style="
                            background: rgba(255, 255, 255, 0.05);
                            border: 1px solid rgba(255, 255, 255, 0.1);
                            border-radius: 12px;
                            padding: 20px;
                            margin-bottom: 12px;
                            cursor: pointer;
                            transition: all 0.3s ease;
                            display: flex;
                            align-items: center;
                            gap: 16px;
                        ">
                            <div style="
                                width: 48px;
                                height: 48px;
                                background: linear-gradient(45deg, #0077b5, #005885);
                                border-radius: 12px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-size: 20px;
                            ">💬</div>
                            <div style="flex: 1;">
                                <h4 style="color: #fff; margin: 0 0 4px 0; font-size: 1rem; font-weight: 500;">LinkedIn - Send message</h4>
                                <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 0.85rem;">Send personalized direct messages to contacts you're connected with to build relationships.</p>
                            </div>
                        </div>

                        <div class="step-option" data-step-type="linkedin-profile" style="
                            background: rgba(255, 255, 255, 0.05);
                            border: 1px solid rgba(255, 255, 255, 0.1);
                            border-radius: 12px;
                            padding: 20px;
                            margin-bottom: 12px;
                            cursor: pointer;
                            transition: all 0.3s ease;
                            display: flex;
                            align-items: center;
                            gap: 16px;
                        ">
                            <div style="
                                width: 48px;
                                height: 48px;
                                background: linear-gradient(45deg, #0077b5, #005885);
                                border-radius: 12px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-size: 20px;
                            ">👤</div>
                            <div style="flex: 1;">
                                <h4 style="color: #fff; margin: 0 0 4px 0; font-size: 1rem; font-weight: 500;">LinkedIn - View profile</h4>
                                <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 0.85rem;">View a contact's LinkedIn profile to gather key information for more effective engagement.</p>
                            </div>
                        </div>

                        <div class="step-option" data-step-type="linkedin-interact" style="
                            background: rgba(255, 255, 255, 0.05);
                            border: 1px solid rgba(255, 255, 255, 0.1);
                            border-radius: 12px;
                            padding: 20px;
                            cursor: pointer;
                            transition: all 0.3s ease;
                            display: flex;
                            align-items: center;
                            gap: 16px;
                        ">
                            <div style="
                                width: 48px;
                                height: 48px;
                                background: linear-gradient(45deg, #0077b5, #005885);
                                border-radius: 12px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-size: 20px;
                            ">👍</div>
                            <div style="flex: 1;">
                                <h4 style="color: #fff; margin: 0 0 4px 0; font-size: 1rem; font-weight: 500;">LinkedIn - Interact with post</h4>
                                <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 0.85rem;">View a contact's activities and interact with their recent posts to foster engagement and boost visibility.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // Render the step configuration modal (Step 2)
    renderStepConfigurationModal(sequence, stepType) {
        const isFirstStep = !sequence.steps || sequence.steps.length === 0;
        const stepName = this.getStepTypeName(stepType);
        const stepDescription = this.getStepTypeDescription(stepType);
        
        return `
            <div class="modal-content" style="
                background: #2c3e50 !important;
                border-radius: 16px !important;
                padding: 0 !important;
                width: 90% !important;
                max-width: 600px !important;
                max-height: 90vh !important;
                overflow-y: auto !important;
                position: relative !important;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5) !important;
            ">
                <!-- Header -->
                <div style="
                    padding: 24px 32px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                ">
                    <div style="flex: 1;">
                        <h2 style="color: #fff; margin: 0 0 8px 0; font-size: 1.5rem; font-weight: 600;">Select a sequence step</h2>
                        <div style="
                            background: rgba(255, 255, 255, 0.1);
                            border-radius: 12px;
                            padding: 16px;
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            margin-bottom: 8px;
                        ">
                            <div style="
                                width: 32px;
                                height: 32px;
                                background: rgba(255, 255, 255, 0.2);
                                border-radius: 8px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-size: 16px;
                            ">${this.getStepIcon(stepType)}</div>
                            <div>
                                <h3 style="color: #fff; margin: 0; font-size: 1rem; font-weight: 500;">${stepName}</h3>
                                <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 0.85rem;">${stepDescription}</p>
                            </div>
                        </div>
                        <button id="change-step-btn" style="
                            background: rgba(255, 255, 255, 0.08);
                            border: 1px solid rgba(255, 255, 255, 0.2);
                            color: #fff;
                            width: 80px;
                            height: 36px;
                            display: inline-flex;
                            align-items: center;
                            justify-content: center;
                            border-radius: 6px;
                            cursor: pointer;
                            transition: background 0.2s ease, border-color 0.2s ease;
                            margin-top: 8px;
                            font-size: 12px;
                        " title="Change step" aria-label="Change step">Change</button>
                    </div>
                    <button class="modal-close" style="
                        background: none;
                        border: none;
                        color: #bdc3c7;
                        font-size: 24px;
                        cursor: pointer;
                        width: 36px;
                        height: 36px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 4px;
                        margin-left: 16px;
                        transition: background 0.2s;
                    ">&times;</button>
                </div>

                <!-- Content -->
                <div style="padding: 32px;">
                    <!-- When to start section -->
                    <div style="margin-bottom: 32px;">
                        <h3 style="color: #fff; margin: 0 0 16px 0; font-size: 1.1rem; font-weight: 500;">When to start this step:</h3>
                        
                        <div style="margin-bottom: 16px;">
                            <label style="
                                display: flex;
                                align-items: center;
                                gap: 12px;
                                cursor: pointer;
                                color: rgba(255, 255, 255, 0.9);
                                font-size: 0.9rem;
                            ">
                                <input type="radio" name="start-timing" value="immediate" ${isFirstStep ? 'checked' : ''} style="
                                    width: 16px;
                                    height: 16px;
                                    accent-color: #3498db;
                                ">
                                ${isFirstStep ? 'Immediately after the contact is added to sequence' : 'Immediately after the last step'}
                            </label>
                        </div>
                        
                        <div style="margin-bottom: 16px;">
                            <label style="
                                display: flex;
                                align-items: center;
                                gap: 12px;
                                cursor: pointer;
                                color: rgba(255, 255, 255, 0.9);
                                font-size: 0.9rem;
                            ">
                                <input type="radio" name="start-timing" value="delayed" ${!isFirstStep ? 'checked' : ''} style="
                                    width: 16px;
                                    height: 16px;
                                    accent-color: #3498db;
                                ">
                                <input type="number" id="delay-amount" value="30" min="1" style="
                                    width: 60px;
                                    padding: 8px;
                                    border: 1px solid rgba(255, 255, 255, 0.2);
                                    border-radius: 4px;
                                    background: rgba(255, 255, 255, 0.1);
                                    color: #fff;
                                    text-align: center;
                                ">
                                <select id="delay-unit" style="
                                    padding: 8px;
                                    border: 1px solid rgba(255, 255, 255, 0.2);
                                    border-radius: 4px;
                                    background: rgba(255, 255, 255, 0.1);
                                    color: #fff;
                                ">
                                    <option value="minutes">minutes</option>
                                    <option value="hours">hours</option>
                                    <option value="days">days</option>
                                    <option value="weeks">weeks</option>
                                </select>
                                after the ${isFirstStep ? 'contact is added' : 'last step'}
                            </label>
                        </div>
                    </div>

                    <!-- Priority section -->
                    <div style="margin-bottom: 32px;">
                        <h3 style="color: #fff; margin: 0 0 16px 0; font-size: 1.1rem; font-weight: 500;">Assign task priority</h3>
                        
                        <div style="display: flex; gap: 12px;">
                            <label style="
                                flex: 1;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                gap: 8px;
                                padding: 12px;
                                border: 2px solid rgba(255, 255, 255, 0.2);
                                border-radius: 8px;
                                cursor: pointer;
                                transition: all 0.3s ease;
                                color: rgba(255, 255, 255, 0.9);
                            ">
                                <input type="radio" name="priority" value="high" style="
                                    width: 16px;
                                    height: 16px;
                                    accent-color: #e74c3c;
                                ">
                                High priority
                            </label>
                            
                            <label style="
                                flex: 1;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                gap: 8px;
                                padding: 12px;
                                border: 2px solid #3498db;
                                border-radius: 8px;
                                cursor: pointer;
                                transition: all 0.3s ease;
                                color: #fff;
                                background: rgba(52, 152, 219, 0.1);
                            ">
                                <input type="radio" name="priority" value="medium" checked style="
                                    width: 16px;
                                    height: 16px;
                                    accent-color: #3498db;
                                ">
                                Medium priority
                            </label>
                            
                            <label style="
                                flex: 1;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                gap: 8px;
                                padding: 12px;
                                border: 2px solid rgba(255, 255, 255, 0.2);
                                border-radius: 8px;
                                cursor: pointer;
                                transition: all 0.3s ease;
                                color: rgba(255, 255, 255, 0.9);
                            ">
                                <input type="radio" name="priority" value="low" style="
                                    width: 16px;
                                    height: 16px;
                                    accent-color: #95a5a6;
                                ">
                                Low priority
                            </label>
                        </div>
                    </div>

                    <!-- Note section -->
                    <div style="margin-bottom: 32px;">
                        <h3 style="color: #fff; margin: 0 0 8px 0; font-size: 1.1rem; font-weight: 500;">Add note</h3>
                        <textarea id="step-note" placeholder="Add a description, purpose or goal for the task" style="
                            width: 100%;
                            height: 100px;
                            padding: 12px;
                            border: 1px solid rgba(255, 255, 255, 0.2);
                            border-radius: 8px;
                            background: rgba(255, 255, 255, 0.1);
                            color: #fff;
                            font-family: inherit;
                            font-size: 0.9rem;
                            resize: vertical;
                            box-sizing: border-box;
                        "></textarea>
                    </div>

                    <!-- Action buttons -->
                    <div style="display: flex; gap: 12px; justify-content: flex-end;">
                        <button id="cancel-step-btn" style="
                            background: rgba(255, 255, 255, 0.1);
                            border: 1px solid rgba(255, 255, 255, 0.2);
                            color: #fff;
                            padding: 12px 24px;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 0.9rem;
                        ">Cancel</button>
                        <button id="save-step-btn" style="
                            background: linear-gradient(45deg, #3498db, #2980b9);
                            border: none;
                            color: white;
                            padding: 12px 24px;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 0.9rem;
                            font-weight: 500;
                        ">Add Step</button>
                    </div>
                </div>
            </div>
        `;
    },

    // Get step icon
    getStepIcon(stepType) {
        const icons = {
            'automatic-email': '📧',
            'manual-email': '✍️',
            'phone-call': '📞',
            'action-item': '✅',
            'linkedin-connection': '🔗',
            'linkedin-message': '💬',
            'linkedin-profile': '👤',
            'linkedin-interact': '👍'
        };
        return icons[stepType] || '⚡';
    },

    // Attach event listeners for step modal
    attachStepModalListeners(modalOverlay, sequence) {
        // Close modal
        const closeBtn = modalOverlay.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modalOverlay.remove();
            });
        }

        // Close on overlay click
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
            }
        });

        // Step option selection
        const stepOptions = modalOverlay.querySelectorAll('.step-option');
        stepOptions.forEach(option => {
            option.addEventListener('click', () => {
                const stepType = option.dataset.stepType;
                this.showStepConfiguration(modalOverlay, sequence, stepType);
            });

            // Hover effects
            option.addEventListener('mouseenter', () => {
                option.style.background = 'rgba(255, 255, 255, 0.1)';
                option.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            });

            option.addEventListener('mouseleave', () => {
                option.style.background = 'rgba(255, 255, 255, 0.05)';
                option.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            });
        });
    },

    // Show step configuration (Step 2 of modal)
    showStepConfiguration(modalOverlay, sequence, stepType) {
        // Replace modal content with configuration form
        modalOverlay.innerHTML = this.renderStepConfigurationModal(sequence, stepType);
        
        // Attach configuration listeners
        this.attachStepConfigurationListeners(modalOverlay, sequence, stepType);
    },

    // Attach event listeners for step configuration
    attachStepConfigurationListeners(modalOverlay, sequence, stepType) {
        // Close modal
        const closeBtn = modalOverlay.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modalOverlay.remove();
            });
        }

        // Change step button
        const changeStepBtn = modalOverlay.querySelector('#change-step-btn');
        if (changeStepBtn) {
            changeStepBtn.addEventListener('click', () => {
                // Go back to step selection
                modalOverlay.innerHTML = this.renderStepSelectionModal(sequence);
                this.attachStepModalListeners(modalOverlay, sequence);
            });
        }

        // Cancel button
        const cancelBtn = modalOverlay.querySelector('#cancel-step-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                modalOverlay.remove();
            });
        }

        // Priority selection styling
        const priorityLabels = modalOverlay.querySelectorAll('input[name="priority"]');
        priorityLabels.forEach(input => {
            input.addEventListener('change', () => {
                // Reset all labels
                priorityLabels.forEach(p => {
                    const label = p.closest('label');
                    label.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                    label.style.background = 'transparent';
                });
                
                // Highlight selected
                const selectedLabel = input.closest('label');
                const priority = input.value;
                if (priority === 'high') {
                    selectedLabel.style.borderColor = '#e74c3c';
                    selectedLabel.style.background = 'rgba(231, 76, 60, 0.1)';
                } else if (priority === 'medium') {
                    selectedLabel.style.borderColor = '#3498db';
                    selectedLabel.style.background = 'rgba(52, 152, 219, 0.1)';
                } else {
                    selectedLabel.style.borderColor = '#95a5a6';
                    selectedLabel.style.background = 'rgba(149, 165, 166, 0.1)';
                }
            });
        });

        // Save step button
        const saveBtn = modalOverlay.querySelector('#save-step-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveSequenceStep(modalOverlay, sequence, stepType);
            });
        }
    },

    // Save the configured sequence step
    saveSequenceStep(modalOverlay, sequence, stepType) {
        // Get form values
        const startTiming = modalOverlay.querySelector('input[name="start-timing"]:checked').value;
        const delayAmount = modalOverlay.querySelector('#delay-amount').value;
        const delayUnit = modalOverlay.querySelector('#delay-unit').value;
        const priority = modalOverlay.querySelector('input[name="priority"]:checked').value;
        const note = modalOverlay.querySelector('#step-note').value;

        // Create step object
        const newStep = {
            type: stepType,
            name: this.getStepTypeName(stepType),
            description: this.getStepTypeDescription(stepType),
            startTiming: startTiming,
            delay: startTiming === 'delayed' ? {
                amount: parseInt(delayAmount),
                unit: delayUnit
            } : null,
            priority: priority,
            note: note.trim(),
            createdAt: new Date()
        };

        // Initialize steps array if needed
        if (!sequence.steps) {
            sequence.steps = [];
        }

        // Add step to sequence
        sequence.steps.push(newStep);

        // Save to Firebase if available
        if (typeof db !== 'undefined' && sequence.id) {
            db.collection('sequences').doc(sequence.id).update({
                steps: sequence.steps
            }).then(() => {
                console.log('Step saved to Firebase');
            }).catch((error) => {
                console.error('Error saving step to Firebase:', error);
            });
        }

        // Close modal
        modalOverlay.remove();

        // Refresh the sequence builder view
        this.renderSequenceBuilder(sequence);

        // Show success message
        this.showNotification(`${this.getStepTypeName(stepType)} step added successfully!`, 'success');
    },

    // Edit sequence step
    editSequenceStep(sequence, stepIndex) {
        this.showNotification('Edit step functionality coming soon!', 'info');
    },

    // Delete sequence step
    deleteSequenceStep(sequence, stepIndex) {
        if (confirm('Are you sure you want to delete this step?')) {
            sequence.steps.splice(stepIndex, 1);
            
            // Save to Firebase if available
            if (typeof db !== 'undefined' && sequence.id) {
                db.collection('sequences').doc(sequence.id).update({
                    steps: sequence.steps
                }).then(() => {
                    console.log('Step deleted from Firebase');
                }).catch((error) => {
                    console.error('Error deleting step from Firebase:', error);
                });
            }
            
            // Refresh the sequence builder view
            this.renderSequenceBuilder(sequence);
            
            this.showNotification('Step deleted successfully!', 'success');
        }
    },

    // Show notification helper
    showNotification(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        // For now, just use alert - can be enhanced later
        alert(message);
    }
};

// Initialize the module automatically when it loads
SequencesModule.init();

// Make it globally available
window.SequencesModule = SequencesModule;
