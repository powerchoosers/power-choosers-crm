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

      // Get current user email for ownership
      const getUserEmail = () => {
        try {
          if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
            return window.DataManager.getCurrentUserEmail().toLowerCase();
          }
          return (window.currentUserEmail || '').toLowerCase();
        } catch (_) {
          return (window.currentUserEmail || '').toLowerCase();
        }
      };
      const userEmail = getUserEmail();

      // Get Firebase database reference
      const db = window.firebaseDB || (window.firebase && window.firebase.firestore());
      if (!db) {
        throw new Error('Firebase not available');
      }

      // Skip if contact has no email
      const hasEmail = contactData.email && contactData.email.trim() !== '';
      if (!hasEmail) {
        console.log(`[FreeSequenceAutomation] Skipping sequence for ${contactData.name} - no email address`);
        throw new Error('Contact must have an email address to start sequence');
      }

      // Create sequenceActivations document
      const activationRef = db.collection('sequenceActivations').doc();
      const activationId = activationRef.id;

      const sequenceActivationData = {
        sequenceId: sequence.id,
        contactIds: [contactData.id], // Single contact for this method
        status: 'pending',
        processedContacts: 0,
        totalContacts: 1,
        ownerId: userEmail,
        assignedTo: userEmail,
        createdBy: userEmail,
        createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
      };

      await activationRef.set(sequenceActivationData);
      console.log('[FreeSequence] Created sequenceActivation:', activationId);

      // Call server endpoint to process immediately
      try {
        const baseUrl = window.API_BASE_URL || window.location.origin || '';
        const response = await fetch(`${baseUrl}/api/process-sequence-activations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            immediate: true,
            activationId: activationId
          })
        });

        if (response.ok) {
          const result = await response.json();
          console.log('[FreeSequence] Activation processing triggered:', result);

          // Dispatch event to refresh emails page
          window.dispatchEvent(new CustomEvent('pc:emails-updated'));

          return {
            success: true,
            scheduledEmailCount: 0, // Will be updated by server
            message: 'Sequence queued for processing'
          };
        } else {
          const errorText = await response.text();
          console.error('[FreeSequence] Failed to trigger processing:', response.status, errorText);

          // Update activation to failed
          await activationRef.update({
            status: 'failed',
            errorMessage: errorText
          });

          throw new Error(`Failed to start sequence: ${errorText}`);
        }
      } catch (genError) {
        console.error('[FreeSequence] Error triggering processing:', genError);

        // Update activation to failed
        try {
          await activationRef.update({
            status: 'failed',
            errorMessage: genError.message
          });
        } catch (updateError) {
          console.error('[FreeSequence] Failed to update activation status:', updateError);
        }

        throw genError;
      }

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

      // Update status to generating (in memory and Firebase)
      email.status = 'generating';
      const db = window.firebaseDB || (window.firebase && window.firebase.firestore());
      if (db) {
        try {
          await db.collection('emails').doc(email.id).update({
            status: 'generating',
            updatedAt: new Date().toISOString()
          });
        } catch (error) {
          console.error('[FreeSequence] Failed to update email status in Firebase:', error);
        }
      }

      // Call Perplexity email API endpoint (using existing endpoint)
      const baseUrl = window.API_BASE_URL || window.location.origin || '';
      const response = await fetch(`${baseUrl}/api/perplexity-email`, {
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

        // Update Firebase with generated content and status
        if (db) {
          try {
            await db.collection('emails').doc(email.id).update({
              subject: result.subject,
              html: result.html,
              text: result.text,
              status: 'pending_approval',
              generatedAt: email.generatedAt,
              updatedAt: new Date().toISOString()
            });
            console.log(`[FreeSequence] Updated email in Firebase with generated content: ${email.id}`);

            // Dispatch event to refresh emails page
            window.dispatchEvent(new CustomEvent('pc:emails-updated'));
          } catch (error) {
            console.error('[FreeSequence] Failed to update email in Firebase:', error);
          }
        }

        console.log(`[FreeSequence] Generated content for ${email.id}`);
      } else {
        email.status = 'error';
        email.errorMessage = 'Failed to generate content';

        // Update Firebase with error status
        if (db) {
          try {
            await db.collection('emails').doc(email.id).update({
              status: 'error',
              errorMessage: email.errorMessage,
              updatedAt: new Date().toISOString()
            });
          } catch (error) {
            console.error('[FreeSequence] Failed to update error status in Firebase:', error);
          }
        }
      }

    } catch (error) {
      console.error(`[FreeSequence] Error generating content:`, error);
      email.status = 'error';
      email.errorMessage = error.message;

      // Update Firebase with error status
      const db = window.firebaseDB || (window.firebase && window.firebase.firestore());
      if (db) {
        try {
          await db.collection('emails').doc(email.id).update({
            status: 'error',
            errorMessage: error.message,
            updatedAt: new Date().toISOString()
          });
        } catch (err) {
          console.error('[FreeSequence] Failed to update error status in Firebase:', err);
        }
      }
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
    // Load email from Firestore instead of Map (new architecture)
    const db = window.firebaseDB || (window.firebase && window.firebase.firestore());
    if (!db) {
      console.error('[FreeSequence] Firebase not available for approval');
      return;
    }

    try {
      const emailDoc = await db.collection('emails').doc(emailId).get();
      if (!emailDoc.exists) {
        console.warn('[FreeSequence] Email not found for approval:', emailId);
        return;
      }

      const email = { id: emailId, ...emailDoc.data() };
      const approvedAt = Date.now();

      // Update Firebase
      await db.collection('emails').doc(emailId).update({
        status: 'approved',
        approvedAt: approvedAt,
        updatedAt: new Date().toISOString()
      });

      // Dispatch event to refresh emails page
      window.dispatchEvent(new CustomEvent('pc:emails-updated'));

      // Remove notification
      const notification = document.querySelector('.email-approval-notification');
      if (notification) notification.remove();

      // Note: Email will be sent by server-side cron job (/api/send-scheduled-emails)
      // No need to call sendEmail() here anymore
      console.log(`[FreeSequence] Email ${emailId} approved. Will be sent by server at scheduled time.`);
    } catch (error) {
      console.error('[FreeSequence] Failed to approve email:', error);
      throw error;
    }
  }

  /**
   * Reject an email
   */
  async rejectEmail(emailId) {
    // Load email from Firestore instead of Map (new architecture)
    const db = window.firebaseDB || (window.firebase && window.firebase.firestore());
    if (!db) {
      console.error('[FreeSequence] Firebase not available for rejection');
      return;
    }

    try {
      const emailDoc = await db.collection('emails').doc(emailId).get();
      if (!emailDoc.exists) {
        console.warn('[FreeSequence] Email not found for rejection:', emailId);
        return;
      }

      const rejectedAt = Date.now();

      // Update Firebase
      await db.collection('emails').doc(emailId).update({
        status: 'rejected',
        rejectedAt: rejectedAt,
        updatedAt: new Date().toISOString()
      });

      // Dispatch event to refresh emails page
      window.dispatchEvent(new CustomEvent('pc:emails-updated'));

      // Remove notification
      const notification = document.querySelector('.email-approval-notification');
      if (notification) notification.remove();

      console.log(`[FreeSequence] Email ${emailId} rejected`);
    } catch (error) {
      console.error('[FreeSequence] Failed to reject email:', error);
      throw error;
    }
  }

  /**
   * Edit an email
   */
  async editEmail(emailId) {
    // Load email from Firestore instead of Map (new architecture)
    const db = window.firebaseDB || (window.firebase && window.firebase.firestore());
    if (!db) {
      console.error('[FreeSequence] Firebase not available for editing');
      return;
    }

    try {
      const emailDoc = await db.collection('emails').doc(emailId).get();
      if (!emailDoc.exists) {
        console.warn('[FreeSequence] Email not found for editing:', emailId);
        return;
      }

      const email = { id: emailId, ...emailDoc.data() };

      // Open email editor (you would implement this)
      console.log(`[FreeSequence] Edit email ${emailId}`);
      // This would open your email editor modal
      // For now, just navigate to email detail page
      if (window.crm && typeof window.crm.navigateToPage === 'function') {
        window.crm.navigateToPage('emails');
        // Trigger email detail view
        setTimeout(() => {
          if (window.EmailsPage && typeof window.EmailsPage.viewEmail === 'function') {
            window.EmailsPage.viewEmail(emailId);
          }
        }, 100);
      }
    } catch (error) {
      console.error('[FreeSequence] Failed to load email for editing:', error);
    }
  }

  /**
   * Send an email
   */
  async sendEmail(email) {
    try {
      console.log(`[FreeSequence] Sending email ${email.id}`);

      // Get email settings from step or use defaults
      const step = email.step || {};
      const isAuto = step.type === 'auto-email';
      const emailSettings = step.emailSettings || getDefaultEmailSettings(isAuto);

      // Build deliverability settings from email settings
      const deliverability = {
        enableTracking: emailSettings.deliverability?.openTracking !== false && emailSettings.deliverability?.clickTracking !== false,
        includeBulkHeaders: emailSettings.deliverability?.bulkHeaders === true,
        includeListUnsubscribe: emailSettings.deliverability?.listUnsubscribe !== false,
        includePriorityHeaders: emailSettings.deliverability?.priorityHeaders === true,
        forceGmailOnly: false,
        useBrandedHtmlTemplate: false,
        signatureImageEnabled: emailSettings.content?.signatureImage !== false
      };

      // Get sender details from settings
      const settings = (window.SettingsPage?.getSettings?.()) || (JSON.parse(localStorage.getItem('crm-settings') || '{}'));
      const general = settings?.general || {};
      const firstName = general.firstName || '';
      const lastName = general.lastName || '';

      // Priority: Settings (firstName + lastName) → Firebase auth displayName → "Power Choosers Team"
      let senderName = '';
      if (firstName && lastName) {
        senderName = `${firstName} ${lastName}`.trim();
      } else {
        // Try Firebase auth displayName as fallback
        try {
          const user = window.firebase?.auth?.().currentUser;
          if (user?.displayName) {
            senderName = user.displayName.trim();
            console.log('[FreeSequence] Using Firebase auth displayName as sender name:', senderName);
          }
        } catch (_) { }

        // Final fallback to "Power Choosers Team" (NOT "Power Choosers CRM")
        if (!senderName) {
          senderName = 'Power Choosers Team';
        }
      }

      const senderEmail = general.email || 'l.patterson@powerchoosers.com';

      // Debug logging to verify sender name
      console.log('[FreeSequence] Sender details:', {
        email: senderEmail,
        name: senderName,
        source: 'settings + Firebase auth fallback'
      });

      // Prepare email data for SendGrid
      const emailData = {
        to: email.to,
        subject: email.subject,
        content: email.html || email.content || '',
        from: senderEmail,
        fromName: senderName,
        isHtmlEmail: true, // Assume HTML for sequence emails
        _deliverability: deliverability
      };

      // Send via SendGrid
      console.log('[FreeSequence] Sending email with fromName:', senderName);
      const result = await sendEmailViaSendGrid(emailData);

      if (result.success) {
        email.status = 'sent';
        email.sentAt = Date.now();
        email.trackingId = result.trackingId;
        email.messageId = result.messageId;
        console.log(`[FreeSequence] Email ${email.id} sent successfully via SendGrid`);
      } else {
        email.status = 'error';
        email.errorMessage = result.error || 'Failed to send email';
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
    contacts: [], // Store sequence contacts
    currentView: 'builder', // 'builder' or 'steps'
    sequenceMembersCache: null, // Cache for sequence members
    stepsPage: 1, // Pagination for steps view
    stepsPageSize: 25, // Items per page in steps view
    stepsTotalCount: 0, // Total count of sequence members (without loading all)
    stepsLoadedMembers: [], // Currently loaded members (paginated)
    stepsLastLoadedDoc: null, // Last document for pagination cursor
    stepsHasMore: true // Flag to indicate if more members exist
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
    } catch (_) { }
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
          } catch (_) { }
        }
        try { anchorEl.setAttribute('aria-expanded', 'false'); } catch (_) { }
        // Blur the trigger so :focus-within no longer keeps actions visible
        try { anchorEl.blur && anchorEl.blur(); } catch (_) { }
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

    // ✅ NEW: Email validation
    if (!contact.email || contact.email.trim() === '') {
      const result = await showEmailValidationModal([contact]);
      if (!result.proceed) {
        return; // User cancelled
      }
      // Mark contact as having no email for sequence automation
      contact._skipEmailSteps = true;
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
      window.crm.showToast(`Added ${contact.name} to sequence${contact._skipEmailSteps ? ' (email steps will be skipped)' : ''}`);
    }

    // Persist to Firebase: create sequenceMembers document AND update sequence
    try {
      const db = window.firebaseDB;
      if (!db || !state.currentSequence?.id) return;

      // Get user email using the same method as sequences.js
      const userEmail = (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function')
        ? window.DataManager.getCurrentUserEmail()
        : ((window.currentUserEmail || '').toLowerCase());

      // Create sequenceMembers document with hasEmail flag
      const memberDoc = {
        sequenceId: state.currentSequence.id,
        targetId: contact.id,
        targetType: 'people',
        hasEmail: !contact._skipEmailSteps, // Track whether contact has email
        skipEmailSteps: contact._skipEmailSteps || false, // Flag to skip email steps
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

      // Notify sequences list / background loader so counts stay in sync
      try {
        if (window.BackgroundSequencesLoader && typeof window.BackgroundSequencesLoader.reload === 'function') {
          window.BackgroundSequencesLoader.reload();
        }
      } catch (_) {
        // Non-fatal; sequences list will eventually refresh on next visit
      }

      // ✅ NEW: If sequence is already active (has active members), automatically start sequence for this new contact
      // Check if sequence has active members (stats.active > 0 or existing sequenceActivations)
      try {
        const sequenceDoc = await db.collection('sequences').doc(state.currentSequence.id).get();
        const sequenceData = sequenceDoc.data();
        const hasActiveMembers = (sequenceData?.stats?.active || 0) > 0;

        // Also check if there are any existing sequenceActivations for this sequence
        let hasExistingActivations = false;
        try {
          const existingActivationsQuery = await db.collection('sequenceActivations')
            .where('sequenceId', '==', state.currentSequence.id)
            .where('status', 'in', ['pending', 'processing'])
            .limit(1)
            .get();
          hasExistingActivations = !existingActivationsQuery.empty;
        } catch (_) {
          // Query might fail if index missing, but that's okay - we'll use stats.active as fallback
        }

        // If sequence is active, automatically create sequenceActivation for this new contact
        if (hasActiveMembers || hasExistingActivations) {
          if (contact.email && !contact._skipEmailSteps) {
            console.log('[SequenceBuilder] Sequence is active, auto-starting for new contact:', contact.name);

            // Create sequenceActivation for this single contact
            const activationRef = db.collection('sequenceActivations').doc();
            const activationId = activationRef.id;

            const sequenceActivationData = {
              sequenceId: state.currentSequence.id,
              contactIds: [contact.id],
              status: 'pending',
              processedContacts: 0,
              totalContacts: 1,
              ownerId: userEmail || 'unknown',
              assignedTo: userEmail || 'unknown',
              createdBy: userEmail || 'unknown',
              createdAt: window.firebase?.firestore?.FieldValue?.serverTimestamp() || Date.now()
            };

            await activationRef.set(sequenceActivationData);
            console.log('[SequenceBuilder] Created auto-sequenceActivation:', activationId);

            // Trigger immediate processing
            try {
              const baseUrl = window.API_BASE_URL || window.location.origin || '';
              const response = await fetch(`${baseUrl}/api/process-sequence-activations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  immediate: true,
                  activationId: activationId
                })
              });

              if (response.ok) {
                const result = await response.json();
                console.log('[SequenceBuilder] Auto-started sequence for new contact:', result);
                if (window.crm && typeof window.crm.showToast === 'function') {
                  window.crm.showToast(`✓ ${contact.name} added and sequence started automatically!`, 'success');
                }
              } else {
                console.warn('[SequenceBuilder] Auto-start failed, but contact was added. Will be picked up by next cron run.');
              }
            } catch (autoStartError) {
              console.warn('[SequenceBuilder] Auto-start failed (non-fatal):', autoStartError);
              // Contact is still added, cron will pick it up
            }
          } else {
            console.log('[SequenceBuilder] Contact has no email, skipping auto-start');
          }
        }
      } catch (autoStartError) {
        console.warn('[SequenceBuilder] Failed to check/auto-start sequence (non-fatal):', autoStartError);
        // Non-fatal - contact is still added, user can manually start if needed
      }

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

  function show(sequence, options = {}) {
    if (!sequence || !sequence.id) {
      console.error('SequenceBuilder.show requires a sequence object with an id');
      return;
    }
    
    // Check if we're returning to the SAME sequence (preserve state)
    const isSameSequence = state.currentSequence?.id === sequence.id;
    const shouldPreserveState = isSameSequence && options.preserveState !== false;
    
    // Store previous state if returning to same sequence
    const previousStepsPage = shouldPreserveState ? state.stepsPage : 1;
    const previousLoadedMembers = shouldPreserveState ? state.stepsLoadedMembers : [];
    const previousLastLoadedDoc = shouldPreserveState ? state.stepsLastLoadedDoc : null;
    const previousHasMore = shouldPreserveState ? state.stepsHasMore : true;
    const previousTotalCount = shouldPreserveState ? state.stepsTotalCount : 0;
    const previousView = shouldPreserveState ? state.currentView : 'builder';
    const previousCache = shouldPreserveState ? state.sequenceMembersCache : null;
    
    console.log(`[SequenceBuilder] show() called, isSameSequence=${isSameSequence}, preserveState=${shouldPreserveState}, previousPage=${previousStepsPage}`);
    
    state.currentSequence = sequence;

    // Ensure all steps have position fields (backward compatibility)
    if (Array.isArray(state.currentSequence.steps)) {
      // Sort by existing position first, then assign sequential positions
      state.currentSequence.steps.sort((a, b) => {
        const posA = typeof a.position === 'number' ? a.position : 999999;
        const posB = typeof b.position === 'number' ? b.position : 999999;
        return posA - posB;
      });

      // Assign/update position fields
      state.currentSequence.steps.forEach((step, idx) => {
        step.position = idx;
      });
    }

    // Initialize contacts from sequence payload first (for immediate UI)
    try {
      state.contacts = Array.isArray(sequence.contacts) ? [...sequence.contacts] : [];
    } catch (_) { state.contacts = []; }

    // Restore pagination state if returning to same sequence
    if (shouldPreserveState) {
      state.stepsPage = previousStepsPage;
      state.stepsLoadedMembers = previousLoadedMembers;
      state.stepsLastLoadedDoc = previousLastLoadedDoc;
      state.stepsHasMore = previousHasMore;
      state.stepsTotalCount = previousTotalCount;
      state.currentView = previousView;
      state.sequenceMembersCache = previousCache;
      console.log(`[SequenceBuilder] Restored state: page=${state.stepsPage}, loaded=${state.stepsLoadedMembers.length}, view=${state.currentView}`);
    } else {
      // Reset pagination state for new sequence
      state.stepsPage = 1;
      state.stepsLoadedMembers = [];
      state.stepsLastLoadedDoc = null;
      state.stepsHasMore = true;
      state.sequenceMembersCache = null;
    }

    // Keep an accurate total count for steps pagination
    const seqRecordCount = typeof sequence.recordCount === 'number' ? sequence.recordCount : 0;
    if (seqRecordCount > 0 && !shouldPreserveState) {
      state.stepsTotalCount = seqRecordCount;
    } else if (state.contacts.length > 0 && !state.stepsTotalCount) {
      state.stepsTotalCount = state.contacts.length;
    } else if (!state.stepsTotalCount) {
      state.stepsTotalCount = 0;
    }
    
    // Apply options overrides (from back navigation)
    if (options.view) {
      state.currentView = options.view;
    }
    if (typeof options.page === 'number' && options.page > 0) {
      state.stepsPage = options.page;
    }

    // Minimize flicker: temporarily hide Sequences page while navigating
    try { document.documentElement.classList.add('pc-hide-sequences'); } catch (_) { }
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
        setTimeout(() => { try { document.documentElement.classList.remove('pc-hide-sequences'); } catch (_) { } }, 240);
      }));
      // Return early to avoid duplicate render below
      // Note: following render() call removed to prevent double work
      return;
    } catch (_) { }

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
        state.stepsTotalCount = validContacts.length;
        // If we've already loaded at least one page of steps, update hasMore flag
        if (state.stepsLoadedMembers.length > 0) {
          state.stepsHasMore = state.stepsLoadedMembers.length < state.stepsTotalCount;
        }
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

  // Helper function for pagination
  window.changeStepsPage = function (page) {
    if (!state.stepsViewPage) state.stepsViewPage = 1;
    state.stepsViewPage = page;
    render();
  };

  // Helper function to get initials
  function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  // Load sequence members in batches (lazy loading)
  async function loadSequenceMembersPage(sequenceId, page = 1, reset = false) {
    const db = window.firebaseDB;
    if (!db || !sequenceId) return { members: [], hasMore: false };

    try {
      // If resetting, clear loaded data
      if (reset) {
        state.stepsLoadedMembers = [];
        state.stepsLastLoadedDoc = null;
        state.stepsHasMore = true;
        state.stepsPage = 1;
      }

      // Keep total count in sync with known values (sequence recordCount or contacts list)
      if (!state.stepsTotalCount || reset) {
        const knownTotal = state.currentSequence?.recordCount || state.contacts.length || 0;
        if (knownTotal > 0) {
          state.stepsTotalCount = knownTotal;
        } else {
          try {
            const countSnapshot = await db.collection('sequenceMembers')
              .where('sequenceId', '==', sequenceId)
              .count()
              .get();
            state.stepsTotalCount = countSnapshot.data().count || 0;
          } catch (err) {
            console.warn('[StepsView] Failed to get count, falling back to loaded size:', err);
            state.stepsTotalCount = state.stepsLoadedMembers.length;
          }
        }
      }

      // If we already have enough members loaded for this page, skip fetching
      const membersNeededForPage = page * state.stepsPageSize;
      if (!reset && state.stepsLoadedMembers.length >= membersNeededForPage) {
        console.log(`[StepsView] Already have ${state.stepsLoadedMembers.length} members, need ${membersNeededForPage} for page ${page} - skipping fetch`);
        state.stepsHasMore = state.stepsLoadedMembers.length < state.stepsTotalCount;
        return {
          members: state.stepsLoadedMembers,
          hasMore: state.stepsHasMore,
          total: state.stepsTotalCount
        };
      }
      
      console.log(`[StepsView] Loading page ${page}: have ${state.stepsLoadedMembers.length}, need ${membersNeededForPage}`);

      // Load next batch ordered by targetId (deterministic pagination w/out custom index)
      let query = db.collection('sequenceMembers')
        .where('sequenceId', '==', sequenceId)
        .orderBy('targetId', 'asc')
        .limit(state.stepsPageSize);

      if (state.stepsLastLoadedDoc && !reset) {
        query = query.startAfter(state.stepsLastLoadedDoc);
      }

      const snapshot = await query.get();
      const rawMembers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const existingIds = new Set(state.stepsLoadedMembers.map(m => m.id));
      const newMembers = rawMembers.filter(member => {
        if (!member?.id) return false;
        if (existingIds.has(member.id)) return false;
        existingIds.add(member.id);
        return true;
      });

      // Update pagination state
      if (snapshot.docs.length > 0) {
        state.stepsLastLoadedDoc = snapshot.docs[snapshot.docs.length - 1];
        state.stepsHasMore = snapshot.docs.length === state.stepsPageSize;
        
        if (reset || page === 1) {
          state.stepsLoadedMembers = newMembers;
        } else {
          // Append for infinite scroll (if we implement that later)
          state.stepsLoadedMembers = [...state.stepsLoadedMembers, ...newMembers];
        }
      }
      state.stepsHasMore = state.stepsLoadedMembers.length < state.stepsTotalCount;

      // Cache the currently loaded members so we can reuse when toggling views
      state.sequenceMembersCache = {
        sequenceId,
        data: state.stepsLoadedMembers.slice(),
        timestamp: Date.now()
      };

      console.log(`[StepsView] Loaded page ${page}: ${newMembers.length} members (total loaded: ${state.stepsLoadedMembers.length}, hasMore: ${state.stepsHasMore})`);

      return {
        members: state.stepsLoadedMembers,
        hasMore: state.stepsHasMore,
        total: state.stepsTotalCount
      };
    } catch (err) {
      console.error('[StepsView] Error loading sequence members:', err);
      return { members: [], hasMore: false, total: 0 };
    }
  }

  // Render the steps view showing each contact's progress
  async function renderStepsView() {
    const db = window.firebaseDB;
    if (!db || !state.currentSequence) return '';

    // Load sequence members in batches (lazy loading)
    const sequenceId = state.currentSequence.id;
    
    // Only reset if switching to a different sequence (not on pagination)
    const needsReset = !state.sequenceMembersCache || 
                       state.sequenceMembersCache.sequenceId !== sequenceId;

    if (needsReset) {
      // Reset and load first page for new sequence
      console.log('[StepsView] New sequence detected, resetting and loading first page');
      await loadSequenceMembersPage(sequenceId, 1, true);
      state.sequenceMembersCache = {
        sequenceId: sequenceId,
        data: state.stepsLoadedMembers,
        timestamp: Date.now()
      };
    } else if (state.stepsLoadedMembers.length === 0) {
      // Load first page if we don't have any loaded
      console.log('[StepsView] No members loaded, loading first page');
      await loadSequenceMembersPage(sequenceId, 1, false);
    } else {
      // Check if we need to load more for the current page
      const currentPageStart = (state.stepsPage - 1) * state.stepsPageSize;
      const currentPageEnd = currentPageStart + state.stepsPageSize;
      
      if (currentPageStart >= state.stepsLoadedMembers.length && state.stepsHasMore) {
        // Need to load more pages to display current page
        console.log(`[StepsView] Need more data for page ${state.stepsPage}: have ${state.stepsLoadedMembers.length}, need at least ${currentPageEnd}`);
        while (state.stepsLoadedMembers.length < currentPageEnd && state.stepsHasMore) {
          const pageToLoad = Math.floor(state.stepsLoadedMembers.length / state.stepsPageSize) + 1;
          await loadSequenceMembersPage(sequenceId, pageToLoad, false);
        }
      }
    }

    const members = state.stepsLoadedMembers;
    let emails = [];

    // Load emails for this sequence to get actual step progress
    try {
      const emailsSnapshot = await db.collection('emails')
        .where('sequenceId', '==', state.currentSequence.id)
        .get();

      emails = emailsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log(`[StepsView] Loaded ${emails.length} emails for sequence`);
    } catch (err) {
      console.error('Error loading emails:', err);
      // Continue without emails - will show "Not started" for everyone
    }

    // ✅ NEW: Load tasks for this sequence to get task step progress
    let tasks = [];
    try {
      const tasksSnapshot = await db.collection('tasks')
        .where('sequenceId', '==', state.currentSequence.id)
        .get();

      tasks = tasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log(`[StepsView] Loaded ${tasks.length} tasks for sequence`);
    } catch (err) {
      console.error('Error loading tasks:', err);
    }

    if (members.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-title">No contacts in this sequence yet</div>
          <div class="empty-desc">Add contacts to see their progress here.</div>
        </div>`;
    }

    // Resolve contact details using CacheManager
    let contactsMap = new Map();
    if (window.CacheManager) {
      try {
        const cachedContacts = await window.CacheManager.get('contacts');
        if (Array.isArray(cachedContacts)) {
          cachedContacts.forEach(c => contactsMap.set(c.id, c));
        }
      } catch (e) {
        console.warn('Failed to load contacts from cache:', e);
      }
    }

    // Create a map of contactId -> latest progress (email or task)
    const contactProgressMap = new Map();

    // Process emails
    emails.forEach(email => {
      const contactId = email.contactId;
      if (!contactId) return;

      const existing = contactProgressMap.get(contactId);
      const stepIndex = email.stepIndex || 0;

      // Keep the item with the highest stepIndex
      if (!existing || stepIndex > existing.stepIndex) {
        contactProgressMap.set(contactId, {
          type: 'email',
          data: email,
          stepIndex: stepIndex,
          status: email.status,
          updatedAt: email.updatedAt || email.createdAt
        });
      } else if (stepIndex === existing.stepIndex) {
        // If same step, prefer the one updated more recently
        const emailTime = new Date(email.updatedAt || email.createdAt || 0).getTime();
        const existingTime = new Date(existing.updatedAt || 0).getTime();
        if (emailTime > existingTime) {
          contactProgressMap.set(contactId, {
            type: 'email',
            data: email,
            stepIndex: stepIndex,
            status: email.status,
            updatedAt: email.updatedAt || email.createdAt
          });
        }
      }
    });

    // Process tasks
    tasks.forEach(task => {
      const contactId = task.contactId || (task.peopleIds && task.peopleIds[0]);
      if (!contactId) return;

      const existing = contactProgressMap.get(contactId);
      const stepIndex = task.stepIndex || 0;

      // Keep the item with the highest stepIndex
      if (!existing || stepIndex > existing.stepIndex) {
        contactProgressMap.set(contactId, {
          type: 'task',
          data: task,
          stepIndex: stepIndex,
          status: task.status,
          updatedAt: task.updatedAt || task.createdAt
        });
      } else if (stepIndex === existing.stepIndex) {
        // If same step, prefer the one updated more recently
        const taskTime = new Date(task.updatedAt || task.createdAt || 0).getTime();
        const existingTime = new Date(existing.updatedAt || 0).getTime();
        if (taskTime > existingTime) {
          contactProgressMap.set(contactId, {
            type: 'task',
            data: task,
            stepIndex: stepIndex,
            status: task.status,
            updatedAt: task.updatedAt || task.createdAt
          });
        }
      }
    });

    console.log('[StepsView] Contact progress mapping:', contactProgressMap.size, 'contacts with progress');

    // Pagination - use total count for accurate pagination
    const derivedTotal = state.currentSequence?.recordCount || state.contacts.length || 0;
    const totalMembers = state.stepsTotalCount || derivedTotal || members.length;
    if (!state.stepsTotalCount && (derivedTotal || members.length)) {
      state.stepsTotalCount = totalMembers;
    }
    const totalPages = Math.max(1, Math.ceil(totalMembers / state.stepsPageSize));
    const currentPage = Math.min(state.stepsPage, totalPages);
    state.stepsPage = currentPage;
    const startIdx = (currentPage - 1) * state.stepsPageSize;
    const loadedEndIdx = Math.min(startIdx + state.stepsPageSize, members.length);
    let pageMembers = members.slice(startIdx, loadedEndIdx);

    // If we don't have enough members for current page and there's more, load them
    if ((pageMembers.length < state.stepsPageSize && state.stepsHasMore) ||
        (pageMembers.length === 0 && startIdx < totalMembers && state.stepsHasMore)) {
      const pagesNeeded = Math.ceil((startIdx + state.stepsPageSize) / state.stepsPageSize);
      const currentLoadedPages = Math.floor(members.length / state.stepsPageSize);
      for (let p = currentLoadedPages + 1; p <= pagesNeeded && state.stepsHasMore; p++) {
        await loadSequenceMembersPage(sequenceId, p, false);
      }
      pageMembers = state.stepsLoadedMembers.slice(startIdx, Math.min(startIdx + state.stepsPageSize, state.stepsLoadedMembers.length));
    }

    // Generate rows
    const rows = pageMembers.map(member => {
      const contact = contactsMap.get(member.targetId) || {
        firstName: 'Unknown',
        lastName: 'Contact',
        email: member.targetId
      };

      const email = contact.email || (member.targetId.includes('@') ? member.targetId : '');
      const name = contact.firstName ? `${contact.firstName} ${contact.lastName || ''}`.trim() : (contact.name || email || 'Unknown');
      const company = contact.company || '';
      const initials = getInitials(name);

      // Find the latest progress for this contact
      const latestProgress = contactProgressMap.get(member.targetId);

      // Determine next step based on latest progress
      let nextStepStr = '-';
      let scheduledStr = '-';

      if (latestProgress) {
        const stepIndex = latestProgress.stepIndex || 0;
        const status = latestProgress.status;
        const type = latestProgress.type;
        const itemData = latestProgress.data;

        // Check if current step is completed
        const isCompleted = status === 'sent' || status === 'completed' || status === 'done';

        if (isCompleted) {
          // Step completed - find and show next step
          let nextStepIndex = stepIndex + 1;
          let foundNextStep = false;

          // Find next non-paused step
          while (nextStepIndex < state.currentSequence.steps.length) {
            const nextStep = state.currentSequence.steps[nextStepIndex];
            if (!nextStep.paused) {
              foundNextStep = true;

              // Determine step label
              const stepLabel = nextStep.name || nextStep.label || nextStep.type || `Step ${nextStepIndex + 1}`;

              // Format step type for display
              let displayLabel = stepLabel;
              if (nextStep.type === 'auto-email') {
                displayLabel = 'Automatic email';
              } else if (nextStep.type === 'phone-call') {
                displayLabel = 'Phone call';
              } else if (nextStep.type === 'li-connect') {
                displayLabel = 'LinkedIn connect';
              } else if (nextStep.type === 'li-message') {
                displayLabel = 'LinkedIn message';
              } else if (nextStep.type === 'li-view-profile') {
                displayLabel = 'LinkedIn view profile';
              } else if (nextStep.type === 'li-interact-post') {
                displayLabel = 'LinkedIn interact';
              }

              nextStepStr = displayLabel;

              // Check if there's an email or task ALREADY created for the next step
              // This happens if the next step was triggered immediately
              const nextProgress = contactProgressMap.get(member.targetId);
              // Only use nextProgress if it matches the next step index (it should, if we are looking ahead)
              // But wait, contactProgressMap only holds the *latest* item. 
              // If the latest item is the completed one we just checked, then the next one hasn't been created/indexed yet 
              // OR it wasn't picked up as "latest" (unlikely if index is higher).

              // Actually, if the next step is created, it would have a higher index and would BE the latestProgress.
              // So if we are here (isCompleted is true), it means the *latest known* item is completed, 
              // and we haven't found a newer item for the next step yet.
              // So the next step is likely "Pending Creation" or "Scheduled".

              // However, for auto-emails, they might be scheduled but not "created" as a document if using the old system,
              // but in the new system, they are created immediately.

              // Let's look for any item in our raw lists that matches nextStepIndex
              const nextEmail = emails.find(e => e.contactId === member.targetId && (e.stepIndex || 0) === nextStepIndex);
              const nextTask = tasks.find(t => (t.contactId === member.targetId || (t.peopleIds && t.peopleIds.includes(member.targetId))) && (t.stepIndex || 0) === nextStepIndex);

              if (nextEmail && nextEmail.scheduledSendTime) {
                try {
                  const date = nextEmail.scheduledSendTime.toDate ? nextEmail.scheduledSendTime.toDate() : new Date(nextEmail.scheduledSendTime);
                  scheduledStr = date.toLocaleString();
                  nextStepStr += ` <span class="badge" style="background:#e2e3e5; color:#383d41; padding:2px 8px; border-radius:12px; font-size:0.75rem; margin-left:4px;">Scheduled</span>`;
                } catch (e) {
                  scheduledStr = 'Scheduled';
                }
              } else if (nextTask && nextTask.dueDate) {
                try {
                  const date = nextTask.dueDate.toDate ? nextTask.dueDate.toDate() : new Date(nextTask.dueDate);
                  scheduledStr = date.toLocaleDateString();
                  nextStepStr += ` <span class="badge" style="background:#e2e3e5; color:#383d41; padding:2px 8px; border-radius:12px; font-size:0.75rem; margin-left:4px;">Pending</span>`;
                } catch (e) {
                  scheduledStr = 'Pending';
                }
              } else {
                // Not yet created/scheduled
                scheduledStr = 'Pending';
                nextStepStr += ` <span class="badge" style="background:#e2e3e5; color:#383d41; padding:2px 8px; border-radius:12px; font-size:0.75rem; margin-left:4px;">Next</span>`;
              }
              break;
            }
            nextStepIndex++;
          }

          if (!foundNextStep) {
            nextStepStr = '<span class="badge badge-success" style="background:#d4edda; color:#155724; padding:2px 8px; border-radius:12px; font-size:0.8rem;">Sequence Completed</span>';
            scheduledStr = 'Done';
          }
        } else if (status === 'error' || status === 'failed') {
          const currentStep = state.currentSequence.steps[stepIndex];
          nextStepStr = `<span class="badge badge-danger" style="background:#f8d7da; color:#721c24; padding:2px 8px; border-radius:12px; font-size:0.8rem;">Error: ${currentStep ? (currentStep.name || currentStep.label || `Step ${stepIndex + 1}`) : 'Unknown'}</span>`;
        } else {
          // In progress (Pending, Approved, Sending, etc.)
          const currentStep = state.currentSequence.steps[stepIndex];
          const stepLabel = currentStep ? (currentStep.name || currentStep.label || `Step ${stepIndex + 1}`) : `Step ${stepIndex + 1}`;

          // Format step type for display
          let displayLabel = stepLabel;
          if (currentStep) {
            if (currentStep.type === 'auto-email') displayLabel = 'Automatic email';
            else if (currentStep.type === 'phone-call') displayLabel = 'Phone call';
            else if (currentStep.type === 'li-connect') displayLabel = 'LinkedIn connect';
            else if (currentStep.type === 'li-message') displayLabel = 'LinkedIn message';
            else if (currentStep.type === 'li-view-profile') displayLabel = 'LinkedIn view profile';
            else if (currentStep.type === 'li-interact-post') displayLabel = 'LinkedIn interact';
          }

          nextStepStr = displayLabel;

          // Show status badge
          let statusLabel = status;
          let badgeColor = '#fff3cd'; // yellow/warning
          let textColor = '#856404';

          if (type === 'email') {
            const statusLabels = {
              'not_generated': 'Generating',
              'pending_approval': 'Pending Review',
              'approved': 'Approved',
              'sending': 'Sending'
            };
            statusLabel = statusLabels[status] || status;

            // Show scheduled time
            if (itemData.scheduledSendTime) {
              try {
                const date = itemData.scheduledSendTime.toDate ? itemData.scheduledSendTime.toDate() : new Date(itemData.scheduledSendTime);
                scheduledStr = date.toLocaleString();
              } catch (e) {
                scheduledStr = '-';
              }
            }
          } else {
            // Task
            const statusLabels = {
              'pending': 'Pending',
              'in_progress': 'In Progress',
              'overdue': 'Overdue'
            };
            statusLabel = statusLabels[status] || status;
            if (status === 'overdue') {
              badgeColor = '#f8d7da';
              textColor = '#721c24';
            }

            // Show due date
            if (itemData.dueDate) {
              try {
                const date = itemData.dueDate.toDate ? itemData.dueDate.toDate() : new Date(itemData.dueDate);
                scheduledStr = date.toLocaleDateString();
              } catch (e) {
                scheduledStr = '-';
              }
            }
          }

          nextStepStr += ` <span class="badge" style="background:${badgeColor}; color:${textColor}; padding:2px 8px; border-radius:12px; font-size:0.75rem; margin-left:4px;">${statusLabel}</span>`;
        }
      } else {
        // No progress found for this contact - not started
        nextStepStr = 'Not started';
        if (member.createdAt) {
          try {
            const date = member.createdAt.toDate ? member.createdAt.toDate() : new Date(member.createdAt);
            scheduledStr = `Added ${date.toLocaleDateString()}`;
          } catch (e) {
            scheduledStr = '-';
          }
        }
      }

      return `
        <tr data-contact-id="${escapeHtml(member.targetId)}">
          <td class="name-cell" data-contact-id="${escapeHtml(member.targetId)}">
            <div class="name-cell__wrap">
              <span class="avatar-initials" aria-hidden="true">${escapeHtml(initials)}</span>
              <span class="name-text">${escapeHtml(name)}</span>
            </div>
            ${company ? `<div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">${escapeHtml(company)}</div>` : ''}
          </td>
          <td><a href="mailto:${escapeHtml(email)}" style="color: var(--text-secondary); text-decoration: none; transition: var(--transition-fast);" onmouseover="this.style.color='var(--text-inverse)'" onmouseout="this.style.color='var(--text-secondary)'">${escapeHtml(email)}</a></td>
          <td>${nextStepStr}</td>
          <td style="color: var(--text-secondary); font-size: 0.9rem;">${scheduledStr}</td>
        </tr>
      `;
    }).join('');

    // Pagination HTML
    const paginationHtml = totalPages > 1 ? (window.crm && window.crm.createPagination ? 
      `<div id="sequence-steps-pagination" class="table-pagination" aria-label="Steps pagination"></div>` :
      `<div class="unified-pagination">
        <button class="pagination-arrow" ${currentPage <= 1 ? 'disabled' : ''} onclick="if(window.SequenceBuilder && window.SequenceBuilder.state) { window.SequenceBuilder.state.stepsPage = Math.max(1, window.SequenceBuilder.state.stepsPage - 1); if(window.SequenceBuilder.render) window.SequenceBuilder.render(); }">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"></polyline></svg>
        </button>
        <div class="pagination-current">${currentPage} / ${totalPages}</div>
        <button class="pagination-arrow" ${currentPage >= totalPages ? 'disabled' : ''} onclick="if(window.SequenceBuilder && window.SequenceBuilder.state) { window.SequenceBuilder.state.stepsPage = Math.min(${totalPages}, window.SequenceBuilder.state.stepsPage + 1); if(window.SequenceBuilder.render) window.SequenceBuilder.render(); }">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"></polyline></svg>
        </button>
      </div>`) : '';

    const start = totalMembers === 0 ? 0 : Math.min(totalMembers, startIdx + 1);
    const end = totalMembers === 0 ? 0 : Math.min(totalMembers, startIdx + pageMembers.length);
    const summaryText = `Showing ${start}\u2013${end} of ${totalMembers} ${totalMembers === 1 ? 'contact' : 'contacts'}`;

    return `
      <div class="table-container">
        <div class="table-scroll">
          <table class="data-table" id="sequence-steps-table" aria-label="Sequence steps progress">
            <thead>
              <tr>
                <th>Contact</th>
                <th>Email</th>
                <th>Current Step</th>
                <th>Scheduled</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="4" style="text-align: center; padding: 40px; color: var(--grey-400);">No contacts in this sequence yet.</td></tr>'}
            </tbody>
          </table>
        </div>
        <div class="table-footer">
          <div class="pagination-summary" aria-live="polite">${summaryText}</div>
          ${paginationHtml}
        </div>
      </div>`;
  }

  async function render() {
    if (!state.currentSequence || !els.mainContent) return;

    const seq = state.currentSequence;
    // Expose ID globally for diagnostics
    window.currentSequenceId = seq.id;
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
          <div class="view-toggle" id="sequence-view-toggle">
            <button class="toggle-btn filter-tab ${state.currentView === 'builder' ? 'active' : ''}" data-view="builder" aria-selected="${state.currentView === 'builder' ? 'true' : 'false'}">Builder</button>
            <button class="toggle-btn filter-tab ${state.currentView === 'steps' ? 'active' : ''}" data-view="steps" aria-selected="${state.currentView === 'steps' ? 'true' : 'false'}">Steps</button>
          </div>
          <div class="contact-search-container">
            <input type="text" id="contact-search-input" class="search-input-small" placeholder="Search contacts to add..." aria-label="Search contacts to add to sequence" />
            <div class="contact-search-results" id="contact-search-results" hidden></div>
          </div>
          ${state.currentView === 'steps' ? `<button class="quick-action-btn list-header-btn" id="refresh-steps-btn" aria-label="Refresh steps" title="Refresh progress">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
          </button>` : ''}
          <button class="quick-action-btn list-header-btn" id="contacts-btn" aria-label="Sequence Contacts" title="Sequence Contacts" aria-haspopup="dialog">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </button>
          <button class="btn-primary" id="add-step-btn">Add Step</button>
        </div>
      </div>`;

    // Body content: check current view
    let bodyHtml = '';
    if (state.currentView === 'steps') {
      // Render steps view (contact progress)
      bodyHtml = await renderStepsView();
    } else {
      // Render builder view (sequence steps editor)
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
    }

    // Replace header
    const pageContainer = els.page ? els.page.querySelector('.page-container') : null;
    const pageHeader = pageContainer ? pageContainer.querySelector('.page-header') : null;
    const headerWrap = document.createElement('div');
    headerWrap.innerHTML = headerHtml;
    const headerEl = headerWrap.firstElementChild;
    if (pageHeader && headerEl) {
      pageHeader.id = 'sequence-builder-header';
      pageHeader.classList.add('page-header');
      pageHeader.innerHTML = headerEl.innerHTML;
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
    
    // Initialize pagination for steps view
    if (state.currentView === 'steps') {
      const paginationEl = document.getElementById('sequence-steps-pagination');
      if (paginationEl && window.crm && window.crm.createPagination) {
        const totalPages = Math.max(1, Math.ceil((state.stepsTotalCount || state.stepsLoadedMembers.length || 0) / state.stepsPageSize));
        window.crm.createPagination(state.stepsPage, totalPages, async (page) => {
          console.log(`[StepsView] Pagination: navigating to page ${page}, current loaded: ${state.stepsLoadedMembers.length}, total: ${state.stepsTotalCount}`);
          
          // Set the page BEFORE loading/rendering
          state.stepsPage = page;
          
          // Check if we need to load more data for this page
          const pageStartIdx = (page - 1) * state.stepsPageSize;
          const pageEndIdx = pageStartIdx + state.stepsPageSize;
          
          // Load more if we don't have enough data for this page
          if (pageStartIdx >= state.stepsLoadedMembers.length && state.stepsHasMore && state.currentSequence) {
            console.log(`[StepsView] Need to load more data for page ${page}, pageStartIdx=${pageStartIdx}, loaded=${state.stepsLoadedMembers.length}`);
            // Load pages until we have enough
            while (state.stepsLoadedMembers.length < pageEndIdx && state.stepsHasMore) {
              const nextPageToLoad = Math.floor(state.stepsLoadedMembers.length / state.stepsPageSize) + 1;
              console.log(`[StepsView] Loading page ${nextPageToLoad}...`);
              await loadSequenceMembersPage(state.currentSequence.id, nextPageToLoad, false);
            }
          }
          
          // Re-render with the new page
          await render();
          
          // Scroll to top after page change
          requestAnimationFrame(() => {
            const scroller = document.querySelector('#sequence-builder-page .table-scroll');
            if (scroller) scroller.scrollTop = 0;
            window.scrollTo(0, 0);
          });
        }, paginationEl.id);
      }
      
      // Note: Contact name click handler is set up in attachEvents() using document-level delegation
    }

    // Mark all step bodies as initially rendered (no animation on first load)
    setTimeout(() => {
      const container = document.getElementById('sequence-builder-view');
      if (container) {
        container.querySelectorAll('.step-body').forEach(body => {
          body.dataset.initialRender = 'true';
        });
      }
    }, 100);
  }

  function handleAddStep(type, label) {
    try {
      if (!state.currentSequence.steps) state.currentSequence.steps = [];
      const id = 'step-' + Date.now();
      // Add position field to maintain explicit order
      const position = state.currentSequence.steps.length;
      const base = { id, type, label, createdAt: Date.now(), collapsed: false, paused: false, position };
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
    overlay.className = 'modal-overlay modal-overlay--animated';
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

    const close = () => {
      // Start exit animation
      overlay.classList.remove('show');
      // Remove after animation completes
      setTimeout(() => {
        if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
      }, 300); // Match CSS transition duration
    };
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || (e.target.classList && e.target.classList.contains('close-btn'))) close();
    });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    
    // Attach listeners for options
    overlay.querySelectorAll('.step-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');
        const labelEl = btn.querySelector('.label');
        const label = labelEl ? labelEl.textContent.trim() : type;
        try { onSelect({ type, label }); } catch (_) { /* noop */ }
        close();
      });
    });
    
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
      try { if (prevActive && typeof prevActive.focus === 'function') prevActive.focus(); } catch (_) { }
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

        // Notify sequences list / background loader so counts stay in sync
        try {
          if (window.BackgroundSequencesLoader && typeof window.BackgroundSequencesLoader.reload === 'function') {
            window.BackgroundSequencesLoader.reload();
          }
        } catch (_) {
          // Non-fatal; sequences list will eventually refresh on next visit
        }
      };

      const viewOne = (id) => {
        if (!id) return;
        // Navigate to People then open ContactDetail
        try { window.crm && window.crm.navigateToPage && window.crm.navigateToPage('people'); } catch (_) { }
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
      if (confirm) confirm.addEventListener('click', () => { try { onConfirm && onConfirm(); } catch (_) { } close(); });
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
    } catch (_) { }

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
    try { anchorEl.setAttribute('aria-expanded', 'true'); } catch (_) { }

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
      try { anchorEl.setAttribute('aria-expanded', 'false'); } catch (_) { }
      try {
        pop.classList.add('closing');
        const removeNow = () => { try { pop.remove(); } catch (_) { } };
        pop.addEventListener('animationend', removeNow, { once: true });
        setTimeout(removeNow, 180);
      } catch (_) {
        try { pop.remove(); } catch (_) { }
      }
    }
    // Expose cleanup for external toggles
    try { pop._cleanup = cleanup; } catch (_) { }
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
    // IMPORTANT: Respect the in-memory order of steps.
    // We now treat state.currentSequence.steps as the single source of truth for ordering.
    // Drag-and-drop and initial normalization (in show()) already keep this array ordered,
    // so we should not resort here – otherwise steps can appear to "jump" when re-rendering.
    const sortedSteps = Array.isArray(steps) ? steps.slice() : [];

    try {
      console.log('[SequenceBuilder] renderSteps order:', sortedSteps.map((s, idx) => ({
        idx,
        id: s.id,
        label: s.label,
        position: s.position
      })));
    } catch (_) {
      // Logging is best-effort only
    }

    const out = [];
    sortedSteps.forEach((step, idx) => {
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
                <button class="toggle-btn${composeMode === 'manual' ? ' active' : ''}" data-mode="manual" aria-selected="${composeMode === 'manual'}" title="Manual compose">Manual</button>
                <button class="toggle-btn${composeMode === 'ai' ? ' active' : ''}" data-mode="ai" aria-selected="${composeMode === 'ai'}" title="AI compose">AI</button>
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
                <input type="text" class="input-dark preview-contact-input" placeholder="Search contact for preview..." value="${escapeHtml(selContact?.full_name || selContact?.fullName || selContact?.name || ((selContact?.firstName || '') + ' ' + (selContact?.lastName || '')).trim() || 'Unnamed Contact')}" aria-label="Search contact for preview" />
                <div class="preview-results" role="listbox" aria-label="Contact results"></div>
              </div>
            </div>
            <!-- Editor toolbar: hidden in AI mode -->
            ${composeMode === 'ai' ? '' : `
            <div class="editor-toolbar" role="toolbar" aria-label="Email editor actions">
              <button class="toolbar-btn editor-only-btn" type="button" data-action="formatting" aria-label="Text formatting" ${htmlMode ? 'disabled aria-disabled="true"' : ''}>${svgTextTitleIcon()}</button>
              <button class="toolbar-btn editor-only-btn" type="button" data-action="link" aria-label="Insert link">${svgChain()}</button>
              <button class="toolbar-btn editor-only-btn" type="button" data-action="image" aria-label="Upload image">${svgImageIcon()}</button>
              <button class="toolbar-btn editor-only-btn" type="button" data-action="attach" aria-label="Attach files">${svgPaperclip()}</button>
              <button class="toolbar-btn editor-only-btn${htmlMode ? ' active' : ''}" type="button" data-action="code" aria-label="Edit raw HTML" aria-pressed="${htmlMode}">${svgCodeBrackets()}</button>
              <button class="toolbar-btn editor-only-btn" type="button" data-action="templates" aria-label="Load templates">${svgDoc()}</button>
              <button class="toolbar-btn editor-only-btn" type="button" data-action="variables" aria-label="Add dynamic variables">${svgBraces()}</button>
            </div>`}
            ${composeMode === 'ai' ? '' : (htmlMode ? '' : renderFormattingBar())}
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
                ${composeMode === 'ai' ? `
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
                ${composeMode === 'ai' ? `
                <div class="ai-compose">
                  <div class="ai-bar open" aria-hidden="false" style="margin-bottom:12px;">
                    <div class="ai-inner">
                      <div class="ai-row">
                        <textarea class="ai-prompt input-dark" rows="3" placeholder="Describe the email you want... (tone, goal, offer, CTA)">${escapeHtml(step.data?.aiPrompt || '')}</textarea>
                      </div>
                      <div class="ai-row suggestions" role="list">
                        <button class="ai-suggestion" type="button" 
                          data-prompt-template="first-email-intro"
                          data-cta-variant="true">First email introduction</button>
                        <button class="ai-suggestion" type="button" 
                          data-prompt-template="follow-up-value">Follow-up #1 - Value Add (No Response)</button>
                        <button class="ai-suggestion" type="button" 
                          data-prompt-template="follow-up-curiosity">Follow-up #2 - Curiosity Angle</button>
                        <button class="ai-suggestion" type="button" 
                          data-prompt-template="nurture-value">Nurture - Industry Insight</button>
                        <button class="ai-suggestion" type="button" 
                          data-prompt-template="post-convo-recap">Post-Call Recap & Next Steps</button>
                        <button class="ai-suggestion" type="button" 
                          data-prompt-template="info-request-bill">Request - Bill/Energy Data</button>
                        <button class="ai-suggestion" type="button" 
                          data-prompt-template="final-ask-close">Final Close - Strong Ask</button>
                        <button class="ai-suggestion" type="button" 
                          data-prompt-template="objection-all-set">Response - "We're All Set"</button>
                        <button class="ai-suggestion" type="button" 
                          data-prompt-template="objection-interested">Response - They Show Interest</button>
                        <button class="ai-suggestion" type="button" 
                          data-prompt-template="objection-not-interested">Response - Not Interested</button>
                        <button class="ai-suggestion" type="button" 
                          data-prompt-template="breakup-email">Breakup - Last Chance</button>
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
                    <div class="preview-body">${(step.data?.aiOutput?.html) || (previewBodyHtml || '(empty)')}${getSignatureForPreview(step, isAuto)}</div>
                  </div>
                  <div class="ai-footbar" style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:10px;">
                    <div class="status-pill" aria-live="polite" style="font-size:12px; color: var(--text-secondary);">
                      ${step.data?.aiStatus === 'saved' && step.data?.savedAt
            ? `SAVED at ${new Date(step.data.savedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
            : escapeHtml((step.data?.aiStatus || 'draft').toUpperCase())}
                    </div>
                    <div>
                      <button class="btn-primary ai-save-to-step" ${(step.data?.aiStatus === 'generated' || step.data?.aiStatus === 'draft' || step.data?.aiOutput) ? '' : 'disabled'}>Save to step</button>
                    </div>
                  </div>
                </div>
                ` : `
                <div class="email-preview">
                  <div class="preview-subject">${previewSubject || '(no subject)'}</div>
                  <div class="preview-body">${previewBodyHtml || '(empty)'}${getSignatureForPreview(step, isAuto)}</div>
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

  // ========== COLD EMAIL CTA VARIANTS ==========
  // Multiple call-to-action options for first email introductions
  // System randomly selects one per generation based on role
  const COLD_EMAIL_CTA_VARIANTS = [
    {
      id: 'direct-question',
      text: 'When does your current contract renew? And how often do you typically review your rates?',
      role: 'all'
    },
    {
      id: 'discovery-question',
      text: 'Out of curiosity—when you renew your contract, do you shop around or just renew what you had?',
      role: 'all'
    },
    {
      id: 'timing-insight',
      text: 'Quick question—are you locking in 6 months early or waiting closer to renewal?',
      role: 'all'
    },
    {
      id: 'timeline-risk',
      text: 'Question for you—what\'s your renewal timeline? That timing difference is usually worth 15-20%.',
      role: 'finance'
    },
    {
      id: 'problem-validation',
      text: 'Real question—does energy cost predictability matter for your budget planning?',
      role: 'finance'
    }
  ];

  // Get a random CTA based on role (all = show all, finance = show finance + all)
  function getRandomCTA(role = 'all') {
    const filtered = COLD_EMAIL_CTA_VARIANTS.filter(cta =>
      cta.role === 'all' || cta.role === role
    );
    if (filtered.length === 0) return COLD_EMAIL_CTA_VARIANTS[0].text;
    const random = filtered[Math.floor(Math.random() * filtered.length)];
    return random.text;
  }

  // ========== FOLLOW-UP CTA VARIANTS ==========

  // CTA variants for Follow-up #1 (Value Add - No Response)
  const FOLLOWUP_CTA_VARIANTS_STEP2 = [
    {
      id: 'competitive-review',
      text: 'How often do you review if you\'re still competitive?',
      role: 'all'
    },
    {
      id: 'problem-frustration',
      text: 'What\'s been the most frustrating part about energy procurement?',
      role: 'all'
    },
    {
      id: 'lock-in-timing',
      text: 'Are you planning to lock in rates this quarter or wait?',
      role: 'controller'
    },
    {
      id: 'peer-reference',
      text: 'I\'ve seen companies like yours do [X]—worth exploring?',
      role: 'all'
    },
    {
      id: 'decision-process',
      text: 'When you renew, do you typically shop 6 months early or wait?',
      role: 'all'
    },
    {
      id: 'budget-planning',
      text: 'How does energy cost predictability factor into your budget planning?',
      role: 'finance'
    }
  ];

  // CTA variants for Follow-up #2 (Curiosity Angle)
  const FOLLOWUP_CTA_VARIANTS_STEP3 = [
    {
      id: 'timing-question',
      text: 'Quick question—when you renew, do you shop 6 months early?',
      role: 'all'
    },
    {
      id: 'values-question',
      text: 'What would matter most in a new supplier?',
      role: 'all'
    },
    {
      id: 'discovery-question',
      text: 'Have you ever done a rate comparison?',
      role: 'all'
    },
    {
      id: 'future-focused',
      text: 'How are you thinking about the upcoming renewal?',
      role: 'all'
    },
    {
      id: 'process-question',
      text: 'How do you typically evaluate suppliers when shopping?',
      role: 'all'
    },
    {
      id: 'budget-question',
      text: 'Does rate lock timing affect your budget planning?',
      role: 'finance'
    }
  ];

  // Get random CTA for follow-up #1
  function getRandomFollowUpCTA1(role = 'all') {
    const filtered = FOLLOWUP_CTA_VARIANTS_STEP2.filter(cta =>
      cta.role === 'all' || cta.role === role
    );
    if (filtered.length === 0) return FOLLOWUP_CTA_VARIANTS_STEP2[0].text;
    const random = filtered[Math.floor(Math.random() * filtered.length)];
    return random.text;
  }

  // Get random CTA for follow-up #2
  function getRandomFollowUpCTA2(role = 'all') {
    const filtered = FOLLOWUP_CTA_VARIANTS_STEP3.filter(cta =>
      cta.role === 'all' || cta.role === role
    );
    if (filtered.length === 0) return FOLLOWUP_CTA_VARIANTS_STEP3[0].text;
    const random = filtered[Math.floor(Math.random() * filtered.length)];
    return random.text;
  }

  // Build improved first email introduction prompt with dynamic CTA
  function buildFirstEmailIntroPrompt(ctaVariant = true, role = 'all') {
    // Note: ctaVariant and role parameters kept for backward compatibility but not used
    // The system now automatically handles angle-based CTAs in the backend

    return `Write a cold introduction email that MUST:

1. GREETING (RANDOMIZE FOR VARIETY)
   - RANDOMLY choose ONE of these greetings:
     * "Hi [contact_first_name],"
     * "Hey [contact_first_name],"
     * "Hello [contact_first_name],"
   - DO NOT use "Hi [contact_first_name] there," or add extra words

2. OPEN WITH OBSERVATION (CRITICAL - MUST USE RESEARCH)
   - YOU MUST reference something SPECIFIC about [contact_company] that proves you researched them
   - REQUIRED: Include at least ONE of these research elements:
     * Location/facility details: "I noticed [contact_company] operates in [city], [state]..."
     * Recent activity from LinkedIn: "I saw [contact_company] recently..." (if [contact_linkedin_recent_activity] available)
     * Website insight: "On your website, I noticed..." (if [company_website] available)
     * Industry pattern with peer context: "I've been talking to [role]s across [state], and..."
   - NEVER: "I hope you're well" or "I wanted to reach out" or "I hope this email finds you well"
   - MUST: Prove you researched - include specific details (location, facility size, operations type, operational model)

3. ACKNOWLEDGE THEIR SITUATION (ROLE-SPECIFIC)
   - For [contact_job_title]: Show you understand what they actually deal with daily
   - For [company_industry]: Reference industry-specific pain points naturally (not generic)
   - Use their role language (CFOs care about predictability/budgets, Operations care about uptime/reliability)
   - Make it about THEM, not about us (don't lead with "We help...")

4. ONE INSIGHT (SPECIFIC, NOT GENERIC) + ONE REAL PAIN SCENARIO
   - Provide ONE concrete observation about why this matters to them NOW
   - Use SPECIFIC numbers and timing: "6 months early = 15-20% savings" NOT "thousands annually"
   - NOT: "Companies save 10-20%" (too generic)
   - YES: "With 4 facilities in Texas, timing is critical - locking in 6 months out vs 90 days is usually 15-20% difference"
   - Include timing context: early renewal (6 months) vs late (90 days) = money difference
   - CRITICAL: Mention the 15-20% savings figure ONLY ONCE in the entire email - do not repeat it multiple times
   
   - PAIN LANE (TIE TO TIMING): Use ONE real scenario such as:
     * Bills doubling on renewal (e.g., going from $800k/year to $1.6M)
     * Confusing line items/riders on bills that hide negotiable costs
     * Wrong contract type causing high delivery charges
   - Explain how locking in 6 months early can prevent bill shocks like a customer going from $800k to $1.6M on renewal
   - Keep it factual and calm: "I'm seeing a lot of contracts renewing 2x higher than the last term, and teams are scrambling to figure out why" (GOOD)
   - NOT: "If you don't fix this now, you'll get crushed" (BAD - too fear-based)
   - Tie pain to timing: One sentence hinting at real pain + one sentence showing timing is how smart teams avoid that outcome

5. TONE REQUIREMENTS (YOUR VOICE - 29-YEAR-OLD TEXAS BUSINESS PRO)
   - Write like a peer, not a salesperson (conversational, confident, direct)
   - Use contractions: "we're," "don't," "it's," "you're," "I'm"
   - Vary sentence length: Short. Medium sentence. Longer explanation when needed.
   - AVOID corporate jargon: "stabilize expenses," "leverage," "optimize," "streamline," "unleash," "synergy," "dive into," "solution," "at Power Choosers"
   - Sound like: colleague who knows their industry and has talked to others like them
   - Use casual confidence: "Quick question—" "Real question—" "Out of curiosity—"
   - NO: "Would you be open to..." (permission-based, weak)
   - YES: Ask specific questions that assume conversation is happening

6. CALL TO ACTION (AUTOMATIC - SYSTEM HANDLES THIS)
   - CRITICAL: The system automatically generates angle-specific CTAs based on the contact's industry and selected angle
   - You do NOT need to write a CTA - the system will use the angle's opening question as the foundation
   - Each angle has a built-in structure: [Opening Question] + [Value/Statistic] + [Low-friction closing question]
   - Examples of angle-based CTAs the system will use:
     * Timing Strategy: "When does your current electricity contract expire? Worth a 10-minute look?"
     * Exemption Recovery: "Are you currently claiming electricity exemptions? Most manufacturers leave $75K-$500K on the table. Worth exploring?"
     * Consolidation: "How many locations are you managing energy for? Consolidating contracts typically means 15-25% savings. Worth a look?"
   - The system will automatically select and format the appropriate CTA - you don't need to specify one
   - DO NOT use old CTAs like "If you ever want a second opinion" - the system handles this automatically

7. SUBJECT LINE (SPECIFIC, NOT VAGUE - PERPLEXITY HAS CREATIVE CONTROL)
   - The system will automatically generate angle-specific subject lines
   - Each angle inspires unique subject variations (e.g., timing_strategy → "when does your contract expire?")
   - MUST be specific to their role and the selected angle
   - Examples: "[FirstName], when does your contract expire?" or "[FirstName], are you claiming exemptions?"
   - NOT generic: "thoughts on energy planning" or "insight to ease costs" or "thoughts on energy strategy"
   - Focus on: contract renewal, rate lock timing, budget cycle, facility renewal, exemptions, consolidation
   - The system will create unique, angle-specific subjects automatically

8. FORMAT
   - 100-130 words max (scannable, not overwhelming)
   - 2-3 short paragraphs (break up visually)
   - Scannable on mobile (short lines, clear breaks)
   - One CTA at end (automatically generated by the system based on the selected angle)

9. PERSONALIZATION
   - Include [contact_first_name] naturally in randomized greeting
   - Reference [company_name] specifically (not "your company")
   - For [company_industry], use industry-specific language naturally
   - Reference location if available ([city], [state]) for regional context

10. PROOF OF RESEARCH
   - Include at least ONE specific detail that proves you researched (not just role description)
   - Examples: "4 locations across Texas," "24/7 operations," "both electricity and natural gas"
   - This makes you stand out from generic templates

ABSOLUTELY AVOID sounding like ChatGPT or a generic email template. You should sound like their peer—a 29-year-old Texas business pro who knows the industry and has talked to others in their situation. Be conversational, confident, and direct.

GUARDRAILS (AVOID FAKE FEAR):
- Only mention scenarios that are typical and believable for companies like [contact_company]. No exaggerated worst-case fear.
- Describe pains as things you're seeing in the market right now, not predictions or threats.
- No language like "you'll get crushed" or "you're in trouble"; use calm, factual language about stress, budget pressure, and surprises on bills.
- GOOD EXAMPLE: "I'm seeing a lot of contracts renewing 2x higher than the last term, and teams are scrambling to figure out why."
- BAD EXAMPLE: "If you don't fix this now, you'll get crushed by your energy bills."`;
  }

  // ========== FOLLOW-UP PROMPT BUILDERS ==========

  function buildFollowUpValuePrompt(ctaVariant = true, role = 'all', previousAngleId = null, selectedAngle = null, emailPosition = 2) {
    // Note: The system automatically handles angle rotation and CTA escalation in the backend
    // These parameters are for future use when we implement full angle tracking

    return `Write Follow-Up Email #2 (DAY 2 - VALUE ADD WITH ANGLE ROTATION):

CONTEXT: This is 2 days after the intro email. They haven't responded. This is Email #2 in the sequence.

CRITICAL ANGLE ROTATION RULE:
- The system will automatically select a DIFFERENT angle than Email #1
- DO NOT repeat the angle from Email #1 - use the new angle provided by the system
- Each angle has a unique opening question and value proposition
- The system ensures angle diversity across the sequence

FRAMEWORK (2025 Best Practice - Day 2 Follow-Up):
1. GREETING (RANDOMIZE): Use "Hi [contact_first_name]," OR "Hey [contact_first_name]," OR "Hello [contact_first_name],"

2. REFERENCE EMAIL 1 + INTRODUCE NEW ANGLE:
   - CRITICAL: You MUST reference Email #1 naturally in the opening
   - Use angle-aware transitions based on the previous angle:
     * If Email 1 was timing_strategy: "On that timing question—there's another factor: [new angle]"
     * If Email 1 was exemption_recovery: "Beyond exemptions—[new angle] is equally critical"
     * If Email 1 was consolidation: "On consolidation—[new angle] is the next lever"
   - Then introduce the NEW angle with specific insight
   - Make it feel like a natural conversation continuation, not a cold email #2

3. NEW VALUE/INSIGHT (ANGLE-SPECIFIC) + PAIN EXAMPLE:
   - Share ONE new insight specific to the NEW angle (NOT generic)
   - Use the angle's opening question and value proposition from the system
   - Include ONE specific example of what happens when this angle is ignored:
     * Timing: Bills doubling on renewal (e.g., $800k to $1.6M)
     * Consolidation: Fragmented contracts causing chaos
     * Exemptions: $75K-$500K left on the table
   - Then contrast with what happens when teams address this angle proactively
   - Use angle-specific language and statistics

4. MEDIUM-STRENGTH CTA (ESCALATION FROM EMAIL 1):
   - Email 1 used: Soft discovery question (e.g., "Worth a 10-minute look?")
   - Email 2 should use: Medium-strength ask (e.g., "Can I pull a quick analysis for you?")
   - Structure: Reference previous + Value + Medium ask
   - DO NOT use the same CTA as Email 1
   - DO NOT use one-word CTAs like "Interested?" (that's for Email 3)
   - The system will provide the appropriate CTA based on the selected angle

5. SUBJECT LINE (MUST BE DIFFERENT FROM EMAIL 1):
   - Email 1 used: "[FirstName], [angle] question?"
   - Email 2 should use: "re: [previous angle keyword]—[new angle keyword]"
   - Example: "re: contract timing—consolidation question"
   - Use "re:" prefix to show continuation
   - MUST be unique from Email 1's subject

KEY DIFFERENCES FROM INTRO:
- SHORTER: 70-100 words (slightly shorter than intro, but longer than Email 3)
- NEW ANGLE: Must use a different angle than Email 1
- REFERENCE EMAIL 1: Must acknowledge the previous email naturally
- MEDIUM CTA: Stronger than Email 1, but not as strong as Email 3
- CONVERSATION CONTINUATION: Feels like ongoing dialogue, not cold email

TONE: 29-year-old Texas professional, genuinely helpful, peer-to-peer, conversational continuation

AVOID:
- "Didn't see my last email..." (too defensive)
- "Just checking in..." (too generic)
- "Wanted to follow up" (too salesy)
- Repeating Email 1's exact angle or content
- Using the same subject line as Email 1
- One-word CTAs ("Interested?", "Thoughts?")

LENGTH: 70-100 words max
PURPOSE: Continue conversation with new angle, escalate engagement

GUARDRAILS (AVOID FAKE FEAR):
- Only mention scenarios that are typical and believable for companies like [contact_company]. No exaggerated worst-case fear.
- Describe pains as things you're seeing in the market right now, not predictions or threats.
- No language like "you'll get crushed" or "you're in trouble"; use calm, factual language about stress, budget pressure, and surprises on bills.
- GOOD EXAMPLE: "I'm seeing a lot of contracts renewing 2x higher than the last term, and teams are scrambling to figure out why."
- BAD EXAMPLE: "If you don't fix this now, you'll get crushed by your energy bills."

ANGLE TRANSITION EXAMPLES:
- Email 1 (timing_strategy) → Email 2 (consolidation): "On that timing question—there's another factor: consolidating across your sites could add another 15% savings."
- Email 1 (exemption_recovery) → Email 2 (timing_strategy): "Beyond exemptions—renewal timing is equally critical. Teams that lock in 6 months early avoid the 10-20% increases we're seeing."
- Email 1 (consolidation) → Email 2 (demand_efficiency): "On consolidation—demand charge optimization is the next lever. Most teams can reduce demand charges by 12-20% before even renewing rates."`;
  }

  function buildFollowUpCuriosityPrompt(ctaVariant = true, role = 'all', angle1Id = null, angle2Id = null, selectedAngle = null, emailPosition = 3) {
    // Note: The system automatically handles angle rotation and CTA escalation in the backend
    // These parameters are for future use when we implement full angle tracking

    return `Write Follow-Up Email #3 (DAY 5 - FINAL ASK WITH URGENCY):

CONTEXT: This is 5 days after intro, 3 days after Email #2. Still no response. This is Email #3 (FINAL email before pause).

CRITICAL ANGLE ROTATION RULE:
- The system will automatically select a DIFFERENT angle than Emails #1 and #2
- DO NOT repeat angles from Email #1 or Email #2
- This is the final email - use urgency and specific time commitment
- The system ensures all 3 emails use different angles

FRAMEWORK (2025 Best Practice - Day 5 Final Follow-Up):
1. GREETING (RANDOMIZE): Use "Hi [contact_first_name]," OR "Hey [contact_first_name]," OR "Hello [contact_first_name],"

2. URGENCY + REFERENCE PREVIOUS EMAILS:
   - CRITICAL: Create urgency around timing (rate lock windows, renewal deadlines)
   - Reference that this is your final attempt before pausing
   - Acknowledge the previous emails naturally:
     * "I've sent a couple notes on [angle1] and [angle2]..."
     * "Following up on the timing and consolidation angles I raised..."
   - Make it feel like a final, respectful attempt, not aggressive

3. CONSOLIDATE VALUE + NEW ANGLE:
   - Briefly reference what you've covered:
     * "[Angle1 insight]"
     * "[Angle2 insight]"
     * "[Angle3 insight] - NEW for this email"
   - Keep it concise - this is the SHORTEST email of the 3
   - Focus on the NEW angle (Angle 3) with specific insight
   - Use urgency language: "rate lock windows tightening", "renewal deadlines approaching"

4. HARD ASK CTA (STRONGEST OF ALL 3):
   - Email 1 used: Soft discovery question
   - Email 2 used: Medium-strength ask
   - Email 3 should use: HARD ask with specific time options
   - Structure: "I can do [Day] [Time] or [Day] [Time] for a 10-minute analysis."
   - Include alternative close: "If neither works, when are you available?"
   - DO NOT use one-word CTAs like "Interested?" (too weak for final email)
   - DO NOT use permission-based language ("Would you be open to...")
   - The system will provide time options based on meeting preferences

5. SUBJECT LINE (URGENCY + DIFFERENT FROM EMAILS 1-2):
   - Email 1 used: "[FirstName], [angle] question?"
   - Email 2 used: "re: [angle1]—[angle2]"
   - Email 3 should use: "Last attempt—[urgency message]"
   - Examples:
     * "Last attempt—rate lock window closing"
     * "Final note—renewal timing window"
     * "One last thought—rate timing"
   - MUST be unique from Emails 1-2
   - Create urgency without being pushy

KEY DIFFERENCES FROM EMAILS 1-2:
- SHORTEST: 60-80 words (urgency requires brevity)
- NEW ANGLE: Must use a different angle than Emails 1-2
- URGENCY: Reference timing windows, deadlines, market conditions
- HARD CTA: Specific time options, not vague questions
- FINAL ATTEMPT: Acknowledge this is the last email before pause
- CONSOLIDATION: Briefly reference all 3 angles covered

TONE: Respectful urgency, peer-to-peer, final attempt (not aggressive)

AVOID:
- "Just wanted to follow up again..." (too weak)
- One-word CTAs ("Interested?", "Thoughts?") - too weak for final email
- Repeating exact content from Emails 1-2
- Using the same subject line as Emails 1-2
- Being pushy or aggressive (respectful urgency, not desperation)
- Permission-based language ("Would you be open to...")

LENGTH: 60-80 words max (SHORTEST of all 3 emails)
PURPOSE: Final attempt with urgency, consolidate value, hard ask with time options

GUARDRAILS (AVOID FAKE FEAR):
- Only mention scenarios that are typical and believable for companies like [contact_company]. No exaggerated worst-case fear.
- Describe pains as things you're seeing in the market right now, not predictions or threats.
- No language like "you'll get crushed" or "you're in trouble"; use calm, factual language about stress, budget pressure, and surprises on bills.
- GOOD EXAMPLE: "Rate lock windows are tightening by end of month. I'm seeing teams that wait lose 10-20% on renewals."
- BAD EXAMPLE: "If you don't fix this now, you'll get crushed by your energy bills."

FINAL EMAIL STRUCTURE:
Paragraph 1 (Urgency + Reference):
"[FirstName], rate lock windows are tightening by end of this month.

I've sent a couple notes on [angle1] and [angle2]. Here's one more angle: [angle3]."

Paragraph 2 (Value + Hard Ask):
"I can do a quick 10-minute analysis covering all three angles:
• [Angle1 insight]
• [Angle2 insight]
• [Angle3 insight]

Can you do Thursday 2-3pm or Friday 10-11am? If not, when works better?"

CRITICAL: This is the FINAL email. Make it count with urgency, value consolidation, and a hard ask.`;
  }

  function buildNurtureValuePrompt() {
    return `Write a nurture email focused on STAYING TOP-OF-MIND with genuine value.

KEY PRINCIPLE: This is NOT a sales email. This is "I'm sharing something useful" email.

STRUCTURE:
1. NO SUBJECT CHANGE - reference previous conversation naturally
2. SHORT INTRO - 1 sentence
3. INSIGHT OR RESOURCE - share 1 valuable thing (stat, article, case study, tip)
4. WHY IT MATTERS - 1 sentence on why this is relevant to THEM specifically
5. SOFT TOUCH - "thought you'd want to see this" or "saw this and thought of your situation"
6. LIGHT CTA - "let me know if this sparks ideas" or "happy to discuss if you want"

VALUE IDEAS:
- Market data: "X% of companies in [industry] facing Y trend"
- Case study: "Company similar to yours handled this by..."
- Stat: "Latest research shows [relevant finding]"
- Tip: "One thing I've noticed with companies like yours..."
- Article: "Came across this, thought it might be useful"

FOR ENERGY INDUSTRY:
- Share Q4 energy market trends
- Reference upcoming contract renewal season timing
- Share budget planning insight
- Mention industry rate changes

TONE: Helpful professional, not salesy

EMAIL DETAILS:
- To: [contact_name] at [company_name]
- Industry: [company_industry]

LENGTH: 50-75 words max`;
  }

  function buildPostConvoRecapPrompt() {
    return `Write a follow-up email AFTER a phone conversation.

This is NOT cold anymore. You've talked. Now document and move forward.

STRUCTURE:
1. WARM OPENING - thank them for their time, mention something specific they said
2. RECAP - 2-3 sentences summarizing what you discussed (shows you were listening)
3. KEY TAKEAWAYS - bullet the 2-3 main problems/needs they shared
4. YOUR THINKING - 1 sentence on how you could help
5. NEXT STEPS - SPECIFIC: "I'll send [X by date]" or "Let's [ask] by [date]"
6. CLOSING - low pressure, confident

RECAP EXAMPLE:
"Thanks for the call this morning. I really appreciated how you broke down the timing challenge—especially the part about renewals hitting during peak season."

KEY TAKEAWAYS (bullet format):
- Need: Lock in rates earlier to avoid peak-season markup
- Challenge: Current supplier doesn't give visibility until 60 days out
- Goal: Simplify process so you're not scrambling

NEXT STEPS OPTIONS:
- "I'll send you a breakdown of how timing affects savings by Friday"
- "Let's schedule 20 min next week to walk through market options"
- "I'll pull market data specific to your facilities and send Tuesday"

TONE: Grateful, professional, action-oriented

EMAIL DETAILS:
- To: [contact_name] at [company_name]

LENGTH: 80-120 words max`;
  }

  function buildInfoRequestBillPrompt() {
    return `Write an email requesting a recent energy bill copy.

KEY PRINCIPLE: Make it EASY and LOW-PRESSURE. You need ONE recent bill from the last 6 months to show real savings.

STRUCTURE:
1. WARM REFERENCE - mention recent conversation naturally
2. PURPOSE - explain why you need this (analysis, comparison quotes, etc.)
3. REASSURANCE - address concerns: "just for analysis," "confidential," "no commitment"
4. MAKE IT EASY - tell them EXACTLY what to send (ONE recent bill from last 6 months)
5. OPTIONAL PICKUP - ONLY offer pickup if account location is Fort Worth, TX or Dallas, TX (check [account_city] and [account_state])
6. DEADLINE - specific date ("by EOD Thursday") not vague
7. CLOSING - friendly, low pressure

PURPOSE OPTIONS:
- "So I can analyze current rates and show competitive quotes"
- "To run with other suppliers and get actual comparison numbers"
- "So we can identify quick wins specific to your usage"

MAKE IT EASY:
- "Just forward ONE recent bill from the last 6 months"
- "Can be PDF, image, or whatever's easiest"
- "Takes 2 minutes to scan and send"
- ONLY IF LOCATION IS FORT WORTH OR DALLAS, TX: "Or if easier, I can arrange to pick it up [specific day/time]"

IMPORTANT PICKUP RULES:
- Check [account_city] and [account_state] from account information
- ONLY offer pickup if: ([account_city] contains "Fort Worth" OR "Dallas") AND [account_state] is "TX" or "Texas"
- If NOT in Fort Worth/Dallas, TX: DO NOT mention pickup at all
- If pickup is offered, be specific: "I can arrange to pick it up [specific day] afternoon"

REASSURANCE:
- "This is just for analysis—no commitment"
- "Data kept completely confidential"
- "Just comparing against current market rates"

TONE: Low pressure, professional, helpful

EMAIL DETAILS:
- To: [contact_name] at [company_name]
- Account Location: [account_city], [account_state] (use this to determine if pickup offer applies)

LENGTH: 80-100 words max`;
  }

  function buildFinalAskClosePrompt() {
    return `Write a closing email with a clear, strong call-to-action.

KEY PRINCIPLE: Move from exploration to decision. Be confident and specific.

STRUCTURE:
1. CONTEXT REMINDER - briefly reference the journey
2. WHAT YOU'VE LEARNED - 1-2 sentences on their specific situation
3. YOUR RECOMMENDATION - state clearly what you suggest (not wishy-washy)
4. SPECIFIC VALUE - remind them of 1 key benefit/savings
5. CLEAR CTA - not "let me know," use specific action
6. TIMELINE - specific and urgent but realistic
7. BACKUP CTA - alternative if main one doesn't work

STRONG CTA EXAMPLES:
- "Here's what I need: Send me [X] and I'll have quotes by [DATE]"
- "Next step: Let's do 20 min [specific time] to walk through proposal"
- "I have competitive analysis ready. First step: Lock in [DATE] to review"
- "I'm confident we can get you [X benefit]. First step: [DATE] to review options"

AVOID (Weak CTAs):
- "Let me know if you want to proceed"
- "Would you be interested in discussing further?"
- "Feel free to reach out if you have questions"
- "We should probably talk next week"
VALUE REMINDER:
- 15-20% savings based on current market
- Locked-in rates = budget certainty
- Simplified process vs. current supplier
- Better terms because shopping early
TIMELINE:
- "I can have quotes by [SPECIFIC DATE]"
- "Let's schedule [SPECIFIC DAY/TIME], 30 min"
- "Decision needed by [DATE] to lock in window"

BACKUP CTA:
Always give one option back: "If [MAIN] doesn't work, [ALTERNATIVE]"

TONE: Confident, specific, not pushy. You know what should happen next.

EMAIL DETAILS:
- To: [contact_name] at [company_name]

LENGTH: 100-130 words max`;
  }

  // ========== OBJECTION HANDLING PROMPT BUILDERS ==========

  function buildObjectionAllSetPrompt() {
    return `Write an email response to a prospect who says "We're all set with our current supplier."

DO NOT:
- Challenge them or doubt them
- Go hard on sales
- Repeat your initial pitch

DO:
- Acknowledge their position positively
- Reframe to optimization/future-proofing
- Ask consultative question that makes them think
- Leave door open for future

STRUCTURE:
1. VALIDATION - "That's great you've got a setup that works"
2. OBSERVATION - "What I'm seeing this quarter though is..."
3. QUESTION - ask something about their process/decision-making
4. INSIGHT - 1 thing they might not be considering
5. SOFT OFFER - "Would it be worth a quick look?" or "Worth staying connected?"

QUESTION EXAMPLES:
- "How often do you review if your current rates are still competitive?"
- "When your contract renews, how far out do you typically start shopping?"
- "Does your current supplier give you transparency into market rates?"
- "Have you run a competitive analysis recently?"

INSIGHT EXAMPLES:
- "Most companies I talk to don't realize renewal timing costs them 15-20%"
- "Lock-in timing is when you actually save money—not just best price"
- "Your supplier probably doesn't tell you when rate changes are coming"

TONE: Respectful, consultative, peer-to-peer

GOAL: Keep relationship alive, position for future renewal when they DO shop

EMAIL DETAILS:
- To: [contact_name] at [company_name]
- Role: [contact_job_title]

LENGTH: 70-100 words max`;
  }

  function buildObjectionInterestedPrompt() {
    return `Write an email response to a prospect showing genuine interest (asked questions, wants more info).

THIS IS HIGH INTENT - move fast but stay professional.

STRUCTURE:
1. ENTHUSIASM - acknowledge their interest (not over the top)
2. ANSWER - directly address their question/request
3. PROVIDE WHAT THEY ASKED FOR - specific, useful
4. NEXT STEP - move toward conversation or information exchange
5. TIMELINE - give them a specific next date/action

ANSWER EXAMPLES:
If they ask "How much could we save?"
→ "Based on companies similar to yours in [industry], typically 15-20% on renewal. I'd need to see your current bill to give you exact numbers."

If they ask "How does this work?"
→ "Simply put: [step 1], [step 2], [step 3]. Takes 30 days from analysis to locked-in rates."

If they ask "Who else have you worked with?"
→ "Recent wins include [similar company], [competitor], [same industry]. Happy to share specifics on a call."

NEXT STEP - Be specific:
- "Can we lock in 20 min Tuesday at [TIME] to walk through your specific situation?"
- "Send me your current bill and I'll have a preliminary analysis to you by [DATE]"
- "Let's schedule a brief call this week—I'm available [OPTIONS]"

TONE: Helpful, professional, moving momentum forward

GOAL: Convert interest into action (meeting, data sharing, etc.)

EMAIL DETAILS:
- To: [contact_name] at [company_name]
- Role: [contact_job_title]

LENGTH: 80-120 words max`;
  }

  function buildObjectionNotInterestedPrompt() {
    return `Write an email response to a prospect who says they're not interested.

DO NOT:
- Try to convince them they're wrong
- Go harder on sales
- Get defensive

DO:
- Thank them professionally
- Acknowledge their decision
- Leave door genuinely open
- Position for future

STRUCTURE:
1. RESPECT - "I appreciate you being direct"
2. BRIEF REASON - "I get it, you've got things dialed in"
3. STAY CURIOUS - "One question though..."
4. FINAL OFFER - "If anything changes..." or "When [event] happens..."
5. GRACEFUL EXIT - leave them with your info for future

EXAMPLES:

For "not interested now":
"Totally understand. Just so you know, renewal cycle is usually when things shift. Would it be worth staying connected when that window opens?"

For "already shopping":
"That makes sense. If you'd like a third option when you're comparing, I'm here. No pressure."

For "too expensive":
"I get it, budget is real. What often happens is when you factor in time saved + rate difference, the math changes. Worth circling back in Q1?"

FINAL OFFER:
- "I'll stay in touch when renewal season starts"
- "Feel free to reach out when you're ready to shop"
- "Happy to be a resource down the line"

TONE: Professional, respectful, genuine

GOAL: Not force the sale, but stay in their orbit for when they DO need you

EMAIL DETAILS:
- To: [contact_name] at [company_name]

LENGTH: 60-90 words max`;
  }

  // ========== END OBJECTION HANDLING PROMPT BUILDERS ==========

  // ========== BREAKUP EMAIL (FINAL TOUCH) ==========

  function buildBreakupEmailPrompt() {
    return `Write BREAKUP EMAIL (DAY 20+ - FINAL LAST CHANCE):

CONTEXT: Final email in sequence. Give them a clear out or last chance to engage.

FRAMEWORK (2025 Best Practice - Breakup Email):
1. GREETING (RANDOMIZE): Use "Hi [contact_first_name]," OR "Hey [contact_first_name]," OR "Hello [contact_first_name],"

2. ACKNOWLEDGE THE SILENCE (RESPECTFULLY):
   - Recognize they haven't responded (don't be passive-aggressive)
   - Examples:
     * "I haven't heard back, so I'm guessing [topic] isn't a priority right now..."
     * "Since I haven't heard from you, I'll assume the timing isn't right..."
     * "It seems like [topic] might not be on your radar at the moment..."

3. GIVE THEM AN OUT (GENUINELY):
   - Make it EASY for them to say "remove me" or "not interested"
   - Examples:
     * "Should I keep you on my list for future updates, or would you prefer I remove you?"
     * "If the timing's not right, just let me know and I'll take you off my list."
     * "Quick question: Keep you posted on [topic], or remove you for now?"

4. FINAL VALUE (OPTIONAL - LIGHT TOUCH):
   - One last tiny piece of value or reminder (keep brief)
   - "If things change and you want to revisit [topic], I'm happy to help."
   - "Feel free to reach out if your situation changes."

KEY PRINCIPLES:
- Be GENUINE and respectful (not manipulative)
- Give them permission to say no
- Make it easy to respond either way
- No guilt trips, no FOMO tactics
- Professional and classy exit

TONE: Respectful, professional, genuine, not desperate

AVOID:
- "This is my last email..." (sounds desperate)
- Guilt trips or FOMO tactics
- Being passive-aggressive
- "I'm shocked you haven't responded..."
- Long explanations about why they should care

LENGTH: 40-60 words max (SHORT and respectful)
PURPOSE: Clear final touchpoint - give them an out or a last chance to engage`;
  }

  // ========== END BREAKUP EMAIL ==========

  // Get signature HTML for preview if settings allow it
  function getSignatureForPreview(step, isAuto) {
    try {
      // Get email settings (step-specific or default)
      const emailSettings = step.emailSettings || getDefaultEmailSettings(isAuto);

      // Check if signature should be included
      if (!emailSettings?.content?.includeSignature) {
        return '';
      }

      // Get signature from settings
      const signature = window.getEmailSignature ? window.getEmailSignature() : '';
      if (!signature) return '';

      // Check if signature image should be included
      const settings = (window.SettingsPage?.getSettings?.()) || {};
      const deliver = settings?.emailDeliverability || {};

      // If signature image is disabled in settings, remove it from signature
      let signatureHtml = signature;
      if (deliver.signatureImageEnabled === false) {
        signatureHtml = signature.replace(/<img[^>]*alt=["']Signature["'][\s\S]*?>/gi, '');
      }

      // Return signature HTML (will be appended to preview body)
      return signatureHtml || '';
    } catch (error) {
      console.warn('[SequenceBuilder] Error getting signature for preview:', error);
      return '';
    }
  }

  // Resolve sender first name from multiple sources so it's always available
  function getSenderFirstName() {
    try {
      const v = (window.SettingsPage && typeof window.SettingsPage.getSetting === 'function')
        ? window.SettingsPage.getSetting('general.firstName')
        : null;
      if (v && String(v).trim()) return String(v).trim();
    } catch (_) { }

    try {
      const v = window.SettingsPage?.instance?.state?.settings?.general?.firstName;
      if (v && String(v).trim()) return String(v).trim();
    } catch (_) { }

    try {
      const raw = localStorage.getItem('crm-settings');
      if (raw) {
        const parsed = JSON.parse(raw);
        const v = parsed?.general?.firstName;
        if (v && String(v).trim()) return String(v).trim();
      }
    } catch (_) { }

    try {
      const u = window.firebase?.auth?.().currentUser;
      const dn = u?.displayName || '';
      if (dn && dn.trim()) return dn.trim().split(' ')[0] || '';
    } catch (_) { }

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

  // Substitute bracket-style tokens like [contact_company], [company_name], etc.
  function substituteBracketTokensInPrompt(prompt, contact) {
    if (!prompt || !contact) return prompt;

    // Try multiple ways to get company name - prioritize account data
    let companyName = getAccountFieldFromContact(contact, 'name') || '';
    if (!companyName) {
      // Try direct contact fields
      companyName = contact.company || contact.companyName || contact.accountName || contact.organization || contact.organisation || contact.employer || '';
    }
    if (!companyName && contact.account) {
      // Try account object directly
      companyName = contact.account.accountName || contact.account.name || contact.account.companyName || '';
    }
    if (!companyName && contact.account_id) {
      // Try to get from accounts cache if available
      if (window.BackgroundAccountsLoader) {
        const accounts = window.BackgroundAccountsLoader.getAccountsData() || [];
        const account = accounts.find(a => a.id === contact.account_id);
        if (account) {
          companyName = account.accountName || account.name || account.companyName || '';
        }
      }
    }

    const contactCompany = companyName; // Same as company_name for consistency
    const contactFirstName = contact.first_name || contact.firstName || (contact.name?.split(' ')[0] || '');
    const contactName = contact.name || contact.full_name || `${contactFirstName} ${contact.last_name || contact.lastName || ''}`.trim();
    const contactJobTitle = contact.title || contact.job || contact.role || '';
    const companyIndustry = getAccountFieldFromContact(contact, 'industry') || contact.industry || contact.companyIndustry || '';
    const companyLocation = [getAccountFieldFromContact(contact, 'city'), getAccountFieldFromContact(contact, 'state')].filter(Boolean).join(', ');
    const accountCity = getAccountFieldFromContact(contact, 'city') || contact.city || contact.companyCity || '';
    const accountState = getAccountFieldFromContact(contact, 'state') || contact.state || contact.companyState || contact.region || '';
    const city = accountCity;
    const state = accountState;
    const companyWebsite = getAccountFieldFromContact(contact, 'website') || contact.website || contact.companyWebsite || '';
    const contactLinkedinRecentActivity = contact.linkedin_recent_activity || contact.recentActivity || '';
    const role = contactJobTitle;

    return String(prompt)
      .replace(/\[contact_company\]/gi, companyName || '[Company Name]')
      .replace(/\[company_name\]/gi, companyName || '[Company Name]')
      .replace(/\[contact_first_name\]/gi, contactFirstName || '[First Name]')
      .replace(/\[contact_name\]/gi, contactName || '[Contact Name]')
      .replace(/\[contact_job_title\]/gi, contactJobTitle || '[Job Title]')
      .replace(/\[company_industry\]/gi, companyIndustry || '[Industry]')
      .replace(/\[company_location\]/gi, companyLocation || '[Location]')
      .replace(/\[account_city\]/gi, accountCity || '[City]')
      .replace(/\[account_state\]/gi, accountState || '[State]')
      .replace(/\[city\]/gi, city || '[City]')
      .replace(/\[state\]/gi, state || '[State]')
      .replace(/\[company_website\]/gi, companyWebsite || '[Website]')
      .replace(/\[contact_linkedin_recent_activity\]/gi, contactLinkedinRecentActivity || '')
      .replace(/\[role\]/gi, role || '[Role]')
      .replace(/\[FirstName\]/gi, contactFirstName || '[First Name]');
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
    const q = String(query || '').toLowerCase().trim();
    try {
      // COST OPTIMIZATION: Use cache-first approach (zero Firebase queries after first load)
      let contactsData = [];

      // Priority 1: BackgroundContactsLoader (cached, zero cost)
      if (window.BackgroundContactsLoader && typeof window.BackgroundContactsLoader.getContactsData === 'function') {
        contactsData = window.BackgroundContactsLoader.getContactsData() || [];
      }

      // Priority 2: window.getPeopleData (if people.js is loaded)
      if (contactsData.length === 0 && typeof window.getPeopleData === 'function') {
        contactsData = window.getPeopleData() || [];
      }

      // Priority 3: CacheManager (still cached, zero cost)
      if (contactsData.length === 0 && window.CacheManager && typeof window.CacheManager.get === 'function') {
        try {
          contactsData = await window.CacheManager.get('contacts') || [];
        } catch (err) {
          console.warn('[SequenceBuilder] CacheManager read failed:', err);
        }
      }

      // Only fetch from Firebase if cache is completely empty (last resort - costs money)
      if (contactsData.length === 0 && window.firebaseDB) {
        console.warn('[SequenceBuilder] No cached contacts found, fetching from Firestore (costs money)');
        const email = window.currentUserEmail || '';
        let snapshot;
        if (window.currentUserRole !== 'admin' && email) {
          // Non-admin: use scoped query with limits
          const [ownedSnap, assignedSnap] = await Promise.all([
            window.firebaseDB.collection('contacts').where('ownerId', '==', email).limit(1000).get(),
            window.firebaseDB.collection('contacts').where('assignedTo', '==', email).limit(1000).get()
          ]);
          const map = new Map();
          ownedSnap.forEach(d => map.set(d.id, d));
          assignedSnap.forEach(d => { if (!map.has(d.id)) map.set(d.id, d); });
          snapshot = { forEach: (callback) => map.forEach(callback) };
        } else {
          // OPTIMIZED: Admin query with limit to prevent loading entire collection
          // 2000 contacts is enough for search/autocomplete while keeping costs reasonable
          snapshot = await window.firebaseDB.collection('contacts').limit(2000).get();
        }

        // Convert snapshot to array
        contactsData = [];
        snapshot.forEach(doc => {
          contactsData.push({ id: doc.id, ...doc.data() });
        });
      }

      // Filter contacts by search query (client-side, no Firebase cost)
      const out = [];
      contactsData.forEach(person => {
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
            <button class="ai-suggestion" type="button" 
              data-prompt-template="first-email-intro"
              data-cta-variant="true">First email introduction</button>
            <button class="ai-suggestion" type="button" 
              data-prompt-template="follow-up-value">Follow-up #1 - Value Add (No Response)</button>
            <button class="ai-suggestion" type="button" 
              data-prompt-template="follow-up-curiosity">Follow-up #2 - Curiosity Angle</button>
            <button class="ai-suggestion" type="button" 
              data-prompt-template="nurture-value">Nurture - Industry Insight</button>
            <button class="ai-suggestion" type="button" 
              data-prompt-template="post-convo-recap">Post-Call Recap & Next Steps</button>
            <button class="ai-suggestion" type="button" 
              data-prompt-template="info-request-bill">Request - Bill/Energy Data</button>
            <button class="ai-suggestion" type="button" 
              data-prompt-template="final-ask-close">Final Close - Strong Ask</button>
            <button class="ai-suggestion" type="button" 
              data-prompt-template="objection-all-set">Response - "We're All Set"</button>
            <button class="ai-suggestion" type="button" 
              data-prompt-template="objection-interested">Response - They Show Interest</button>
            <button class="ai-suggestion" type="button" 
              data-prompt-template="objection-not-interested">Response - Not Interested</button>
            <button class="ai-suggestion" type="button" 
              data-prompt-template="breakup-email">Breakup - Last Chance</button>
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
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  }
  function svgTrash() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>';
  }
  function svgSettings() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
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
      try { _openDelayPopover.cleanup && _openDelayPopover.cleanup(); } catch (_) { }
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
          text-align: center;
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

    // Find the step and update its settings - FIX: Use state instead of window.sequenceBuilder
    const step = state.currentSequence?.steps?.find(s => s.id === stepId);
    if (step) {
      step.emailSettings = settings;
      console.log('[EmailSettings] Settings saved for step:', stepId, settings);

      // Persist to Firestore
      try {
        scheduleStepSave(stepId);
      } catch (error) {
        console.error('[EmailSettings] Error scheduling save:', error);
      }
    } else {
      console.error('[EmailSettings] Step not found:', stepId);
    }

    closeEmailSettings();
  }

  // Make functions globally available
  window.openEmailSettings = openEmailSettings;
  window.closeEmailSettings = closeEmailSettings;
  window.saveEmailSettings = saveEmailSettings;

  // Sequence Contacts Panel (dropdown similar to contact-lists-panel)
  let _positionSequenceContactsPanel = null;
  let _onSequenceContactsOutside = null;

  function injectSequenceContactsStyles() {
    let style = document.getElementById('sequence-contacts-panel-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'sequence-contacts-panel-styles';
      document.head.appendChild(style);
    }
    style.textContent = `
      /* Sequence Contacts Panel */
      #sequence-contacts-panel { 
        position: fixed; 
        z-index: 1200; 
        width: min(560px, 92vw);
        background: var(--bg-card); 
        color: var(--text-primary); 
        border: 1px solid var(--border-light);
        border-radius: var(--border-radius); 
        box-shadow: var(--elevation-card-hover, 0 16px 40px rgba(0,0,0,.28), 0 6px 18px rgba(0,0,0,.22));
        transform: translateY(-8px); 
        opacity: 0; 
        transition: transform 400ms ease, opacity 400ms ease;
        --arrow-size: 10px;
        /* Don't use overflow: hidden - it clips the arrow pointer */
      }
      #sequence-contacts-panel.--show { 
        transform: translateY(0); 
        opacity: 1; 
      }
      #sequence-contacts-panel .list-header { 
        display: flex; 
        align-items: center; 
        justify-content: space-between; 
        padding: 14px 16px; 
        border-bottom: 1px solid var(--border-light); 
        font-weight: 700; 
        background: var(--bg-card);
        border-radius: var(--border-radius) var(--border-radius) 0 0;
      }
      #sequence-contacts-panel .list-title { 
        font-weight: 700; 
        color: var(--text-primary); 
        font-size: 1rem; 
      }
      #sequence-contacts-panel .close-btn {
        display: inline-flex; 
        align-items: center; 
        justify-content: center;
        width: 28px; 
        height: 28px; 
        min-width: 28px; 
        min-height: 28px; 
        padding: 0;
        background: var(--bg-item) !important; 
        color: var(--grey-300) !important;
        border: 1px solid var(--border-light); 
        border-radius: var(--border-radius-sm);
        line-height: 1; 
        font-size: 16px; 
        font-weight: 600; 
        cursor: pointer;
        transition: var(--transition-fast); 
        box-sizing: border-box;
        -webkit-tap-highlight-color: transparent; 
        margin-right: 0;
      }
      #sequence-contacts-panel .close-btn:hover {
        background: var(--grey-600) !important; 
        color: var(--text-inverse) !important;
      }
      #sequence-contacts-panel .close-btn:focus-visible {
        outline: 2px solid var(--orange-muted); 
        outline-offset: 2px;
      }
      #sequence-contacts-panel .list-body { 
        max-height: min(70vh, 720px); 
        overflow: auto; 
        background: var(--bg-card); 
      }
      #sequence-contacts-panel .list-body::-webkit-scrollbar { 
        width: 10px; 
      }
      #sequence-contacts-panel .list-body::-webkit-scrollbar-thumb { 
        background: var(--grey-700); 
        border-radius: 8px; 
      }
      #sequence-contacts-panel .list-item { 
        display: flex; 
        align-items: center; 
        gap: 12px; 
        padding: 12px 16px; 
        cursor: pointer; 
        background: var(--bg-card); 
        border-top: 1px solid var(--border-light); 
      }
      #sequence-contacts-panel .list-item:first-child { 
        border-top: 0; 
      }
      #sequence-contacts-panel .list-item:last-child {
        border-radius: 0 0 var(--border-radius) var(--border-radius);
      }
      #sequence-contacts-panel .list-item:hover { 
        background: var(--bg-hover); 
      }
      #sequence-contacts-panel .list-item[aria-disabled="true"] { 
        opacity: .6; 
        cursor: default; 
      }
      #sequence-contacts-panel .list-item:focus-visible { 
        outline: none; 
        box-shadow: 0 0 0 3px rgba(255,139,0,.35) inset; 
      }
      #sequence-contacts-panel .list-item .name-cell__wrap {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      #sequence-contacts-panel .list-item .avatar-initials {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: var(--orange-subtle);
        color: #fff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 12px;
        letter-spacing: 0.5px;
        flex-shrink: 0;
      }
      #sequence-contacts-panel .list-item .list-name { 
        font-weight: 600; 
        color: var(--grey-400);
      }
      #sequence-contacts-panel .list-item .list-meta { 
        color: var(--text-muted); 
        font-size: .85rem; 
      }
      #sequence-contacts-panel .list-item .list-company {
        color: var(--grey-400);
        font-size: .85rem;
      }

      /* Pointer arrow */
      #sequence-contacts-panel::before,
      #sequence-contacts-panel::after {
        content: "";
        position: absolute;
        width: var(--arrow-size);
        height: var(--arrow-size);
        transform: rotate(45deg);
        pointer-events: none;
      }
      /* Bottom placement (arrow on top edge) */
      #sequence-contacts-panel[data-placement="bottom"]::before {
        left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2));
        top: calc(-1 * var(--arrow-size) / 2 + 1px);
        background: var(--border-light);
      }
      #sequence-contacts-panel[data-placement="bottom"]::after {
        left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2));
        top: calc(-1 * var(--arrow-size) / 2 + 2px);
        background: var(--bg-card);
      }
      /* Top placement (arrow on bottom edge) */
      #sequence-contacts-panel[data-placement="top"]::before {
        left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2));
        bottom: calc(-1 * var(--arrow-size) / 2 + 1px);
        background: var(--border-light);
      }
      #sequence-contacts-panel[data-placement="top"]::after {
        left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2));
        bottom: calc(-1 * var(--arrow-size) / 2 + 2px);
        background: var(--bg-card);
      }
    `;
  }

  function closeSequenceContactsPanel() {
    const panel = document.getElementById('sequence-contacts-panel');
    const cleanup = () => {
      if (panel && panel.parentElement) panel.parentElement.removeChild(panel);
      try { document.removeEventListener('mousedown', _onSequenceContactsOutside, true); } catch (_) { }
      try { window.removeEventListener('resize', _positionSequenceContactsPanel, true); } catch (_) { }
      try { window.removeEventListener('scroll', _positionSequenceContactsPanel, true); } catch (_) { }
      try {
        const trigger = document.getElementById('contacts-btn');
        if (trigger) {
          trigger.setAttribute('aria-expanded', 'false');
        }
      } catch (_) { }
      _positionSequenceContactsPanel = null;
      _onSequenceContactsOutside = null;
    };
    if (panel) {
      panel.classList.remove('--show');
      setTimeout(cleanup, 400);
    } else {
      cleanup();
    }
  }

  function openSequenceContactsPanel(anchorEl) {
    if (document.getElementById('sequence-contacts-panel')) return;

    injectSequenceContactsStyles();

    const panel = document.createElement('div');
    panel.id = 'sequence-contacts-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Sequence contacts');

    const contacts = Array.isArray(state.contacts) ? state.contacts.slice() : [];
    const total = contacts.length;

    // Sort by name
    contacts.sort((a, b) => {
      const an = (a.name || a.fullName || `${a.firstName || ''} ${a.lastName || ''}`).trim().toLowerCase();
      const bn = (b.name || b.fullName || `${b.firstName || ''} ${b.lastName || ''}`).trim().toLowerCase();
      return an.localeCompare(bn);
    });

    panel.innerHTML = `
      <div class="list-header">
        <div class="list-title">Sequence Contacts (${total})</div>
        <button type="button" class="close-btn" id="sequence-contacts-close" aria-label="Close">×</button>
      </div>
      <div class="list-body" id="sequence-contacts-body">
        ${total === 0
        ? '<div class="list-item" tabindex="-1" aria-disabled="true"><div><div class="list-name">No contacts in this sequence</div><div class="list-meta">Add contacts using the search bar</div></div></div>'
        : contacts.map(c => {
          const nameRaw = c.name || c.fullName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unnamed Contact';
          const name = escapeHtml(nameRaw);
          const title = escapeHtml(c.title || c.jobTitle || '');
          const company = escapeHtml(c.company || c.companyName || '');
          const initials = escapeHtml(getInitials(nameRaw));
          const cid = escapeHtml(c.id || '');

          return `
                <div class="list-item" tabindex="0" data-id="${cid}">
                  <div class="name-cell__wrap">
                    <span class="avatar-initials" aria-hidden="true">${initials}</span>
                    <div>
                      <div class="list-name">${name}</div>
                      ${title || company ? `<div class="list-meta">${title ? `${title}${company ? ' at ' : ''}` : ''}${company || ''}</div>` : ''}
                      ${company && !title ? `<div class="list-company">${company}</div>` : ''}
                    </div>
                  </div>
                </div>`;
        }).join('')
      }
      </div>`;

    document.body.appendChild(panel);

    // Position panel
    _positionSequenceContactsPanel = function position() {
      if (!panel || !anchorEl) return;
      const r = anchorEl.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - r.bottom;
      const spaceAbove = r.top;

      // Calculate arrow position first (centered with button)
      const buttonCenter = r.left + (r.width / 2);

      // Try to center panel with button, but keep in viewport
      const idealLeft = buttonCenter - (panelRect.width / 2);
      let left = idealLeft;

      let placement = 'bottom';
      let top = r.bottom + 8;

      if (spaceBelow < panelRect.height && spaceAbove > spaceBelow) {
        placement = 'top';
        top = r.top - panelRect.height - 8;
      }

      if (left + panelRect.width > window.innerWidth - 16) {
        left = window.innerWidth - panelRect.width - 16;
      }
      if (left < 16) left = 16;

      // Arrow position: distance from button center to panel left edge
      const arrowLeft = buttonCenter - left;
      panel.style.setProperty('--arrow-left', `${Math.max(20, Math.min(arrowLeft, panelRect.width - 20))}px`);

      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.setAttribute('data-placement', placement);
    };

    _positionSequenceContactsPanel();
    // Only recalculate on resize, not on scroll (prevents modal from shifting when scrolling)
    window.addEventListener('resize', _positionSequenceContactsPanel, true);
    // Note: Scroll listener removed - modal should stay in fixed position relative to viewport

    // Show panel with animation
    requestAnimationFrame(() => {
      panel.classList.add('--show');
    });

    // Close button
    const closeBtn = panel.querySelector('#sequence-contacts-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeSequenceContactsPanel();
      });
    }

    // Click outside to close
    _onSequenceContactsOutside = (e) => {
      if (!panel.contains(e.target) && !anchorEl.contains(e.target)) {
        closeSequenceContactsPanel();
      }
    };
    setTimeout(() => {
      document.addEventListener('mousedown', _onSequenceContactsOutside, true);
    }, 0);

    // Keyboard navigation
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSequenceContactsPanel();
        try { anchorEl.focus(); } catch (_) { }
      }
    };
    document.addEventListener('keydown', onKey, true);

    // Contact click handler
    const body = panel.querySelector('#sequence-contacts-body');
    if (body) {
      body.addEventListener('click', (e) => {
        const item = e.target.closest('.list-item[data-id]');
        if (item && !item.hasAttribute('aria-disabled')) {
          const contactId = item.getAttribute('data-id');
          if (contactId) {
            // Navigate to contact detail
            try {
              window.crm && window.crm.navigateToPage && window.crm.navigateToPage('people');
            } catch (_) { }
            const tryOpen = () => {
              if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
                try {
                  window.ContactDetail.show(contactId);
                  closeSequenceContactsPanel();
                } catch (_) { }
              } else {
                setTimeout(tryOpen, 80);
              }
            };
            requestAnimationFrame(() => {
              setTimeout(tryOpen, 100);
            });
          }
        }
      });
    }

    // Set aria-expanded
    if (anchorEl) {
      anchorEl.setAttribute('aria-expanded', 'true');
    }

    // Load contacts if needed
    if (state.currentSequence?.id && contacts.length === 0) {
      loadContactsFromSequenceMembers(state.currentSequence.id).then(() => {
        const freshContacts = Array.isArray(state.contacts) ? state.contacts.slice() : [];
        if (freshContacts.length > 0 && body) {
          freshContacts.sort((a, b) => {
            const an = (a.name || a.fullName || `${a.firstName || ''} ${a.lastName || ''}`).trim().toLowerCase();
            const bn = (b.name || b.fullName || `${b.firstName || ''} ${b.lastName || ''}`).trim().toLowerCase();
            return an.localeCompare(bn);
          });

          body.innerHTML = freshContacts.map(c => {
            const nameRaw = c.name || c.fullName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unnamed Contact';
            const name = escapeHtml(nameRaw);
            const title = escapeHtml(c.title || c.jobTitle || '');
            const company = escapeHtml(c.company || c.companyName || '');
            const initials = escapeHtml(getInitials(nameRaw));
            const cid = escapeHtml(c.id || '');

            return `
              <div class="list-item" tabindex="0" data-id="${cid}">
                <div class="name-cell__wrap">
                  <span class="avatar-initials" aria-hidden="true">${initials}</span>
                  <div>
                    <div class="list-name">${name}</div>
                    ${title || company ? `<div class="list-meta">${title ? `${title}${company ? ' at ' : ''}` : ''}${company || ''}</div>` : ''}
                    ${company && !title ? `<div class="list-company">${company}</div>` : ''}
                  </div>
                </div>
              </div>`;
          }).join('');

          // Update header count
          const titleEl = panel.querySelector('.list-title');
          if (titleEl) {
            titleEl.textContent = `Sequence Contacts (${freshContacts.length})`;
          }
        }
      }).catch(err => {
        console.warn('[SequenceBuilder] Failed to load contacts for panel:', err);
      });
    }
  }

  // Delete confirmation popover state (anchored under trash icon)
  let _openDeletePopover = null; // { el, cleanup }
  function closeDeletePopover() {
    if (_openDeletePopover) {
      try { _openDeletePopover.cleanup && _openDeletePopover.cleanup(); } catch (_) { }
      _openDeletePopover = null;
    }
  }

  // Add-contact confirmation popover state
  let _openAddContactPopover = null; // { el, cleanup }
  function closeAddContactPopover() {
    if (_openAddContactPopover) {
      try { _openAddContactPopover.cleanup && _openAddContactPopover.cleanup(); } catch (_) { }
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
      try { await addContactToSequence(contact); } catch (_) { }
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
          const removeNow = () => { try { pop.remove(); } catch (_) { } };
          pop.addEventListener('animationend', removeNow, { once: true });
          setTimeout(removeNow, 180);
        } catch (_) {
          try { pop.remove(); } catch (_) { }
        }
        try { anchorEl.blur && anchorEl.blur(); } catch (_) { }
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
          const removeNow = () => { try { pop.remove(); } catch (_) { } };
          pop.addEventListener('animationend', removeNow, { once: true });
          setTimeout(removeNow, 180);
        } catch (_) {
          try { pop.remove(); } catch (_) { }
        }
        // Blur the trigger so any hover/focus-reveal actions hide after cancel
        try { anchorEl.blur && anchorEl.blur(); } catch (_) { }
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

            // Check if this button uses dynamic templates
            const isVariant = btn.getAttribute('data-cta-variant') === 'true';
            const template = btn.getAttribute('data-prompt-template');

            let prompt;

            if (template) {
              // Handle template-based prompts
              switch (template) {
                case 'first-email-intro':
                  // Build prompt with random CTA
                  // Try to detect role from step or contact if available
                  const stepId = stepCard.getAttribute('data-step-id');
                  const step = state.currentSequence?.steps?.find(s => s.id === stepId);
                  const contactRole = step?.data?.previewContact?.title || step?.data?.previewContact?.job || 'all';

                  // Determine if finance role for CTA selection
                  const role = (contactRole && typeof contactRole === 'string' &&
                    (contactRole.toLowerCase().includes('finance') ||
                      contactRole.toLowerCase().includes('cfo') ||
                      contactRole.toLowerCase().includes('controller') ||
                      contactRole.toLowerCase().includes('accounting'))) ? 'finance' : 'all';

                  prompt = buildFirstEmailIntroPrompt(true, role);
                  break;

                case 'follow-up-value':
                  // Try to detect role from step or contact if available
                  const stepId2 = stepCard.getAttribute('data-step-id');
                  const step2 = state.currentSequence?.steps?.find(s => s.id === stepId2);
                  const contactRole2 = step2?.data?.previewContact?.title || step2?.data?.previewContact?.job || 'all';

                  // Determine if finance role for CTA selection
                  const role2 = (contactRole2 && typeof contactRole2 === 'string' &&
                    (contactRole2.toLowerCase().includes('finance') ||
                      contactRole2.toLowerCase().includes('cfo') ||
                      contactRole2.toLowerCase().includes('controller') ||
                      contactRole2.toLowerCase().includes('accounting'))) ? 'finance' : 'all';

                  prompt = buildFollowUpValuePrompt(true, role2);
                  break;

                case 'follow-up-curiosity':
                  // Try to detect role from step or contact if available
                  const stepId3 = stepCard.getAttribute('data-step-id');
                  const step3 = state.currentSequence?.steps?.find(s => s.id === stepId3);
                  const contactRole3 = step3?.data?.previewContact?.title || step3?.data?.previewContact?.job || 'all';

                  // Determine if finance role for CTA selection
                  const role3 = (contactRole3 && typeof contactRole3 === 'string' &&
                    (contactRole3.toLowerCase().includes('finance') ||
                      contactRole3.toLowerCase().includes('cfo') ||
                      contactRole3.toLowerCase().includes('controller') ||
                      contactRole3.toLowerCase().includes('accounting'))) ? 'finance' : 'all';

                  prompt = buildFollowUpCuriosityPrompt(true, role3);
                  break;

                case 'nurture-value':
                  prompt = buildNurtureValuePrompt();
                  break;

                case 'post-convo-recap':
                  prompt = buildPostConvoRecapPrompt();
                  break;

                case 'info-request-bill':
                  prompt = buildInfoRequestBillPrompt();
                  break;

                case 'final-ask-close':
                  prompt = buildFinalAskClosePrompt();
                  break;

                case 'objection-all-set':
                  prompt = buildObjectionAllSetPrompt();
                  break;

                case 'objection-interested':
                  prompt = buildObjectionInterestedPrompt();
                  break;

                case 'objection-not-interested':
                  prompt = buildObjectionNotInterestedPrompt();
                  break;

                case 'breakup-email':
                  prompt = buildBreakupEmailPrompt();
                  break;

                default:
                  // Fallback to static prompt
                  prompt = btn.getAttribute('data-prompt');
              }
            } else {
              // Use static prompt
              prompt = btn.getAttribute('data-prompt');
            }

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
          const removeNow = () => { try { pop.remove(); } catch (_) { } };
          pop.addEventListener('animationend', removeNow, { once: true });
          // Safety timeout in case animationend doesn't fire
          setTimeout(removeNow, 180);
        } catch (_) {
          try { pop.remove(); } catch (_) { }
        }
        // Return focus to the anchor for accessibility
        try {
          anchorEl.setAttribute('aria-expanded', 'false');
          anchorEl.removeAttribute('aria-controls');
          anchorEl.focus();
        } catch (_) { }
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

    // View toggle click handler (Builder / Steps)
    const viewToggle = document.getElementById('sequence-view-toggle');
    if (viewToggle) {
      viewToggle.addEventListener('click', async (e) => {
        const btn = e.target.closest('button.toggle-btn');
        if (!btn) return;
        const newView = btn.getAttribute('data-view');
        if (!newView || newView === state.currentView) return;

        // Update state
        state.currentView = newView;

        // Invalidate cache when switching to steps view to ensure fresh data
        if (newView === 'steps') {
          state.sequenceMembersCache = null;
          // Reset pagination state for fresh load
          state.stepsLoadedMembers = [];
          state.stepsLastLoadedDoc = null;
          state.stepsHasMore = true;
          state.stepsTotalCount = 0;
          state.stepsPage = 1;
          console.log('[SequenceBuilder] Switching to Steps view, cache and pagination reset');
        }

        // Re-render
        await render();
      });
    }

    // ✅ NEW: Refresh button for Steps tab
    const refreshBtn = document.getElementById('refresh-steps-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        console.log('[SequenceBuilder] Manual refresh triggered');
        // Invalidate cache to force fresh data load
        state.sequenceMembersCache = null;
        // Reset pagination state for fresh load
        state.stepsLoadedMembers = [];
        state.stepsLastLoadedDoc = null;
        state.stepsHasMore = true;
        state.stepsTotalCount = 0;
        state.stepsPage = 1;
        // Re-render
        await render();
        if (window.crm?.showToast) {
          window.crm.showToast('Progress refreshed', 'success');
        }
      });
    }

    const addStepBtn = document.getElementById('add-step-btn');
    const emptyAddBtn = document.getElementById('empty-add-step');
    const builderAddBtn = document.getElementById('builder-add-step');
    const builderAddBtns = document.querySelectorAll('.builder-add-step');

    const onAdd = () => {
      const overlay = createStepTypeModal(({ type, label }) => handleAddStep(type, label));
      document.body.appendChild(overlay);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          overlay.classList.add('show');
          const firstOption = overlay.querySelector('.step-option');
          if (firstOption) firstOption.focus();
          else overlay.focus();
        });
      });
    };
    if (addStepBtn) addStepBtn.addEventListener('click', onAdd);
    if (emptyAddBtn) emptyAddBtn.addEventListener('click', onAdd);
    if (builderAddBtn) builderAddBtn.addEventListener('click', onAdd);
    builderAddBtns.forEach(btn => btn.addEventListener('click', onAdd));

    // Open contacts dropdown panel
    const contactsBtn = document.getElementById('contacts-btn');
    if (contactsBtn && !contactsBtn.dataset.bound) {
      contactsBtn.dataset.bound = '1';
      contactsBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Toggle behavior: close if already open
        if (document.getElementById('sequence-contacts-panel')) {
          closeSequenceContactsPanel();
        } else {
          openSequenceContactsPanel(contactsBtn);
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
      setTimeout(() => { try { input.focus(); input.select && input.select(); } catch (_) { } }, 0);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); doSave(); }
        else if (e.key === 'Escape') { e.preventDefault(); doCancel(); }
      });
    }
    saveBtn && saveBtn.addEventListener('click', doSave);
    cancelBtn && cancelBtn.addEventListener('click', doCancel);

    // Setup contact name click handler using document-level delegation (like task-detail.js)
    // This persists across table re-renders and uses capture phase to catch clicks early
    if (!document._sequenceBuilderContactHandlersBound) {
      document._sequenceBuilderContactHandlersBound = true;

      const contactNameClickHandler = (e) => {
        // CRITICAL: Check if click is within sequence-builder-page first
        const sequencePage = e.target.closest('#sequence-builder-page');
        if (!sequencePage) return;

        // Find the name-cell (could be the cell itself or a child element)
        const nameCell = e.target.closest('.name-cell');
        if (!nameCell) return;

        e.preventDefault();
        e.stopPropagation();

        const contactId = nameCell.getAttribute('data-contact-id');
        if (!contactId) {
          console.warn('[SequenceBuilder] Contact name clicked but no contactId found');
          return;
        }

        console.log('[SequenceBuilder] Contact name clicked:', contactId);

        // Store navigation source for back button - include full sequence for instant restore
        // Capture scroll positions before navigating away
        const tableScroller = document.querySelector('#sequence-builder-page .table-scroll');
        const pageScroll = window.scrollY || 0;
        const tableScroll = tableScroller ? tableScroller.scrollTop : 0;
        
        window._contactNavigationSource = 'sequence-builder';
        window._sequenceBuilderReturn = {
          sequenceId: state.currentSequence?.id,
          sequenceName: state.currentSequence?.name,
          sequence: state.currentSequence, // Full sequence object for instant restore
          view: 'steps',
          page: state.stepsPage,
          // Store pagination state for restoration
          stepsLoadedMembers: state.stepsLoadedMembers,
          stepsLastLoadedDoc: state.stepsLastLoadedDoc,
          stepsHasMore: state.stepsHasMore,
          stepsTotalCount: state.stepsTotalCount,
          sequenceMembersCache: state.sequenceMembersCache,
          // Store scroll positions
          scrollY: pageScroll,
          tableScrollTop: tableScroll
        };
        console.log(`[SequenceBuilder] Stored return state: page=${state.stepsPage}, loaded=${state.stepsLoadedMembers.length}, scrollY=${pageScroll}, tableScroll=${tableScroll}`);

        // Prefetch from already loaded sequence contacts first (instant)
        if (Array.isArray(state.contacts) && state.contacts.length > 0) {
          const contactFromState = state.contacts.find(c => c.id === contactId);
          if (contactFromState) {
            window._prefetchedContactForDetail = contactFromState;
          }
        }

        // Navigate to people page first, then show contact detail
        if (window.crm && typeof window.crm.navigateToPage === 'function') {
          window.crm.navigateToPage('people');

          // Use retry pattern to ensure ContactDetail is ready (same as task-detail.js)
          requestAnimationFrame(() => {
            let attempts = 0;
            const maxAttempts = 25; // 2 seconds at 80ms intervals

            const tryShowContact = () => {
              if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
                try {
                  console.log('[SequenceBuilder] Opening contact detail for ID:', contactId);
                  window.ContactDetail.show(contactId);
                } catch (error) {
                  console.error('[SequenceBuilder] Error showing contact:', error);
                  if (window.crm && typeof window.crm.showToast === 'function') {
                    window.crm.showToast('Failed to open contact. Please try again.', 'error');
                  }
                }
              } else if (attempts < maxAttempts) {
                attempts++;
                setTimeout(tryShowContact, 80);
              } else {
                console.warn('[SequenceBuilder] ContactDetail module not ready after 2 seconds');
                if (window.crm && typeof window.crm.showToast === 'function') {
                  window.crm.showToast('Contact page is loading. Please try again in a moment.', 'error');
                }
              }
            };

            tryShowContact();
          });
        } else {
          console.error('[SequenceBuilder] CRM navigateToPage function not available');
        }

        // Optionally refresh cache in the background (non-blocking)
        if (window.CacheManager) {
          window.CacheManager.get('contacts').then((contacts) => {
            if (Array.isArray(contacts)) {
              const cachedContact = contacts.find(c => c.id === contactId);
              if (cachedContact) {
                window._prefetchedContactForDetail = cachedContact;
              }
            }
          }).catch(() => { /* noop */ });
        }
      };

      // Use capture phase to catch clicks early (same as task-detail.js)
      document.addEventListener('click', contactNameClickHandler, true);
      document._sequenceBuilderContactHandler = contactNameClickHandler;
    }
  }
  function attachBuilderEvents() {
    const container = document.getElementById('sequence-builder-view');
    if (!container || !state.currentSequence?.steps) return;

    // Collapse/expand with smooth animations
    container.querySelectorAll('.step-card .collapse-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;

        const stepBody = card.querySelector('.step-body');
        if (!stepBody) {
          // Fallback to simple toggle if body not found
          step.collapsed = !step.collapsed;
          render();
          return;
        }

        const isCollapsed = step.collapsed;
        // Skip animation on initial render
        const isInitialRender = stepBody.dataset.initialRender === 'true';
        if (isInitialRender) {
          stepBody.dataset.initialRender = 'false';
        }

        if (isCollapsed) {
          // Expand
          step.collapsed = false;
          stepBody.removeAttribute('hidden');

          if (isInitialRender) {
            // No animation on initial render
            btn.setAttribute('aria-expanded', 'true');
            btn.innerHTML = svgChevronDown();
            return;
          }

          // Get natural height
          const naturalHeight = stepBody.scrollHeight;
          const naturalPaddingTop = window.getComputedStyle(stepBody).paddingTop;
          const naturalPaddingBottom = window.getComputedStyle(stepBody).paddingBottom;

          // Set initial state
          stepBody.style.height = '0';
          stepBody.style.opacity = '0';
          stepBody.style.paddingTop = '0';
          stepBody.style.paddingBottom = '0';

          // Force reflow
          void stepBody.offsetHeight;

          // Animate to natural height
          requestAnimationFrame(() => {
            stepBody.style.transition = 'height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease, padding 0.4s ease';
            stepBody.style.height = naturalHeight + 'px';
            stepBody.style.opacity = '1';
            stepBody.style.paddingTop = naturalPaddingTop;
            stepBody.style.paddingBottom = naturalPaddingBottom;

            // Clean up after animation
            setTimeout(() => {
              stepBody.style.height = '';
              stepBody.style.transition = '';
              stepBody.style.paddingTop = '';
              stepBody.style.paddingBottom = '';
            }, 400);
          });

          // Update button icon
          btn.setAttribute('aria-expanded', 'true');
          btn.innerHTML = svgChevronDown();
        } else {
          // Collapse
          if (isInitialRender) {
            // No animation on initial render
            step.collapsed = true;
            stepBody.setAttribute('hidden', '');
            btn.setAttribute('aria-expanded', 'false');
            btn.innerHTML = svgChevronRight();
            return;
          }

          const currentHeight = stepBody.scrollHeight;
          const currentPaddingTop = window.getComputedStyle(stepBody).paddingTop;
          const currentPaddingBottom = window.getComputedStyle(stepBody).paddingBottom;

          // Set explicit height before animating
          stepBody.style.height = currentHeight + 'px';
          stepBody.style.paddingTop = currentPaddingTop;
          stepBody.style.paddingBottom = currentPaddingBottom;

          // Force reflow
          void stepBody.offsetHeight;

          // Animate to 0
          requestAnimationFrame(() => {
            step.collapsed = true;
            stepBody.style.transition = 'height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease, padding 0.4s ease';
            stepBody.style.height = '0';
            stepBody.style.opacity = '0';
            stepBody.style.paddingTop = '0';
            stepBody.style.paddingBottom = '0';

            // Set hidden after animation completes
            setTimeout(() => {
              stepBody.setAttribute('hidden', '');
              stepBody.style.height = '';
              stepBody.style.transition = '';
              stepBody.style.paddingTop = '';
              stepBody.style.paddingBottom = '';
            }, 400);
          });

          // Update button icon
          btn.setAttribute('aria-expanded', 'false');
          btn.innerHTML = svgChevronRight();
        }

        // Save the collapsed state
        try { scheduleStepSave(step.id, false); } catch (_) { /* noop */ }
      });
    });

    // Tabs - switch between Editor and Preview WITHOUT full re-render to preserve order/scroll
    container.querySelectorAll('.step-card .step-tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const card = tab.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        const tabName = tab.getAttribute('data-tab') || 'editor';
        step.activeTab = tabName;

        // Update tab button visuals
        const allTabs = card.querySelectorAll('.step-tabs .tab');
        allTabs.forEach(t => {
          const isActive = t === tab;
          t.classList.toggle('active', isActive);
        });

        // Show/hide tab panels
        const panels = card.querySelectorAll('.tab-panels .tab-panel');
        panels.forEach(panel => {
          const panelName = panel.getAttribute('data-tab') || 'editor';
          panel.classList.toggle('hidden', panelName !== tabName);
        });

        // Show/hide preview contact picker
        const picker = card.querySelector('.preview-contact-picker');
        if (picker) {
          if (tabName === 'preview') {
            picker.classList.remove('hidden');
          } else {
            picker.classList.add('hidden');
          }
        }

        // Add/remove preview-active class for CSS targeting
        if (tabName === 'preview') {
          card.classList.add('preview-active');
        } else {
          card.classList.remove('preview-active');
        }

        // Persist active tab without forcing a full rebuild
        try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
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
        try { scheduleStepSave(step.id); } catch (_) { }
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

        // Prefer to reuse the tab click handler for consistent behavior
        const previewTab = card.querySelector('.step-tabs .tab[data-tab="preview"]');
        if (previewTab) {
          previewTab.click();
        } else {
          // Fallback: manually toggle UI if tab reference is missing
          card.classList.add('preview-active');
          const panels = card.querySelectorAll('.tab-panels .tab-panel');
          panels.forEach(panel => {
            const panelName = panel.getAttribute('data-tab') || 'editor';
            panel.classList.toggle('hidden', panelName !== 'preview');
          });
          const picker = card.querySelector('.preview-contact-picker');
          if (picker) picker.classList.remove('hidden');
          try { scheduleStepSave(step.id); } catch (_) { /* noop */ }
        }
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
    // Enabled, but constrained to the step header so it never conflicts with
    // preview/contact selection or editor interactions.
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
            try { window.crm && window.crm.showToast && window.crm.showToast('Templates coming soon'); } catch (_) { }
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
              try { btn.setAttribute('aria-expanded', 'false'); } catch (_) { }
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
        // Clean all string fields in result to remove citations
        if (result && typeof result === 'object') {
          Object.keys(result).forEach(key => {
            if (typeof result[key] === 'string') {
              result[key] = result[key].replace(/\[\d+\]/g, '').trim();
            } else if (Array.isArray(result[key])) {
              result[key] = result[key].map(item =>
                typeof item === 'string' ? item.replace(/\[\d+\]/g, '').trim() : item
              );
            }
          });
        }

        const subject = (result.subject || 'Energy Solutions');
        const html = result.output || result.html || '<p>Email content</p>';
        // Light de-salesify on subject only (avoid mutating structured HTML templates)
        const cleanSubject = String(subject)
          .replace(/\bAt Power Choosers,?\s+we\b/gi, 'We')
          .replace(/\bAt Power Choosers,?\s+I\b/gi, 'I')
          .replace(/\bPower Choosers helps\b/gi, 'We help')
          .replace(/\bPower Choosers can help\b/gi, 'We can help')
          .replace(/\bPower Choosers\b/gi, 'We');
        // HTML content is already cleaned above
        const cleanHtml = String(html);
        return { subject: cleanSubject, html: cleanHtml };
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
          // Clean all string fields in jsonData to remove citations
          Object.keys(jsonData).forEach(key => {
            if (typeof jsonData[key] === 'string') {
              jsonData[key] = jsonData[key].replace(/\[\d+\]/g, '').trim();
            } else if (Array.isArray(jsonData[key])) {
              jsonData[key] = jsonData[key].map(item =>
                typeof item === 'string' ? item.replace(/\[\d+\]/g, '').trim() : item
              );
            }
          });

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
            .replace(/\bPower Choosers\b/gi, 'We')
            .replace(/\[\d+\]/g, ''); // Remove citation brackets
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

          // Check if this button uses dynamic templates
          const isVariant = btn.getAttribute('data-cta-variant') === 'true';
          const template = btn.getAttribute('data-prompt-template');

          let prompt;

          if (template) {
            // Handle template-based prompts
            switch (template) {
              case 'first-email-intro':
                // Build prompt with random CTA
                // Try to detect role from selected contact if available
                const stepId = card?.getAttribute('data-id');
                const step = state.currentSequence?.steps?.find(s => s.id === stepId);
                const selectedContact = step?.data?.previewContact;
                const contactRole = selectedContact?.title || selectedContact?.job || selectedContact?.role || 'all';

                // Determine if finance role for CTA selection
                const role = (contactRole && typeof contactRole === 'string' &&
                  (contactRole.toLowerCase().includes('finance') ||
                    contactRole.toLowerCase().includes('cfo') ||
                    contactRole.toLowerCase().includes('controller') ||
                    contactRole.toLowerCase().includes('accounting'))) ? 'finance' : 'all';

                prompt = buildFirstEmailIntroPrompt(true, role);
                break;

              case 'follow-up-value':
                // Try to detect role from selected contact if available
                const stepId2 = card?.getAttribute('data-id');
                const step2 = state.currentSequence?.steps?.find(s => s.id === stepId2);
                const selectedContact2 = step2?.data?.previewContact;
                const contactRole2 = selectedContact2?.title || selectedContact2?.job || selectedContact2?.role || 'all';

                // Determine if finance role for CTA selection
                const role2 = (contactRole2 && typeof contactRole2 === 'string' &&
                  (contactRole2.toLowerCase().includes('finance') ||
                    contactRole2.toLowerCase().includes('cfo') ||
                    contactRole2.toLowerCase().includes('controller') ||
                    contactRole2.toLowerCase().includes('accounting'))) ? 'finance' : 'all';

                prompt = buildFollowUpValuePrompt(true, role2);
                break;

              case 'follow-up-curiosity':
                // Try to detect role from selected contact if available
                const stepId3 = card?.getAttribute('data-id');
                const step3 = state.currentSequence?.steps?.find(s => s.id === stepId3);
                const selectedContact3 = step3?.data?.previewContact;
                const contactRole3 = selectedContact3?.title || selectedContact3?.job || selectedContact3?.role || 'all';

                // Determine if finance role for CTA selection
                const role3 = (contactRole3 && typeof contactRole3 === 'string' &&
                  (contactRole3.toLowerCase().includes('finance') ||
                    contactRole3.toLowerCase().includes('cfo') ||
                    contactRole3.toLowerCase().includes('controller') ||
                    contactRole3.toLowerCase().includes('accounting'))) ? 'finance' : 'all';

                prompt = buildFollowUpCuriosityPrompt(true, role3);
                break;

              case 'nurture-value':
                prompt = buildNurtureValuePrompt();
                break;

              case 'post-convo-recap':
                prompt = buildPostConvoRecapPrompt();
                break;

              case 'info-request-bill':
                prompt = buildInfoRequestBillPrompt();
                break;

              case 'final-ask-close':
                prompt = buildFinalAskClosePrompt();
                break;

              case 'objection-all-set':
                prompt = buildObjectionAllSetPrompt();
                break;

              case 'objection-interested':
                prompt = buildObjectionInterestedPrompt();
                break;

              case 'objection-not-interested':
                prompt = buildObjectionNotInterestedPrompt();
                break;

              case 'breakup-email':
                prompt = buildBreakupEmailPrompt();
                break;

              default:
                // Fallback to static prompt
                prompt = btn.getAttribute('data-prompt');
            }
          } else {
            // Use static prompt
            prompt = btn.getAttribute('data-prompt');
          }

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
            // Get settings for industry segmentation and market context
            const settings = (window.SettingsPage?.getSettings?.()) || {};
            const industrySegmentation = settings?.industrySegmentation || null;
            const aiTemplates = settings?.aiTemplates || {};
            const marketContext = aiTemplates.marketContext || { enabled: false };
            const meetingPreferences = aiTemplates.meetingPreferences || { enabled: false };

            // Substitute bracket tokens in prompt before sending to API
            const substitutedPrompt = selectedContact
              ? substituteBracketTokensInPrompt(prompt, selectedContact)
              : prompt;

            const response = await fetch(`${base}/api/perplexity-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: substitutedPrompt,
                mode: mode,
                recipient: (() => {
                  // Build enriched recipient object with account data
                  const recipient = {
                    name: selectedContact.full_name || selectedContact.name || '',
                    firstName: selectedContact.first_name || selectedContact.firstName || (selectedContact.name?.split(' ')[0] || ''),
                    lastName: selectedContact.last_name || selectedContact.lastName || (selectedContact.name?.split(' ').slice(1).join(' ') || ''),
                    company: selectedContact.company || selectedContact.accountName || '',
                    email: selectedContact.email || '',
                    title: selectedContact.title || selectedContact.job || selectedContact.role || '',
                    linkedin: selectedContact.linkedin || selectedContact.linkedinUrl || '',
                    linkedinUrl: selectedContact.linkedin || selectedContact.linkedinUrl || '',
                    seniority: selectedContact.seniority || '',
                    department: selectedContact.department || '',
                    industry: selectedContact.industry || selectedContact.account?.industry || ''
                  };

                  // Add account data if available
                  if (selectedContact.account || selectedContact.account_id) {
                    const accountId = selectedContact.account?.id || selectedContact.account_id;
                    // Try to get account from cache
                    let account = null;
                    if (window.BackgroundAccountsLoader) {
                      const accounts = window.BackgroundAccountsLoader.getAccountsData() || [];
                      account = accounts.find(a => a.id === accountId) || null;
                    }

                    if (account) {
                      recipient.account = {
                        id: account.id,
                        name: account.accountName || account.name || '',
                        industry: account.industry || '',
                        domain: account.domain || account.website || '',
                        city: account.city || account.billingCity || account.locationCity || '',
                        state: account.state || account.billingState || account.region || '',
                        shortDescription: account.shortDescription || account.short_desc || account.descriptionShort || account.description || '',
                        linkedin: account.linkedin || account.linkedinUrl || account.companyLinkedin || '',
                        linkedinUrl: account.linkedin || account.linkedinUrl || account.companyLinkedin || '',
                        employees: account.employees || account.companyEmployees || null,
                        squareFootage: account.squareFootage || account.square_footage || account.companySquareFootage || null,
                        occupancyPct: account.occupancyPct || account.occupancy_pct || account.companyOccupancyPct || null,
                        annualUsage: account.annualUsage || account.annualKilowattUsage || account.annual_usage || '',
                        electricitySupplier: account.electricitySupplier || '',
                        currentRate: account.currentRate || '',
                        contractEndDate: account.contractEndDate || account.contractEnd || account.contract_end_date || ''
                      };

                      recipient.energy = {
                        supplier: account.electricitySupplier || '',
                        currentRate: account.currentRate || '',
                        usage: account.annualUsage || '',
                        contractEnd: account.contractEndDate || account.contractEnd || ''
                      };

                      // Set industry from account if not already set
                      if (!recipient.industry && account.industry) {
                        recipient.industry = account.industry;
                      }
                    }
                  }

                  // Also include account data directly from contact if present
                  if (selectedContact.account) {
                    recipient.account = { ...selectedContact.account };
                    if (selectedContact.account.industry && !recipient.industry) {
                      recipient.industry = selectedContact.account.industry;
                    }
                  }

                  return recipient;
                })(),
                senderName: senderFirst || ' ',
                marketContext: marketContext,
                meetingPreferences: meetingPreferences,
                industrySegmentation: industrySegmentation
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

              // Get signature for preview
              const stepId = card.getAttribute('data-id');
              const step = state.currentSequence?.steps?.find(s => s.id === stepId);
              const isAuto = step?.type === 'auto-email';
              const signature = step ? getSignatureForPreview(step, isAuto) : '';

              if (previewBodyEl && html) {
                previewBodyEl.innerHTML = html + signature;
              }
              if (previewSubjectEl && subject) { previewSubjectEl.textContent = subject; }

              // Update AI lifecycle state only – do not overwrite manual subject/body until saved
              if (step) {
                if (!step.data) step.data = {};
                step.data.aiOutput = { subject, html };
                step.data.aiStatus = 'generated';
                try { scheduleStepSave(step.id); } catch (_) { }
                
                // Enable the save button by updating its disabled state
                const saveBtn = card?.querySelector('.ai-save-to-step');
                if (saveBtn) {
                  saveBtn.disabled = false;
                  saveBtn.removeAttribute('disabled');
                }
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

    // AI Save to step / revert handlers - Use event delegation for reliability
    if (!container.dataset.aiSaveDelegated) {
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('.ai-save-to-step');
        if (!btn || btn.disabled) return;
        
        const card = btn.closest('.step-card');
        if (!card) return;
        
        const id = card.getAttribute('data-id');
        if (!id) return;
        
        const step = state.currentSequence?.steps?.find(s => s.id === id);
        if (!step) {
          console.warn('[SequenceBuilder] Save to step: Step not found for ID:', id);
          return;
        }
        
        if (!step.data) step.data = {};
        
        // Extract AI output from step data OR from DOM preview as fallback
        let aiSubject = '';
        let aiBody = '';
        
        if (step.data.aiOutput) {
          // Use stored aiOutput if available
          aiSubject = step.data.aiOutput.subject || '';
          aiBody = step.data.aiOutput.html || '';
        } else {
          // Fallback: Extract from DOM preview if aiOutput is missing
          const previewSubjectEl = card.querySelector('.preview-subject');
          const previewBodyEl = card.querySelector('.preview-body');
          
          if (previewSubjectEl) {
            aiSubject = previewSubjectEl.textContent?.trim() || previewSubjectEl.innerText?.trim() || '';
          }
          
          if (previewBodyEl) {
            // Get HTML content, but remove signature if present
            let bodyHtml = previewBodyEl.innerHTML || '';
            // Remove signature (it's added for preview but shouldn't be saved)
            const signature = getSignatureForPreview(step, step.type === 'auto-email');
            if (signature && bodyHtml.includes(signature)) {
              bodyHtml = bodyHtml.replace(signature, '');
            }
            aiBody = bodyHtml.trim();
          }
          
          // If we extracted from DOM, store it in aiOutput for future reference
          if (aiSubject || aiBody) {
            step.data.aiOutput = { subject: aiSubject, html: aiBody };
            console.log('[SequenceBuilder] Extracted AI output from DOM preview');
          }
        }
        
        // Validate we have content to save
        if (!aiSubject && !aiBody) {
          console.warn('[SequenceBuilder] Save to step: No AI output found to save');
          if (window.crm?.showToast) {
            window.crm.showToast('No generated content to save. Please generate first.', 'error');
          }
          return;
        }

        // Preserve the AI prompt text from the textarea
        const promptTextarea = card.querySelector('.ai-prompt');
        if (promptTextarea && promptTextarea.value.trim()) {
          step.data.aiPrompt = promptTextarea.value.trim();
        }

        // Save the generated content to step data
        step.data.subject = aiSubject || step.data.subject || '';
        step.data.body = aiBody || step.data.body || '';
        step.data.aiStatus = 'saved';
        step.data.savedAt = Date.now(); // Store timestamp
        
        console.log('[SequenceBuilder] Saving AI output to step:', {
          stepId: step.id,
          hasSubject: !!step.data.subject,
          hasBody: !!step.data.body,
          subjectLength: step.data.subject?.length || 0,
          bodyLength: step.data.body?.length || 0
        });
        
        try { 
          scheduleStepSave(step.id, true); 
        } catch (saveErr) {
          console.error('[SequenceBuilder] Error scheduling step save:', saveErr);
        }

        // Show toast notification
        if (window.crm && typeof window.crm.showToast === 'function') {
          const timeStr = new Date().toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
          window.crm.showToast(`AI prompt saved at ${timeStr}`);
        }

        // Re-render to update UI state
        try {
          render();
        } catch (renderErr) {
          console.error('[SequenceBuilder] Error during render after save:', renderErr);
        }
      });
      container.dataset.aiSaveDelegated = '1';
    }
    container.querySelectorAll('.step-card .switch-to-manual').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.step-card');
        const id = card?.getAttribute('data-id');
        const step = state.currentSequence.steps.find(s => s.id === id);
        if (!step) return;
        if (!step.data) step.data = {};
        step.data.mode = 'manual';
        try { scheduleStepSave(step.id); } catch (_) { }
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
              try { execRich(editor, 'hiliteColor', 'transparent'); } catch (_) { }
              try { execRich(editor, 'backColor', 'transparent'); } catch (_) { }
              try { execRich(editor, 'hiliteColor', 'initial'); } catch (_) { }
              try { execRich(editor, 'backColor', 'initial'); } catch (_) { }
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
        const isAuto = step?.type === 'auto-email';
        const signature = getSignatureForPreview(step, isAuto);

        if (contact) {
          subjEl && (subjEl.innerHTML = substituteContactTokensInText(subjRaw, contact) || '(no subject)');
          bodyEl && (bodyEl.innerHTML = (processBodyHtmlWithContact(bodyRaw, contact) || '(empty)') + signature);
        } else {
          subjEl && (subjEl.textContent = subjRaw || '(no subject)');
          bodyEl && (bodyEl.innerHTML = (bodyRaw || '(empty)') + signature);
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

    // Only allow dragging from the step header area (not the whole card) so
    // clicks inside the body, preview picker, editor, etc. can never start a drag.
    container.querySelectorAll('.step-card').forEach(stepCard => {
      const headerEl = stepCard.querySelector('.step-header');
      if (!headerEl) return;
      let holdTimer = null;
      let startPos = { x: 0, y: 0 };

      // Mouse down - start hold timer
      headerEl.addEventListener('mousedown', (e) => {
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
      headerEl.addEventListener('mousemove', (e) => {
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
      headerEl.addEventListener('mouseup', () => {
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
      });

      // Mouse leave - cancel hold timer
      headerEl.addEventListener('mouseleave', () => {
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
      } catch (_) { }

      // Create drop placeholder
      createDropPlaceholder(stepItem);
      // Insert placeholder at the current position to preserve layout space
      try {
        if (stepItem.parentNode) {
          stepItem.parentNode.insertBefore(dragState.dropPlaceholder, stepItem);
        }
      } catch (_) { }

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

      // Update position fields for all steps to maintain explicit order
      steps.forEach((s, idx) => {
        s.position = idx;
      });

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
      } catch (_) { }

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
      const baseUrl = window.API_BASE_URL || window.location.origin || '';
      const response = await fetch(`${baseUrl}/api/email/sendgrid-send`, {
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
      console.log('[SequenceBuilder] Starting sequence for single contact via server-side processing:', contactData);

      // Get user email for ownership
      const getUserEmail = () => {
        try {
          if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
            return window.DataManager.getCurrentUserEmail();
          }
          return (window.currentUserEmail || '').toLowerCase();
        } catch (_) {
          return (window.currentUserEmail || '').toLowerCase();
        }
      };
      const userEmail = getUserEmail();

      if (!userEmail) {
        throw new Error('User email not found');
      }

      // Resolve contact ID from contactData
      let contactId = contactData.id || contactData.contactId;

      if (!contactId) {
        // Try to find contact by email in people data
        if (contactData.email && window.getPeopleData && typeof window.getPeopleData === 'function') {
          const contacts = window.getPeopleData() || [];
          const match = contacts.find(c => c && (c.email || '').toLowerCase() === contactData.email.toLowerCase());
          if (match) {
            contactId = match.id;
          }
        }

        // If still no contact ID, generate a temporary one
        if (!contactId) {
          contactId = `temp_contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          console.warn('[SequenceBuilder] Generated temporary contact ID:', contactId);
        }
      }

      // Create sequenceActivation document with single contact
      const activationRef = window.firebaseDB.collection('sequenceActivations').doc();
      const activationId = activationRef.id;

      const sequenceActivationData = {
        sequenceId: sequence.id,
        contactIds: [contactId],
        status: 'pending',
        processedContacts: 0,
        totalContacts: 1,
        ownerId: userEmail,
        assignedTo: userEmail,
        createdBy: userEmail,
        createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
      };

      await activationRef.set(sequenceActivationData);
      console.log('[SequenceBuilder] Created sequenceActivation:', activationId);

      // Show progress toast
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast(`Sequence queued for ${contactData.name || contactData.email}. Processing...`, 'info');
      }

      // Call server endpoint to process immediately
      try {
        const baseUrl = window.API_BASE_URL || window.location.origin || '';
        const response = await fetch(`${baseUrl}/api/process-sequence-activations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            immediate: true,
            activationId: activationId
          })
        });

        if (response.ok) {
          const result = await response.json();
          console.log('[SequenceBuilder] Sequence activation triggered:', result);

          if (window.crm && typeof window.crm.showToast === 'function') {
            window.crm.showToast(`✓ Sequence started for ${contactData.name || contactData.email}!`, 'success');
          }

          return {
            tasks: [],
            scheduledEmailCount: result.emailsCreated || 0,
            success: true
          };
        } else {
          const errorText = await response.text();
          console.error('[SequenceBuilder] Failed to trigger processing:', response.status, errorText);

          // Update activation to failed
          await activationRef.update({
            status: 'failed',
            errorMessage: errorText
          });

          if (window.crm && typeof window.crm.showToast === 'function') {
            window.crm.showToast(`Failed to start sequence: ${errorText}`, 'error');
          }

          return {
            tasks: [],
            scheduledEmailCount: 0,
            success: false
          };
        }
      } catch (apiError) {
        console.error('[SequenceBuilder] Error calling API:', apiError);

        // Update activation to failed
        try {
          await activationRef.update({
            status: 'failed',
            errorMessage: apiError.message
          });
        } catch (updateError) {
          console.error('[SequenceBuilder] Failed to update activation status:', updateError);
        }

        if (window.crm && typeof window.crm.showToast === 'function') {
          window.crm.showToast(`Failed to start sequence: ${apiError.message}`, 'error');
        }

        return {
          tasks: [],
          scheduledEmailCount: 0,
          success: false
        };
      }
    } catch (error) {
      console.error('[SequenceBuilder] Error starting sequence:', error);
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Failed to start sequence. Please try again.', 'error');
      }
      return {
        tasks: [],
        scheduledEmailCount: 0,
        success: false
      };
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
    state, // Export state for pagination buttons
    render, // Export render for pagination buttons
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
    },
    fixStuckMembers: async (sequenceId) => {
      // Diagnostic tool to find members that have no activation record and start them

      // 1. Try passed ID
      if (!sequenceId) {
        // 2. Try global variable exposed by render()
        if (window.currentSequenceId) {
          sequenceId = window.currentSequenceId;
        }

        // 3. Try URL hash (fallback)
        const hash = window.location.hash;
        if (hash) {
          const parts = hash.split('/');
          const seqPart = parts.find(p => p.startsWith('seq-'));
          if (seqPart) sequenceId = seqPart;
        }
      }

      // 4. Try DOM (look for header or container with ID)
      if (!sequenceId) {
        const header = document.getElementById('sequence-builder-header');
        // Sometimes ID is stored on the container or we can find it in the edit button
        const editBtn = document.getElementById('edit-seq-title-btn');
        // Or look for any element with data-id starting with seq-
        const seqEl = document.querySelector('[data-id^="seq-"]');
        if (seqEl) sequenceId = seqEl.getAttribute('data-id');
      }

      if (!sequenceId) return console.error('Could not detect sequenceId. Please provide it: fixStuckMembers("seq-...")');

      const db = window.firebaseDB;
      console.log(`[Fix] Checking sequence ${sequenceId}...`);

      // 1. Get all members
      const membersSnap = await db.collection('sequenceMembers').where('sequenceId', '==', sequenceId).get();
      const memberContactIds = new Set();
      membersSnap.forEach(doc => memberContactIds.add(doc.data().targetId));
      console.log(`[Fix] Found ${memberContactIds.size} members.`);

      // 2. Get all activations
      const activationsSnap = await db.collection('sequenceActivations').where('sequenceId', '==', sequenceId).get();
      const activatedContactIds = new Set();
      activationsSnap.forEach(doc => {
        const d = doc.data();
        if (d.contactIds) d.contactIds.forEach(id => activatedContactIds.add(id));
      });
      console.log(`[Fix] Found ${activatedContactIds.size} contacts already activated.`);

      // 3. Find missing
      const missingIds = [...memberContactIds].filter(id => !activatedContactIds.has(id));
      console.log(`[Fix] Found ${missingIds.length} stuck contacts.`);

      if (missingIds.length === 0) return 'All good! No stuck contacts.';

      // 4. Create activations
      const batchSize = 25;
      let created = 0;
      const userEmail = (window.currentUserEmail || 'admin').toLowerCase();

      for (let i = 0; i < missingIds.length; i += batchSize) {
        const batchIds = missingIds.slice(i, i + batchSize);
        const ref = db.collection('sequenceActivations').doc();
        await ref.set({
          sequenceId,
          contactIds: batchIds,
          status: 'pending',
          processedContacts: 0,
          totalContacts: batchIds.length,
          ownerId: userEmail,
          assignedTo: userEmail,
          createdBy: userEmail,
          createdAt: new Date(),
          progress: { emailsCreated: 0 },
          failedContactIds: []
        });
        created++;

        // Trigger immediate processing
        fetch('/api/process-sequence-activations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ immediate: true, activationId: ref.id })
        }).catch(e => console.warn(e));
      }
      return `Fixed! Started ${created} activation batches for ${missingIds.length} contacts.`;
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

  // ===== Email Validation Modal =====
  async function showEmailValidationModal(contactsWithoutEmail, totalContacts = null) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'pc-modal__backdrop';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');

      const validCount = totalContacts ? (totalContacts - contactsWithoutEmail.length) : 0;
      const invalidCount = contactsWithoutEmail.length;
      const isSingle = invalidCount === 1 && !totalContacts;

      const contactsList = contactsWithoutEmail.slice(0, 5).map(c =>
        `<li style="margin-bottom: 8px;">• ${escapeHtml(c.name || (c.firstName + ' ' + (c.lastName || '')).trim() || 'Unknown')} ${c.company ? `(${escapeHtml(c.company)})` : ''}</li>`
      ).join('');
      const moreCount = invalidCount > 5 ? ` + ${invalidCount - 5} more` : '';

      overlay.innerHTML = `
        <div class="pc-modal__dialog" style="max-width: 500px;">
          <div class="pc-modal__header">
            <h2 style="display: flex; align-items: center; gap: 12px;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffc107" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span>Email Validation Warning</span>
            </h2>
            <button type="button" class="pc-modal__close" id="email-validation-close" aria-label="Close">×</button>
          </div>
          <div class="pc-modal__body">
            ${totalContacts ? `
              <p style="margin-bottom: 16px; font-size: 15px;">
                <strong>${totalContacts} contacts selected</strong><br>
                ${validCount} ${validCount === 1 ? 'contact has' : 'contacts have'} valid email${validCount === 1 ? '' : 's'}<br>
                <span style="color: #ffc107;">${invalidCount} ${invalidCount === 1 ? 'contact is' : 'contacts are'} missing email addresses</span>
              </p>
            ` : `
              <p style="margin-bottom: 16px; font-size: 15px; color: #ffc107;">
                <strong>This contact is missing an email address.</strong>
              </p>
            `}
            
            ${invalidCount > 0 ? `
              <p style="margin-bottom: 8px; font-weight: 600;">Contacts without emails:</p>
              <ul style="margin-left: 20px; margin-bottom: 16px; color: var(--text-muted);">
                ${contactsList}
                ${moreCount ? `<li style="margin-top: 8px; font-style: italic;">${moreCount}</li>` : ''}
              </ul>
            ` : ''}
            
            <p style="margin-bottom: 0; font-size: 14px; color: var(--text-muted); background: var(--bg-item); padding: 12px; border-radius: var(--border-radius-sm); border-left: 3px solid #ffc107;">
              <strong>Note:</strong> Contacts without emails will be added to the sequence, but <strong>email steps will be automatically skipped</strong>. They will only receive phone calls, LinkedIn messages, or other non-email touchpoints.
            </p>
          </div>
          <div class="pc-modal__footer">
            <button type="button" class="btn btn-text" id="email-validation-cancel">Cancel</button>
            ${!isSingle && validCount > 0 ? `
              <button type="button" class="btn btn-secondary" id="email-validation-valid-only">Add ${validCount} with Emails Only</button>
            ` : ''}
            <button type="button" class="btn btn-primary" id="email-validation-proceed">Add ${totalContacts || 'Anyway'}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      // Show modal with animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          overlay.classList.add('show');
        });
      });

      // Event handlers
      const close = (result) => {
        overlay.classList.remove('show');
        setTimeout(() => {
          if (overlay.parentElement) {
            overlay.parentElement.removeChild(overlay);
          }
        }, 200);
        resolve(result);
      };

      overlay.querySelector('#email-validation-close')?.addEventListener('click', () => close({ proceed: false }));
      overlay.querySelector('#email-validation-cancel')?.addEventListener('click', () => close({ proceed: false }));
      overlay.querySelector('#email-validation-proceed')?.addEventListener('click', () => close({ proceed: true, validOnly: false }));
      overlay.querySelector('#email-validation-valid-only')?.addEventListener('click', () => close({ proceed: true, validOnly: true }));

      // Click outside to close
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          close({ proceed: false });
        }
      });

      // Escape key
      const onEscape = (e) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', onEscape);
          close({ proceed: false });
        }
      };
      document.addEventListener('keydown', onEscape);
    });
  }

})();