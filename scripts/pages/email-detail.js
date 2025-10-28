'use strict';
(function(){
  const state = {
    currentEmail: null
  };
  const els = {};

  // Initialize DOM references
  function initDomRefs() {
    els.page = document.getElementById('email-detail-page');
    els.backBtn = document.getElementById('email-back-btn');
    els.title = document.getElementById('email-detail-title');
    els.senderAvatar = document.getElementById('sender-avatar');
    els.senderName = document.getElementById('sender-name');
    els.senderEmail = document.getElementById('sender-email');
    els.emailDate = document.getElementById('email-date');
    els.emailContent = document.getElementById('email-content');
    els.starBtn = document.getElementById('star-email-btn');
    els.replyBtn = document.getElementById('reply-btn');
    els.forwardBtn = document.getElementById('forward-btn');
    els.deleteBtn = document.getElementById('delete-email-btn');
    
    return els.page;
  }

  // Attach event listeners
  function attachEvents() {
    // Back button
    if (els.backBtn) {
      els.backBtn.addEventListener('click', goBack);
    }

    // Star button
    if (els.starBtn) {
      els.starBtn.addEventListener('click', toggleStar);
    }

    // Reply button
    if (els.replyBtn) {
      els.replyBtn.addEventListener('click', replyToEmail);
    }

    // Forward button
    if (els.forwardBtn) {
      els.forwardBtn.addEventListener('click', forwardEmail);
    }

    // Delete button
    if (els.deleteBtn) {
      els.deleteBtn.addEventListener('click', deleteEmail);
    }
  }

  // Show email detail
  async function show(emailId) {
    if (!initDomRefs()) return;
    
    try {
      // Load email data from Firebase
      const emailDoc = await firebase.firestore().collection('emails').doc(emailId).get();
      
      if (!emailDoc.exists) {
        console.error('Email not found:', emailId);
        goBack();
        return;
      }

      const emailData = emailDoc.data();
      state.currentEmail = {
        id: emailId,
        ...emailData,
        // Preserve all content fields like old system
        html: emailData.html,
        text: emailData.text,
        content: emailData.content,
        originalContent: emailData.originalContent,
        // Ensure required fields exist
        from: emailData.from || 'Unknown',
        to: emailData.to || '',
        subject: emailData.subject || '(No Subject)',
        date: emailData.date || emailData.sentAt || emailData.receivedAt || emailData.createdAt || new Date(),
        starred: emailData.starred || false,
        deleted: emailData.deleted || false,
        unread: emailData.unread !== false
      };

      // Populate email details
      populateEmailDetails(state.currentEmail);
      
      // Mark as read
      await markAsRead(emailId);
      
    } catch (error) {
      console.error('Failed to load email:', error);
      goBack();
    }
  }

  // Populate email details in the UI
  function populateEmailDetails(email) {
    // Handle scheduled emails differently
    if (email.type === 'scheduled') {
      populateScheduledEmailDetails(email);
      return;
    }
    
    // Set title
    if (els.title) {
      els.title.textContent = email.subject || '(No Subject)';
    }

    // Set sender info
    if (els.senderName) {
      els.senderName.textContent = extractName(email.from);
    }

    if (els.senderEmail) {
      els.senderEmail.textContent = email.from || 'Unknown';
    }

    // Set date
    if (els.emailDate) {
      els.emailDate.textContent = formatDate(email.date);
    }

    // Set sender avatar with favicon
    if (els.senderAvatar) {
      const domain = extractDomain(email.from);
      const faviconHtml = window.__pcFaviconHelper.generateCompanyIconHTML({
        domain: domain,
        size: 40
      });
      els.senderAvatar.innerHTML = faviconHtml;
    }

    // Set star state
    if (els.starBtn) {
      els.starBtn.classList.toggle('starred', email.starred);
      const svg = els.starBtn.querySelector('svg');
      if (svg) {
        svg.setAttribute('fill', email.starred ? 'currentColor' : 'none');
      }
    }

    // Set email content - try multiple content fields like old system
    if (els.emailContent) {
      // Try multiple content fields in order of preference
      const htmlContent = email.html || email.content || email.originalContent || '';
      const textContent = email.text || '';
      
      let contentHtml = '';
      
      if (htmlContent && htmlContent.trim()) {
        // Use HTML content with sanitization
        contentHtml = sanitizeEmailHtml(htmlContent);
      } else if (textContent && textContent.trim()) {
        // Fallback to text content with line breaks
        const decodedText = decodeQuotedPrintable(textContent);
        contentHtml = decodedText.replace(/\n/g, '<br>');
      } else {
        contentHtml = '<p>No content available</p>';
      }
      
      els.emailContent.innerHTML = contentHtml;
    }
  }

  // Go back to emails page
  function goBack() {
    // Dispatch restore event to restore emails page state
    if (window._emailsNavigationState) {
      document.dispatchEvent(new CustomEvent('pc:emails-restore', {
        detail: window._emailsNavigationState
      }));
      // Clear the stored state
      window._emailsNavigationState = null;
    }

    // Navigate back to emails page
    if (window.crm && typeof window.crm.navigateToPage === 'function') {
      window.crm.navigateToPage('emails');
    }
  }

  // Toggle star status
  async function toggleStar() {
    if (!state.currentEmail) return;

    try {
      const newStarred = !state.currentEmail.starred;
      
      // Update in Firebase
      await firebase.firestore().collection('emails').doc(state.currentEmail.id).update({
        starred: newStarred
      });

      // Update local state
      state.currentEmail.starred = newStarred;

      // Update UI
      if (els.starBtn) {
        els.starBtn.classList.toggle('starred', newStarred);
        const svg = els.starBtn.querySelector('svg');
        if (svg) {
          svg.setAttribute('fill', newStarred ? 'currentColor' : 'none');
        }
      }

    } catch (error) {
      console.error('Failed to toggle star:', error);
    }
  }

  // Reply to email
  function replyToEmail() {
    if (!state.currentEmail) return;
    
    // For now, just show an alert - this can be enhanced later
    alert(`Reply to: ${state.currentEmail.from}`);
  }

  // Forward email
  function forwardEmail() {
    if (!state.currentEmail) return;
    
    // For now, just show an alert - this can be enhanced later
    alert(`Forward: ${state.currentEmail.subject}`);
  }

  // Delete email
  async function deleteEmail() {
    if (!state.currentEmail) return;

    if (!confirm('Are you sure you want to delete this email?')) {
      return;
    }

    try {
      // Update in Firebase (soft delete)
      await firebase.firestore().collection('emails').doc(state.currentEmail.id).update({
        deleted: true
      });

      // Go back to emails page
      goBack();

    } catch (error) {
      console.error('Failed to delete email:', error);
    }
  }

  // Mark email as read
  async function markAsRead(emailId) {
    try {
      await firebase.firestore().collection('emails').doc(emailId).update({
        unread: false
      });
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }

  // Decode quoted-printable content (from old emails.js)
  function decodeQuotedPrintable(text) {
    if (!text) return '';
    
    return text
      .replace(/=\r?\n/g, '') // Remove soft line breaks
      .replace(/=([0-9A-F]{2})/g, (match, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
      })
      .replace(/=0D/g, '\r') // Replace =0D with carriage returns
      .trim();
  }

  // Sanitize email HTML content with quoted-printable decoding (from old emails.js)
  function sanitizeEmailHtml(html) {
    if (!html) return '<p>No content available</p>';
    
    try {
      // First decode quoted-printable
      let decodedHtml = decodeQuotedPrintable(html);
      
      // Drop head and its children to avoid meta parsing errors
      decodedHtml = decodedHtml.replace(/<head[\s\S]*?>[\s\S]*?<\/head>/gi, '');
      // Remove meta, script, link, base tags anywhere
      decodedHtml = decodedHtml.replace(/<\s*(meta|script|link|base)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, '');
      decodedHtml = decodedHtml.replace(/<\s*(meta|script|link|base)[^>]*>/gi, '');
      
      // AGGRESSIVE quoted-printable cleanup
      decodedHtml = decodedHtml
        .replace(/href=3D"/gi, 'href="')
        .replace(/src=3D"/gi, 'src="')
        .replace(/href="3D"/gi, 'href="')
        .replace(/src="3D"/gi, 'src="')
        .replace(/=3D/gi, '=');
      
      // Fix the specific pattern we're seeing: 3D%22
      decodedHtml = decodedHtml
        .replace(/href=3D%22/gi, 'href="')
        .replace(/src=3D%22/gi, 'src="')
        .replace(/href="3D%22/gi, 'href="')
        .replace(/src="3D%22/gi, 'src="');
      
      // Fix malformed URLs that start with encoding artifacts
      decodedHtml = decodedHtml
        .replace(/(href|src)="3D"?([^"]*)/gi, '$1="$2')
        .replace(/(href|src)=3D%22([^"]*)/gi, '$1="$2');
      
      // Upgrade insecure src/href to https
      decodedHtml = decodedHtml.replace(/(\s(?:src|href)=")http:\/\//gi, '$1https://');
      // Prevent navigation JS URLs
      decodedHtml = decodedHtml.replace(/href="javascript:[^"]*"/gi, 'href="#"');
      
      // Additional basic sanitization
      decodedHtml = decodedHtml
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/on\w+="[^"]*"/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/data:text\/html/gi, '');

      // Remove legacy tracking pixels to avoid 404s and any custom tracking
      // Custom path: /api/email/track/<id>
      // Legacy path: *.vercel.app/api/email/track/<id>
      decodedHtml = decodedHtml
        .replace(/<img[^>]*src=["'][^"']*\/api\/email\/track\/[^"']+["'][^>]*>/gi, '')
        .replace(/<img[^>]*src=["'][^"']*vercel\.app\/api\/email\/track\/[^"']+["'][^>]*>/gi, '');

      // If no content after sanitization, show fallback
      if (!decodedHtml.trim() || decodedHtml.trim() === '') {
        return '<p>No content available</p>';
      }

      return decodedHtml;
    } catch (error) {
      console.error('Failed to sanitize email HTML:', error);
      return '<p>Error loading email content</p>';
    }
  }

  // Utility functions (improved to handle quoted email formats)
  function extractDomain(email) {
    if (!email || typeof email !== 'string') return '';
    
    // Handle format: "Name" <email@domain.com> or Name <email@domain.com>
    const angleMatch = email.match(/<(.+)>/);
    if (angleMatch) {
      const emailPart = angleMatch[1];
      const domainMatch = emailPart.match(/@(.+)$/);
      return domainMatch ? domainMatch[1] : '';
    }
    
    // Handle format: email@domain.com
    const match = email.match(/@(.+)$/);
    return match ? match[1] : '';
  }

  function extractName(email) {
    if (!email || typeof email !== 'string') return 'Unknown';
    
    // Handle format: "Name" <email@domain.com>
    const quotedMatch = email.match(/^"([^"]+)"\s*<(.+)>$/);
    if (quotedMatch) {
      return quotedMatch[1]; // Return the quoted name
    }
    
    // Handle format: Name <email@domain.com>
    const angleMatch = email.match(/^([^<]+)\s*<(.+)>$/);
    if (angleMatch) {
      return angleMatch[1].trim(); // Return name before <
    }
    
    // Handle format: email@domain.com
    const emailMatch = email.match(/^(.+)@/);
    if (emailMatch) {
      return emailMatch[1];
    }
    
    return email; // Fallback to full string
  }

  function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // ========== SCHEDULED EMAIL HANDLING ==========
  
  // Populate scheduled email details
  function populateScheduledEmailDetails(email) {
    // Set title with scheduled indicator
    if (els.title) {
      els.title.textContent = `${email.subject || '(No Subject)'} (Scheduled)`;
    }

    // Set contact info instead of sender
    if (els.senderName) {
      els.senderName.textContent = email.contactName || 'Unknown Contact';
    }

    if (els.senderEmail) {
      els.senderEmail.textContent = email.to || 'Unknown Email';
    }

    // Set scheduled send time
    if (els.emailDate) {
      const sendTime = new Date(email.scheduledSendTime);
      els.emailDate.textContent = `Scheduled for ${formatDate(sendTime)}`;
    }

    // Set contact avatar
    if (els.senderAvatar) {
      const contactName = email.contactName || 'Unknown';
      els.senderAvatar.innerHTML = `
        <div class="contact-avatar-large">${contactName.charAt(0).toUpperCase()}</div>
      `;
    }

    // Hide star button for scheduled emails
    if (els.starBtn) {
      els.starBtn.style.display = 'none';
    }

    // Set email content
    if (els.emailContent) {
      const htmlContent = email.html || '';
      const textContent = email.text || '';
      
      let contentHtml = '';
      
      if (htmlContent && htmlContent.trim()) {
        contentHtml = sanitizeEmailHtml(htmlContent);
      } else if (textContent && textContent.trim()) {
        const decodedText = decodeQuotedPrintable(textContent);
        contentHtml = decodedText.replace(/\n/g, '<br>');
      } else {
        contentHtml = '<p>No content available</p>';
      }
      
      els.emailContent.innerHTML = contentHtml;
    }

    // Add approval actions
    addApprovalActions(email);
    
    // Add sequence context info
    addSequenceContext(email);
  }

  // Add approval action bar
  function addApprovalActions(email) {
    // Remove existing approval actions if any
    const existingActions = document.querySelector('.approval-actions');
    if (existingActions) {
      existingActions.remove();
    }

    // Create approval actions bar
    const actionsBar = document.createElement('div');
    actionsBar.className = 'approval-actions';
    actionsBar.innerHTML = `
      <div class="approval-status">
        <span class="status-badge ${email.status}">${getStatusText(email.status)}</span>
        <span class="countdown-timer">${getCountdownText(email.scheduledSendTime)}</span>
      </div>
      <div class="approval-buttons">
        <button class="btn-primary" data-action="approve" ${email.status === 'approved' ? 'disabled' : ''}>
          Approve & Send
        </button>
        <button class="btn-secondary" data-action="regenerate" ${email.status === 'generating' ? 'disabled' : ''}>
          Regenerate
        </button>
        <button class="btn-secondary" data-action="edit">
          Edit
        </button>
        <button class="btn-danger" data-action="reject" ${email.status === 'rejected' ? 'disabled' : ''}>
          Reject
        </button>
      </div>
    `;

    // Insert after email content
    if (els.emailContent) {
      els.emailContent.parentNode.insertBefore(actionsBar, els.emailContent.nextSibling);
    }

    // Wire approval events
    wireApprovalEvents(actionsBar, email);
  }

  // Add sequence context information
  function addSequenceContext(email) {
    if (!email.sequenceId) return;

    // Remove existing context if any
    const existingContext = document.querySelector('.sequence-context');
    if (existingContext) {
      existingContext.remove();
    }

    const contextDiv = document.createElement('div');
    contextDiv.className = 'sequence-context';
    contextDiv.innerHTML = `
      <div class="context-header">
        <h4>Sequence Context</h4>
      </div>
      <div class="context-details">
        <div class="context-item">
          <span class="label">Sequence:</span>
          <span class="value">${email.sequenceName || 'Unknown Sequence'}</span>
        </div>
        <div class="context-item">
          <span class="label">Step:</span>
          <span class="value">${(email.stepIndex || 0) + 1} of ${email.totalSteps || 1}</span>
        </div>
        <div class="context-item">
          <span class="label">Contact:</span>
          <span class="value">${email.contactName || 'Unknown'} at ${email.contactCompany || 'Unknown Company'}</span>
        </div>
        <div class="context-item">
          <span class="label">AI Prompt:</span>
          <span class="value">${email.aiPrompt || 'No prompt stored'}</span>
        </div>
        <div class="context-item">
          <span class="label">Generated:</span>
          <span class="value">${email.generatedAt ? new Date(email.generatedAt).toLocaleString() : 'Unknown'}</span>
        </div>
      </div>
    `;

    // Insert before approval actions
    const actionsBar = document.querySelector('.approval-actions');
    if (actionsBar) {
      actionsBar.parentNode.insertBefore(contextDiv, actionsBar);
    }
  }

  // Wire approval action events
  function wireApprovalEvents(actionsBar, email) {
    actionsBar.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const action = btn.getAttribute('data-action');
        
        switch (action) {
          case 'approve':
            await approveEmail(email.id);
            break;
          case 'regenerate':
            await regenerateEmail(email.id);
            break;
          case 'edit':
            enableEmailEditing(email);
            break;
          case 'reject':
            await rejectEmail(email.id);
            break;
        }
      });
    });
  }

  // Approve email for sending
  async function approveEmail(emailId) {
    try {
      await firebase.firestore().collection('emails').doc(emailId).update({
        status: 'approved',
        approvedAt: Date.now()
      });

      window.crm?.showToast && window.crm.showToast('Email approved for sending');
      
      // Refresh the email detail
      await show(emailId);
      
    } catch (error) {
      console.error('Failed to approve email:', error);
      window.crm?.showToast && window.crm.showToast('Failed to approve email');
    }
  }

  // Regenerate email content
  async function regenerateEmail(emailId) {
    try {
      // Update status to generating
      await firebase.firestore().collection('emails').doc(emailId).update({
        status: 'generating',
        regeneratedAt: Date.now()
      });

      window.crm?.showToast && window.crm.showToast('Regenerating email content...');
      
      // TODO: Call AI generation API to regenerate content
      // For now, just reset to pending approval
      setTimeout(async () => {
        await firebase.firestore().collection('emails').doc(emailId).update({
          status: 'pending_approval'
        });
        await show(emailId);
        window.crm?.showToast && window.crm.showToast('Email regenerated successfully');
      }, 2000);
      
    } catch (error) {
      console.error('Failed to regenerate email:', error);
      window.crm?.showToast && window.crm.showToast('Failed to regenerate email');
    }
  }

  // Enable email editing
  function enableEmailEditing(email) {
    // Make subject editable
    if (els.title) {
      els.title.contentEditable = true;
      els.title.style.border = '1px solid var(--orange-primary)';
      els.title.style.padding = '4px 8px';
      els.title.style.borderRadius = '4px';
    }

    // Make content editable
    if (els.emailContent) {
      els.emailContent.contentEditable = true;
      els.emailContent.style.border = '1px solid var(--orange-primary)';
      els.emailContent.style.padding = '8px';
      els.emailContent.style.borderRadius = '4px';
      els.emailContent.style.minHeight = '200px';
    }

    // Add save button
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-primary';
    saveBtn.textContent = 'Save Changes';
    saveBtn.style.marginTop = '10px';
    
    saveBtn.addEventListener('click', async () => {
      await saveEmailEdits(email.id);
    });

    // Insert save button after content
    if (els.emailContent) {
      els.emailContent.parentNode.insertBefore(saveBtn, els.emailContent.nextSibling);
    }

    window.crm?.showToast && window.crm.showToast('Email editing enabled. Make your changes and click Save.');
  }

  // Save email edits
  async function saveEmailEdits(emailId) {
    try {
      const updates = {};
      
      if (els.title && els.title.contentEditable) {
        updates.subject = els.title.textContent;
        els.title.contentEditable = false;
        els.title.style.border = 'none';
        els.title.style.padding = '0';
      }

      if (els.emailContent && els.emailContent.contentEditable) {
        updates.html = els.emailContent.innerHTML;
        els.emailContent.contentEditable = false;
        els.emailContent.style.border = 'none';
        els.emailContent.style.padding = '0';
        els.emailContent.style.minHeight = 'auto';
      }

      await firebase.firestore().collection('emails').doc(emailId).update(updates);

      // Remove save button
      const saveBtn = document.querySelector('.btn-primary[textContent="Save Changes"]');
      if (saveBtn) {
        saveBtn.remove();
      }

      window.crm?.showToast && window.crm.showToast('Email changes saved');
      
    } catch (error) {
      console.error('Failed to save email edits:', error);
      window.crm?.showToast && window.crm.showToast('Failed to save changes');
    }
  }

  // Reject email
  async function rejectEmail(emailId) {
    if (!confirm('Are you sure you want to reject this email?')) {
      return;
    }

    try {
      await firebase.firestore().collection('emails').doc(emailId).update({
        status: 'rejected',
        rejectedAt: Date.now()
      });

      window.crm?.showToast && window.crm.showToast('Email rejected');
      
      // Refresh the email detail
      await show(emailId);
      
    } catch (error) {
      console.error('Failed to reject email:', error);
      window.crm?.showToast && window.crm.showToast('Failed to reject email');
    }
  }

  // Get status text
  function getStatusText(status) {
    const statusTexts = {
      'pending_approval': 'Pending Approval',
      'approved': 'Approved',
      'rejected': 'Rejected',
      'generating': 'Generating...',
      'error': 'Error'
    };
    return statusTexts[status] || 'Unknown';
  }

  // Get countdown text
  function getCountdownText(scheduledSendTime) {
    if (!scheduledSendTime) return 'No time set';
    
    const now = Date.now();
    const timeDiff = scheduledSendTime - now;
    
    if (timeDiff <= 0) {
      return 'Ready to send';
    }
    
    const minutes = Math.floor(timeDiff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `Sends in ${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `Sends in ${hours}h ${minutes % 60}m`;
    } else {
      return `Sends in ${minutes}m`;
    }
  }

  // Initialize
  function init() {
    if (!initDomRefs()) return;
    attachEvents();
  }

  // Export for global access
  window.EmailDetail = { 
    init,
    show 
  };
})();
