// Sequences Module - Rebuilt from scratch for reliability
const SequencesModule = {
    sequences: [],
    currentSequence: null,

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
            <style>
                .sequences-page-container {
                    padding: 20px;
                    max-width: 1200px;
                    margin: 0 auto;
                }
                .sequences-list {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    margin-top: 20px;
                }
                .sequence-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #2c3e50;
                    border: 1px solid #34495e;
                    border-radius: 8px;
                    padding: 20px;
                    transition: all 0.3s ease;
                }
                .sequence-item:hover {
                    background: #34495e;
                    border-color: #3498db;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(52, 152, 219, 0.2);
                }
                .sequence-main {
                    flex: 1;
                }
                .sequence-info h3 {
                    color: #fff;
                    margin: 0 0 8px 0;
                    font-size: 1.2rem;
                }
                .sequence-info p {
                    color: #bdc3c7;
                    margin: 0 0 12px 0;
                    font-size: 0.9rem;
                }
                .sequence-meta {
                    display: flex;
                    gap: 16px;
                    font-size: 0.8rem;
                    color: #95a5a6;
                }
                .sequence-status {
                    display: flex;
                    align-items: center;
                    gap: 20px;
                }
                .sequence-actions {
                    display: flex;
                    gap: 8px;
                }
                .status-toggle {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .status-label.active {
                    color: #27ae60;
                }
                .status-label.inactive {
                    color: #e74c3c;
                }
            </style>
            <div class="sequences-page-container">
                <!-- Header Section -->
                <div class="sequences-header">
                    <div class="header-left">
                        <h1 class="page-title">Sequences</h1>
                        <p class="page-subtitle">Manage your email sequences and automation</p>
                    </div>
                    <div class="header-right">
                        <button id="create-sequence-btn" class="btn-primary">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            New Sequence
                        </button>
                    </div>
                </div>

                <!-- Stats Cards -->
                <div class="sequences-stats">
                    <div class="stat-card">
                        <div class="stat-value">${this.sequences.length}</div>
                        <div class="stat-label">Total Sequences</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${this.sequences.filter(s => s.isActive).length}</div>
                        <div class="stat-label">Active</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${this.sequences.filter(s => !s.isActive).length}</div>
                        <div class="stat-label">Inactive</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${this.sequences.reduce((sum, s) => sum + (s.activeContacts || 0), 0)}</div>
                        <div class="stat-label">Total Contacts</div>
                    </div>
                </div>

                <!-- Search and Filters -->
                <div class="sequences-controls">
                    <input type="text" id="sequence-search" placeholder="Search sequences..." class="search-input" />
                    <div class="sequences-count">${this.sequences.length} sequences</div>
                </div>

                <!-- Sequences List -->
                <div class="sequences-list">
                    ${this.renderSequencesList()}
                </div>
            </div>
        `;

        sequencesView.innerHTML = sequencesHTML;
        
        // Add event listener for create button
        const createBtn = document.getElementById('create-sequence-btn');
        if (createBtn) {
            createBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Create sequence button clicked');
                this.showCreateSequenceModal();
            });
        }

        // Add event listeners for sequence items to make them clickable
        const sequenceItems = document.querySelectorAll('.sequence-item');
        sequenceItems.forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't trigger if clicking on buttons or toggles
                if (e.target.closest('button') || e.target.closest('.toggle-switch') || e.target.closest('input')) {
                    return;
                }
                
                const sequenceId = item.dataset.sequenceId;
                const sequence = this.sequences.find(s => s.id === sequenceId);
                
                if (sequence) {
                    console.log('Opening sequence builder for existing sequence:', sequence.name);
                    this.openSequenceBuilder(sequence);
                } else {
                    console.error('Sequence not found:', sequenceId);
                }
            });
            
            // Add hover effect
            item.addEventListener('mouseenter', () => {
                if (!item.querySelector(':hover')) {
                    item.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                }
            });
            
            item.addEventListener('mouseleave', () => {
                item.style.backgroundColor = '';
            });
        });

        console.log('New sequences page rendered with event listeners');
        this.showView('sequences-view');
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
                border-radius: 8px !important; 
                padding: 24px !important; 
                width: 90% !important; 
                max-width: 500px !important; 
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
        const sequence = this.sequences.find(s => s.id === sequenceId);
        if (sequence) {
            sequence.isActive = isActive;
            console.log(`Toggled sequence ${sequenceId} to ${isActive ? 'active' : 'inactive'}`);
            // Re-render to update stats
            this.renderSequencesPage();
            this.showNotification(`Sequence ${isActive ? 'activated' : 'deactivated'}`, 'success');
        }
    },

    // Edit sequence
    editSequence(sequenceId) {
        console.log('Edit sequence:', sequenceId);
        const sequence = this.sequences.find(s => s.id === sequenceId);
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
        if (confirm('Are you sure you want to delete this sequence?')) {
            this.sequences = this.sequences.filter(s => s.id !== sequenceId);
            this.renderSequencesPage();
            this.showNotification('Sequence deleted', 'success');
        }
    },

    // Show view helper
    showView(viewId) {
        console.log('Switching to view:', viewId);
        
        // Hide all views (try both .view and .page-view classes)
        const views = document.querySelectorAll('.view, .page-view');
        console.log('Found views to hide:', views.length);
        views.forEach(view => {
            console.log('Hiding view:', view.id, view.className);
            view.style.display = 'none';
        });
        
        // Show target view
        const targetView = document.getElementById(viewId);
        if (targetView) {
            targetView.style.display = 'flex';
            targetView.style.visibility = 'visible';
            targetView.style.opacity = '1';
            targetView.style.position = 'static';
            targetView.style.left = 'auto';
            targetView.style.top = 'auto';
            targetView.style.transform = 'none';
            console.log('Successfully switched to view:', viewId);
            console.log('Target view display:', targetView.style.display);
            console.log('Target view computed display:', window.getComputedStyle(targetView).display);
        } else {
            console.error('Target view not found:', viewId);
            console.log('Available elements with IDs:', Array.from(document.querySelectorAll('[id]')).map(el => el.id));
        }
    },

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

        // Create the sequence builder HTML with tabs and Apollo.io-inspired design
        builderView.innerHTML = `
            <div class="sequence-builder-container" style="
                background: #1e2329;
                min-height: 100vh;
                width: 100%;
                margin: 0;
                padding: 20px;
                box-sizing: border-box;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            ">
                <!-- Header -->
                <div class="builder-header" style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 30px;
                    background: #2c3e50;
                    padding: 20px;
                    border-radius: 8px;
                    border: 1px solid #34495e;
                ">
                    <div class="header-left">
                        <button id="back-to-sequences" style="
                            background: #34495e;
                            border: 1px solid #4a5568;
                            color: #bdc3c7;
                            padding: 8px 12px;
                            border-radius: 6px;
                            cursor: pointer;
                            margin-right: 15px;
                            font-size: 14px;
                            transition: all 0.3s ease;
                        ">← Back</button>
                        <h1 style="color: #fff; margin: 0; display: inline-block; font-size: 1.8rem; font-weight: 600;">${sequence.name}</h1>
                    </div>
                    <div class="header-right">
                        <button id="add-contacts-btn" style="
                            background: #3498db;
                            border: none;
                            color: white;
                            padding: 12px 24px;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: 500;
                            transition: all 0.3s ease;
                        ">+ Add Contacts</button>
                    </div>
                </div>

                <!-- Tab System -->
                <div class="builder-tabs" style="
                    display: flex;
                    background: #2c3e50;
                    border-radius: 8px;
                    padding: 6px;
                    margin-bottom: 30px;
                    border: 1px solid #34495e;
                ">
                    <button class="tab-btn active" data-tab="overview" style="
                        flex: 1;
                        padding: 12px 24px;
                        border: none;
                        background: #3498db;
                        color: white;
                        border-radius: 6px;
                        cursor: pointer;
                        font-weight: 500;
                        margin-right: 6px;
                        transition: all 0.3s ease;
                    ">Overview</button>
                    <button class="tab-btn" data-tab="contacts" style="
                        flex: 1;
                        padding: 12px 24px;
                        border: none;
                        background: transparent;
                        color: #bdc3c7;
                        border-radius: 6px;
                        cursor: pointer;
                        font-weight: 500;
                        transition: all 0.3s ease;
                    ">Contacts (${sequence.activeContacts || 0})</button>
                </div>

                <!-- Tab Content -->
                <div id="overview-tab" class="tab-content active">
                    ${this.renderOverviewTab(sequence)}
                </div>
                
                <div id="contacts-tab" class="tab-content" style="display: none;">
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
                <div class="inspirational-content" style="
                    text-align: center;
                    background: #2c3e50;
                    border-radius: 12px;
                    padding: 60px 40px;
                    border: 1px solid #34495e;
                    max-width: 600px;
                    margin: 0 auto;
                ">
                    <div style="
                        width: 120px;
                        height: 120px;
                        background: linear-gradient(45deg, #FF6B6B, #4ECDC4);
                        border-radius: 50%;
                        margin: 0 auto 30px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
                    ">
                        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                        </svg>
                    </div>
                    
                    <h2 style="
                        color: white;
                        font-size: 2.2rem;
                        font-weight: 700;
                        margin: 0 0 20px 0;
                        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                    ">⚡ AI-driven writing</h2>
                    
                    <h3 style="
                        color: white;
                        font-size: 1.6rem;
                        font-weight: 600;
                        margin: 0 0 15px 0;
                        opacity: 0.95;
                    ">Supercharge your workflow with sequences</h3>
                    
                    <p style="
                        color: rgba(255, 255, 255, 0.9);
                        font-size: 1.1rem;
                        line-height: 1.6;
                        margin: 0 0 40px 0;
                        max-width: 500px;
                        margin-left: auto;
                        margin-right: auto;
                    ">Harness the power of Power Choosers AI to create multi-step sequences that help you scale your outreach efforts, book more meetings, and close more deals.</p>
                    
                    <button id="add-step-btn" style="
                        background: #3498db;
                        border: none;
                        color: white;
                        padding: 16px 32px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 16px;
                        font-weight: 600;
                        transition: all 0.3s ease;
                        margin-top: 30px;
                    ">⚡ Add Step</button>
                </div>
            `;
        } else {
            // Show sequence steps when they exist
            return `
                <div class="sequence-steps" style="
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(10px);
                    border-radius: 16px;
                    padding: 30px;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
                        <h3 style="color: white; margin: 0; font-size: 1.4rem; font-weight: 600;">Sequence Steps</h3>
                        <button id="add-step-btn" style="
                            background: linear-gradient(45deg, #FF6B6B, #4ECDC4);
                            border: none;
                            color: white;
                            padding: 12px 24px;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: 500;
                        ">+ Add Step</button>
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
            <div class="sequence-step" style="
                background: rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 15px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                display: flex;
                align-items: center;
                gap: 15px;
            ">
                <div style="
                    width: 40px;
                    height: 40px;
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 18px;
                ">${stepIcons[step.type] || '⚡'}</div>
                
                <div style="flex: 1;">
                    <h4 style="color: white; margin: 0 0 5px 0; font-size: 1.1rem; font-weight: 500;">
                        Day ${index + 1}: ${step.name || this.getStepTypeName(step.type)}
                    </h4>
                    <p style="color: rgba(255, 255, 255, 0.8); margin: 0; font-size: 0.9rem;">
                        ${step.description || this.getStepTypeDescription(step.type)}
                    </p>
                    ${step.note ? `<p style="color: rgba(255, 255, 255, 0.6); margin: 5px 0 0 0; font-size: 0.8rem; font-style: italic;">Note: ${step.note}</p>` : ''}
                </div>
                
                <div style="display: flex; gap: 10px;">
                    <button class="edit-step-btn" data-step-index="${index}" style="
                        background: rgba(255, 255, 255, 0.2);
                        border: none;
                        color: white;
                        padding: 8px 12px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 12px;
                    ">Edit</button>
                    <button class="delete-step-btn" data-step-index="${index}" style="
                        background: rgba(255, 0, 0, 0.3);
                        border: none;
                        color: white;
                        padding: 8px 12px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 12px;
                    ">Delete</button>
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
            <div class="step-interval" style="
                display: flex;
                align-items: center;
                gap: 12px;
                margin: 8px 0 16px 56px; /* roughly aligns under content after the icon */
            ">
                <div style="flex: 1; height: 1px; background: rgba(255, 255, 255, 0.2);"></div>
                <div style="
                    background: rgba(52, 152, 219, 0.15);
                    border: 1px dashed rgba(52, 152, 219, 0.5);
                    color: #fff;
                    font-size: 12px;
                    padding: 6px 10px;
                    border-radius: 6px;
                    white-space: nowrap;
                ">⏱ ${label}</div>
                <div style="flex: 1; height: 1px; background: rgba(255, 255, 255, 0.2);"></div>
            </div>
        `;
    },

    // Render the contacts tab
    renderContactsTab(sequence) {
        return `
            <div class="contacts-content" style="
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                border-radius: 16px;
                padding: 30px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                text-align: center;
            ">
                <h3 style="color: white; margin: 0 0 20px 0; font-size: 1.4rem; font-weight: 600;">Contacts in Sequence</h3>
                <p style="color: rgba(255, 255, 255, 0.8); margin: 0 0 30px 0;">
                    Currently ${sequence.activeContacts || 0} contacts in this sequence
                </p>
                
                <button id="add-contacts-from-tab" style="
                    background: #4CAF50;
                    border: none;
                    color: white;
                    padding: 12px 24px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                ">+ Add Contacts</button>
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
                btn.style.background = 'rgba(255, 255, 255, 0.9)';
                btn.style.color = '#333';
            } else {
                btn.classList.remove('active');
                btn.style.background = 'transparent';
                btn.style.color = 'white';
            }
        });

        // Update tab content
        const tabContents = document.querySelectorAll('.tab-content');
        tabContents.forEach(content => {
            if (content.id === `${tabName}-tab`) {
                content.style.display = 'block';
                content.classList.add('active');
            } else {
                content.style.display = 'none';
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
