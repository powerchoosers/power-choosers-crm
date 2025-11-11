'use strict';

// Client Management Dashboard - Real Data Integration
(function () {
  const state = {
    loaded: false,
    loading: false,
    eventsInitialized: false, // Add this flag
    userEmail: '', // Will be set after auth is ready
    isAdmin: false, // Will be set after auth is ready
    selectedAccountIds: [], // Track which accounts are in client management
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
    els.addAccountBtn = document.getElementById('add-account-client-mgmt-btn');
    els.loadingSpinner = els.page ? els.page.querySelector('.loading-state') : null;
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

  // Wait for auth to be ready
  async function waitForAuth() {
    // Check if auth is already ready
    if (window.currentUserEmail && window.currentUserRole) {
      return true;
    }
    
    // Wait for auth (max 3 seconds)
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (window.currentUserEmail && window.currentUserRole) {
        return true;
      }
    }
    
    // Check Firebase auth directly as fallback
    if (window.firebase && window.firebase.auth && window.firebase.auth().currentUser) {
      const user = window.firebase.auth().currentUser;
      if (user && user.email) {
        const emailLower = user.email.toLowerCase();
        window.currentUserEmail = emailLower;
        window.currentUserRole = (emailLower === 'l.patterson@powerchoosers.com') ? 'admin' : 'employee';
        state.userEmail = emailLower;
        state.isAdmin = window.currentUserRole === 'admin';
        return true;
      }
    }
    
    return false;
  }

  // Helper function to get account ID (normalize across different field names)
  function getAccountId(account) {
    if (!account) return null;
    return account.id || account.accountId || account.docId || null;
  }

  // Load selected account IDs from localStorage
  function loadSelectedAccounts() {
    try {
      const saved = localStorage.getItem('client-management-selected-accounts');
      if (saved) {
        state.selectedAccountIds = JSON.parse(saved);
        console.log('[ClientManagement] Loaded selected account IDs:', state.selectedAccountIds);
      }
    } catch (e) {
      console.warn('[ClientManagement] Failed to load selected accounts:', e);
      state.selectedAccountIds = [];
    }
  }

  // Save selected account IDs to localStorage
  function saveSelectedAccounts() {
    try {
      localStorage.setItem('client-management-selected-accounts', JSON.stringify(state.selectedAccountIds));
    } catch (e) {
      console.warn('[ClientManagement] Failed to save selected accounts:', e);
    }
  }

  // Load real data from cache-first approach
  async function loadClientData() {
    const startTime = performance.now();
    
    // Wait for auth to be ready
    const authReady = await waitForAuth();
    if (!authReady) {
      showError('User authentication required. Please log in.');
      return;
    }
    
    // Update state from global variables (in case they changed)
    state.userEmail = window.currentUserEmail || '';
    state.isAdmin = window.currentUserRole === 'admin';

    // Load selected accounts
    loadSelectedAccounts();

    showLoading();

    try {
      // 1. Load from cache immediately (fastest - no Firebase cost)
      const cachedAccounts = window.BackgroundAccountsLoader?.getAccountsData() || [];
      const cachedContacts = await window.CacheManager?.get('contacts') || [];
      const cachedTasks = await window.CacheManager?.get('tasks') || [];
      
      // BackgroundAccountsLoader already filters accounts based on role
      // Admin sees all accounts, employees see only their own
      // So we can trust the cached data is already filtered correctly
      state.data.accounts = cachedAccounts;
      
      // Filter contacts and tasks by ownership if not admin
      // (These are not pre-filtered by their loaders)
      if (!state.isAdmin && state.userEmail) {
        state.data.contacts = cachedContacts.filter(contact => 
          contact.ownerId === state.userEmail || contact.assignedTo === state.userEmail
        );
        state.data.tasks = cachedTasks.filter(task => 
          task.ownerId === state.userEmail || task.assignedTo === state.userEmail
        );
      } else {
        state.data.contacts = cachedContacts;
        state.data.tasks = cachedTasks;
      }
      
      // 3. Render immediately with cached data
      hideLoading();
      renderDashboard();
      
      const loadTime = performance.now() - startTime;
      console.log(`[ClientManagement] Page loaded in ${loadTime.toFixed(2)}ms from cache`);
      
      // Show helpful message if no accounts exist
      if (state.data.accounts.length === 0) {
        console.log('[ClientManagement] No accounts found. Click "Add Account" to get started.');
      }
      
      // 4. Refresh stale data in background (no UI blocking)
      refreshStaleData();
      
    } catch (error) {
      console.error('[ClientManagement] Failed to load data:', error);
      // Only show error if it's a real error, not just empty data
      if (state.data.accounts.length === 0 && !window.BackgroundAccountsLoader) {
        showError('Failed to load client data. Please refresh the page.');
      }
      hideLoading();
    }
  }

  // Smart cache refresh logic for background updates
  async function refreshStaleData() {
    try {
      // Check cache freshness
      const accountsFresh = window.BackgroundAccountsLoader?.isFromCache() || false;
      const contactsFresh = await window.CacheManager?.isFresh('contacts') || false;
      const tasksFresh = await window.CacheManager?.isFresh('tasks') || false;
      
      // Refresh stale data in background
      if (!accountsFresh) {
        console.log('[ClientManagement] Refreshing stale accounts...');
        await window.BackgroundAccountsLoader?.reload();
      }
      
      if (!contactsFresh) {
        console.log('[ClientManagement] Refreshing stale contacts...');
        await window.CacheManager?.get('contacts'); // Triggers refresh
      }
      
      if (!tasksFresh) {
        console.log('[ClientManagement] Refreshing stale tasks...');
        await window.CacheManager?.get('tasks'); // Triggers refresh
      }
    } catch (error) {
      console.error('[ClientManagement] Background refresh failed:', error);
    }
  }

  // Real-time event listeners for live updates
  function setupRealTimeUpdates() {
    // Listen for auth state changes (user logs in/out)
    if (window.firebase && window.firebase.auth) {
      window.firebase.auth().onAuthStateChanged(async (user) => {
        if (user && user.email) {
          const emailLower = user.email.toLowerCase();
          state.userEmail = emailLower;
          state.isAdmin = window.currentUserRole === 'admin';
          
          // Reload data when user logs in
          if (!state.loaded) {
            await loadClientData();
          }
        } else {
          // User logged out
          state.userEmail = '';
          state.isAdmin = false;
          state.loaded = false;
          showError('User authentication required. Please log in.');
        }
      });
    }
    
    // Listen for account creation from Add Account modal
    if (els.page && !els.page._accountCreatedHandler) {
      els.page._accountCreatedHandler = async function (ev) {
        try {
          console.log('[ClientManagement] New account created, refreshing data...');
          // Reload data to show the new account
          await loadClientData();
        } catch (e) {
          console.error('[ClientManagement] Failed to refresh after account creation:', e);
        }
      };
      els.page.addEventListener('account-created', els.page._accountCreatedHandler);
    }
    
    // Listen for account updates
    document.addEventListener('pc:accounts-loaded', (event) => {
      console.log('[ClientManagement] Accounts updated, refreshing...');
      // BackgroundAccountsLoader already filters accounts based on role
      // Admin sees all, employees see only their own
      const accounts = window.BackgroundAccountsLoader?.getAccountsData() || [];
      state.data.accounts = accounts;
      
      if (state.loaded) {
        renderClientList();
        renderOverviewStats(calculateMetrics());
        renderContractRenewalDashboard(calculateMetrics());
        renderClientSegmentation(calculateMetrics());
      }
    });
    
    // Listen for task updates
    document.addEventListener('tasksUpdated', async () => {
      console.log('[ClientManagement] Tasks updated, refreshing...');
      const tasks = await window.CacheManager?.get('tasks') || [];
      
      if (!state.isAdmin && state.userEmail) {
        state.data.tasks = tasks.filter(task => 
          task.ownerId === state.userEmail || task.assignedTo === state.userEmail
        );
      } else {
        state.data.tasks = tasks;
      }
      
      if (state.loaded) {
        const metrics = calculateMetrics();
        renderOverviewStats(metrics);
        renderTaskDashboard(metrics);
        renderClientList(); // Refresh overdue task counts per client
      }
    });
    
    // Listen for contact updates
    document.addEventListener('pc:contacts-loaded', async () => {
      console.log('[ClientManagement] Contacts updated, refreshing...');
      const contacts = await window.CacheManager?.get('contacts') || [];
      
      if (!state.isAdmin && state.userEmail) {
        state.data.contacts = contacts.filter(contact => 
          contact.ownerId === state.userEmail || contact.assignedTo === state.userEmail
        );
      } else {
        state.data.contacts = contacts;
      }
      
      if (state.loaded) {
        renderClientList(); // Refresh primary contact display
      }
    });
    
    console.log('[ClientManagement] Real-time event listeners initialized');
  }

  // Calculate dashboard metrics from real data
  function calculateMetrics() {
    // Only calculate metrics for selected accounts (accounts in client management)
    const accounts = state.data.accounts.filter(acc => {
      const accountId = getAccountId(acc);
      return accountId && state.selectedAccountIds.includes(accountId);
    });
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
    if (!els.dashboard) return;
    
    // Find the Contract Renewals section
    const allSections = els.dashboard.querySelectorAll('.dashboard-section');
    let contractCard = null;
    
    for (const section of allSections) {
      const sectionTitle = section.querySelector('.section-title');
      if (sectionTitle && sectionTitle.textContent.trim() === 'Contract Renewals') {
        contractCard = section.querySelector('.dashboard-card');
        break;
      }
    }
    
    // Fallback: find by card-title
    if (!contractCard) {
      const allCards = els.dashboard.querySelectorAll('.dashboard-card');
      for (const card of allCards) {
        const title = card.querySelector('.card-title');
        if (title && title.textContent.trim() === 'Contract Renewals') {
          contractCard = card;
          break;
        }
      }
    }
    
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
    if (!els.dashboard) {
      console.warn('[ClientManagement] Dashboard not found, cannot render client list');
      return;
    }

    // Find the Client List card by looking for the section title first, then the card
    const allSections = els.dashboard.querySelectorAll('.dashboard-section');
    let clientListCard = null;
    
    // Find section with "Client List" title
    for (const section of allSections) {
      const sectionTitle = section.querySelector('.section-title');
      if (sectionTitle && sectionTitle.textContent.trim() === 'Client List') {
        // Find the dashboard-card within this section
        clientListCard = section.querySelector('.dashboard-card');
        break;
      }
    }
    
    // Fallback: try to find by card-title text content
    if (!clientListCard) {
      const allCards = els.dashboard.querySelectorAll('.dashboard-card');
      for (const card of allCards) {
        const title = card.querySelector('.card-title');
        if (title && title.textContent.trim() === 'Client List') {
          clientListCard = card;
          break;
        }
      }
    }
    
    if (!clientListCard) {
      console.warn('[ClientManagement] Client List card not found. Dashboard sections:', 
        Array.from(els.dashboard.querySelectorAll('.dashboard-section')).map(s => {
          const title = s.querySelector('.section-title');
          return title ? title.textContent.trim() : 'No title';
        })
      );
      return;
    }

    const clientList = clientListCard.querySelector('.client-list');
    if (!clientList) {
      console.warn('[ClientManagement] .client-list element not found in card');
      return;
    }

    // Filter to only show selected accounts (accounts added to client management)
    let filteredAccounts = state.data.accounts.filter(acc => {
      const accountId = getAccountId(acc);
      return accountId && state.selectedAccountIds.includes(accountId);
    });
    
    console.log('[ClientManagement] Rendering client list:', {
      totalAccounts: state.data.accounts.length,
      selectedIds: state.selectedAccountIds,
      filteredCount: filteredAccounts.length,
      accountIdsInData: state.data.accounts.map(a => getAccountId(a)).filter(Boolean),
      filteredAccounts: filteredAccounts.map(a => ({ 
        id: getAccountId(a), 
        name: a.accountName || a.name 
      }))
    });

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

    // Show empty state if no accounts
    if (filteredAccounts.length === 0) {
      clientList.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-secondary);">
          <p style="margin: 0; font-size: 0.95rem;">No clients added yet.</p>
          <p style="margin: 8px 0 0 0; font-size: 0.85rem; color: var(--text-muted);">
            Click "Add Account" to add clients to Client Management.
          </p>
        </div>
      `;
      return;
    }

    // Sort by contract end date (expiring soon first)
    filteredAccounts.sort((a, b) => {
      const daysA = getDaysUntilExpiry(a.contractEndDate) || 9999;
      const daysB = getDaysUntilExpiry(b.contractEndDate) || 9999;
      return daysA - daysB;
    });

    // Render client items
    clientList.innerHTML = filteredAccounts.slice(0, state.pageSize).map(account => {
      // Get account ID using helper function
      const accountId = getAccountId(account) || '';
      const daysUntilExpiry = getDaysUntilExpiry(account.contractEndDate);
      const contractStatus = getContractStatus(account.contractEndDate);
      const clientSize = getClientSize(account.employees);
      
      // Find primary contact for this account
      const primaryContact = state.data.contacts.find(contact => 
        contact.accountId === accountId || contact.companyName === account.accountName
      );

      // Find tasks for this account
      const accountTasks = state.data.tasks.filter(task => 
        task.accountId === accountId || task.account === account.accountName
      );

      const overdueTasks = accountTasks.filter(task => {
        if (!task.dueDate || task.status === 'completed') return false;
        const dueDate = new Date(task.dueDate);
        return dueDate < new Date();
      }).length;

      return `
        <div class="client-item" data-account-id="${accountId}">
          <div class="client-header">
            <div class="client-name">
              <h4>${account.accountName || account.name || 'Unnamed Client'}</h4>
              <span class="client-size ${clientSize}">${clientSize.toUpperCase()}</span>
            </div>
            <div class="client-actions">
              <button class="btn-sm btn-primary" onclick="window.ClientManagement.createRenewalTask('${accountId}')">
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
    if (!els.dashboard) return;
    
    // Find the Task Management section
    const allSections = els.dashboard.querySelectorAll('.dashboard-section');
    let taskCard = null;
    
    for (const section of allSections) {
      const sectionTitle = section.querySelector('.section-title');
      if (sectionTitle && sectionTitle.textContent.trim() === 'Task Management') {
        taskCard = section.querySelector('.dashboard-card');
        break;
      }
    }
    
    // Fallback: find by card-title
    if (!taskCard) {
      const allCards = els.dashboard.querySelectorAll('.dashboard-card');
      for (const card of allCards) {
        const title = card.querySelector('.card-title');
        if (title && title.textContent.trim() === 'Task Management') {
          taskCard = card;
          break;
        }
      }
    }
    
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
    if (!els.dashboard) return;
    
    // Find the Client Segmentation section
    const allSections = els.dashboard.querySelectorAll('.dashboard-section');
    let segmentCard = null;
    
    for (const section of allSections) {
      const sectionTitle = section.querySelector('.section-title');
      if (sectionTitle && sectionTitle.textContent.trim() === 'Client Segmentation') {
        segmentCard = section.querySelector('.dashboard-card');
        break;
      }
    }
    
    // Fallback: find by card-title
    if (!segmentCard) {
      const allCards = els.dashboard.querySelectorAll('.dashboard-card');
      for (const card of allCards) {
        const title = card.querySelector('.card-title');
        if (title && title.textContent.trim() === 'Client Segmentation') {
          segmentCard = card;
          break;
        }
      }
    }
    
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
    // Add Account button handler - opens search modal
    if (els.addAccountBtn) {
      els.addAccountBtn.addEventListener('click', async () => {
        try {
          openAccountSearchModal();
        } catch (e) {
          console.error('Open Account Search modal failed', e);
        }
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

  // Open account search modal
  function openAccountSearchModal() {
    const modal = document.getElementById('modal-client-mgmt-search');
    if (!modal) {
      console.error('Client Management search modal not found');
      return;
    }

    // Show modal with animation (same as add contact/account modals)
    modal.removeAttribute('hidden');
    
    // Force reflow for animation
    modal.offsetHeight;
    
    // Add show class for animation
    requestAnimationFrame(() => {
      modal.classList.add('show');
    });

    // Focus on search input after animation starts
    setTimeout(() => {
      const searchInput = document.getElementById('client-mgmt-account-search');
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
    }, 150);

    // Initialize search functionality
    initAccountSearch();
  }

  // Close account search modal
  function closeAccountSearchModal() {
    const modal = document.getElementById('modal-client-mgmt-search');
    if (!modal) return;

    // Remove show class for exit animation (same as other modals)
    modal.classList.remove('show');
    
    // Wait for animation to complete before hiding
    setTimeout(() => {
      modal.setAttribute('hidden', '');
      // Clear search
      const searchInput = document.getElementById('client-mgmt-account-search');
      const resultsDropdown = document.getElementById('client-mgmt-search-results');
      if (searchInput) searchInput.value = '';
      if (resultsDropdown) resultsDropdown.setAttribute('hidden', '');
      // Remove dropdown-visible class to reset padding
      const modalBody = modal.querySelector('.pc-modal__body');
      if (modalBody) modalBody.classList.remove('dropdown-visible');
    }, 300); // Match the modal transition duration
  }

  // Initialize account search functionality
  function initAccountSearch() {
    const searchInput = document.getElementById('client-mgmt-account-search');
    const resultsDropdown = document.getElementById('client-mgmt-search-results');
    const resultsList = resultsDropdown?.querySelector('.search-results-list');
    const emptyMessage = resultsDropdown?.querySelector('.search-empty');

    if (!searchInput || !resultsDropdown || !resultsList) return;

    // Remove existing listeners to prevent duplicates
    const newInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newInput, searchInput);

    // Get all accounts from BackgroundAccountsLoader
    const allAccounts = window.BackgroundAccountsLoader?.getAccountsData() || [];

    // Search as user types
    newInput.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();
      const modalBody = document.querySelector('#modal-client-mgmt-search .pc-modal__body');

      if (query.length === 0) {
        // Hide dropdown and collapse padding
        resultsDropdown.setAttribute('hidden', '');
        if (modalBody) modalBody.classList.remove('dropdown-visible');
        return;
      }

      // Filter accounts
      const matches = allAccounts.filter(account => {
        const name = (account.accountName || account.name || '').toLowerCase();
        const industry = (account.industry || '').toLowerCase();
        const city = (account.city || '').toLowerCase();
        const state = (account.state || '').toLowerCase();
        const location = city && state ? `${city}, ${state}`.toLowerCase() : (city || state).toLowerCase();
        return name.includes(query) || industry.includes(query) || city.includes(query) || state.includes(query) || location.includes(query);
      }).slice(0, 10); // Limit to 10 results

      // Show/hide dropdown
      if (matches.length > 0) {
        renderSearchResults(matches, resultsList);
        resultsDropdown.removeAttribute('hidden');
        emptyMessage.setAttribute('hidden', '');
        // Add class to modal body to expand padding
        if (modalBody) modalBody.classList.add('dropdown-visible');
      } else {
        // No matches but query exists - show empty state
        resultsList.innerHTML = '';
        resultsDropdown.removeAttribute('hidden');
        emptyMessage.removeAttribute('hidden');
        // Add class to modal body to expand padding
        if (modalBody) modalBody.classList.add('dropdown-visible');
      }
    });

    // Handle modal close buttons
    const closeButtons = document.querySelectorAll('[data-close="client-search"]');
    closeButtons.forEach(btn => {
      btn.addEventListener('click', closeAccountSearchModal);
    });

    // Close on Escape key
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') {
        closeAccountSearchModal();
        document.removeEventListener('keydown', escHandler);
      }
    });

    // Close dropdown when clicking outside search area (but keep modal open)
    // Delay attachment to prevent immediate closure when modal opens
    setTimeout(() => {
      const modal = document.getElementById('modal-client-mgmt-search');
      if (modal && modal.classList.contains('show')) {
        document.addEventListener('click', function clickOutsideHandler(e) {
          // Only handle if modal is still open
          if (!modal.classList.contains('show')) {
            document.removeEventListener('click', clickOutsideHandler);
            return;
          }
          
          const searchWrap = document.querySelector('.account-search-wrap');
          const dropdown = document.getElementById('client-mgmt-search-results');
          
          if (!searchWrap || !dropdown) return;
          
          // If click is outside the search area and dropdown is visible
          if (!searchWrap.contains(e.target) && !dropdown.hasAttribute('hidden')) {
            dropdown.setAttribute('hidden', '');
            const modalBody = document.querySelector('#modal-client-mgmt-search .pc-modal__body');
            if (modalBody) modalBody.classList.remove('dropdown-visible');
          }
        });
      }
    }, 100); // Small delay to prevent immediate closure
  }

  // Render search results
  function renderSearchResults(accounts, container) {
    if (!container) return;

    container.innerHTML = accounts.map(account => {
      const accountName = account.accountName || account.name || 'Unnamed Account';
      const industry = account.industry || '';
      const city = account.city || '';
      const state = account.state || '';
      const website = account.website || '';
      const logoUrl = account.logoUrl || '';

      // Format location as "city, state" or just city if no state
      let location = '';
      if (city && state) {
        location = `${city}, ${state}`;
      } else if (city) {
        location = city;
      } else if (state) {
        location = state;
      }

      // Extract domain from website
      let domain = '';
      if (website) {
        try {
          const url = new URL(website.includes('://') ? website : 'https://' + website);
          domain = url.hostname.replace(/^www\./, '');
        } catch (e) {
          domain = website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
        }
      }

      // Generate company icon HTML using the favicon helper
      const iconHTML = window.__pcFaviconHelper?.generateCompanyIconHTML({
        logoUrl: logoUrl,
        domain: domain,
        size: 48
      }) || `<div style="width: 48px; height: 48px; background: var(--grey-700); border-radius: 6px;"></div>`;

      // Get account ID using helper function
      const accountId = getAccountId(account) || '';
      
      return `
        <div class="account-search-result" data-account-id="${accountId}">
          <div class="company-icon-wrap">
            ${iconHTML}
          </div>
          <div class="account-info">
            <div class="account-name">${escapeHtml(accountName)}</div>
            <div class="account-details">
              ${industry ? `<span class="account-detail">${escapeHtml(industry)}</span>` : ''}
              ${location ? `<span class="account-detail">${escapeHtml(location)}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers to results
    container.querySelectorAll('.account-search-result').forEach(resultEl => {
      resultEl.addEventListener('click', () => {
        const accountId = resultEl.dataset.accountId;
        if (accountId) {
          handleAccountSelected(accountId);
        } else {
          console.warn('[ClientManagement] No account ID found for selected account');
        }
      });
    });
  }

  // Handle account selection
  function handleAccountSelected(accountId) {
    console.log('[ClientManagement] Account selected:', accountId);
    console.log('[ClientManagement] Current selected IDs:', state.selectedAccountIds);
    console.log('[ClientManagement] Available accounts:', state.data.accounts.map(a => ({
      id: getAccountId(a),
      name: a.accountName || a.name
    })));
    
    if (!accountId) {
      console.warn('[ClientManagement] No account ID provided');
      return;
    }

    // Add account to selected list if not already there
    if (!state.selectedAccountIds.includes(accountId)) {
      state.selectedAccountIds.push(accountId);
      saveSelectedAccounts();
      console.log('[ClientManagement] Account added to client management:', accountId);
      console.log('[ClientManagement] Updated selected IDs:', state.selectedAccountIds);
    } else {
      console.log('[ClientManagement] Account already in client management:', accountId);
    }
    
    // Close the modal
    closeAccountSearchModal();

    // Show success message
    if (window.crm && typeof window.crm.showToast === 'function') {
      window.crm.showToast('Account added to Client Management', 'success');
    }

    // Refresh the dashboard to show the account
    renderDashboard();
  }

  // HTML escape helper
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Public API methods
  async function createRenewalTask(accountId) {
    const account = state.data.accounts.find(acc => getAccountId(acc) === accountId);
    if (!account) {
      console.error('[ClientManagement] Account not found:', accountId);
      console.log('[ClientManagement] Available account IDs:', state.data.accounts.map(a => getAccountId(a)));
      return;
    }
    await createTaskForAccount(account, 'contract-renewal');
  }

  function loadMoreClients() {
    state.pageSize += 20;
    renderClientList();
  }

  async function refresh() {
    if (!state.loaded) return;
    
    console.log('[ClientManagement] Manual refresh triggered');
    
    // Invalidate caches to force fresh data
    await window.CacheManager?.invalidate('accounts');
    await window.CacheManager?.invalidate('contacts');
    await window.CacheManager?.invalidate('tasks');
    
    // Reload from Firestore
    await window.BackgroundAccountsLoader?.reload();
    await window.CacheManager?.get('contacts');
    await window.CacheManager?.get('tasks');
    
    // Data will be updated via event listeners automatically
  }

  async function show() {
    if (!initDomRefs()) return;
    
    // Wait for auth to be ready before checking
    const authReady = await waitForAuth();
    if (!authReady) {
      showError('User authentication required. Please log in.');
      return;
    }
    
    // Update state from global variables
    state.userEmail = window.currentUserEmail || '';
    state.isAdmin = window.currentUserRole === 'admin';

    // Set up real-time updates (only once)
    if (!state.eventsInitialized) {
      setupRealTimeUpdates();
      state.eventsInitialized = true;
    }

    attachEvents();
    
    // Load data if not already loaded
    if (!state.loaded) {
      await loadClientData();
    } else {
      // Already loaded, just render
      renderDashboard();
    }
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

