'use strict';

// Agent Details Page - Real Data Integration
(function () {
  const state = {
    loaded: false,
    loading: false,
    userEmail: window.currentUserEmail || '',
    isAdmin: window.currentUserRole === 'admin',
    currentAgent: null,
    agentActivities: [],
    twilioNumbers: [],
    sendgridEmails: []
  };

  const els = {};

  function initDomRefs() {
    els.page = document.getElementById('agent-details-page');
    els.dashboard = els.page ? els.page.querySelector('.agent-details-dashboard') : null;
    els.loadingSpinner = els.page ? els.page.querySelector('.loading-state') : null;
    els.errorMessage = els.page ? els.page.querySelector('.error-message') : null;
    els.backBtn = document.getElementById('agent-details-back');
    els.editBtn = document.getElementById('edit-agent-btn');
    els.refreshBtn = document.getElementById('refresh-agent-data');
    els.titleEl = document.getElementById('agent-details-title');
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
  function initAgentDetailsPage(agentEmail) {
    // Admin-only access check
    if (window.currentUserRole !== 'admin') {
      console.log('[AgentDetails] Access denied - admin only');
      showError('Access denied. Admin privileges required.');
      return;
    }

    if (!initDomRefs()) {
      console.error('[AgentDetails] Required DOM elements not found');
      return;
    }

    if (!agentEmail) {
      showError('No agent specified.');
      return;
    }

    state.currentAgentEmail = agentEmail;
    console.log('[AgentDetails] Initializing agent details page for:', agentEmail);
    
    loadAgentData();
    setupEventListeners();
    state.loaded = true;
  }

  // Load agent data with cache-first approach
  async function loadAgentData() {
    showLoading();
    
    try {
      // 1. Try to get agent from cached agents list first
      if (window.CacheManager) {
        const cachedAgents = await window.CacheManager.getCachedData('agents');
        const cachedAgent = cachedAgents?.find(agent => agent.email === state.currentAgentEmail);
        
        if (cachedAgent) {
          state.currentAgent = cachedAgent;
          console.log('[AgentDetails] Loaded agent from cache');
          
          // Load activities from cache
          await loadActivitiesFromCache();
          
          // Load Twilio/SendGrid from cache
          await loadTwilioNumbers();
          await loadSendGridEmails();
          
          renderAgentDetails();
          hideLoading();
          
          // Start real-time listener for this specific agent
          startAgentRealtimeListener();
          return;
        }
      }
      
      // 2. Cache miss - load from Firestore
      await loadFromFirestore();
      
    } catch (error) {
      console.error('[AgentDetails] Error loading data:', error);
      showError('Failed to load agent data. Please try again.');
    }
  }

  // Load from Firestore
  async function loadFromFirestore() {
    try {
      const db = firebase.firestore();
      
      // Load agent profile
      const agentDoc = await db.collection('agents').doc(state.currentAgentEmail).get();
      if (!agentDoc.exists) {
        showError('Agent not found.');
        return;
      }
      
      state.currentAgent = {
        id: agentDoc.id,
        ...agentDoc.data()
      };

      // Load agent activities
      await loadActivitiesFromFirestore();
      
      // Load Twilio phone numbers
      await loadTwilioNumbers();
      
      // Load SendGrid email addresses
      await loadSendGridEmails();

      renderAgentDetails();
      hideLoading();
      
      // Start real-time listener
      startAgentRealtimeListener();
      
    } catch (error) {
      console.error('[AgentDetails] Error loading from Firestore:', error);
      showError('Failed to load agent data. Please try again.');
    }
  }

  // Load activities from cache
  async function loadActivitiesFromCache() {
    if (!window.CacheManager) return;
    
    try {
      const cachedActivities = await window.CacheManager.getCachedAgentActivities(state.currentAgentEmail);
      if (cachedActivities && cachedActivities.length > 0) {
        state.agentActivities = cachedActivities;
        console.log('[AgentDetails] Loaded activities from cache');
        return;
      }
    } catch (error) {
      console.warn('[AgentDetails] Error loading activities from cache:', error);
    }
    
    // Fallback to Firestore
    await loadActivitiesFromFirestore();
  }

  // Load activities from Firestore
  async function loadActivitiesFromFirestore() {
    try {
      const db = firebase.firestore();
      const activitiesSnapshot = await db.collection('agent_activities')
        .where('agentEmail', '==', state.currentAgentEmail)
        .orderBy('timestamp', 'desc')
        .limit(50)
        .get();
      
      state.agentActivities = activitiesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Cache activities
      if (window.CacheManager) {
        await window.CacheManager.cacheAgentActivities(state.currentAgentEmail, state.agentActivities);
      }
      
      console.log('[AgentDetails] Loaded activities from Firestore');
    } catch (error) {
      console.error('[AgentDetails] Error loading activities from Firestore:', error);
    }
  }

  // Start real-time listener for this specific agent
  function startAgentRealtimeListener() {
    if (!window.firebaseDB || state.realtimeListener) return;
    
    try {
      state.realtimeListener = firebase.firestore()
        .collection('agent_activities')
        .where('agentEmail', '==', state.currentAgentEmail)
        .orderBy('timestamp', 'desc')
        .limit(10)
        .onSnapshot(snapshot => {
          const newActivities = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          
          // Update state
          state.agentActivities = newActivities;
          
          // Update cache
          if (window.CacheManager) {
            window.CacheManager.cacheAgentActivities(state.currentAgentEmail, newActivities);
          }
          
          // Re-render
          updateActivityTimeline();
          
          console.log(`[AgentDetails] Updated activities: ${newActivities.length} activities`);
        });
      
      console.log(`[AgentDetails] Started real-time listener for ${state.currentAgentEmail}`);
      
    } catch (error) {
      console.error('[AgentDetails] Error starting real-time listener:', error);
    }
  }

  // Stop real-time listener
  function stopAgentRealtimeListener() {
    if (state.realtimeListener) {
      try {
        state.realtimeListener();
        state.realtimeListener = null;
        console.log('[AgentDetails] Stopped real-time listener');
      } catch (error) {
        console.error('[AgentDetails] Error stopping real-time listener:', error);
      }
    }
  }

  // Load available Twilio phone numbers (cache-first)
  async function loadTwilioNumbers() {
    try {
      // Try cache first (30-minute expiry)
      if (window.CacheManager) {
        const cached = await window.CacheManager.getCachedTwilioNumbers();
        if (cached && cached.length > 0) {
          state.twilioNumbers = cached;
          console.log('[AgentDetails] Loaded Twilio numbers from cache:', cached.length);
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
        
        console.log('[AgentDetails] Loaded Twilio numbers from API:', state.twilioNumbers.length);
      } else {
        console.warn('[AgentDetails] Failed to load Twilio numbers');
        state.twilioNumbers = [];
      }
    } catch (error) {
      console.error('[AgentDetails] Error loading Twilio numbers:', error);
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
          console.log('[AgentDetails] Loaded SendGrid emails from cache:', cached.length);
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
        
        console.log('[AgentDetails] Loaded SendGrid emails from API:', state.sendgridEmails.length);
      } else {
        console.warn('[AgentDetails] Failed to load SendGrid emails');
        state.sendgridEmails = [];
      }
    } catch (error) {
      console.error('[AgentDetails] Error loading SendGrid emails:', error);
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

  // Render agent details
  function renderAgentDetails() {
    if (!state.currentAgent) return;

    // Update page title
    if (els.titleEl) {
      els.titleEl.textContent = `${state.currentAgent.name} - Agent Details`;
    }

    // Update profile section
    updateProfileSection();
    
    // Update performance metrics
    updatePerformanceMetrics();
    
    // Update goals and progress
    updateGoalsProgress();
    
    // Update activity timeline
    updateActivityTimeline();
  }

  // Update profile section
  function updateProfileSection() {
    const agent = state.currentAgent;
    
    // Avatar
    const avatarText = document.getElementById('agent-avatar-text');
    if (avatarText) {
      avatarText.textContent = agent.name.charAt(0).toUpperCase();
    }
    
    // Name and email
    const nameEl = document.getElementById('agent-profile-name');
    const emailEl = document.getElementById('agent-profile-email');
    if (nameEl) nameEl.textContent = agent.name;
    if (emailEl) emailEl.textContent = agent.email;
    
    // Status
    const statusBadge = document.getElementById('agent-status-badge');
    const lastActiveEl = document.getElementById('agent-last-active');
    if (statusBadge) {
      statusBadge.textContent = agent.status;
      statusBadge.className = `status-badge ${agent.status}`;
    }
    if (lastActiveEl) {
      const lastActive = agent.lastActive ? 
        new Date(agent.lastActive.toDate()).toLocaleString() : 'Never';
      lastActiveEl.textContent = `Last active: ${lastActive}`;
    }
    
    // Phone and email assignments
    updateResourceAssignments();
  }

  // Update resource assignments
  function updateResourceAssignments() {
    const agent = state.currentAgent;
    
    // Phone number
    const phoneDisplay = document.getElementById('agent-phone-display');
    if (phoneDisplay) {
      if (agent.assignedPhoneNumber) {
        phoneDisplay.innerHTML = `
          <span class="assigned-resource">${agent.assignedPhoneNumber}</span>
          <button class="assign-btn small" onclick="reassignPhoneNumber()">Change</button>
        `;
      } else {
        phoneDisplay.innerHTML = `
          <span class="assigned-resource">Not assigned</span>
          <button class="assign-btn small" onclick="reassignPhoneNumber()">Assign</button>
        `;
      }
    }
    
    // Email address
    const emailDisplay = document.getElementById('agent-email-display');
    if (emailDisplay) {
      if (agent.assignedEmailAddress) {
        emailDisplay.innerHTML = `
          <span class="assigned-resource">${agent.assignedEmailAddress}</span>
          <button class="assign-btn small" onclick="reassignEmailAddress()">Change</button>
        `;
      } else {
        emailDisplay.innerHTML = `
          <span class="assigned-resource">Not assigned</span>
          <button class="assign-btn small" onclick="reassignEmailAddress()">Assign</button>
        `;
      }
    }
  }

  // Update performance metrics
  function updatePerformanceMetrics() {
    const agent = state.currentAgent;
    
    // Total calls
    const totalCalls = agent.performance?.totalCalls || 0;
    const totalCallsEl = document.getElementById('total-calls-metric');
    if (totalCallsEl) totalCallsEl.textContent = totalCalls;
    
    // Total emails
    const totalEmails = agent.performance?.totalEmails || 0;
    const totalEmailsEl = document.getElementById('total-emails-metric');
    if (totalEmailsEl) totalEmailsEl.textContent = totalEmails;
    
    // Deals closed
    const dealsClosed = agent.performance?.dealsClosed || 0;
    const dealsClosedEl = document.getElementById('deals-closed-metric');
    if (dealsClosedEl) dealsClosedEl.textContent = dealsClosed;
    
    // Conversion rate
    const conversionRate = agent.performance?.conversionRate || 0;
    const conversionRateEl = document.getElementById('conversion-rate-metric');
    if (conversionRateEl) conversionRateEl.textContent = `${(conversionRate * 100).toFixed(1)}%`;
  }

  // Update goals and progress
  function updateGoalsProgress() {
    const agent = state.currentAgent;
    const today = new Date().toDateString();
    
    // Calculate today's progress
    const todayActivities = state.agentActivities.filter(activity => 
      new Date(activity.timestamp.toDate()).toDateString() === today
    );
    
    const callsToday = todayActivities.filter(a => a.type === 'call').length;
    const emailsToday = todayActivities.filter(a => a.type === 'email').length;
    const dealsThisMonth = state.agentActivities.filter(a => 
      a.type === 'deal_closed' && 
      new Date(a.timestamp.toDate()).getMonth() === new Date().getMonth()
    ).length;
    
    // Call goal
    const callGoal = agent.goals?.callsPerDay || 50;
    const callProgress = Math.min((callsToday / callGoal) * 100, 100);
    const callGoalTargetEl = document.getElementById('call-goal-target');
    const callGoalCurrentEl = document.getElementById('call-goal-current');
    const callProgressFillEl = document.getElementById('call-progress-fill');
    
    if (callGoalTargetEl) callGoalTargetEl.textContent = callGoal;
    if (callGoalCurrentEl) callGoalCurrentEl.textContent = `${callsToday} / ${callGoal}`;
    if (callProgressFillEl) callProgressFillEl.style.width = `${callProgress}%`;
    
    // Email goal
    const emailGoal = agent.goals?.emailsPerDay || 20;
    const emailProgress = Math.min((emailsToday / emailGoal) * 100, 100);
    const emailGoalTargetEl = document.getElementById('email-goal-target');
    const emailGoalCurrentEl = document.getElementById('email-goal-current');
    const emailProgressFillEl = document.getElementById('email-progress-fill');
    
    if (emailGoalTargetEl) emailGoalTargetEl.textContent = emailGoal;
    if (emailGoalCurrentEl) emailGoalCurrentEl.textContent = `${emailsToday} / ${emailGoal}`;
    if (emailProgressFillEl) emailProgressFillEl.style.width = `${emailProgress}%`;
    
    // Deal goal
    const dealGoal = agent.goals?.dealsPerMonth || 5;
    const dealProgress = Math.min((dealsThisMonth / dealGoal) * 100, 100);
    const dealGoalTargetEl = document.getElementById('deal-goal-target');
    const dealGoalCurrentEl = document.getElementById('deal-goal-current');
    const dealProgressFillEl = document.getElementById('deal-progress-fill');
    
    if (dealGoalTargetEl) dealGoalTargetEl.textContent = dealGoal;
    if (dealGoalCurrentEl) dealGoalCurrentEl.textContent = `${dealsThisMonth} / ${dealGoal}`;
    if (dealProgressFillEl) dealProgressFillEl.style.width = `${dealProgress}%`;
  }

  // Update activity timeline
  function updateActivityTimeline() {
    const timelineEl = document.getElementById('agent-activity-timeline');
    if (!timelineEl) return;
    
    if (state.agentActivities.length === 0) {
      timelineEl.innerHTML = '<p class="no-activity">No recent activity</p>';
      return;
    }
    
    timelineEl.innerHTML = state.agentActivities.map(activity => {
      const timestamp = new Date(activity.timestamp.toDate());
      const timeAgo = getTimeAgo(timestamp);
      
      return `
        <div class="activity-item">
          <div class="activity-icon ${activity.type}">
            ${getActivityIcon(activity.type)}
          </div>
          <div class="activity-content">
            <div class="activity-description">
              ${getActivityDescription(activity)}
            </div>
            <div class="activity-time">${timeAgo}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Get activity icon
  function getActivityIcon(type) {
    const icons = {
      call: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>',
      email: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>',
      task_completed: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,11 12,14 22,4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>',
      deal_closed: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
      note: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14,2 14,8 20,8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10,9 9,9 8,9"></polyline></svg>'
    };
    return icons[type] || '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>';
  }

  // Get activity description
  function getActivityDescription(activity) {
    const details = activity.details || {};
    
    switch (activity.type) {
      case 'call':
        return `Made a call to ${details.contactName || 'contact'} (${details.duration || 0}s) - ${details.outcome || 'No outcome'}`;
      case 'email':
        return `Sent email to ${details.contactName || 'contact'} - ${details.subject || 'No subject'}`;
      case 'task_completed':
        return `Completed task: ${details.taskTitle || 'Untitled task'}`;
      case 'deal_closed':
        return `Closed deal: ${details.dealTitle || 'Untitled deal'} - $${details.dealValue || 0}`;
      case 'note':
        return `Added note: ${details.notePreview || 'Note added'}`;
      default:
        return `${activity.type} activity`;
    }
  }

  // Get time ago string
  function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  // Reassign phone number
  async function reassignPhoneNumber() {
    if (state.twilioNumbers.length === 0) {
      showError('No available phone numbers. Please add phone numbers to Twilio first.');
      return;
    }

    const availableNumbers = state.twilioNumbers.filter(num => 
      num.phoneNumber !== state.currentAgent.assignedPhoneNumber
    );

    if (availableNumbers.length === 0) {
      showError('No other phone numbers available.');
      return;
    }

    showPhoneReassignmentModal(availableNumbers);
  }

  // Reassign email address
  async function reassignEmailAddress() {
    if (state.sendgridEmails.length === 0) {
      showError('No available email addresses. Please add email addresses to SendGrid first.');
      return;
    }

    const availableEmails = state.sendgridEmails.filter(email => 
      email.email !== state.currentAgent.assignedEmailAddress
    );

    if (availableEmails.length === 0) {
      showError('No other email addresses available.');
      return;
    }

    showEmailReassignmentModal(availableEmails);
  }

  // Show phone reassignment modal
  function showPhoneReassignmentModal(availableNumbers) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Reassign Phone Number</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
          <p>Select a new phone number for <strong>${state.currentAgent.name}</strong>:</p>
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
          <button class="btn-primary" onclick="confirmPhoneReassignment()">Reassign</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }

  // Show email reassignment modal
  function showEmailReassignmentModal(availableEmails) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Reassign Email Address</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
          <p>Select a new email address for <strong>${state.currentAgent.name}</strong>:</p>
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
          <button class="btn-primary" onclick="confirmEmailReassignment()">Reassign</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }

  // Confirm phone reassignment
  async function confirmPhoneReassignment() {
    const selectedPhone = document.querySelector('input[name="phoneNumber"]:checked');
    if (!selectedPhone) {
      showError('Please select a phone number.');
      return;
    }

    try {
      const db = firebase.firestore();
      await db.collection('agents').doc(state.currentAgentEmail).update({
        assignedPhoneNumber: selectedPhone.value,
        phoneAssignedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Close modal
      document.querySelector('.modal-overlay').remove();
      
      // Refresh data
      await loadAgentData();
      
      console.log(`[AgentDetails] Reassigned phone ${selectedPhone.value} to ${state.currentAgentEmail}`);
      
    } catch (error) {
      console.error('[AgentDetails] Error reassigning phone number:', error);
      showError('Failed to reassign phone number. Please try again.');
    }
  }

  // Confirm email reassignment
  async function confirmEmailReassignment() {
    const selectedEmail = document.querySelector('input[name="emailAddress"]:checked');
    if (!selectedEmail) {
      showError('Please select an email address.');
      return;
    }

    try {
      const db = firebase.firestore();
      await db.collection('agents').doc(state.currentAgentEmail).update({
        assignedEmailAddress: selectedEmail.value,
        emailAssignedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Close modal
      document.querySelector('.modal-overlay').remove();
      
      // Refresh data
      await loadAgentData();
      
      console.log(`[AgentDetails] Reassigned email ${selectedEmail.value} to ${state.currentAgentEmail}`);
      
    } catch (error) {
      console.error('[AgentDetails] Error reassigning email address:', error);
      showError('Failed to reassign email address. Please try again.');
    }
  }

  // Event listeners
  function setupEventListeners() {
    if (els.backBtn) {
      els.backBtn.addEventListener('click', () => {
        // Navigate back to agents page
        if (window.crm && typeof window.crm.navigateToPage === 'function') {
          window.crm.navigateToPage('agents');
        }
      });
    }

    if (els.editBtn) {
      els.editBtn.addEventListener('click', openEditAgentModal);
    }

    if (els.refreshBtn) {
      els.refreshBtn.addEventListener('click', loadAgentData);
    }
  }

  // Open edit agent modal
  function openEditAgentModal() {
    const agent = state.currentAgent;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Edit Agent</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
          <form id="edit-agent-form">
            <div class="form-group">
              <label for="edit-agent-name">Full Name</label>
              <input type="text" id="edit-agent-name" name="name" value="${agent.name}" required>
            </div>
            <div class="form-group">
              <label for="edit-agent-territory">Territory</label>
              <select id="edit-agent-territory" name="territory" required>
                <option value="west_coast" ${agent.territory === 'west_coast' ? 'selected' : ''}>West Coast</option>
                <option value="east_coast" ${agent.territory === 'east_coast' ? 'selected' : ''}>East Coast</option>
                <option value="midwest" ${agent.territory === 'midwest' ? 'selected' : ''}>Midwest</option>
                <option value="south" ${agent.territory === 'south' ? 'selected' : ''}>South</option>
              </select>
            </div>
            <div class="form-group">
              <label for="edit-agent-skills">Skills</label>
              <input type="text" id="edit-agent-skills" name="skills" value="${agent.skills ? agent.skills.join(', ') : ''}" placeholder="cold_calling, email_outreach, closing">
            </div>
            <div class="form-group">
              <label for="edit-agent-goals-calls">Daily Call Goal</label>
              <input type="number" id="edit-agent-goals-calls" name="goals.callsPerDay" min="0" value="${agent.goals?.callsPerDay || 50}">
            </div>
            <div class="form-group">
              <label for="edit-agent-goals-emails">Daily Email Goal</label>
              <input type="number" id="edit-agent-goals-emails" name="goals.emailsPerDay" min="0" value="${agent.goals?.emailsPerDay || 20}">
            </div>
            <div class="form-group">
              <label for="edit-agent-goals-deals">Monthly Deal Goal</label>
              <input type="number" id="edit-agent-goals-deals" name="goals.dealsPerMonth" min="0" value="${agent.goals?.dealsPerMonth || 5}">
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
          <button class="btn-primary" onclick="saveAgentChanges()">Save Changes</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }

  // Save agent changes
  async function saveAgentChanges() {
    const form = document.getElementById('edit-agent-form');
    const formData = new FormData(form);
    
    const updateData = {
      name: formData.get('name'),
      territory: formData.get('territory'),
      skills: formData.get('skills').split(',').map(s => s.trim()).filter(s => s),
      goals: {
        callsPerDay: parseInt(formData.get('goals.callsPerDay')) || 50,
        emailsPerDay: parseInt(formData.get('goals.emailsPerDay')) || 20,
        dealsPerMonth: parseInt(formData.get('goals.dealsPerMonth')) || 5
      },
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      const db = firebase.firestore();
      await db.collection('agents').doc(state.currentAgentEmail).update(updateData);

      // Close modal
      document.querySelector('.modal-overlay').remove();
      
      // Refresh data
      await loadAgentData();
      
      console.log(`[AgentDetails] Updated agent: ${state.currentAgentEmail}`);
      
    } catch (error) {
      console.error('[AgentDetails] Error updating agent:', error);
      showError('Failed to update agent. Please try again.');
    }
  }

  // Global functions
  window.reassignPhoneNumber = reassignPhoneNumber;
  window.reassignEmailAddress = reassignEmailAddress;
  window.confirmPhoneReassignment = confirmPhoneReassignment;
  window.confirmEmailReassignment = confirmEmailReassignment;
  window.saveAgentChanges = saveAgentChanges;

  // Global function to show agent details
  window.showAgentDetails = function(agentEmail) {
    initAgentDetailsPage(agentEmail);
  };

  // Initialize when page is shown
  document.addEventListener('DOMContentLoaded', function() {
    // Listen for page navigation
    document.addEventListener('click', function(e) {
      if (e.target.closest('[data-page="agent-details"]')) {
        // Get agent email from URL or state
        const agentEmail = window.currentAgentEmail || null;
        if (agentEmail) {
          initAgentDetailsPage(agentEmail);
        }
      } else {
        // Stop real-time listener when navigating away
        stopAgentRealtimeListener();
      }
    });
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', function() {
      stopAgentRealtimeListener();
    });
  });

})();
