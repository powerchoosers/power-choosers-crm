// Bulk Assignment Module - Lead assignment UI for admin
// Allows admin to assign accounts/contacts to team members in bulk

(function() {
  'use strict';

  let teamMembers = [];
  let currentCollectionType = null; // 'accounts' or 'contacts'
  let currentSelectedIds = [];

  // Load team members from Firestore
  async function loadTeamMembers() {
    if (!window.DataManager || !window.DataManager.isCurrentUserAdmin()) {
      return [];
    }

    const db = firebase.firestore();
    try {
      const snapshot = await db.collection('users')
        .where('role', '==', 'employee')
        .get();
      
      const members = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        members.push({
          email: doc.id,
          name: data.name || doc.id.split('@')[0],
          photoURL: data.photoURL || null,
          role: data.role
        });
      });
      
      // Add admin to list
      const adminDoc = await db.collection('users').doc(window.DataManager.ADMIN_EMAIL).get();
      if (adminDoc.exists) {
        const adminData = adminDoc.data();
        members.unshift({
          email: window.DataManager.ADMIN_EMAIL,
          name: adminData.name || 'Admin',
          photoURL: adminData.photoURL || null,
          role: 'admin',
          isAdmin: true
        });
      }
      
      teamMembers = members;
      console.log('[BulkAssignment] Loaded team members:', teamMembers.length);
      return members;
    } catch (error) {
      console.error('[BulkAssignment] Error loading team members:', error);
      return [];
    }
  }

  // Initialize bulk assignment for a page
  async function initBulkAssignment(collectionType) {
    if (!window.DataManager || !window.DataManager.isCurrentUserAdmin()) {
      console.log('[BulkAssignment] Not admin - skipping initialization');
      return;
    }

    currentCollectionType = collectionType;
    await loadTeamMembers();
    
    console.log(`[BulkAssignment] Initialized for ${collectionType}`);
  }

  // Show quick assignment dropdown
  function showQuickAssignDropdown(selectedIds, anchorElement) {
    if (teamMembers.length === 0) {
      console.warn('[BulkAssignment] No team members loaded');
      return;
    }

    currentSelectedIds = selectedIds;
    
    // Remove existing dropdown
    const existing = document.getElementById('bulk-assign-dropdown');
    if (existing) existing.remove();

    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.id = 'bulk-assign-dropdown';
    dropdown.className = 'bulk-assign-dropdown';
    
    const html = `
      <div class="bulk-assign-header">
        <span>Assign ${selectedIds.length} item(s) to:</span>
      </div>
      <div class="bulk-assign-options">
        ${teamMembers.map(member => `
          <button class="bulk-assign-option" data-email="${member.email}">
            ${member.photoURL 
              ? `<img src="${member.photoURL}" class="team-avatar" alt="${member.name}" />`
              : `<div class="team-avatar-fallback">${member.name.charAt(0).toUpperCase()}</div>`
            }
            <span class="team-name">${member.name}</span>
            ${member.isAdmin ? '<span class="admin-badge">Admin</span>' : ''}
          </button>
        `).join('')}
      </div>
      <div class="bulk-assign-footer">
        <button class="bulk-assign-advanced" id="bulk-assign-advanced-btn">
          Advanced Options
        </button>
      </div>
    `;
    
    dropdown.innerHTML = html;
    document.body.appendChild(dropdown);

    // Position dropdown near anchor
    const rect = anchorElement.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 5}px`;
    dropdown.style.left = `${rect.left}px`;

    // Add click handlers
    dropdown.querySelectorAll('.bulk-assign-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const email = btn.dataset.email;
        assignLeads(email);
        hideQuickAssignDropdown();
      });
    });

    document.getElementById('bulk-assign-advanced-btn').addEventListener('click', () => {
      hideQuickAssignDropdown();
      showAdvancedModal(selectedIds);
    });

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', handleOutsideClick);
    }, 100);
  }

  function handleOutsideClick(e) {
    const dropdown = document.getElementById('bulk-assign-dropdown');
    const modal = document.getElementById('bulk-assign-modal');
    
    if (dropdown && !dropdown.contains(e.target)) {
      hideQuickAssignDropdown();
    }
    if (modal && !modal.contains(e.target) && !e.target.closest('.bulk-assign-btn')) {
      hideAdvancedModal();
    }
  }

  function hideQuickAssignDropdown() {
    const dropdown = document.getElementById('bulk-assign-dropdown');
    if (dropdown) dropdown.remove();
    document.removeEventListener('click', handleOutsideClick);
  }

  // Show advanced assignment modal
  function showAdvancedModal(selectedIds) {
    currentSelectedIds = selectedIds;
    
    // Remove existing modal
    const existing = document.getElementById('bulk-assign-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'bulk-assign-modal';
    modal.className = 'bulk-assign-modal';
    
    const html = `
      <div class="bulk-assign-modal-content">
        <div class="bulk-assign-modal-header">
          <h3>Assign ${selectedIds.length} ${currentCollectionType === 'accounts' ? 'Account(s)' : 'Contact(s)'}</h3>
          <button class="bulk-assign-modal-close" id="bulk-assign-modal-close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="bulk-assign-modal-body">
          <div class="bulk-assign-search">
            <input type="text" id="bulk-assign-search" placeholder="Search team members..." />
          </div>
          <div class="bulk-assign-team-list" id="bulk-assign-team-list">
            ${teamMembers.map(member => `
              <div class="bulk-assign-team-member" data-email="${member.email}" data-name="${member.name.toLowerCase()}">
                ${member.photoURL 
                  ? `<img src="${member.photoURL}" class="team-avatar-large" alt="${member.name}" />`
                  : `<div class="team-avatar-large-fallback">${member.name.charAt(0).toUpperCase()}</div>`
                }
                <div class="team-member-info">
                  <div class="team-member-name">${member.name}</div>
                  <div class="team-member-email">${member.email}</div>
                </div>
                <button class="bulk-assign-select-btn" data-email="${member.email}">
                  Select
                </button>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="bulk-assign-modal-footer">
          <button class="btn-secondary" id="bulk-assign-cancel">Cancel</button>
        </div>
      </div>
    `;
    
    modal.innerHTML = html;
    document.body.appendChild(modal);

    // Event listeners
    document.getElementById('bulk-assign-modal-close').addEventListener('click', hideAdvancedModal);
    document.getElementById('bulk-assign-cancel').addEventListener('click', hideAdvancedModal);
    
    // Search functionality
    document.getElementById('bulk-assign-search').addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      document.querySelectorAll('.bulk-assign-team-member').forEach(member => {
        const name = member.dataset.name;
        const email = member.dataset.email.toLowerCase();
        if (name.includes(searchTerm) || email.includes(searchTerm)) {
          member.style.display = 'flex';
        } else {
          member.style.display = 'none';
        }
      });
    });

    // Select buttons
    document.querySelectorAll('.bulk-assign-select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const email = btn.dataset.email;
        assignLeads(email);
        hideAdvancedModal();
      });
    });
  }

  function hideAdvancedModal() {
    const modal = document.getElementById('bulk-assign-modal');
    if (modal) modal.remove();
  }

  // Assign leads to employee
  async function assignLeads(assigneeEmail) {
    if (!currentSelectedIds || currentSelectedIds.length === 0) {
      console.error('[BulkAssignment] No items selected');
      return;
    }

    const db = firebase.firestore();
    const batch = db.batch();
    const count = currentSelectedIds.length;
    
    const assigneeLower = (assigneeEmail || '').toLowerCase();
    console.log(`[BulkAssignment] Assigning ${count} ${currentCollectionType} to ${assigneeLower}`);

    try {
      // Update each selected item
      currentSelectedIds.forEach(itemId => {
        const ref = db.collection(currentCollectionType).doc(itemId);
        batch.update(ref, {
          assignedTo: assigneeLower,
          assignedBy: window.DataManager.getCurrentUserEmail(),
          assignedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });

      await batch.commit();
      
      // Get assignee name
      const assignee = teamMembers.find(m => (m.email || '').toLowerCase() === assigneeLower);
      const assigneeName = assignee ? assignee.name : assigneeLower;
      
      // Show success toast
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast(`✅ ${count} item(s) assigned to ${assigneeName}`, 'success');
      }
      
      // Dispatch event to refresh the page
      document.dispatchEvent(new CustomEvent('bulk-assignment-complete', {
        detail: { count, assigneeEmail, collectionType: currentCollectionType }
      }));
      
      console.log('[BulkAssignment] ✅ Assignment complete');
    } catch (error) {
      console.error('[BulkAssignment] Error assigning leads:', error);
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('❌ Failed to assign leads', 'error');
      }
    }
  }

  // Render assignment menu based on current page context
  function renderAssignMenu(anchorElement) {
    // Get selected items from the current page
    let selectedIds = [];
    
    // Check accounts page
    const accountsModule = window.accountsModule;
    if (accountsModule && typeof accountsModule.getState === 'function') {
      const state = accountsModule.getState();
      if (state.selected && state.selected.size > 0) {
        selectedIds = Array.from(state.selected);
        currentCollectionType = 'accounts';
      }
    }
    
    // Check people page
    const peopleModule = window.peopleModule;
    if (!selectedIds.length && peopleModule && typeof peopleModule.getState === 'function') {
      const state = peopleModule.getState();
      if (state.selected && state.selected.size > 0) {
        selectedIds = Array.from(state.selected);
        currentCollectionType = 'contacts';
      }
    }
    
    if (selectedIds.length === 0) {
      console.warn('[BulkAssignment] No items selected');
      return;
    }
    
    console.log(`[BulkAssignment] Rendering assign menu for ${selectedIds.length} ${currentCollectionType}`);
    showQuickAssignDropdown(selectedIds, anchorElement);
  }

  // Expose API
  window.BulkAssignment = {
    init: initBulkAssignment,
    showQuickDropdown: showQuickAssignDropdown,
    showAdvancedModal,
    loadTeamMembers,
    getTeamMembers: () => teamMembers,
    renderAssignMenu,
    get _currentCollection() { return currentCollectionType; }
  };

  console.log('[BulkAssignment] Module loaded');
})();

