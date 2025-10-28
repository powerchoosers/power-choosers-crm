'use strict';

// Client Management Dashboard - Real Data Integration
(function () {
  const state = {
    loaded: false,
    loading: false,
    userEmail: '',
    isAdmin: false,
    data: {
      accounts: [],
      contacts: [],
      tasks: [],
      calls: [],
      emails: []
    },
    filters: {
      contractStatus: 'all', // all, expiring, active, expired
      communicationStatus: 'all', // all, recent, overdue, dormant
      clientSize: 'all' // all, enterprise, midmarket, smb
    },
    currentPage: 1,
    pageSize: 20
  };

  const els = {};

  function initDomRefs() {
    els.page = document.getElementById('client-management-page');
    els.dashboard = els.page ? els.page.querySelector('.client-dashboard') : null;
    els.refreshBtn = document.getElementById('refresh-client-data');
    els.loadingSpinner = els.page ? els.page.querySelector('.loading-spinner') : null;
    els.errorMessage = els.page ? els.page.querySelector('.error-message') : null;
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

  // Format currency helper
  function formatCurrency(amount) {
    if (!amount || isNaN(amount)) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  // Format number helper
  function formatNumber(num) {
    if (!num || isNaN(num)) return '0';
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  // Format date helper
  function formatDate(dateString) {
    if (!dateString) return 'Not set';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    } catch (e) {
      return 'Invalid date';
    }
  }

  // Calculate days until contract expires
  function getDaysUntilExpiry(contractEndDate) {
    if (!contractEndDate) return null;
    try {
      const endDate = new Date(contractEndDate);
      const today = new Date();
      const diffTime = endDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    } catch (e) {
      return null;
    }
  }

  // Determine contract status
  function getContractStatus(contractEndDate) {
    const days = getDaysUntilExpiry(contractEndDate);
    if (days === null) return 'unknown';
    if (days < 0) return 'expired';
    if (days <= 30) return 'expiring-soon';
    if (days <= 90) return 'expiring';
    return 'active';
  }

  // Determine client size based on employees
  function getClientSize(employees) {
    if (!employees || isNaN(employees)) return 'unknown';
    const emp = parseInt(employees);
    if (emp >= 1000) return 'enterprise';
    if (emp >= 100) return 'midmarket';
    return 'smb';
  }

  // Load real data from Firebase
  async function loadClientData() {
    const db = window.firebaseDB;
    const userEmail = state.userEmail;
    
    if (!db || !userEmail) {
      showError('Database connection or user authentication not available');
      return;
    }

    showLoading();

    try {
      // Load accounts (owned by user)
      const accountsQuery = state.isAdmin 
        ? db.collection('accounts').get()
        : db.collection('accounts').where('ownerId', '==', userEmail).get();
      
      // Load contacts (owned by user)  
      const contactsQuery = state.isAdmin
        ? db.collection('contacts').get()
        : db.collection('contacts').where('ownerId', '==', userEmail).get();
        
      // Load tasks (owned by user)
      const tasksQuery = state.isAdmin
        ? db.collection('tasks').get() 
        : db.collection('tasks').where('ownerId', '==', userEmail).get();

      // Execute queries in parallel
      const [accountsSnap, contactsSnap, tasksSnap] = await Promise.all([
        accountsQuery,
        contactsQuery, 
        tasksQuery
      ]);

      // Process accounts
      state.data.accounts = accountsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Process contacts
      state.data.contacts = contactsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Process tasks
      state.data.tasks = tasksSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Load recent calls and emails (optional - can be added later)
      state.data.calls = [];
      state.data.emails = [];

      console.log(`Loaded ${state.data.accounts.length} accounts, ${state.data.contacts.length} contacts, ${state.data.tasks.length} tasks`);

      hideLoading();
      renderDashboard();

    } catch (error) {
      console.error('Failed to load client data:', error);
      showError('Failed to load client data. Please try again.');
    }
  }

  // Calculate dashboard metrics from real data
  function calculateMetrics() {
    const accounts = state.data.accounts;
    const tasks = state.data.tasks;
    const contacts = state.data.contacts;

    // Contract metrics
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
    const ninetyDaysFromNow = new Date(now.getTime() + (90 * 24 * 60 * 60 * 1000));

    const expiring30Days = accounts.filter(acc => {
      if (!acc.contractEndDate) return false;
      const endDate = new Date(acc.contractEndDate);
      return endDate <= thirtyDaysFromNow && endDate > now;
    }).length;

    const expiring90Days = accounts.filter(acc => {
      if (!acc.contractEndDate) return false;
      const endDate = new Date(acc.contractEndDate);
      return endDate <= ninetyDaysFromNow && endDate > now;
    }).length;

    const expiredContracts = accounts.filter(acc => {
      if (!acc.contractEndDate) return false;
      const endDate = new Date(acc.contractEndDate);
      return endDate < now;
    }).length;

    // Task metrics
    const overdueTasks = tasks.filter(task => {
      if (!task.dueDate || task.status === 'completed') return false;
      const dueDate = new Date(task.dueDate);
      return dueDate < now;
    }).length;

    const pendingTasks = tasks.filter(task => task.status === 'pending').length;

    // Client size metrics
    const enterpriseClients = accounts.filter(acc => getClientSize(acc.employees) === 'enterprise').length;
    const midmarketClients = accounts.filter(acc => getClientSize(acc.employees) === 'midmarket').length;
    const smbClients = accounts.filter(acc => getClientSize(acc.employees) === 'smb').length;

    return {
      contracts: {
        expiring30Days,
        expiring90Days,
        expiredContracts,
        totalActive: accounts.length - expiredContracts
      },
      tasks: {
        overdueTasks,
        pendingTasks,
        totalTasks: tasks.length
      },
      clients: {
        total: accounts.length,
        enterprise: enterpriseClients,
        midmarket: midmarketClients,
        smb: smbClients
      }
    };
  }

  // Create task for account
  async function createTaskForAccount(account, taskType = 'follow-up') {
    const db = window.firebaseDB;
    const userEmail = state.userEmail;
    
    if (!db || !userEmail) return;

    try {
      const taskId = 'task_' + Date.now();
      const taskTitle = `${taskType} — ${account.accountName || account.name || 'Client'}`;
      
      const newTask = {
        id: taskId,
        title: taskTitle,
        account: account.accountName || account.name || '',
        accountId: account.id || '',
        type: taskType,
        priority: 'medium',
        dueDate: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0], // 7 days from now
        dueTime: '09:00',
        status: 'pending',
        notes: `Auto-created for ${account.accountName || account.name}`,
        ownerId: userEmail,
        assignedTo: userEmail,
        createdBy: userEmail,
        createdAt: Date.now()
      };

      // Save to localStorage
      try {
        const existingTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
        existingTasks.unshift(newTask);
        localStorage.setItem('userTasks', JSON.stringify(existingTasks));
      } catch (e) {
        console.warn('Could not save task to localStorage:', e);
      }

      // Save to Firebase
      await db.collection('tasks').add({
        ...newTask,
        timestamp: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || Date.now()
      });

      // Refresh data
      await loadClientData();

      // Show success message
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Task created successfully');
      }

      // Update Today's Tasks widget
      if (window.crm && typeof window.crm.loadTodaysTasks === 'function') {
        window.crm.loadTodaysTasks();
      }

    } catch (error) {
      console.error('Failed to create task:', error);
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Failed to create task', 'error');
      }
    }
  }

  // Render overview statistics
  function renderOverviewStats(metrics) {
    const statCards = els.dashboard.querySelectorAll('.stat-card');
    
    if (statCards.length >= 4) {
      // Total Clients
      const clientsCard = statCards[0];
      const clientsValue = clientsCard.querySelector('.stat-value');
      const clientsLabel = clientsCard.querySelector('.stat-label');
      if (clientsValue) clientsValue.textContent = metrics.clients.total;
      if (clientsLabel) clientsLabel.textContent = 'Total Clients';

      // Expiring Contracts (30 days)
      const expiringCard = statCards[1];
      const expiringValue = expiringCard.querySelector('.stat-value');
      const expiringLabel = expiringCard.querySelector('.stat-label');
      if (expiringValue) expiringValue.textContent = metrics.contracts.expiring30Days;
      if (expiringLabel) expiringLabel.textContent = 'Contracts Expiring (30 days)';

      // Overdue Tasks
      const tasksCard = statCards[2];
      const tasksValue = tasksCard.querySelector('.stat-value');
      const tasksLabel = tasksCard.querySelector('.stat-label');
      if (tasksValue) tasksValue.textContent = metrics.tasks.overdueTasks;
      if (tasksLabel) tasksLabel.textContent = 'Overdue Tasks';

      // Active Contracts
      const activeCard = statCards[3];
      const activeValue = activeCard.querySelector('.stat-value');
      const activeLabel = activeCard.querySelector('.stat-label');
      if (activeValue) activeValue.textContent = metrics.contracts.totalActive;
      if (activeLabel) activeLabel.textContent = 'Active Contracts';
    }
  }

  // Render contract renewal dashboard
  function renderContractRenewalDashboard(metrics) {
    const contractCard = els.dashboard.querySelector('.dashboard-card:has(.card-title:contains("Contract Renewals"))');
    if (!contractCard) return;

    const metricRows = contractCard.querySelectorAll('.metric-row');
    
    if (metricRows.length >= 4) {
      // Expiring in 30 days
      const row30 = metricRows[0];
      const value30 = row30.querySelector('.metric-value');
      const label30 = row30.querySelector('.metric-label');
      if (value30) value30.textContent = metrics.contracts.expiring30Days;
      if (label30) label30.textContent = 'Expiring in 30 days';

      // Expiring in 90 days
      const row90 = metricRows[1];
      const value90 = row90.querySelector('.metric-value');
      const label90 = row90.querySelector('.metric-label');
      if (value90) value90.textContent = metrics.contracts.expiring90Days;
      if (label90) label90.textContent = 'Expiring in 90 days';

      // Expired contracts
      const rowExpired = metricRows[2];
      const valueExpired = rowExpired.querySelector('.metric-value');
      const labelExpired = rowExpired.querySelector('.metric-label');
      if (valueExpired) valueExpired.textContent = metrics.contracts.expiredContracts;
      if (labelExpired) labelExpired.textContent = 'Expired contracts';

      // Total active
      const rowActive = metricRows[3];
      const valueActive = rowActive.querySelector('.metric-value');
      const labelActive = rowActive.querySelector('.metric-label');
      if (valueActive) valueActive.textContent = metrics.contracts.totalActive;
      if (labelActive) labelActive.textContent = 'Active contracts';
    }
  }

  // Render client list with real data
  function renderClientList() {
    const clientListCard = els.dashboard.querySelector('.dashboard-card:has(.card-title:contains("Client List"))');
    if (!clientListCard) return;

    const clientList = clientListCard.querySelector('.client-list');
    if (!clientList) return;

    // Filter accounts based on current filters
    let filteredAccounts = state.data.accounts;

    // Apply contract status filter
    if (state.filters.contractStatus !== 'all') {
      filteredAccounts = filteredAccounts.filter(acc => {
        const status = getContractStatus(acc.contractEndDate);
        return status === state.filters.contractStatus;
      });
    }

    // Apply client size filter
    if (state.filters.clientSize !== 'all') {
      filteredAccounts = filteredAccounts.filter(acc => {
        const size = getClientSize(acc.employees);
        return size === state.filters.clientSize;
      });
    }

    // Sort by contract end date (expiring soon first)
    filteredAccounts.sort((a, b) => {
      const daysA = getDaysUntilExpiry(a.contractEndDate) || 9999;
      const daysB = getDaysUntilExpiry(b.contractEndDate) || 9999;
      return daysA - daysB;
    });

    // Render client items
    clientList.innerHTML = filteredAccounts.slice(0, state.pageSize).map(account => {
      const daysUntilExpiry = getDaysUntilExpiry(account.contractEndDate);
      const contractStatus = getContractStatus(account.contractEndDate);
      const clientSize = getClientSize(account.employees);
      
      // Find primary contact for this account
      const primaryContact = state.data.contacts.find(contact => 
        contact.accountId === account.id || contact.companyName === account.accountName
      );

      // Find tasks for this account
      const accountTasks = state.data.tasks.filter(task => 
        task.accountId === account.id || task.account === account.accountName
      );

      const overdueTasks = accountTasks.filter(task => {
        if (!task.dueDate || task.status === 'completed') return false;
        const dueDate = new Date(task.dueDate);
        return dueDate < new Date();
      }).length;

      return `
        <div class="client-item" data-account-id="${account.id}">
          <div class="client-header">
            <div class="client-name">
              <h4>${account.accountName || account.name || 'Unnamed Client'}</h4>
              <span class="client-size ${clientSize}">${clientSize.toUpperCase()}</span>
            </div>
            <div class="client-actions">
              <button class="btn-sm btn-primary" onclick="window.ClientManagement.createRenewalTask('${account.id}')">
                Create Task
              </button>
            </div>
          </div>
          
          <div class="client-details">
            <div class="detail-row">
              <span class="label">Contract Status:</span>
              <span class="value contract-status ${contractStatus}">
                ${contractStatus === 'expiring-soon' ? 'Expiring Soon' : 
                  contractStatus === 'expiring' ? 'Expiring' :
                  contractStatus === 'expired' ? 'Expired' : 'Active'}
                ${daysUntilExpiry !== null ? `(${daysUntilExpiry} days)` : ''}
              </span>
            </div>
            
            <div class="detail-row">
              <span class="label">Contract End:</span>
              <span class="value">${formatDate(account.contractEndDate)}</span>
            </div>
            
            <div class="detail-row">
              <span class="label">Electricity Supplier:</span>
              <span class="value">${account.electricitySupplier || 'Not set'}</span>
            </div>
            
            <div class="detail-row">
              <span class="label">Annual Usage:</span>
              <span class="value">${formatNumber(account.annualKilowattUsage || account.annualUsage)} kWh</span>
            </div>
            
            <div class="detail-row">
              <span class="label">Current Rate:</span>
              <span class="value">${account.currentRate || 'Not set'}</span>
            </div>
            
            <div class="detail-row">
              <span class="label">Primary Contact:</span>
              <span class="value">${primaryContact ? `${primaryContact.firstName || ''} ${primaryContact.lastName || ''}`.trim() || primaryContact.name : 'No contact'}</span>
            </div>
            
            <div class="detail-row">
              <span class="label">Overdue Tasks:</span>
              <span class="value ${overdueTasks > 0 ? 'overdue' : ''}">${overdueTasks}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Add pagination if needed
    if (filteredAccounts.length > state.pageSize) {
      const pagination = document.createElement('div');
      pagination.className = 'pagination';
      pagination.innerHTML = `
        <button class="btn-sm" onclick="window.ClientManagement.loadMoreClients()">
          Load More (${filteredAccounts.length - state.pageSize} remaining)
        </button>
      `;
      clientList.appendChild(pagination);
    }
  }

  // Render task management dashboard
  function renderTaskDashboard(metrics) {
    const taskCard = els.dashboard.querySelector('.dashboard-card:has(.card-title:contains("Task Management"))');
    if (!taskCard) return;

    const metricRows = taskCard.querySelectorAll('.metric-row');
    
    if (metricRows.length >= 3) {
      // Overdue tasks
      const rowOverdue = metricRows[0];
      const valueOverdue = rowOverdue.querySelector('.metric-value');
      const labelOverdue = rowOverdue.querySelector('.metric-label');
      if (valueOverdue) valueOverdue.textContent = metrics.tasks.overdueTasks;
      if (labelOverdue) labelOverdue.textContent = 'Overdue tasks';

      // Pending tasks
      const rowPending = metricRows[1];
      const valuePending = rowPending.querySelector('.metric-value');
      const labelPending = rowPending.querySelector('.metric-label');
      if (valuePending) valuePending.textContent = metrics.tasks.pendingTasks;
      if (labelPending) labelPending.textContent = 'Pending tasks';

      // Total tasks
      const rowTotal = metricRows[2];
      const valueTotal = rowTotal.querySelector('.metric-value');
      const labelTotal = rowTotal.querySelector('.metric-label');
      if (valueTotal) valueTotal.textContent = metrics.tasks.totalTasks;
      if (labelTotal) labelTotal.textContent = 'Total tasks';
    }
  }

  // Render client segmentation
  function renderClientSegmentation(metrics) {
    const segmentCard = els.dashboard.querySelector('.dashboard-card:has(.card-title:contains("Client Segmentation"))');
    if (!segmentCard) return;

    const segmentItems = segmentCard.querySelectorAll('.segment-item');
    
    if (segmentItems.length >= 3) {
      // Enterprise
      const enterprise = segmentItems[0];
      const enterpriseValue = enterprise.querySelector('.segment-value');
      const enterpriseLabel = enterprise.querySelector('.segment-label');
      if (enterpriseValue) enterpriseValue.textContent = `${metrics.clients.enterprise} clients`;
      if (enterpriseLabel) enterpriseLabel.textContent = 'Enterprise (1000+ employees)';

      // Mid-market
      const midmarket = segmentItems[1];
      const midmarketValue = midmarket.querySelector('.segment-value');
      const midmarketLabel = midmarket.querySelector('.segment-label');
      if (midmarketValue) midmarketValue.textContent = `${metrics.clients.midmarket} clients`;
      if (midmarketLabel) midmarketLabel.textContent = 'Mid-market (100-999 employees)';

      // SMB
      const smb = segmentItems[2];
      const smbValue = smb.querySelector('.segment-value');
      const smbLabel = smb.querySelector('.segment-label');
      if (smbValue) smbValue.textContent = `${metrics.clients.smb} clients`;
      if (smbLabel) smbLabel.textContent = 'SMB (<100 employees)';
    }
  }

  // Main dashboard render function
  function renderDashboard() {
    if (!initDomRefs()) return;

    const metrics = calculateMetrics();

    // Render all dashboard sections
    renderOverviewStats(metrics);
    renderContractRenewalDashboard(metrics);
    renderTaskDashboard(metrics);
    renderClientSegmentation(metrics);
    renderClientList();

    state.loaded = true;
  }

  // Event handlers
  function attachEvents() {
    if (els.refreshBtn) {
      els.refreshBtn.addEventListener('click', async () => {
        await loadClientData();
        // Add visual feedback
        els.refreshBtn.style.transform = 'rotate(360deg)';
        setTimeout(() => {
          els.refreshBtn.style.transform = '';
        }, 300);
      });
    }

    // Add filter event handlers
    const contractStatusFilter = document.getElementById('contract-status-filter');
    const clientSizeFilter = document.getElementById('client-size-filter');
    
    if (contractStatusFilter) {
      contractStatusFilter.addEventListener('change', (e) => {
        state.filters.contractStatus = e.target.value;
        renderClientList();
      });
    }
    
    if (clientSizeFilter) {
      clientSizeFilter.addEventListener('change', (e) => {
        state.filters.clientSize = e.target.value;
        renderClientList();
      });
    }

    // Add click handlers for card actions
    const cardActions = els.dashboard.querySelectorAll('.card-action');
    cardActions.forEach(action => {
      action.addEventListener('click', (e) => {
        e.preventDefault();
        const card = action.closest('.dashboard-card');
        const cardTitle = card.querySelector('.card-title').textContent;
        console.log('Card action clicked:', cardTitle);
      });
    });
  }

  // Public API methods
  async function createRenewalTask(accountId) {
    const account = state.data.accounts.find(acc => acc.id === accountId);
    if (!account) {
      console.error('Account not found:', accountId);
      return;
    }
    await createTaskForAccount(account, 'contract-renewal');
  }

  function loadMoreClients() {
    state.pageSize += 20;
    renderClientList();
  }

  function refresh() {
    if (!state.loaded) return;
    loadClientData();
  }

  function show() {
    if (!initDomRefs()) return;
    
    // Wait for authentication to complete before checking user
    const checkAuth = () => {
      if (window.currentUserEmail) {
        // Update state with current user info
        state.userEmail = window.currentUserEmail;
        state.isAdmin = window.currentUserRole === 'admin';
        
        renderDashboard();
        attachEvents();
        
        // Load data if not already loaded
        if (!state.loaded) {
          loadClientData();
        }
      } else {
        // Wait a bit more for auth to complete
        setTimeout(checkAuth, 100);
      }
    };
    
    // Start checking for authentication
    checkAuth();
  }

  // Public API
  window.ClientManagement = {
    show,
    refresh,
    createRenewalTask,
    loadMoreClients,
    getData: () => state.data,
    getMetrics: () => calculateMetrics(),
    updateData: (newData) => {
      Object.assign(state.data, newData);
      if (state.loaded) {
        renderDashboard();
      }
    }
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.location.hash === '#client-management' || 
          document.getElementById('client-management-page').classList.contains('active')) {
        show();
      }
    });
  } else {
    if (window.location.hash === '#client-management' || 
        document.getElementById('client-management-page').classList.contains('active')) {
      show();
    }
  }
})();
