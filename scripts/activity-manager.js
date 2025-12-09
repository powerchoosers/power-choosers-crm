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
  async getActivities(entityType = 'global', entityId = null, forceRefresh = false) {
    const cacheKey = `${entityType}-${entityId || 'global'}`;
    const now = Date.now();
    
    // Check cache first (unless force refresh)
    if (!forceRefresh && this.cache.has(cacheKey)) {
      const cacheTime = this.cacheTimestamp.get(cacheKey);
      if (cacheTime && (now - cacheTime) < this.cacheExpiry) {
        return this.cache.get(cacheKey);
      }
    }
    
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

      // Sort by timestamp (most recent first) using robust timestamp parsing
      activities.sort((a, b) => {
        const timeA = this.getTimestampMs(a.timestamp);
        const timeB = this.getTimestampMs(b.timestamp);
        return timeB - timeA;
      });


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
            // Use proper timestamp priority: notesUpdatedAt > updatedAt > createdAt
            const timestamp = contact.notesUpdatedAt || contact.updatedAt || contact.createdAt;
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
            // Use proper timestamp priority: notesUpdatedAt > updatedAt > createdAt
            const timestamp = account.notesUpdatedAt || account.updatedAt || account.createdAt;
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
          // Use proper timestamp priority: notesUpdatedAt > updatedAt > createdAt
          const timestamp = contact.notesUpdatedAt || contact.updatedAt || contact.createdAt;
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
          // Use proper timestamp priority: notesUpdatedAt > updatedAt > createdAt
          const timestamp = account.notesUpdatedAt || account.updatedAt || account.createdAt;
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
      
      // Get all contacts from CRM (people.js) - CRITICAL: Only show emails from contacts in CRM
      const allContacts = window.getPeopleData ? (window.getPeopleData() || []) : [];
      const contactIdsSet = new Set(allContacts.map(c => c.id).filter(Boolean));
      const contactEmailsSet = new Set(
        allContacts
          .map(c => {
            const email = (c.email || '').toLowerCase().trim();
            return email || null;
          })
          .filter(Boolean)
      );
      
      // Helper to extract email addresses from string or array
      const extractEmails = (value) => {
        if (!value) return [];
        if (Array.isArray(value)) {
          return value.map(v => String(v || '').toLowerCase().trim()).filter(e => e);
        }
        const str = String(value || '');
        // Extract emails from "Name <email@domain.com>" format or plain email
        const matches = str.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
          return matches.map(e => e.toLowerCase().trim());
      };
      
      // Helper to normalize email for comparison
      const normalizeEmail = (email) => String(email || '').toLowerCase().trim();
      
      // Helper to check if email is from a contact in CRM
      const isEmailFromCrmContact = (email) => {
        // Check by contactId
        if (email.contactId && contactIdsSet.has(email.contactId)) {
          return true;
        }
        
        // Check by email address (to/from fields)
        const emailTo = extractEmails(email.to);
        const emailFrom = extractEmails(email.from);
        const allEmailAddresses = [...emailTo, ...emailFrom];
        
        // Check if any email address matches a contact in CRM
        return allEmailAddresses.some(addr => contactEmailsSet.has(addr));
      };
      
      for (const email of emails) {
        // CRITICAL FILTER: Only include emails from contacts that exist in CRM
        if (!isEmailFromCrmContact(email)) {
          continue; // Skip emails not from CRM contacts
        }
        
        let shouldInclude = false;
        
        if (entityType === 'global') {
          shouldInclude = true;
        } else if (entityType === 'contact' && entityId) {
          // Match by contactId if available
          if (email.contactId === entityId) {
            shouldInclude = true;
          } else {
            // Match by email address - get contact's email from CRM
            const contact = allContacts.find(c => c.id === entityId);
            if (contact) {
              const contactEmail = normalizeEmail(contact.email);
              if (contactEmail) {
                // Check if contact email matches email's to/from fields
                const emailTo = extractEmails(email.to);
                const emailFrom = extractEmails(email.from);
                shouldInclude = emailTo.includes(contactEmail) || emailFrom.includes(contactEmail);
              }
            }
          }
        } else if (entityType === 'account' && entityId) {
          // First check if email has accountId directly
          if (email.accountId === entityId) {
            shouldInclude = true;
          } else {
            // Get account contacts from CRM
            const accountContacts = allContacts.filter(c => c.accountId === entityId);
            
            // Match by contactId (must be in accountContacts from CRM)
            shouldInclude = accountContacts.some(c => c.id === email.contactId);
            
            // Also match by contactCompany name (only if contact is in CRM)
            if (!shouldInclude && email.contactCompany) {
              const account = window.getAccountsData ? 
                (window.getAccountsData() || []).find(a => a.id === entityId) : null;
              if (account) {
                const accountName = account.accountName || account.name || account.companyName || '';
                const emailCompany = String(email.contactCompany || '').trim().toLowerCase();
                const normalizedAccountName = accountName.trim().toLowerCase();
                if (emailCompany && normalizedAccountName && 
                    (emailCompany === normalizedAccountName || 
                     emailCompany.includes(normalizedAccountName) || 
                     normalizedAccountName.includes(emailCompany))) {
                  // Double-check: email must be from a contact in this account
                  const emailTo = extractEmails(email.to);
                  const emailFrom = extractEmails(email.from);
                  const accountContactEmails = accountContacts
                    .map(c => normalizeEmail(c.email))
                    .filter(e => e);
                  shouldInclude = accountContactEmails.some(contactEmail => 
                    emailTo.includes(contactEmail) || emailFrom.includes(contactEmail)
                  );
                }
              }
            }
            
            // Also match by email address (only from accountContacts in CRM)
            if (!shouldInclude) {
              const accountContactEmails = accountContacts
                .map(c => normalizeEmail(c.email))
                .filter(e => e);
              
              if (accountContactEmails.length > 0) {
                const emailTo = extractEmails(email.to);
                const emailFrom = extractEmails(email.from);
                shouldInclude = accountContactEmails.some(contactEmail => 
                  emailTo.includes(contactEmail) || emailFrom.includes(contactEmail)
                );
              }
            }
          }
        }

        if (shouldInclude) {
          // Determine if email is sent or received
          const currentUserEmail = window.DataManager?.getCurrentUserEmail?.() || window.currentUserEmail || '';
          const emailFrom = extractEmails(email.from);
          const isSent = email.type === 'sent' || email.emailType === 'sent' || email.isSentEmail;
          const isReceived = email.type === 'received' || email.emailType === 'received' || 
                            (emailFrom.length > 0 && !emailFrom.some(e => e.includes(currentUserEmail.toLowerCase())));
          
          const emailType = isSent ? 'sent' : (isReceived ? 'received' : 'sent');
          const direction = isSent ? 'Sent' : 'Received';
          
          // Get preview text
          const previewText = email.text || email.snippet || 
            (email.html ? this.stripHtml(email.html) : '') || 
            email.content || email.body || '';
          
          // Get proper timestamp (handle both ISO strings and numbers)
          const emailTimestamp = email.timestamp || email.sentAt || email.receivedAt || email.date || email.createdAt;
          
          activities.push({
            id: `email-${email.id}`,
            type: 'email',
            title: email.subject || `${direction} Email`,
            description: this.truncateText(previewText, 100),
            timestamp: emailTimestamp,
            icon: 'email',
            data: {
              ...email,
              // Ensure entityType is set for proper avatar rendering
              entityType: email.contactId ? 'contact' : (email.accountId ? 'account' : null),
              // Preserve contactId and accountId for navigation
              contactId: email.contactId || null,
              accountId: email.accountId || null
            },
            emailId: email.id // Store email ID for navigation
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
      
      // Helper functions
      const getUserEmail = () => {
        try {
          if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
            return window.DataManager.getCurrentUserEmail();
          }
          return (window.currentUserEmail || '').toLowerCase();
        } catch(_) {
          return (window.currentUserEmail || '').toLowerCase();
        }
      };
      const isAdmin = () => {
        try {
          if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
            return window.DataManager.isCurrentUserAdmin();
          }
          return window.currentUserRole === 'admin';
        } catch(_) {
          return window.currentUserRole === 'admin';
        }
      };
      
      // Try Firebase first
      if (window.firebaseDB) {
        if (!isAdmin()) {
          // Non-admin: filter by ownership
          const email = getUserEmail();
          if (email && window.DataManager && typeof window.DataManager.queryWithOwnership === 'function') {
            // Use DataManager helper
            const allContacts = await window.DataManager.queryWithOwnership('contacts');
            contacts = allContacts.filter(c => c.notes && c.notes.trim()).slice(0, 50);
          } else if (email) {
            // Fallback: try single query with ownerId filter
            try {
              const snapshot = await window.firebaseDB.collection('contacts')
                .where('ownerId', '==', email)
                .where('notes', '>', '')
                .orderBy('notes')
                .orderBy('notesUpdatedAt', 'desc')
                .limit(50)
                .get();
              contacts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (error) {
              // If query fails (missing index), return empty array for non-admin
              console.warn('Error fetching contacts with notes (non-admin query):', error);
              return [];
            }
          } else {
            return [];
          }
        } else {
          // Admin: unrestricted query
          const snapshot = await window.firebaseDB.collection('contacts')
            .where('notes', '>', '')
            .orderBy('notes')
            .orderBy('notesUpdatedAt', 'desc')
            .limit(50)
            .get();
          contacts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
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
      
      // Helper functions
      const getUserEmail = () => {
        try {
          if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
            return window.DataManager.getCurrentUserEmail();
          }
          return (window.currentUserEmail || '').toLowerCase();
        } catch(_) {
          return (window.currentUserEmail || '').toLowerCase();
        }
      };
      const isAdmin = () => {
        try {
          if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
            return window.DataManager.isCurrentUserAdmin();
          }
          return window.currentUserRole === 'admin';
        } catch(_) {
          return window.currentUserRole === 'admin';
        }
      };
      
      // Try Firebase first
      if (window.firebaseDB) {
        if (!isAdmin()) {
          // Non-admin: filter by ownership
          const email = getUserEmail();
          if (email && window.DataManager && typeof window.DataManager.queryWithOwnership === 'function') {
            // Use DataManager helper
            const allAccounts = await window.DataManager.queryWithOwnership('accounts');
            accounts = allAccounts.filter(a => a.notes && a.notes.trim()).slice(0, 50);
          } else if (email) {
            // Fallback: try single query with ownerId filter
            try {
              const snapshot = await window.firebaseDB.collection('accounts')
                .where('ownerId', '==', email)
                .where('notes', '>', '')
                .orderBy('notes')
                .orderBy('notesUpdatedAt', 'desc')
                .limit(50)
                .get();
              accounts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (error) {
              // If query fails (missing index), return empty array for non-admin
              console.warn('Error fetching accounts with notes (non-admin query):', error);
              return [];
            }
          } else {
            return [];
          }
        } else {
          // Admin: unrestricted query
          const snapshot = await window.firebaseDB.collection('accounts')
            .where('notes', '>', '')
            .orderBy('notes')
            .orderBy('notesUpdatedAt', 'desc')
            .limit(50)
            .get();
          accounts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
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
      let emails = [];
      
      // Helper functions
      const getUserEmail = () => {
        try {
          if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
            return window.DataManager.getCurrentUserEmail();
          }
          return (window.currentUserEmail || '').toLowerCase();
        } catch(_) {
          return (window.currentUserEmail || '').toLowerCase();
        }
      };
      const isAdmin = () => {
        try {
          if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
            return window.DataManager.isCurrentUserAdmin();
          }
          return window.currentUserRole === 'admin';
        } catch(_) {
          return window.currentUserRole === 'admin';
        }
      };
      
      // Try Firebase first
      if (window.firebaseDB) {
        if (!isAdmin()) {
          // Non-admin: filter by ownership
          const email = getUserEmail();
          if (email && window.DataManager && typeof window.DataManager.queryWithOwnership === 'function') {
            // Use DataManager helper
            emails = await window.DataManager.queryWithOwnership('emails');
            emails = emails.slice(0, 100); // Get more emails for better filtering
          } else if (email) {
            // Fallback: try query with ownerId filter
            try {
              const snapshot = await window.firebaseDB.collection('emails')
                .where('ownerId', '==', email)
                .orderBy('timestamp', 'desc')
                .limit(100)
                .get();
              emails = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (error) {
              // If query fails (missing index), try without orderBy
              try {
                const snapshot = await window.firebaseDB.collection('emails')
                  .where('ownerId', '==', email)
                  .limit(100)
                  .get();
                emails = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                // Sort client-side
                emails.sort((a, b) => {
                  const timeA = this.getTimestampMs(a.timestamp || a.sentAt || a.receivedAt || a.date || a.createdAt);
                  const timeB = this.getTimestampMs(b.timestamp || b.sentAt || b.receivedAt || b.date || b.createdAt);
                  return timeB - timeA;
                });
              } catch (err2) {
                console.warn('Error fetching emails (non-admin query):', err2);
                return [];
              }
            }
          } else {
            return [];
          }
        } else {
          // Admin: unrestricted query
          try {
            const snapshot = await window.firebaseDB.collection('emails')
              .orderBy('timestamp', 'desc')
              .limit(100)
              .get();
            emails = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          } catch (error) {
            // If orderBy fails, try without it and sort client-side
            try {
              const snapshot = await window.firebaseDB.collection('emails')
                .limit(100)
                .get();
              emails = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              // Sort client-side
              emails.sort((a, b) => {
                const timeA = this.getTimestampMs(a.timestamp || a.sentAt || a.receivedAt || a.date || a.createdAt);
                const timeB = this.getTimestampMs(b.timestamp || b.sentAt || b.receivedAt || b.date || b.createdAt);
                return timeB - timeA;
              });
            } catch (err2) {
              console.warn('Error fetching emails:', err2);
              return [];
            }
          }
        }
      }
      
      return emails;
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
      
      // Helper functions
      const getUserEmail = () => {
        try {
          if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
            return window.DataManager.getCurrentUserEmail();
          }
          return (window.currentUserEmail || '').toLowerCase();
        } catch(_) {
          return (window.currentUserEmail || '').toLowerCase();
        }
      };
      const isAdmin = () => {
        try {
          if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
            return window.DataManager.isCurrentUserAdmin();
          }
          return window.currentUserRole === 'admin';
        } catch(_) {
          return window.currentUserRole === 'admin';
        }
      };
      
      // Try Firebase first
      if (window.firebaseDB) {
        if (!isAdmin()) {
          // Non-admin: filter by ownership
          const email = getUserEmail();
          if (email && window.DataManager && typeof window.DataManager.queryWithOwnership === 'function') {
            // Use DataManager helper
            tasks = await window.DataManager.queryWithOwnership('tasks');
            tasks = tasks.slice(0, 50);
          } else if (email) {
            // Fallback: two separate queries and merge client-side
            try {
              const [ownedSnap, assignedSnap] = await Promise.all([
                window.firebaseDB.collection('tasks').where('ownerId', '==', email).orderBy('timestamp', 'desc').limit(50).get(),
                window.firebaseDB.collection('tasks').where('assignedTo', '==', email).orderBy('timestamp', 'desc').limit(50).get()
              ]);
              const tasksMap = new Map();
              ownedSnap.docs.forEach(doc => tasksMap.set(doc.id, { id: doc.id, ...doc.data() }));
              assignedSnap.docs.forEach(doc => {
                if (!tasksMap.has(doc.id)) tasksMap.set(doc.id, { id: doc.id, ...doc.data() });
              });
              tasks = Array.from(tasksMap.values());
            } catch (error) {
              console.warn('Error fetching tasks (non-admin query):', error);
              return [];
            }
          } else {
            return [];
          }
        } else {
          // Admin: unrestricted query
          const snapshot = await window.firebaseDB.collection('tasks')
            .orderBy('timestamp', 'desc')
            .limit(50)
            .get();
          tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
      }
      
      // Also check localStorage for additional tasks (CRITICAL: filter by ownership for non-admin)
      try {
        const localTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
        let filteredLocalTasks = localTasks;
        if (!isAdmin()) {
          const email = getUserEmail();
          filteredLocalTasks = localTasks.filter(t => {
            if (!t) return false;
            const ownerId = (t.ownerId || '').toLowerCase();
            const assignedTo = (t.assignedTo || '').toLowerCase();
            const createdBy = (t.createdBy || '').toLowerCase();
            return ownerId === email || assignedTo === email || createdBy === email;
          });
        }
        // Merge local tasks that aren't already in Firebase
        const existingIds = new Set(tasks.map(t => t.id));
        const newLocalTasks = filteredLocalTasks.filter(t => !existingIds.has(t.id));
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
  async renderActivities(containerId, entityType = 'global', entityId = null, forceRefresh = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Show loading state first
    container.innerHTML = this.renderLoadingState();

    // Add timeout fallback to prevent infinite loading
    const timeoutId = setTimeout(() => {
      container.innerHTML = this.renderEmptyState();
    }, 30000); // 30 second timeout

    try {
      const activities = await this.getActivities(entityType, entityId, forceRefresh);
      clearTimeout(timeoutId); // Clear timeout since we got results
      
      const totalPages = Math.ceil(activities.length / this.maxActivitiesPerPage);
      // Clamp page in case a prior page index (from dashboard) exceeds this view's page count
      if (this.currentPage < 0 || this.currentPage >= totalPages) {
        this.currentPage = 0;
      }
      
      if (activities.length === 0) {
        container.innerHTML = this.renderEmptyState();
        return;
      }

      // Render current page immediately
      const paginatedActivities = this.getPageActivities(activities, this.currentPage);
      const activityHtml = this.renderActivityList(paginatedActivities);
      
      // Always replace the loading state - with fallback
      if (activityHtml && activityHtml.trim().length > 0) {
        container.innerHTML = activityHtml;
        this.attachActivityEvents(container, entityType, entityId);
      } else {
        container.innerHTML = this.renderEmptyState();
      }
      
      // CRITICAL: Ensure loading state is always cleared with a fallback
      setTimeout(() => {
        if (container.innerHTML.includes('loading-spinner')) {
          container.innerHTML = this.renderEmptyState();
        }
      }, 100);
      
      // Show pagination if there are multiple pages
      this.updatePagination(containerId, totalPages);
      
      // Only pre-render if there are multiple pages and we're not on the first load
      if (totalPages > 1) {
        // Pre-render adjacent pages in background (non-blocking) with a small delay
        setTimeout(() => {
          this.prerenderAdjacentPages(activities, entityType, entityId, totalPages).catch(error => {
            // Silent error handling
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
    const result = activities.slice(start, end);
    return result;
  }

  /**
   * Render activity list HTML
   */
  renderActivityList(activities) {
    if (!activities || activities.length === 0) {
      return '';
    }

    try {
      const result = activities.map(activity => {
        try {
          // Add entity name for global activities - with error handling
          let entityName = null;
          try {
            entityName = this.getEntityNameForActivity(activity);
          } catch (error) {
            entityName = null;
          }
          
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
          
          
          // Get entity avatar for the activity
          const entityAvatar = this.getEntityAvatarForActivity(activity);
          
          // Add emailId data attribute for email activities
          const emailIdAttr = activity.emailId ? `data-email-id="${activity.emailId}"` : '';
          
          return `
            <div class="activity-item" data-activity-id="${activity.id}" data-activity-type="${activity.type}" ${emailIdAttr} ${clickAttributes}>
            <div class="activity-entity-avatar">
              ${entityAvatar}
            </div>
            <div class="activity-content">
                <div class="activity-title">${this.escapeHtml(activity.title)}</div>
                <div class="activity-entity">${this.escapeHtml(entityName || '')}</div>
              <div class="activity-description">${this.escapeHtml(activity.description || '')}</div>
              <div class="activity-time">${this.formatTimestamp(activity.timestamp)}</div>
            </div>
            <div class="activity-icon activity-icon--${activity.type}">
              ${this.getActivityIcon(activity.type)}
            </div>
          </div>
          `;
        } catch (error) {
          console.error('[ActivityManager] Error rendering individual activity:', error);
          // Return a fallback activity item if individual activity fails
          return `
            <div class="activity-item" data-activity-id="${activity.id || 'unknown'}" data-activity-type="${activity.type || 'unknown'}">
            <div class="activity-icon">
              ${this.getActivityIcon(activity.type || 'note')}
            </div>
            <div class="activity-content">
                <div class="activity-title">${this.escapeHtml(activity.title || 'Activity')}</div>
              <div class="activity-description">${this.escapeHtml(activity.description || '')}</div>
              <div class="activity-time">${this.formatTimestamp(activity.timestamp)}</div>
            </div>
          </div>
          `;
        }
      }).join('');
      
      return result;
    } catch (error) {
      console.error('[ActivityManager] Critical error in renderActivityList:', error);
      return '<div class="activity-item"><div class="activity-content"><div class="activity-title">Error loading activities</div></div></div>';
    }
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
        const emailId = item.getAttribute('data-email-id'); // Get emailId if available
        this.handleActivityClick(activityType, activityId, entityType, entityId, { emailId });
      });
    });
  }

  /**
   * Handle activity item click
   */
  handleActivityClick(activityType, activityId, entityType, entityId, activityData = null) {
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
        // Pass entityType and entityId to openEmailDetail for navigation source tracking
        this.openEmailDetail(activityId, entityType, entityId);
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
  openEmailDetail(activityId, entityType = null, entityId = null) {
    // Extract email ID from activity ID (format: "email-{emailId}")
    const emailId = activityId.replace(/^email-/, '');
    
    // Store navigation source based on where we came from
    if (entityType === 'contact' && entityId) {
      window._emailNavigationSource = 'contact-detail';
      window._emailNavigationContactId = entityId;
    } else if (entityType === 'task' && entityId) {
      window._emailNavigationSource = 'task-detail';
      window._emailNavigationTaskId = entityId;
    } else if (entityType === 'global' || !entityType) {
      // Check if we're on dashboard/home page
      const currentPage = window.crm?.currentPage || '';
      if (currentPage === 'dashboard' || currentPage === 'home') {
        window._emailNavigationSource = 'home';
      } else {
        // Default to emails page
        window._emailNavigationSource = null;
      }
    }
    
    // Navigate to email detail page with the email ID
    if (window.crm && typeof window.crm.navigateToPage === 'function') {
      window.crm.navigateToPage('email-detail', { emailId });
    } else if (window.EmailDetail && typeof window.EmailDetail.show === 'function') {
      // Fallback: direct call to EmailDetail module
            window.EmailDetail.show(emailId);
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
      // Update pagination controls
      this.updatePagination(containerId, totalPages);
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
      // Update pagination controls
      this.updatePagination(containerId, totalPages);
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
      // Update pagination controls
      this.updatePagination(containerId, totalPages);
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
        // Silent error handling
      });
    } else {
      // Fallback to normal rendering
      const paginatedActivities = this.getPageActivities(activities, this.currentPage);
      container.innerHTML = this.renderActivityList(paginatedActivities);
      this.attachActivityEvents(container, entityType, entityId);
      
      // Pre-render adjacent pages (non-blocking)
      this.prerenderAdjacentPages(activities, entityType, entityId, totalPages).catch(error => {
        // Silent error handling
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
      if (!activity || !activity.data) {
        return null;
      }

      if (activity.data.entityType === 'contact') {
        const contact = activity.data;
        const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
        const contactName = fullName || contact.name || 'Unknown Contact';
        const companyName = this.getCompanyNameForContact(contact);
        return companyName ? `${contactName} (${companyName})` : contactName;
      } else if (activity.data.entityType === 'account') {
        const account = activity.data;
        return account.accountName || account.name || account.companyName || 'Unknown Account';
      } else if (activity.data.contactId) {
        // Try to find contact name from contactId - with better error handling
        try {
          if (window.getPeopleData && typeof window.getPeopleData === 'function') {
            const contacts = window.getPeopleData() || [];
            const contact = contacts.find(c => c && c.id === activity.data.contactId);
            if (contact) {
              const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
              const contactName = fullName || contact.name || 'Unknown Contact';
              const companyName = this.getCompanyNameForContact(contact);
              return companyName ? `${contactName} (${companyName})` : contactName;
            }
          }
        } catch (error) {
          console.warn('[ActivityManager] Error looking up contact data:', error);
        }
      } else if (activity.data.accountId) {
        // Try to find account name from accountId - with better error handling
        try {
          if (window.getAccountsData && typeof window.getAccountsData === 'function') {
            const accounts = window.getAccountsData() || [];
            const account = accounts.find(a => a && a.id === activity.data.accountId);
            if (account) {
              return account.accountName || account.name || account.companyName || 'Unknown Account';
            }
          }
        } catch (error) {
          console.warn('[ActivityManager] Error looking up account data:', error);
        }
      }
    } catch (error) {
      console.warn('[ActivityManager] Error getting entity name for activity:', error);
    }
    return null;
  }

  /**
   * Get entity avatar for activity (contact initials or company favicon)
   */
  getEntityAvatarForActivity(activity) {
    try {
      if (!activity || !activity.data) {
        return this.getDefaultEntityAvatar();
      }

      if (activity.data.entityType === 'contact') {
        // Contact avatar with initials
        const contact = activity.data;
        const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
        const contactName = fullName || contact.name || 'Unknown Contact';
        const initials = this.getContactInitials(contactName);
        return `<div class="activity-entity-avatar-circle contact-avatar" aria-hidden="true">${initials}</div>`;
      } else if (activity.data.entityType === 'account') {
        // Company favicon
        const account = activity.data;
        const logoUrl = account.logoUrl || account.logo || account.companyLogo || account.iconUrl || account.companyIcon;
        const domain = account.domain || account.website;
        
        if (logoUrl && window.__pcFaviconHelper) {
          return window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl, domain, size: 40 });
        } else if (domain && window.__pcFaviconHelper) {
          return window.__pcFaviconHelper.generateFaviconHTML(domain, 40);
        } else {
          return this.getDefaultCompanyAvatar();
        }
      } else if (activity.data.contactId) {
        // Try to find contact data
        try {
          if (window.getPeopleData && typeof window.getPeopleData === 'function') {
            const contacts = window.getPeopleData() || [];
            const contact = contacts.find(c => c && c.id === activity.data.contactId);
            if (contact) {
              const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
              const contactName = fullName || contact.name || 'Unknown Contact';
              const initials = this.getContactInitials(contactName);
              return `<div class="activity-entity-avatar-circle contact-avatar" aria-hidden="true">${initials}</div>`;
            }
          }
        } catch (error) {
          console.warn('[ActivityManager] Error looking up contact for avatar:', error);
        }
      } else if (activity.data.accountId) {
        // Try to find account data
        try {
          if (window.getAccountsData && typeof window.getAccountsData === 'function') {
            const accounts = window.getAccountsData() || [];
            const account = accounts.find(a => a && a.id === activity.data.accountId);
            if (account) {
              const logoUrl = account.logoUrl || account.logo || account.companyLogo || account.iconUrl || account.companyIcon;
              const domain = account.domain || account.website;
              
              if (logoUrl && window.__pcFaviconHelper) {
                return window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl, domain, size: 40 });
              } else if (domain && window.__pcFaviconHelper) {
                return window.__pcFaviconHelper.generateFaviconHTML(domain, 40);
              } else {
                return this.getDefaultCompanyAvatar();
              }
            }
          }
        } catch (error) {
          console.warn('[ActivityManager] Error looking up account for avatar:', error);
        }
      }
    } catch (error) {
      console.warn('[ActivityManager] Error getting entity avatar for activity:', error);
    }
    
    return this.getDefaultEntityAvatar();
  }

  /**
   * Get contact initials from name
   */
  getContactInitials(contactName) {
    if (!contactName) return '?';
    const parts = contactName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else if (parts.length === 1) {
      return parts[0][0].toUpperCase();
    }
    return '?';
  }

  /**
   * Get default entity avatar (fallback)
   */
  getDefaultEntityAvatar() {
    return `<div class="activity-entity-avatar-circle default-avatar" aria-hidden="true">?</div>`;
  }

  /**
   * Get default company avatar
   */
  getDefaultCompanyAvatar() {
    return `<div class="activity-entity-avatar-circle company-avatar" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1"></path>
      </svg>
    </div>`;
  }

  /**
   * Get company name for a contact
   */
  getCompanyNameForContact(contact) {
    try {
      if (!contact) {
        return null;
      }

      // First try to get company from contact's accountId
      if (contact.accountId) {
        try {
          if (window.getAccountsData && typeof window.getAccountsData === 'function') {
            const accounts = window.getAccountsData() || [];
            const account = accounts.find(a => a && a.id === contact.accountId);
            if (account) {
              return account.accountName || account.name || account.companyName;
            }
          }
        } catch (error) {
          console.warn('[ActivityManager] Error looking up account by ID:', error);
        }
      }
      
      // Fallback to contact's company field
      if (contact.company) {
        return contact.company;
      }
      
      // Try to find account by company name match
      if (contact.companyName) {
        try {
          if (window.getAccountsData && typeof window.getAccountsData === 'function') {
            const accounts = window.getAccountsData() || [];
            const account = accounts.find(a => a && (
              a.accountName === contact.companyName || 
              a.name === contact.companyName || 
              a.companyName === contact.companyName
            ));
            if (account) {
              return account.accountName || account.name || account.companyName;
            }
          }
        } catch (error) {
          console.warn('[ActivityManager] Error looking up account by name:', error);
        }
      }
    } catch (error) {
      console.warn('[ActivityManager] Error getting company name for contact:', error);
    }
    return null;
  }

  /**
   * Format timestamp for display
   */
  formatTimestamp(timestamp) {
    const ms = this.getTimestampMs(timestamp);
    if (!ms) return 'Just now';
    return this.formatRelativeTime(new Date(ms));
  }

  /**
   * Normalize various timestamp shapes to milliseconds since epoch
   */
  getTimestampMs(value) {
    try {
      if (!value) return 0;
      // Firestore Timestamp object
      if (value && typeof value.toDate === 'function') {
        const d = value.toDate();
        return d instanceof Date && !isNaN(d.getTime()) ? d.getTime() : 0;
      }
      // Firestore { seconds, nanoseconds } shape
      if (typeof value === 'object' && value.seconds != null) {
        const seconds = Number(value.seconds) || 0;
        const nanos = Number(value.nanoseconds || value.nanos || 0) || 0;
        return seconds * 1000 + Math.floor(nanos / 1e6);
      }
      // Date
      if (value instanceof Date) {
        return isNaN(value.getTime()) ? 0 : value.getTime();
      }
      // ISO string
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed || trimmed === 'Invalid date' || trimmed === 'null' || trimmed === 'undefined') return 0;
        const t = Date.parse(trimmed);
        return isNaN(t) ? 0 : t;
      }
      // number (ms)
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
      }
      return 0;
    } catch (_) {
      return 0;
    }
  }

  /**
   * Strip HTML tags to get plain text
   */
  stripHtml(html) {
    if (!html) return '';
    
    // Remove style and script tags completely
    let cleaned = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    
    // Extract text content from remaining HTML
    const tmp = document.createElement('div');
    tmp.innerHTML = cleaned;
    let text = tmp.textContent || tmp.innerText || '';
    
    // Clean up the extracted text
    text = text.replace(/\s+/g, ' ').trim();
    
    return text;
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
        <polyline points="9,11 12,14 22,4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
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
   * Get contact data for navigation (prefetching mechanism)
   */
  getContactDataForNavigation(contactId) {
    try {
      // First try to find in people data cache
      if (window.getPeopleData) {
        const peopleData = window.getPeopleData() || [];
        const contact = peopleData.find(c => c.id === contactId);
        if (contact) {
          return contact;
        }
      }
      
      // If not found in cache, try to find in the activity data we already have
      // This handles cases where the contact ID doesn't match between Firebase and localStorage
      const allActivities = this.cache.get('global-timeline') || [];
      
      for (const activity of allActivities) {
        if (activity.type === 'note' && 
            activity.data && 
            activity.data.entityType === 'contact' && 
            activity.data.id === contactId) {
          return activity.data;
        }
      }
      
      return null;
    } catch (error) {
      console.error('[ActivityManager] Error getting contact data for navigation:', error);
      return null;
    }
  }

  /**
   * Navigate to detail page from activity
   */
  navigateToDetail(entityType, entityId) {
    // Store navigation source for back button restoration
    this.storeNavigationSource();
    
    // Navigate to the appropriate detail page
    if (entityType === 'contact') {
      // Prefetch contact data before navigation (like account logic in main.js)
      const contactData = this.getContactDataForNavigation(entityId);
      if (contactData) {
        window._prefetchedContactForDetail = contactData;
      }
      
      // Navigate to people page first, then show contact detail (required for ContactDetail)
      if (window.crm && typeof window.crm.navigateToPage === 'function') {
        window.crm.navigateToPage('people');
      }
      requestAnimationFrame(() => {
        if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
          window.ContactDetail.show(entityId);
        } else {
          // Retry with longer timeout if ContactDetail not ready
          setTimeout(() => {
            if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
              window.ContactDetail.show(entityId);
            }
          }, 200);
        }
      });
    } else if (entityType === 'account') {
      // Navigate to account detail
      if (window.AccountDetail && typeof window.AccountDetail.show === 'function') {
        window.AccountDetail.show(entityId);
      } else {
        // Fallback: navigate to accounts page and trigger account detail
        if (window.crm && typeof window.crm.navigateToPage === 'function') {
          window.crm.navigateToPage('accounts');
        }
        setTimeout(() => {
          if (window.AccountDetail && typeof window.AccountDetail.show === 'function') {
            window.AccountDetail.show(entityId);
          }
        }, 100);
      }
    }
  }

  /**
   * Update pagination controls
   */
  updatePagination(containerId, totalPages) {
    const paginationContainer = document.getElementById(containerId.replace('-timeline', '-pagination'));
    if (!paginationContainer) return;
    
    
    if (totalPages <= 1) {
      // Hide pagination if only one page
      paginationContainer.style.display = 'none';
      return;
    }
    
    // Show pagination
    paginationContainer.style.display = 'flex';
    
    // Update pagination page button
    const pageButton = paginationContainer.querySelector('#home-activity-page');
    if (pageButton) {
      pageButton.textContent = this.currentPage + 1;
      pageButton.classList.toggle('active', true);
    }
    
    // Update button states
    const prevButton = paginationContainer.querySelector('.activity-pagination-btn:first-child');
    const nextButton = paginationContainer.querySelector('.activity-pagination-btn:last-child');
    
    if (prevButton) {
      prevButton.disabled = this.currentPage === 0;
    }
    
    if (nextButton) {
      nextButton.disabled = this.currentPage >= totalPages - 1;
    }
    
    // Attach event listeners
    this.attachPaginationEvents(containerId);
  }
  
  /**
   * Attach pagination event listeners
   */
  attachPaginationEvents(containerId) {
    const paginationContainer = document.getElementById(containerId.replace('-timeline', '-pagination'));
    if (!paginationContainer) return;
    
    // Remove existing listeners to prevent duplicates
    const prevButton = paginationContainer.querySelector('.activity-pagination-btn:first-child');
    const nextButton = paginationContainer.querySelector('.activity-pagination-btn:last-child');
    
    if (prevButton) {
      prevButton.onclick = null; // Clear existing
      prevButton.onclick = () => {
        this.previousPage(containerId, 'global', null);
      };
    }
    
    if (nextButton) {
      nextButton.onclick = null; // Clear existing
      nextButton.onclick = () => {
        this.nextPage(containerId, 'global', null);
      };
    }
  }

  /**
   * Store navigation source for back button restoration
   */
  storeNavigationSource() {
    try {
      const currentPage = window.crm?.currentPage || '';
      const activePage = document.querySelector('.page.active');
      const pageId = activePage?.id || activePage?.getAttribute('data-page') || '';
      
      // Determine actual current page
      const source = currentPage || pageId.replace('-page', '') || 'dashboard';
      
      // For task-detail, store additional context
      if (source === 'task-detail' && window.__taskDetailRestoreData) {
        window._contactNavigationSource = 'task-detail';
        window._accountNavigationSource = 'task-detail';
      }
      
      // For dashboard, store current pagination state
      if (source === 'dashboard') {
        window._dashboardNavigationSource = 'activities';
        window._dashboardReturn = {
          page: this.currentPage,
          scroll: window.scrollY,
          containerId: 'home-activity-timeline'
        };
      }
    } catch (error) {
      console.error('[ActivityManager] Error storing navigation source:', error);
    }
  }

}

// Expose a single global instance (singleton) so other modules don't construct new instances
if (!window.ActivityManager || !(window.ActivityManager instanceof ActivityManager)) {
  window.ActivityManager = new ActivityManager();
}
