// Power Choosers CRM Dashboard - Sequences Module
// This module contains all sequences functionality

// Extend CRMApp with sequences functions
Object.assign(CRMApp, {
    // Store current sequence for reference
    currentSequence: null,

    // Open sequence builder for a specific sequence
    openSequenceBuilder(sequenceId) {
        console.log('Opening sequence builder for:', sequenceId);
        const sequence = this.sequences.find(s => s.id === sequenceId);
        if (sequence) {
            this.renderSequenceBuilderPage(sequence);
        } else {
            // Create new sequence
            const newSequence = {
                id: `seq_${Date.now()}`,
                name: 'New Sequence',
                description: 'New sequence description',
                status: 'draft',
                steps: [],
                contacts: [],
                activeContacts: 0,
                isActive: false,
                created: new Date().toISOString(),
                createdAt: new Date()
            };
            this.sequences.push(newSequence);
            this.renderSequenceBuilderPage(newSequence);
        }
    },

    // Render the sequences page - rebuilt from scratch
    renderSequencesPage() {
        console.log("renderSequencesPage called");
        const sequencesView = document.getElementById('sequences-view');
        if (!sequencesView) {
            console.error('sequences-view element not found');
            return;
        }

        // Initialize sequences if not exists
        if (!this.sequences) {
            this.sequences = [];
        }

        console.log("Creating new sequences page HTML");
        const sequencesHTML = `
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
                                <th style="padding: 15px; text-align: left; font-weight: 600; color: #fff; font-size: 14px;">Status</th>
                                <th style="padding: 15px; text-align: left; font-weight: 600; color: #fff; font-size: 14px;">Created</th>
                                <th style="padding: 15px; text-align: left; font-weight: 600; color: #fff; font-size: 14px;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="sequences-table-body">
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        sequencesView.innerHTML = sequencesHTML;
        
        // Apply layout styles
        sequencesView.style.cssText = `
            display: flex !important;
            flex-direction: column !important;
            height: calc(100vh - 120px) !important;
            background: #1a1a1a !important;
            color: #fff !important;
            margin-top: 32px !important;
            padding: 20px !important;
            border-radius: 20px !important;
            overflow: hidden !important;
        `;

        // Initialize sequences functionality
        this.initSequencesData();
        this.renderSequencesTable();
    },

    initSequencesData() {
        if (!this.sequences || this.sequences.length === 0) {
            this.sequences = this.generateSampleSequences();
        }
    },

    generateSampleSequences() {
        return [
            {
                id: 'seq1',
                name: 'New Lead Follow-up',
                description: 'Automated follow-up sequence for new leads',
                steps: 5,
                activeContacts: 12,
                isActive: true,
                createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            },
            {
                id: 'seq2',
                name: 'Demo Request Follow-up',
                description: 'Follow-up sequence for demo requests',
                steps: 3,
                activeContacts: 8,
                isActive: true,
                createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
            },
            {
                id: 'seq3',
                name: 'Cold Outreach - Energy Companies',
                description: 'Cold outreach sequence for energy companies',
                steps: 7,
                activeContacts: 25,
                isActive: false,
                createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000)
            }
        ];
    },

    renderSequencesTable() {
        const tableBody = document.getElementById('sequences-table-body');
        const sequencesCount = document.getElementById('sequences-count');
        
        if (!tableBody || !sequencesCount) return;
        
        // Update sequences count
        sequencesCount.textContent = `${this.sequences.length} sequence${this.sequences.length !== 1 ? 's' : ''}`;
        
        // Clear existing rows
        tableBody.innerHTML = '';
        
        if (this.sequences.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="
                        padding: 40px;
                        text-align: center;
                        color: #999;
                        font-style: italic;
                    ">No sequences found</td>
                </tr>
            `;
            return;
        }
        
        // Render sequence rows
        this.sequences.forEach(sequence => {
            const row = document.createElement('tr');
            row.style.cssText = `
                border-bottom: 1px solid #333;
                transition: background-color 0.2s ease;
                cursor: pointer;
            `;
            row.onmouseover = () => row.style.backgroundColor = '#2a2a2a';
            row.onmouseout = () => row.style.backgroundColor = 'transparent';
            
            row.innerHTML = `
                <td style="padding: 15px; color: #fff;">
                    <div style="font-weight: 600; margin-bottom: 4px;">${sequence.name}</div>
                    <div style="font-size: 12px; color: #999;">${sequence.description || 'No description'}</div>
                </td>
                <td style="padding: 15px; color: #ccc;">${sequence.steps}</td>
                <td style="padding: 15px; color: #ccc;">${sequence.activeContacts}</td>
                <td style="padding: 15px;">
                    <span style="
                        background: ${sequence.isActive ? '#28a745' : '#6c757d'};
                        color: white;
                        padding: 4px 8px;
                        border-radius: 12px;
                        font-size: 12px;
                        font-weight: 600;
                    ">${sequence.isActive ? 'Active' : 'Inactive'}</span>
                </td>
                <td style="padding: 15px; color: #ccc;">${sequence.createdAt.toLocaleDateString()}</td>
                <td style="padding: 15px;">
                    <div style="display: flex; gap: 8px;">
                        <button onclick="CRMApp.openSequenceBuilder('${sequence.id}')" style="
                            background: #007bff;
                            border: none;
                            color: white;
                            padding: 6px 12px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                            transition: background-color 0.2s ease;
                        " onmouseover="this.style.backgroundColor='#0056b3'" 
                           onmouseout="this.style.backgroundColor='#007bff'">
                            Edit
                        </button>
                        <button onclick="CRMApp.toggleSequence('${sequence.id}')" style="
                            background: ${sequence.isActive ? '#dc3545' : '#28a745'};
                            border: none;
                            color: white;
                            padding: 6px 12px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                            transition: background-color 0.2s ease;
                        ">
                            ${sequence.isActive ? 'Pause' : 'Activate'}
                        </button>
                    </div>
                </td>
            `;
            
            tableBody.appendChild(row);
        });
    },

    createNewSequence(event) {
        console.log('Creating new sequence');
        // Prevent event bubbling that might cause page re-render
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        this.showCreateSequenceModal();
    },

    showCreateSequenceModal() {
        console.log('Showing create sequence modal');
        
        // Always remove any existing modal first to ensure clean state
        const existingModal = document.getElementById('create-sequence-modal');
        if (existingModal) {
            existingModal.remove();
            console.log('Removed existing modal');
        }
        
        // Create modal HTML - Step 1: Name and Description
        const modalHTML = `
            <div class="modal-overlay" id="create-sequence-modal" style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
                backdrop-filter: blur(5px);
            ">
                <div class="modal-content" style="
                    background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                    border-radius: 20px;
                    border: 1px solid #333;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                    padding: 32px;
                    width: 90%;
                    max-width: 500px;
                    color: #fff;
                    position: relative;
                ">
                    <button onclick="CRMApp.closeCreateSequenceModal()" style="
                        position: absolute;
                        top: 16px;
                        right: 16px;
                        background: rgba(255, 255, 255, 0.1);
                        border: 1px solid #555;
                        color: #fff;
                        width: 32px;
                        height: 32px;
                        border-radius: 50%;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 18px;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.background='rgba(255, 255, 255, 0.2)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'">
                        ×
                    </button>
                    
                    <div class="modal-header" style="text-align: center; margin-bottom: 32px;">
                        <div style="
                            width: 60px;
                            height: 60px;
                            background: linear-gradient(135deg, #4a90e2 0%, #357abd 100%);
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            margin: 0 auto 16px;
                            box-shadow: 0 4px 12px rgba(74, 144, 226, 0.3);
                        ">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                <polyline points="22,6 12,13 2,6"></polyline>
                            </svg>
                        </div>
                        <h2 style="
                            margin: 0 0 8px 0;
                            color: #fff;
                            font-size: 28px;
                            font-weight: 600;
                            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
                        ">Create New Sequence</h2>
                        <p style="
                            margin: 0;
                            color: #aaa;
                            font-size: 16px;
                        ">Build automated email sequences to engage your prospects</p>
                    </div>
                    
                    <form id="create-sequence-form" onsubmit="CRMApp.handleCreateSequence(event)">
                        <div style="margin-bottom: 24px;">
                            <label style="
                                display: block;
                                margin-bottom: 8px;
                                color: #ccc;
                                font-size: 14px;
                                font-weight: 500;
                            ">Sequence Name *</label>
                            <input 
                                type="text" 
                                id="sequence-name-input" 
                                required 
                                placeholder="e.g., Cold Outreach for Energy Prospects"
                                style="
                                    width: 100%;
                                    padding: 12px 16px;
                                    background: #333;
                                    border: 1px solid #555;
                                    border-radius: 8px;
                                    color: #fff;
                                    font-size: 16px;
                                    box-sizing: border-box;
                                    transition: all 0.2s ease;
                                "
                                onfocus="this.style.borderColor='#4a90e2'; this.style.boxShadow='0 0 0 2px rgba(74, 144, 226, 0.2)'"
                                onblur="this.style.borderColor='#555'; this.style.boxShadow='none'"
                            >
                        </div>
                        
                        <div style="margin-bottom: 32px;">
                            <label style="
                                display: block;
                                margin-bottom: 8px;
                                color: #ccc;
                                font-size: 14px;
                                font-weight: 500;
                            ">Description (Optional)</label>
                            <textarea 
                                id="sequence-description-input" 
                                placeholder="Describe the goal and target audience for this sequence..."
                                rows="3"
                                style="
                                    width: 100%;
                                    padding: 12px 16px;
                                    background: #333;
                                    border: 1px solid #555;
                                    border-radius: 8px;
                                    color: #fff;
                                    font-size: 14px;
                                    box-sizing: border-box;
                                    resize: vertical;
                                    transition: all 0.2s ease;
                                    font-family: inherit;
                                "
                                onfocus="this.style.borderColor='#4a90e2'; this.style.boxShadow='0 0 0 2px rgba(74, 144, 226, 0.2)'"
                                onblur="this.style.borderColor='#555'; this.style.boxShadow='none'"
                            ></textarea>
                        </div>
                        
                        <div style="
                            display: flex;
                            gap: 12px;
                            justify-content: flex-end;
                        ">
                            <button type="button" onclick="CRMApp.closeCreateSequenceModal()" style="
                                background: rgba(255, 255, 255, 0.1);
                                border: 1px solid #555;
                                color: #ccc;
                                padding: 12px 24px;
                                border-radius: 8px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 500;
                                transition: all 0.2s ease;
                            " onmouseover="this.style.background='rgba(255, 255, 255, 0.15)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'">
                                Cancel
                            </button>
                            <button type="submit" style="
                                background: linear-gradient(135deg, #4a90e2 0%, #357abd 100%);
                                border: 1px solid #5ba0f2;
                                color: #fff;
                                padding: 12px 24px;
                                border-radius: 8px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 600;
                                transition: all 0.2s ease;
                                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                            " onmouseover="this.style.background='linear-gradient(135deg, #357abd 0%, #2968a3 100%)'" onmouseout="this.style.background='linear-gradient(135deg, #4a90e2 0%, #357abd 100%)'">
                                Create Sequence
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        console.log('Modal HTML added to body');
        
        // Use setTimeout to ensure DOM is fully updated before accessing elements
        setTimeout(() => {
            const modal = document.getElementById('create-sequence-modal');
            const nameInput = document.getElementById('sequence-name-input');
            console.log('Modal element found:', !!modal);
            console.log('Name input found:', !!nameInput);
            
            if (modal) {
                console.log('Setting modal styles and display');
                modal.style.display = 'flex';
                modal.style.zIndex = '10000';
                modal.style.position = 'fixed';
                modal.style.top = '0';
                modal.style.left = '0';
                modal.style.width = '100%';
                modal.style.height = '100%';
                console.log('Modal should now be visible');
            }
            
            if (nameInput) {
                console.log('Focusing name input');
                nameInput.focus();
            }
        }, 10);
    },

    closeCreateSequenceModal() {
        const modal = document.getElementById('create-sequence-modal');
        if (modal) {
            modal.remove();
        }
    },

    handleCreateSequence(event) {
        event.preventDefault();
        console.log('Handling create sequence');

        const nameInput = document.getElementById('sequence-name-input');
        const descriptionInput = document.getElementById('sequence-description-input');
        const sequenceName = nameInput ? nameInput.value.trim() : '';
        const sequenceDescription = descriptionInput ? descriptionInput.value.trim() : '';

        if (!sequenceName) {
            this.showNotification('Please enter a sequence name', 'error');
            return;
        }

        try {
            // Create new sequence object
            const newSequence = {
                id: `seq_${Date.now()}`,
                name: sequenceName,
                description: sequenceDescription || 'New sequence for engaging prospects',
                status: 'draft',
                steps: [],
                contacts: [],
                activeContacts: 0,
                isActive: false,
                created: new Date().toISOString(),
                createdAt: new Date()
            };

            // Add to sequences array
            if (!this.sequences) {
                this.sequences = [];
            }
            this.sequences.unshift(newSequence);

            // Store as current sequence
            this.currentSequence = newSequence;

            console.log('Sequence created:', newSequence);

            // Close modal
            this.closeCreateSequenceModal();

            // Navigate to sequence overview page
            this.renderSequenceOverviewPage(newSequence);

            // Show success notification
            this.showNotification(`Sequence "${sequenceName}" created successfully!`, 'success');

        } catch (error) {
            console.error('Error creating sequence:', error);
            this.showNotification('Error creating sequence: ' + error.message, 'error');
            return;
        }
    },

    editSequence(sequenceId) {
        const sequence = this.sequences.find(s => s.id === sequenceId);
        if (sequence) {
            this.showNotification(`Editing sequence: ${sequence.name}`, 'info');
            // Implement sequence editing here
        }
    },

    toggleSequence(sequenceId) {
        const sequence = this.sequences.find(s => s.id === sequenceId);
        if (sequence) {
            sequence.isActive = !sequence.isActive;
            this.showNotification(`Sequence "${sequence.name}" ${sequence.isActive ? 'activated' : 'paused'}`, 'success');
            this.renderSequencesTable();
        }
    },

    // Render new sequence overview page with inspirational section
    renderSequenceOverviewPage(sequence) {
        console.log("renderSequenceOverviewPage called for sequence:", sequence);
        const sequenceBuilderView = document.getElementById('sequence-builder-view');
        if (!sequenceBuilderView) {
            console.error('sequence-builder-view element not found');
            return;
        }
        
        this.currentSequence = sequence;
        const hasSteps = sequence.steps && sequence.steps.length > 0;
        
        const sequenceOverviewHTML = `
            <div class="sequence-overview-header" style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 32px;
                padding-bottom: 20px;
                border-bottom: 1px solid #333;
            ">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <button onclick="CRMApp.showView('sequences-view')" style="
                        background: rgba(255, 255, 255, 0.1);
                        border: 1px solid #555;
                        color: #fff;
                        padding: 10px 16px;
                        border-radius: 8px;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    " onmouseover="this.style.background='rgba(255, 255, 255, 0.15)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="15,18 9,12 15,6"></polyline>
                        </svg>
                        Back to Sequences
                    </button>
                    <div>
                        <h1 style="margin: 0 0 4px 0; color: #fff; font-size: 28px; font-weight: 600;">${sequence?.name || 'New Sequence'}</h1>
                        <p style="margin: 0; color: #888; font-size: 14px;">${sequence?.description || 'No description'}</p>
                    </div>
                </div>
                <div style="display: flex; gap: 12px;">
                    <button onclick="CRMApp.showAddContactsModal('${sequence.id}')" style="
                        background: rgba(74, 144, 226, 0.1);
                        border: 1px solid #4a90e2;
                        color: #4a90e2;
                        padding: 10px 16px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 500;
                        transition: all 0.2s ease;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    " onmouseover="this.style.background='rgba(74, 144, 226, 0.15)'" onmouseout="this.style.background='rgba(74, 144, 226, 0.1)'">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <line x1="19" y1="8" x2="19" y2="14"></line>
                            <line x1="22" y1="11" x2="16" y2="11"></line>
                        </svg>
                        Add Contacts
                    </button>
                </div>
            </div>
            
            ${!hasSteps ? `
            <div class="inspirational-section" style="
                text-align: center;
                padding: 60px 40px;
                background: linear-gradient(135deg, rgba(74, 144, 226, 0.05) 0%, rgba(53, 122, 189, 0.05) 100%);
                border-radius: 20px;
                border: 1px solid rgba(74, 144, 226, 0.1);
                margin-bottom: 32px;
                position: relative;
                overflow: hidden;
            ">
                <div style="
                    position: absolute;
                    top: -50%;
                    left: -50%;
                    width: 200%;
                    height: 200%;
                    background: radial-gradient(circle, rgba(74, 144, 226, 0.03) 0%, transparent 70%);
                    pointer-events: none;
                "></div>
                <div style="position: relative; z-index: 1;">
                    <div style="
                        width: 80px;
                        height: 80px;
                        background: linear-gradient(135deg, #4a90e2 0%, #357abd 100%);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto 24px;
                        box-shadow: 0 8px 24px rgba(74, 144, 226, 0.3);
                    ">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
                        </svg>
                    </div>
                    <h2 style="
                        margin: 0 0 16px 0;
                        color: #fff;
                        font-size: 32px;
                        font-weight: 700;
                        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
                    ">Supercharge Your Outreach</h2>
                    <p style="
                        margin: 0 0 32px 0;
                        color: #bbb;
                        font-size: 18px;
                        line-height: 1.6;
                        max-width: 600px;
                        margin-left: auto;
                        margin-right: auto;
                    ">Transform your sales process with automated email sequences. Build relationships, nurture prospects, and close more deals with Power Choosers' intelligent automation.</p>
                    <div style="
                        display: flex;
                        justify-content: center;
                        gap: 32px;
                        margin-bottom: 32px;
                        flex-wrap: wrap;
                    ">
                        <div style="text-align: center;">
                            <div style="
                                width: 48px;
                                height: 48px;
                                background: rgba(40, 167, 69, 0.1);
                                border-radius: 50%;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                margin: 0 auto 8px;
                                border: 1px solid rgba(40, 167, 69, 0.2);
                            ">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#28a745" stroke-width="2">
                                    <polyline points="20,6 9,17 4,12"></polyline>
                                </svg>
                            </div>
                            <p style="margin: 0; color: #28a745; font-size: 14px; font-weight: 600;">Automated</p>
                        </div>
                        <div style="text-align: center;">
                            <div style="
                                width: 48px;
                                height: 48px;
                                background: rgba(255, 193, 7, 0.1);
                                border-radius: 50%;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                margin: 0 auto 8px;
                                border: 1px solid rgba(255, 193, 7, 0.2);
                            ">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffc107" stroke-width="2">
                                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
                                </svg>
                            </div>
                            <p style="margin: 0; color: #ffc107; font-size: 14px; font-weight: 600;">Personalized</p>
                        </div>
                        <div style="text-align: center;">
                            <div style="
                                width: 48px;
                                height: 48px;
                                background: rgba(220, 53, 69, 0.1);
                                border-radius: 50%;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                margin: 0 auto 8px;
                                border: 1px solid rgba(220, 53, 69, 0.2);
                            ">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc3545" stroke-width="2">
                                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
                                </svg>
                            </div>
                            <p style="margin: 0; color: #dc3545; font-size: 14px; font-weight: 600;">Effective</p>
                        </div>
                    </div>
                </div>
            </div>
            ` : ''}
            
            <div class="sequence-steps-container" style="
                background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                border-radius: 18px;
                border: 1px solid #333;
                padding: 24px;
                margin-bottom: 24px;
            ">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 24px;
                ">
                    <h3 style="margin: 0; color: #fff; font-size: 20px; font-weight: 600;">Sequence Steps</h3>
                    <span style="color: #888; font-size: 14px;">${sequence.steps ? sequence.steps.length : 0} steps</span>
                </div>
                
                ${hasSteps ? `
                    <div id="sequence-steps-list" style="margin-bottom: 24px;">
                        <!-- Steps will be rendered here -->
                    </div>
                ` : `
                    <div style="
                        text-align: center;
                        padding: 40px 20px;
                        color: #666;
                        border: 2px dashed #333;
                        border-radius: 12px;
                        margin-bottom: 24px;
                    ">
                        <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;">📝</div>
                        <p style="margin: 0 0 8px 0; color: #888; font-size: 16px;">No steps added yet</p>
                        <p style="margin: 0; color: #666; font-size: 14px;">Click "Add Step" below to create your first sequence step</p>
                    </div>
                `}
                
                <button onclick="CRMApp.showAddStepModal('${sequence.id}')" style="
                    background: linear-gradient(135deg, #4a90e2 0%, #357abd 100%);
                    border: 1px solid #5ba0f2;
                    color: #fff;
                    padding: 14px 24px;
                    border-radius: 10px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: 600;
                    transition: all 0.2s ease;
                    box-shadow: 0 4px 12px rgba(74, 144, 226, 0.2);
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    width: 100%;
                    justify-content: center;
                " onmouseover="this.style.background='linear-gradient(135deg, #357abd 0%, #2968a3 100%)'" onmouseout="this.style.background='linear-gradient(135deg, #4a90e2 0%, #357abd 100%)'">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Add Step
                </button>
            </div>
            
            <div class="sequence-contacts-section" style="
                background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                border-radius: 18px;
                border: 1px solid #333;
                padding: 24px;
            ">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                ">
                    <h3 style="margin: 0; color: #fff; font-size: 20px; font-weight: 600;">Contacts in Sequence</h3>
                    <span style="
                        background: rgba(74, 144, 226, 0.1);
                        color: #4a90e2;
                        padding: 4px 12px;
                        border-radius: 12px;
                        font-size: 12px;
                        font-weight: 600;
                    ">${sequence.contacts ? sequence.contacts.length : 0} contacts</span>
                </div>
                
                ${sequence.contacts && sequence.contacts.length > 0 ? `
                    <div id="sequence-contacts-list">
                        <!-- Contacts will be rendered here -->
                    </div>
                ` : `
                    <div style="
                        text-align: center;
                        padding: 40px 20px;
                        color: #666;
                        border: 2px dashed #333;
                        border-radius: 12px;
                    ">
                        <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;">👥</div>
                        <p style="margin: 0 0 8px 0; color: #888; font-size: 16px;">No contacts added yet</p>
                        <p style="margin: 0; color: #666; font-size: 14px;">Add contacts to start your sequence</p>
                    </div>
                `}
            </div>
        `;

        sequenceBuilderView.innerHTML = sequenceOverviewHTML;
        sequenceBuilderView.style.cssText = `
            display: flex !important;
            flex-direction: column !important;
            height: calc(100vh - 120px) !important;
            background: linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%) !important;
        
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

        return this.sequences.map(sequence => `
            <div class="sequence-item">
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
                    <div class="sequence-status">
                        <div class="status-toggle">
                            <label class="toggle-switch">
                                <input type="checkbox" ${sequence.isActive ? 'checked' : ''} 
                                       onchange="CRMApp.toggleSequenceStatus('${sequence.id}', this.checked)">
                                <span class="toggle-slider"></span>
                            </label>
                            <span class="status-label ${sequence.isActive ? 'active' : 'inactive'}">
                                ${sequence.isActive ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                    </div>
                    <div class="sequence-actions">
                        <button class="btn-secondary" onclick="CRMApp.editSequence('${sequence.id}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                            Edit
                        </button>
                        <button class="btn-danger" onclick="CRMApp.deleteSequence('${sequence.id}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3,6 5,6 21,6"></polyline>
                                <path d="M19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"></path>
                            </svg>
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
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
        this.openSequenceBuilder(sequenceId);
    },

    // Delete sequence
    deleteSequence(sequenceId) {
        if (confirm('Are you sure you want to delete this sequence?')) {
            this.sequences = this.sequences.filter(s => s.id !== sequenceId);
            this.renderSequencesPage();
            this.showNotification('Sequence deleted', 'success');
        }
    },

    showAddContactsModal(sequenceId) {
        console.log('Add contacts modal for sequence:', sequenceId);
        this.showNotification('Add Contacts functionality coming soon!', 'info');
    }
});
