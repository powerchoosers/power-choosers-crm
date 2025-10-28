'use strict';

// Agents Management Dashboard - Real Data Integration with Twilio & SendGrid
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
    },
    currentPage: 1,
    pageSize: 20
  };

  const els = {};

  function initDomRefs() {
    els.page = document.getElementById('agents-page');
    els.dashboard = els.page ? els.page.querySelector('.agents-dashboard') : null;
    els.loadingSpinner = els.page ? els.page.querySelector('.loading-spinner') : null;
    els.errorMessage = els.page ? els.page.querySelector('.error-message') : null;
    els.refreshBtn = document.getElementById('refresh-agents-data');
    els.addAgentBtn = document.getElementById('add-agent-btn');
    els.statusFilter = document.getElementById('agent-status-filter');
    els.territoryFilter = document.getElementById('agent-territory-filter');
    els.tableBody = document.getElementById('agents-table-body');
    return !!els.page && !!els.dashboard;
  }

  function showLoading() {
    state.loading = true;
    if (els.loadingSpinner) {
      els.loadingSpinner.style.display = 'block';
    }
    if (els.errorMessage) {
      els.errorMessage.style.display = 'none';
    }
    if (els.dashboard) {
      els.dashboard.style.display = 'none';
    }
  }

  function hideLoading() {
    state.loading = false;
    if (els.loadingSpinner) {
      els.loadingSpinner.style.display = 'none';
    }
    if (els.dashboard) {
      els.dashboard.style.display = 'block';
    }
  }

  function showError(message) {
    if (els.errorMessage) {
      els.errorMessage.querySelector('.error-text').textContent = message;
      els.errorMessage.style.display = 'flex';
    }
    hideLoading();
  }

  // Initialize the page
  function initAgentsPage() {
    // Admin-only access check
    if (window.currentUserRole !== 'admin') {
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
    
    // Start smart real-time listeners (cost-optimized)
    startSmartRealtimeListeners();
    
    state.loaded = true;
  }

  // Start smart real-time listeners (only for active agents)
  function startSmartRealtimeListeners() {
    if (!window.firebaseDB) return;
    
    // Only listen to agents with 'online' status to control costs
    const activeAgents = state.agents.filter(agent => agent.status === 'online');
    
    // Limit to 5 most active agents to control Firebase costs
    const topAgents = activeAgents
      .sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0))
      .slice(0, 5);
    
    console.log(`[Agents] Starting real-time listeners for ${topAgents.length} active agents`);
    
    topAgents.forEach(agent => {
      startAgentActivityListener(agent.email);
    });
  }

  // Start real-time listener for a specific agent
  function startAgentActivityListener(agentEmail) {
    if (state.realtimeListeners.has(agentEmail)) {
      return; // Already listening
    }
    
    try {
      const unsubscribe = firebase.firestore()
        .collection('agent_activities')
        .where('agentEmail', '==', agentEmail)
        .orderBy('timestamp', 'desc')
        .limit(10) // Only last 10 activities
        .onSnapshot(snapshot => {
          // Throttle updates to prevent UI thrashing
          if (state.lastActivityUpdate && 
              Date.now() - state.lastActivityUpdate < 2000) {
            return;
          }
          
          state.lastActivityUpdate = Date.now();
          updateAgentActivity(agentEmail, snapshot);
        });
      
      state.realtimeListeners.set(agentEmail, unsubscribe);
      console.log(`[Agents] Started real-time listener for ${agentEmail}`);
      
    } catch (error) {
      console.error(`[Agents] Error starting listener for ${agentEmail}:`, error);
    }
  }

  // Update agent activity from real-time listener
  function updateAgentActivity(agentEmail, snapshot) {
    const newActivities = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Update state
    state.activities = [
      ...newActivities,
      ...state.activities.filter(a => a.agentEmail !== agentEmail)
    ].sort((a, b) => new Date(b.timestamp.toDate()) - new Date(a.timestamp.toDate()));
    
    // Update cache
    if (window.CacheManager) {
      window.CacheManager.addAgentActivity(newActivities[0]);
    }
    
    // Re-render dashboard
    renderAgentsDashboard();
    
    console.log(`[Agents] Updated activity for ${agentEmail}: ${newActivities.length} new activities`);
  }

  // Stop all real-time listeners
  function stopRealtimeListeners() {
    state.realtimeListeners.forEach((unsubscribe, agentEmail) => {
      try {
        unsubscribe();
        console.log(`[Agents] Stopped listener for ${agentEmail}`);
      } catch (error) {
        console.error(`[Agents] Error stopping listener for ${agentEmail}:`, error);
      }
    });
    state.realtimeListeners.clear();
  }

  // Load agents data with cache-first approach
  async function loadAgentsData() {
    showLoading();
    
    try {
      // 1. Try cache first (free, instant)
      const cachedAgents = await window.CacheManager?.getCachedData('agents');
      if (cachedAgents && cachedAgents.length > 0) {
        console.log('[Agents] Loading from cache (free)');
        state.agents = cachedAgents;
        state.loadedFromCache = true;
        
        // Load activities from cache
        await loadActivitiesFromCache();
        
        // Load Twilio/SendGrid from cache
        await loadTwilioNumbers();
        await loadSendGridEmails();
        
        renderAgentsDashboard();
        hideLoading();
        
        // Schedule background refresh (non-blocking)
        scheduleBackgroundRefresh();
        return;
      }
      
      // 2. Cache miss - load from Firestore
      console.log('[Agents] Cache miss, loading from Firestore');
      await loadFromFirestore();
      
    } catch (error) {
      console.error('[Agents] Error loading data:', error);
      showError('Failed to load agents data. Please try again.');
    }
  }

  // Load from Firestore (expensive operation)
  async function loadFromFirestore() {
    try {
      const db = firebase.firestore();
      
      // Load agents
      const agentsSnapshot = await db.collection('agents').get();
      state.agents = agentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Cache agents data
      if (window.CacheManager) {
        await window.CacheManager.set('agents', state.agents);
      }

      // Load recent activities
      await loadActivitiesFromFirestore();
      
      // Load Twilio phone numbers
      await loadTwilioNumbers();
      
      // Load SendGrid email addresses
      await loadSendGridEmails();

      renderAgentsDashboard();
      hideLoading();
      
    } catch (error) {
      console.error('[Agents] Error loading from Firestore:', error);
      showError('Failed to load agents data. Please try again.');
    }
  }

  // Load activities from cache
  async function loadActivitiesFromCache() {
    if (!window.CacheManager) return;
    
    try {
      const cachedActivities = await window.CacheManager.getCachedData('agent_activities');
      if (cachedActivities && cachedActivities.length > 0) {
        state.activities = cachedActivities;
        console.log('[Agents] Loaded activities from cache');
        return;
      }
    } catch (error) {
      console.warn('[Agents] Error loading activities from cache:', error);
    }
    
    // Fallback to Firestore
    await loadActivitiesFromFirestore();
  }

  // Load activities from Firestore
  async function loadActivitiesFromFirestore() {
    try {
      const db = firebase.firestore();
      const activitiesSnapshot = await db.collection('agent_activities')
        .orderBy('timestamp', 'desc')
        .limit(100)
        .get();
      
      state.activities = activitiesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Cache activities
      if (window.CacheManager) {
        await window.CacheManager.set('agent_activities', state.activities);
      }
      
      console.log('[Agents] Loaded activities from Firestore');
    } catch (error) {
      console.error('[Agents] Error loading activities from Firestore:', error);
    }
  }

  // Schedule background refresh (cost-optimized)
  function scheduleBackgroundRefresh() {
    if (state.backgroundRefresh) return;
    
    // Only refresh every 5 minutes when using cache
    setTimeout(async () => {
      if (state.loadedFromCache && !state.backgroundRefresh) {
        console.log('[Agents] Background refresh started');
        state.backgroundRefresh = true;
        
        try {
          await loadFromFirestore();
          console.log('[Agents] Background refresh completed');
        } catch (error) {
          console.error('[Agents] Background refresh failed:', error);
        } finally {
          state.backgroundRefresh = false;
        }
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  // Load available Twilio phone numbers (cache-first)
  async function loadTwilioNumbers() {
    try {
      // Try cache first (30-minute expiry)
      if (window.CacheManager) {
        const cached = await window.CacheManager.getCachedTwilioNumbers();
        if (cached && cached.length > 0) {
          state.twilioNumbers = cached;
          console.log('[Agents] Loaded Twilio numbers from cache:', cached.length);
          return;
        }
      }
      
      // Cache miss - fetch from API
      const response = await fetch('/api/twilio/phone-numbers', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        state.twilioNumbers = data.phoneNumbers || [];
        
        // Cache for 30 minutes
        if (window.CacheManager) {
          await window.CacheManager.cacheTwilioNumbers(state.twilioNumbers);
        }
        
        console.log('[Agents] Loaded Twilio numbers from API:', state.twilioNumbers.length);
      } else {
        console.warn('[Agents] Failed to load Twilio numbers');
        state.twilioNumbers = [];
      }
    } catch (error) {
      console.error('[Agents] Error loading Twilio numbers:', error);
      state.twilioNumbers = [];
    }
  }

  // Load available SendGrid email addresses (cache-first)
  async function loadSendGridEmails() {
    try {
      // Try cache first (30-minute expiry)
      if (window.CacheManager) {
        const cached = await window.CacheManager.getCachedSendGridEmails();
        if (cached && cached.length > 0) {
          state.sendgridEmails = cached;
          console.log('[Agents] Loaded SendGrid emails from cache:', cached.length);
          return;
        }
      }
      
      // Cache miss - fetch from API
      const response = await fetch('/api/sendgrid/email-addresses', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        state.sendgridEmails = data.emailAddresses || [];
        
        // Cache for 30 minutes
        if (window.CacheManager) {
          await window.CacheManager.cacheSendGridEmails(state.sendgridEmails);
        }
        
        console.log('[Agents] Loaded SendGrid emails from API:', state.sendgridEmails.length);
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

      return `
        <tr>
          <td>
            <div class="agent-cell">
              <div class="agent-avatar">${agent.name.charAt(0).toUpperCase()}</div>
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
              ${agent.assignedPhoneNumber ? 
                `<span class="assigned-resource">${agent.assignedPhoneNumber}</span>` : 
                `<button class="assign-btn small" onclick="assignPhoneNumber('${agent.email}')">Assign</button>`
              }
            </div>
          </td>
          <td>
            <div class="email-assignment">
              ${agent.assignedEmailAddress ? 
                `<span class="assigned-resource">${agent.assignedEmailAddress}</span>` : 
                `<button class="assign-btn small" onclick="assignEmailAddress('${agent.email}')">Assign</button>`
              }
            </div>
          </td>
          <td>${callsToday}</td>
          <td>${emailsToday}</td>
          <td>${tasksToday}</td>
          <td class="current-activity">${currentActivity}</td>
          <td>
            <div class="action-buttons">
              <button class="action-btn small" onclick="viewAgentDetails('${agent.email}')">
                View Details
              </button>
              <button class="action-btn small secondary" onclick="editAgent('${agent.email}')">
                Edit
              </button>
            </div>
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

  // Assign phone number to agent
  async function assignPhoneNumber(agentEmail) {
    if (state.twilioNumbers.length === 0) {
      showError('No available phone numbers. Please add phone numbers to Twilio first.');
      return;
    }

    const availableNumbers = state.twilioNumbers.filter(num => 
      !state.agents.some(agent => agent.assignedPhoneNumber === num.phoneNumber)
    );

    if (availableNumbers.length === 0) {
      showError('All phone numbers are already assigned.');
      return;
    }

    // Show assignment modal
    showPhoneAssignmentModal(agentEmail, availableNumbers);
  }

  // Assign email address to agent
  async function assignEmailAddress(agentEmail) {
    if (state.sendgridEmails.length === 0) {
      showError('No available email addresses. Please add email addresses to SendGrid first.');
      return;
    }

    const availableEmails = state.sendgridEmails.filter(email => 
      !state.agents.some(agent => agent.assignedEmailAddress === email.email)
    );

    if (availableEmails.length === 0) {
      showError('All email addresses are already assigned.');
      return;
    }

    // Show assignment modal
    showEmailAssignmentModal(agentEmail, availableEmails);
  }

  // Show phone assignment modal
  function showPhoneAssignmentModal(agentEmail, availableNumbers) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Assign Phone Number</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
          <p>Select a phone number to assign to <strong>${agentEmail}</strong>:</p>
          <div class="assignment-options">
            ${availableNumbers.map(num => `
              <div class="assignment-option">
                <input type="radio" name="phoneNumber" value="${num.phoneNumber}" id="phone-${num.phoneNumber}">
                <label for="phone-${num.phoneNumber}">
                  <span class="resource-number">${num.phoneNumber}</span>
                  <span class="resource-location">${num.friendlyName || 'No description'}</span>
                </label>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
          <button class="btn-primary" onclick="confirmPhoneAssignment('${agentEmail}')">Assign</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }

  // Show email assignment modal
  function showEmailAssignmentModal(agentEmail, availableEmails) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Assign Email Address</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
          <p>Select an email address to assign to <strong>${agentEmail}</strong>:</p>
          <div class="assignment-options">
            ${availableEmails.map(email => `
              <div class="assignment-option">
                <input type="radio" name="emailAddress" value="${email.email}" id="email-${email.email}">
                <label for="email-${email.email}">
                  <span class="resource-email">${email.email}</span>
                  <span class="resource-name">${email.name || 'No description'}</span>
                </label>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
          <button class="btn-primary" onclick="confirmEmailAssignment('${agentEmail}')">Assign</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }

  // Confirm phone assignment
  async function confirmPhoneAssignment(agentEmail) {
    const selectedPhone = document.querySelector('input[name="phoneNumber"]:checked');
    if (!selectedPhone) {
      showError('Please select a phone number.');
      return;
    }

    try {
      const db = firebase.firestore();
      await db.collection('agents').doc(agentEmail).update({
        assignedPhoneNumber: selectedPhone.value,
        phoneAssignedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Close modal
      document.querySelector('.modal-overlay').remove();
      
      // Refresh data
      await loadAgentsData();
      
      console.log(`[Agents] Assigned phone ${selectedPhone.value} to ${agentEmail}`);
      
    } catch (error) {
      console.error('[Agents] Error assigning phone number:', error);
      showError('Failed to assign phone number. Please try again.');
    }
  }

  // Confirm email assignment
  async function confirmEmailAssignment(agentEmail) {
    const selectedEmail = document.querySelector('input[name="emailAddress"]:checked');
    if (!selectedEmail) {
      showError('Please select an email address.');
      return;
    }

    try {
      const db = firebase.firestore();
      await db.collection('agents').doc(agentEmail).update({
        assignedEmailAddress: selectedEmail.value,
        emailAssignedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Close modal
      document.querySelector('.modal-overlay').remove();
      
      // Refresh data
      await loadAgentsData();
      
      console.log(`[Agents] Assigned email ${selectedEmail.value} to ${agentEmail}`);
      
    } catch (error) {
      console.error('[Agents] Error assigning email address:', error);
      showError('Failed to assign email address. Please try again.');
    }
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
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Add New Agent</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
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
                <option value="midwest">Midwest</option>
                <option value="south">South</option>
              </select>
            </div>
            <div class="form-group">
              <label for="agent-skills">Skills</label>
              <input type="text" id="agent-skills" name="skills" placeholder="cold_calling, email_outreach, closing">
            </div>
            <div class="form-group">
              <label for="agent-goals-calls">Daily Call Goal</label>
              <input type="number" id="agent-goals-calls" name="goals.callsPerDay" min="0" value="50">
            </div>
            <div class="form-group">
              <label for="agent-goals-emails">Daily Email Goal</label>
              <input type="number" id="agent-goals-emails" name="goals.emailsPerDay" min="0" value="20">
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
          <button class="btn-primary" onclick="saveNewAgent()">Add Agent</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }

  // Save new agent
  async function saveNewAgent() {
    const form = document.getElementById('add-agent-form');
    const formData = new FormData(form);
    
    const agentData = {
      name: formData.get('name'),
      email: formData.get('email').toLowerCase(),
      territory: formData.get('territory'),
      skills: formData.get('skills').split(',').map(s => s.trim()).filter(s => s),
      status: 'offline',
      role: 'sales_agent',
      goals: {
        callsPerDay: parseInt(formData.get('goals.callsPerDay')) || 50,
        emailsPerDay: parseInt(formData.get('goals.emailsPerDay')) || 20,
        dealsPerMonth: 5
      },
      performance: {
        totalCalls: 0,
        totalEmails: 0,
        dealsClosed: 0,
        conversionRate: 0
      },
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastActive: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      const db = firebase.firestore();
      await db.collection('agents').doc(agentData.email).set(agentData);

      // Close modal
      document.querySelector('.modal-overlay').remove();
      
      // Refresh data
      await loadAgentsData();
      
      console.log(`[Agents] Added new agent: ${agentData.email}`);
      
    } catch (error) {
      console.error('[Agents] Error adding agent:', error);
      showError('Failed to add agent. Please try again.');
    }
  }

  // Global functions
  window.assignPhoneNumber = assignPhoneNumber;
  window.assignEmailAddress = assignEmailAddress;
  window.confirmPhoneAssignment = confirmPhoneAssignment;
  window.confirmEmailAssignment = confirmEmailAssignment;
  window.saveNewAgent = saveNewAgent;

  window.viewAgentDetails = function(agentEmail) {
    // Navigate to agent detail page
    console.log('Viewing details for agent:', agentEmail);
    window.currentAgentEmail = agentEmail;
    if (window.crm && typeof window.crm.navigateToPage === 'function') {
      window.crm.navigateToPage('agent-details');
    }
  };

  window.editAgent = function(agentEmail) {
    console.log('Editing agent:', agentEmail);
    // TODO: Implement agent editing
  };

  // Initialize when page is shown
  document.addEventListener('DOMContentLoaded', function() {
    // Listen for page navigation
    document.addEventListener('click', function(e) {
      if (e.target.closest('[data-page="agents"]')) {
        initAgentsPage();
      } else {
        // Stop real-time listeners when navigating away
        stopRealtimeListeners();
      }
    });
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', function() {
      stopRealtimeListeners();
    });
  });

})();

