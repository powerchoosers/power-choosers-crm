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
