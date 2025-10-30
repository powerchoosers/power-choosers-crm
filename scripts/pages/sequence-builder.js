'use strict';

// Free Sequence Automation Class - Zero Cost Email Automation
class FreeSequenceAutomation {
  constructor() {
    this.scheduledEmails = new Map();
    this.checkInterval = null;
    this.isRunning = false;
  }

  /**
   * Start a sequence with free automation
   * All timing handled client-side, no server costs
   */
  async startSequence(sequence, contactData) {
    try {
      console.log('[FreeSequence] Starting sequence:', sequence.name);
      
      // Create scheduled email records for all auto-email steps
      const emailSteps = sequence.steps.filter(step => step.type === 'auto-email');
      let scheduledEmailCount = 0;
      
      for (let i = 0; i < emailSteps.length; i++) {
        const step = emailSteps[i];
        
        // Calculate when this email should be sent
        let sendTime;
        if (i === 0 && step.delay === 'immediate') {
          // First step: send in 30 minutes (for AI generation)
          sendTime = Date.now() + (30 * 60 * 1000);
        } else {
          // Calculate based on delay from previous step
          const previousStepTime = i > 0 ? 
            (emailSteps[i-1].scheduledTime || Date.now()) : 
            Date.now();
          sendTime = this.calculateSendTime(previousStepTime, step.delay);
        }
        
        // Create scheduled email record
        const scheduledEmail = {
          id: `free_${Date.now()}_${i}`,
          type: 'scheduled',
          status: 'not_generated',
          scheduledSendTime: sendTime,
          contactId: contactData.id || contactData.email,
          contactName: contactData.name,
          contactCompany: contactData.company,
          to: contactData.email,
          sequenceId: sequence.id,
          sequenceName: sequence.name,
          stepIndex: i,
          totalSteps: emailSteps.length,
          aiPrompt: step.emailSettings?.aiPrompt || step.data?.aiPrompt || 'Write a professional follow-up email',
          createdAt: new Date(),
          ownerId: window.currentUser?.uid || 'unknown',
          // Free automation flag
          freeAutomation: true
        };
        
        // Store in memory (no database writes for free version)
        this.scheduledEmails.set(scheduledEmail.id, scheduledEmail);
        scheduledEmailCount++;
        
        // Schedule client-side check
        this.scheduleEmailCheck(scheduledEmail);
      }
      
      console.log(`[FreeSequence] Created ${scheduledEmailCount} scheduled emails`);
      
      // Start the free automation loop
      this.startFreeAutomation();
      
      return {
        success: true,
        scheduledEmailCount,
        message: 'Sequence started with free automation'
      };
      
    } catch (error) {
      console.error('[FreeSequence] Error starting sequence:', error);
      throw error;
    }
  }

  /**
   * Calculate send time based on delay string
   */
  calculateSendTime(previousTime, delay) {
    if (!delay) return previousTime + (24 * 60 * 60 * 1000); // Default 1 day
    
    const delayStr = delay.toString().toLowerCase();
    
    if (delayStr.includes('day')) {
      const days = parseInt(delayStr.match(/\d+/)?.[0] || '1');
      return previousTime + (days * 24 * 60 * 60 * 1000);
    } else if (delayStr.includes('hour')) {
      const hours = parseInt(delayStr.match(/\d+/)?.[0] || '1');
      return previousTime + (hours * 60 * 60 * 1000);
    } else if (delayStr.includes('week')) {
      const weeks = parseInt(delayStr.match(/\d+/)?.[0] || '1');
      return previousTime + (weeks * 7 * 24 * 60 * 60 * 1000);
    } else if (delayStr.includes('minute')) {
      const minutes = parseInt(delayStr.match(/\d+/)?.[0] || '30');
      return previousTime + (minutes * 60 * 1000);
    } else {
      return previousTime + (24 * 60 * 60 * 1000); // Default 1 day
    }
  }

  /**
   * Schedule a client-side check for an email
   */
  scheduleEmailCheck(email) {
    const timeUntilSend = email.scheduledSendTime - Date.now();
    
    if (timeUntilSend <= 0) {
      // Email is due now, check immediately
      this.checkEmail(email);
    } else {
      // Schedule check for when email is due
      setTimeout(() => {
        this.checkEmail(email);
      }, timeUntilSend);
    }
  }

  /**
   * Check if an email should be sent
   */
  async checkEmail(email) {
    try {
      const now = Date.now();
      const timeUntilSend = email.scheduledSendTime - now;
      
      if (timeUntilSend > 0) {
        // Not time yet, reschedule
        this.scheduleEmailCheck(email);
        return;
      }
      
      console.log(`[FreeSequence] Email due: ${email.id}`);
      
      // Check if email has been generated and approved
      if (email.status === 'not_generated') {
        // Generate email content (this would call your AI service)
        await this.generateEmailContent(email);
      }
      
      if (email.status === 'pending_approval') {
        // Email needs approval - show notification
        this.showApprovalNotification(email);
      }
      
      if (email.status === 'approved') {
        // Send the email
        await this.sendEmail(email);
      }
      
    } catch (error) {
      console.error(`[FreeSequence] Error checking email ${email.id}:`, error);
    }
  }

  /**
   * Generate email content using AI
   */
  async generateEmailContent(email) {
    try {
      console.log(`[FreeSequence] Generating content for ${email.id}`);
      
      // Update status to generating
      email.status = 'generating';
      
      // Call your AI service (this would be your existing AI endpoint)
      const response = await fetch('/api/generate-email-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: email.aiPrompt,
          contactName: email.contactName,
          contactCompany: email.contactCompany
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        email.html = result.html;
        email.text = result.text;
        email.subject = result.subject;
        email.status = 'pending_approval';
        email.generatedAt = Date.now();
        
        console.log(`[FreeSequence] Generated content for ${email.id}`);
      } else {
        email.status = 'error';
        email.errorMessage = 'Failed to generate content';
      }
      
    } catch (error) {
      console.error(`[FreeSequence] Error generating content:`, error);
      email.status = 'error';
      email.errorMessage = error.message;
    }
  }

  /**
   * Show approval notification to user
   */
  showApprovalNotification(email) {
    // Create a notification for the user to approve the email
    const notification = document.createElement('div');
    notification.className = 'email-approval-notification';
    notification.innerHTML = `
      <div class="notification-content">
        <h4>Email Ready for Approval</h4>
        <p><strong>To:</strong> ${email.to}</p>
        <p><strong>Subject:</strong> ${email.subject}</p>
        <div class="email-preview">${email.html}</div>
        <div class="approval-buttons">
          <button onclick="window.freeSequenceAutomation.approveEmail('${email.id}')" class="btn-primary">Approve</button>
          <button onclick="window.freeSequenceAutomation.rejectEmail('${email.id}')" class="btn-secondary">Reject</button>
          <button onclick="window.freeSequenceAutomation.editEmail('${email.id}')" class="btn-outline">Edit</button>
        </div>
      </div>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto-remove after 30 seconds if not interacted with
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 30000);
  }

  /**
   * Approve an email for sending
   */
  async approveEmail(emailId) {
    const email = this.scheduledEmails.get(emailId);
    if (email) {
      email.status = 'approved';
      email.approvedAt = Date.now();
      
      // Remove notification
      const notification = document.querySelector('.email-approval-notification');
      if (notification) notification.remove();
      
      // Send the email
      await this.sendEmail(email);
    }
  }

  /**
   * Reject an email
   */
  rejectEmail(emailId) {
    const email = this.scheduledEmails.get(emailId);
    if (email) {
      email.status = 'rejected';
      email.rejectedAt = Date.now();
      
      // Remove notification
      const notification = document.querySelector('.email-approval-notification');
      if (notification) notification.remove();
      
      console.log(`[FreeSequence] Email ${emailId} rejected`);
    }
  }

  /**
   * Edit an email
   */
  editEmail(emailId) {
    const email = this.scheduledEmails.get(emailId);
    if (email) {
      // Open email editor (you would implement this)
      console.log(`[FreeSequence] Edit email ${emailId}`);
      // This would open your email editor modal
    }
  }

  /**
   * Send an email
   */
  async sendEmail(email) {
    try {
      console.log(`[FreeSequence] Sending email ${email.id}`);
      
      // Call your email sending service
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email.to,
          subject: email.subject,
          html: email.html,
          text: email.text
        })
      });
      
      if (response.ok) {
        email.status = 'sent';
        email.sentAt = Date.now();
        console.log(`[FreeSequence] Email ${email.id} sent successfully`);
      } else {
        email.status = 'error';
        email.errorMessage = 'Failed to send email';
      }
      
    } catch (error) {
      console.error(`[FreeSequence] Error sending email:`, error);
      email.status = 'error';
      email.errorMessage = error.message;
    }
  }

  /**
   * Start the free automation loop
   */
  startFreeAutomation() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('[FreeSequence] Free automation started');
    
    // Check every 5 minutes for any missed emails
    this.checkInterval = setInterval(() => {
      this.checkAllEmails();
    }, 5 * 60 * 1000);
  }

  /**
   * Check all scheduled emails
   */
  checkAllEmails() {
    const now = Date.now();
    
    for (const [id, email] of this.scheduledEmails) {
      if (email.scheduledSendTime <= now && email.status === 'not_generated') {
        this.checkEmail(email);
      }
    }
  }

  /**
   * Stop the free automation
   */
  stopFreeAutomation() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('[FreeSequence] Free automation stopped');
  }
}

// Sequence Builder page module (placeholder)
(function () {
  const state = {
    currentSequence: null,
    editingTitle: false,
    tempTitle: '',
    contacts: [] // Store sequence contacts
  };

  const els = {};

  function initDomRefs() {
    els.page = document.getElementById('sequence-builder-page');
    els.pageContainer = els.page ? els.page.querySelector('.page-container') : null;
    els.mainContent = els.page ? els.page.querySelector('.page-content') : null;
    return !!els.page && !!els.mainContent;
  }
  
  // Sequence-level delete confirmation popover (anchored under trash icon)
  function openSequenceDeletePopover(anchorEl) {
    if (!anchorEl || !state.currentSequence) return;
    closeDeletePopover();
    // Pin actions so the trash icon remains visible while popover is open
    const titleWrap = document.querySelector('.contact-subtitle .seq-title-wrap');
    try {
      anchorEl.setAttribute('aria-expanded', 'true');
    } catch (_) {}
    if (titleWrap) titleWrap.classList.add('actions-pinned');
    const pop = document.createElement('div');
    pop.className = 'delete-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', 'true');
    const titleId = `delete-seq-pop-title-${escapeHtml(state.currentSequence.id)}`;
    pop.setAttribute('aria-labelledby', titleId);
    pop.innerHTML = `
      <div class="delete-popover-inner">
        <div class="delete-title" id="${titleId}">Delete sequence?</div>
        <div class="btn-row">
          <button type="button" class="btn-cancel">Cancel</button>
          <button type="button" class="btn-danger btn-confirm">Delete</button>
        </div>
      </div>`;
    document.body.appendChild(pop);

    const position = () => {
      const iconCandidate = anchorEl.querySelector?.('.icon-btn-sm, .icon, svg, i');
      const refEl = (iconCandidate && typeof iconCandidate.getBoundingClientRect === 'function') ? iconCandidate : anchorEl;
      const r = refEl.getBoundingClientRect();
      pop.style.visibility = 'hidden';
      pop.style.position = 'fixed';
      pop.style.left = '0px';
      pop.style.top = '0px';
      const pw = pop.offsetWidth;
      const ph = pop.offsetHeight;
      let left = Math.round(r.left + (r.width / 2) - (pw / 2));
      left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
      let top = r.bottom + 8;
      let placement = 'bottom';
      if (top + ph + 8 > window.innerHeight) {
        top = Math.max(8, r.top - ph - 8);
        placement = 'top';
      }
      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
      pop.setAttribute('data-placement', placement);
      const anchorCenterX = r.left + (r.width / 2);
      const arrowLeft = Math.max(12, Math.min(pw - 12, anchorCenterX - left));
      pop.style.setProperty('--arrow-left', `${arrowLeft}px`);
      pop.style.visibility = 'visible';
    };

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeDeletePopover(); return; }
      if (e.key === 'Tab') {
        const fs = Array.from(pop.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])')).filter(el => !el.disabled && el.offsetParent !== null);
        if (!fs.length) return;
        const first = fs[0], last = fs[fs.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    };
    const onDocPointer = (e) => { if (pop.contains(e.target) || anchorEl.contains(e.target)) return; closeDeletePopover(); };
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDocPointer, true);

    const cancelBtn = pop.querySelector('.btn-cancel');
    const confirmBtn = pop.querySelector('.btn-confirm');
    cancelBtn?.addEventListener('click', () => closeDeletePopover());
    confirmBtn?.addEventListener('click', async () => {
      try {
        const seq = state.currentSequence;
        // Delete from Firestore if available
        try {
          const db = window.firebaseDB;
          if (db && seq?.id) {
            await db.collection('sequences').doc(seq.id).delete();
          }
        } catch (_) { /* noop */ }
        if (window.crm && typeof window.crm.showToast === 'function') window.crm.showToast('Sequence deleted');
      } catch (_) { /* noop */ }
      closeDeletePopover();
      try { window.crm && window.crm.navigateToPage('sequences'); } catch (_) { /* noop */ }
    });

    position();
    setTimeout(() => { (confirmBtn || cancelBtn)?.focus(); }, 0);

    _openDeletePopover = {
      el: pop,
      cleanup: () => {
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('mousedown', onDocPointer, true);
        window.removeEventListener('resize', position);
        window.removeEventListener('scroll', position, true);
        pop.remove();
        // Unpin actions and restore ARIA state
        if (titleWrap) {
          titleWrap.classList.remove('actions-pinned');
          // Force-hide actions briefly even if cursor is hovering
          try {
            titleWrap.classList.add('no-hover');
            setTimeout(() => { titleWrap.classList.remove('no-hover'); }, 250);
          } catch (_) {}
        }
        try { anchorEl.setAttribute('aria-expanded', 'false'); } catch (_) {}
        // Blur the trigger so :focus-within no longer keeps actions visible
        try { anchorEl.blur && anchorEl.blur(); } catch (_) {}
      }
    };
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Simple initials helper for avatars in the contacts modal
  function getInitials(name) {
    const s = String(name || '').trim();
    if (!s) return '';
    const parts = s.split(/\s+/).filter(Boolean);
    const first = parts[0] ? parts[0][0] : '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  }

  // Contact search functionality
  async function searchContacts(query) {
    const contactSearchResults = document.getElementById('contact-search-results');
    if (!contactSearchResults) return;

    try {
      // Show loading state
      contactSearchResults.innerHTML = `
        <div class="search-loading">
          <div class="loading-spinner"></div>
          <span>Searching contacts...</span>
        </div>
      `;
      contactSearchResults.hidden = false;

      // Fetch contacts based on query from Firestore
      const filteredContacts = await fetchContacts(query || '');

      // Check which contacts are already in the sequence
      const existingContactIds = state.contacts.map(c => c.id);

      if (filteredContacts.length === 0) {
        contactSearchResults.innerHTML = `
          <div class="search-empty">
            <div class="empty-text">No contacts found</div>
            <div class="empty-subtext">Try adjusting your search terms</div>
          </div>
        `;
      } else {
        const resultsHtml = filteredContacts.map(contact => {
          const person = contact.data || contact;
          const fullName = [person.firstName, person.lastName, person.fullName, person.name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || 'Unnamed Contact';
          const jobTitle = person.title || person.jobTitle || '';
          const company = getAccountFieldFromContact(person, 'name') || person.company || person.companyName || '';
          const details = (jobTitle && company) ? `${jobTitle} at ${company}` : (jobTitle || company || '');
          const isAlreadyAdded = existingContactIds.includes(person.id);
          return `
            <div class="contact-result ${isAlreadyAdded ? 'already-added' : ''}" data-contact-id="${escapeHtml(person.id)}">
              <div class="contact-info">
                <div class="contact-name">${escapeHtml(fullName)}</div>
                ${details ? `<div class=\"contact-details\">${escapeHtml(details)}</div>` : ''}
              </div>
              <div class="contact-action">
                ${isAlreadyAdded ? 
                  '<span class="added-indicator">Added</span>' : 
                  '<button class="btn-add-contact" aria-label="Add contact to sequence">Add</button>'
                }
              </div>
            </div>
          `;
        }).join('');

        contactSearchResults.innerHTML = `
          <div class="contact-results-list">
            ${resultsHtml}
          </div>
        `;

        // Add handlers to open anchored Add Contact popover
        contactSearchResults.querySelectorAll('.btn-add-contact, .contact-result .contact-name').forEach(el => {
          el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const contactResult = el.closest('.contact-result');
            // Do not open popover for already-added rows
            if (contactResult?.classList.contains('already-added')) return;
            const contactId = contactResult?.getAttribute('data-contact-id');
            const found = filteredContacts.find(c => (c.data?.id || c.id) === contactId);
            const person = found?.data || found;
            if (person) {
              const fullName = [person.firstName, person.lastName, person.fullName, person.name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || 'Unnamed Contact';
              const jobTitle = person.title || person.jobTitle || '';
              const company = getAccountFieldFromContact(person, 'name') || person.company || person.companyName || '';
              const email = person.email || '';
              const contactForAdd = { id: person.id, name: fullName, title: jobTitle, company, email };
              const btn = contactResult?.querySelector('.btn-add-contact');
              if (!btn) return; // no valid anchor available
              openAddContactPopover(btn, contactForAdd);
            }
          });
        });

        // Keyboard accessibility: make non-added rows activatable via Enter/Space
        contactSearchResults.querySelectorAll('.contact-result').forEach(row => {
          const isAdded = row.classList.contains('already-added');
          const contactId = row.getAttribute('data-contact-id');
          const found = filteredContacts.find(c => (c.data?.id || c.id) === contactId);
          const person = found?.data || found;
          if (!isAdded && person) {
            row.setAttribute('tabindex', '0');
            row.setAttribute('role', 'button');
            row.setAttribute('aria-haspopup', 'dialog');
            const fullName = [person.firstName, person.lastName, person.fullName, person.name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || 'Unnamed Contact';
            row.setAttribute('aria-label', `Add ${fullName} to sequence`);
            row.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                const btn = row.querySelector('.btn-add-contact');
                if (!btn) return; // if no button, nothing to anchor to
                const jobTitle = person.title || person.jobTitle || '';
                const company = getAccountFieldFromContact(person, 'name') || person.company || person.companyName || '';
                const email = person.email || '';
                const contactForAdd = { id: person.id, name: fullName, title: jobTitle, company, email };
                openAddContactPopover(btn, contactForAdd);
              }
            });
          } else if (isAdded) {
            row.removeAttribute('tabindex');
            row.setAttribute('aria-disabled', 'true');
            row.removeAttribute('role');
          }
        });
      }
    } catch (error) {
      console.error('Error searching contacts:', error);
      contactSearchResults.innerHTML = `
        <div class="search-error">
          <div class="error-text">Error searching contacts</div>
          <div class="error-subtext">Please try again</div>
        </div>
      `;
    }
  }

  async function addContactToSequence(contact) {
    if (!state.currentSequence || !contact) return;

    // Check if contact is already added
    if (state.contacts.some(c => c.id === contact.id)) {
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast(`${contact.name} is already in this sequence`);
      }
      return;
    }

    // Add contact to sequence
    state.contacts.push(contact);

    // Clear search input and hide results
    const contactSearchInput = document.getElementById('contact-search-input');
    const contactSearchResults = document.getElementById('contact-search-results');
    if (contactSearchInput) contactSearchInput.value = '';
    if (contactSearchResults) contactSearchResults.hidden = true;

    // Show success message
    if (window.crm && typeof window.crm.showToast === 'function') {
      window.crm.showToast(`Added ${contact.name} to sequence`);
    }

    // Persist to Firebase: create sequenceMembers document AND update sequence
    try {
      const db = window.firebaseDB;
      if (!db || !state.currentSequence?.id) return;
      
      // Get user email using the same method as sequences.js
      const userEmail = (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function')
        ? window.DataManager.getCurrentUserEmail()
        : ((window.currentUserEmail || '').toLowerCase());
      
      // Create sequenceMembers document (same pattern as contact-detail.js but with ownerId fields)
      const memberDoc = {
        sequenceId: state.currentSequence.id,
        targetId: contact.id,
        targetType: 'people',
        ownerId: userEmail || 'unknown',
        createdBy: userEmail || 'unknown',
        assignedTo: userEmail || 'unknown'
      };
      
      // Use server timestamps if available, otherwise use Date.now()
      if (window.firebase?.firestore?.FieldValue?.serverTimestamp) {
        memberDoc.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
        memberDoc.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
      } else {
        const now = Date.now();
        memberDoc.createdAt = now;
        memberDoc.updatedAt = now;
      }
      
      // Add the sequenceMembers document
      await db.collection('sequenceMembers').add(memberDoc);
      
      // Increment sequence stats.active count (same as contact-detail.js)
      if (window.firebase?.firestore?.FieldValue) {
        await db.collection('sequences').doc(state.currentSequence.id).update({
          "stats.active": window.firebase.firestore.FieldValue.increment(1)
        });
      }
      
      // Update sequence document with contacts array and recordCount
      const updateData = {
        contacts: state.contacts,
        updatedAt: Date.now(),
        recordCount: state.contacts.length
      };
      
      // Use server timestamp if available
      if (window.firebase?.firestore?.FieldValue?.serverTimestamp) {
        updateData.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
      }
      
      await db.collection('sequences').doc(state.currentSequence.id).update(updateData);
      
      // Update local sequence object
      state.currentSequence.contacts = state.contacts;
      state.currentSequence.recordCount = state.contacts.length;
      
      // Invalidate sequenceMembers cache so it refreshes next time
      if (window._sequenceMembersCache) {
        const cacheKey = `sequence-members-${state.currentSequence.id}`;
        window._sequenceMembersCache.delete(cacheKey);
      }
      
      // Update contact count display in UI
      updateContactCountDisplay();
      
    } catch (error) {
      console.error('Error saving contact to sequence:', error);
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Failed to save contact. Please try again.');
      }
    }
  }
  
  function updateContactCountDisplay() {
    // Update any UI elements that show contact count
    const contactCountEl = document.querySelector('.contact-count-display');
    if (contactCountEl) {
      contactCountEl.textContent = `${state.contacts.length} contact${state.contacts.length !== 1 ? 's' : ''}`;
    }
  }

  function show(sequence) {
    if (!sequence || !sequence.id) {
      console.error('SequenceBuilder.show requires a sequence object with an id');
      return;
    }
    state.currentSequence = sequence;
    
    // Initialize contacts from sequence payload first (for immediate UI)
    try {
      state.contacts = Array.isArray(sequence.contacts) ? [...sequence.contacts] : [];
    } catch (_) { state.contacts = []; }

    // Minimize flicker: temporarily hide Sequences page while navigating
    try { document.documentElement.classList.add('pc-hide-sequences'); } catch (_) {}
    // Navigate to the sequence-builder page using the CRM router
    if (window.crm && typeof window.crm.navigateToPage === 'function') {
      try { window.crm.navigateToPage('sequence-builder'); } catch (e) { /* noop */ }
    }

    if (!initDomRefs()) return;
    // Reduce page flash/flicker: fade in after initial render
    try {
      const container = els.page ? els.page.querySelector('.page-container') : null;
      if (container) {
        container.style.opacity = '0';
        container.style.transition = 'opacity 160ms ease';
      }
      // Render first, then fade in next frame
      // Render immediately with existing data
      render();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (container) container.style.opacity = '1';
        // Remove temporary hide class shortly after builder is visible
        setTimeout(() => { try { document.documentElement.classList.remove('pc-hide-sequences'); } catch (_) {} }, 240);
      }));
      // Return early to avoid duplicate render below
      // Note: following render() call removed to prevent double work
      return;
    } catch (_) {}
    
    // Fallback render if fade-in guard failed
    render();
    
    // Then load contacts from sequenceMembers collection asynchronously (don't block render)
    loadContactsFromSequenceMembers(sequence.id).catch(err => {
      console.warn('Failed to load contacts from sequenceMembers:', err);
    });
  }
  
  async function loadContactsFromSequenceMembers(sequenceId) {
    try {
      const db = window.firebaseDB;
      if (!db || !sequenceId) return;
      
      // Check cache first for sequenceMembers (avoid repeated Firebase queries)
      let contactIds = [];
      const cacheKey = `sequence-members-${sequenceId}`;
      
      // Try to get from memory cache first (per-session)
      if (!window._sequenceMembersCache) {
        window._sequenceMembersCache = new Map();
      }
      
      if (window._sequenceMembersCache.has(cacheKey)) {
        const cached = window._sequenceMembersCache.get(cacheKey);
        const cacheAge = Date.now() - cached.timestamp;
        if (cacheAge < 60000) { // 1 minute cache
          contactIds = cached.contactIds;
        } else {
          window._sequenceMembersCache.delete(cacheKey);
        }
      }
      
      // If not in cache, query Firebase
      if (contactIds.length === 0) {
        const membersQuery = await db.collection('sequenceMembers')
          .where('sequenceId', '==', sequenceId)
          .where('targetType', '==', 'people')
          .get();
        
        if (membersQuery.size === 0) {
          // No members found, clear contacts
          state.contacts = [];
          return;
        }
        
        // Extract contact IDs
        membersQuery.forEach(doc => {
          const data = doc.data();
          if (data.targetId) contactIds.push(data.targetId);
        });
        
        // Cache the result
        window._sequenceMembersCache.set(cacheKey, {
          contactIds: contactIds,
          timestamp: Date.now()
        });
      }
      
      if (contactIds.length === 0) {
        state.contacts = [];
        return;
      }
      
      // Load contact details: Priority 1 - BackgroundContactsLoader (cached, zero cost)
      let loadedContacts = [];
      if (window.BackgroundContactsLoader && typeof window.BackgroundContactsLoader.getContactsData === 'function') {
        const peopleData = window.BackgroundContactsLoader.getContactsData() || [];
        loadedContacts = contactIds.map(id => {
          return peopleData.find(p => p.id === id);
        }).filter(Boolean);
      }
      
      // Priority 2 - window.getPeopleData (if people.js is loaded)
      if (loadedContacts.length < contactIds.length && typeof window.getPeopleData === 'function') {
        const peopleData = window.getPeopleData() || [];
        const missingIds = contactIds.filter(id => !loadedContacts.find(c => c.id === id));
        const beforeCount = loadedContacts.length;
        missingIds.forEach(id => {
          const contact = peopleData.find(p => p.id === id);
          if (contact) loadedContacts.push(contact);
        });
        // Additional contacts loaded from window.getPeopleData
      }
      
      // Priority 3 - CacheManager (still cached, zero cost)
      if (loadedContacts.length < contactIds.length && window.CacheManager && typeof window.CacheManager.get === 'function') {
        try {
          const cachedContacts = await window.CacheManager.get('contacts') || [];
          const missingIds = contactIds.filter(id => !loadedContacts.find(c => c.id === id));
          const beforeCount = loadedContacts.length;
          missingIds.forEach(id => {
            const contact = cachedContacts.find(p => p.id === id);
            if (contact) loadedContacts.push(contact);
          });
          // Additional contacts loaded from CacheManager
        } catch (err) {
          console.warn('[SequenceBuilder] CacheManager read failed:', err);
        }
      }
      
      // Only fetch from Firebase if contacts are still missing (last resort - costs money)
      if (loadedContacts.length < contactIds.length) {
        const missingIds = contactIds.filter(id => !loadedContacts.find(c => c.id === id));
        
        try {
          // Batch fetch missing contacts (more efficient than individual reads)
          const contactPromises = missingIds.map(id => 
            db.collection('contacts').doc(id).get().then(doc => {
              if (doc.exists) {
                const data = doc.data();
                return { id: doc.id, ...data };
              } else {
                return null;
              }
            }).catch((err) => {
              console.error(`[SequenceBuilder] Error fetching contact ${id}:`, err);
              return null;
            })
          );
          
          const fetchedContacts = await Promise.all(contactPromises);
          const validFetched = fetchedContacts.filter(Boolean);
          
            if (validFetched.length < missingIds.length) {
              const notFound = missingIds.filter(id => !validFetched.find(c => c.id === id));
              console.warn(`[SequenceBuilder] ${notFound.length} contacts not found in Firebase - may have been deleted`);
              
              // Optionally clean up orphaned sequenceMembers records
              if (notFound.length > 0) {
                console.log(`[SequenceBuilder] To clean up orphaned records, run: await cleanupOrphanedSequenceMembers('${sequenceId}')`);
              }
            }
          
          // Merge cached and fetched contacts
          loadedContacts = [...loadedContacts, ...validFetched];
          
          // Update stats.active if we have orphaned records (contacts that don't exist)
          if (loadedContacts.length < contactIds.length && state.currentSequence?.id) {
            const orphanedCount = contactIds.length - loadedContacts.length;
            console.warn(`[SequenceBuilder] Found ${orphanedCount} orphaned sequenceMembers records. stats.active may be incorrect.`);
            
            // Fix stats.active to match actual loaded contacts
            try {
              const currentStats = state.currentSequence.stats || {};
              const currentActive = currentStats.active || 0;
              const correctActive = loadedContacts.length;
              
              if (currentActive !== correctActive) {
                await db.collection('sequences').doc(state.currentSequence.id).update({
                  "stats.active": correctActive,
                  recordCount: correctActive
                });
                state.currentSequence.stats = { ...currentStats, active: correctActive };
                state.currentSequence.recordCount = correctActive;
              }
            } catch (err) {
              console.warn('[SequenceBuilder] Failed to update stats.active:', err);
            }
          }
        } catch (err) {
          console.warn('[SequenceBuilder] Failed to fetch contacts from Firebase:', err);
        }
      }
      
      if (loadedContacts.length > 0) {
        // Ensure all contacts have required fields
        const validContacts = loadedContacts.filter(c => {
          if (!c || !c.id) {
            return false;
          }
          return true;
        });
        
        state.contacts = validContacts;
        // Re-render with updated contacts
        render();
      } else {
        // No contacts found, update state
        state.contacts = [];
      }
      
      // Update sequence recordCount if it's incorrect
      if (state.currentSequence && state.currentSequence.recordCount !== contactIds.length) {
        try {
          const updateData = {
            recordCount: contactIds.length
          };

          if (window.firebase?.firestore?.FieldValue?.serverTimestamp) {
            updateData.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
          } else {
            updateData.updatedAt = Date.now();
          }

          await db.collection('sequences').doc(sequenceId).update(updateData);
          state.currentSequence.recordCount = contactIds.length;
        } catch (err) {
          console.warn('Failed to update recordCount:', err);
        }
      }
    } catch (err) {
      console.warn('Failed to load contacts from sequenceMembers:', err);
    }
  }

  function render() {
    if (!state.currentSequence || !els.mainContent) return;

    const seq = state.currentSequence;
    const title = seq.name || 'Untitled Sequence';
    const isEditingTitle = !!state.editingTitle;

    const titleViewHtml = `
            <div class="seq-title-wrap">
              <span class="seq-title-text" id="seq-title-text" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
              <div class="seq-title-actions">
                <button class="icon-btn-sm" id="edit-seq-title-btn" aria-label="Edit sequence name" title="Rename">${svgEdit()}</button>
                <button class="icon-btn-sm" id="delete-seq-btn" aria-label="Delete sequence" title="Delete sequence">${svgTrash()}</button>
              </div>
            </div>`;
    const titleEditHtml = `
            <div class="seq-title-edit-row">
              <input type="text" class="input-dark seq-title-input" id="seq-title-input" value="${escapeHtml(seq.name || '')}" placeholder="Sequence name" aria-label="Sequence name" />
              <button class="btn-secondary" id="cancel-seq-title">Cancel</button>
              <button class="btn-primary" id="save-seq-title">Save</button>
            </div>`;

    const headerHtml = `
      <div class="page-header" id="sequence-builder-header">
        <div class="page-title-section">
          <button class="back-btn back-btn--icon" id="back-to-sequences" aria-label="Back to Sequences" title="Back to Sequences">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div class="contact-header-text">
            <h2 class="page-title">Sequence Builder</h2>
            <div class="contact-subtitle">${isEditingTitle ? titleEditHtml : titleViewHtml}</div>
          </div>
        </div>
        <div class="page-actions">
          <div class="contact-search-container">
            <input type="text" id="contact-search-input" class="search-input-small" placeholder="Search contacts to add..." aria-label="Search contacts to add to sequence" />
            <div class="contact-search-results" id="contact-search-results" hidden></div>
          </div>
          <button class="btn-secondary" id="contacts-btn" aria-label="Contacts">Contacts</button>
          <button class="btn-primary" id="add-step-btn">Add Step</button>
        </div>
      </div>`;

    // Body content: show empty state or current steps
    let bodyHtml = '';
    const hasSteps = Array.isArray(seq.steps) && seq.steps.length > 0;
    if (!hasSteps) {
      bodyHtml = `
        <div class="builder-content" id="sequence-builder-view">
          <div class="empty-state">
            <div class="empty-title">Start building your sequence</div>
            <div class="empty-desc">Add steps like emails, calls, and tasks. Configure delays and sending windows. This is a placeholder inspired by Apollo's layout.</div>
            <div style="margin-top: var(--spacing-md); display:flex; gap: var(--spacing-sm);">
              <button class="btn-primary" id="empty-add-step">Add your first step</button>
            </div>
          </div>
        </div>`;
    } else {
      const stepsHtml = renderSteps(seq.steps);
      bodyHtml = `
        <div class="builder-content" id="sequence-builder-view">
          <div class="sequence-steps" id="sequence-steps">
            ${stepsHtml}
            <div class="add-step-container">
              <button class="delay-pill" id="builder-add-step"><span class="icon">${svgPlus()}</span><span class="delay-label">Add a step</span></button>
            </div>
          </div>
        </div>`;
    }

    // Replace header
    const pageContainer = els.page ? els.page.querySelector('.page-container') : null;
    const pageHeader = pageContainer ? pageContainer.querySelector('.page-header') : null;
    const headerWrap = document.createElement('div');
    headerWrap.innerHTML = headerHtml;
    const headerEl = headerWrap.firstElementChild;
    if (pageHeader && headerEl && pageHeader.parentElement) {
      // Diff-update inner content to avoid unmounting icons/header root
      try {
        const newSubtitle = headerEl.querySelector('.contact-subtitle');
        const oldSubtitle = pageHeader.querySelector('.contact-subtitle');
        if (newSubtitle && oldSubtitle) {
          oldSubtitle.replaceWith(newSubtitle);
        } else {
          pageHeader.innerHTML = headerEl.innerHTML;
        }
      } catch (_) {
        pageHeader.innerHTML = headerEl.innerHTML;
      }
    } else if (pageContainer && headerEl) {
      pageContainer.prepend(headerEl);
    }

    // Replace body
    const bodyWrap = document.createElement('div');
    bodyWrap.innerHTML = bodyHtml;
    const bodyEl = bodyWrap.firstElementChild;
    if (els.mainContent && bodyEl) {
      els.mainContent.innerHTML = '';
      els.mainContent.appendChild(bodyEl);
    }

    attachEvents();
    // Attach builder specific interactions
    attachBuilderEvents();
  }

  function handleAddStep(type, label) {
    try {
      if (!state.currentSequence.steps) state.currentSequence.steps = [];
      const id = 'step-' + Date.now();
      const base = { id, type, label, createdAt: Date.now(), collapsed: false, paused: false };
      let step = base;
      if (type === 'auto-email' || type === 'manual-email') {
        step = {
          ...base,
          channel: 'email',
          delayMinutes: 30,
          activeTab: 'editor',
          data: {
            subject: '',
            body: '',
            attachments: [],
            // Compose mode + AI lifecycle defaults
            mode: 'manual', // 'manual' | 'ai'
            aiPrompt: '',
            aiStatus: 'draft', // 'draft' | 'generated' | 'saved'
            aiOutput: null
          }
        };
      } else if (type === 'phone-call') {
        step = {
          ...base,
          channel: 'phone',
          delayMinutes: 0,
          data: {
            priority: 'normal',
            note: '',
            skipAfterDueEnabled: false,
            skipAfterDays: 3
          }
        };
      } else if (type === 'li-connect' || type === 'li-message' || type === 'li-view-profile' || type === 'li-interact-post') {
        step = {
          ...base,
          channel: 'linkedin',
          delayMinutes: 0,
          data: {
            priority: 'normal',
            note: '',
            skipAfterDueEnabled: false,
            skipAfterDays: 3
          }
        };
      }
      state.currentSequence.steps.push(step);
      // Immediately persist the newly added step so it survives refresh
      try { scheduleStepSave(step.id, true); } catch (_) { /* noop */ }
    } catch (_) { /* noop */ }
    // Ensure any lingering step-type modal overlay is removed to prevent freeze
    try {
      document.querySelectorAll('.modal-overlay').forEach(el => {
        if (el && el.parentElement) el.parentElement.removeChild(el);
      });
    } catch (_) { /* noop */ }
    if (window.crm && typeof window.crm.showToast === 'function') {
      window.crm.showToast(`Added: ${label}`);
    }
    render();
  }

  function createStepTypeModal(onSelect) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.tabIndex = -1;
    overlay.innerHTML = `
      <div class="step-type-modal" role="dialog" aria-modal="true" aria-labelledby="step-type-title" aria-describedby="step-type-subtitle">
        <div class="header">
          <div class="title-wrap">
            <div class="title" id="step-type-title">Add Step</div>
            <div class="subtitle" id="step-type-subtitle">Choose a step type to add to your sequence. You can draft emails with AI.</div>
          </div>
          <button class="close-btn" aria-label="Close">×</button>
        </div>
        <div class="body">
          <div class="step-type-category">
            <div class="cat-title">Email</div>
            <div class="cat-desc">Send automated emails or compose manual emails. Use AI to draft messages fast.</div>
            <div class="step-options">
              <button class="step-option" data-type="auto-email">
                <span class="icon">${svgEmail()}</span>
                <span class="label">Automatic email</span>
              </button>
              <button class="step-option" data-type="manual-email">
                <span class="icon">${svgEdit()}</span>
                <span class="label">Manual email</span>
              </button>
            </div>
          </div>

          <div class="step-type-category">
            <div class="cat-title">Phone</div>
            <div class="cat-desc">Create call tasks, track notes and outcomes, and keep your pipeline moving.</div>
            <div class="step-options">
              <button class="step-option" data-type="phone-call">
                <span class="icon">${svgPhone()}</span>
                <span class="label">Phone call</span>
              </button>
            </div>
          </div>

          <div class="step-type-category">
            <div class="cat-title">LinkedIn</div>
            <div class="cat-desc">Add social touches: connection requests, messages, profile views, or post interactions.</div>
            <div class="step-options">
              <button class="step-option" data-type="li-connect">
                <span class="icon">${svgLinkedIn()}</span>
                <span class="label">LinkedIn - send connection request</span>
              </button>
              <button class="step-option" data-type="li-message">
                <span class="icon">${svgLinkedIn()}</span>
                <span class="label">LinkedIn - send message</span>
              </button>
              <button class="step-option" data-type="li-view-profile">
                <span class="icon">${svgLinkedIn()}</span>
                <span class="label">LinkedIn - view profile</span>
              </button>
              <button class="step-option" data-type="li-interact-post">
                <span class="icon">${svgLinkedIn()}</span>
                <span class="label">LinkedIn - interact with post</span>
              </button>
            </div>
          </div>

          <div class="step-type-category">
            <div class="cat-title">Other</div>
            <div class="cat-desc">Create a custom task for anything else you need to do.</div>
            <div class="step-options">
              <button class="step-option" data-type="custom-task">
                <span class="icon">${svgTask()}</span>
                <span class="label">Custom Task</span>
              </button>
            </div>
          </div>
        </div>
      </div>`;

    const close = () => { if (overlay.parentElement) overlay.parentElement.removeChild(overlay); };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || (e.target.classList && e.target.classList.contains('close-btn'))) close();
    });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    // Attach listeners for options
    setTimeout(() => {
      overlay.querySelectorAll('.step-option').forEach(btn => {
        btn.addEventListener('click', () => {
          const type = btn.getAttribute('data-type');
          const labelEl = btn.querySelector('.label');
          const label = labelEl ? labelEl.textContent.trim() : type;
          try { onSelect({ type, label }); } catch (_) { /* noop */ }
          close();
        });
      });
      const first = overlay.querySelector('.step-option');
      if (first) first.focus();
    }, 0);

    return overlay;
  }

  // Modal: list all contacts in the current sequence
  function createContactsListModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay contacts-modal-overlay';
    overlay.tabIndex = -1;

    const contacts = Array.isArray(state.contacts) ? state.contacts.slice() : [];
    
    // Sort by name (case-insensitive), similar to Apollo list ordering
    contacts.sort((a, b) => {
      const an = (a.name || a.fullName || `${a.firstName || ''} ${a.lastName || ''}`).trim().toLowerCase();
      const bn = (b.name || b.fullName || `${b.firstName || ''} ${b.lastName || ''}`).trim().toLowerCase();
      return an.localeCompare(bn);
    });
    const total = contacts.length;

    const listHtml = total === 0
      ? `<div class="empty-text">No contacts in this sequence yet.</div>`
      : `<div class="contacts-toolbar"><label class="sel-all"><input type="checkbox" class="select-all-contacts" aria-label="Select all contacts" /> Select all</label></div>
         <div class="bulk-actions-modal contacts-bulk" id="contacts-bulk-actions" hidden>
           <div class="bar">
             <button class="action-btn-sm" id="bulk-clear-contacts"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l14 14M19 5L5 19"></path></svg><span>Clear <span class="bulk-count">0</span> selected</span></button>
             <span class="spacer"></span>
             <button class="action-btn-sm danger" id="bulk-remove-contacts"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path></svg><span>Delete</span></button>
           </div>
         </div>
         <div class="contact-list" role="list">${contacts.map((c) => {
            const nameRaw = c.name || c.fullName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unnamed Contact';
            const name = escapeHtml(nameRaw);
            const title = escapeHtml(c.title || c.jobTitle || '');
            const company = escapeHtml(c.company || c.companyName || '');
            const subtitle = (title && company) ? `${title} at ${company}` : (title || company);
            const initials = escapeHtml(getInitials(nameRaw));
            const cid = escapeHtml(c.id || '');
            
            return `
              <div class="contact-row" role="listitem" data-id="${cid}">
                <input type="checkbox" class="row-select" aria-label="Select contact" data-id="${cid}" />
                <div class="left">
                  <span class="avatar-initials" aria-hidden="true">${initials}</span>
                  <div class="meta">
                    <button type="button" class="name view-contact" data-id="${cid}">${name}</button>
                    ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
                  </div>
                </div>
                <div class="actions">
                  <button type="button" class="action-link view-contact" data-id="${cid}">View</button>
                  <button type="button" class="action-link danger remove-contact" data-id="${cid}">Remove</button>
                </div>
              </div>`;
          }).join('')}</div>`;

    overlay.innerHTML = `
      <div class="step-type-modal contacts-modal" role="dialog" aria-modal="true" aria-labelledby="contacts-modal-title" aria-describedby="contacts-modal-subtitle">
        <div class="header">
          <div class="title-wrap">
            <div class="title" id="contacts-modal-title">Sequence Contacts</div>
            <div class="subtitle" id="contacts-modal-subtitle">${total} ${total === 1 ? 'contact' : 'contacts'}</div>
          </div>
          <button class="close-btn" aria-label="Close">×</button>
        </div>
        <div class="body">
          ${listHtml}
        </div>
      </div>`;

    // Close + focus restore
    const prevActive = document.activeElement;
    const close = () => {
      if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
      try { if (prevActive && typeof prevActive.focus === 'function') prevActive.focus(); } catch (_) {}
    };
    overlay.addEventListener('click', (e) => { if (e.target === overlay || (e.target.classList && e.target.classList.contains('close-btn'))) close(); });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    // Wire interactions after in-DOM to ensure focusable query works
    setTimeout(() => {
      const modal = overlay.querySelector('.contacts-modal');
      const body = modal ? modal.querySelector('.body') : null;
      const subtitleEl = modal ? modal.querySelector('#contacts-modal-subtitle') : null;
      const list = modal ? modal.querySelector('.contact-list') : null;
      const bulkBar = modal ? modal.querySelector('#contacts-bulk-actions') : null;
      const bulkCount = bulkBar ? bulkBar.querySelector('.bulk-count') : null;
      const selAll = modal ? modal.querySelector('.select-all-contacts') : null;
      const selected = new Set();

      const persist = async () => {
        try {
          const db = window.firebaseDB;
          if (!db || !state.currentSequence?.id) return;
          
          const updateData = {
            contacts: state.contacts,
            recordCount: state.contacts.length,
            updatedAt: Date.now()
          };
          
          // Use server timestamp if available
          if (window.firebase?.firestore?.FieldValue?.serverTimestamp) {
            updateData.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
          }
          
          await db.collection('sequences').doc(state.currentSequence.id).update(updateData);
          state.currentSequence.contacts = state.contacts;
          state.currentSequence.recordCount = state.contacts.length;
        } catch (err) {
          console.warn('Failed to persist contacts update:', err);
        }
      };

      const updateCounts = () => {
        const count = state.contacts.length;
        if (subtitleEl) subtitleEl.textContent = `${count} ${count === 1 ? 'contact' : 'contacts'}`;
      };

      const updateBulkBar = () => {
        const n = selected.size;
        if (bulkBar) {
          bulkBar.hidden = n === 0;
          if (bulkCount) bulkCount.textContent = String(n);
        }
        if (selAll && list) {
          const rowCbs = list.querySelectorAll('input.row-select');
          const totalRows = rowCbs.length;
          const selectedRows = [...rowCbs].filter(cb => cb.checked).length;
          selAll.checked = totalRows > 0 && selectedRows === totalRows;
          selAll.indeterminate = selectedRows > 0 && selectedRows < totalRows;
        }
      };

      const removeOne = async (id) => {
        if (!id) return;
        
        // Delete sequenceMembers document from Firebase
        try {
          const db = window.firebaseDB;
          if (db && state.currentSequence?.id) {
            // Find and delete the sequenceMembers document
            const membersQuery = await db.collection('sequenceMembers')
              .where('sequenceId', '==', state.currentSequence.id)
              .where('targetId', '==', id)
              .where('targetType', '==', 'people')
              .get();
            
            // Delete all matching documents (should be just one, but handle multiple)
            const deletePromises = [];
            membersQuery.forEach(doc => {
              deletePromises.push(doc.ref.delete());
            });
            await Promise.all(deletePromises);
            
            // Decrement sequence stats.active count (same as contact-detail.js)
            if (window.firebase?.firestore?.FieldValue && state.currentSequence?.id) {
              await db.collection('sequences').doc(state.currentSequence.id).update({
                "stats.active": window.firebase.firestore.FieldValue.increment(-1)
              });
            }
          }
        } catch (err) {
          console.warn('Failed to delete sequenceMembers document:', err);
        }
        
        // Update state
        const idx = state.contacts.findIndex(c => c.id === id);
        if (idx >= 0) state.contacts.splice(idx, 1);
        await persist();
        
        // Invalidate sequenceMembers cache so it refreshes next time
        if (window._sequenceMembersCache && state.currentSequence?.id) {
          const cacheKey = `sequence-members-${state.currentSequence.id}`;
          window._sequenceMembersCache.delete(cacheKey);
        }
        
        // Update DOM
        const row = list ? list.querySelector(`.contact-row[data-id="${CSS.escape(id)}"]`) : null;
        if (row) row.remove();
        selected.delete(id);
        updateCounts();
        updateBulkBar();
        // If list empty show empty text
        if (list && list.children.length === 0) {
          if (body) body.innerHTML = `<div class="empty-text">No contacts in this sequence yet.</div>`;
        }
      };

      const viewOne = (id) => {
        if (!id) return;
        // Navigate to People then open ContactDetail
        try { window.crm && window.crm.navigateToPage && window.crm.navigateToPage('people'); } catch (_) {}
        const tryOpen = () => {
          if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
            try { window.ContactDetail.show(id); } catch (_) { /* noop */ }
          } else {
            setTimeout(tryOpen, 80);
          }
        };
        setTimeout(tryOpen, 150);
        close();
      };

      // Row checkbox handlers
      if (list) {
        list.querySelectorAll('input.row-select').forEach(cb => {
          cb.addEventListener('change', () => {
            const id = cb.getAttribute('data-id') || '';
            if (!id) return;
            if (cb.checked) selected.add(id); else selected.delete(id);
            updateBulkBar();
          });
        });
        // Action: view/remove
        list.querySelectorAll('.view-contact').forEach(btn => btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id') || '';
          viewOne(id);
        }));
        list.querySelectorAll('.remove-contact').forEach(btn => btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id') || '';
          removeOne(id);
        }));
      }

      if (selAll && list) {
        selAll.addEventListener('change', () => {
          const check = selAll.checked;
          list.querySelectorAll('input.row-select').forEach(cb => {
            cb.checked = check;
            const id = cb.getAttribute('data-id') || '';
            if (!id) return;
            if (check) selected.add(id); else selected.delete(id);
          });
          updateBulkBar();
        });
      }

      if (bulkBar) {
        const clearBtn = bulkBar.querySelector('#bulk-clear-contacts');
        const removeBtn = bulkBar.querySelector('#bulk-remove-contacts');
        clearBtn && clearBtn.addEventListener('click', () => {
          // Uncheck all
          if (list) list.querySelectorAll('input.row-select').forEach(cb => { cb.checked = false; });
          selected.clear();
          updateBulkBar();
        });
        removeBtn && removeBtn.addEventListener('click', () => {
          // Remove selected
          const ids = Array.from(selected);
          ids.forEach(id => removeOne(id));
        });
      }

      // Focus trap inside modal
      const getFocusable = () => {
        if (!modal) return [];
        const selectors = 'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])';
        return Array.from(modal.querySelectorAll(selectors)).filter(el => !el.hasAttribute('disabled') && el.tabIndex !== -1 && el.offsetParent !== null);
      };
      const focusables = getFocusable();
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      // Prefer focusing the Close button for consistency with other modals
      const preferred = modal ? modal.querySelector('.close-btn') : null;
      if (preferred) preferred.focus(); else if (first) first.focus();
      overlay.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        const current = document.activeElement;
        const items = getFocusable();
        const f = items[0];
        const l = items[items.length - 1];
        if (!f || !l) return;
        if (e.shiftKey) {
          if (current === f) { e.preventDefault(); l.focus(); }
        } else {
          if (current === l) { e.preventDefault(); f.focus(); }
        }
      });
    }, 0);

    return overlay;
  }

  // Delete confirmation modal for steps
  function createDeleteStepModal(step, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.tabIndex = -1;
    const titleId = `delete-step-title-${escapeHtml(step.id)}`;
    const descId = `delete-step-desc-${escapeHtml(step.id)}`;
    overlay.innerHTML = `
      <div class="step-type-modal" role="dialog" aria-modal="true" aria-labelledby="${titleId}" aria-describedby="${descId}">
        <div class="header">
          <div class="title-wrap">
            <div class="title" id="${titleId}">Delete step</div>
            <div class="subtitle" id="${descId}">Are you sure you want to delete this step? This action cannot be undone.</div>
          </div>
          <button class="close-btn" aria-label="Close">×</button>
        </div>
        <div class="body">
          <div class="btn-row">
            <button type="button" class="btn-text">Cancel</button>
            <button type="button" class="btn-danger btn-confirm">Delete</button>
          </div>
        </div>
      </div>`;

    const close = () => { if (overlay.parentElement) overlay.parentElement.removeChild(overlay); };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || (e.target.classList && e.target.classList.contains('close-btn'))) close();
    });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    setTimeout(() => {
      const cancel = overlay.querySelector('.btn-text');
      const confirm = overlay.querySelector('.btn-confirm');
      if (cancel) cancel.addEventListener('click', () => close());
      if (confirm) confirm.addEventListener('click', () => { try { onConfirm && onConfirm(); } catch (_) {} close(); });
      const first = confirm || cancel || overlay.querySelector('.close-btn');
      if (first) first.focus();
    }, 0);
    return overlay;
  }

  // Variables popover anchored to the Variables toolbar button
  function createVariablesPopover(anchorEl, onSelect) {
    // Close any existing popover first
    document.querySelectorAll('.vars-popover').forEach(el => el.remove());

    const people = [
      { key: 'first_name', label: 'First name' },
      { key: 'last_name', label: 'Last name' },
      { key: 'full_name', label: 'Full name' },
      { key: 'title', label: 'Title' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' }
    ];
    const account = [
      { key: 'name', label: 'Company name' },
      { key: 'website', label: 'Website' },
      { key: 'industry', label: 'Industry' },
      { key: 'size', label: 'Company size' },
      { key: 'city', label: 'City' },
      { key: 'state', label: 'State/Region' },
      { key: 'country', label: 'Country' }
    ];
    const sender = [
      { key: 'first_name', label: 'Sender first name' },
      { key: 'last_name', label: 'Sender last name' },
      { key: 'full_name', label: 'Sender full name' },
      { key: 'title', label: 'Sender title' },
      { key: 'email', label: 'Sender email' }
    ];

    const renderList = (items, scope) => items.map(i => `
      <button class="var-item" data-scope="${scope}" data-key="${escapeHtml(i.key)}" role="menuitem">
        <span class="var-item-label">${escapeHtml(i.label)}</span>
        <span class="var-item-token">{{${scope}.${escapeHtml(i.key)}}}</span>
      </button>
    `).join('');

    const pop = document.createElement('div');
    pop.className = 'vars-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', 'false');
    pop.innerHTML = `
      <div class="vars-popover-inner">
        <div class="vars-tabs" role="tablist">
          <button class="vars-tab active" role="tab" aria-selected="true" data-tab="people">People</button>
          <button class="vars-tab" role="tab" aria-selected="false" data-tab="account">Account</button>
          <button class="vars-tab" role="tab" aria-selected="false" data-tab="sender">Sender</button>
        </div>
        <div class="vars-panels">
          <div class="vars-panel" data-tab="people" role="tabpanel">
            <div class="var-list" role="menu">
              ${renderList(people, 'contact')}
            </div>
          </div>
          <div class="vars-panel hidden" data-tab="account" role="tabpanel" aria-hidden="true">
            <div class="var-list" role="menu">
              ${renderList(account, 'account')}
            </div>
          </div>
          <div class="vars-panel hidden" data-tab="sender" role="tabpanel" aria-hidden="true">
            <div class="var-list" role="menu">
              ${renderList(sender, 'sender')}
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(pop);
    // ARIA on trigger
    try {
      anchorEl.setAttribute('aria-haspopup', 'dialog');
      anchorEl.setAttribute('aria-expanded', 'true');
      anchorEl.setAttribute('aria-controls', popId);
    } catch (_) {}

    // Position below toolbar, centered horizontally
    const toolbarEl = anchorEl.closest('.editor-toolbar') || anchorEl;
    const rect = toolbarEl.getBoundingClientRect();
    const spacing = 6;
    pop.style.position = 'fixed';
    pop.style.top = `${rect.bottom + spacing}px`;
    // Center under toolbar and clamp to viewport
    const popWidth = pop.offsetWidth || 0;
    let left = rect.left + (rect.width - popWidth) / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - popWidth - 8));
    pop.style.left = `${left}px`;

    // Mark button as expanded for accessibility
    try { anchorEl.setAttribute('aria-expanded', 'true'); } catch (_) {}

    // Tab switching
    const tabs = pop.querySelectorAll('.vars-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-tab');
        tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        pop.querySelectorAll('.vars-panel').forEach(p => {
          const on = p.getAttribute('data-tab') === target;
          p.classList.toggle('hidden', !on);
          p.setAttribute('aria-hidden', String(!on));
        });
      });
    });

    // Selection handler
    pop.querySelectorAll('.var-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const scope = btn.getAttribute('data-scope') || '';
        const key = btn.getAttribute('data-key') || '';
        onSelect && onSelect({ scope, key });
        cleanup();
      });
    });

    // Close on outside click or Escape
    const onDocClick = (e) => {
      // Treat clicks on the anchor button OR any of its children as inside
      if (!pop.contains(e.target) && !anchorEl.contains(e.target)) {
        cleanup();
      }
    };
    const onEsc = (e) => { if (e.key === 'Escape') cleanup(); };
    function cleanup() {
      document.removeEventListener('click', onDocClick, true);
      document.removeEventListener('keydown', onEsc, true);
      try { anchorEl.setAttribute('aria-expanded', 'false'); } catch (_) {}
      try {
        pop.classList.add('closing');
        const removeNow = () => { try { pop.remove(); } catch (_) {} };
        pop.addEventListener('animationend', removeNow, { once: true });
        setTimeout(removeNow, 180);
      } catch (_) {
        try { pop.remove(); } catch (_) {}
      }
    }
    // Expose cleanup for external toggles
    try { pop._cleanup = cleanup; } catch (_) {}
    setTimeout(() => {
      document.addEventListener('click', onDocClick, true);
      document.addEventListener('keydown', onEsc, true);
      const first = pop.querySelector('.var-item');
      first && first.focus && first.focus();
    }, 0);

    return pop;
  }

  function createVariablesModal(onSelect) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.tabIndex = -1;

    const people = [
      { key: 'first_name', label: 'First name' },
      { key: 'last_name', label: 'Last name' },
      { key: 'full_name', label: 'Full name' },
      { key: 'title', label: 'Title' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' }
    ];
    const account = [
      { key: 'name', label: 'Company name' },
      { key: 'website', label: 'Website' },
      { key: 'industry', label: 'Industry' },
      { key: 'size', label: 'Company size' },
      { key: 'city', label: 'City' },
      { key: 'state', label: 'State/Region' },
      { key: 'country', label: 'Country' }
    ];
    const sender = [
      { key: 'first_name', label: 'Sender first name' },
      { key: 'last_name', label: 'Sender last name' },
      { key: 'full_name', label: 'Sender full name' },
      { key: 'title', label: 'Sender title' },
      { key: 'email', label: 'Sender email' }
    ];

    const renderList = (items, scope) => items.map(i => `
      <button class="var-item" data-scope="${scope}" data-key="${escapeHtml(i.key)}" role="menuitem">
        <span class="var-item-label">${escapeHtml(i.label)}</span>
        <span class="var-item-token">{{${scope}.${escapeHtml(i.key)}}}</span>
      </button>
    `).join('');

    overlay.innerHTML = `
      <div class="vars-modal" role="dialog" aria-modal="true" aria-labelledby="vars-title" aria-describedby="vars-subtitle">
        <div class="header">
          <div class="title-wrap">
            <div class="title" id="vars-title">Insert Variables</div>
            <div class="subtitle" id="vars-subtitle">Personalize your email with contact, account, and sender fields.</div>
          </div>
          <button class="close-btn" aria-label="Close">×</button>
        </div>
        <div class="body">
          <div class="vars-tabs" role="tablist">
            <button class="vars-tab active" role="tab" aria-selected="true" data-tab="people">People</button>
            <button class="vars-tab" role="tab" aria-selected="false" data-tab="account">Account</button>
            <button class="vars-tab" role="tab" aria-selected="false" data-tab="sender">Sender</button>
          </div>
          <div class="vars-panels">
            <div class="vars-panel" data-tab="people" role="tabpanel">
              <div class="var-list" role="menu">
                ${renderList(people, 'contact')}
              </div>
            </div>
            <div class="vars-panel hidden" data-tab="account" role="tabpanel" aria-hidden="true">
              <div class="var-list" role="menu">
                ${renderList(account, 'account')}
              </div>
            </div>
            <div class="vars-panel hidden" data-tab="sender" role="tabpanel" aria-hidden="true">
              <div class="var-list" role="menu">
                ${renderList(sender, 'sender')}
              </div>
            </div>
          </div>
        </div>
      </div>`;

    const close = () => {
      if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
    };

    // Close logic
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || (e.target.classList && e.target.classList.contains('close-btn'))) close();
    });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    // Tab switching
    setTimeout(() => {
      const tabs = overlay.querySelectorAll('.vars-tab');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const target = tab.getAttribute('data-tab');
          tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
          tab.classList.add('active');
          tab.setAttribute('aria-selected', 'true');
          overlay.querySelectorAll('.vars-panel').forEach(p => {
            const on = p.getAttribute('data-tab') === target;
            p.classList.toggle('hidden', !on);
            p.setAttribute('aria-hidden', String(!on));
          });
        });
      });

      // Selection handler
      overlay.querySelectorAll('.var-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const scope = btn.getAttribute('data-scope') || '';
          const key = btn.getAttribute('data-key') || '';
          try { onSelect && onSelect({ scope, key }); } catch (_) { /* noop */ }
          close();
        });
      });

      const first = overlay.querySelector('.var-item');
      if (first) first.focus();
    }, 0);

    return overlay;
  }

  function renderSteps(steps) {
    const out = [];
    steps.forEach((step, idx) => {
      const order = idx + 1;
      if (step.channel === 'email' || step.type === 'auto-email' || step.type === 'manual-email') {
        out.push(renderEmailStepHTML(step, order));
      } else if (step.channel === 'phone' || step.type === 'phone-call') {
        out.push(renderPhoneCallStepHTML(step, order));
      } else if (step.type === 'li-connect' || step.type === 'li-message' || step.type === 'li-view-profile' || step.type === 'li-interact-post') {
        out.push(renderLinkedInStepHTML(step, order));
      } else {
        // Fallback generic step
        out.push(`
      <div class="step-card" data-id="${escapeHtml(step.id)}">
        <div class="step-header">
          <button class="collapse-btn" aria-expanded="${!step.collapsed}">${step.collapsed ? svgChevronRight() : svgChevronDown()}</button>
          <div class="step-title">
            <div class="title">${escapeHtml(step.label || ('Step #' + order))}</div>
            <div class="desc muted">${escapeHtml(formatDelay(step.delayMinutes || 0))}</div>
          </div>
          <div class="spacer"></div>
          <button class="icon-btn-sm trash-step" title="Delete step" aria-label="Delete step">${svgTrash()}</button>
          <div class="step-status-toggle">
            <label class="toggle-switch" title="${step.paused ? 'Step is paused' : 'Step is active'}">
              <input type="checkbox" class="pause-toggle" aria-label="Pause or start step" ${step.paused ? '' : 'checked'} />
              <span class="toggle-slider" aria-hidden="true"></span>
            </label>
            <span class="switch-text">${step.paused ? 'Paused' : 'Active'}</span>
          </div>
        </div>
        <div class="step-body" ${step.collapsed ? 'hidden' : ''}>
          <div class="muted" style="padding: var(--spacing-md);">This step type UI is coming soon.</div>
        </div>
      </div>`);
      }
    });
    return out.join('');
  }

  function renderEmailStepHTML(step, order) {
    const delayText = formatDelay(step.delayMinutes || 0, 'email');
    const shortDelay = formatDelayShort(step.delayMinutes || 0);
    const expanded = !step.collapsed;
    const editorActive = (step.activeTab || 'editor') === 'editor';
    const previewActive = (step.activeTab || 'editor') === 'preview';
    const isAuto = (step.type === 'auto-email');
    const defaultLabel = isAuto ? 'Automatic email' : 'Manual email';
    const labelText = escapeHtml(step.label || defaultLabel);
    const labelDesc = isAuto
      ? `Sends automatically (${escapeHtml(shortDelay)})`
      : `Schedules task immediately with due date (${escapeHtml(shortDelay)})`;
    const labelMarkup = `
      <span class="label-wrap">
        ${isAuto ? `<span class="label-icon">${svgEmailSmall()}</span>` : ''}
        <span class="label">${labelText}</span>
        <span class="label-desc">${labelDesc}</span>
      </span>`;
    const htmlMode = step.data?.editorMode === 'html';
    const composeMode = (step.data?.mode === 'ai' || step.data?.mode === 'manual') ? step.data.mode : 'manual';
    // Compute preview subject/body with contact substitution if a contact is selected
    const selContact = step.data?.previewContact || null;
    const rawSubject = step.data?.subject || '';
    const rawBody = step.data?.body || '';
    const previewSubject = selContact ? substituteContactTokensInText(rawSubject, selContact) : escapeHtml(rawSubject || '(no subject)');
    const previewBodyHtml = selContact ? processBodyHtmlWithContact(rawBody, selContact) : (rawBody || '(empty)');
    return `
      <div class="step-item" data-id="${escapeHtml(step.id)}">
        <div class="delay-container">
          <div class="delay-pill">
            <span class="icon">${svgClock()}</span>
            <span class="delay-label">${delayText}</span>
            <button class="icon-btn-sm edit-delay" title="Edit delay" aria-label="Edit delay">${svgEdit()}</button>
          </div>
          <div class="delay-connector"></div>
        </div>
        <div class="step-card${previewActive ? ' preview-active' : ''}" data-id="${escapeHtml(step.id)}">
          <div class="step-header">
            <button class="collapse-btn" aria-expanded="${expanded}">${expanded ? svgChevronDown() : svgChevronRight()}</button>
            <div class="step-title">
              <span class="badge badge-email">Step ${order} • Email</span>
              ${labelMarkup}
            </div>
            <div class="spacer"></div>
            <div class="mode-toggle" role="group" aria-label="Compose mode">
              <div class="mode-toggle-wrap" id="mode-toggle-${escapeHtml(step.id)}">
                <button class="toggle-btn${composeMode==='manual' ? ' active' : ''}" data-mode="manual" aria-selected="${composeMode==='manual'}" title="Manual compose">Manual</button>
                <button class="toggle-btn${composeMode==='ai' ? ' active' : ''}" data-mode="ai" aria-selected="${composeMode==='ai'}" title="AI compose">AI</button>
              </div>
            </div>
            <button class="icon-btn-sm settings-step" title="Email settings" aria-label="Email settings">${svgSettings()}</button>
            <button class="icon-btn-sm trash-step" title="Delete step" aria-label="Delete step">${svgTrash()}</button>
            <div class="step-status-toggle">
              <label class="toggle-switch" title="${step.paused ? 'Step is paused' : 'Step is active'}">
                <input type="checkbox" class="pause-toggle" aria-label="Pause or start step" ${step.paused ? '' : 'checked'} />
                <span class="toggle-slider" aria-hidden="true"></span>
              </label>
              <span class="switch-text">${step.paused ? 'Paused' : 'Active'}</span>
            </div>
          </div>
          <div class="step-body" ${expanded ? '' : 'hidden'}>
            ${step.showSettings ? createEmailSettingsHTML(step.emailSettings || getDefaultEmailSettings(isAuto), step) : `
            <div class="step-tabs" role="tablist">
              <button class="tab ${editorActive ? 'active' : ''}" role="tab" data-tab="editor">Editor</button>
              <button class="tab ${previewActive ? 'active' : ''}" role="tab" data-tab="preview">Preview</button>
              <div class="spacer"></div>
              <div class="preview-contact-picker ${previewActive ? '' : 'hidden'}">
                <input type="text" class="input-dark preview-contact-input" placeholder="Search contact for preview..." value="${escapeHtml(selContact?.full_name || selContact?.fullName || selContact?.name || selContact?.title || '')}" aria-label="Search contact for preview" />
                <div class="preview-results" role="listbox" aria-label="Contact results"></div>
              </div>
            </div>
            <!-- Editor toolbar: hidden in AI mode -->
            ${composeMode==='ai' ? '' : `
            <div class="editor-toolbar" role="toolbar" aria-label="Email editor actions">
              <button class="toolbar-btn editor-only-btn" type="button" data-action="formatting" aria-label="Text formatting" ${htmlMode ? 'disabled aria-disabled="true"' : ''}>${svgTextTitleIcon()}</button>
              <button class="toolbar-btn editor-only-btn" type="button" data-action="link" aria-label="Insert link">${svgChain()}</button>
              <button class="toolbar-btn editor-only-btn" type="button" data-action="image" aria-label="Upload image">${svgImageIcon()}</button>
              <button class="toolbar-btn editor-only-btn" type="button" data-action="attach" aria-label="Attach files">${svgPaperclip()}</button>
              <button class="toolbar-btn editor-only-btn${htmlMode ? ' active' : ''}" type="button" data-action="code" aria-label="Edit raw HTML" aria-pressed="${htmlMode}">${svgCodeBrackets()}</button>
              <button class="toolbar-btn editor-only-btn" type="button" data-action="templates" aria-label="Load templates">${svgDoc()}</button>
              <button class="toolbar-btn editor-only-btn" type="button" data-action="variables" aria-label="Add dynamic variables">${svgBraces()}</button>
            </div>`}
            ${composeMode==='ai' ? '' : (htmlMode ? '' : renderFormattingBar())}
            <div class="link-bar" aria-hidden="true">
              <div class="field">
                <label class="fmt-label" for="link-text-${escapeHtml(step.id)}">Text</label>
                <input id="link-text-${escapeHtml(step.id)}" class="input-dark" type="text" placeholder="Display text" data-link-text />
              </div>
              <div class="field">
                <label class="fmt-label" for="link-url-${escapeHtml(step.id)}">URL</label>
                <input id="link-url-${escapeHtml(step.id)}" class="input-dark" type="url" placeholder="https://" data-link-url />
              </div>
              <div class="actions">
                <button class="fmt-btn" type="button" data-link-insert>Insert</button>
                <button class="fmt-btn" type="button" data-link-cancel>Cancel</button>
              </div>
            </div>
            <div class="tab-panels">
              <div class="tab-panel ${editorActive ? '' : 'hidden'}" data-tab="editor">
                ${composeMode==='ai' ? `
                <div class="ai-mode-note">
                  <div class="ai-stars" aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="264" height="264" role="img" focusable="false">
                      <defs>
                        <linearGradient id="pc-ai-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stop-color="#ff7a45"/>
                          <stop offset="55%" stop-color="#ff6b35"/>
                          <stop offset="100%" stop-color="#1b4ed8"/>
                        </linearGradient>
                      </defs>
                      <path fill="url(#pc-ai-grad)" d="M23.426,31.911l-1.719,3.936c-0.661,1.513-2.754,1.513-3.415,0l-1.719-3.936	c-1.529-3.503-4.282-6.291-7.716-7.815l-4.73-2.1c-1.504-0.668-1.504-2.855,0-3.523l4.583-2.034	c3.522-1.563,6.324-4.455,7.827-8.077l1.741-4.195c0.646-1.557,2.797-1.557,3.443,0l1.741,4.195	c1.503,3.622,4.305,6.514,7.827,8.077l4.583,2.034c1.504,0.668,1.504,2.855,0,3.523l-4.73,2.1	C27.708,25.62,24.955,28.409,23.426,31.911z"></path>
                      <path fill="url(#pc-ai-grad)" d="M38.423,43.248l-0.493,1.131c-0.361,0.828-1.507,0.828-1.868,0l-0.493-1.131	c-0.879-2.016-2.464-3.621-4.44-4.5l-1.52-0.675c-0.822-0.365-0.822-1.56,0-1.925l1.435-0.638c2.027-0.901,3.64-2.565,4.504-4.65	l0.507-1.222c0.353-0.852,1.531-0.852,1.884,0l0.507,1.222c0.864,2.085,2.477,3.749,4.504,4.65l1.435,0.638	c0.822,0.365,0.822,1.56,0,1.925l-1.52,0.675C40.887,39.627,39.303,41.232,38.423,43.248z"></path>
                      <path fill="none" stroke="rgba(255,255,255,.35)" stroke-width="0.6" d="M23.426,31.911l-1.719,3.936c-0.661,1.513-2.754,1.513-3.415,0l-1.719-3.936c-1.529-3.503-4.282-6.291-7.716-7.815l-4.73-2.1c-1.504-0.668-1.504-2.855,0-3.523l4.583-2.034c3.522-1.563,6.324-4.455,7.827-8.077l1.741-4.195c0.646-1.557,2.797-1.557,3.443,0l1.741,4.195c1.503,3.622,4.305,6.514,7.827,8.077l4.583,2.034c1.504,0.668,1.504,2.855,0,3.523l-4.73,2.1C27.708,25.62,24.955,28.409,23.426,31.911z"/>
                      <path fill="none" stroke="rgba(255,255,255,.35)" stroke-width="0.6" d="M38.423,43.248l-0.493,1.131c-0.361,0.828-1.507,0.828-1.868,0l-0.493-1.131c-0.879-2.016-2.464-3.621-4.44-4.5l-1.52-0.675c-0.822-0.365-0.822-1.56,0-1.925l1.435-0.638c2.027-0.901,3.64-2.565,4.504-4.65l0.507-1.222c0.353-0.852,1.531-0.852,1.884,0l0.507,1.222c0.864,2.085,2.477,3.749,4.504,4.65l1.435,0.638c0.822,0.365,0.822,1.56,0,1.925l-1.52,0.675C40.887,39.627,39.303,41.232,38.423,43.248z"/>
                    </svg>
                  </div>
                  <div class="ai-note-text">AI Mode is enabled. Use Preview to compose and save with AI.</div>
                </div>
                ` : `
                <div class="form-row">
                  <input type="text" class="input-dark subject-input" placeholder="Subject" value="${escapeHtml(step.data?.subject || '')}">
                </div>
                <div class="form-row">
                  ${htmlMode
                    ? `<div class="html-editor-wrap"><div class="html-mode-badge" aria-hidden="true">HTML Mode</div><textarea class="textarea-dark body-input" data-editor="html" spellcheck="false">${escapeHtml(step.data?.body || '')}</textarea></div>`
                    : `<div class="textarea-dark body-input" contenteditable="true" role="textbox" aria-multiline="true" data-editor="rich">${step.data?.body || ''}</div>`}
                </div>`}
                ${step.data?.attachments && step.data.attachments.length ? `
                <div class="attachments" role="group" aria-label="Attachments">
                  <div class="attach-title">Attachments</div>
                  <div class="attach-list">
                    ${step.data.attachments.map(a => `
                      <div class="attach-item" data-attach-id="${escapeHtml(a.id)}">
                        <span class="icon">${svgPaperclip()}</span>
                        <span class="name">${escapeHtml(a.name)}</span>
                        <button class="remove-attach" type="button" aria-label="Remove ${escapeHtml(a.name)}" title="Remove">×</button>
                      </div>
                    `).join('')}
                  </div>
                </div>
                ` : ''}
              </div>
              <div class="tab-panel ${previewActive ? '' : 'hidden'}" data-tab="preview">
                ${composeMode==='ai' ? `
                <div class="ai-compose">
                  <div class="ai-bar open" aria-hidden="false" style="margin-bottom:12px;">
                    <div class="ai-inner">
                      <div class="ai-row">
                        <textarea class="ai-prompt input-dark" rows="3" placeholder="Describe the email you want... (tone, goal, offer, CTA)">${escapeHtml(step.data?.aiPrompt || '')}</textarea>
                      </div>
                      <div class="ai-row suggestions" role="list">
                        <button class="ai-suggestion" type="button" data-prompt="Write an immediate follow-up email after our phone conversation">Immediate follow-up</button>
                        <button class="ai-suggestion" type="button" data-prompt="Write a same-day check-in email to maintain momentum">Same day check-in</button>
                        <button class="ai-suggestion" type="button" data-prompt="Write a weekly touchpoint email to stay top of mind">Weekly touchpoint</button>
                        <button class="ai-suggestion" type="button" data-prompt="Write an introduction email as the first touchpoint in our sequence">First email introduction</button>
                        <button class="ai-suggestion" type="button" data-prompt="Write a nurture email that provides value and builds relationship">Middle sequence nurture</button>
                        <button class="ai-suggestion" type="button" data-prompt="Write a final email with a clear call-to-action and next steps">Final sequence ask</button>
                      </div>
                      <div class="ai-row actions">
                        <button class="fmt-btn ai-generate" data-mode="standard">Generate Standard</button>
                        <button class="fmt-btn ai-generate" data-mode="html">Generate HTML</button>
                        <div class="ai-status" aria-live="polite"></div>
                      </div>
                    </div>
                  </div>
                  <div class="email-preview">
                    <div class="preview-subject">${escapeHtml((step.data?.aiOutput?.subject) || (previewSubject || '(no subject)'))}</div>
                    <div class="preview-body">${(step.data?.aiOutput?.html) || (previewBodyHtml || '(empty)')}</div>
                  </div>
                  <div class="ai-footbar" style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:10px;">
                    <div class="status-pill" aria-live="polite" style="font-size:12px; color: var(--text-secondary);">
                      ${escapeHtml((step.data?.aiStatus || 'draft').toUpperCase())}
                    </div>
                    <div>
                      <button class="btn-primary ai-save-to-step" ${step.data?.aiStatus==='generated' || step.data?.aiStatus==='draft' ? '' : 'disabled'}>Save to step</button>
                    </div>
                  </div>
                </div>
                ` : `
                <div class="email-preview">
                  <div class="preview-subject">${previewSubject || '(no subject)'}</div>
                  <div class="preview-body">${previewBodyHtml || '(empty)'}</div>
                </div>`}
              </div>
            </div>
            `}
          </div>
        </div>
      </div>`;
  }

  function renderPhoneCallStepHTML(step, order) {
    const delayText = formatDelay(step.delayMinutes || 0);
    const shortDelay = formatDelayShort(step.delayMinutes || 0);
    const expanded = !step.collapsed;
    const labelText = escapeHtml(step.label || 'Phone call');
    const labelDesc = `Schedules task ${escapeHtml(shortDelay)}`;
    const labelMarkup = `
      <span class="label-wrap">
        <span class="label-icon">${svgPhoneSmall()}</span>
        <span class="label">${labelText}</span>
        <span class="label-desc">${labelDesc}</span>
      </span>`;
    const priority = step.data?.priority || 'normal';
    const note = step.data?.note || '';
    const skipAfterDueEnabled = !!step.data?.skipAfterDueEnabled;
    const skipAfterDays = (Number.isFinite(Number(step.data?.skipAfterDays)) && Number(step.data?.skipAfterDays) > 0)
      ? Number(step.data.skipAfterDays)
      : 3;
    return `
      <div class="step-item" data-id="${escapeHtml(step.id)}">
        <div class="delay-container">
          <div class="delay-pill">
            <span class="icon">${svgClock()}</span>
            <span class="delay-label">${delayText}</span>
            <button class="icon-btn-sm edit-delay" title="Edit delay" aria-label="Edit delay">${svgEdit()}</button>
          </div>
          <div class="delay-connector"></div>
        </div>
        <div class="step-card" data-id="${escapeHtml(step.id)}" data-type="phone-call">
          <div class="step-header">
            <button class="collapse-btn" aria-expanded="${expanded}">${expanded ? svgChevronDown() : svgChevronRight()}</button>
            <div class="step-title">
              <span class="badge badge-phone">Step ${order} • Phone</span>
              ${labelMarkup}
            </div>
            <div class="spacer"></div>
            <button class="icon-btn-sm trash-step" title="Delete step" aria-label="Delete step">${svgTrash()}</button>
            <div class="step-status-toggle">
              <label class="toggle-switch" title="${step.paused ? 'Step is paused' : 'Step is active'}">
                <input type="checkbox" class="pause-toggle" aria-label="Pause or start step" ${step.paused ? '' : 'checked'} />
                <span class="toggle-slider" aria-hidden="true"></span>
              </label>
              <span class="switch-text">${step.paused ? 'Paused' : 'Active'}</span>
            </div>
          </div>
          <div class="step-body" ${expanded ? '' : 'hidden'}>
            <div class="form-row">
              <label class="fmt-label" for="priority-${escapeHtml(step.id)}">Priority</label>
              <select id="priority-${escapeHtml(step.id)}" class="input-dark call-priority">
                <option value="high" ${priority === 'high' ? 'selected' : ''}>High</option>
                <option value="normal" ${priority === 'normal' ? 'selected' : ''}>Normal</option>
                <option value="low" ${priority === 'low' ? 'selected' : ''}>Low</option>
              </select>
            </div>
            <div class="form-row">
              <label class="fmt-label" for="note-${escapeHtml(step.id)}">Call note</label>
              <textarea id="note-${escapeHtml(step.id)}" class="textarea-dark call-note" rows="4" placeholder="Add a call script or notes...">${escapeHtml(note)}</textarea>
            </div>
            <div class="form-row">
              <div class="checkbox-row">
                <label>
                  <input type="checkbox" class="call-skip-after-enabled" ${skipAfterDueEnabled ? 'checked' : ''} />
                  <span>Skip task</span>
                </label>
                <input type="number" min="1" step="1" class="input-dark call-skip-after-days" value="${skipAfterDays}" aria-label="Days after due date" ${skipAfterDueEnabled ? '' : 'disabled'} />
                <span class="muted">days after due date</span>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function renderLinkedInStepHTML(step, order) {
    const delayText = formatDelay(step.delayMinutes || 0);
    const shortDelay = formatDelayShort(step.delayMinutes || 0);
    const expanded = !step.collapsed;
    
    // Map step types to display labels
    const typeLabels = {
      'li-connect': 'LinkedIn - send connection request',
      'li-message': 'LinkedIn - send message', 
      'li-view-profile': 'LinkedIn - view profile',
      'li-interact-post': 'LinkedIn - interact with post'
    };
    
    const labelText = escapeHtml(step.label || typeLabels[step.type] || 'LinkedIn task');
    const labelDesc = `Schedules task ${escapeHtml(shortDelay)}`;
    const labelMarkup = `
      <span class="label-wrap">
        <span class="label-icon">${svgLinkedInSmall()}</span>
        <span class="label">${labelText}</span>
        <span class="label-desc">${labelDesc}</span>
      </span>`;
    
    const priority = step.data?.priority || 'normal';
    const note = step.data?.note || '';
    const skipAfterDueEnabled = !!step.data?.skipAfterDueEnabled;
    const skipAfterDays = (Number.isFinite(Number(step.data?.skipAfterDays)) && Number(step.data?.skipAfterDays) > 0)
      ? Number(step.data.skipAfterDays)
      : 3;
    
    return `
      <div class="step-item" data-id="${escapeHtml(step.id)}">
        <div class="delay-container">
          <div class="delay-pill">
            <span class="icon">${svgClock()}</span>
            <span class="delay-label">${delayText}</span>
            <button class="icon-btn-sm edit-delay" title="Edit delay" aria-label="Edit delay">${svgEdit()}</button>
          </div>
          <div class="delay-connector"></div>
        </div>
        <div class="step-card" data-id="${escapeHtml(step.id)}" data-type="${escapeHtml(step.type)}">
          <div class="step-header">
            <button class="collapse-btn" aria-expanded="${expanded}">${expanded ? svgChevronDown() : svgChevronRight()}</button>
            <div class="step-title">
              <span class="badge badge-linkedin">Step ${order} • LinkedIn</span>
              ${labelMarkup}
            </div>
            <div class="spacer"></div>
            <button class="icon-btn-sm trash-step" title="Delete step" aria-label="Delete step">${svgTrash()}</button>
            <div class="step-status-toggle">
              <label class="toggle-switch" title="${step.paused ? 'Step is paused' : 'Step is active'}">
                <input type="checkbox" class="pause-toggle" aria-label="Pause or start step" ${step.paused ? '' : 'checked'} />
                <span class="toggle-slider" aria-hidden="true"></span>
              </label>
              <span class="switch-text">${step.paused ? 'Paused' : 'Active'}</span>
            </div>
          </div>
          <div class="step-body" ${expanded ? '' : 'hidden'}>
            <div class="form-row">
              <label class="fmt-label" for="priority-${escapeHtml(step.id)}">Task priority</label>
              <select id="priority-${escapeHtml(step.id)}" class="input-dark linkedin-priority">
                <option value="high" ${priority === 'high' ? 'selected' : ''}>High</option>
                <option value="normal" ${priority === 'normal' ? 'selected' : ''}>Medium</option>
                <option value="low" ${priority === 'low' ? 'selected' : ''}>Low</option>
              </select>
            </div>
            <div class="form-row">
              <label class="fmt-label" for="note-${escapeHtml(step.id)}">Task note</label>
              <textarea id="note-${escapeHtml(step.id)}" class="textarea-dark linkedin-note" rows="4" placeholder="e.g. Ask prospects about their pain points and share our compatibility case study with them">${escapeHtml(note)}</textarea>
            </div>
            <div class="form-row">
              <div class="checkbox-row">
                <label>
                  <input type="checkbox" class="linkedin-skip-after-enabled" ${skipAfterDueEnabled ? 'checked' : ''} />
                  <span>Skip task</span>
                </label>
                <input type="number" min="1" step="1" class="input-dark linkedin-skip-after-days" value="${skipAfterDays}" aria-label="Days after due date" ${skipAfterDueEnabled ? '' : 'disabled'} />
                <span class="muted">days after due date</span>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function formatDelay(minutes, channel) {
    const n = Number(minutes) || 0;
    if (n < 60) return `${channel === 'email' ? 'Send email' : 'Do step'} in ${n} minute${n === 1 ? '' : 's'}`;
    const hours = Math.floor(n / 60);
    const mins = n % 60;
    const hoursText = `${hours} hour${hours === 1 ? '' : 's'}`;
    const minsText = mins ? ` ${mins} minute${mins === 1 ? '' : 's'}` : '';
    return `${channel === 'email' ? 'Send email' : 'Do step'} in ${hoursText}${minsText}`;
  }

  function formatDelayShort(minutes) {
    const n = Number(minutes) || 0;
    if (n <= 0) return 'immediately';
    if (n < 60) return `in ${n} minute${n === 1 ? '' : 's'}`;
    const hours = Math.floor(n / 60);
    const mins = n % 60;
    const hoursText = `${hours} hour${hours === 1 ? '' : 's'}`;
    const minsText = mins ? ` ${mins} minute${mins === 1 ? '' : 's'}` : '';
    return `in ${hoursText}${minsText}`;
  }

  function formatMultiline(text) {
    return escapeHtml(text || '').replace(/\n/g, '<br>');
  }

  // Debounce utility and Firestore save helpers
  function debounce(fn, wait = 600) {
    let t = null;
    const debounced = (...args) => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        try { fn(...args); } catch (_) { /* noop */ }
      }, wait);
    };
    debounced.flush = (...args) => {
      if (t) clearTimeout(t);
      t = null;
      try { fn(...args); } catch (_) { /* noop */ }
    };
    return debounced;
  }

  const _debouncedSaves = new Map();
  function getDebouncedSaver(stepId) {
    let saver = _debouncedSaves.get(stepId);
    if (saver) return saver;
    saver = debounce(() => {
      try { saveStepToFirestore(stepId); } catch (_) { /* noop */ }
    }, 700);
    _debouncedSaves.set(stepId, saver);
    return saver;
  }

  function scheduleStepSave(stepId, immediate = false) {
    const saver = getDebouncedSaver(stepId);
    if (immediate && saver && typeof saver.flush === 'function') saver.flush();
    else saver();
  }

  let _isSaving = false;
  async function saveStepToFirestore(stepId) {
    try {
      if (_isSaving) return; // coalesce overlapping saves to reduce churn/flicker
      _isSaving = true;
      const db = (typeof window !== 'undefined') ? window.firebaseDB : null;
      const seq = state.currentSequence;
      if (!db || !seq || !seq.id || !Array.isArray(seq.steps)) return;
      // Firestore cannot update a single array element; update the steps array with merge
      await db.collection('sequences').doc(seq.id).set({ steps: seq.steps }, { merge: true });
    } catch (err) {
      console.warn('Failed to persist step to Firestore:', err);
    } finally {
      _isSaving = false;
    }
  }

  // Contact variable helpers for preview substitution
  function snakeToCamel(s) {
    return String(s || '').replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  }

  function friendlyLabelForVar(scope, key) {
    const map = {
      contact: {
        first_name: 'first name',
        last_name: 'last name',
        full_name: 'full name',
        title: 'title',
        email: 'email',
        phone: 'phone'
      },
      account: {
        name: 'company name',
        website: 'website',
        industry: 'industry',
        size: 'company size',
        city: 'company city',
        state: 'company state',
        country: 'company country'
      }
    };
    const s = String(scope || '').toLowerCase();
    const k = String(key || '');
    const label = map[s] && map[s][k];
    return label ? label : `${s}.${k}`;
  }

  // Resolve sender first name from multiple sources so it's always available
  function getSenderFirstName() {
    try {
      const v = (window.SettingsPage && typeof window.SettingsPage.getSetting === 'function')
        ? window.SettingsPage.getSetting('general.firstName')
        : null;
      if (v && String(v).trim()) return String(v).trim();
    } catch (_) {}

    try {
      const v = window.SettingsPage?.instance?.state?.settings?.general?.firstName;
      if (v && String(v).trim()) return String(v).trim();
    } catch (_) {}

    try {
      const raw = localStorage.getItem('crm-settings');
      if (raw) {
        const parsed = JSON.parse(raw);
        const v = parsed?.general?.firstName;
        if (v && String(v).trim()) return String(v).trim();
      }
    } catch (_) {}

    try {
      const u = window.firebase?.auth?.().currentUser;
      const dn = u?.displayName || '';
      if (dn && dn.trim()) return dn.trim().split(' ')[0] || '';
    } catch (_) {}

    return '';
  }

  function getContactField(contact, key) {
    if (!contact || !key) return '';
    const camel = snakeToCamel(key);
    const map = {
      first_name: contact.first_name || contact.firstName,
      last_name: contact.last_name || contact.lastName,
      full_name: contact.full_name || contact.fullName || ((contact.firstName || contact.first_name || '') + ' ' + (contact.lastName || contact.last_name || '')).trim(),
      title: contact.title || contact.jobTitle,
      email: contact.email,
      phone: contact.workDirectPhone || contact.mobile || contact.otherPhone || contact.phone || contact.phoneNumber,
      company: contact.company || contact.companyName || contact.accountName || contact.organization || contact.organisation || contact.employer
    };
    if (key in map && map[key]) return map[key];
    // fallback try camelCase direct
    return contact[key] || contact[camel] || '';
  }

  // Map account.* tokens from the selected contact's company/account fields
  function getAccountFieldFromContact(contact, key) {
    if (!contact || !key) return '';
    const camel = snakeToCamel(key);
    const accountObj = contact.account || contact.companyObject || {};
    const map = {
      name: contact.company || contact.companyName || contact.accountName || contact.organization || contact.organisation || contact.employer || accountObj.accountName || accountObj.name || accountObj.companyName,
      website: contact.website || contact.companyWebsite || contact.companyDomain || accountObj.website || accountObj.site || accountObj.domain,
      industry: contact.industry || contact.companyIndustry || accountObj.industry,
      size: contact.companySize || contact.size || accountObj.size,
      city: contact.companyCity || contact.city || accountObj.city,
      state: contact.companyState || contact.state || contact.region || accountObj.state || accountObj.region,
      country: contact.companyCountry || contact.country || accountObj.country
    };
    if (key in map && map[key]) return map[key];
    // fallback to nested account object keys or direct keys
    return (accountObj && (accountObj[key] || accountObj[camel])) || contact[key] || contact[camel] || '';
  }

  function substituteContactTokensInText(text, contact) {
    if (!text) return '';
    const s = String(text)
      .replace(/\{\{\s*contact\.([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => {
        const v = getContactField(contact, k);
        return escapeHtml(v || '');
      })
      .replace(/\{\{\s*account\.([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => {
        const v = getAccountFieldFromContact(contact, k);
        return escapeHtml(v || '');
      });
    return s;
  }

  function processBodyHtmlWithContact(bodyHtml, contact) {
    const html = String(bodyHtml || '');
    // Work on a DOM fragment to replace var-chip elements safely
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const chips = tmp.querySelectorAll('.var-chip');
    chips.forEach(chip => {
      // Prefer data attribute for reliable parsing irrespective of chip label
      let scope = '';
      let key = '';
      const dataVar = chip.getAttribute('data-var') || '';
      const dm = dataVar.match(/^([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)$/);
      if (dm) {
        scope = dm[1];
        key = dm[2];
      } else {
        // Fallback to parsing raw token text if present
        const text = (chip.textContent || '').trim();
        const m = text.match(/\{\{\s*([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\s*\}\}/);
        if (!m) return;
        scope = m[1];
        key = m[2];
      }
      let val = '';
      if (scope === 'contact') {
        val = getContactField(contact, key) || '';
      } else if (scope === 'account') {
        val = getAccountFieldFromContact(contact, key) || '';
      } else {
        return; // unknown scope
      }
      const node = document.createTextNode(val);
      chip.parentNode && chip.parentNode.replaceChild(node, chip);
    });
    let out = tmp.innerHTML;
    // Also replace raw tokens in the resulting HTML string
    out = out
      .replace(/\{\{\s*contact\.([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => escapeHtml(getContactField(contact, k) || ''))
      .replace(/\{\{\s*account\.([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => escapeHtml(getAccountFieldFromContact(contact, k) || ''));
    return out;
  }

  // Fetch contacts from Firestore for search/suggestions (used by UI renderers)
  async function fetchContacts(query) {
    if (!window.firebaseDB) return [];
    const q = String(query || '').toLowerCase().trim();
    try {
      const email = window.currentUserEmail || '';
      let snapshot;
      if (window.currentUserRole !== 'admin' && email) {
        // Non-admin: use scoped query
        const [ownedSnap, assignedSnap] = await Promise.all([
          window.firebaseDB.collection('contacts').where('ownerId','==',email).get(),
          window.firebaseDB.collection('contacts').where('assignedTo','==',email).get()
        ]);
        const map = new Map();
        ownedSnap.forEach(d=>map.set(d.id, d));
        assignedSnap.forEach(d=>{ if(!map.has(d.id)) map.set(d.id, d); });
        snapshot = { forEach: (callback) => map.forEach(callback) };
      } else {
        // Admin: use unfiltered query
        snapshot = await window.firebaseDB.collection('contacts').get();
      }
      
      const out = [];
      snapshot.forEach(doc => {
        const person = { id: doc.id, ...doc.data() };
        const nameFields = [person.firstName || '', person.lastName || '', person.fullName || '', person.name || ''];
        const titleFields = [person.title || '', person.jobTitle || ''];
        const companyFields = [
          person.company || '',
          person.companyName || '',
          getAccountFieldFromContact(person, 'name') || ''
        ];
        const extraFields = [person.email || '', person.city || '', person.state || ''];
        const searchableText = [...nameFields, ...titleFields, ...companyFields, ...extraFields].join(' ').toLowerCase();
        let match = false;
        if (!q) match = true; // allow empty to return top suggestions
        else if (searchableText.includes(q)) match = true;
        else if (person.fullName) {
          const parts = String(person.fullName).toLowerCase().split(' ');
          if (parts.some(p => p && q.includes(p))) match = true;
        }
        if (match) {
          const t = person.title || person.jobTitle || '';
          const c = getAccountFieldFromContact(person, 'name') || person.company || person.companyName || '';
          const subtitle = (t && c) ? `${t} at ${c}` : (t || c || '');
          out.push({
            id: person.id,
            title: person.fullName || person.name || `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'Unnamed Contact',
            subtitle,
            data: person
          });
        }
      });
      return out.slice(0, 6);
    } catch (e) {
      console.warn('fetchContacts error', e);
      return [];
    }
  }

  // Formatting helpers for textarea selection
  function getSelection(el) {
    return {
      start: el ? el.selectionStart : 0,
      end: el ? el.selectionEnd : 0,
      value: el ? (el.value || '') : ''
    };
  }

  function setSelectionAndPersist(step, el, newValue, newCursorPos) {
    if (!el) return;
    el.value = newValue;
    el.focus();
    if (typeof newCursorPos === 'number') {
      el.setSelectionRange(newCursorPos, newCursorPos);
    }
    if (!step.data) step.data = {};
    step.data.body = el.value;
  }

  function wrapSelection(step, el, before, after, placeholder = 'text') {
    if (!el) return;
    const { start, end, value } = getSelection(el);
    const hasSel = end > start;
    const selected = hasSel ? value.slice(start, end) : placeholder;
    const insert = before + selected + after;
    const newVal = value.slice(0, start) + insert + value.slice(end);
    const pos = start + insert.length;
    setSelectionAndPersist(step, el, newVal, pos);
  }

  function applyList(step, el, type) {
    if (!el) return;
    const { start, end, value } = getSelection(el);
    const selText = value.slice(start, end);
    const lines = (selText || 'list item').split(/\n/);
    let num = 1;
    const transformed = lines.map(line => {
      const content = line.trim() || 'list item';
      if (type === 'ol') return `${num++}. ${content}`;
      return `- ${content}`; // ul
    }).join('\n');
    const newVal = value.slice(0, start) + transformed + value.slice(end);
    const pos = start + transformed.length;
    setSelectionAndPersist(step, el, newVal, pos);
  }

  // Insert text at the current caret in a textarea/input, replacing any selection
  function insertAtCursor(step, el, text) {
    if (!el) return;
    const { start, end, value } = getSelection(el);
    const newVal = value.slice(0, start) + String(text || '') + value.slice(end);
    const pos = start + String(text || '').length;
    setSelectionAndPersist(step, el, newVal, pos);
  }

  // Rich text helpers for contenteditable editor
  function selectionIsInside(el) {
    if (!el || !window.getSelection) return false;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const node = sel.anchorNode;
    return node ? el.contains(node) : false;
  }

  function getSelectedHtmlWithin(el) {
    if (!el || !window.getSelection) return '';
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !selectionIsInside(el)) return '';
    const range = sel.getRangeAt(0);
    const container = document.createElement('div');
    container.appendChild(range.cloneContents());
    return container.innerHTML;
  }

  function execRich(el, cmd, value) {
    if (!el) return;
    el.focus();
    try { document.execCommand(cmd, false, value); } catch (_) { /* noop */ }
  }

  function insertHtmlRich(el, html) {
    if (!el) return;
    el.focus();
    try { document.execCommand('insertHTML', false, html); } catch (_) { /* noop */ }
  }

  // Consider the editor empty if it has no visible characters
  function editorIsVisuallyEmpty(editor) {
    if (!editor) return false;
    const html = String(editor.innerHTML || '')
      .replace(/<br\s*\/?>(\s*|&nbsp;)*/gi, '')
      .replace(/&nbsp;/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width spaces and BOM
      .trim();
    return html === '';
  }

  // Insert a non-editable variable chip at the current caret in the rich editor
  function insertTokenAsChip(editor, scope, key) {
    if (!editor) return;
    const token = `{{${scope}.${key}}}`;
    const span = document.createElement('span');
    span.className = 'var-chip';
    span.setAttribute('data-var', `${scope}.${key}`);
    span.setAttribute('contenteditable', 'false');
    // Show a friendly label, keep the raw token in a tooltip
    const label = friendlyLabelForVar(scope, key) || token;
    span.textContent = label;
    span.setAttribute('title', token);

    // Ensure selection is inside editor
    editor.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      let range = sel.getRangeAt(0);
      if (!editor.contains(range.startContainer)) {
        // Put caret at end if selection not in editor
        range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      // Insert the chip
      range.deleteContents();
      range.insertNode(span);
      // Move caret after chip
      range.setStartAfter(span);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      // Fallback: append to end
      editor.appendChild(span);
    }
    persistRich({}, editor);
  }

  function persistRich(step, el) {
    if (!step || !el) return;
    if (!step.data) step.data = {};
    step.data.body = el.innerHTML;
  }

  // Selection store to allow toggling formatting without clicking away
  const _selectionStore = new WeakMap();
  // Local typing-state for empty editors (so toggles can flip before typing starts)
  const _typingState = new WeakMap(); // editor => { bold, italic, underline, ol, ul }
  function captureSelection(editor) {
    if (!editor || !window.getSelection) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    if (!editor.contains(sel.anchorNode)) return;
    const rng = sel.getRangeAt(0).cloneRange();
    _selectionStore.set(editor, rng);
  }
  function restoreSelection(editor) {
    if (!editor || !window.getSelection) return;
    let rng = _selectionStore.get(editor);
    const sel = window.getSelection();
    try {
      if (rng && editor.contains(rng.startContainer)) {
        sel.removeAllRanges();
        sel.addRange(rng);
      } else {
        // Ensure a caret inside the editor even if there was no prior selection
        const fallback = document.createRange();
        fallback.selectNodeContents(editor);
        // Place caret at end so toggles apply to future typing
        fallback.collapse(false);
        sel.removeAllRanges();
        sel.addRange(fallback);
        // Store for subsequent toggles
        _selectionStore.set(editor, fallback.cloneRange());
      }
    } catch (_) { /* noop */ }
    editor.focus();
  }

  function updateToggleStates(card, editor) {
    if (!card || !editor) return;
    const isRich = editor.isContentEditable;
    const map = {
      bold: 'bold',
      italic: 'italic',
      underline: 'underline',
      ol: 'insertOrderedList',
      ul: 'insertUnorderedList'
    };
    // Helper: detect if current selection/caret is within a node that applies a highlight background
    function selectionInsideHighlight(ed) {
      try {
        const sel = window.getSelection && window.getSelection();
        if (!sel || sel.rangeCount === 0) return false;
        const range = sel.getRangeAt(0);
        let node = range.startContainer;
        // If selection spans multiple nodes, prefer the common ancestor
        if (range.commonAncestorContainer) node = range.commonAncestorContainer;
        // Walk up to the editor element
        while (node && node !== ed && node.nodeType === 3) node = node.parentNode; // text -> element
        while (node && node !== ed) {
          if (node.nodeType !== 1) { node = node.parentNode; continue; }
          const el = node;
          const tag = (el.tagName || '').toUpperCase();
          if (tag === 'MARK') return true;
          const inlineBg = (el.getAttribute && (el.getAttribute('style') || ''));
          if (inlineBg && /background-color\s*:\s*[^;]+/i.test(inlineBg)) {
            const m = inlineBg.match(/background-color\s*:\s*([^;]+)/i);
            const val = m ? String(m[1]).trim().toLowerCase() : '';
            if (val && val !== 'transparent' && val !== 'rgba(0, 0, 0, 0)') return true;
          }
          node = node.parentNode;
        }
      } catch (_) { /* noop */ }
      return false;
    }
    card.querySelectorAll('.formatting-bar .fmt-btn').forEach(b => {
      const fmt = b.getAttribute('data-fmt');
      if (!isRich) {
        b.removeAttribute('aria-pressed');
        return;
      }
      if (fmt === 'highlight') {
        // Compute active strictly from DOM state within the editor.
        // If the selection/caret is not inside the editor, consider it inactive.
        const inside = selectionIsInside(editor);
        const on = inside && selectionInsideHighlight(editor);
        b.setAttribute('aria-pressed', String(!!on));
        return;
      }
      if (fmt && (fmt in map)) {
        let on = false;
        const sel = (typeof window !== 'undefined' && window.getSelection) ? window.getSelection() : null;
        const collapsed = !!(sel && sel.rangeCount && sel.getRangeAt(0).collapsed);
        const preferLocal = isRich && collapsed && editorIsVisuallyEmpty(editor);
        const local = _typingState.get(editor) || {};
        if (preferLocal && Object.prototype.hasOwnProperty.call(local, fmt)) {
          on = !!local[fmt];
        } else {
          try { on = document.queryCommandState(map[fmt]); } catch (_) { on = false; }
        }
        b.setAttribute('aria-pressed', String(!!on));
      } else {
        b.removeAttribute('aria-pressed');
      }
    });
  }

  function renderFormattingBar() {
    // 10 professional fonts
    const fonts = [
      { v: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', l: 'Inter' },
      { v: 'Arial, Helvetica, sans-serif', l: 'Arial' },
      { v: 'Helvetica, Arial, sans-serif', l: 'Helvetica' },
      { v: 'Georgia, serif', l: 'Georgia' },
      { v: 'Times New Roman, Times, serif', l: 'Times New Roman' },
      { v: 'Garamond, serif', l: 'Garamond' },
      { v: 'Palatino, "Palatino Linotype", serif', l: 'Palatino' },
      { v: 'Tahoma, Geneva, sans-serif', l: 'Tahoma' },
      { v: '"Trebuchet MS", Tahoma, sans-serif', l: 'Trebuchet MS' },
      { v: '"Courier New", Courier, monospace', l: 'Courier New' }
    ];

    const fontItems = fonts.map(f => `
      <button class="popover-item font-item" data-font="${escapeHtml(f.v)}" style="font-family:${escapeHtml(f.v)}">${escapeHtml(f.l)}</button>
    `).join('');

    const sizes = [10, 12, 14, 16, 18, 20, 24, 28, 32];
    const sizeItems = sizes.map(s => `
      <button class="popover-item size-item" data-size="${s}" style="font-size:${s}px">${s}</button>
    `).join('');

    return `
      <div class="formatting-bar" aria-hidden="true">
        <div class="fmt-group">
          <button class="fmt-btn" type="button" data-fmt="font" aria-haspopup="true" aria-expanded="false" aria-label="Font">
            <span class="fmt-label" data-current-font>Sans Serif</span>
          </button>
          <div class="format-popover font-popover" role="menu">
            ${fontItems}
          </div>
        </div>
        <div class="fmt-group">
          <button class="fmt-btn" type="button" data-fmt="size" aria-haspopup="true" aria-expanded="false" aria-label="Size">
            <span class="fmt-label" data-current-size>12</span>
          </button>
          <div class="format-popover size-popover" role="menu">
            ${sizeItems}
          </div>
        </div>
        <button class="fmt-btn" type="button" data-fmt="bold" aria-label="Bold"><span class="fmt-glyph">B</span></button>
        <button class="fmt-btn" type="button" data-fmt="italic" aria-label="Italic"><span class="fmt-glyph" style="font-style:italic;">I</span></button>
        <button class="fmt-btn" type="button" data-fmt="underline" aria-label="Underline"><span class="fmt-glyph" style="text-decoration:underline;">U</span></button>
        <div class="fmt-group">
          <button class="fmt-btn" type="button" data-fmt="highlight" aria-haspopup="true" aria-expanded="false" aria-label="Highlight"><span class="fmt-glyph">A</span></button>
          <div class="format-popover highlight-popover" role="menu">
            <div class="swatches">
              <button class="swatch" data-color="none" aria-label="No highlight"></button>
              <button class="swatch" data-color="yellow" style="--sw: #ffd54f" aria-label="Yellow"></button>
              <button class="swatch" data-color="red" style="--sw: #ff6b6b" aria-label="Red"></button>
              <button class="swatch" data-color="green" style="--sw: #51cf66" aria-label="Green"></button>
            </div>
          </div>
        </div>
        <button class="fmt-btn" type="button" data-fmt="ol" aria-label="Numbered list">
        <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
          <line class="ql-stroke" x1="7" x2="15" y1="4" y2="4"></line>
          <line class="ql-stroke" x1="7" x2="15" y1="9" y2="9"></line>
          <line class="ql-stroke" x1="7" x2="15" y1="14" y2="14"></line>
          <line class="ql-stroke ql-thin" x1="2.5" x2="4.5" y1="5.5" y2="5.5"></line>
          <path class="ql-fill" d="M3.5,6A0.5,0.5,0,0,1,3,5.5V3.085l-0.276.138A0.5,0.5,0,0,1,2.053,3c-0.124-.247-0.023-0.324.224-0.447l1-.5A0.5,0.5,0,0,1,4,2.5v3A0.5,0.5,0,0,1,3.5,6Z"></path>
          <path class="ql-stroke ql-thin" d="M4.5,10.5h-2c0-.234,1.85-1.076,1.85-2.234A0.959,0.959,0,0,0,2.5,8.156"></path>
          <path class="ql-stroke ql-thin" d="M2.5,14.846a0.959,0.959,0,0,0,1.85-.109A0.7,0.7,0,0,0,3.75,14a0.688,0.688,0,0,0,.6-0.736,0.959,0.959,0,0,0-1.85-.109"></path>
        </svg>
      </button>
        <button class="fmt-btn" type="button" data-fmt="ul" aria-label="Bullet list">
        <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
          <line class="ql-stroke" x1="6" x2="15" y1="4" y2="4"></line>
          <line class="ql-stroke" x1="6" x2="15" y1="9" y2="9"></line>
          <line class="ql-stroke" x1="6" x2="15" y1="14" y2="14"></line>
          <line class="ql-stroke" x1="3" x2="3" y1="4" y2="4"></line>
          <line class="ql-stroke" x1="3" x2="3" y1="9" y2="9"></line>
          <line class="ql-stroke" x1="3" x2="3" y1="14" y2="14"></line>
        </svg>
      </button>
      </div>
      <div class="ai-bar" aria-hidden="true">
        <div class="ai-inner">
          <div class="ai-row">
            <textarea class="ai-prompt input-dark" rows="3" 
                      placeholder="Describe the email you want... (tone, goal, offer, CTA)"></textarea>
          </div>
          <div class="ai-row suggestions" role="list">
            <button class="ai-suggestion" type="button" data-prompt="Write an immediate follow-up email after our phone conversation">Immediate follow-up</button>
            <button class="ai-suggestion" type="button" data-prompt="Write a same-day check-in email to maintain momentum">Same day check-in</button>
            <button class="ai-suggestion" type="button" data-prompt="Write a weekly touchpoint email to stay top of mind">Weekly touchpoint</button>
            <button class="ai-suggestion" type="button" data-prompt="Write an introduction email as the first touchpoint in our sequence">First email introduction</button>
            <button class="ai-suggestion" type="button" data-prompt="Write a nurture email that provides value and builds relationship">Middle sequence nurture</button>
            <button class="ai-suggestion" type="button" data-prompt="Write a final email with a clear call-to-action and next steps">Final sequence ask</button>
          </div>
          <div class="ai-row actions">
            <button class="fmt-btn ai-generate" data-mode="standard">Generate Standard</button>
            <button class="fmt-btn ai-generate" data-mode="html">Generate HTML</button>
            <div class="ai-status" aria-live="polite"></div>
          </div>
        </div>
      </div>`;
  }

  function svgEmail() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>';
  }
  function svgEmailSmall() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>';
  }
  function svgEdit() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
  }
  function svgTrash() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>';
  }
  function svgSettings() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  }
  function svgClock() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path></svg>';
  }
  function svgPlus() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  }
  function svgPhone() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.09 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>';
  }
  function svgPhoneSmall() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.09 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>';
  }
  function svgLinkedIn() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM0 8h5v16H0V8zm7.5 0H12v2.2h.06c.62-1.18 2.14-2.42 4.4-2.42 4.7 0 5.56 3.1 5.56 7.1V24h-5V16.5c0-1.78-.03-4.07-2.48-4.07-2.48 0-2.86 1.94-2.86 3.95V24h-5V8z"/></svg>';
  }
  function svgLinkedInSmall() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM0 8h5v16H0V8zm7.5 0H12v2.2h.06c.62-1.18 2.14-2.42 4.4-2.42 4.7 0 5.56 3.1 5.56 7.1V24h-5V16.5c0-1.78-.03-4.07-2.48-4.07-2.48 0-2.86 1.94-2.86 3.95V24h-5V8z"/></svg>';
  }
  function svgTask() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';
  }
  function svgChevronDown() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
  }
  function svgChevronRight() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';
  }

  // Toolbar icons
  function svgBadgeAI() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M10 16l2-8 2 8M9 12h6"/></svg>';
  }
  function svgTextAI() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><text x="12" y="12" dy="-0.12em" text-anchor="middle" dominant-baseline="central" fill="currentColor" font-size="18" font-weight="800" letter-spacing="0.05em" font-family="Inter, system-ui, -apple-system, \\"Segoe UI\\", Roboto, Helvetica, Arial, sans-serif">AI</text></svg>';
  }
  function svgTextTitleIcon() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">\
      <text x="12" y="12" dy="-0.12em" text-anchor="middle" dominant-baseline="central" fill="currentColor" font-size="20" font-weight="800" letter-spacing="0" font-family="Inter, system-ui, -apple-system, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif">T</text>\
    </svg>';
  }
  function svgTextT() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M6 7v10"/><path d="M18 7v10"/><path d="M9 7h6"/></svg>';
  }
  function svgChain() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 1 0-7l1.5-1.5a5 5 0 0 1 7 7L17 12"/><path d="M14 11a5 5 0 0 1 0 7L12.5 19.5a5 5 0 0 1-7-7L7 12"/></svg>';
  }
  function svgImageIcon() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10.5" r="1.5"/><path d="M21 17l-5.5-5.5L9 18"/></svg>';
  }
  function svgPaperclip() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05l-8.49 8.49a5 5 0 0 1-7.07-7.07l8.49-8.49a3.5 3.5 0 1 1 4.95 4.95L10.34 17.4a2 2 0 1 1-2.83-2.83l8.49-8.49"/></svg>';
  }
  function svgCodeBrackets() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="7 8 3 12 7 16"/><polyline points="17 8 21 12 17 16"/><path d="M14 4l-4 16"/></svg>';
  }
  function svgDoc() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8M8 9h2"/></svg>';
  }
  function svgBraces() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3a3 3 0 0 0-3 3v2a3 3 0 0 1-3 3 3 3 0 0 1 3 3v2a3 3 0 0 0 3 3"/><path d="M16 3a3 3 0 0 1 3 3v2a3 3 0 0 0 3 3 3 3 0 0 0-3 3v2a3 3 0 0 1-3 3"/></svg>';
  }

  // Delay popover state
  let _openDelayPopover = null; // { el, cleanup }
  function closeDelayPopover() {
    if (_openDelayPopover) {
      try { _openDelayPopover.cleanup && _openDelayPopover.cleanup(); } catch (_) {}
      _openDelayPopover = null;
    }
  }

  function closeEmailSettings() {
    // Find any step that's showing settings and close it
    if (state.currentSequence?.steps) {
      state.currentSequence.steps.forEach(step => {
        if (step.showSettings) {
          step.showSettings = false;
        }
      });
      render();
    }
  }

  function getDefaultEmailSettings(isAuto) {
    return {
      content: {
        includeSignature: true,
        signatureImage: true,
        customSignature: '',
        aiGeneration: isAuto,
        personalizationLevel: 'advanced'
      },
      deliverability: {
        priorityHeaders: false,
        listUnsubscribe: true,
        bulkHeaders: false,
        openTracking: true,
        clickTracking: true
      },
      automation: {
        sendTimeOptimization: isAuto,
        timezoneAware: isAuto,
        weekendSending: 'business-days',
        autoPauseOnReply: true,
        maxFollowups: 5
      },
      compliance: {
        unsubscribeLink: true,
        physicalAddress: true,
        gdprCompliant: true,
        spamScoreCheck: true
      }
    };
  }

  function createEmailSettingsHTML(settings, step) {
    const isAuto = step.type === 'auto-email';
    
    // Inject CSS for email settings if not already injected
    if (!document.querySelector('#email-settings-styles')) {
      const style = document.createElement('style');
      style.id = 'email-settings-styles';
      style.textContent = `
        .email-settings-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 24px;
          margin-bottom: 24px;
        }
        
        .email-settings-section {
          background: var(--bg-secondary);
          border: 1px solid var(--border-light);
          border-radius: 8px;
          padding: 20px;
        }
        
        .email-settings-section h4 {
          margin: 0 0 16px 0;
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-light);
        }
        
        .email-settings .checkbox-group {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        .email-settings .setting-item {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        
        .email-settings .checkbox-label {
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .email-settings .checkbox-label:hover .label-text {
          color: var(--orange-primary);
        }
        
        .email-settings .checkbox-label input[type="checkbox"] {
          display: none;
        }
        
        .email-settings .checkmark {
          position: relative;
          display: inline-block;
          width: 20px;
          height: 20px;
          background: var(--grey-700);
          border: 2px solid var(--grey-700);
          border-radius: 4px;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }
        
        .email-settings .checkbox-label input[type="checkbox"]:checked + .checkmark {
          background: var(--orange-primary);
          border-color: var(--orange-primary);
        }
        
        .email-settings .checkbox-label input[type="checkbox"]:checked + .checkmark::after {
          content: '';
          position: absolute;
          left: 6px;
          top: 2px;
          width: 5px;
          height: 10px;
          border: solid white;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }
        
        .email-settings .label-text {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
          transition: color 0.2s ease;
        }
        
        .email-settings .setting-description {
          font-size: 12px;
          color: var(--text-secondary);
          line-height: 1.4;
          margin-left: 32px;
        }
        
        .ai-suggestions-container {
          margin-top: 16px;
        }
        
        .ai-suggestions-header {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 8px;
        }
        
        .ai-suggestions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        
        .ai-suggestion {
          background: var(--grey-700);
          border: 1px solid var(--grey-600);
          color: var(--text-primary);
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .ai-suggestion:hover {
          background: var(--orange-primary);
          border-color: var(--orange-primary);
          color: white;
        }
        
        .email-settings .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .email-settings .form-group label {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
        }
        
        .email-settings .form-group select,
        .email-settings .form-group input {
          padding: 8px 12px;
          border: 1px solid var(--border-light);
          border-radius: 6px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 14px;
          transition: all 0.2s ease;
        }
        
        .email-settings .form-group select:focus,
        .email-settings .form-group input:focus {
          outline: none;
          border-color: var(--orange-primary);
          box-shadow: 0 0 0 2px rgba(255, 107, 53, 0.2);
        }
        
        .email-settings .btn-secondary,
        .email-settings .btn-primary {
          padding: 10px 20px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
        }
        
        .email-settings .btn-secondary {
          background: var(--bg-secondary);
          color: var(--text-primary);
          border: 1px solid var(--border-light);
        }
        
        .email-settings .btn-secondary:hover {
          background: var(--bg-primary);
          border-color: var(--text-primary);
        }
        
        .email-settings .btn-primary {
          background: var(--orange-primary);
          color: white;
        }
        
        .email-settings .btn-primary:hover {
          background: #e55a2b;
          transform: translateY(-1px);
        }
        
        @media (max-width: 768px) {
          .email-settings-grid {
            grid-template-columns: 1fr;
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    return `
      <div class="step-tabs" role="tablist">
        <button class="tab active" role="tab" data-tab="settings">Settings</button>
        <div class="spacer"></div>
      </div>
      <div class="tab-panels">
        <div class="tab-panel email-settings" data-tab="settings">
          <div class="form-row">
            <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: var(--text-primary);">Email Settings</h3>
            <p style="margin: 0 0 24px 0; font-size: 14px; color: var(--text-secondary);">Configure deliverability and automation options for this email</p>
          </div>
          
          <div class="email-settings-grid">
            <!-- Content Settings -->
            <div class="email-settings-section">
              <h4>Content & Personalization</h4>
              <div class="checkbox-group">
                <div class="setting-item">
                  <label class="checkbox-label">
                    <input type="checkbox" ${settings.content.includeSignature ? 'checked' : ''} data-setting="content.includeSignature">
                    <span class="checkmark"></span>
                    <span class="label-text">Include Signature</span>
                  </label>
                  <div class="setting-description">Add your email signature at the bottom of every email</div>
                </div>
                <div class="setting-item">
                  <label class="checkbox-label">
                    <input type="checkbox" ${settings.content.signatureImage ? 'checked' : ''} data-setting="content.signatureImage">
                    <span class="checkmark"></span>
                    <span class="label-text">Include Signature Image</span>
                  </label>
                  <div class="setting-description">Show your signature image/logo in the email</div>
                </div>
                <div class="setting-item">
                  <label class="checkbox-label">
                    <input type="checkbox" ${settings.content.aiGeneration ? 'checked' : ''} data-setting="content.aiGeneration">
                    <span class="checkmark"></span>
                    <span class="label-text">Use AI Generation</span>
                  </label>
                  <div class="setting-description">Let AI help write and personalize your email content</div>
                </div>
                <div class="form-group">
                  <label>Personalization Level</label>
                  <select data-setting="content.personalizationLevel">
                    <option value="basic" ${settings.content.personalizationLevel === 'basic' ? 'selected' : ''}>Basic (name only)</option>
                    <option value="advanced" ${settings.content.personalizationLevel === 'advanced' ? 'selected' : ''}>Advanced (name + company)</option>
                    <option value="maximum" ${settings.content.personalizationLevel === 'maximum' ? 'selected' : ''}>Maximum (all data)</option>
                  </select>
                  <div class="setting-description" style="margin-left: 0;">Control how much contact data is used for personalization</div>
                </div>
              </div>
            </div>

            <!-- Deliverability Settings -->
            <div class="email-settings-section">
              <h4>Deliverability & Tracking</h4>
              <div class="checkbox-group">
                <div class="setting-item">
                  <label class="checkbox-label">
                    <input type="checkbox" ${settings.deliverability.priorityHeaders ? 'checked' : ''} data-setting="deliverability.priorityHeaders">
                    <span class="checkmark"></span>
                    <span class="label-text">Priority Headers</span>
                  </label>
                  <div class="setting-description">Mark email as important in recipient's inbox</div>
                </div>
                <div class="setting-item">
                  <label class="checkbox-label">
                    <input type="checkbox" ${settings.deliverability.listUnsubscribe ? 'checked' : ''} data-setting="deliverability.listUnsubscribe">
                    <span class="checkmark"></span>
                    <span class="label-text">List Unsubscribe Headers</span>
                  </label>
                  <div class="setting-description">Add one-click unsubscribe option for better deliverability</div>
                </div>
                <div class="setting-item">
                  <label class="checkbox-label">
                    <input type="checkbox" ${settings.deliverability.bulkHeaders ? 'checked' : ''} data-setting="deliverability.bulkHeaders">
                    <span class="checkmark"></span>
                    <span class="label-text">Bulk Email Headers</span>
                  </label>
                  <div class="setting-description">Mark as bulk email (can reduce spam score for mass sends)</div>
                </div>
                <div class="setting-item">
                  <label class="checkbox-label">
                    <input type="checkbox" ${settings.deliverability.openTracking ? 'checked' : ''} data-setting="deliverability.openTracking">
                    <span class="checkmark"></span>
                    <span class="label-text">Open Tracking</span>
                  </label>
                  <div class="setting-description">Track when recipients open your email</div>
                </div>
                <div class="setting-item">
                  <label class="checkbox-label">
                    <input type="checkbox" ${settings.deliverability.clickTracking ? 'checked' : ''} data-setting="deliverability.clickTracking">
                    <span class="checkmark"></span>
                    <span class="label-text">Click Tracking</span>
                  </label>
                  <div class="setting-description">Track when recipients click links in your email</div>
                </div>
              </div>
            </div>

          ${isAuto ? `
            <!-- Automation Settings -->
            <div class="email-settings-section">
              <h4>Automation & Timing</h4>
              <div class="checkbox-group">
                <div class="setting-item">
                  <label class="checkbox-label">
                    <input type="checkbox" ${settings.automation.sendTimeOptimization ? 'checked' : ''} data-setting="automation.sendTimeOptimization">
                    <span class="checkmark"></span>
                    <span class="label-text">Send Time Optimization</span>
                  </label>
                  <div class="setting-description">Automatically send at the best time for engagement</div>
                </div>
                <div class="setting-item">
                  <label class="checkbox-label">
                    <input type="checkbox" ${settings.automation.timezoneAware ? 'checked' : ''} data-setting="automation.timezoneAware">
                    <span class="checkmark"></span>
                    <span class="label-text">Timezone Awareness</span>
                  </label>
                  <div class="setting-description">Send emails based on recipient's local timezone</div>
                </div>
                <div class="setting-item">
                  <label class="checkbox-label">
                    <input type="checkbox" ${settings.automation.autoPauseOnReply ? 'checked' : ''} data-setting="automation.autoPauseOnReply">
                    <span class="checkmark"></span>
                    <span class="label-text">Auto-pause on Reply</span>
                  </label>
                  <div class="setting-description">Stop sequence when contact replies to any email</div>
                </div>
                <div class="form-group">
                  <label>Weekend Sending</label>
                  <select data-setting="automation.weekendSending">
                    <option value="never" ${settings.automation.weekendSending === 'never' ? 'selected' : ''}>Never send on weekends</option>
                    <option value="business-days" ${settings.automation.weekendSending === 'business-days' ? 'selected' : ''}>Business days only</option>
                    <option value="always" ${settings.automation.weekendSending === 'always' ? 'selected' : ''}>Send on weekends</option>
                  </select>
                  <div class="setting-description" style="margin-left: 0;">Choose when emails can be sent during the week</div>
                </div>
                <div class="form-group">
                  <label>Max Follow-ups</label>
                  <input type="number" min="1" max="20" value="${settings.automation.maxFollowups}" data-setting="automation.maxFollowups">
                  <div class="setting-description" style="margin-left: 0;">Maximum number of follow-up emails to send</div>
                </div>
              </div>
            </div>
          ` : ''}

            <!-- Compliance Settings -->
            <div class="email-settings-section">
              <h4>Compliance & Safety</h4>
              <div class="checkbox-group">
                <div class="setting-item">
                  <label class="checkbox-label">
                    <input type="checkbox" ${settings.compliance.unsubscribeLink ? 'checked' : ''} data-setting="compliance.unsubscribeLink">
                    <span class="checkmark"></span>
                    <span class="label-text">Include Unsubscribe Link</span>
                  </label>
                  <div class="setting-description">Add unsubscribe link to footer (required for compliance)</div>
                </div>
                <div class="setting-item">
                  <label class="checkbox-label">
                    <input type="checkbox" ${settings.compliance.physicalAddress ? 'checked' : ''} data-setting="compliance.physicalAddress">
                    <span class="checkmark"></span>
                    <span class="label-text">Include Physical Address</span>
                  </label>
                  <div class="setting-description">Add your business address to email footer (CAN-SPAM requirement)</div>
                </div>
                <div class="setting-item">
                  <label class="checkbox-label">
                    <input type="checkbox" ${settings.compliance.gdprCompliant ? 'checked' : ''} data-setting="compliance.gdprCompliant">
                    <span class="checkmark"></span>
                    <span class="label-text">GDPR Compliance</span>
                  </label>
                  <div class="setting-description">Follow GDPR regulations for EU contacts</div>
                </div>
                <div class="setting-item">
                  <label class="checkbox-label">
                    <input type="checkbox" ${settings.compliance.spamScoreCheck ? 'checked' : ''} data-setting="compliance.spamScoreCheck">
                    <span class="checkmark"></span>
                    <span class="label-text">Spam Score Check</span>
                  </label>
                  <div class="setting-description">Analyze email content for spam triggers before sending</div>
                </div>
              </div>
            </div>
          </div>

          <div class="form-row" style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border-light); display: flex; justify-content: flex-end; gap: 12px;">
            <button class="btn-secondary" onclick="closeEmailSettings()">Cancel</button>
            <button class="btn-primary" onclick="saveEmailSettings('${step.id}')">Save Settings</button>
          </div>
        </div>
      </div>
    `;
  }

  function saveEmailSettings(stepId) {
    // Find the step's settings panel
    const stepCard = document.querySelector(`[data-id="${stepId}"]`);
    if (!stepCard) return;

    // Collect all settings from the form
    const settings = {
      content: {
        includeSignature: stepCard.querySelector('[data-setting="content.includeSignature"]')?.checked || false,
        signatureImage: stepCard.querySelector('[data-setting="content.signatureImage"]')?.checked || false,
        customSignature: '',
        aiGeneration: stepCard.querySelector('[data-setting="content.aiGeneration"]')?.checked || false,
        personalizationLevel: stepCard.querySelector('[data-setting="content.personalizationLevel"]')?.value || 'advanced'
      },
      deliverability: {
        priorityHeaders: stepCard.querySelector('[data-setting="deliverability.priorityHeaders"]')?.checked || false,
        listUnsubscribe: stepCard.querySelector('[data-setting="deliverability.listUnsubscribe"]')?.checked || false,
        bulkHeaders: stepCard.querySelector('[data-setting="deliverability.bulkHeaders"]')?.checked || false,
        openTracking: stepCard.querySelector('[data-setting="deliverability.openTracking"]')?.checked || false,
        clickTracking: stepCard.querySelector('[data-setting="deliverability.clickTracking"]')?.checked || false
      },
      automation: {
        sendTimeOptimization: stepCard.querySelector('[data-setting="automation.sendTimeOptimization"]')?.checked || false,
        timezoneAware: stepCard.querySelector('[data-setting="automation.timezoneAware"]')?.checked || false,
        weekendSending: stepCard.querySelector('[data-setting="automation.weekendSending"]')?.value || 'business-days',
        autoPauseOnReply: stepCard.querySelector('[data-setting="automation.autoPauseOnReply"]')?.checked || false,
        maxFollowups: parseInt(stepCard.querySelector('[data-setting="automation.maxFollowups"]')?.value || '5')
      },
      compliance: {
        unsubscribeLink: stepCard.querySelector('[data-setting="compliance.unsubscribeLink"]')?.checked || false,
        physicalAddress: stepCard.querySelector('[data-setting="compliance.physicalAddress"]')?.checked || false,
        gdprCompliant: stepCard.querySelector('[data-setting="compliance.gdprCompliant"]')?.checked || false,
        spamScoreCheck: stepCard.querySelector('[data-setting="compliance.spamScoreCheck"]')?.checked || false
      },
      aiPrompt: stepCard.querySelector('[data-setting="aiPrompt"]')?.value || ''
    };

    // Find the step and update its settings
    const step = window.sequenceBuilder?.currentSequence?.steps?.find(s => s.id === stepId);
    if (step) {
      step.emailSettings = settings;
      try {
        scheduleStepSave(stepId);
        console.log('[EmailSettings] Settings saved for step:', stepId, settings);
      } catch (error) {
        console.error('[EmailSettings] Error saving settings:', error);
      }
    }

    closeEmailSettings();
  }

  // Make functions globally available
  window.openEmailSettings = openEmailSettings;
  window.closeEmailSettings = closeEmailSettings;
  window.saveEmailSettings = saveEmailSettings;

  // Delete confirmation popover state (anchored under trash icon)
  let _openDeletePopover = null; // { el, cleanup }
  function closeDeletePopover() {
    if (_openDeletePopover) {
      try { _openDeletePopover.cleanup && _openDeletePopover.cleanup(); } catch (_) {}
      _openDeletePopover = null;
    }
  }

  // Add-contact confirmation popover state
  let _openAddContactPopover = null; // { el, cleanup }
  function closeAddContactPopover() {
    if (_openAddContactPopover) {
      try { _openAddContactPopover.cleanup && _openAddContactPopover.cleanup(); } catch (_) {}
      _openAddContactPopover = null;
    }
  }

  // Add-contact confirmation popover (anchored near selected contact)
  function openAddContactPopover(anchorEl, contact) {
    if (!anchorEl || !contact) return;
    closeAddContactPopover();
    const pop = document.createElement('div');
    // Reuse delete-popover styling for consistent look/feel
    pop.className = 'delete-popover add-contact-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', 'true');
    const titleId = `add-contact-pop-title-${escapeHtml(contact.id)}`;
    pop.setAttribute('aria-labelledby', titleId);
    pop.innerHTML = `
      <div class="delete-popover-inner">
        <div class="delete-title" id="${titleId}">Add ${escapeHtml(contact.name)} to this sequence?</div>
        <div class="btn-row">
          <button type="button" class="btn-cancel">Cancel</button>
          <button type="button" class="btn-primary btn-confirm">Add Contact</button>
        </div>
      </div>`;
    document.body.appendChild(pop);

    const position = () => {
      // Anchor to contact name/button if present
      const refEl = anchorEl;
      const r = refEl.getBoundingClientRect();
      pop.style.visibility = 'hidden';
      pop.style.position = 'fixed';
      pop.style.left = '0px';
      pop.style.top = '0px';
      const pw = pop.offsetWidth;
      const ph = pop.offsetHeight;
      // Prefer to place to the right of the anchor, vertically centered
      let left = r.right + 8;
      let top = Math.round(r.top + (r.height / 2) - (ph / 2));
      let placement = 'right';
      // If overflowing right edge, try placing to the left
      if (left + pw + 8 > window.innerWidth) {
        left = Math.max(8, r.left - pw - 8);
        placement = 'left';
      }
      // Clamp vertical position into viewport
      top = Math.max(8, Math.min(top, window.innerHeight - ph - 8));
      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
      pop.setAttribute('data-placement', placement);
      // Align arrow vertically to the anchor's center
      const anchorCenterY = r.top + (r.height / 2);
      const arrowTop = Math.max(12, Math.min(ph - 12, anchorCenterY - top));
      pop.style.setProperty('--arrow-top', `${arrowTop}px`);
      pop.style.visibility = 'visible';
    };

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeAddContactPopover(); return; }
      if (e.key === 'Tab') {
        const fs = Array.from(pop.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])')).filter(el => !el.disabled && el.offsetParent !== null);
        if (!fs.length) return;
        const first = fs[0], last = fs[fs.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    };
    const onDocPointer = (e) => { if (pop.contains(e.target) || anchorEl.contains(e.target)) return; closeAddContactPopover(); };
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDocPointer, true);

    const cancelBtn = pop.querySelector('.btn-cancel');
    const confirmBtn = pop.querySelector('.btn-confirm');
    cancelBtn?.addEventListener('click', () => closeAddContactPopover());
    confirmBtn?.addEventListener('click', async () => {
      try { await addContactToSequence(contact); } catch (_) {}
      closeAddContactPopover();
    });

    position();
    setTimeout(() => { (confirmBtn || cancelBtn)?.focus(); }, 0);

    _openAddContactPopover = {
      el: pop,
      cleanup: () => {
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('mousedown', onDocPointer, true);
        window.removeEventListener('resize', position);
        window.removeEventListener('scroll', position, true);
        try {
          pop.classList.add('closing');
          const removeNow = () => { try { pop.remove(); } catch (_) {} };
          pop.addEventListener('animationend', removeNow, { once: true });
          setTimeout(removeNow, 180);
        } catch (_) {
          try { pop.remove(); } catch (_) {}
        }
        try { anchorEl.blur && anchorEl.blur(); } catch (_) {}
      }
    };
  }

  function openDeletePopover(anchorEl, step) {
    if (!anchorEl || !step) return;
    closeDeletePopover();
    const pop = document.createElement('div');
    pop.className = 'delete-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', 'true');
    const titleId = `delete-pop-title-${escapeHtml(step.id)}`;
    pop.setAttribute('aria-labelledby', titleId);
    pop.innerHTML = `
      <div class="delete-popover-inner">
        <div class="delete-title" id="${titleId}">Delete step?</div>
        <div class="btn-row">
          <button type="button" class="btn-cancel">Cancel</button>
          <button type="button" class="btn-danger btn-confirm">Delete</button>
        </div>
      </div>`;
    document.body.appendChild(pop);

    // Position under the anchor with viewport clamping and arrow alignment
    const position = () => {
      const iconCandidate = anchorEl.querySelector?.('.icon-btn-sm, .icon, svg, i');
      const refEl = (iconCandidate && typeof iconCandidate.getBoundingClientRect === 'function') ? iconCandidate : anchorEl;
      const r = refEl.getBoundingClientRect();
      pop.style.visibility = 'hidden';
      pop.style.position = 'fixed';
      pop.style.left = '0px';
      pop.style.top = '0px';
      // measure
      const pw = pop.offsetWidth;
      const ph = pop.offsetHeight;
      let left = Math.round(r.left + (r.width / 2) - (pw / 2));
      left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
      let top = r.bottom + 8;
      let placement = 'bottom';
      if (top + ph + 8 > window.innerHeight) {
        top = Math.max(8, r.top - ph - 8);
        placement = 'top';
      }
      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
      pop.setAttribute('data-placement', placement);
      const anchorCenterX = r.left + (r.width / 2);
      const arrowLeft = Math.max(12, Math.min(pw - 12, anchorCenterX - left));
      pop.style.setProperty('--arrow-left', `${arrowLeft}px`);
      pop.style.visibility = 'visible';
    };

    // Events
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeDeletePopover(); return; }
      if (e.key === 'Tab') {
        const fs = Array.from(pop.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])')).filter(el => !el.disabled && el.offsetParent !== null);
        if (!fs.length) return;
        const first = fs[0], last = fs[fs.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    };
    const onDocPointer = (e) => { if (pop.contains(e.target) || anchorEl.contains(e.target)) return; closeDeletePopover(); };
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDocPointer, true);

    // Wire buttons
    const cancelBtn = pop.querySelector('.btn-cancel');
    const confirmBtn = pop.querySelector('.btn-confirm');
    cancelBtn?.addEventListener('click', () => closeDeletePopover());
    confirmBtn?.addEventListener('click', () => {
      // Perform deletion and persist
      try {
        const id = step.id;
        state.currentSequence.steps = state.currentSequence.steps.filter(s => s.id !== id);
        try { _debouncedSaves.delete(id); } catch (_) { /* noop */ }
        try { saveStepToFirestore(id); } catch (_) { /* noop */ }
        if (window.crm && typeof window.crm.showToast === 'function') window.crm.showToast('Step deleted');
      } catch (_) { /* noop */ }
      closeDeletePopover();
      render();
    });

    // Show and focus
    position();
    setTimeout(() => { (confirmBtn || cancelBtn)?.focus(); }, 0);

    _openDeletePopover = {
      el: pop,
      cleanup: () => {
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('mousedown', onDocPointer, true);
        window.removeEventListener('resize', position);
        window.removeEventListener('scroll', position, true);
        try {
          pop.classList.add('closing');
          const removeNow = () => { try { pop.remove(); } catch (_) {} };
          pop.addEventListener('animationend', removeNow, { once: true });
          setTimeout(removeNow, 180);
        } catch (_) {
          try { pop.remove(); } catch (_) {}
        }
        // Blur the trigger so any hover/focus-reveal actions hide after cancel
        try { anchorEl.blur && anchorEl.blur(); } catch (_) {}
      }
    };
  }
  
  function openEmailSettings(anchorEl, step) {
    if (!anchorEl || !step) return;
    
    // Close any other open settings first
    closeEmailSettings();
    
    // Set the step to show settings instead of editor
    step.showSettings = true;
    step.collapsed = false; // Expand to show settings
    render();
    
    // Wire up AI suggestion events after render
    setTimeout(() => {
      const stepCard = document.querySelector(`[data-step-id="${step.id}"]`);
      if (stepCard) {
        const aiSuggestions = stepCard.querySelectorAll('.ai-suggestion');
        aiSuggestions.forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            const prompt = btn.getAttribute('data-prompt');
            const textarea = stepCard.querySelector('[data-setting="aiPrompt"]');
            if (textarea && prompt) {
              textarea.value = prompt;
              textarea.focus();
            }
          });
        });
      }
    }, 100);
  }

  function openDelayPopover(anchorEl, step) {
    if (!anchorEl || !step) return;
    closeDelayPopover();
    const existingMinutes = Math.max(0, Math.min(10080, parseInt(step.delayMinutes || 0, 10) || 0));
    const chooseUnit = (mins) => {
      if (mins === 0) return { amount: 0, unit: 'minutes' };
      if (mins % 1440 === 0) return { amount: Math.floor(mins / 1440), unit: 'days' };
      if (mins % 60 === 0) return { amount: Math.floor(mins / 60), unit: 'hours' };
      return { amount: mins, unit: 'minutes' };
    };
    const init = chooseUnit(existingMinutes);
    const pop = document.createElement('div');
    pop.className = 'delay-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', 'true');
    pop.setAttribute('aria-label', 'Edit step delay');
    const popId = `delay-popover-${String(step.id || 'x')}`;
    pop.id = popId;
    pop.innerHTML = `
      <div class="delay-popover-inner">
        <div class="delay-header">Step delay</div>
        <div class="delay-options" role="group" aria-label="Delay options">
          <label class="radio-row">
            <input type="radio" name="delay-mode" value="immediate" ${existingMinutes === 0 ? 'checked' : ''}>
            <span>Start immediately</span>
          </label>
          <label class="radio-row">
            <input type="radio" name="delay-mode" value="delay" ${existingMinutes > 0 ? 'checked' : ''}>
            <span>Delay for</span>
          </label>
          <div class="number-unit">
            <input type="number" class="input-dark" min="0" max="10080" step="1" value="${init.amount}" aria-label="Delay amount">
            <select class="unit-select" aria-label="Delay unit">
              <option value="minutes" ${init.unit === 'minutes' ? 'selected' : ''}>minutes</option>
              <option value="hours" ${init.unit === 'hours' ? 'selected' : ''}>hours</option>
              <option value="days" ${init.unit === 'days' ? 'selected' : ''}>days</option>
            </select>
          </div>
        </div>
        <div class="btn-row">
          <button type="button" class="btn-cancel">Cancel</button>
          <button type="button" class="btn-apply">Apply</button>
        </div>
      </div>
    `;
    document.body.appendChild(pop);
    
    // Position under anchor, centered horizontally, with viewport clamping and caret alignment
    const position = () => {
      const iconCandidate = anchorEl.querySelector('.icon-btn-sm, .icon, svg, i');
      const refEl = (iconCandidate && typeof iconCandidate.getBoundingClientRect === 'function') ? iconCandidate : anchorEl;
      const r = refEl.getBoundingClientRect();
      pop.style.visibility = 'hidden';
      pop.style.position = 'fixed';
      pop.style.left = '0px';
      pop.style.top = '0px';
      // measure
      const pw = pop.offsetWidth;
      const ph = pop.offsetHeight;
      // Center under the anchor (pen icon/button)
      let preferredLeft = r.left + (r.width - pw) / 2;
      // Clamp to viewport with 8px gutters
      let left = Math.max(8, Math.min(preferredLeft, window.innerWidth - pw - 8));
      let top = r.bottom + 8;
      // If not enough space below, place above while keeping centered
      let placement = 'bottom';
      if (top + ph + 8 > window.innerHeight) {
        top = Math.max(8, r.top - ph - 8);
        placement = 'top';
      }
      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
      pop.setAttribute('data-placement', placement);
      // Align caret to anchor center within popover bounds
      const anchorCenterX = r.left + (r.width / 2);
      const arrowLeft = Math.max(12, Math.min(pw - 12, anchorCenterX - left));
      pop.style.setProperty('--arrow-left', `${arrowLeft}px`);
      pop.style.visibility = 'visible';
    };
    position();
    
    const modeRadios = Array.from(pop.querySelectorAll('input[name="delay-mode"]'));
    const amountEl = pop.querySelector('input[type="number"]');
    const unitEl = pop.querySelector('select.unit-select');
    const applyBtn = pop.querySelector('.btn-apply');
    const cancelBtn = pop.querySelector('.btn-cancel');
    const setDisabled = () => {
      const mode = (modeRadios.find(r => r.checked)?.value) || 'immediate';
      const disabled = mode !== 'delay';
      amountEl.disabled = disabled;
      unitEl.disabled = disabled;
    };
    setDisabled();
    modeRadios.forEach(r => r.addEventListener('change', setDisabled));
    
    const toMinutes = () => {
      const mode = (modeRadios.find(r => r.checked)?.value) || 'immediate';
      if (mode === 'immediate') return 0;
      const amt = Math.max(0, Math.min(10080, parseInt(amountEl.value || '0', 10) || 0));
      const unit = unitEl.value;
      if (unit === 'days') return Math.min(10080, amt * 1440);
      if (unit === 'hours') return Math.min(10080, amt * 60);
      return Math.min(10080, amt);
    };
    
    const apply = () => {
      const mins = toMinutes();
      step.delayMinutes = mins;
      try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
      closeDelayPopover();
      render();
    };
    
    applyBtn.addEventListener('click', apply);
    cancelBtn.addEventListener('click', () => closeDelayPopover());
    
    // Focus management and trap
    const focusables = () => Array.from(pop.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(el => !el.disabled && el.offsetParent !== null);
    const firstFocusable = () => focusables()[0];
    const lastFocusable = () => focusables()[focusables().length - 1];
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDelayPopover();
      } else if (e.key === 'Tab') {
        const fs = focusables();
        if (fs.length === 0) return;
        const first = fs[0];
        const last = fs[fs.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      } else if (e.key === 'Enter') {
        // Enter applies when not on cancel
        const target = e.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) {
          e.preventDefault();
          apply();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    
    // Outside click to close
    const onDocPointer = (e) => {
      if (pop.contains(e.target) || anchorEl.contains(e.target)) return;
      closeDelayPopover();
    };
    setTimeout(() => {
      document.addEventListener('mousedown', onDocPointer, true);
      window.addEventListener('resize', position);
      window.addEventListener('scroll', position, true);
    }, 0);
    
    // Initial focus
    const initial = pop.querySelector('input[name="delay-mode"][value="immediate"]');
    if (existingMinutes === 0 && initial) initial.focus();
    else if (amountEl && !amountEl.disabled) amountEl.focus();
    else if (firstFocusable()) firstFocusable().focus();
    
    _openDelayPopover = {
      el: pop,
      cleanup: () => {
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('mousedown', onDocPointer, true);
        window.removeEventListener('resize', position);
        window.removeEventListener('scroll', position, true);
        // Play closing animation then remove
        try {
          pop.classList.add('closing');
          const removeNow = () => { try { pop.remove(); } catch (_) {} };
          pop.addEventListener('animationend', removeNow, { once: true });
          // Safety timeout in case animationend doesn't fire
          setTimeout(removeNow, 180);
        } catch (_) {
          try { pop.remove(); } catch (_) {}
        }
        // Return focus to the anchor for accessibility
        try {
          anchorEl.setAttribute('aria-expanded', 'false');
          anchorEl.removeAttribute('aria-controls');
          anchorEl.focus();
        } catch (_) {}
      }
    };
  }

  function attachEvents() {
    const backBtn = document.getElementById('back-to-sequences');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        try { window.crm && window.crm.navigateToPage('sequences'); } catch (e) { /* noop */ }
      });
    }

    const addStepBtn = document.getElementById('add-step-btn');
    const emptyAddBtn = document.getElementById('empty-add-step');
    const builderAddBtn = document.getElementById('builder-add-step');
    const builderAddBtns = document.querySelectorAll('.builder-add-step');

    const onAdd = () => {
      const overlay = createStepTypeModal(({ type, label }) => handleAddStep(type, label));
      document.body.appendChild(overlay);
      overlay.focus();
    };
    if (addStepBtn) addStepBtn.addEventListener('click', onAdd);
    if (emptyAddBtn) emptyAddBtn.addEventListener('click', onAdd);
    if (builderAddBtn) builderAddBtn.addEventListener('click', onAdd);
    builderAddBtns.forEach(btn => btn.addEventListener('click', onAdd));

    // Open contacts list modal
    const contactsBtn = document.getElementById('contacts-btn');
    if (contactsBtn && !contactsBtn.dataset.bound) {
      contactsBtn.dataset.bound = '1';
      contactsBtn.addEventListener('click', async () => {
        // Close any existing instance first (singleton)
        document.querySelectorAll('.modal-overlay.contacts-modal-overlay').forEach(el => el.remove());

        // Open immediately using current in-memory contacts
        const overlay = createContactsListModal();
        overlay.classList.add('contacts-modal-overlay');
        document.body.appendChild(overlay);
        overlay.focus();

        // Fire-and-forget background refresh; when done, re-render modal if still open
        if (state.currentSequence?.id) {
          try {
            await loadContactsFromSequenceMembers(state.currentSequence.id);
            const open = document.querySelector('.modal-overlay.contacts-modal-overlay');
            if (open) {
              const fresh = createContactsListModal();
              fresh.classList.add('contacts-modal-overlay');
              open.replaceWith(fresh);
              fresh.focus();
            }
          } catch (err) {
            console.warn('[SequenceBuilder] contacts modal refresh failed', err);
          }
        }
      });
    }

    // Contact search functionality
    const contactSearchInput = document.getElementById('contact-search-input');
    const contactSearchResults = document.getElementById('contact-search-results');
    
    if (contactSearchInput && contactSearchResults) {
      let searchTimeout;

      const runSearch = (val) => {
        // Debounce search, allow empty to show suggestions
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => { searchContacts(val); }, 200);
      };

      contactSearchInput.addEventListener('input', (e) => {
        const query = (e.target.value || '').trim();
        contactSearchResults.hidden = false; // keep panel open while typing
        runSearch(query);
      });

      contactSearchInput.addEventListener('focus', () => {
        // Show suggestions immediately on focus (all contacts if empty)
        contactSearchResults.hidden = false;
        runSearch((contactSearchInput.value || '').trim());
      });

      // Close results when clicking outside (also closes add popover)
      const onDocClick = (e) => {
        if (!contactSearchInput.contains(e.target) && !contactSearchResults.contains(e.target)) {
          contactSearchResults.hidden = true;
          closeAddContactPopover();
        }
      };
      document.addEventListener('click', onDocClick, true);
    }

    // Inline edit controls for sequence title
    const editTitleBtn = document.getElementById('edit-seq-title-btn');
    if (editTitleBtn) {
      editTitleBtn.addEventListener('click', () => {
        // Animate current title out, then switch to edit mode
        const wrap = document.querySelector('.contact-subtitle .seq-title-wrap');
        if (wrap) {
          const onEnd = () => {
            wrap.removeEventListener('animationend', onEnd);
            state.editingTitle = true;
            state.tempTitle = state.currentSequence?.name || '';
            render();
          };
          wrap.addEventListener('animationend', onEnd, { once: true });
          wrap.classList.add('anim-out');
        } else {
          state.editingTitle = true;
          state.tempTitle = state.currentSequence?.name || '';
          render();
        }
      });
    }

    const seqDeleteBtn = document.getElementById('delete-seq-btn');
    if (seqDeleteBtn) {
      seqDeleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openSequenceDeletePopover(seqDeleteBtn);
      });
    }

    const input = document.getElementById('seq-title-input');
    const saveBtn = document.getElementById('save-seq-title');
    const cancelBtn = document.getElementById('cancel-seq-title');
    const animateEditRowOut = (after) => {
      const row = document.querySelector('.contact-subtitle .seq-title-edit-row');
      if (row) {
        const onEnd = () => {
          row.removeEventListener('animationend', onEnd);
          after();
        };
        row.addEventListener('animationend', onEnd, { once: true });
        row.classList.add('anim-out');
      } else {
        after();
      }
    };
    const doCancel = () => {
      // Blur any focused control inside the edit row so actions won't remain due to :focus-within
      try {
        const row = document.querySelector('.contact-subtitle .seq-title-edit-row');
        const focused = row && row.contains(document.activeElement) ? document.activeElement : null;
        if (focused && typeof focused.blur === 'function') focused.blur();
      } catch (_) { /* noop */ }
      animateEditRowOut(() => {
        state.editingTitle = false;
        state.tempTitle = '';
        render();
        // After view is restored, force-hide actions briefly even if hovered
        try {
          const wrap = document.querySelector('.contact-subtitle .seq-title-wrap');
          if (wrap) {
            wrap.classList.add('no-hover');
            setTimeout(() => { wrap.classList.remove('no-hover'); }, 250);
          }
        } catch (_) { /* noop */ }
      });
    };
    const doSave = () => {
      if (!input) return;
      const newName = (input.value || '').trim();
      if (!newName) { input.focus(); return; }
      // Blur before leaving edit mode so focus doesn't keep actions visible
      try { input.blur && input.blur(); } catch (_) { /* noop */ }
      animateEditRowOut(() => {
        state.currentSequence.name = newName;
        state.editingTitle = false;
        state.tempTitle = '';
        try {
          const db = window.firebaseDB;
          if (db && state.currentSequence?.id) {
            db.collection('sequences').doc(state.currentSequence.id)
              .set({ name: state.currentSequence.name }, { merge: true })
              .catch((err) => console.warn('Failed to persist rename:', err));
          }
        } catch (_) { /* noop */ }
        render();
        // After view is restored, force-hide actions briefly even if hovered
        try {
          const wrap = document.querySelector('.contact-subtitle .seq-title-wrap');
          if (wrap) {
            wrap.classList.add('no-hover');
            setTimeout(() => { wrap.classList.remove('no-hover'); }, 250);
          }
        } catch (_) { /* noop */ }
      });
    };
    if (input) {
      setTimeout(() => { try { input.focus(); input.select && input.select(); } catch (_) {} }, 0);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); doSave(); }
        else if (e.key === 'Escape') { e.preventDefault(); doCancel(); }
      });
    }
    saveBtn && saveBtn.addEventListener('click', doSave);
    cancelBtn && cancelBtn.addEventListener('click', doCancel);
  }

  function attachBuilderEvents() {
    const container = document.getElementById('sequence-builder-view');
    if (!container || !state.currentSequence?.steps) return;

    // Collapse/expand
    container.querySelectorAll('.step-card .collapse-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        step.collapsed = !step.collapsed;
        render();
      });
    });

    // Tabs
    container.querySelectorAll('.step-card .step-tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const card = tab.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        const tabName = tab.getAttribute('data-tab') || 'editor';
        step.activeTab = tabName;
        
        // Add/remove preview-active class for CSS targeting
        if (tabName === 'preview') {
          card.classList.add('preview-active');
        } else {
          card.classList.remove('preview-active');
        }
        
        render();
      });
    });

    // Pause/Start toggle
    container.querySelectorAll('.step-card .pause-toggle').forEach(input => {
      input.addEventListener('change', () => {
        const card = input.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        const isActive = input.checked;
        step.paused = !isActive;
        try { scheduleStepSave(step.id, true); } catch (_) { /* noop */ }
        render();
      });
    });

    // Mode toggle (Manual / AI) using toggle-btn style
    container.querySelectorAll('.step-card .mode-toggle .toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        const target = btn.getAttribute('data-mode') || 'manual';
        if (!step.data) step.data = {};
        step.data.mode = target === 'ai' ? 'ai' : 'manual';
        if (step.data.mode === 'manual') {
          // Do not discard aiOutput; simply leave it until user returns to AI
        }
        // Update active button visuals
        const wrap = btn.parentElement;
        if (wrap) {
          wrap.querySelectorAll('.toggle-btn').forEach(b => {
            const on = b === btn;
            b.classList.toggle('active', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
          });
        }
        try { scheduleStepSave(step.id); } catch (_) {}
        render();
      });
    });

    // Go to Preview from AI editor notice
    container.querySelectorAll('.step-card .go-to-preview').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        step.activeTab = 'preview';
        render();
      });
    });

    // Email settings (settings icon) – show settings popover
    container.querySelectorAll('.step-card .settings-step').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const card = btn.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        
        // Toggle: if settings are already shown, close them; otherwise open
        if (step.showSettings) {
          closeEmailSettings();
        } else {
          openEmailSettings(btn, step);
        }
      });
    });

    // Delete step (trash icon) – show anchored popover
    container.querySelectorAll('.step-card .trash-step').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const card = btn.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        openDeletePopover(btn, step);
      });
    });

    // Edit delay (supports buttons in delay pill above the card or inside it)
    container.querySelectorAll('.edit-delay').forEach(btn => {
      btn.addEventListener('click', () => {
        const holder = btn.closest('[data-id]');
        const id = holder?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        openDelayPopover(btn, step);
      });
    });

    // Subject/body inputs
    container.querySelectorAll('.step-card .subject-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const card = inp.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        if (!step.data) step.data = {};
        step.data.subject = inp.value;
        try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
      });
    });
    container.querySelectorAll('.step-card .body-input').forEach(inp => {
      const persist = () => {
        const card = inp.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        if (!step.data) step.data = {};
        step.data.body = inp.isContentEditable ? inp.innerHTML : inp.value;
        try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
      };
      inp.addEventListener('input', persist);
      inp.addEventListener('blur', persist);
      // keep toggle states in sync while selecting/typing in rich editor
      if (inp.isContentEditable) {
        const card = inp.closest('.step-card');
        const upd = () => updateToggleStates(card, inp);
        inp.addEventListener('keyup', upd);
        inp.addEventListener('mouseup', upd);
        inp.addEventListener('input', upd);
        inp.addEventListener('focus', upd);
      }
    });

    // Phone call: priority select
    container.querySelectorAll('.step-card .call-priority').forEach(sel => {
      sel.addEventListener('change', () => {
        const card = sel.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        if (!step.data) step.data = {};
        step.data.priority = sel.value || 'normal';
        try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
      });
    });

    // Phone call: note textarea
    container.querySelectorAll('.step-card .call-note').forEach(inp => {
      const persist = () => {
        const card = inp.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        if (!step.data) step.data = {};
        step.data.note = inp.value || '';
        try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
      };
      inp.addEventListener('input', persist);
      inp.addEventListener('blur', persist);
    });

    // Phone call: skip-after-due control
    container.querySelectorAll('.step-card .call-skip-after-enabled').forEach(box => {
      box.addEventListener('change', () => {
        const card = box.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        if (!step.data) step.data = {};
        step.data.skipAfterDueEnabled = !!box.checked;
        // Enable/disable the days input accordingly
        const daysEl = card.querySelector('.call-skip-after-days');
        if (daysEl) daysEl.disabled = !box.checked;
        try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
      });
    });
    container.querySelectorAll('.step-card .call-skip-after-days').forEach(inp => {
      const persist = () => {
        const card = inp.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        if (!step.data) step.data = {};
        let v = parseInt(inp.value, 10);
        if (!Number.isFinite(v) || v < 1) v = 1;
        step.data.skipAfterDays = v;
        try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
      };
      inp.addEventListener('input', persist);
      inp.addEventListener('blur', persist);
    });

    // LinkedIn: priority select
    container.querySelectorAll('.step-card .linkedin-priority').forEach(sel => {
      sel.addEventListener('change', () => {
        const card = sel.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        if (!step.data) step.data = {};
        step.data.priority = sel.value || 'normal';
        try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
      });
    });

    // LinkedIn: note textarea
    container.querySelectorAll('.step-card .linkedin-note').forEach(inp => {
      const persist = () => {
        const card = inp.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        if (!step.data) step.data = {};
        step.data.note = inp.value || '';
        try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
      };
      inp.addEventListener('input', persist);
      inp.addEventListener('blur', persist);
    });

    // LinkedIn: skip-after-due control
    container.querySelectorAll('.step-card .linkedin-skip-after-enabled').forEach(box => {
      box.addEventListener('change', () => {
        const card = box.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        if (!step.data) step.data = {};
        step.data.skipAfterDueEnabled = !!box.checked;
        // Enable/disable the days input accordingly
        const daysEl = card.querySelector('.linkedin-skip-after-days');
        if (daysEl) daysEl.disabled = !box.checked;
        try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
      });
    });
    container.querySelectorAll('.step-card .linkedin-skip-after-days').forEach(inp => {
      const persist = () => {
        const card = inp.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        if (!step.data) step.data = {};
        let v = parseInt(inp.value, 10);
        if (!Number.isFinite(v) || v < 1) v = 1;
        step.data.skipAfterDays = v;
        try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
      };
      inp.addEventListener('input', persist);
      inp.addEventListener('blur', persist);
    });

    // Drag and drop for step reordering
    attachDragAndDropEvents(container);

    // Attachment remove (immediate save)
    container.querySelectorAll('.step-card .attachments .remove-attach').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step || !step.data || !Array.isArray(step.data.attachments)) return;
        const item = btn.closest('.attach-item');
        const aid = item?.getAttribute('data-attach-id');
        if (!aid) return;
        step.data.attachments = step.data.attachments.filter(a => a.id !== aid);
        render();
        try { scheduleStepSave(step.id, true); } catch (_) { /* noop */ }
      });
    });

    // Editor toolbar actions
    container.querySelectorAll('.step-card .editor-toolbar .toolbar-btn').forEach(btn => {
      // capture selection before focus changes so we can restore and toggle off immediately
      btn.addEventListener('mousedown', (e) => {
        const card = btn.closest('.step-card');
        const editor = card?.querySelector('.body-input');
        if (editor && editor.isContentEditable) {
          captureSelection(editor);
          e.preventDefault(); // keep focus in editor
        }
      });
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        const card = btn.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        const editor = card.querySelector('.body-input');
        const getSel = () => ({
          start: editor && !editor.isContentEditable ? editor.selectionStart : 0,
          end: editor && !editor.isContentEditable ? editor.selectionEnd : 0
        });

        const isRich = editor && editor.isContentEditable;
        const isHtml = editor && editor.getAttribute('data-editor') === 'html';
        if (isRich) restoreSelection(editor);

        switch (action) {
          case 'ai': {
            if (isHtml) break;
            const aiBar = card.querySelector('.ai-bar');
            if (aiBar) {
              const isOpen = aiBar.classList.toggle('open');
              aiBar.setAttribute('aria-hidden', String(!isOpen));
              if (isOpen) {
                // Close other bars when opening AI bar
                const fmtBar = card.querySelector('.formatting-bar');
                if (fmtBar && fmtBar.classList.contains('open')) {
                  fmtBar.classList.remove('open');
                  fmtBar.setAttribute('aria-hidden', 'true');
                  fmtBar.querySelectorAll('.format-popover').forEach(p => p.classList.remove('open'));
                  fmtBar.querySelectorAll('.fmt-group > .fmt-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
                }
                const linkBar = card.querySelector('.link-bar');
                if (linkBar && linkBar.classList.contains('open')) {
                  linkBar.classList.remove('open');
                  linkBar.setAttribute('aria-hidden', 'true');
                }
              }
            }
            break;
          }
          case 'formatting': {
            if (isHtml) break;
            const fmtBar = card.querySelector('.formatting-bar');
            if (fmtBar) {
              const isOpen = fmtBar.classList.toggle('open');
              fmtBar.setAttribute('aria-hidden', String(!isOpen));
              if (isOpen) updateToggleStates(card, editor);
              if (!isOpen) {
                fmtBar.querySelectorAll('.format-popover').forEach(p => p.classList.remove('open'));
                fmtBar.querySelectorAll('.fmt-group > .fmt-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
              }
              const linkBar = card.querySelector('.link-bar');
              if (linkBar) {
                linkBar.classList.remove('open');
                linkBar.setAttribute('aria-hidden', 'true');
              }
            }
            break;
          }
          case 'link': {
            const linkBar = card.querySelector('.link-bar');
            if (!linkBar) break;
            const willOpen = !linkBar.classList.contains('open');
            linkBar.classList.toggle('open', willOpen);
            linkBar.setAttribute('aria-hidden', String(!willOpen));
            if (willOpen) {
              const fmtBar = card.querySelector('.formatting-bar');
              if (fmtBar && fmtBar.classList.contains('open')) {
                fmtBar.classList.remove('open');
                fmtBar.setAttribute('aria-hidden', 'true');
                fmtBar.querySelectorAll('.format-popover').forEach(p => p.classList.remove('open'));
                fmtBar.querySelectorAll('.fmt-group > .fmt-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
              }
              let selText = '';
              if (isRich) {
                restoreSelection(editor);
                const html = getSelectedHtmlWithin(editor);
                if (html) {
                  const tmp = document.createElement('div');
                  tmp.innerHTML = html;
                  selText = tmp.textContent || '';
                }
              } else if (editor) {
                const sel = getSel();
                selText = sel.end > sel.start ? (editor.value || '').slice(sel.start, sel.end) : '';
              }
              const textEl = linkBar.querySelector('[data-link-text]');
              const urlEl = linkBar.querySelector('[data-link-url]');
              if (textEl) textEl.value = selText || '';
              if (urlEl) urlEl.value = (selText && /^https?:\/\//i.test(selText)) ? selText : 'https://';
              setTimeout(() => { textEl && textEl.focus(); }, 0);
            }
            break;
          }
          case 'image': {
            const picker = document.createElement('input');
            picker.type = 'file';
            picker.accept = 'image/*';
            picker.addEventListener('change', () => {
              const file = picker.files && picker.files[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result;
                if (isRich) {
                  insertHtmlRich(editor, '<img src="' + dataUrl + '" alt="' + escapeHtml(file.name) + '" />');
                  persistRich(step, editor);
                  updateToggleStates(card, editor);
                } else if (isHtml) {
                  insertAtCursor(step, editor, '<img src="' + dataUrl + '" alt="' + escapeHtml(file.name) + '" />');
                } else {
                  insertAtCursor(step, editor, '![' + file.name + '](' + dataUrl + ')');
                }
                try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
              };
              reader.readAsDataURL(file);
            }, { once: true });
            picker.click();
            break;
          }
          case 'attach': {
            const picker = document.createElement('input');
            picker.type = 'file';
            picker.multiple = true;
            picker.addEventListener('change', () => {
              const files = Array.from(picker.files || []);
              if (!files.length) return;
              if (!step.data) step.data = {};
              if (!Array.isArray(step.data.attachments)) step.data.attachments = [];
              let pending = files.length;
              files.forEach((file) => {
                const reader = new FileReader();
                reader.onload = () => {
                  step.data.attachments.push({
                    id: 'att-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    dataUrl: reader.result
                  });
                  pending--;
                  if (pending === 0) {
                    render();
                    try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
                  }
                };
                reader.readAsDataURL(file);
              });
            }, { once: true });
            picker.click();
            break;
          }
          case 'code': {
            if (!step.data) step.data = {};
            if (isRich) {
              persistRich(step, editor);
            } else if (editor) {
              step.data.body = editor.value || '';
            }
            step.data.editorMode = isHtml ? 'rich' : 'html';
            render();
            try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
            break;
          }
          case 'templates': {
            try { window.crm && window.crm.showToast && window.crm.showToast('Templates coming soon'); } catch (_) {}
            break;
          }
          case 'variables': {
            const anchorBtn = btn;
            const open = () => createVariablesPopover(anchorBtn, ({ scope, key }) => {
              const token = `{{${scope}.${key}}}`;
              if (isRich) {
                restoreSelection(editor);
                insertTokenAsChip(editor, scope, key);
                persistRich(step, editor);
                updateToggleStates(card, editor);
              } else if (isHtml && editor) {
                restoreSelection(editor);
                insertAtCursor(step, editor, token);
              } else if (editor) {
                restoreSelection(editor);
                insertAtCursor(step, editor, token);
              }
              try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
            });
            const existingPopover = document.querySelector('.vars-popover');
            const existingVarsModal = document.querySelector('.modal-overlay .vars-tabs')?.closest('.modal-overlay');
            if (existingPopover) {
              if (typeof existingPopover._cleanup === 'function') existingPopover._cleanup();
              else existingPopover.remove();
            } else if (existingVarsModal) {
              existingVarsModal.remove();
              try { btn.setAttribute('aria-expanded', 'false'); } catch (_) {}
            } else {
              open();
            }
            break;
          }
          default:
            break;
        }
      });
    });

  // Helper functions for AI email formatting
  function formatTemplatedEmail(result, recipient, templateType) {
    try {
      const subject = (result.subject || 'Energy Solutions');
      const html = result.output || result.html || '<p>Email content</p>';
      // Light de-salesify on subject only (avoid mutating structured HTML templates)
      const cleanSubject = String(subject)
        .replace(/\bAt Power Choosers,?\s+we\b/gi, 'We')
        .replace(/\bAt Power Choosers,?\s+I\b/gi, 'I')
        .replace(/\bPower Choosers helps\b/gi, 'We help')
        .replace(/\bPower Choosers can help\b/gi, 'We can help')
        .replace(/\bPower Choosers\b/gi, 'We');
      return { subject: cleanSubject, html };
    } catch (error) {
      console.error('Error formatting templated email:', error);
      return { subject: 'Energy Solutions', html: '<p>Error generating email content.</p>' };
    }
  }

  function formatGeneratedEmail(result, recipient, mode) {
    try {
      // Resolve sender first name robustly
      const senderFirst = getSenderFirstName();

      // Handle JSON response format
      let jsonData = null;
      try {
        const jsonText = String(result || '').trim()
          .replace(/^\s*```json\s*/i, '')
          .replace(/^\s*```\s*/i, '')
          .replace(/\s*```\s*$/i, '');
        const match = jsonText.match(/\{[\s\S]*\}/);
        if (match) {
          jsonData = JSON.parse(match[0]);
        }
      } catch (_) {
        // Not JSON, use as-is
      }

      if (jsonData) {
        const subject = (jsonData.subject || 'Energy Solutions')
          .replace(/\bAt Power Choosers,?\s+we\b/gi, 'We')
          .replace(/\bAt Power Choosers,?\s+I\b/gi, 'I')
          .replace(/\bPower Choosers helps\b/gi, 'We help')
          .replace(/\bPower Choosers can help\b/gi, 'We can help')
          .replace(/\bPower Choosers\b/gi, 'We');
        const paragraphs = [];
        if (jsonData.greeting) paragraphs.push(jsonData.greeting);
        if (jsonData.paragraph1) paragraphs.push(jsonData.paragraph1);
        if (jsonData.paragraph2) paragraphs.push(jsonData.paragraph2);
        if (jsonData.paragraph3) paragraphs.push(jsonData.paragraph3);

        // Always enforce closing as "Best regards, <FirstName>"
        const enforcedClosing = `Best regards,\n${senderFirst}`;
        paragraphs.push(enforcedClosing);

        // De-salesify body text (plain paragraphs only; not HTML templates)
        const body = paragraphs.join('\n\n')
          .replace(/\bAt Power Choosers,?\s+we\b/gi, 'We')
          .replace(/\bAt Power Choosers,?\s+I\b/gi, 'I')
          .replace(/\bPower Choosers helps\b/gi, 'We help')
          .replace(/\bPower Choosers can help\b/gi, 'We can help')
          .replace(/\bPower Choosers\b/gi, 'We');

        // Convert to HTML with readable color
        const htmlBody = body
          .split(/\n\n/)
          .map(p => p.trim())
          .filter(Boolean)
          .map(p => {
            const withLineBreaks = p.replace(/\n/g, '<br>');
            return `<p style="margin: 0 0 16px 0; color:#222;">${withLineBreaks}</p>`;
          })
          .join('');

        return { subject, html: htmlBody };
      } else {
        // Fallback: treat as plain text
        const subject = 'Energy Solutions';
        const raw = String(result || 'Email content');
        const sanitizedRaw = raw
          .replace(/\bAt Power Choosers,?\s+we\b/gi, 'We')
          .replace(/\bAt Power Choosers,?\s+I\b/gi, 'I')
          .replace(/\bPower Choosers helps\b/gi, 'We help')
          .replace(/\bPower Choosers can help\b/gi, 'We can help')
          .replace(/\bPower Choosers\b/gi, 'We');
        const hasClosing = /best\s*regards[\s,]*$/i.test(sanitizedRaw.trim());
        const appended = hasClosing ? sanitizedRaw : `${sanitizedRaw}\n\nBest regards,\n${senderFirst}`;
        const html = '<p style="color:#222;">'
          + appended.replace(/\n\n/g, '</p><p style="color:#222;">').replace(/\n/g, '<br>')
          + '</p>';
        return { subject, html };
      }
    } catch (error) {
      console.error('Error formatting generated email:', error);
      return { subject: 'Energy Solutions', html: '<p>Error generating email content.</p>' };
    }
  }

    // AI bar interactions (event delegation per step-card) – only present in AI mode in Preview
    container.querySelectorAll('.step-card .ai-bar').forEach(bar => {
      // Get card reference for this bar
      const card = bar.closest('.step-card');
      
      // AI suggestion buttons
      bar.querySelectorAll('.ai-suggestion').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const prompt = btn.getAttribute('data-prompt');
          const textarea = bar.querySelector('.ai-prompt');
          if (textarea && prompt) {
            textarea.value = prompt;
            textarea.focus();
          }
        });
      });

      // AI generate buttons
      bar.querySelectorAll('.ai-generate').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          const textarea = bar.querySelector('.ai-prompt');
          const status = bar.querySelector('.ai-status');
          const mode = btn.getAttribute('data-mode');
          
          if (!textarea) return;
          
          // Check if we're in Preview tab
          const previewTab = card.querySelector('.tab[data-tab="preview"]');
          const isPreviewActive = previewTab?.classList.contains('active');
          
          if (!isPreviewActive) {
            if (status) status.textContent = 'Switch to Preview tab to generate';
            return;
          }
          
          // Get step data and selected contact
          const stepId = card.getAttribute('data-id');
          const step = state.currentSequence?.steps?.find(s => s.id === stepId);
          const selectedContact = step?.data?.previewContact;
          
          if (!selectedContact) {
            if (status) status.textContent = 'Please select a contact in Preview tab';
            return;
          }
          
          const prompt = textarea.value.trim();
          if (!prompt) {
            if (status) status.textContent = 'Please enter a prompt';
            return;
          }
          
          if (status) status.textContent = 'Generating preview...';
          btn.disabled = true;
          
          try {
            // Call AI generation API with selected contact data
            const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
            const senderFirst = getSenderFirstName();
            const response = await fetch(`${base}/api/perplexity-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: prompt,
                mode: mode,
                recipient: {
                  name: selectedContact.full_name || selectedContact.name || '',
                  firstName: selectedContact.first_name || selectedContact.firstName || (selectedContact.name?.split(' ')[0] || ''),
                  lastName: selectedContact.last_name || selectedContact.lastName || (selectedContact.name?.split(' ').slice(1).join(' ') || ''),
                  company: selectedContact.company || selectedContact.accountName || '',
                  email: selectedContact.email || '',
                  title: selectedContact.title || selectedContact.job || ''
                },
                senderName: senderFirst || ' '
              })
            });
            
            if (response.ok) {
              const result = await response.json();
              
              // Update PREVIEW, not editor
              const previewBodyEl = card.querySelector('.preview-body');
              const previewSubjectEl = card.querySelector('.preview-subject');
              
              // Format the result similar to email-compose-global.js
              let html = '';
              let subject = '';
              
              if (result.templateType) {
                // HTML template format
                const formatted = formatTemplatedEmail(result.output || result, selectedContact, result.templateType);
                subject = formatted.subject;
                html = formatted.html;
              } else {
                // Standard format
                const formatted = formatGeneratedEmail(result.output || result, selectedContact, mode);
                subject = formatted.subject;
                html = formatted.html;
              }
              
              if (previewBodyEl && html) { previewBodyEl.innerHTML = html; }
              if (previewSubjectEl && subject) { previewSubjectEl.textContent = subject; }

              // Update AI lifecycle state only – do not overwrite manual subject/body until saved
              if (step) {
                if (!step.data) step.data = {};
                step.data.aiOutput = { subject, html };
                step.data.aiStatus = 'generated';
                try { scheduleStepSave(step.id); } catch (_) {}
              }
              
              if (status) status.textContent = 'Preview generated!';
            } else {
              const errorData = await response.json().catch(() => ({}));
              if (status) status.textContent = errorData.error || 'Generation failed';
            }
          } catch (error) {
            console.error('AI generation error:', error);
            if (status) status.textContent = 'Generation error: ' + error.message;
          } finally {
            btn.disabled = false;
          }
        });
      });
      
      // Update AI bar status based on tab and contact selection
      const updateAIBarStatus = () => {
        const card = bar.closest('.step-card');
        const previewTab = card?.querySelector('.tab[data-tab="preview"]');
        const isPreviewActive = previewTab?.classList.contains('active');
        const status = bar.querySelector('.ai-status');
        const stepId = card?.getAttribute('data-id');
        const step = state.currentSequence?.steps?.find(s => s.id === stepId);
        const hasContact = step?.data?.previewContact;
        
        if (status) {
          if (isPreviewActive) {
            const phase = step?.data?.aiStatus || 'draft';
            const base = hasContact ? 'Ready to generate preview' : 'Select a contact to generate preview';
            status.textContent = phase === 'generated' ? 'Generated - review and Save to step' : base;
          } else {
            status.textContent = 'Switch to Preview tab to generate';
          }
        }
      };
      
      // Watch for tab changes
      card?.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
          setTimeout(updateAIBarStatus, 100);
        });
      });
      
      // Watch for contact selection changes
      const contactInput = card?.querySelector('.preview-contact-input');
      if (contactInput) {
        contactInput.addEventListener('input', () => {
          setTimeout(updateAIBarStatus, 100);
        });
      }
      
      // Initial status update
      setTimeout(updateAIBarStatus, 100);
    });

    // AI Save to step / revert handlers
    container.querySelectorAll('.step-card .ai-save-to-step').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step || !step.data?.aiOutput) return;
        if (!step.data) step.data = {};
        step.data.subject = step.data.aiOutput.subject || step.data.subject || '';
        step.data.body = step.data.aiOutput.html || step.data.body || '';
        step.data.aiStatus = 'saved';
        try { scheduleStepSave(step.id, true); } catch (_) {}
        render();
      });
    });
    container.querySelectorAll('.step-card .switch-to-manual').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        if (!step.data) step.data = {};
        step.data.mode = 'manual';
        try { scheduleStepSave(step.id); } catch (_) {}
        render();
      });
    });

    // Formatting bar interactions (event delegation per step-card)
    container.querySelectorAll('.step-card .formatting-bar').forEach(bar => {
      // capture selection before clicking a format button inside the bar
      bar.addEventListener('mousedown', (e) => {
        const card = bar.closest('.step-card');
        const editor = card?.querySelector('.body-input');
        if (!editor || !editor.isContentEditable) return;
        const btn = e.target.closest?.('.fmt-btn');
        if (!btn) return;
        captureSelection(editor);
        e.preventDefault();
      });
      bar.addEventListener('click', (e) => {
        const card = bar.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        const editor = card?.querySelector('.body-input');
        if (!step || !editor) return;
        const isRich = editor.isContentEditable;
        if (isRich) restoreSelection(editor);

        const btn = e.target.closest?.('.fmt-btn');
        const closeAll = () => {
          bar.querySelectorAll('.format-popover').forEach(p => p.classList.remove('open'));
          bar.querySelectorAll('.fmt-group > .fmt-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
        };

        // For empty editor + collapsed caret, toggle a local typing-state so repeated clicks
        // can flip on/off before typing begins. Then sync button states.
        const updateLocalTypingIfEmpty = (fmt) => {
          if (!isRich) return;
          const sel = window.getSelection ? window.getSelection() : null;
          const collapsed = !!(sel && sel.rangeCount && sel.getRangeAt(0).collapsed);
          if (collapsed && editorIsVisuallyEmpty(editor) && (fmt === 'bold' || fmt === 'italic' || fmt === 'underline' || fmt === 'ol' || fmt === 'ul')) {
            const local = _typingState.get(editor) || {};
            const current = !!local[fmt];
            local[fmt] = !current;
            _typingState.set(editor, local);
          }
          try { requestAnimationFrame(() => updateToggleStates(card, editor)); } catch (_) { /* noop */ }
          setTimeout(() => updateToggleStates(card, editor), 0);
        };

        if (btn) {
          const fmt = btn.getAttribute('data-fmt');
          const group = btn.closest('.fmt-group');
          const pop = group ? group.querySelector('.format-popover') : null;
          if (fmt === 'font' || fmt === 'size' || fmt === 'highlight') {
            // toggle popover, close others
            const willOpen = pop && !pop.classList.contains('open');
            closeAll();
            if (pop && willOpen) {
              pop.classList.add('open');
              btn.setAttribute('aria-expanded', 'true');
            }
            return;
          }
          if (fmt === 'bold') {
            updateLocalTypingIfEmpty(fmt);
            if (isRich) { execRich(editor, 'bold'); persistRich(step, editor); } else { wrapSelection(step, editor, '**', '**', 'bold'); }
            updateToggleStates(card, editor);
            try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
            return;
          }
          if (fmt === 'italic') {
            updateLocalTypingIfEmpty(fmt);
            if (isRich) { execRich(editor, 'italic'); persistRich(step, editor); } else { wrapSelection(step, editor, '*', '*', 'italic'); }
            updateToggleStates(card, editor);
            try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
            return;
          }
          if (fmt === 'underline') {
            updateLocalTypingIfEmpty(fmt);
            if (isRich) { execRich(editor, 'underline'); persistRich(step, editor); } else { wrapSelection(step, editor, '<u>', '</u>', 'underline'); }
            updateToggleStates(card, editor);
            try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
            return;
          }
          if (fmt === 'ol') {
            updateLocalTypingIfEmpty(fmt);
            if (isRich) { execRich(editor, 'insertOrderedList'); persistRich(step, editor); } else { applyList(step, editor, 'ol'); }
            updateToggleStates(card, editor);
            try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
            return;
          }
          if (fmt === 'ul') {
            updateLocalTypingIfEmpty(fmt);
            if (isRich) { execRich(editor, 'insertUnorderedList'); persistRich(step, editor); } else { applyList(step, editor, 'ul'); }
            updateToggleStates(card, editor);
            try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
            return;
          }
        }

        // Option items
        const fontItem = e.target.closest?.('.font-item');
        if (fontItem) {
          const family = fontItem.getAttribute('data-font') || '';
          if (isRich) {
            const selHtml = getSelectedHtmlWithin(editor) || 'text';
            insertHtmlRich(editor, `<span style="font-family:${family}">${selHtml}</span>`);
            persistRich(step, editor);
          } else {
            wrapSelection(step, editor, `<span style="font-family:${family}">`, '</span>', 'text');
          }
          const label = bar.querySelector('[data-current-font]');
          if (label) label.textContent = (fontItem.textContent || 'Sans Serif');
          fontItem.closest('.format-popover')?.classList.remove('open');
          bar.querySelector('.fmt-btn[data-fmt="font"]')?.setAttribute('aria-expanded', 'false');
          updateToggleStates(card, editor);
          try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
          return;
        }

        const sizeItem = e.target.closest?.('.size-item');
        if (sizeItem) {
          const size = sizeItem.getAttribute('data-size') || '12';
          if (isRich) {
            const selHtml = getSelectedHtmlWithin(editor) || 'text';
            insertHtmlRich(editor, `<span style="font-size:${size}px">${selHtml}</span>`);
            persistRich(step, editor);
          } else {
            wrapSelection(step, editor, `<span style="font-size:${size}px">`, '</span>', 'text');
          }
          const label = bar.querySelector('[data-current-size]');
          if (label) label.textContent = size;
          sizeItem.closest('.format-popover')?.classList.remove('open');
          bar.querySelector('.fmt-btn[data-fmt="size"]')?.setAttribute('aria-expanded', 'false');
          updateToggleStates(card, editor);
          try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
          return;
        }

        const swatch = e.target.closest?.('.swatch');
        if (swatch) {
          const val = swatch.getAttribute('data-color');
          let hex = '#ffd54f';
          if (val === 'none') {
            if (isRich) {
              try { execRich(editor, 'hiliteColor', 'transparent'); } catch (_) {}
              try { execRich(editor, 'backColor', 'transparent'); } catch (_) {}
              try { execRich(editor, 'hiliteColor', 'initial'); } catch (_) {}
              try { execRich(editor, 'backColor', 'initial'); } catch (_) {}
              persistRich(step, editor);
            } else {
              // Non-rich fallback: no-op (avoids stripping other formatting). User can retype without highlight.
            }
            swatch.closest('.format-popover')?.classList.remove('open');
            bar.querySelector('.fmt-btn[data-fmt="highlight"]')?.setAttribute('aria-expanded', 'false');
            updateToggleStates(card, editor);
            return;
          }
          if (val === 'red') hex = '#ff6b6b';
          if (val === 'green') hex = '#51cf66';
          if (isRich) {
            execRich(editor, 'hiliteColor', hex);
            execRich(editor, 'backColor', hex); // fallback for some browsers
            persistRich(step, editor);
          } else {
            wrapSelection(step, editor, `<mark style="background-color:${hex}">`, '</mark>', 'highlight');
          }
          swatch.closest('.format-popover')?.classList.remove('open');
          bar.querySelector('.fmt-btn[data-fmt="highlight"]')?.setAttribute('aria-expanded', 'false');
          updateToggleStates(card, editor);
          try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
          return;
        }
      });

      // Dismiss popovers on outside click
      document.addEventListener('click', (evt) => {
        if (!bar.classList.contains('open')) return;
        const within = bar.contains(evt.target);
        const isFmtToggle = evt.target.closest?.('.toolbar-btn[data-action="formatting"]');
        if (!within && !isFmtToggle) {
          bar.querySelectorAll('.format-popover').forEach(p => p.classList.remove('open'));
          bar.querySelectorAll('.fmt-group > .fmt-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
        }
      });
      bar.addEventListener('keydown', (evt) => {
        if (evt.key === 'Escape') {
          bar.querySelectorAll('.format-popover').forEach(p => p.classList.remove('open'));
          bar.querySelectorAll('.fmt-group > .fmt-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
        }
      });

      // Live-sync button pressed states as the user types or changes selection
      const card = bar.closest('.step-card');
      const editor = card?.querySelector('.body-input');
      if (editor && editor.isContentEditable) {
        const sync = () => updateToggleStates(card, editor);
        editor.addEventListener('keyup', sync);
        editor.addEventListener('mouseup', sync);
        // When the user starts typing or pastes, clear temporary local typing-state
        const clearLocalState = () => { _typingState.delete(editor); updateToggleStates(card, editor); };
        editor.addEventListener('input', clearLocalState);
        editor.addEventListener('paste', clearLocalState);
        // Keep states in sync when caret moves programmatically
        if (!editor.dataset.selectionSync) {
          const onSelChange = () => {
            try {
              // Always recompute; updateToggleStates handles selection outside editor gracefully
              updateToggleStates(card, editor);
            } catch (_) { /* noop */ }
          };
          document.addEventListener('selectionchange', onSelChange);
          editor.dataset.selectionSync = '1';
        }
      }
    });

    // Link bar interactions (per step-card)
    container.querySelectorAll('.step-card .link-bar').forEach(bar => {
      // Close on outside click
      const onDocClick = (evt) => {
        if (!bar.classList.contains('open')) return;
        const within = bar.contains(evt.target);
        const isLinkToggle = evt.target.closest?.('.toolbar-btn[data-action="link"]');
        if (!within && !isLinkToggle) {
          bar.classList.remove('open');
          bar.setAttribute('aria-hidden', 'true');
        }
      };
      document.addEventListener('click', onDocClick);

      // Escape closes the bar
      bar.addEventListener('keydown', (evt) => {
        if (evt.key === 'Escape') {
          bar.classList.remove('open');
          bar.setAttribute('aria-hidden', 'true');
        }
      });

      // Insert / Cancel
      const insertBtn = bar.querySelector('[data-link-insert]');
      const cancelBtn = bar.querySelector('[data-link-cancel]');
      const textEl = bar.querySelector('[data-link-text]');
      const urlEl = bar.querySelector('[data-link-url]');

      const normalizeUrl = (u) => {
        if (!u) return '';
        const t = String(u).trim();
        if (!t) return '';
        if (/^https?:\/\//i.test(t)) return t;
        return 'https://' + t;
      };

      const onInsert = () => {
        const card = bar.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        const editor = card.querySelector('.body-input');
        const isRich = editor && editor.isContentEditable;
        const isHtml = editor && editor.getAttribute('data-editor') === 'html';
        const text = (textEl?.value || '').trim();
        const url = normalizeUrl(urlEl?.value || '');
        if (!url) return; // nothing to do

        if (isRich) {
          // Prefer selected HTML if no custom text provided
          restoreSelection(editor);
          let innerHtml = '';
          try { innerHtml = getSelectedHtmlWithin(editor) || ''; } catch (_) { innerHtml = ''; }
          const labelHtml = text ? escapeHtml(text) : (innerHtml || escapeHtml(url));
          insertHtmlRich(editor, `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${labelHtml}</a>`);
          persistRich(step, editor);
          updateToggleStates(card, editor);
        } else if (editor) {
          // HTML or plain textarea: replace current selection if any
          const start = editor.selectionStart || 0;
          const end = editor.selectionEnd || 0;
          const selected = end > start ? (editor.value || '').slice(start, end) : '';
          const label = text || selected || url;
          const snippet = isHtml
            ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
            : `[${label}](${url})`;
          insertAtCursor(step, editor, snippet);
        }
        try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
        bar.classList.remove('open');
        bar.setAttribute('aria-hidden', 'true');
      };

      insertBtn && insertBtn.addEventListener('click', onInsert);
      cancelBtn && cancelBtn.addEventListener('click', () => {
        bar.classList.remove('open');
        bar.setAttribute('aria-hidden', 'true');
      });

      // Pressing Enter in either field inserts the link
      [textEl, urlEl].forEach((el) => {
        if (!el) return;
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onInsert();
          }
        });
      });
    });

    // Preview contact search interactions
    container.querySelectorAll('.step-card').forEach(card => {
      const picker = card.querySelector('.preview-contact-picker');
      if (!picker) return;
      const input = picker.querySelector('.preview-contact-input');
      const resultsEl = picker.querySelector('.preview-results');
      if (!input || !resultsEl) return;

      const stepId = card.getAttribute('data-id');
      const step = state.currentSequence.steps.find(s => s.id === stepId);

      // ARIA combobox wiring
      const resultsId = `preview-results-${stepId}`;
      resultsEl.id = resultsId;
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-autocomplete', 'list');
      input.setAttribute('aria-controls', resultsId);
      input.setAttribute('aria-expanded', 'false');

      let items = [];
      let activeIndex = -1;
      let debounceTimer = null;

      const setActive = (idx) => {
        activeIndex = idx;
        const opts = resultsEl.querySelectorAll('.preview-result');
        opts.forEach((el, i) => {
          el.setAttribute('aria-selected', String(i === activeIndex));
        });
        const activeEl = activeIndex >= 0 ? resultsEl.querySelector(`.preview-result[data-index="${activeIndex}"]`) : null;
        input.setAttribute('aria-activedescendant', activeEl ? activeEl.id : '');
        if (activeEl && typeof activeEl.scrollIntoView === 'function') {
          activeEl.scrollIntoView({ block: 'nearest' });
        }
      };

      const renderResults = () => {
        if (!items.length) {
          resultsEl.innerHTML = '';
          resultsEl.classList.remove('open');
          input.setAttribute('aria-expanded', 'false');
          return;
        }
        resultsEl.innerHTML = items.map((r, i) => `
          <div class="preview-result" role="option" id="opt-${escapeHtml(stepId)}-${i}" data-index="${i}" aria-selected="${i === activeIndex}">
            <div class="title">${escapeHtml(r.title || '')}</div>
            ${r.subtitle ? `<div class="subtitle">${escapeHtml(r.subtitle)}</div>` : ''}
          </div>
        `).join('');
        resultsEl.classList.add('open');
        input.setAttribute('aria-expanded', 'true');
      };

      const updatePreview = (contact) => {
        const subjEl = card.querySelector('.preview-subject');
        const bodyEl = card.querySelector('.preview-body');
        const subjRaw = (step?.data?.subject || '');
        const bodyRaw = (step?.data?.body || '');
        if (contact) {
          subjEl && (subjEl.innerHTML = substituteContactTokensInText(subjRaw, contact) || '(no subject)');
          bodyEl && (bodyEl.innerHTML = processBodyHtmlWithContact(bodyRaw, contact) || '(empty)');
        } else {
          subjEl && (subjEl.textContent = subjRaw || '(no subject)');
          bodyEl && (bodyEl.innerHTML = bodyRaw || '(empty)');
        }
      };

      const pick = (idx) => {
        if (idx < 0 || idx >= items.length) return;
        const chosen = items[idx];
        if (step) {
          if (!step.data) step.data = {};
          step.data.previewContact = chosen.data || chosen;
        }
        input.value = chosen.title || '';
        setActive(-1);
        resultsEl.innerHTML = '';
        resultsEl.classList.remove('open');
        input.setAttribute('aria-expanded', 'false');
        updatePreview(step?.data?.previewContact || null);
      };

      const searchDebounced = (q) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          const res = await fetchContacts(q);
          items = Array.isArray(res) ? res : [];
          setActive(items.length ? 0 : -1);
          renderResults();
        }, 250);
      };

      input.addEventListener('input', () => {
        const q = input.value.trim();
        if (!q) {
          items = [];
          setActive(-1);
          renderResults();
          if (step?.data) step.data.previewContact = null;
          updatePreview(null);
          return;
        }
        searchDebounced(q);
      });

      input.addEventListener('keydown', (evt) => {
        if (evt.key === 'ArrowDown') {
          if (items.length) {
            if (!resultsEl.classList.contains('open')) renderResults();
            setActive((activeIndex + 1) % items.length);
            evt.preventDefault();
          }
          return;
        }
        if (evt.key === 'ArrowUp') {
          if (items.length) {
            if (!resultsEl.classList.contains('open')) renderResults();
            setActive((activeIndex - 1 + items.length) % items.length);
            evt.preventDefault();
          }
          return;
        }
        if (evt.key === 'Enter') {
          if (activeIndex >= 0) {
            pick(activeIndex);
            evt.preventDefault();
          }
          return;
        }
        if (evt.key === 'Escape') {
          resultsEl.innerHTML = '';
          resultsEl.classList.remove('open');
          input.setAttribute('aria-expanded', 'false');
          setActive(-1);
          return;
        }
      });

      resultsEl.addEventListener('mousedown', (e) => {
        const itemEl = e.target.closest?.('.preview-result');
        if (!itemEl) return;
        const idx = parseInt(itemEl.getAttribute('data-index') || '-1', 10);
        if (idx >= 0) pick(idx);
      });

      // (document click handler added once below after loop)
    });

    // Global close for any open preview results when clicking outside the picker
    if (!container.dataset.previewDocClick) {
      const handler = (e) => {
        container.querySelectorAll('.preview-contact-picker').forEach(p => {
          if (!p.contains(e.target)) {
            const inp = p.querySelector('.preview-contact-input');
            const res = p.querySelector('.preview-results');
            if (res) res.classList.remove('open');
            if (inp) inp.setAttribute('aria-expanded', 'false');
          }
        });
      };
      document.addEventListener('click', handler);
      container.dataset.previewDocClick = '1';
    }

    // Add-step button within builder: wired in attachEvents() to avoid duplicate handlers
  }


  // Drag and drop functionality for step reordering
  function attachDragAndDropEvents(container) {
    let dragState = {
      isDragging: false,
      draggedElement: null,
      draggedStepId: null,
      startY: 0,
      offsetY: 0,
      scrollInterval: null,
      scrollDir: null,
      dropPlaceholder: null,
      targetIndex: null,
      lastClientY: 0
    };
    const preventTextSelection = (ev) => ev.preventDefault();

    container.querySelectorAll('.step-card').forEach(stepCard => {
      let holdTimer = null;
      let startPos = { x: 0, y: 0 };

      // Mouse down - start hold timer
      stepCard.addEventListener('mousedown', (e) => {
        // Don't drag if clicking on interactive elements or editable areas
        if (
          e.target.closest('button, input, textarea, select, .toolbar-btn, .toggle-switch, .editor-toolbar, .link-bar, .attachments, .preview-contact-picker') ||
          e.target.closest('[contenteditable="true"], .body-input, .input-dark')
        ) return;
        
        startPos = { x: e.clientX, y: e.clientY };
        
        holdTimer = setTimeout(() => {
          const itemEl = stepCard.closest('.step-item') || stepCard;
          startDrag(itemEl, e);
        }, 200); // 200ms hold to start drag
      });

      // Mouse move - cancel hold if moved too much
      stepCard.addEventListener('mousemove', (e) => {
        if (holdTimer && !dragState.isDragging) {
          const dx = Math.abs(e.clientX - startPos.x);
          const dy = Math.abs(e.clientY - startPos.y);
          if (dx > 5 || dy > 5) {
            clearTimeout(holdTimer);
            holdTimer = null;
          }
        }
      });

      // Mouse up - cancel hold timer
      stepCard.addEventListener('mouseup', () => {
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
      });

      // Mouse leave - cancel hold timer
      stepCard.addEventListener('mouseleave', () => {
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
      });
    });

    function startDrag(stepItem, e) {
      dragState.isDragging = true;
      dragState.draggedElement = stepItem;
      dragState.draggedStepId = stepItem.getAttribute('data-id');
      dragState.startY = e.clientY;
      dragState.lastClientY = e.clientY;
      
      const rect = stepItem.getBoundingClientRect();
      dragState.offsetY = e.clientY - rect.top;

      // Add drag classes
      stepItem.classList.add('dragging');
      document.body.style.cursor = 'grabbing';
      // Prevent text selection during drag
      try {
        document.body.classList.add('dragging-steps');
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
        document.body.style.msUserSelect = 'none';
        document.addEventListener('selectstart', preventTextSelection, true);
      } catch (_) {}
      
      // Create drop placeholder
      createDropPlaceholder(stepItem);
      // Insert placeholder at the current position to preserve layout space
      try {
        if (stepItem.parentNode) {
          stepItem.parentNode.insertBefore(dragState.dropPlaceholder, stepItem);
        }
      } catch (_) {}
      
      // Make the dragged element follow the cursor (overlay)
      stepItem.style.position = 'fixed';
      stepItem.style.width = rect.width + 'px';
      stepItem.style.left = rect.left + 'px';
      stepItem.style.top = (e.clientY - dragState.offsetY) + 'px';
      stepItem.style.pointerEvents = 'none';
      stepItem.style.zIndex = '1000';
      
      // Attach global mouse events
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      
      e.preventDefault();
    }

    function createDropPlaceholder(stepItem) {
      dragState.dropPlaceholder = document.createElement('div');
      dragState.dropPlaceholder.className = 'step-drop-placeholder';
      
      // Match the height of the dragged item
      const rect = stepItem.getBoundingClientRect();
      dragState.dropPlaceholder.style.minHeight = rect.height + 'px';
      
      // Initially hide it
      dragState.dropPlaceholder.style.opacity = '0';
    }

    function handleDragMove(e) {
      if (!dragState.isDragging) return;
      
      // Auto-scroll logic
      handleAutoScroll(e.clientY);
      
      // Update dragged element position to follow cursor
      if (dragState.draggedElement) {
        dragState.draggedElement.style.top = (e.clientY - dragState.offsetY) + 'px';
      }

      // Find drop position and show placeholder
      updateDropIndicator(e.clientY);
      dragState.lastClientY = e.clientY;
      
      e.preventDefault();
    }

    function handleAutoScroll(clientY) {
      // Identify scroll targets
      const scrollingEl = (document.scrollingElement || document.documentElement);
      const viewTop = 0;
      const viewBottom = window.innerHeight;
      const scrollThreshold = 80; // px from edges
      const baseSpeed = 6; // px per tick (slower)

      // Nearest scrollable ancestor of the dragged element
      const getScrollableAncestor = (el) => {
        let node = el?.parentElement;
        while (node && node !== document.body) {
          const style = window.getComputedStyle(node);
          const canScroll = (node.scrollHeight > node.clientHeight) && /auto|scroll/i.test(style.overflowY || '');
          if (canScroll) return node;
          node = node.parentElement;
        }
        return null;
      };

      const ancestor = getScrollableAncestor(dragState.draggedElement);
      const containerEl = ancestor || document.getElementById('sequence-builder-view');
      const containerCanScroll = !!containerEl && (containerEl.scrollHeight > containerEl.clientHeight);

      const ensureInterval = (dir, doScroll) => {
        if (dragState.scrollDir !== dir) {
          if (dragState.scrollInterval) clearInterval(dragState.scrollInterval);
          dragState.scrollInterval = setInterval(() => {
            if (!dragState.isDragging) return;
            doScroll();
            updateDropIndicator(dragState.lastClientY || clientY);
          }, 16);
          dragState.scrollDir = dir;
        }
        // Do an immediate step so it feels responsive even if the interval resets
        doScroll();
      };

      // Try container scroll first (if present)
      if (containerCanScroll) {
        const rect = containerEl.getBoundingClientRect();
        if (clientY < rect.top + scrollThreshold) {
          ensureInterval('up', () => {
            const dist = Math.max(5, clientY - rect.top);
            const factor = Math.min(3, Math.max(1, (scrollThreshold / dist))); // clamp max speed
            containerEl.scrollTop -= Math.round(baseSpeed * factor);
          });
          return;
        }
        if (clientY > rect.bottom - scrollThreshold) {
          ensureInterval('down', () => {
            const dist = Math.max(5, rect.bottom - clientY);
            const factor = Math.min(3, Math.max(1, (scrollThreshold / dist))); // clamp max speed
            containerEl.scrollTop += Math.round(baseSpeed * factor);
          });
          return;
        }
      }

      // Otherwise, scroll the window when near viewport edges
      if (clientY < viewTop + scrollThreshold) {
        ensureInterval('up', () => {
          const dist = Math.max(5, clientY - viewTop);
          const factor = Math.min(3, Math.max(1, (scrollThreshold / dist))); // clamp max speed
          window.scrollBy(0, -Math.round(baseSpeed * factor));
        });
        return;
      }
      if (clientY > viewBottom - scrollThreshold) {
        ensureInterval('down', () => {
          const dist = Math.max(5, viewBottom - clientY);
          const factor = Math.min(3, Math.max(1, (scrollThreshold / dist))); // clamp max speed
          window.scrollBy(0, Math.round(baseSpeed * factor));
        });
        return;
      }

      // Not near any edge: stop auto-scrolling
      if (dragState.scrollInterval) {
        clearInterval(dragState.scrollInterval);
        dragState.scrollInterval = null;
      }
      dragState.scrollDir = null;
    }

    function updateDropIndicator(clientY) {
      const stepItems = container.querySelectorAll('.step-item:not(.dragging)');
      let insertIndex = 0;
      let insertBefore = null;
      
      // Find where to insert based on mouse Y position
      for (let i = 0; i < stepItems.length; i++) {
        const item = stepItems[i];
        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        
        if (clientY < midY) {
          insertIndex = i;
          insertBefore = item;
          break;
        }
        insertIndex = i + 1;
      }
      
      // Store the target index for later use
      dragState.targetIndex = insertIndex;
      
      // Remove placeholder from current position
      if (dragState.dropPlaceholder.parentNode) {
        dragState.dropPlaceholder.parentNode.removeChild(dragState.dropPlaceholder);
      }
      
      // Insert placeholder at new position
      if (insertBefore) {
        insertBefore.parentNode.insertBefore(dragState.dropPlaceholder, insertBefore);
      } else if (stepItems.length > 0) {
        // Insert after the last item
        const lastItem = stepItems[stepItems.length - 1];
        lastItem.parentNode.insertBefore(dragState.dropPlaceholder, lastItem.nextSibling);
      } else {
        container.appendChild(dragState.dropPlaceholder);
      }
      
      // Show placeholder
      dragState.dropPlaceholder.classList.add('active');
      dragState.dropPlaceholder.style.opacity = '1';
    }

    function handleDragEnd(e) {
      if (!dragState.isDragging) return;
      
      // Clear auto-scroll
      if (dragState.scrollInterval) {
        clearInterval(dragState.scrollInterval);
        dragState.scrollInterval = null;
      }
      
      // Perform the reorder using the stored target index
      const currentIndex = getCurrentStepIndex();
      if (dragState.targetIndex !== undefined && dragState.targetIndex !== currentIndex) {
        reorderStep(dragState.draggedStepId, dragState.targetIndex, currentIndex);
      }
      
      // Clean up
      cleanup();
      
      // Remove global event listeners
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
    }

    function getDropPosition() {
      if (!dragState.dropPlaceholder || !dragState.dropPlaceholder.parentNode) return -1;
      
      const stepItems = container.querySelectorAll('.step-item');
      const placeholder = dragState.dropPlaceholder;
      
      let position = 0;
      for (let i = 0; i < stepItems.length; i++) {
        const item = stepItems[i];
        if (item.classList.contains('dragging')) continue;
        
        if (item.compareDocumentPosition(placeholder) & Node.DOCUMENT_POSITION_FOLLOWING) {
          break;
        }
        position++;
      }
      
      return position;
    }

    function getCurrentStepIndex() {
      if (!state.currentSequence?.steps || !dragState.draggedStepId) return -1;
      return state.currentSequence.steps.findIndex(s => s.id === dragState.draggedStepId);
    }

    function reorderStep(stepId, newIndex, currentIndex) {
      if (!state.currentSequence?.steps) return;
      
      const steps = state.currentSequence.steps;
      if (currentIndex === -1 || currentIndex === newIndex) return;
      
      // Remove step from current position
      const [step] = steps.splice(currentIndex, 1);
      
      // Insert at new position. newIndex is computed against a list
      // that excludes the dragged element (see updateDropIndicator),
      // so no additional adjustment is needed here.
      steps.splice(newIndex, 0, step);
      
      // Save and re-render
      try { scheduleStepSave(stepId, true); } catch (_) { /* noop */ }
      render();
    }

    function cleanup() {
      if (dragState.draggedElement) {
        dragState.draggedElement.classList.remove('dragging');
        // Restore inline styles
        dragState.draggedElement.style.position = '';
        dragState.draggedElement.style.width = '';
        dragState.draggedElement.style.left = '';
        dragState.draggedElement.style.top = '';
        dragState.draggedElement.style.pointerEvents = '';
        dragState.draggedElement.style.zIndex = '';
      }
      
      if (dragState.dropPlaceholder && dragState.dropPlaceholder.parentNode) {
        dragState.dropPlaceholder.parentNode.removeChild(dragState.dropPlaceholder);
      }
      
      document.body.style.cursor = '';
      try {
        document.body.classList.remove('dragging-steps');
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';
        document.body.style.msUserSelect = '';
        document.removeEventListener('selectstart', preventTextSelection, true);
      } catch (_) {}
      
      dragState = {
        isDragging: false,
        draggedElement: null,
        draggedStepId: null,
        startY: 0,
        offsetY: 0,
        scrollInterval: null,
        scrollDir: null,
        dropPlaceholder: null,
        targetIndex: null,
        lastClientY: 0
      };
    }
  }

  // Function to create tasks from sequence steps
  function createTasksFromSequence(sequence, contactData) {
    if (!sequence.steps || !Array.isArray(sequence.steps)) return [];
    
    const tasks = [];
    let cumulativeDelay = 0;
    
    sequence.steps.forEach((step, index) => {
      // Skip if step is paused
      if (step.paused) return;
      
      // Calculate due date based on cumulative delay
      const dueDate = new Date(Date.now() + cumulativeDelay * 60 * 1000);
      cumulativeDelay += step.delayMinutes || 0;
      
      // Create task based on step type
      let task = null;
      
      if (step.type === 'li-connect' || step.type === 'li-message' || step.type === 'li-view-profile' || step.type === 'li-interact-post') {
        const typeLabels = {
          'li-connect': 'linkedin-connect',
          'li-message': 'linkedin-message', 
          'li-view-profile': 'linkedin-view',
          'li-interact-post': 'linkedin-interact'
        };
        
        const taskTitles = {
          'li-connect': 'Add on LinkedIn',
          'li-message': 'Send a message on LinkedIn',
          'li-view-profile': 'View LinkedIn profile', 
          'li-interact-post': 'Interact with LinkedIn Post'
        };
        
        task = {
          id: `seq_${sequence.id}_${step.id}`,
          title: step.data?.note || taskTitles[step.type] || 'LinkedIn task',
          contact: contactData?.name || contactData?.contact || 'Contact',
          account: contactData?.company || contactData?.account || 'Company',
          type: typeLabels[step.type] || 'linkedin',
          priority: step.data?.priority || 'medium',
          dueDate: dueDate.toLocaleDateString(),
          dueTime: dueDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
          status: 'pending',
          sequenceId: sequence.id,
          stepId: step.id,
          stepIndex: index,
          isSequenceTask: true,
          notes: step.data?.note || ''
        };
      } else if (step.type === 'phone-call') {
        task = {
          id: `seq_${sequence.id}_${step.id}`,
          title: step.data?.note || 'Call contact',
          contact: contactData?.name || contactData?.contact || 'Contact',
          account: contactData?.company || contactData?.account || 'Company',
          type: 'phone-call',
          priority: step.data?.priority || 'medium',
          dueDate: dueDate.toLocaleDateString(),
          dueTime: dueDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
          status: 'pending',
          sequenceId: sequence.id,
          stepId: step.id,
          stepIndex: index,
          isSequenceTask: true,
          notes: step.data?.note || ''
        };
      } else if (step.type === 'auto-email' || step.type === 'manual-email') {
        task = {
          id: `seq_${sequence.id}_${step.id}`,
          title: step.data?.note || 'Send email',
          contact: contactData?.name || contactData?.contact || 'Contact',
          account: contactData?.company || contactData?.account || 'Company',
          type: step.type === 'auto-email' ? 'auto-email' : 'manual-email',
          priority: step.data?.priority || 'medium',
          dueDate: dueDate.toLocaleDateString(),
          dueTime: dueDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
          status: 'pending',
          sequenceId: sequence.id,
          stepId: step.id,
          stepIndex: index,
          isSequenceTask: true,
          notes: step.data?.note || ''
        };
      }
      
      if (task) {
        tasks.push(task);
      }
    });
    
    return tasks;
  }

  // Function to calculate scheduled send time based on delay
  function calculateScheduledSendTime(previousStepTime, delay) {
    if (!delay) return previousStepTime + (24 * 60 * 60 * 1000); // Default 1 day
    
    const delayStr = delay.toString().toLowerCase();
    
    // Parse delay string (e.g., "2 days", "3 hours", "1 week")
    if (delayStr.includes('day')) {
      const days = parseInt(delayStr.match(/\d+/)?.[0] || '1');
      return previousStepTime + (days * 24 * 60 * 60 * 1000);
    } else if (delayStr.includes('hour')) {
      const hours = parseInt(delayStr.match(/\d+/)?.[0] || '1');
      return previousStepTime + (hours * 60 * 60 * 1000);
    } else if (delayStr.includes('week')) {
      const weeks = parseInt(delayStr.match(/\d+/)?.[0] || '1');
      return previousStepTime + (weeks * 7 * 24 * 60 * 60 * 1000);
    } else if (delayStr.includes('minute')) {
      const minutes = parseInt(delayStr.match(/\d+/)?.[0] || '30');
      return previousStepTime + (minutes * 60 * 1000);
    } else {
      // Default to 1 day if can't parse
      return previousStepTime + (24 * 60 * 60 * 1000);
    }
  }

  // Function to send email via SendGrid
  async function sendEmailViaSendGrid(emailData) {
    try {
      const response = await fetch('/api/email/sendgrid-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailData)
      });
      
      if (!response.ok) {
        throw new Error(`Email send failed: ${response.statusText}`);
      }
      
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to send email:', error);
      throw error;
    }
  }

  // Function to start a sequence for a contact using FREE automation
  async function startSequenceForContact(sequence, contactData) {
    try {
      console.log('[SequenceBuilder] Starting sequence with FREE automation:', contactData);
      
      // Initialize free automation if not already done
      if (!window.freeSequenceAutomation) {
        window.freeSequenceAutomation = new FreeSequenceAutomation();
      }
      
      // Start sequence using free automation (handles all email scheduling)
      const result = await window.freeSequenceAutomation.startSequence(sequence, contactData);
      
      // Create regular tasks (non-email) for tracking
      const tasks = createTasksFromSequence(sequence, contactData);
      const nonEmailTasks = tasks.filter(task => task.type !== 'auto-email');
      
      // Save non-email tasks to localStorage
      if (nonEmailTasks.length > 0) {
        const existingTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
        const newTasks = [...existingTasks, ...nonEmailTasks];
        localStorage.setItem('userTasks', JSON.stringify(newTasks));
        
        // Save tasks to Firebase if available
        if (window.firebaseDB) {
          const batch = window.firebaseDB.batch();
          nonEmailTasks.forEach(task => {
            const taskRef = window.firebaseDB.collection('tasks').doc(task.id);
            batch.set(taskRef, {
              ...task,
              timestamp: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || Date.now()
            });
          });
          await batch.commit();
        }
        
        // Dispatch event to update tasks page
        window.dispatchEvent(new CustomEvent('tasksUpdated', { 
          detail: { source: 'sequenceStart', tasks: nonEmailTasks } 
        }));
      }
      
      // Show success message with cost savings
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast(`🎉 FREE Sequence started! ${result.scheduledEmailCount} emails scheduled. Cost: $0/month! (Saved $22/month)`);
      }
      
      console.log('[SequenceBuilder] FREE sequence started successfully:', {
        totalTasks: tasks.length,
        scheduledEmails: result.scheduledEmailCount,
        contact: contactData.email,
        cost: '$0/month',
        savings: '$22/month'
      });
      
      return tasks;
    } catch (error) {
      console.error('[SequenceBuilder] Error starting FREE sequence:', error);
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Failed to start sequence. Please try again.');
      }
      return [];
    }
  }

  // Add CSS for approval notifications
  const style = document.createElement('style');
  style.textContent = `
    /* Hide Sequences page during navigation into builder to avoid flash */
    .pc-hide-sequences #sequences-page { display: none !important; }
    .email-approval-notification {
      position: fixed;
      top: 20px;
      right: 20px;
      background: white;
      border: 2px solid #007bff;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      max-width: 400px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    .notification-content {
      padding: 20px;
    }
    
    .notification-content h4 {
      margin: 0 0 10px 0;
      color: #333;
      font-size: 16px;
    }
    
    .notification-content p {
      margin: 5px 0;
      color: #666;
      font-size: 14px;
    }
    
    .email-preview {
      background: #f8f9fa;
      border: 1px solid #e9ecef;
      border-radius: 4px;
      padding: 10px;
      margin: 10px 0;
      max-height: 200px;
      overflow-y: auto;
      font-size: 12px;
      color: #222; /* ensure readable text on light background */
    }
    .email-preview .preview-subject { color:#222; font-weight:600; margin:0 0 8px 0; }
    .email-preview .preview-body { color:#222; }

    /* Icon stability to prevent flicker during updates */
    svg, img { backface-visibility: hidden; transform: translateZ(0); will-change: opacity, transform; }

    /* Mode toggle styling (match lists overview toggle look) */
    .step-card .mode-toggle .mode-toggle-wrap {
      display: inline-flex;
      gap: 8px;
      background: var(--grey-700);
      border-radius: 999px; /* fully rounded to match inner pill */
      padding: 2px;
    }
    .step-card .mode-toggle .toggle-btn {
      background: transparent;
      color: var(--text-primary);
      border: none;
      padding: 6px 12px;
      border-radius: 999px; /* match container */
      cursor: pointer;
      transition: background 0.2s ease, color 0.2s ease;
    }
    .step-card .mode-toggle .toggle-btn.active {
      background: var(--orange-primary);
      color: #fff;
      border: 1px solid transparent;
    }
    .step-card .mode-toggle .toggle-btn.active:hover {
      background: var(--orange-primary); /* stay orange on hover */
      color: #fff;
      border-color: #ffffff; /* white borderline on hover */
    }
    .step-card .mode-toggle .toggle-btn:hover:not(.active) {
      background: transparent; /* no fill; keep grey container visible */
      color: var(--text-primary);
    }

    /* AI mode centered note */
    .step-card .ai-mode-note {
      padding: 18px;
      margin: 8px 0 14px 0;
      text-align: center;
      border: 1px solid var(--border-light);
      border-radius: 10px;
      background: var(--bg-secondary);
    }
    .step-card .ai-mode-note .ai-stars {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin-bottom: 10px;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));
    }
    .step-card .ai-mode-note .ai-stars svg {
      width: 68px !important;
      height: 68px !important;
      display: block;
    }
    .step-card .ai-mode-note .ai-note-text {
      color: var(--text-primary);
      font-size: 14px;
    }

    /* Delay popover layout fixes */
    .delay-popover .delay-popover-inner { max-width: 340px; }
    .delay-popover .delay-options { display: grid; gap: 10px; }
    .delay-popover .number-unit { display: flex; align-items: center; gap: 10px; justify-content: center; }
    .delay-popover .number-unit .input-dark { width: 96px; text-align: center; }
    .delay-popover .unit-select { min-width: 110px; }
    .delay-popover .btn-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; width: 100%; }
    .delay-popover .btn-row .btn-cancel,
    .delay-popover .btn-row .btn-apply { width: 100%; }

    /* In/Out animations for delay popover */
    @keyframes dpFadeIn {
      0% { opacity: 0; transform: translateY(-6px) scale(0.98); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes dpFadeOut {
      0% { opacity: 1; transform: translateY(0) scale(1); }
      100% { opacity: 0; transform: translateY(-6px) scale(0.98); }
    }
    .delay-popover,
    .delete-popover,
    .vars-popover,
    .add-contact-popover { animation: dpFadeIn 160ms ease forwards; }
    .delay-popover.closing,
    .delete-popover.closing,
    .vars-popover.closing,
    .add-contact-popover.closing { animation: dpFadeOut 140ms ease forwards; }

    /* Full-width buttons for other popovers */
    .delete-popover .btn-row,
    .add-contact-popover .btn-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; width: 100%; }
    .delete-popover .btn-row .btn-cancel,
    .delete-popover .btn-row .btn-confirm,
    .add-contact-popover .btn-row .btn-cancel,
    .add-contact-popover .btn-row .btn-confirm { width: 100%; }

    /* Editor toolbar + editor area visibility and spacing */
    .step-card .editor-toolbar {
      border: 1px solid var(--border-light);
      border-radius: 8px;
      background: var(--bg-secondary);
      padding: 6px 8px;
      margin: 10px 0 8px 0; /* add space above/below (below separates from subject input) */
    }
    .step-card .editor-toolbar .toolbar-btn { border-radius: 6px; }

    /* Make the rich/HTML editor area visible even when empty
       Default: light grey like subject input; on focus: darker bg with orange border */
    .step-card .textarea-dark.body-input,
    .step-card .textarea-dark.body-input[contenteditable="true"] {
      background: var(--bg-secondary); /* light grey, matches subject input */
      border: 1px solid var(--border-light);
      border-radius: 8px;
      min-height: 220px;
      padding: 12px;
      transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .step-card .textarea-dark.body-input:hover,
    .step-card .textarea-dark.body-input[contenteditable="true"]:hover {
      background: var(--bg-primary); /* darken on hover like subject */
      border-color: #ffffff; /* match subject input hover */
    }
    .step-card .textarea-dark.body-input:focus,
    .step-card .textarea-dark.body-input[contenteditable="true"]:focus {
      outline: none;
      background: var(--bg-primary); /* darker when active */
      border-color: var(--orange-primary); /* match subject active state */
      box-shadow: 0 0 0 2px rgba(255, 107, 53, 0.35); /* subtle orange glow */
    }
    /* HTML textarea variant */
    .html-editor-wrap textarea.textarea-dark.body-input { min-height: 220px; }
    
    .approval-buttons {
      display: flex;
      gap: 10px;
      margin-top: 15px;
    }
    
    .approval-buttons button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    }
    
  `;
  document.head.appendChild(style);

  // Export API
  window.SequenceBuilder = {
    show,
    startSequenceForContact,
    createTasksFromSequence,
    cleanupOrphanedSequenceMembers: async (sequenceId) => {
      // Cleanup function to remove orphaned sequenceMembers records (contacts that don't exist)
      if (!sequenceId) {
        console.error('[SequenceBuilder] cleanupOrphanedSequenceMembers requires a sequenceId');
        console.log('[SequenceBuilder] Usage: await window.SequenceBuilder.cleanupOrphanedSequenceMembers("seq-1755363808050")');
        return { cleaned: 0, errors: 0 };
      }
      
      const db = window.firebaseDB;
      if (!db) {
        console.error('[SequenceBuilder] Firebase not available');
        return { cleaned: 0, errors: 0 };
      }
      
        try {
          // Get all sequenceMembers for this sequence
          const membersQuery = await db.collection('sequenceMembers')
            .where('sequenceId', '==', sequenceId)
            .where('targetType', '==', 'people')
            .get();
          
          if (membersQuery.size === 0) {
            return { cleaned: 0, errors: 0 };
          }
          
          const orphanedIds = [];
          const deletePromises = [];
          
          // Check each member to see if the contact exists
          for (const memberDoc of membersQuery.docs) {
            const memberData = memberDoc.data();
            const targetId = memberData.targetId;
            
            if (!targetId) {
              orphanedIds.push(memberDoc.id);
              deletePromises.push(memberDoc.ref.delete());
              continue;
            }
            
            // Check if contact exists
            const contactDoc = await db.collection('contacts').doc(targetId).get();
            
            if (!contactDoc.exists) {
              orphanedIds.push(memberDoc.id);
              deletePromises.push(memberDoc.ref.delete());
            }
          }
          
          // Delete all orphaned records
          if (deletePromises.length > 0) {
            await Promise.all(deletePromises);
            
            // Update stats.active and recordCount
            const remainingMembers = membersQuery.size - deletePromises.length;
            await db.collection('sequences').doc(sequenceId).update({
              "stats.active": remainingMembers,
              recordCount: remainingMembers
            });
            
            return { cleaned: deletePromises.length, errors: 0 };
          } else {
            return { cleaned: 0, errors: 0 };
          }
      } catch (err) {
        console.error('[SequenceBuilder] Cleanup failed:', err);
        return { cleaned: 0, errors: 1 };
      }
    }
  };
  
  // Also create a standalone global function for easier access
  window.cleanupOrphanedSequenceMembers = async (sequenceId) => {
    if (window.SequenceBuilder && typeof window.SequenceBuilder.cleanupOrphanedSequenceMembers === 'function') {
      return await window.SequenceBuilder.cleanupOrphanedSequenceMembers(sequenceId);
    } else {
      console.error('[SequenceBuilder] SequenceBuilder not available. Make sure you are on the sequence builder page.');
      return { cleaned: 0, errors: 1 };
    }
  };
})();
