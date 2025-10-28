'use strict';

// Agents Management Dashboard - Twilio & SendGrid Integration
(function () {
  const state = {
    loaded: false,
    loading: false,
    userEmail: window.currentUserEmail || '',
    isAdmin: window.currentUserRole === 'admin',
    agents: [],
    activities: [],
    twilioNumbers: [],
    sendgridEmails: [],
    filters: {
      status: 'all', // all, online, offline, busy
      territory: 'all'
    }
  };

  const els = {};

  function initDomRefs() {
    els.page = document.getElementById('agents-page');
    els.loadingSpinner = document.getElementById('agents-loading');
    els.errorMessage = document.getElementById('agents-error');
    els.tableBody = document.getElementById('agents-table-body');
    els.refreshBtn = document.getElementById('refresh-agents-data');
    els.addAgentBtn = document.getElementById('add-agent-btn');
    els.statusFilter = document.getElementById('status-filter');
    els.territoryFilter = document.getElementById('territory-filter');
    
    return !!els.page;
  }

  function showLoading() {
    state.loading = true;
    if (els.loadingSpinner) {
      els.loadingSpinner.style.display = 'block';
    }
    if (els.errorMessage) {
      els.errorMessage.style.display = 'none';
    }
  }

  function hideLoading() {
    state.loading = false;
    if (els.loadingSpinner) {
      els.loadingSpinner.style.display = 'none';
    }
  }

  function showError(message) {
    if (els.errorMessage) {
      els.errorMessage.textContent = message;
      els.errorMessage.style.display = 'block';
    }
    hideLoading();
  }

  // Initialize the page
  function initAgentsPage() {
    // Admin-only access check
    if (!state.isAdmin) {
      console.log('[Agents] Access denied - admin only');
      showError('Access denied. Admin privileges required.');
      return;
    }

    if (state.loaded) return;
    
    if (!initDomRefs()) {
      console.error('[Agents] Required DOM elements not found');
      return;
    }
    
    console.log('[Agents] Initializing agents page...');
    loadAgentsData();
    setupEventListeners();
    state.loaded = true;
  }

  // Load agents data from Firebase
  async function loadAgentsData() {
    showLoading();
    
    try {
      const db = firebase.firestore();
      
      // Load agents
      const agentsSnapshot = await db.collection('agents').get();
      state.agents = agentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Load recent activities
      const activitiesSnapshot = await db.collection('agent_activities')
        .orderBy('timestamp', 'desc')
        .limit(100)
        .get();
      
      state.activities = activitiesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Load Twilio phone numbers
      await loadTwilioNumbers();
      
      // Load SendGrid email addresses
      await loadSendGridEmails();

      renderAgentsDashboard();
      hideLoading();
      
    } catch (error) {
      console.error('[Agents] Error loading data:', error);
      showError('Failed to load agents data. Please try again.');
    }
  }

  // Load available Twilio phone numbers
  async function loadTwilioNumbers() {
    try {
      const response = await fetch('/api/twilio/numbers', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        state.twilioNumbers = data.numbers || [];
        console.log('[Agents] Loaded Twilio numbers:', state.twilioNumbers.length);
      } else {
        console.warn('[Agents] Failed to load Twilio numbers');
        state.twilioNumbers = [];
      }
    } catch (error) {
      console.error('[Agents] Error loading Twilio numbers:', error);
      state.twilioNumbers = [];
    }
  }

  // Load SendGrid email addresses
  async function loadSendGridEmails() {
    try {
      const response = await fetch('/api/sendgrid/emails', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        state.sendgridEmails = data.emails || [];
        console.log('[Agents] Loaded SendGrid emails:', state.sendgridEmails.length);
      } else {
        console.warn('[Agents] Failed to load SendGrid emails');
        state.sendgridEmails = [];
      }
    } catch (error) {
      console.error('[Agents] Error loading SendGrid emails:', error);
      state.sendgridEmails = [];
    }
  }

  // Get auth token for API calls
  async function getAuthToken() {
    if (firebase.auth().currentUser) {
      return await firebase.auth().currentUser.getIdToken();
    }
    return null;
  }

  // Render the dashboard
  function renderAgentsDashboard() {
    updateOverviewMetrics();
    renderAgentsTable();
  }

  // Update overview metrics
  function updateOverviewMetrics() {
    const activeAgents = state.agents.filter(agent => agent.status === 'online').length;
    const today = new Date().toDateString();
    
    const callsToday = state.activities.filter(activity => 
      activity.type === 'call' && 
      new Date(activity.timestamp.toDate()).toDateString() === today
    ).length;
    
    const emailsToday = state.activities.filter(activity => 
      activity.type === 'email' && 
      new Date(activity.timestamp.toDate()).toDateString() === today
    ).length;
    
    const tasksToday = state.activities.filter(activity => 
      activity.type === 'task_completed' && 
      new Date(activity.timestamp.toDate()).toDateString() === today
    ).length;

    // Update DOM elements
    const activeCountEl = document.getElementById('active-agents-count');
    const callsCountEl = document.getElementById('total-calls-today');
    const emailsCountEl = document.getElementById('total-emails-today');
    const tasksCountEl = document.getElementById('tasks-completed-today');

    if (activeCountEl) activeCountEl.textContent = activeAgents;
    if (callsCountEl) callsCountEl.textContent = callsToday;
    if (emailsCountEl) emailsCountEl.textContent = emailsToday;
    if (tasksCountEl) tasksCountEl.textContent = tasksToday;
  }

  // Render agents table
  function renderAgentsTable() {
    if (!els.tableBody) return;

    const filteredAgents = getFilteredAgents();
    
    els.tableBody.innerHTML = filteredAgents.map(agent => {
      const todayActivities = state.activities.filter(activity => 
        activity.agentEmail === agent.email &&
        new Date(activity.timestamp.toDate()).toDateString() === new Date().toDateString()
      );

      const callsToday = todayActivities.filter(a => a.type === 'call').length;
      const emailsToday = todayActivities.filter(a => a.type === 'email').length;
      const tasksToday = todayActivities.filter(a => a.type === 'task_completed').length;
      
      const currentActivity = todayActivities[0] ? 
        `${todayActivities[0].type} - ${todayActivities[0].details?.outcome || 'In progress'}` : 
        'No recent activity';

      const phoneNumber = agent.assignedPhoneNumber || 'Not assigned';
      const emailAddress = agent.assignedEmailAddress || 'Not assigned';

      return `
        <tr>
          <td>
            <div class="agent-cell">
              <div class="agent-avatar">${agent.name.charAt(0)}</div>
              <div class="agent-info">
                <div class="agent-name">${agent.name}</div>
                <div class="agent-email">${agent.email}</div>
              </div>
            </div>
          </td>
          <td>
            <span class="status-badge ${agent.status}">${agent.status}</span>
          </td>
          <td>
            <div class="phone-assignment">
              <span class="phone-number">${phoneNumber}</span>
              <button class="assign-btn small" onclick="assignPhoneNumber('${agent.email}')">
                ${phoneNumber === 'Not assigned' ? 'Assign' : 'Change'}
              </button>
            </div>
          </td>
          <td>
            <div class="email-assignment">
              <span class="email-address">${emailAddress}</span>
              <button class="assign-btn small" onclick="assignEmailAddress('${agent.email}')">
                ${emailAddress === 'Not assigned' ? 'Assign' : 'Change'}
              </button>
            </div>
          </td>
          <td>${callsToday}</td>
          <td>${emailsToday}</td>
          <td>${tasksToday}</td>
          <td class="current-activity">${currentActivity}</td>
          <td>
            <button class="action-btn small" onclick="viewAgentDetails('${agent.email}')">
              View Details
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Get filtered agents based on current filters
  function getFilteredAgents() {
    return state.agents.filter(agent => {
      const statusMatch = state.filters.status === 'all' || agent.status === state.filters.status;
      const territoryMatch = state.filters.territory === 'all' || agent.territory === state.filters.territory;
      return statusMatch && territoryMatch;
    });
  }

  // Event listeners
  function setupEventListeners() {
    if (els.refreshBtn) {
      els.refreshBtn.addEventListener('click', loadAgentsData);
    }

    if (els.addAgentBtn) {
      els.addAgentBtn.addEventListener('click', openAddAgentModal);
    }

    if (els.statusFilter) {
      els.statusFilter.addEventListener('change', (e) => {
        state.filters.status = e.target.value;
        renderAgentsTable();
      });
    }

    if (els.territoryFilter) {
      els.territoryFilter.addEventListener('change', (e) => {
        state.filters.territory = e.target.value;
        renderAgentsTable();
      });
    }
  }

  // Open add agent modal
  function openAddAgentModal() {
    // Create modal HTML
    const modalHTML = `
      <div class="modal-overlay" id="add-agent-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Add New Agent</h3>
            <button class="modal-close" onclick="closeAddAgentModal()">&times;</button>
          </div>
          <div class="modal-body">
            <form id="add-agent-form">
              <div class="form-group">
                <label for="agent-name">Full Name</label>
                <input type="text" id="agent-name" name="name" required>
              </div>
              <div class="form-group">
                <label for="agent-email">Email Address</label>
                <input type="email" id="agent-email" name="email" required>
              </div>
              <div class="form-group">
                <label for="agent-territory">Territory</label>
                <select id="agent-territory" name="territory" required>
                  <option value="">Select Territory</option>
                  <option value="west_coast">West Coast</option>
                  <option value="east_coast">East Coast</option>
                  <option value="central">Central</option>
                </select>
              </div>
              <div class="form-group">
                <label for="agent-role">Role</label>
                <select id="agent-role" name="role" required>
                  <option value="sales_agent">Sales Agent</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div class="form-group">
                <label for="agent-skills">Skills (comma-separated)</label>
                <input type="text" id="agent-skills" name="skills" placeholder="e.g., cold_calling, email_outreach">
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary" onclick="closeAddAgentModal()">Cancel</button>
            <button type="button" class="btn-primary" onclick="saveNewAgent()">Add Agent</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
  }

  // Close add agent modal
  window.closeAddAgentModal = function() {
    const modal = document.getElementById('add-agent-modal');
    if (modal) {
      modal.remove();
    }
  };

  // Save new agent
  window.saveNewAgent = async function() {
    const form = document.getElementById('add-agent-form');
    if (!form) return;

    const formData = new FormData(form);
    const agentData = {
      name: formData.get('name'),
      email: formData.get('email').toLowerCase(),
      territory: formData.get('territory'),
      role: formData.get('role'),
      skills: formData.get('skills').split(',').map(s => s.trim()).filter(s => s),
      status: 'offline',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastActive: firebase.firestore.FieldValue.serverTimestamp(),
      goals: {
        callsPerDay: 50,
        emailsPerDay: 20,
        dealsPerMonth: 5
      },
      performance: {
        totalCalls: 0,
        totalEmails: 0,
        dealsClosed: 0,
        conversionRate: 0
      }
    };

    try {
      const db = firebase.firestore();
      await db.collection('agents').doc(agentData.email).set(agentData);
      
      console.log('[Agents] New agent added:', agentData.email);
      closeAddAgentModal();
      loadAgentsData(); // Refresh the data
      
      // Show success message
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Agent added successfully!', 'success');
      }
    } catch (error) {
      console.error('[Agents] Error adding agent:', error);
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Failed to add agent. Please try again.', 'error');
      }
    }
  };

  // Assign phone number to agent
  window.assignPhoneNumber = async function(agentEmail) {
    if (state.twilioNumbers.length === 0) {
      alert('No Twilio phone numbers available. Please contact your administrator.');
      return;
    }

    // Create phone assignment modal
    const modalHTML = `
      <div class="modal-overlay" id="assign-phone-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Assign Phone Number</h3>
            <button class="modal-close" onclick="closeAssignPhoneModal()">&times;</button>
          </div>
          <div class="modal-body">
            <p>Select a phone number for <strong>${agentEmail}</strong>:</p>
            <div class="phone-list">
              ${state.twilioNumbers.map(number => `
                <div class="phone-option">
                  <input type="radio" name="phone-number" value="${number.phoneNumber}" id="phone-${number.phoneNumber}">
                  <label for="phone-${number.phoneNumber}">
                    <span class="phone-number">${number.phoneNumber}</span>
                    <span class="phone-location">${number.friendlyName || 'No description'}</span>
                  </label>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary" onclick="closeAssignPhoneModal()">Cancel</button>
            <button type="button" class="btn-primary" onclick="savePhoneAssignment('${agentEmail}')">Assign Phone</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
  };

  // Close phone assignment modal
  window.closeAssignPhoneModal = function() {
    const modal = document.getElementById('assign-phone-modal');
    if (modal) {
      modal.remove();
    }
  };

  // Save phone assignment
  window.savePhoneAssignment = async function(agentEmail) {
    const selectedPhone = document.querySelector('input[name="phone-number"]:checked');
    if (!selectedPhone) {
      alert('Please select a phone number.');
      return;
    }

    try {
      const db = firebase.firestore();
      await db.collection('agents').doc(agentEmail).update({
        assignedPhoneNumber: selectedPhone.value,
        phoneAssignedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log('[Agents] Phone number assigned:', selectedPhone.value, 'to', agentEmail);
      closeAssignPhoneModal();
      loadAgentsData(); // Refresh the data
      
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Phone number assigned successfully!', 'success');
      }
    } catch (error) {
      console.error('[Agents] Error assigning phone number:', error);
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Failed to assign phone number. Please try again.', 'error');
      }
    }
  };

  // Assign email address to agent
  window.assignEmailAddress = async function(agentEmail) {
    if (state.sendgridEmails.length === 0) {
      alert('No SendGrid email addresses available. Please contact your administrator.');
      return;
    }

    // Create email assignment modal
    const modalHTML = `
      <div class="modal-overlay" id="assign-email-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Assign Email Address</h3>
            <button class="modal-close" onclick="closeAssignEmailModal()">&times;</button>
          </div>
          <div class="modal-body">
            <p>Select an email address for <strong>${agentEmail}</strong>:</p>
            <div class="email-list">
              ${state.sendgridEmails.map(email => `
                <div class="email-option">
                  <input type="radio" name="email-address" value="${email.email}" id="email-${email.email}">
                  <label for="email-${email.email}">
                    <span class="email-address">${email.email}</span>
                    <span class="email-description">${email.description || 'No description'}</span>
                  </label>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary" onclick="closeAssignEmailModal()">Cancel</button>
            <button type="button" class="btn-primary" onclick="saveEmailAssignment('${agentEmail}')">Assign Email</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
  };

  // Close email assignment modal
  window.closeAssignEmailModal = function() {
    const modal = document.getElementById('assign-email-modal');
    if (modal) {
      modal.remove();
    }
  };

  // Save email assignment
  window.saveEmailAssignment = async function(agentEmail) {
    const selectedEmail = document.querySelector('input[name="email-address"]:checked');
    if (!selectedEmail) {
      alert('Please select an email address.');
      return;
    }

    try {
      const db = firebase.firestore();
      await db.collection('agents').doc(agentEmail).update({
        assignedEmailAddress: selectedEmail.value,
        emailAssignedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log('[Agents] Email address assigned:', selectedEmail.value, 'to', agentEmail);
      closeAssignEmailModal();
      loadAgentsData(); // Refresh the data
      
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Email address assigned successfully!', 'success');
      }
    } catch (error) {
      console.error('[Agents] Error assigning email address:', error);
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Failed to assign email address. Please try again.', 'error');
      }
    }
  };

  // View agent details
  window.viewAgentDetails = function(agentEmail) {
    // Navigate to agent detail page
    console.log('Viewing details for agent:', agentEmail);
    // This will be implemented in agent-detail.js
    if (window.crm && typeof window.crm.navigateToPage === 'function') {
      window.crm.navigateToPage('agent-detail', { agentEmail });
    } else {
      // Fallback navigation
      window.showAgentDetail(agentEmail);
    }
  };

  // Initialize when page is shown
  document.addEventListener('DOMContentLoaded', function() {
    // Listen for page navigation
    document.addEventListener('click', function(e) {
      if (e.target.closest('[data-page="agents"]')) {
        initAgentsPage();
      }
    });
  });

})();
