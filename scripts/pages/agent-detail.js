'use strict';

// Agent Detail Page - Individual Agent Management
(function () {
  const state = {
    loaded: false,
    loading: false,
    userEmail: window.currentUserEmail || '',
    isAdmin: window.currentUserRole === 'admin',
    agent: null,
    agentEmail: null,
    activities: [],
    performance: {
      calls: [],
      emails: [],
      tasks: [],
      deals: []
    }
  };

  const els = {};

  function initDomRefs() {
    els.page = document.getElementById('agent-detail-page');
    els.loadingSpinner = els.page ? els.page.querySelector('.loading-spinner') : null;
    els.errorMessage = els.page ? els.page.querySelector('.error-message') : null;
    els.backBtn = document.getElementById('agent-detail-back-btn');
    els.agentName = document.getElementById('agent-detail-name');
    els.agentEmail = document.getElementById('agent-detail-email');
    els.agentStatus = document.getElementById('agent-detail-status');
    els.agentTerritory = document.getElementById('agent-detail-territory');
    els.agentRole = document.getElementById('agent-detail-role');
    els.assignedPhone = document.getElementById('assigned-phone');
    els.assignedEmail = document.getElementById('assigned-email');
    els.activitiesTimeline = document.getElementById('activities-timeline');
    els.performanceMetrics = document.getElementById('performance-metrics');
    
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
  function initAgentDetailPage(params = {}) {
    // Admin-only access check
    if (!state.isAdmin) {
      console.log('[AgentDetail] Access denied - admin only');
      showError('Access denied. Admin privileges required.');
      return;
    }

    if (!initDomRefs()) {
      console.error('[AgentDetail] Required DOM elements not found');
      return;
    }

    state.agentEmail = params.agentEmail;
    if (!state.agentEmail) {
      showError('No agent specified.');
      return;
    }

    console.log('[AgentDetail] Initializing agent detail page for:', state.agentEmail);
    loadAgentDetailData();
    setupEventListeners();
    state.loaded = true;
  }

  // Load agent detail data
  async function loadAgentDetailData() {
    showLoading();
    
    try {
      const db = firebase.firestore();
      
      // Load agent data
      const agentDoc = await db.collection('agents').doc(state.agentEmail).get();
      if (!agentDoc.exists) {
        showError('Agent not found.');
        return;
      }
      
      state.agent = {
        id: agentDoc.id,
        ...agentDoc.data()
      };

      // Load agent activities
      const activitiesSnapshot = await db.collection('agent_activities')
        .where('agentEmail', '==', state.agentEmail)
        .orderBy('timestamp', 'desc')
        .limit(50)
        .get();
      
      state.activities = activitiesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Load performance data
      await loadPerformanceData();

      renderAgentDetail();
      hideLoading();
      
    } catch (error) {
      console.error('[AgentDetail] Error loading data:', error);
      showError('Failed to load agent data. Please try again.');
    }
  }

  // Load performance data from various collections
  async function loadPerformanceData() {
    try {
      const db = firebase.firestore();
      
      // Load calls
      const callsSnapshot = await db.collection('calls')
        .where('ownerId', '==', state.agentEmail)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();
      
      state.performance.calls = callsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Load emails
      const emailsSnapshot = await db.collection('emails')
        .where('ownerId', '==', state.agentEmail)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();
      
      state.performance.emails = emailsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Load tasks
      const tasksSnapshot = await db.collection('tasks')
        .where('assignedTo', '==', state.agentEmail)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();
      
      state.performance.tasks = tasksSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Load deals
      const dealsSnapshot = await db.collection('deals')
        .where('ownerId', '==', state.agentEmail)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();
      
      state.performance.deals = dealsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

    } catch (error) {
      console.error('[AgentDetail] Error loading performance data:', error);
    }
  }

  // Render agent detail page
  function renderAgentDetail() {
    if (!state.agent) return;

    // Update basic info
    if (els.agentName) {
      els.agentName.textContent = state.agent.name;
    }
    if (els.agentEmail) {
      els.agentEmail.textContent = state.agent.email;
    }
    if (els.agentStatus) {
      els.agentStatus.textContent = state.agent.status;
      els.agentStatus.className = `status-badge ${state.agent.status}`;
    }
    if (els.agentTerritory) {
      els.agentTerritory.textContent = state.agent.territory || 'Not assigned';
    }
    if (els.agentRole) {
      els.agentRole.textContent = state.agent.role || 'Not assigned';
    }

    // Update assigned resources
    if (els.assignedPhone) {
      const phoneNumber = state.agent.assignedPhoneNumber || 'Not assigned';
      els.assignedPhone.innerHTML = `
        <span class="resource-value">${phoneNumber}</span>
        <button class="assign-btn small" onclick="assignPhoneNumber('${state.agent.email}')">
          ${phoneNumber === 'Not assigned' ? 'Assign' : 'Change'}
        </button>
      `;
    }

    if (els.assignedEmail) {
      const emailAddress = state.agent.assignedEmailAddress || 'Not assigned';
      els.assignedEmail.innerHTML = `
        <span class="resource-value">${emailAddress}</span>
        <button class="assign-btn small" onclick="assignEmailAddress('${state.agent.email}')">
          ${emailAddress === 'Not assigned' ? 'Assign' : 'Change'}
        </button>
      `;
    }

    // Render performance metrics
    renderPerformanceMetrics();
    
    // Render activities timeline
    renderActivitiesTimeline();
  }

  // Render performance metrics
  function renderPerformanceMetrics() {
    if (!els.performanceMetrics) return;

    const today = new Date().toDateString();
    const thisWeek = getWeekDates();
    const thisMonth = getMonthDates();

    const callsToday = state.activities.filter(a => 
      a.type === 'call' && new Date(a.timestamp.toDate()).toDateString() === today
    ).length;

    const emailsToday = state.activities.filter(a => 
      a.type === 'email' && new Date(a.timestamp.toDate()).toDateString() === today
    ).length;

    const tasksCompletedToday = state.activities.filter(a => 
      a.type === 'task_completed' && new Date(a.timestamp.toDate()).toDateString() === today
    ).length;

    const totalCalls = state.performance.calls.length;
    const totalEmails = state.performance.emails.length;
    const totalTasks = state.performance.tasks.length;
    const totalDeals = state.performance.deals.length;

    els.performanceMetrics.innerHTML = `
      <div class="metrics-grid">
        <div class="metric-card">
          <h4>Today's Activity</h4>
          <div class="metric-row">
            <span class="metric-label">Calls</span>
            <span class="metric-value">${callsToday}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Emails</span>
            <span class="metric-value">${emailsToday}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Tasks Completed</span>
            <span class="metric-value">${tasksCompletedToday}</span>
          </div>
        </div>
        
        <div class="metric-card">
          <h4>Total Performance</h4>
          <div class="metric-row">
            <span class="metric-label">Total Calls</span>
            <span class="metric-value">${totalCalls}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Total Emails</span>
            <span class="metric-value">${totalEmails}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Total Tasks</span>
            <span class="metric-value">${totalTasks}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Total Deals</span>
            <span class="metric-value">${totalDeals}</span>
          </div>
        </div>
        
        <div class="metric-card">
          <h4>Goals vs Performance</h4>
          <div class="metric-row">
            <span class="metric-label">Calls Goal</span>
            <span class="metric-value">${state.agent.goals?.callsPerDay || 0}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Emails Goal</span>
            <span class="metric-value">${state.agent.goals?.emailsPerDay || 0}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Deals Goal</span>
            <span class="metric-value">${state.agent.goals?.dealsPerMonth || 0}</span>
          </div>
        </div>
      </div>
    `;
  }

  // Render activities timeline
  function renderActivitiesTimeline() {
    if (!els.activitiesTimeline) return;

    if (state.activities.length === 0) {
      els.activitiesTimeline.innerHTML = `
        <div class="empty-state">
          <p>No recent activity found.</p>
        </div>
      `;
      return;
    }

    els.activitiesTimeline.innerHTML = state.activities.map(activity => {
      const timestamp = activity.timestamp.toDate();
      const timeAgo = getTimeAgo(timestamp);
      
      return `
        <div class="activity-item">
          <div class="activity-icon ${activity.type}">
            ${getActivityIcon(activity.type)}
          </div>
          <div class="activity-content">
            <div class="activity-title">${getActivityTitle(activity)}</div>
            <div class="activity-details">${getActivityDetails(activity)}</div>
            <div class="activity-time">${timeAgo}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Helper functions
  function getWeekDates() {
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const endOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 6));
    return { start: startOfWeek, end: endOfWeek };
  }

  function getMonthDates() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: startOfMonth, end: endOfMonth };
  }

  function getTimeAgo(timestamp) {
    const now = new Date();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  function getActivityIcon(type) {
    const icons = {
      call: '📞',
      email: '📧',
      task_completed: '✅',
      task_created: '📝',
      note: '📄',
      deal: '💰'
    };
    return icons[type] || '📋';
  }

  function getActivityTitle(activity) {
    const titles = {
      call: 'Phone Call',
      email: 'Email Sent',
      task_completed: 'Task Completed',
      task_created: 'Task Created',
      note: 'Note Added',
      deal: 'Deal Updated'
    };
    return titles[activity.type] || 'Activity';
  }

  function getActivityDetails(activity) {
    if (activity.details) {
      if (activity.details.contactName) {
        return `with ${activity.details.contactName}`;
      }
      if (activity.details.accountName) {
        return `for ${activity.details.accountName}`;
      }
      if (activity.details.outcome) {
        return `Outcome: ${activity.details.outcome}`;
      }
    }
    return 'No details available';
  }

  // Event listeners
  function setupEventListeners() {
    if (els.backBtn) {
      els.backBtn.addEventListener('click', () => {
        if (window.crm && typeof window.crm.navigateToPage === 'function') {
          window.crm.navigateToPage('agents');
        }
      });
    }
  }

  // Global functions for phone/email assignment (reuse from agents.js)
  window.assignPhoneNumber = async function(agentEmail) {
    // This will be implemented to reuse the modal from agents.js
    console.log('Assigning phone number for:', agentEmail);
  };

  window.assignEmailAddress = async function(agentEmail) {
    // This will be implemented to reuse the modal from agents.js
    console.log('Assigning email address for:', agentEmail);
  };

  // Initialize when page is shown
  document.addEventListener('DOMContentLoaded', function() {
    // Listen for page navigation
    document.addEventListener('click', function(e) {
      if (e.target.closest('[data-page="agent-detail"]')) {
        // Get parameters from URL or global state
        const params = window.agentDetailParams || {};
        initAgentDetailPage(params);
      }
    });
  });

  // Global function to show agent detail
  window.showAgentDetail = function(agentEmail) {
    window.agentDetailParams = { agentEmail };
    if (window.crm && typeof window.crm.navigateToPage === 'function') {
      window.crm.navigateToPage('agent-detail');
    }
  };

})();
