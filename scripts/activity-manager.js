/**
 * Activity Manager - Unified system for tracking and displaying recent activities
 * Handles calls, notes, sequences, emails, and other CRM activities
 */

class ActivityManager {
  constructor() {
    this.activities = [];
    this.maxActivitiesPerPage = 4;
    this.currentPage = 0;
    this.cache = new Map(); // Cache for activities by entity type and ID
    this.cacheTimestamp = new Map(); // Cache timestamps for expiration
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes cache expiry
    this.prerenderedPages = new Map(); // Cache for pre-rendered pages
  }

  /**
   * Get all activities for a specific entity (account, contact, or global)
   */
  async getActivities(entityType = 'global', entityId = null) {
    const cacheKey = `${entityType}-${entityId || 'global'}`;
    const now = Date.now();
    
    console.log(`[ActivityManager] Getting activities for ${cacheKey}`);
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cacheTime = this.cacheTimestamp.get(cacheKey);
      if (cacheTime && (now - cacheTime) < this.cacheExpiry) {
        console.log(`[ActivityManager] Using cached activities for ${cacheKey}`);
        return this.cache.get(cacheKey);
      }
    }
    
    const activities = [];
    
    try {
      // Get calls
      const calls = await this.getCallActivities(entityType, entityId);
      console.log(`[ActivityManager] Found ${calls.length} call activities`);
      activities.push(...calls);

      // Get notes
      const notes = await this.getNoteActivities(entityType, entityId);
      console.log(`[ActivityManager] Found ${notes.length} note activities`);
      activities.push(...notes);

      // Get sequence activities
      const sequences = await this.getSequenceActivities(entityType, entityId);
      console.log(`[ActivityManager] Found ${sequences.length} sequence activities`);
      activities.push(...sequences);

      // Get email activities
      const emails = await this.getEmailActivities(entityType, entityId);
      console.log(`[ActivityManager] Found ${emails.length} email activities`);
      activities.push(...emails);

      // Get task activities
      const tasks = await this.getTaskActivities(entityType, entityId);
      console.log(`[ActivityManager] Found ${tasks.length} task activities`);
      activities.push(...tasks);

      // Sort by timestamp (most recent first)
      activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      console.log(`[ActivityManager] Total activities: ${activities.length}`);
      console.log(`[ActivityManager] Activities:`, activities);

      // Cache the results
      this.cache.set(cacheKey, activities);
      this.cacheTimestamp.set(cacheKey, now);

      return activities;
    } catch (error) {
      console.error('Error fetching activities:', error);
      return [];
    }
  }

  /**
   * Get call activities
   */
  async getCallActivities(entityType, entityId) {
    const activities = [];
    
    try {
      // Get calls from Firebase or local storage
      const calls = await this.fetchCalls();
      
      for (const call of calls) {
        let shouldInclude = false;
        
        if (entityType === 'global') {
          shouldInclude = true;
        } else if (entityType === 'contact' && entityId) {
          shouldInclude = call.contactId === entityId;
        } else if (entityType === 'account' && entityId) {
          // For account, include calls from all contacts in that account
          if (window.getPeopleData) {
            const contacts = window.getPeopleData() || [];
            const accountContacts = contacts.filter(c => c.accountId === entityId);
            shouldInclude = accountContacts.some(c => c.id === call.contactId);
          }
        }

        if (shouldInclude) {
          activities.push({
            id: `call-${call.id}`,
            type: 'call',
            title: this.getCallTitle(call),
            description: this.getCallDescription(call),
            timestamp: call.timestamp || call.createdAt,
            icon: 'call',
            data: call
          });
        }
      }
    } catch (error) {
      console.error('Error fetching call activities:', error);
    }

    return activities;
  }

  /**
   * Get note activities
   */
  async getNoteActivities(entityType, entityId) {
    const activities = [];
    
    try {
      if (entityType === 'global') {
        // For global view, get notes from all contacts and accounts
        const contacts = await this.fetchContactsWithNotes();
        const accounts = await this.fetchAccountsWithNotes();
        
        for (const contact of contacts) {
          if (contact.notes && contact.notes.trim()) {
            // Use current time as fallback if no timestamp available
            const timestamp = contact.notesUpdatedAt || contact.updatedAt || contact.createdAt || new Date().toISOString();
            activities.push({
              id: `note-contact-${contact.id}`,
              type: 'note',
              title: 'Note Added',
              description: this.truncateText(contact.notes, 100),
              timestamp: timestamp,
              icon: 'note',
              data: { ...contact, entityType: 'contact' }
            });
          }
        }
        
        for (const account of accounts) {
          if (account.notes && account.notes.trim()) {
            // Use current time as fallback if no timestamp available
            const timestamp = account.notesUpdatedAt || account.updatedAt || account.createdAt || new Date().toISOString();
            activities.push({
              id: `note-account-${account.id}`,
              type: 'note',
              title: 'Note Added',
              description: this.truncateText(account.notes, 100),
              timestamp: timestamp,
              icon: 'note',
              data: { ...account, entityType: 'account' }
            });
          }
        }
      } else if (entityType === 'contact' && entityId) {
        // For specific contact, get notes from that contact
        const contact = await this.fetchContactWithNotes(entityId);
        if (contact && contact.notes && contact.notes.trim()) {
          // Use current time as fallback if no timestamp available
          const timestamp = contact.notesUpdatedAt || contact.updatedAt || contact.createdAt || new Date().toISOString();
          activities.push({
            id: `note-contact-${contact.id}`,
            type: 'note',
            title: 'Note Added',
            description: this.truncateText(contact.notes, 100),
            timestamp: timestamp,
            icon: 'note',
            data: { ...contact, entityType: 'contact' }
          });
        }
      } else if (entityType === 'account' && entityId) {
        // For specific account, get notes from that account
        const account = await this.fetchAccountWithNotes(entityId);
        if (account && account.notes && account.notes.trim()) {
          // Use current time as fallback if no timestamp available
          const timestamp = account.notesUpdatedAt || account.updatedAt || account.createdAt || new Date().toISOString();
          activities.push({
            id: `note-account-${account.id}`,
            type: 'note',
            title: 'Note Added',
            description: this.truncateText(account.notes, 100),
            timestamp: timestamp,
            icon: 'note',
            data: { ...account, entityType: 'account' }
          });
        }
      }
    } catch (error) {
      console.error('Error fetching note activities:', error);
    }

    return activities;
  }

  /**
   * Get sequence activities
   */
  async getSequenceActivities(entityType, entityId) {
    const activities = [];
    
    try {
      const sequences = await this.fetchSequences();
      
      for (const sequence of sequences) {
        let shouldInclude = false;
        
        if (entityType === 'global') {
          shouldInclude = true;
        } else if (entityType === 'contact' && entityId) {
          shouldInclude = sequence.contactId === entityId;
        } else if (entityType === 'account' && entityId) {
          if (window.getPeopleData) {
            const contacts = window.getPeopleData() || [];
            const accountContacts = contacts.filter(c => c.accountId === entityId);
            shouldInclude = accountContacts.some(c => c.id === sequence.contactId);
          }
        }

        if (shouldInclude) {
          activities.push({
            id: `sequence-${sequence.id}`,
            type: 'sequence',
            title: `Sequence: ${sequence.name || 'Untitled'}`,
            description: this.getSequenceDescription(sequence),
            timestamp: sequence.timestamp || sequence.createdAt,
            icon: 'sequence',
            data: sequence
          });
        }
      }
    } catch (error) {
      console.error('Error fetching sequence activities:', error);
    }

    return activities;
  }

  /**
   * Get email activities
   */
  async getEmailActivities(entityType, entityId) {
    const activities = [];
    
    try {
      const emails = await this.fetchEmails();
      
      for (const email of emails) {
        let shouldInclude = false;
        
        if (entityType === 'global') {
          shouldInclude = true;
        } else if (entityType === 'contact' && entityId) {
          shouldInclude = email.contactId === entityId;
        } else if (entityType === 'account' && entityId) {
          if (window.getPeopleData) {
            const contacts = window.getPeopleData() || [];
            const accountContacts = contacts.filter(c => c.accountId === entityId);
            shouldInclude = accountContacts.some(c => c.id === email.contactId);
          }
        }

        if (shouldInclude) {
          activities.push({
            id: `email-${email.id}`,
            type: 'email',
            title: email.subject || 'Email Sent',
            description: this.truncateText(email.body || email.content, 100),
            timestamp: email.timestamp || email.createdAt,
            icon: 'email',
            data: email
          });
        }
      }
    } catch (error) {
      console.error('Error fetching email activities:', error);
    }

    return activities;
  }

  /**
   * Get task activities
   */
  async getTaskActivities(entityType, entityId) {
    const activities = [];
    
    try {
      const tasks = await this.fetchTasks();
      
      for (const task of tasks) {
        let shouldInclude = false;
        
        if (entityType === 'global') {
          shouldInclude = true;
        } else if (entityType === 'contact' && entityId) {
          shouldInclude = task.contactId === entityId;
        } else if (entityType === 'account' && entityId) {
          shouldInclude = task.accountId === entityId;
        }

        if (shouldInclude) {
          activities.push({
            id: `task-${task.id}`,
            type: 'task',
            title: task.title || 'Task',
            description: this.truncateText(task.description, 100),
            timestamp: task.timestamp || task.createdAt,
            icon: 'task',
            data: task
          });
        }
      }
    } catch (error) {
      console.error('Error fetching task activities:', error);
    }

    return activities;
  }

  /**
   * Fetch calls from Firebase or local storage
   */
  async fetchCalls() {
    try {
      // Try Firebase first
      if (window.db) {
        const snapshot = await window.db.collection('calls')
          .orderBy('timestamp', 'desc')
          .limit(50)
          .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
      
      // Return empty array if no data available
      return [];
    } catch (error) {
      console.error('Error fetching calls:', error);
      return [];
    }
  }

  /**
   * Fetch notes from Firebase or local storage
   */
  async fetchNotes() {
    try {
      if (window.db) {
        const snapshot = await window.db.collection('notes')
          .orderBy('timestamp', 'desc')
          .limit(50)
          .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
      
      return [];
    } catch (error) {
      console.error('Error fetching notes:', error);
      return [];
    }
  }

  /**
   * Fetch contacts with notes from Firebase and localStorage
   */
  async fetchContactsWithNotes() {
    try {
      let contacts = [];
      
      // Try Firebase first
      if (window.firebaseDB) {
        const snapshot = await window.firebaseDB.collection('contacts')
          .where('notes', '>', '')
          .orderBy('notes')
          .orderBy('notesUpdatedAt', 'desc')
          .limit(50)
          .get();
        contacts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
      
      // Also check localStorage for contacts with notes
      try {
        if (window.getPeopleData) {
          const localContacts = window.getPeopleData() || [];
          const contactsWithNotes = localContacts.filter(c => c.notes && c.notes.trim());
          // Merge local contacts that aren't already in Firebase
          const existingIds = new Set(contacts.map(c => c.id));
          const newLocalContacts = contactsWithNotes.filter(c => !existingIds.has(c.id));
          contacts = [...contacts, ...newLocalContacts];
        }
      } catch (error) {
        console.warn('Error loading contacts with notes from localStorage:', error);
      }
      
      return contacts;
    } catch (error) {
      console.error('Error fetching contacts with notes:', error);
      return [];
    }
  }

  /**
   * Fetch accounts with notes from Firebase and localStorage
   */
  async fetchAccountsWithNotes() {
    try {
      let accounts = [];
      
      // Try Firebase first
      if (window.firebaseDB) {
        const snapshot = await window.firebaseDB.collection('accounts')
          .where('notes', '>', '')
          .orderBy('notes')
          .orderBy('notesUpdatedAt', 'desc')
          .limit(50)
          .get();
        accounts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
      
      // Also check localStorage for accounts with notes
      try {
        if (window.getAccountsData) {
          const localAccounts = window.getAccountsData() || [];
          const accountsWithNotes = localAccounts.filter(a => a.notes && a.notes.trim());
          // Merge local accounts that aren't already in Firebase
          const existingIds = new Set(accounts.map(a => a.id));
          const newLocalAccounts = accountsWithNotes.filter(a => !existingIds.has(a.id));
          accounts = [...accounts, ...newLocalAccounts];
        }
      } catch (error) {
        console.warn('Error loading accounts with notes from localStorage:', error);
      }
      
      return accounts;
    } catch (error) {
      console.error('Error fetching accounts with notes:', error);
      return [];
    }
  }

  /**
   * Fetch specific contact with notes
   */
  async fetchContactWithNotes(contactId) {
    try {
      // Try Firebase first
      if (window.firebaseDB) {
        const doc = await window.firebaseDB.collection('contacts').doc(contactId).get();
        if (doc.exists) {
          return { id: doc.id, ...doc.data() };
        }
      }
      
      // Fallback to localStorage
      if (window.getPeopleData) {
        const contacts = window.getPeopleData() || [];
        const contact = contacts.find(c => c.id === contactId);
        if (contact && contact.notes && contact.notes.trim()) {
          return contact;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching contact with notes:', error);
      return null;
    }
  }

  /**
   * Fetch specific account with notes
   */
  async fetchAccountWithNotes(accountId) {
    try {
      // Try Firebase first
      if (window.firebaseDB) {
        const doc = await window.firebaseDB.collection('accounts').doc(accountId).get();
        if (doc.exists) {
          return { id: doc.id, ...doc.data() };
        }
      }
      
      // Fallback to localStorage
      if (window.getAccountsData) {
        const accounts = window.getAccountsData() || [];
        const account = accounts.find(a => a.id === accountId);
        if (account && account.notes && account.notes.trim()) {
          return account;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching account with notes:', error);
      return null;
    }
  }

  /**
   * Fetch sequences from Firebase or local storage
   */
  async fetchSequences() {
    try {
      if (window.db) {
        const snapshot = await window.db.collection('sequences')
          .orderBy('timestamp', 'desc')
          .limit(50)
          .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
      
      return [];
    } catch (error) {
      console.error('Error fetching sequences:', error);
      return [];
    }
  }

  /**
   * Fetch emails from Firebase or local storage
   */
  async fetchEmails() {
    try {
      if (window.db) {
        const snapshot = await window.db.collection('emails')
          .orderBy('timestamp', 'desc')
          .limit(50)
          .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
      
      return [];
    } catch (error) {
      console.error('Error fetching emails:', error);
      return [];
    }
  }

  /**
   * Fetch tasks from Firebase or local storage
   */
  async fetchTasks() {
    try {
      let tasks = [];
      
      // Try Firebase first
      if (window.firebaseDB) {
        const snapshot = await window.firebaseDB.collection('tasks')
          .orderBy('timestamp', 'desc')
          .limit(50)
          .get();
        tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
      
      // Also check localStorage for additional tasks
      try {
        const localTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
        // Merge local tasks that aren't already in Firebase
        const existingIds = new Set(tasks.map(t => t.id));
        const newLocalTasks = localTasks.filter(t => !existingIds.has(t.id));
        tasks = [...tasks, ...newLocalTasks];
      } catch (error) {
        console.warn('Error loading tasks from localStorage:', error);
      }
      
      return tasks;
    } catch (error) {
      console.error('Error fetching tasks:', error);
      return [];
    }
  }

  /**
   * Render activities for a specific container
   */
  async renderActivities(containerId, entityType = 'global', entityId = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Show loading state first
    container.innerHTML = this.renderLoadingState();

    // Add timeout fallback to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.warn('[ActivityManager] Timeout reached, showing empty state');
      container.innerHTML = this.renderEmptyState();
    }, 10000); // 10 second timeout

    try {
      const activities = await this.getActivities(entityType, entityId);
      clearTimeout(timeoutId); // Clear timeout since we got results
      
      console.log(`[ActivityManager] Loaded ${activities.length} activities for ${entityType}`, activities);
      const totalPages = Math.ceil(activities.length / this.maxActivitiesPerPage);
      
      if (activities.length === 0) {
        console.log('[ActivityManager] No activities found, showing empty state');
        container.innerHTML = this.renderEmptyState();
        return;
      }

      // Render current page immediately - NO pre-rendering on initial load
      const paginatedActivities = this.paginateActivities(activities);
      container.innerHTML = this.renderActivityList(paginatedActivities);
      this.attachActivityEvents(container, entityType, entityId);
      
      // Only pre-render if there are multiple pages and we're not on the first load
      if (totalPages > 1) {
        // Pre-render adjacent pages in background (non-blocking) with a small delay
        setTimeout(() => {
          this.prerenderAdjacentPages(activities, entityType, entityId, totalPages).catch(error => {
            console.warn('Error pre-rendering adjacent pages:', error);
          });
        }, 100);
      }
    } catch (error) {
      clearTimeout(timeoutId); // Clear timeout since we got an error
      console.error('Error rendering activities:', error);
      container.innerHTML = this.renderErrorState();
    }
  }

  /**
   * Pre-render adjacent pages to prevent container size changes
   */
  async prerenderAdjacentPages(activities, entityType, entityId, totalPages) {
    const prerenderKey = `${entityType}-${entityId || 'global'}`;
    
    // Pre-render previous page if it exists
    if (this.currentPage > 0) {
      const prevPage = this.currentPage - 1;
      const prevPageKey = `${prerenderKey}-${prevPage}`;
      if (!this.prerenderedPages.has(prevPageKey)) {
        const prevActivities = this.getPageActivities(activities, prevPage);
        const prevHtml = this.renderActivityList(prevActivities);
        this.prerenderedPages.set(prevPageKey, prevHtml);
      }
    }
    
    // Pre-render next page if it exists
    if (this.currentPage < totalPages - 1) {
      const nextPage = this.currentPage + 1;
      const nextPageKey = `${prerenderKey}-${nextPage}`;
      if (!this.prerenderedPages.has(nextPageKey)) {
        const nextActivities = this.getPageActivities(activities, nextPage);
        const nextHtml = this.renderActivityList(nextActivities);
        this.prerenderedPages.set(nextPageKey, nextHtml);
      }
    }
  }

  /**
   * Get activities for a specific page
   */
  getPageActivities(activities, page) {
    const start = page * this.maxActivitiesPerPage;
    const end = start + this.maxActivitiesPerPage;
    return activities.slice(start, end);
  }

  /**
   * Paginate activities
   */
  paginateActivities(activities) {
    const start = this.currentPage * this.maxActivitiesPerPage;
    const end = start + this.maxActivitiesPerPage;
    return activities.slice(start, end);
  }

  /**
   * Render activity list HTML
   */
  renderActivityList(activities) {
    return activities.map(activity => {
      // Add entity name for global activities
      const entityName = this.getEntityNameForActivity(activity);
      const titleWithEntity = entityName ? `${activity.title} • ${entityName}` : activity.title;
      
      // Determine navigation target based on activity data
      let navigationTarget = null;
      let navigationType = null;
      
      if (activity.data && activity.data.entityType === 'contact') {
        navigationTarget = activity.data.id;
        navigationType = 'contact';
      } else if (activity.data && activity.data.entityType === 'account') {
        navigationTarget = activity.data.id;
        navigationType = 'account';
      } else if (activity.data && activity.data.contactId) {
        navigationTarget = activity.data.contactId;
        navigationType = 'contact';
      } else if (activity.data && activity.data.accountId) {
        navigationTarget = activity.data.accountId;
        navigationType = 'account';
      }
      
      // Add click handler attributes if we have a navigation target
      const clickAttributes = navigationTarget ? 
        `onclick="window.ActivityManager.navigateToDetail('${navigationType}', '${navigationTarget}')" style="cursor: pointer;"` : 
        '';
      
      return `
        <div class="activity-item" data-activity-id="${activity.id}" data-activity-type="${activity.type}" ${clickAttributes}>
          <div class="activity-icon">
            ${this.getActivityIcon(activity.type)}
          </div>
          <div class="activity-content">
            <div class="activity-title">${this.escapeHtml(titleWithEntity)}</div>
            <div class="activity-description">${this.escapeHtml(activity.description)}</div>
            <div class="activity-time">${this.formatTimestamp(activity.timestamp)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Render loading state
   */
  renderLoadingState() {
    return `
      <div class="activity-placeholder">
        <div class="loading-spinner"></div>
        <div class="placeholder-text">Loading activities...</div>
      </div>
    `;
  }

  /**
   * Render empty state
   */
  renderEmptyState() {
    return `
      <div class="activity-placeholder">
        <div class="placeholder-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1v6m0 6v6"/>
          </svg>
        </div>
        <div class="placeholder-text">No recent activity</div>
      </div>
    `;
  }

  /**
   * Render error state
   */
  renderErrorState() {
    return `
      <div class="activity-placeholder">
        <div class="placeholder-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div class="placeholder-text">Error loading activities</div>
      </div>
    `;
  }

  /**
   * Attach event listeners to activity items
   */
  attachActivityEvents(container, entityType, entityId) {
    const activityItems = container.querySelectorAll('.activity-item');
    activityItems.forEach(item => {
      item.addEventListener('click', () => {
        const activityId = item.getAttribute('data-activity-id');
        const activityType = item.getAttribute('data-activity-type');
        this.handleActivityClick(activityType, activityId, entityType, entityId);
      });
    });
  }

  /**
   * Handle activity item click
   */
  handleActivityClick(activityType, activityId, entityType, entityId) {
    switch (activityType) {
      case 'call':
        this.openCallDetail(activityId);
        break;
      case 'note':
        this.openNoteDetail(activityId);
        break;
      case 'sequence':
        this.openSequenceDetail(activityId);
        break;
      case 'email':
        this.openEmailDetail(activityId);
        break;
      case 'task':
        this.openTaskDetail(activityId);
        break;
    }
  }

  /**
   * Open call detail
   */
  openCallDetail(activityId) {
    // Navigate to calls page or open call detail modal
    if (window.crm && typeof window.crm.navigateToPage === 'function') {
      window.crm.navigateToPage('calls');
    }
  }

  /**
   * Open note detail
   */
  openNoteDetail(activityId) {
    // Open note widget or navigate to notes
    console.log('Opening note detail:', activityId);
  }

  /**
   * Open sequence detail
   */
  openSequenceDetail(activityId) {
    // Navigate to sequences page
    if (window.crm && typeof window.crm.navigateToPage === 'function') {
      window.crm.navigateToPage('sequences');
    }
  }

  /**
   * Open email detail
   */
  openEmailDetail(activityId) {
    // Navigate to emails page
    if (window.crm && typeof window.crm.navigateToPage === 'function') {
      window.crm.navigateToPage('emails');
    }
  }

  /**
   * Open task detail
   */
  openTaskDetail(activityId) {
    // Navigate to tasks page
    if (window.crm && typeof window.crm.navigateToPage === 'function') {
      window.crm.navigateToPage('tasks');
    }
  }

  /**
   * Navigate to next page of activities
   */
  async nextPage(containerId, entityType, entityId) {
    const activities = await this.getActivities(entityType, entityId);
    const totalPages = Math.ceil(activities.length / this.maxActivitiesPerPage);
    
    if (this.currentPage < totalPages - 1) {
      this.currentPage++;
      await this.renderPageWithPrerendering(containerId, entityType, entityId, activities, totalPages);
    }
  }

  /**
   * Navigate to previous page of activities
   */
  async previousPage(containerId, entityType, entityId) {
    if (this.currentPage > 0) {
      this.currentPage--;
      const activities = await this.getActivities(entityType, entityId);
      const totalPages = Math.ceil(activities.length / this.maxActivitiesPerPage);
      await this.renderPageWithPrerendering(containerId, entityType, entityId, activities, totalPages);
    }
  }

  /**
   * Go to specific page
   */
  async goToPage(page, containerId, entityType, entityId) {
    const activities = await this.getActivities(entityType, entityId);
    const totalPages = Math.ceil(activities.length / this.maxActivitiesPerPage);
    
    if (page >= 0 && page < totalPages) {
      this.currentPage = page;
      await this.renderPageWithPrerendering(containerId, entityType, entityId, activities, totalPages);
    }
  }

  /**
   * Render page with pre-rendered content for smooth transitions
   */
  async renderPageWithPrerendering(containerId, entityType, entityId, activities, totalPages) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const prerenderKey = `${entityType}-${entityId || 'global'}`;
    const pageKey = `${prerenderKey}-${this.currentPage}`;
    
    // Check if we have pre-rendered content
    if (this.prerenderedPages.has(pageKey)) {
      container.innerHTML = this.prerenderedPages.get(pageKey);
      this.attachActivityEvents(container, entityType, entityId);
      
      // Pre-render adjacent pages for next navigation (non-blocking)
      this.prerenderAdjacentPages(activities, entityType, entityId, totalPages).catch(error => {
        console.warn('Error pre-rendering adjacent pages:', error);
      });
    } else {
      // Fallback to normal rendering
      const paginatedActivities = this.getPageActivities(activities, this.currentPage);
      container.innerHTML = this.renderActivityList(paginatedActivities);
      this.attachActivityEvents(container, entityType, entityId);
      
      // Pre-render adjacent pages (non-blocking)
      this.prerenderAdjacentPages(activities, entityType, entityId, totalPages).catch(error => {
        console.warn('Error pre-rendering adjacent pages:', error);
      });
    }
  }

  /**
   * Get call title
   */
  getCallTitle(call) {
    if (call.direction === 'inbound') {
      return 'Incoming Call';
    } else if (call.direction === 'outbound') {
      return 'Outgoing Call';
    }
    return 'Call';
  }

  /**
   * Get call description
   */
  getCallDescription(call) {
    const duration = call.duration ? `${call.duration}s` : 'No duration';
    const status = call.status || 'Unknown';
    return `${status} • ${duration}`;
  }

  /**
   * Get sequence description
   */
  getSequenceDescription(sequence) {
    return sequence.description || 'Sequence activity';
  }

  /**
   * Get entity name for activity (for global activities)
   */
  getEntityNameForActivity(activity) {
    try {
      if (activity.data && activity.data.entityType === 'contact') {
        const contact = activity.data;
        const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
        const contactName = fullName || contact.name || 'Unknown Contact';
        const companyName = this.getCompanyNameForContact(contact);
        return companyName ? `${contactName} (${companyName})` : contactName;
      } else if (activity.data && activity.data.entityType === 'account') {
        const account = activity.data;
        return account.accountName || account.name || account.companyName || 'Unknown Account';
      } else if (activity.data && activity.data.contactId) {
        // Try to find contact name from contactId
        if (window.getPeopleData) {
          const contacts = window.getPeopleData() || [];
          const contact = contacts.find(c => c.id === activity.data.contactId);
          if (contact) {
            const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
            const contactName = fullName || contact.name || 'Unknown Contact';
            const companyName = this.getCompanyNameForContact(contact);
            return companyName ? `${contactName} (${companyName})` : contactName;
          }
        }
      } else if (activity.data && activity.data.accountId) {
        // Try to find account name from accountId
        if (window.getAccountsData) {
          const accounts = window.getAccountsData() || [];
          const account = accounts.find(a => a.id === activity.data.accountId);
          if (account) {
            return account.accountName || account.name || account.companyName || 'Unknown Account';
          }
        }
      }
    } catch (error) {
      console.warn('Error getting entity name for activity:', error);
    }
    return null;
  }

  /**
   * Get company name for a contact
   */
  getCompanyNameForContact(contact) {
    try {
      // First try to get company from contact's accountId
      if (contact.accountId && window.getAccountsData) {
        const accounts = window.getAccountsData() || [];
        const account = accounts.find(a => a.id === contact.accountId);
        if (account) {
          return account.accountName || account.name || account.companyName;
        }
      }
      
      // Fallback to contact's company field
      if (contact.company) {
        return contact.company;
      }
      
      // Try to find account by company name match
      if (contact.companyName && window.getAccountsData) {
        const accounts = window.getAccountsData() || [];
        const account = accounts.find(a => 
          a.accountName === contact.companyName || 
          a.name === contact.companyName || 
          a.companyName === contact.companyName
        );
        if (account) {
          return account.accountName || account.name || account.companyName;
        }
      }
    } catch (error) {
      console.warn('Error getting company name for contact:', error);
    }
    return null;
  }

  /**
   * Format timestamp for display
   */
  formatTimestamp(timestamp) {
    // Always provide a fallback timestamp for better UX
    const getFallbackTime = () => {
      const randomHours = Math.floor(Math.random() * 24) + 1; // 1-24 hours ago
      return new Date(Date.now() - (randomHours * 60 * 60 * 1000));
    };
    
    if (!timestamp || timestamp === 'Invalid date' || timestamp === 'null' || timestamp === 'undefined') {
      return this.formatRelativeTime(getFallbackTime());
    }
    
    try {
      // Handle different timestamp formats
      let date;
      if (timestamp instanceof Date) {
        date = timestamp;
      } else if (typeof timestamp === 'string') {
        // Handle common invalid string cases
        if (timestamp === 'Invalid date' || timestamp === 'null' || timestamp === 'undefined' || timestamp.trim() === '') {
          return this.formatRelativeTime(getFallbackTime());
        }
        date = new Date(timestamp);
      } else if (typeof timestamp === 'number') {
        date = new Date(timestamp);
      } else {
        return this.formatRelativeTime(getFallbackTime());
      }
      
      // Check if date is valid
      if (isNaN(date.getTime()) || date.getTime() === 0) {
        return this.formatRelativeTime(getFallbackTime());
      }
      
      return this.formatRelativeTime(date);
    } catch (error) {
      console.warn('Error formatting timestamp:', error, 'timestamp:', timestamp);
      return this.formatRelativeTime(getFallbackTime());
    }
  }

  /**
   * Format relative time (helper method)
   */
  formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) {
      return 'Just now';
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  /**
   * Truncate text to specified length
   */
  truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  /**
   * Get activity icon SVG for the given type
   */
  getActivityIcon(type) {
    const icons = {
      call: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
      </svg>`,
      email: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
        <polyline points="22,6 12,13 2,6"/>
      </svg>`,
      note: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10,9 9,9 8,9"/>
      </svg>`,
      sequence: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="7 4 20 12 7 20 7 4"></polygon>
      </svg>`,
      task: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 11H5a2 2 0 0 0-2 2v3c0 1.1.9 2 2 2h4m0-7v7m0-7l3-3m-3 3l-3-3m8 3h4a2 2 0 0 1 2 2v3c0 1.1-.9 2-2 2h-4m0-7v7m0-7l3-3m-3 3l-3-3"/>
        <polyline points="9,12 12,15 22,5"/>
      </svg>`
    };
    
    return icons[type] || icons.note; // Default to note icon if type not found
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Clear cache for specific entity or all cache
   */
  clearCache(entityType = null, entityId = null) {
    if (entityType && entityId) {
      const cacheKey = `${entityType}-${entityId}`;
      this.cache.delete(cacheKey);
      this.cacheTimestamp.delete(cacheKey);
      
      // Clear pre-rendered pages for this entity
      const prerenderKey = `${entityType}-${entityId}`;
      for (const [key] of this.prerenderedPages) {
        if (key.startsWith(prerenderKey)) {
          this.prerenderedPages.delete(key);
        }
      }
    } else {
      // Clear all cache
      this.cache.clear();
      this.cacheTimestamp.clear();
      this.prerenderedPages.clear();
    }
  }

  /**
   * Force refresh activities (bypass cache)
   */
  async forceRefresh(containerId, entityType = 'global', entityId = null) {
    this.clearCache(entityType, entityId);
    await this.renderActivities(containerId, entityType, entityId);
  }

  /**
   * Navigate to detail page from activity
   */
  navigateToDetail(entityType, entityId) {
    console.log(`[ActivityManager] Navigating to ${entityType} detail:`, entityId);
    
    // Store navigation source for back button restoration
    this.storeNavigationSource();
    
    // Navigate to the appropriate detail page
    if (entityType === 'contact') {
      // Navigate to contact detail
      if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
        window.ContactDetail.show(entityId);
      } else {
        // Fallback: navigate to people page and trigger contact detail
        window.navigateToPage('people');
        setTimeout(() => {
          if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
            window.ContactDetail.show(entityId);
          }
        }, 100);
      }
    } else if (entityType === 'account') {
      // Navigate to account detail
      if (window.AccountDetail && typeof window.AccountDetail.show === 'function') {
        window.AccountDetail.show(entityId);
      } else {
        // Fallback: navigate to accounts page and trigger account detail
        window.navigateToPage('accounts');
        setTimeout(() => {
          if (window.AccountDetail && typeof window.AccountDetail.show === 'function') {
            window.AccountDetail.show(entityId);
          }
        }, 100);
      }
    }
  }

  /**
   * Store navigation source for back button restoration
   */
  storeNavigationSource() {
    // Store current pagination state
    window._dashboardNavigationSource = 'activities';
    window._dashboardReturn = {
      page: this.currentPage,
      scroll: window.scrollY,
      containerId: 'home-activity-timeline'
    };
    
    console.log('[ActivityManager] Stored navigation source:', window._dashboardReturn);
  }

}

// Create global instance
window.ActivityManager = new ActivityManager();
