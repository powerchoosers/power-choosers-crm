/**
 * Activity Manager - Unified system for tracking and displaying recent activities
 * Handles calls, notes, sequences, emails, and other CRM activities
 */

class ActivityManager {
  constructor() {
    this.activities = [];
    this.maxActivitiesPerPage = 4;
    this.currentPage = 0;
  }

  /**
   * Get all activities for a specific entity (account, contact, or global)
   */
  async getActivities(entityType = 'global', entityId = null) {
    const activities = [];
    
    try {
      // Get calls
      const calls = await this.getCallActivities(entityType, entityId);
      activities.push(...calls);

      // Get notes
      const notes = await this.getNoteActivities(entityType, entityId);
      activities.push(...notes);

      // Get sequence activities
      const sequences = await this.getSequenceActivities(entityType, entityId);
      activities.push(...sequences);

      // Get email activities
      const emails = await this.getEmailActivities(entityType, entityId);
      activities.push(...emails);

      // Get task activities
      const tasks = await this.getTaskActivities(entityType, entityId);
      activities.push(...tasks);

      // Sort by timestamp (most recent first)
      activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

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
            activities.push({
              id: `note-contact-${contact.id}`,
              type: 'note',
              title: 'Note Added',
              description: this.truncateText(contact.notes, 100),
              timestamp: contact.notesUpdatedAt || contact.updatedAt || contact.createdAt,
              icon: 'note',
              data: { ...contact, entityType: 'contact' }
            });
          }
        }
        
        for (const account of accounts) {
          if (account.notes && account.notes.trim()) {
            activities.push({
              id: `note-account-${account.id}`,
              type: 'note',
              title: 'Note Added',
              description: this.truncateText(account.notes, 100),
              timestamp: account.notesUpdatedAt || account.updatedAt || account.createdAt,
              icon: 'note',
              data: { ...account, entityType: 'account' }
            });
          }
        }
      } else if (entityType === 'contact' && entityId) {
        // For specific contact, get notes from that contact
        const contact = await this.fetchContactWithNotes(entityId);
        if (contact && contact.notes && contact.notes.trim()) {
          activities.push({
            id: `note-contact-${contact.id}`,
            type: 'note',
            title: 'Note Added',
            description: this.truncateText(contact.notes, 100),
            timestamp: contact.notesUpdatedAt || contact.updatedAt || contact.createdAt,
            icon: 'note',
            data: { ...contact, entityType: 'contact' }
          });
        }
      } else if (entityType === 'account' && entityId) {
        // For specific account, get notes from that account
        const account = await this.fetchAccountWithNotes(entityId);
        if (account && account.notes && account.notes.trim()) {
          activities.push({
            id: `note-account-${account.id}`,
            type: 'note',
            title: 'Note Added',
            description: this.truncateText(account.notes, 100),
            timestamp: account.notesUpdatedAt || account.updatedAt || account.createdAt,
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
      
      // Fallback to demo data
      return this.getDemoCalls();
    } catch (error) {
      console.error('Error fetching calls:', error);
      return this.getDemoCalls();
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
      
      return this.getDemoNotes();
    } catch (error) {
      console.error('Error fetching notes:', error);
      return this.getDemoNotes();
    }
  }

  /**
   * Fetch contacts with notes from Firebase
   */
  async fetchContactsWithNotes() {
    try {
      if (window.firebaseDB) {
        const snapshot = await window.firebaseDB.collection('contacts')
          .where('notes', '>', '')
          .orderBy('notes')
          .orderBy('notesUpdatedAt', 'desc')
          .limit(50)
          .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
      return [];
    } catch (error) {
      console.error('Error fetching contacts with notes:', error);
      return [];
    }
  }

  /**
   * Fetch accounts with notes from Firebase
   */
  async fetchAccountsWithNotes() {
    try {
      if (window.firebaseDB) {
        const snapshot = await window.firebaseDB.collection('accounts')
          .where('notes', '>', '')
          .orderBy('notes')
          .orderBy('notesUpdatedAt', 'desc')
          .limit(50)
          .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
      return [];
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
      if (window.firebaseDB) {
        const doc = await window.firebaseDB.collection('contacts').doc(contactId).get();
        if (doc.exists) {
          return { id: doc.id, ...doc.data() };
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
      if (window.firebaseDB) {
        const doc = await window.firebaseDB.collection('accounts').doc(accountId).get();
        if (doc.exists) {
          return { id: doc.id, ...doc.data() };
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
      
      return this.getDemoSequences();
    } catch (error) {
      console.error('Error fetching sequences:', error);
      return this.getDemoSequences();
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
      
      return this.getDemoEmails();
    } catch (error) {
      console.error('Error fetching emails:', error);
      return this.getDemoEmails();
    }
  }

  /**
   * Fetch tasks from Firebase or local storage
   */
  async fetchTasks() {
    try {
      if (window.db) {
        const snapshot = await window.db.collection('tasks')
          .orderBy('timestamp', 'desc')
          .limit(50)
          .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
      
      return this.getDemoTasks();
    } catch (error) {
      console.error('Error fetching tasks:', error);
      return this.getDemoTasks();
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

    try {
      const activities = await this.getActivities(entityType, entityId);
      const paginatedActivities = this.paginateActivities(activities);
      
      if (paginatedActivities.length === 0) {
        container.innerHTML = this.renderEmptyState();
        return;
      }

      container.innerHTML = this.renderActivityList(paginatedActivities);
      this.attachActivityEvents(container, entityType, entityId);
    } catch (error) {
      console.error('Error rendering activities:', error);
      container.innerHTML = this.renderErrorState();
    }
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
    return activities.map(activity => `
      <div class="activity-item" data-activity-id="${activity.id}" data-activity-type="${activity.type}">
        <div class="activity-icon">
          ${this.getActivityIcon(activity.type)}
        </div>
        <div class="activity-content">
          <div class="activity-title">${this.escapeHtml(activity.title)}</div>
          <div class="activity-description">${this.escapeHtml(activity.description)}</div>
          <div class="activity-time">${this.formatTimestamp(activity.timestamp)}</div>
        </div>
      </div>
    `).join('');
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
  nextPage(containerId, entityType, entityId) {
    const activities = this.getActivities(entityType, entityId);
    const totalPages = Math.ceil(activities.length / this.maxActivitiesPerPage);
    
    if (this.currentPage < totalPages - 1) {
      this.currentPage++;
      this.renderActivities(containerId, entityType, entityId);
    }
  }

  /**
   * Navigate to previous page of activities
   */
  previousPage(containerId, entityType, entityId) {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.renderActivities(containerId, entityType, entityId);
    }
  }

  /**
   * Go to specific page
   */
  goToPage(page, containerId, entityType, entityId) {
    const activities = this.getActivities(entityType, entityId);
    const totalPages = Math.ceil(activities.length / this.maxActivitiesPerPage);
    
    if (page >= 0 && page < totalPages) {
      this.currentPage = page;
      this.renderActivities(containerId, entityType, entityId);
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
   * Format timestamp for display
   */
  formatTimestamp(timestamp) {
    if (!timestamp) return 'Unknown time';
    
    const date = new Date(timestamp);
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
   * Demo data for development
   */
  getDemoCalls() {
    return [
      {
        id: 'call-1',
        contactId: 'contact-1',
        direction: 'outbound',
        status: 'completed',
        duration: 180,
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
      },
      {
        id: 'call-2',
        contactId: 'contact-2',
        direction: 'inbound',
        status: 'completed',
        duration: 95,
        timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() // 5 hours ago
      }
    ];
  }

  getDemoNotes() {
    return [
      {
        id: 'note-1',
        contactId: 'contact-1',
        content: 'Follow up on pricing discussion. Customer is interested in our premium package.',
        timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() // 1 hour ago
      },
      {
        id: 'note-2',
        accountId: 'account-1',
        content: 'Meeting scheduled for next week to discuss contract renewal.',
        timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() // 3 hours ago
      }
    ];
  }

  getDemoSequences() {
    return [
      {
        id: 'seq-1',
        contactId: 'contact-1',
        name: 'Welcome Sequence',
        description: 'New customer onboarding',
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() // 4 hours ago
      }
    ];
  }

  getDemoEmails() {
    return [
      {
        id: 'email-1',
        contactId: 'contact-1',
        subject: 'Thank you for your interest',
        body: 'Thank you for reaching out. We will get back to you soon.',
        timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() // 6 hours ago
      }
    ];
  }

  getDemoTasks() {
    return [
      {
        id: 'task-1',
        contactId: 'contact-1',
        title: 'Follow up call',
        description: 'Call customer about pricing proposal',
        timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString() // 8 hours ago
      }
    ];
  }
}

// Create global instance
window.ActivityManager = new ActivityManager();
