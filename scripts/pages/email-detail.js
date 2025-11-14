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
    els.actionBar = els.page ? els.page.querySelector('.action-buttons') : null;
    
    // Reply container elements
    els.replyContainer = document.getElementById('email-reply-container');
    els.replyToInput = document.getElementById('reply-to-input');
    els.replyCcInput = document.getElementById('reply-cc-input');
    els.replyBccInput = document.getElementById('reply-bcc-input');
    els.replyCcBcc = document.getElementById('reply-cc-bcc');
    els.replyCcToggle = document.getElementById('reply-cc-toggle');
    els.replySubjectInput = document.getElementById('reply-subject-input');
    els.replyBodyInput = document.getElementById('reply-body-input');
    els.replySendBtn = document.getElementById('reply-send-btn');
    els.replyDiscardBtn = document.getElementById('reply-discard-btn');
    els.replyFormattingBar = els.replyContainer ? els.replyContainer.querySelector('.reply-formatting-bar') : null;
    els.replyLinkBar = els.replyContainer ? els.replyContainer.querySelector('.reply-link-bar') : null;
    els.replyAiBar = els.replyContainer ? els.replyContainer.querySelector('.reply-ai-bar') : null;
    
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
        unread: emailData.unread !== false,
        // Scheduled email fields
        type: emailData.type || 'received',
        status: emailData.status,
        scheduledSendTime: emailData.scheduledSendTime,
        aiPrompt: emailData.aiPrompt
      };

      // Populate email details
      populateEmailDetails(state.currentEmail);
      
      // Add action buttons for scheduled emails (all statuses)
      if (state.currentEmail.type === 'scheduled') {
        addScheduledEmailActions();
      }
      
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

    // Check if this is a sent or scheduled email (show recipient instead of sender)
    const isSentEmail = email.isSentEmail || email.type === 'sent' || email.type === 'scheduled';

    // Helper function to get account logoUrl from recipient email
    function getRecipientAccountInfo(recipientEmail) {
      if (!recipientEmail) return { logoUrl: null, domain: null };
      
      try {
        const recipientDomain = extractDomain(recipientEmail);
        if (!recipientDomain) return { logoUrl: null, domain: null };
        
        // Try to find account by domain
        const accounts = window.getAccountsData ? window.getAccountsData() : [];
        const account = accounts.find(a => {
          const accountDomain = (a.domain || '').toLowerCase().replace(/^www\./, '');
          const accountWebsite = (a.website || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
          const domainLower = recipientDomain.toLowerCase();
          return accountDomain === domainLower || accountWebsite === domainLower;
        });
        
        if (account) {
          const logoUrl = account.logoUrl || account.logo || account.companyLogo || account.iconUrl || account.companyIcon;
          return { logoUrl: logoUrl || null, domain: account.domain || account.website || recipientDomain };
        }
        
        return { logoUrl: null, domain: recipientDomain };
      } catch (_) {
        return { logoUrl: null, domain: extractDomain(recipientEmail) };
      }
    }

    // Set sender/recipient info
    if (els.senderName) {
      if (isSentEmail) {
        // For sent/scheduled emails, show recipient name
        // Handle both string and array formats for email.to
        let recipientEmail = '';
        if (Array.isArray(email.to)) {
          recipientEmail = email.to[0] || '';
        } else {
          recipientEmail = email.to || '';
        }
        els.senderName.textContent = extractName(recipientEmail) || 'Unknown Recipient';
      } else {
      els.senderName.textContent = extractName(email.from) || 'Unknown';
      }
    }

    if (els.senderEmail) {
      if (isSentEmail) {
        // For sent emails, show recipient email
        // Handle both string and array formats for email.to
        let recipientEmail = '';
        if (Array.isArray(email.to)) {
          recipientEmail = email.to[0] || '';
        } else {
          recipientEmail = email.to || '';
        }
        els.senderEmail.textContent = recipientEmail || 'Unknown';
      } else {
      els.senderEmail.textContent = email.from || 'Unknown';
      }
    }

    // Set date
    if (els.emailDate) {
      els.emailDate.textContent = formatDate(email.date);
    }

    // Set sender/recipient avatar
    if (els.senderAvatar) {
      if (isSentEmail) {
        // For sent emails, show recipient with account logo
        // Handle both string and array formats for email.to
        let recipientEmail = '';
        if (Array.isArray(email.to)) {
          recipientEmail = email.to[0] || '';
        } else {
          recipientEmail = email.to || '';
        }
        const accountInfo = getRecipientAccountInfo(recipientEmail);
        const faviconHtml = window.__pcFaviconHelper.generateCompanyIconHTML({
          logoUrl: accountInfo.logoUrl,
          domain: accountInfo.domain,
          size: 40
        });
        els.senderAvatar.innerHTML = faviconHtml;
      } else {
        // Use domain favicon for received emails
      const domain = extractDomain(email.from);
      const faviconHtml = window.__pcFaviconHelper.generateCompanyIconHTML({
        domain: domain,
        size: 40
      });
      els.senderAvatar.innerHTML = faviconHtml;
      }
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
      
      // Add signature if email should have one (scheduled/sent emails from sequences)
      // Check if email is from a sequence or has type that suggests it should include signature
      const shouldShowSignature = email.type === 'scheduled' || 
                                   email.type === 'auto-email' || 
                                   email.type === 'manual-email' ||
                                   email.sequenceId ||
                                   (email.status && email.status !== 'received');
      
      if (shouldShowSignature) {
        try {
          const signature = window.getEmailSignature ? window.getEmailSignature() : '';
          if (signature) {
            // Check settings for signature image
            const settings = (window.SettingsPage?.getSettings?.()) || {};
            const deliver = settings?.emailDeliverability || {};
            let signatureHtml = signature;
            
            // Remove signature image if disabled
            if (deliver.signatureImageEnabled === false) {
              signatureHtml = signature.replace(/<img[^>]*alt=["']Signature["'][\s\S]*?>/gi, '');
            }
            
            // Only add if content doesn't already include signature
            if (signatureHtml && !contentHtml.includes('margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;')) {
              contentHtml += signatureHtml;
            }
          }
        } catch (error) {
          console.warn('[EmailDetail] Error adding signature:', error);
        }
      }
      
      els.emailContent.innerHTML = contentHtml;
    }
  }

  // Go back to previous page based on navigation source
  function goBack() {
    // Check navigation source and navigate accordingly
    const navSource = window._emailNavigationSource;
    
    if (navSource === 'contact-detail' && window._emailNavigationContactId) {
      // Return to contact detail page
      const contactId = window._emailNavigationContactId;
      const tempContact = window._emailNavigationTempContact;
      
      // Clear navigation variables
      window._emailNavigationSource = null;
      window._emailNavigationContactId = null;
      window._emailNavigationTempContact = null;
      
      // Navigate to contact detail
      if (window.crm && typeof window.crm.navigateToPage === 'function') {
        window.crm.navigateToPage('people');
        // Use retry pattern to ensure ContactDetail module is ready
        requestAnimationFrame(() => {
          let attempts = 0;
          const maxAttempts = 25;
          const retryInterval = 80;
          
          const retry = () => {
            attempts++;
            if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
              if (tempContact) {
                window.ContactDetail.show(contactId, tempContact);
              } else {
                window.ContactDetail.show(contactId);
              }
            } else if (attempts < maxAttempts) {
              setTimeout(retry, retryInterval);
            }
          };
          retry();
        });
      }
    } else if (navSource === 'task-detail' && window._emailNavigationTaskId) {
      // Return to task detail page
      const taskId = window._emailNavigationTaskId;
      
      // Clear navigation variables
      window._emailNavigationSource = null;
      window._emailNavigationTaskId = null;
      
      // Navigate to task detail
      if (window.crm && typeof window.crm.navigateToPage === 'function') {
        window.crm.navigateToPage('tasks');
        // Use retry pattern to ensure TaskDetail module is ready
        requestAnimationFrame(() => {
          let attempts = 0;
          const maxAttempts = 25;
          const retryInterval = 80;
          
          const retry = () => {
            attempts++;
            if (window.TaskDetail && typeof window.TaskDetail.show === 'function') {
              window.TaskDetail.show(taskId);
            } else if (attempts < maxAttempts) {
              setTimeout(retry, retryInterval);
            }
          };
          retry();
        });
      }
    } else if (navSource === 'home' || navSource === 'dashboard') {
      // Return to home/dashboard page
      window._emailNavigationSource = null;
      
      if (window.crm && typeof window.crm.navigateToPage === 'function') {
        window.crm.navigateToPage('dashboard');
      }
    } else {
      // Default: return to emails page (preserve existing behavior)
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
    if (!state.currentEmail || !els.replyContainer) return;
    
    const email = state.currentEmail;
    const isSentEmail = email.isSentEmail || email.type === 'sent';
    
    // Extract recipient email
    let recipientEmail = '';
    if (isSentEmail) {
      // For sent emails, reply to the "to" field
      recipientEmail = Array.isArray(email.to) ? email.to[0] : email.to;
    } else {
      // For received emails, reply to sender
      recipientEmail = extractEmail(email.from);
    }
    
    // Set reply fields
    if (els.replyToInput) {
      els.replyToInput.value = recipientEmail || extractEmail(email.from);
    }
    
    if (els.replySubjectInput) {
      const currentSubject = email.subject || '';
      if (!currentSubject.toLowerCase().startsWith('re:')) {
        els.replySubjectInput.value = `Re: ${currentSubject}`;
      } else {
        els.replySubjectInput.value = currentSubject;
      }
    }
    
    // Clear body and add signature
    if (els.replyBodyInput) {
      // Ensure contenteditable is enabled
      els.replyBodyInput.contentEditable = 'true';
      els.replyBodyInput.setAttribute('contenteditable', 'true');
      
      // Start with empty content (user will type here)
      els.replyBodyInput.innerHTML = '';
      
      // Add a paragraph element for typing (like forward does)
      const replyParagraph = document.createElement('p');
      replyParagraph.style.margin = '0 0 16px 0';
      replyParagraph.style.color = 'var(--text-primary)';
      replyParagraph.innerHTML = '<br>'; // Empty paragraph with line break for typing
      els.replyBodyInput.appendChild(replyParagraph);
      
      // Add original email thread (Gmail-style)
      try {
        const originalContent = email.html || email.text || email.content || '';
        if (originalContent) {
          // Create divider
          const divider = document.createElement('div');
          divider.style.margin = '24px 0 16px 0';
          divider.style.paddingTop = '16px';
          divider.style.borderTop = '1px solid var(--border-light)';
          divider.style.color = 'var(--text-secondary)';
          divider.style.fontSize = '13px';
          divider.setAttribute('contenteditable', 'false');
          divider.setAttribute('data-quoted-content', 'true');
          
          // Format original email header
          const originalFrom = email.from || 'Unknown Sender';
          const originalDate = email.date ? new Date(email.date).toLocaleString() : '';
          const originalSubject = email.subject || '';
          
          // Create quoted content container
          const quotedContainer = document.createElement('div');
          quotedContainer.style.margin = '0';
          quotedContainer.style.padding = '12px 16px';
          quotedContainer.style.backgroundColor = 'var(--bg-secondary)';
          quotedContainer.style.borderLeft = '3px solid var(--border-light)';
          quotedContainer.style.borderRadius = '4px';
          quotedContainer.style.color = 'var(--text-secondary)';
          quotedContainer.style.fontSize = '13px';
          quotedContainer.style.lineHeight = '1.5';
          quotedContainer.setAttribute('contenteditable', 'false');
          quotedContainer.setAttribute('data-quoted-content', 'true');
          
          // Add header info
          const headerInfo = document.createElement('div');
          headerInfo.style.marginBottom = '8px';
          headerInfo.style.fontWeight = '600';
          headerInfo.style.color = 'var(--text-primary)';
          headerInfo.innerHTML = `On ${originalDate}, ${originalFrom} wrote:`;
          quotedContainer.appendChild(headerInfo);
          
          // Add original content
          const contentDiv = document.createElement('div');
          contentDiv.style.color = 'var(--text-secondary)';
          contentDiv.style.whiteSpace = 'pre-wrap';
          contentDiv.setAttribute('contenteditable', 'false');
          contentDiv.setAttribute('data-quoted-content', 'true');
          
          // If HTML, strip and convert to plain text for quoted section
          if (email.html) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = email.html;
            const plainText = tempDiv.textContent || tempDiv.innerText || '';
            // Preserve line breaks
            contentDiv.textContent = plainText;
          } else {
            contentDiv.textContent = originalContent;
          }
          
          quotedContainer.appendChild(contentDiv);
          divider.appendChild(quotedContainer);
          
          // Insert divider before signature
          els.replyBodyInput.appendChild(divider);
        }
      } catch (error) {
        console.warn('[EmailDetail] Error adding original email thread:', error);
      }
      
      // Add signature if available
      try {
        const signature = window.getEmailSignature ? window.getEmailSignature() : '';
        if (signature) {
          // Parse signature HTML and append it
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = signature;
          while (tempDiv.firstChild) {
            els.replyBodyInput.appendChild(tempDiv.firstChild);
          }
        }
      } catch (error) {
        console.warn('[EmailDetail] Error adding signature:', error);
      }
    }
    
    // Update avatar with agent's profile photo
    updateReplyAvatar();
    
    // Show reply container
    els.replyContainer.style.display = 'block';
    
    // Smooth scroll to reply container
    setTimeout(() => {
      if (els.replyContainer) {
        els.replyContainer.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'end',
          inline: 'nearest'
        });
      }
      
      // Focus body input after scroll
      setTimeout(() => {
        if (els.replyBodyInput) {
          // Ensure it's editable
          els.replyBodyInput.contentEditable = 'true';
          els.replyBodyInput.focus();
          
          // Move cursor to the paragraph (before signature)
          try {
            const range = document.createRange();
            const sel = window.getSelection();
            
            // Find the first paragraph element (where user should type)
            const firstParagraph = els.replyBodyInput.querySelector('p');
            if (firstParagraph) {
              // Set cursor inside the paragraph
              range.setStart(firstParagraph, 0);
              range.collapse(true);
            } else {
              // Fallback: find first editable element
              let firstEditable = els.replyBodyInput.firstChild;
              while (firstEditable && 
                     (firstEditable.getAttribute?.('contenteditable') === 'false' ||
                      firstEditable.getAttribute?.('data-signature') === 'true')) {
                firstEditable = firstEditable.nextSibling;
              }
              
              if (firstEditable) {
                if (firstEditable.nodeType === Node.TEXT_NODE) {
                  range.setStart(firstEditable, 0);
                } else {
                  range.setStart(firstEditable, 0);
                }
              } else {
                // Last resort: create a paragraph
                const p = document.createElement('p');
                p.innerHTML = '<br>';
                els.replyBodyInput.insertBefore(p, els.replyBodyInput.firstChild);
                range.setStart(p, 0);
              }
              range.collapse(true);
            }
            
            sel.removeAllRanges();
            sel.addRange(range);
          } catch (error) {
            console.warn('[EmailDetail] Error setting cursor position:', error);
            // Fallback: just focus
            els.replyBodyInput.focus();
          }
        }
      }, 300);
    }, 100);
    
    // Setup reply container event listeners if not already set
    if (!els.replyContainer.dataset.listenersAdded) {
      setupReplyContainerEvents();
      els.replyContainer.dataset.listenersAdded = 'true';
    }
  }

  // Forward email
  function forwardEmail() {
    if (!state.currentEmail || !els.replyContainer) return;
    
    const email = state.currentEmail;
    
    // Clear "To" field for forwarding
    if (els.replyToInput) {
      els.replyToInput.value = '';
      els.replyToInput.removeAttribute('readonly');
    }
    
    if (els.replySubjectInput) {
      const currentSubject = email.subject || '';
      if (!currentSubject.toLowerCase().startsWith('fwd:') && !currentSubject.toLowerCase().startsWith('fw:')) {
        els.replySubjectInput.value = `Fwd: ${currentSubject}`;
      } else {
        els.replySubjectInput.value = currentSubject;
      }
    }
    
    // Add forwarded email content to body
    if (els.replyBodyInput) {
      // Ensure contenteditable is enabled
      els.replyBodyInput.contentEditable = 'true';
      
      const forwardedContent = `
        <div style="margin: 20px 0; padding: 15px; border-left: 3px solid var(--border-light); background: var(--bg-item);">
          <div style="margin-bottom: 10px; font-weight: 600; color: var(--text-primary);">---------- Forwarded message ----------</div>
          <div style="margin-bottom: 5px; color: var(--text-primary);"><strong>From:</strong> ${escapeHtml(email.from || 'Unknown')}</div>
          <div style="margin-bottom: 5px; color: var(--text-primary);"><strong>Date:</strong> ${escapeHtml(formatDate(email.date))}</div>
          <div style="margin-bottom: 5px; color: var(--text-primary);"><strong>Subject:</strong> ${escapeHtml(email.subject || '(No Subject)')}</div>
          <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border-light); color: var(--text-primary);">
            ${email.html || email.text || email.content || ''}
          </div>
        </div>
      `;
      
      els.replyBodyInput.innerHTML = forwardedContent;
      
      // Add signature if available
      try {
        const signature = window.getEmailSignature ? window.getEmailSignature() : '';
        if (signature) {
          els.replyBodyInput.innerHTML += signature;
        }
      } catch (error) {
        console.warn('[EmailDetail] Error adding signature:', error);
      }
    }
    
    // Update avatar with agent's profile photo
    updateReplyAvatar();
    
    // Show reply container
    els.replyContainer.style.display = 'block';
    
    // Smooth scroll to reply container
    setTimeout(() => {
      if (els.replyContainer) {
        els.replyContainer.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'end',
          inline: 'nearest'
        });
      }
      
      // Focus "To" input after scroll
      setTimeout(() => {
        if (els.replyToInput) {
          els.replyToInput.focus();
        }
      }, 300);
    }, 100);
    
    // Setup reply container event listeners if not already set
    if (!els.replyContainer.dataset.listenersAdded) {
      setupReplyContainerEvents();
      els.replyContainer.dataset.listenersAdded = 'true';
    }
  }
  
  // Extract email address from "Name <email>" format
  function extractEmail(emailString) {
    if (!emailString) return '';
    const match = emailString.match(/<(.+)>/);
    if (match) return match[1];
    return emailString;
  }
  
  // Update reply avatar with agent's profile photo
  function updateReplyAvatar() {
    const avatarEl = els.replyContainer ? els.replyContainer.querySelector('.reply-avatar') : null;
    if (!avatarEl) return;
    
    try {
      // Get profile photo from settings
      const settings = (window.SettingsPage?.getSettings?.()) || {};
      const g = settings?.general || {};
      const profilePhotoUrl = g.hostedPhotoURL || g.photoURL || '';
      
      if (profilePhotoUrl) {
        // Use profile photo
        avatarEl.innerHTML = `<img src="${escapeHtml(profilePhotoUrl)}" alt="Profile" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border-light);" />`;
      } else {
        // Fallback to initials avatar
        const firstName = g.firstName || '';
        const lastName = g.lastName || '';
        const initials = ((firstName.charAt(0) || '') + (lastName.charAt(0) || '')).toUpperCase() || 'U';
        
        // Try Firebase auth as fallback
        if (!initials || initials === 'U') {
          try {
            const user = window.firebase?.auth?.().currentUser;
            if (user?.displayName) {
              const nameParts = user.displayName.trim().split(' ').filter(p => p);
              const firstInitial = nameParts[0]?.[0] || '';
              const lastInitial = nameParts.length > 1 ? nameParts[nameParts.length - 1][0] : '';
              const fbInitials = (firstInitial + lastInitial).toUpperCase() || 'U';
              if (fbInitials !== 'U') {
                avatarEl.innerHTML = `<div style="width: 32px; height: 32px; border-radius: 50%; background: var(--orange-subtle); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 600; font-size: 14px; letter-spacing: 0.5px; border: 1px solid var(--border-light);" aria-hidden="true">${escapeHtml(fbInitials)}</div>`;
                return;
              }
            }
          } catch (_) {}
        }
        
        avatarEl.innerHTML = `<div style="width: 32px; height: 32px; border-radius: 50%; background: var(--orange-subtle); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 600; font-size: 14px; letter-spacing: 0.5px; border: 1px solid var(--border-light);" aria-hidden="true">${escapeHtml(initials)}</div>`;
      }
    } catch (error) {
      console.warn('[EmailDetail] Error updating reply avatar:', error);
    }
  }
  
  // Setup reply container event listeners
  function setupReplyContainerEvents() {
    // Ensure reply body input is always editable
    if (els.replyBodyInput) {
      // Ensure contenteditable is set
      els.replyBodyInput.contentEditable = 'true';
      els.replyBodyInput.setAttribute('contenteditable', 'true');
      
      // Add focus handler to ensure it's editable and create typing area if needed
      els.replyBodyInput.addEventListener('focus', () => {
        els.replyBodyInput.contentEditable = 'true';
        
        // If no editable content exists, create a paragraph
        const hasEditableContent = els.replyBodyInput.querySelector('p') || 
                                   Array.from(els.replyBodyInput.childNodes).some(node => 
                                     node.nodeType === Node.TEXT_NODE || 
                                     (node.nodeType === Node.ELEMENT_NODE && 
                                      node.getAttribute('contenteditable') !== 'false' &&
                                      node.getAttribute('data-signature') !== 'true' &&
                                      node.getAttribute('data-quoted-content') !== 'true')
                                   );
        
        if (!hasEditableContent) {
          const p = document.createElement('p');
          p.innerHTML = '<br>';
          p.style.margin = '0 0 16px 0';
          p.style.color = 'var(--text-primary)';
          
          // Insert before quoted content or signature if they exist
          const quotedContent = els.replyBodyInput.querySelector('[data-quoted-content="true"]');
          const signature = els.replyBodyInput.querySelector('[data-signature="true"]');
          if (quotedContent) {
            els.replyBodyInput.insertBefore(p, quotedContent);
          } else if (signature) {
            els.replyBodyInput.insertBefore(p, signature);
          } else {
            els.replyBodyInput.appendChild(p);
          }
          
          // Set cursor in the new paragraph
          setTimeout(() => {
            const range = document.createRange();
            const sel = window.getSelection();
            range.setStart(p, 0);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }, 0);
        }
      });
      
      // Add click handler to ensure it's editable
      els.replyBodyInput.addEventListener('click', (e) => {
        // Don't allow clicking on quoted content or signature
        if (e.target.closest('[data-quoted-content="true"]')) {
          e.preventDefault();
          e.stopPropagation();
          
          // Move cursor to the paragraph before quoted content
          const quoted = e.target.closest('[data-quoted-content="true"]');
          let p = quoted.previousElementSibling;
          if (!p || p.tagName !== 'P') {
            // Create a paragraph if none exists
            p = document.createElement('p');
            p.innerHTML = '<br>';
            p.style.margin = '0 0 16px 0';
            p.style.color = 'var(--text-primary)';
            quoted.parentNode.insertBefore(p, quoted);
          }
          
          // Set cursor at the end of the paragraph
          setTimeout(() => {
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(p);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }, 0);
          return;
        }
        
        // Don't allow clicking on signature
        if (e.target.closest('[data-signature="true"]')) {
          e.preventDefault();
          // Move focus to editable area
          const p = els.replyBodyInput.querySelector('p');
          if (p) {
            p.focus();
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(p);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
          return;
        }
        
        els.replyBodyInput.contentEditable = 'true';
        els.replyBodyInput.focus();
      });
      
      // Add keydown handler to ensure typing works and handle Enter key
      els.replyBodyInput.addEventListener('keydown', (e) => {
        // Ensure contenteditable is true
        if (els.replyBodyInput.contentEditable !== 'true') {
          els.replyBodyInput.contentEditable = 'true';
        }
        
        // Handle Backspace/Delete to prevent signature and quoted content deletion
        if (e.key === 'Backspace' || e.key === 'Delete') {
          const selection = window.getSelection();
          if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            
            // Check if we're about to delete quoted content
            const quotedElements = els.replyBodyInput.querySelectorAll('[data-quoted-content="true"]');
            for (const quoted of quotedElements) {
              try {
                if (range.intersectsNode(quoted)) {
                  console.log('[EmailDetail] Backspace/Delete would affect quoted content - preventing');
                  e.preventDefault();
                  e.stopPropagation();
                  
                  // Move cursor to the paragraph before quoted content
                  let p = quoted.previousElementSibling;
                  if (!p || p.tagName !== 'P') {
                    // Create a paragraph if none exists
                    p = document.createElement('p');
                    p.innerHTML = '<br>';
                    p.style.margin = '0 0 16px 0';
                    p.style.color = 'var(--text-primary)';
                    quoted.parentNode.insertBefore(p, quoted);
                  }
                  
                  // Set cursor at the end of the paragraph
                  const newRange = document.createRange();
                  newRange.selectNodeContents(p);
                  newRange.collapse(false);
                  selection.removeAllRanges();
                  selection.addRange(newRange);
                  return;
                }
              } catch (err) {
                console.warn('[EmailDetail] Error checking quoted content:', err);
              }
            }
            
            // Check if we're about to delete the signature
            const signatureElements = els.replyBodyInput.querySelectorAll('[data-signature="true"]');
            
            for (const signature of signatureElements) {
              // Check if the range would delete or affect the signature
              try {
                if (range.intersectsNode(signature)) {
                  console.log('[EmailDetail] Backspace/Delete would affect signature - preventing');
                  e.preventDefault();
                  e.stopPropagation();
                  
                  // Move cursor to the paragraph before signature
                  let p = signature.previousElementSibling;
                  if (!p || p.tagName !== 'P') {
                    // Create a paragraph if none exists
                    p = document.createElement('p');
                    p.innerHTML = '<br>';
                    p.style.margin = '0 0 16px 0';
                    p.style.color = 'var(--text-primary)';
                    signature.parentNode.insertBefore(p, signature);
                  }
                  
                  // Set cursor at the end of the paragraph
                  const newRange = document.createRange();
                  newRange.selectNodeContents(p);
                  newRange.collapse(false);
                  selection.removeAllRanges();
                  selection.addRange(newRange);
                  return;
                }
              } catch (err) {
                // intersectsNode might not be available in all browsers, use alternative check
                console.warn('[EmailDetail] intersectsNode not available, using alternative check');
              }
              
              // Check if cursor is right before signature and backspace would delete it
              if (range.collapsed) {
                const container = range.startContainer;
                let node = container.nodeType === Node.TEXT_NODE ? container.parentNode : container;
                
                // Check if the next sibling is the signature
                if (node && node.nextSibling === signature) {
                  // Check if we're at the end of the node
                  const isAtEnd = range.startOffset === (container.nodeType === Node.TEXT_NODE 
                    ? container.textContent.length 
                    : node.childNodes.length);
                  
                  if (isAtEnd) {
                    console.log('[EmailDetail] Backspace at end before signature - preventing');
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                }
                
                // Check if we're inside a node that's a direct child of signature
                let walker = node;
                while (walker && walker !== els.replyBodyInput) {
                  if (walker === signature) {
                    console.log('[EmailDetail] Backspace inside signature - preventing');
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  walker = walker.parentNode;
                }
                
                // Check if we're at the very beginning and signature is the first child
                // This handles the case where user backspaces all the way to the beginning
                if (els.replyBodyInput.firstChild === signature) {
                  console.log('[EmailDetail] Backspace at beginning would delete signature - preventing');
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                
                // Check if we're in the first editable element and it's empty, and signature is next
                const firstEditable = Array.from(els.replyBodyInput.childNodes).find(n => 
                  n !== signature && 
                  (n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.TEXT_NODE) &&
                  n.getAttribute?.('contenteditable') !== 'false'
                );
                
                if (firstEditable && firstEditable.nextSibling === signature) {
                  // Check if firstEditable is empty or cursor is at the start
                  const isEmpty = firstEditable.nodeType === Node.TEXT_NODE
                    ? firstEditable.textContent.trim() === ''
                    : (firstEditable.textContent.trim() === '' || 
                       (firstEditable.innerHTML === '<br>' || firstEditable.innerHTML === ''));
                  
                  const isAtStart = range.startOffset === 0;
                  
                  if ((isEmpty || isAtStart) && e.key === 'Backspace') {
                    console.log('[EmailDetail] Backspace in empty element before signature - preventing');
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                }
              } else {
                // Non-collapsed range (selection) - check if it includes signature
                const startNode = range.startContainer;
                const endNode = range.endContainer;
                
                let startParent = startNode.nodeType === Node.TEXT_NODE ? startNode.parentNode : startNode;
                let endParent = endNode.nodeType === Node.TEXT_NODE ? endNode.parentNode : endNode;
                
                // Walk up to check if signature is in the selection
                let walker = startParent;
                while (walker && walker !== els.replyBodyInput) {
                  if (walker === signature) {
                    console.log('[EmailDetail] Selection includes signature - preventing delete');
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  walker = walker.parentNode;
                }
                
                walker = endParent;
                while (walker && walker !== els.replyBodyInput) {
                  if (walker === signature) {
                    console.log('[EmailDetail] Selection includes signature - preventing delete');
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  walker = walker.parentNode;
                }
              }
            }
          }
        }
        
        // Handle Enter key for single spacing (like email-compose-global.js)
        if (e.key === 'Enter') {
          console.log('[EmailDetail] Enter key pressed in reply body input');
          e.preventDefault();
          
          // Check if cursor is INSIDE signature (not just near it)
          const selection = window.getSelection();
          if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const isInsideSignature = isCursorInsideSignature(els.replyBodyInput, range);
            if (isInsideSignature) {
              console.log('[EmailDetail] Cursor inside signature - preventing edit');
              return;
            }
          }
          
          // Insert single line break for single spacing (like Gmail/Outlook)
          try {
            // Get current selection and range
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return;
            
            const range = selection.getRangeAt(0);
            
            // Insert a single <br> with proper spacing control
            // This creates a clean line break without compounding margins
            const br = document.createElement('br');
            range.deleteContents();
            range.insertNode(br);
            
            // Create a zero-width space node after br to ensure proper cursor positioning
            const textNode = document.createTextNode('\u200B'); // Zero-width space
            range.setStartAfter(br);
            range.insertNode(textNode);
            
            // Move cursor after the text node
            range.setStartAfter(textNode);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            
            console.log('[EmailDetail] Single line break inserted with proper spacing');
          } catch (error) {
            console.error('[EmailDetail] Failed to insert line break:', error);
            // Fallback: try execCommand but it may have spacing issues
            try {
              document.execCommand('insertHTML', false, '<br>');
              console.log('[EmailDetail] Fallback: Single line break inserted via execCommand');
            } catch (fallbackError) {
              console.error('[EmailDetail] All methods failed:', fallbackError);
            }
          }
          return; // Don't process other keydown logic for Enter
        }
        
        // If typing at the signature, move cursor before it (for other keys)
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const container = range.commonAncestorContainer;
          const signature = container.nodeType === Node.ELEMENT_NODE 
            ? container.closest('[data-signature="true"]')
            : container.parentElement?.closest('[data-signature="true"]');
          
          if (signature) {
            e.preventDefault();
            // Find or create paragraph before signature
            let p = signature.previousElementSibling;
            if (!p || p.tagName !== 'P') {
              p = document.createElement('p');
              p.innerHTML = '<br>';
              p.style.margin = '0 0 16px 0';
              p.style.color = 'var(--text-primary)';
              signature.parentNode.insertBefore(p, signature);
            }
            
            // Move cursor to paragraph
            const newRange = document.createRange();
            newRange.selectNodeContents(p);
            newRange.collapse(false);
            sel.removeAllRanges();
            sel.addRange(newRange);
          }
        }
      });
      
      // Prevent default drag behavior that might interfere
      els.replyBodyInput.addEventListener('dragstart', (e) => {
        e.preventDefault();
      });
    }
    
    // Helper function to check if cursor is INSIDE signature (not just near)
    function isCursorInsideSignature(editor, range) {
      // Check if the cursor's parent node is within a signature element
      const signatureElements = editor.querySelectorAll('[data-signature="true"], .signature, .email-signature');
      if (signatureElements.length === 0) return false;
      
      // Get the current node where cursor is positioned
      let currentNode = range.startContainer;
      if (currentNode.nodeType === Node.TEXT_NODE) {
        currentNode = currentNode.parentNode;
      }
      
      // Walk up the DOM tree to check if we're inside a signature
      for (const signature of signatureElements) {
        if (signature.contains(currentNode)) {
          return true;
        }
      }
      
      return false;
    }
    
    // Cc/Bcc toggle
    if (els.replyCcToggle && els.replyCcBcc) {
      els.replyCcToggle.addEventListener('click', () => {
        const isVisible = els.replyCcBcc.style.display !== 'none';
        els.replyCcBcc.style.display = isVisible ? 'none' : 'block';
      });
    }
    
    // Discard button
    if (els.replyDiscardBtn) {
      els.replyDiscardBtn.addEventListener('click', () => {
        if (confirm('Discard this draft?')) {
          closeReplyContainer();
        }
      });
    }
    
    // Send button
    if (els.replySendBtn) {
      els.replySendBtn.addEventListener('click', sendReply);
    }
    
    // Toolbar buttons
    if (els.replyContainer) {
      els.replyContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.toolbar-btn');
        if (!btn) return;
        
        const action = btn.dataset.action;
        const editor = els.replyBodyInput;
        
        if (action === 'formatting') {
          toggleFormattingBar();
        } else if (action === 'link') {
          toggleLinkBar();
        } else if (action === 'attach') {
          handleFileAttachment(editor);
        } else if (action === 'image') {
          handleImageUpload(editor);
        } else if (action === 'ai') {
          toggleAIBar();
        }
      });
      
      // Formatting bar buttons
      if (els.replyFormattingBar) {
        els.replyFormattingBar.addEventListener('click', (e) => {
          const btn = e.target.closest('.fmt-btn');
          if (!btn) return;
          
          const format = btn.getAttribute('data-fmt');
          if (format) {
            handleFormatting(format, btn, els.replyBodyInput);
          }
        });
      }
      
      // Link bar buttons
      if (els.replyLinkBar) {
        els.replyLinkBar.addEventListener('click', (e) => {
          if (e.target.matches('[data-link-insert]')) {
            insertLink(els.replyBodyInput, els.replyLinkBar);
          } else if (e.target.matches('[data-link-cancel]')) {
            els.replyLinkBar.classList.remove('open');
            els.replyLinkBar.setAttribute('aria-hidden', 'true');
          }
        });
      }
      
      // AI bar buttons
      if (els.replyAiBar) {
        els.replyAiBar.addEventListener('click', (e) => {
          const btn = e.target.closest('.ai-generate');
          if (btn) {
            const mode = btn.getAttribute('data-mode') || 'standard';
            generateReplyWithAI(mode);
          }
        });
      }
    }
  }
  
  // Toggle formatting bar
  function toggleFormattingBar() {
    if (!els.replyFormattingBar) return;
    
    // Close link bar if open
    if (els.replyLinkBar && els.replyLinkBar.classList.contains('open')) {
      els.replyLinkBar.classList.remove('open');
      els.replyLinkBar.setAttribute('aria-hidden', 'true');
    }
    
    // Close AI bar if open
    if (els.replyAiBar && els.replyAiBar.classList.contains('open')) {
      els.replyAiBar.classList.remove('open');
      els.replyAiBar.setAttribute('aria-hidden', 'true');
    }
    
    const isOpen = els.replyFormattingBar.classList.toggle('open');
    els.replyFormattingBar.setAttribute('aria-hidden', String(!isOpen));
  }
  
  // Toggle link bar
  function toggleLinkBar() {
    if (!els.replyLinkBar) return;
    
    // Close formatting bar if open
    if (els.replyFormattingBar && els.replyFormattingBar.classList.contains('open')) {
      els.replyFormattingBar.classList.remove('open');
      els.replyFormattingBar.setAttribute('aria-hidden', 'true');
    }
    
    // Close AI bar if open
    if (els.replyAiBar && els.replyAiBar.classList.contains('open')) {
      els.replyAiBar.classList.remove('open');
      els.replyAiBar.setAttribute('aria-hidden', 'true');
    }
    
    const isOpen = els.replyLinkBar.classList.toggle('open');
    els.replyLinkBar.setAttribute('aria-hidden', String(!isOpen));
    
    // Prefill link text from selection
    try {
      const sel = window.getSelection();
      const hasText = sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed && sel.toString();
      const textInput = els.replyLinkBar.querySelector('[data-link-text]');
      if (textInput && hasText) textInput.value = sel.toString();
      (els.replyLinkBar.querySelector('[data-link-url]') || textInput)?.focus();
    } catch (_) {}
  }
  
  // Toggle AI bar
  function toggleAIBar() {
    if (!els.replyAiBar) return;
    
    // Close formatting bar if open
    if (els.replyFormattingBar && els.replyFormattingBar.classList.contains('open')) {
      els.replyFormattingBar.classList.remove('open');
      els.replyFormattingBar.setAttribute('aria-hidden', 'true');
    }
    
    // Close link bar if open
    if (els.replyLinkBar && els.replyLinkBar.classList.contains('open')) {
      els.replyLinkBar.classList.remove('open');
      els.replyLinkBar.setAttribute('aria-hidden', 'true');
    }
    
    const isOpen = els.replyAiBar.classList.toggle('open');
    els.replyAiBar.setAttribute('aria-hidden', String(!isOpen));
    
    // Focus prompt input when opened
    if (isOpen) {
      const promptInput = els.replyAiBar.querySelector('.ai-prompt');
      if (promptInput) {
        setTimeout(() => promptInput.focus(), 100);
      }
    }
  }
  
  // Handle formatting
  function handleFormatting(format, btn, editor) {
    if (!editor) return;
    
    // Ensure editor is editable and focused
    editor.contentEditable = 'true';
    editor.focus();
    
    // Ensure we have a selection
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      // Create a range at the end of the editor
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    
    document.execCommand(format, false, null);
    
    // Update button state
    if (format === 'bold' || format === 'italic' || format === 'underline') {
      const isActive = document.queryCommandState(format);
      btn.setAttribute('aria-pressed', String(isActive));
    }
  }
  
  // Insert link
  function insertLink(editor, linkBar) {
    const textInput = linkBar.querySelector('[data-link-text]');
    const urlInput = linkBar.querySelector('[data-link-url]');
    
    const text = textInput?.value?.trim() || '';
    const url = urlInput?.value?.trim() || '';
    
    if (!url) {
      window.crm?.showToast('Please enter a URL');
      return;
    }

    const linkText = text || url;
    const linkHtml = `<a href="${url}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
    
    editor.focus();
    document.execCommand('insertHTML', false, linkHtml);
    
    // Clear inputs and close bar
    textInput.value = '';
    urlInput.value = '';
    linkBar.classList.remove('open');
    linkBar.setAttribute('aria-hidden', 'true');
  }
  
  // Handle file attachment (matching global compose pattern)
  function handleFileAttachment(editor) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    
    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;
      
      // Check file sizes (limit to 10MB per file)
      const maxSize = 10 * 1024 * 1024; // 10MB
      const oversizedFiles = files.filter(file => file.size > maxSize);
      
      if (oversizedFiles.length > 0) {
        window.crm?.showToast(`Some files are too large. Maximum size is 10MB per file.`);
        return;
      }
      
      // Store files and update UI (using same pattern as global compose)
      files.forEach(file => {
        addReplyAttachment(file);
      });
      
      console.log('[EmailDetail] Added', files.length, 'files');
      window.crm?.showToast(`Added ${files.length} file${files.length > 1 ? 's' : ''}`);
    });
    
    // Trigger file selection
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
  }
  
  // Add attachment (matching global compose pattern)
  function addReplyAttachment(file) {
    // Store attachment data
    if (!window.emailAttachments) {
      window.emailAttachments = [];
    }
    
    const attachment = {
      id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // String ID to avoid precision issues
      name: file.name,
      size: file.size,
      type: file.type,
      file: file,
      icon: getFileIcon(file.type, file.name)
    };
    
    console.log('[EmailDetail] Adding attachment with ID:', attachment.id, 'Type:', typeof attachment.id);
    
    window.emailAttachments.push(attachment);
    updateReplyAttachmentBadge();
  }
  
  // Remove attachment (matching global compose pattern)
  function removeReplyAttachment(attachmentId) {
    console.log('[EmailDetail] removeAttachment called with ID:', attachmentId, 'Type:', typeof attachmentId);
    console.log('[EmailDetail] Current attachments:', window.emailAttachments);
    
    if (!window.emailAttachments) {
      console.log('[EmailDetail] No attachments array found');
      return;
    }
    
    const initialLength = window.emailAttachments.length;
    
    // Convert to string for consistent comparison
    const stringId = String(attachmentId);
    console.log('[EmailDetail] Converting ID to string:', stringId);
    
    // Log each attachment ID and type for debugging
    window.emailAttachments.forEach((att, index) => {
      console.log(`[EmailDetail] Attachment ${index}: ID=${att.id}, Type=${typeof att.id}, Match=${att.id === stringId}`);
    });
    
    window.emailAttachments = window.emailAttachments.filter(att => {
      const matches = att.id !== stringId;
      console.log(`[EmailDetail] Filtering attachment ${att.id}: ${matches ? 'KEEP' : 'REMOVE'}`);
      return matches;
    });
    
    const finalLength = window.emailAttachments.length;
    
    console.log('[EmailDetail] Removed attachment. Before:', initialLength, 'After:', finalLength);
    
    updateReplyAttachmentBadge();
  }
  
  // Get file icon (matching global compose pattern)
  function getFileIcon(mimeType, fileName) {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    // Document types
    if (mimeType.includes('pdf') || extension === 'pdf') {
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10,9 9,9 8,9"/>
      </svg>`;
    }
    
    if (mimeType.includes('word') || extension === 'doc' || extension === 'docx') {
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10,9 9,9 8,9"/>
      </svg>`;
    }
    
    if (mimeType.includes('excel') || extension === 'xls' || extension === 'xlsx') {
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10,9 9,9 8,9"/>
      </svg>`;
    }
    
    if (mimeType.includes('powerpoint') || extension === 'ppt' || extension === 'pptx') {
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10,9 9,9 8,9"/>
      </svg>`;
    }
    
    // Image types
    if (mimeType.includes('image')) {
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21,15 16,10 5,21"/>
      </svg>`;
    }
    
    // Archive types
    if (mimeType.includes('zip') || extension === 'zip' || extension === 'rar' || extension === '7z') {
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.27,6.96 12,12.01 20.73,6.96"/>
        <line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>`;
    }
    
    // Text files
    if (mimeType.includes('text') || extension === 'txt' || extension === 'csv') {
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10,9 9,9 8,9"/>
      </svg>`;
    }
    
    // Default file icon
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
    </svg>`;
  }
  
  // Format file size (matching global compose pattern)
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
  
  // Update attachment badge in reply footer (matching global compose pattern)
  function updateReplyAttachmentBadge() {
    const replyFooter = els.replyContainer ? els.replyContainer.querySelector('.email-reply-footer') : null;
    if (!replyFooter) {
      console.log('[EmailDetail] No reply footer found');
      return;
    }
    
    // Remove existing badge
    const existingBadge = replyFooter.querySelector('.attachment-badge');
    if (existingBadge) {
      console.log('[EmailDetail] Removing existing badge');
      existingBadge.remove();
    }
    
    // Don't show badge if no attachments
    if (!window.emailAttachments || window.emailAttachments.length === 0) {
      console.log('[EmailDetail] No attachments to display');
      return;
    }
    
    console.log('[EmailDetail] Creating badge for', window.emailAttachments.length, 'attachments');
    
    // Create attachment badge
    const badge = document.createElement('div');
    badge.className = 'attachment-badge';
    badge.innerHTML = `
      <div class="attachment-list">
        ${window.emailAttachments.map(att => `
          <div class="attachment-item" data-id="${att.id}">
            <div class="attachment-icon">${att.icon}</div>
            <div class="attachment-info">
              <div class="attachment-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</div>
              <div class="attachment-size">${formatFileSize(att.size)}</div>
            </div>
            <button class="attachment-remove" data-id="${att.id}" title="Remove attachment">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        `).join('')}
      </div>
    `;
    
    // Add click handler for remove buttons - use more specific targeting (matching global compose)
    badge.addEventListener('click', (e) => {
      console.log('[EmailDetail] Badge clicked, target:', e.target);
      
      // Check if the clicked element or its parent is a remove button
      const removeBtn = e.target.closest('.attachment-remove');
      if (removeBtn) {
        const attachmentId = removeBtn.dataset.id; // Don't use parseInt for string IDs
        console.log('[EmailDetail] Remove button clicked for ID:', attachmentId);
        e.preventDefault();
        e.stopPropagation();
        removeReplyAttachment(attachmentId);
      }
    });
    
    // Insert badge after reply-actions
    const replyActions = replyFooter.querySelector('.reply-actions');
    if (replyActions) {
      replyActions.insertAdjacentElement('afterend', badge);
      console.log('[EmailDetail] Badge inserted successfully');
    } else {
      console.error('[EmailDetail] Could not find reply-actions element');
    }
  }
  
  // Handle image upload
  function handleImageUpload(editor) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      if (file.size > 5 * 1024 * 1024) {
        window.crm?.showToast('Image file too large. Please choose a file under 5MB.');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.alt = file.name;
        
        editor.focus();
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          range.insertNode(img);
          range.setStartAfter(img);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          editor.appendChild(img);
        }
      };
      
      reader.readAsDataURL(file);
    });
    
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
  }
  
  // Send reply/forward
  async function sendReply() {
    if (!state.currentEmail || !els.replyToInput || !els.replySubjectInput || !els.replyBodyInput) return;
    
    const to = els.replyToInput.value.trim();
    const subject = els.replySubjectInput.value.trim();
    const body = els.replyBodyInput.innerHTML || '';
    
    if (!to) {
      window.crm?.showToast('Please enter recipients');
      els.replyToInput.focus();
      return;
    }
    
    if (!subject) {
      window.crm?.showToast('Please enter a subject');
      els.replySubjectInput.focus();
      return;
    }
    
    if (!body || body.trim() === '') {
      window.crm?.showToast('Please enter email content');
      els.replyBodyInput.focus();
      return;
    }
    
    try {
      // Get sender details from settings
      const settings = (window.SettingsPage?.getSettings?.()) || {};
      const g = settings?.general || {};
      const senderEmail = g.email || 'l.patterson@powerchoosers.com';
      const senderName = (g.firstName && g.lastName) 
        ? `${g.firstName} ${g.lastName}`.trim()
        : (g.agentName || 'Power Choosers Team');
      
      // Prepare email data
      const emailData = {
        to: to.split(',').map(email => email.trim()),
        subject: subject,
        content: body,
        from: senderEmail,
        fromName: senderName,
        isHtmlEmail: true,
        threadId: state.currentEmail.threadId || state.currentEmail.id,
        inReplyTo: state.currentEmail.id,
        references: state.currentEmail.references || [state.currentEmail.id]
      };
      
      // Disable send button
      if (els.replySendBtn) {
        els.replySendBtn.disabled = true;
        els.replySendBtn.textContent = 'Sending...';
      }
      
      // Get deliverability settings
      const deliverRaw = settings?.emailDeliverability || {};
      const deliver = {
        enableTracking: deliverRaw.enableTracking !== false && deliverRaw.enableClickTracking !== false,
        includeBulkHeaders: deliverRaw.includeBulkHeaders === true,
        includeListUnsubscribe: deliverRaw.includeListUnsubscribe !== false,
        includePriorityHeaders: deliverRaw.includePriorityHeaders === true,
        forceGmailOnly: false,
        useBrandedHtmlTemplate: deliverRaw.useBrandedHtmlTemplate === true,
        signatureImageEnabled: deliverRaw.signatureImageEnabled !== false
      };
      
      // Send via SendGrid API
      const baseUrl = window.API_BASE_URL || window.location.origin || '';
      const response = await fetch(`${baseUrl}/api/email/sendgrid-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...emailData,
          _deliverability: deliver,
          trackingId: `sendgrid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to send email');
      }
      
      // Show success and close
      window.crm?.showToast('Email sent successfully!');
      closeReplyContainer();
      
    } catch (error) {
      console.error('[EmailDetail] Send error:', error);
      window.crm?.showToast('Failed to send email: ' + error.message);
    } finally {
      if (els.replySendBtn) {
        els.replySendBtn.disabled = false;
        els.replySendBtn.textContent = 'Send';
      }
    }
  }
  
  // Generate reply with AI
  async function generateReplyWithAI(mode = 'standard') {
    if (!state.currentEmail || !els.replyAiBar || !els.replyBodyInput) return;
    
    const email = state.currentEmail;
    const status = els.replyAiBar.querySelector('.ai-status');
    const promptInput = els.replyAiBar.querySelector('.ai-prompt');
    const userPrompt = promptInput?.value?.trim() || '';
    
    // Close AI bar
    els.replyAiBar.classList.remove('open');
    els.replyAiBar.setAttribute('aria-hidden', 'true');
    
    if (status) status.textContent = 'Generating...';
    
    try {
      const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
      const genUrl = `${base}/api/perplexity-email`;
      
      console.log('[EmailDetail] Generating reply with AI, mode:', mode);
      
      // Extract recipient email
      const recipientEmail = els.replyToInput?.value?.trim() || extractEmail(email.from);
      
      // Lookup recipient data
      let recipient = null;
      try {
        if (recipientEmail) {
          // Try to find recipient in people collection
          const peopleQuery = await firebase.firestore()
            .collection('people')
            .where('email', '==', recipientEmail)
            .limit(1)
            .get();
          
          if (!peopleQuery.empty) {
            const personDoc = peopleQuery.docs[0];
            recipient = { id: personDoc.id, ...personDoc.data() };
            
            // Enrich with account data if available
            if (recipient.accountId || recipient.account_id) {
              const accountId = recipient.accountId || recipient.account_id;
              const accountDoc = await firebase.firestore()
                .collection('accounts')
                .doc(accountId)
                .get();
              
              if (accountDoc.exists) {
                recipient.account = { id: accountDoc.id, ...accountDoc.data() };
              }
            }
          }
        }
      } catch (error) {
        console.warn('[EmailDetail] Failed to lookup recipient:', error);
      }
      
      // Build email thread context for intelligent reply generation
      const emailThreadContext = {
        subject: email.subject || '',
        from: email.from || '',
        to: Array.isArray(email.to) ? email.to.join(', ') : email.to || '',
        date: email.date ? new Date(email.date).toLocaleString() : '',
        // Extract text content from email (strip HTML)
        content: email.text || email.content || (email.html ? stripHtml(email.html) : '') || ''
      };
      
      // Build intelligent prompt based on email thread
      let intelligentPrompt = userPrompt;
      
      if (!userPrompt) {
        // Check if this is an out-of-office message
        const contentLower = emailThreadContext.content.toLowerCase();
        const subjectLower = emailThreadContext.subject.toLowerCase();
        const isOutOfOffice = /out of(?:[ -]the)?[ -]office|ooo|away from|be back|returning/i.test(contentLower) ||
                             /out of(?:[ -]the)?[ -]office|ooo|away from/i.test(subjectLower) ||
                             /won'?t be (?:in|available)|will be unavailable/i.test(contentLower);
        
        if (isOutOfOffice) {
          // Generate simple acknowledgment for OOO messages
          intelligentPrompt = `This is an out-of-office auto-reply message. Generate a brief, professional acknowledgment:
Subject: ${emailThreadContext.subject}
From: ${emailThreadContext.from}
Content: ${emailThreadContext.content.substring(0, 300)}

Generate a SHORT, friendly acknowledgment that:
- Thanks them for letting you know
- Acknowledges their return date if mentioned
- Says you'll follow up when they're back
- NO sales pitch, NO energy services mention
- Keep it under 40 words total
- Be warm and casual

CRITICAL: Return ONLY plain text paragraphs (paragraph1, paragraph2, paragraph3 in JSON), NO questions about contracts or energy costs.`;
        } else {
          // Generate intelligent prompt based on email content
          intelligentPrompt = `Reply to this email thread:
Subject: ${emailThreadContext.subject}
From: ${emailThreadContext.from}
Date: ${emailThreadContext.date}
Content: ${emailThreadContext.content.substring(0, 500)}${emailThreadContext.content.length > 500 ? '...' : ''}

Generate an appropriate professional reply that:
- Addresses the points raised in the email
- Maintains a professional and helpful tone
- Provides relevant information or next steps
- Is concise and actionable`;
        }
      } else {
        // User provided prompt - enhance with thread context
        intelligentPrompt = `${userPrompt}

Email thread context:
Subject: ${emailThreadContext.subject}
From: ${emailThreadContext.from}
Content: ${emailThreadContext.content.substring(0, 500)}${emailThreadContext.content.length > 500 ? '...' : ''}`;
      }
      
      // Get settings
      const settings = (window.SettingsPage?.getSettings?.()) || {};
      const g = settings?.general || {};
      const senderName = (g.firstName && g.lastName) 
        ? `${g.firstName} ${g.lastName}`.trim()
        : (g.agentName || 'Power Choosers Team');
      
      // Get AI templates from settings
      const aiTemplates = settings?.aiTemplates || {};
      const whoWeAre = aiTemplates.who_we_are || 'You are an Energy Strategist at Power Choosers, a company that helps businesses secure lower electricity and natural gas rates.';
      
      // Get industry segmentation
      const industrySegmentation = settings?.industrySegmentation || null;
      
      // Call Perplexity API
      const response = await fetch(genUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: intelligentPrompt,
          recipient: recipient,
          mode: mode,
          senderName: senderName,
          whoWeAre: whoWeAre,
          marketContext: aiTemplates.marketContext,
          meetingPreferences: aiTemplates.meetingPreferences,
          industrySegmentation: industrySegmentation
        })
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('[EmailDetail] AI response received:', result);
      
      // Handle response based on mode
      const templateType = result.templateType || null;
      const output = result.output || '';
      
      let subject = '';
      let html = '';
      
      if (mode === 'html' && templateType) {
        // HTML mode with structured JSON - use buildGeneralHtml for general template
        if (templateType === 'general') {
          html = buildGeneralHtml(output, recipient, g.email || '');
          subject = output.subject || emailThreadContext.subject;
        } else {
          // For other template types, try to use formatTemplatedEmail if available
          if (window.emailComposeGlobal && typeof window.emailComposeGlobal.formatTemplatedEmail === 'function') {
            const formatted = window.emailComposeGlobal.formatTemplatedEmail(output, recipient, templateType);
            subject = formatted.subject;
            html = formatted.html;
          } else {
            // Fallback: use general template for all HTML emails
            html = buildGeneralHtml(output, recipient, g.email || '');
            subject = output.subject || emailThreadContext.subject;
          }
        }
      } else {
        // Standard mode - format as plain text reply
        const formatted = formatStandardReply(output, recipient);
        subject = formatted.subject;
        html = formatted.html;
      }
      
      // Update subject if needed
      if (subject && els.replySubjectInput) {
        const currentSubject = els.replySubjectInput.value || '';
        if (!currentSubject || currentSubject === `Re: ${emailThreadContext.subject}`) {
          els.replySubjectInput.value = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
        }
      }
      
      // Insert generated content into reply body
      if (html && els.replyBodyInput) {
        // Clear existing content but preserve signature
        const signature = els.replyBodyInput.querySelector('[data-signature="true"]');
        els.replyBodyInput.innerHTML = '';
        
        // Insert generated content
        if (mode === 'html' && templateType) {
          // For HTML emails, render in iframe like global compose
          renderHtmlEmailInIframe(els.replyBodyInput, html);
          els.replyBodyInput.setAttribute('data-html-email', 'true');
          els.replyBodyInput.setAttribute('data-template-type', templateType);
        } else {
          // Standard mode - insert HTML directly
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = html;
          while (tempDiv.firstChild) {
            els.replyBodyInput.appendChild(tempDiv.firstChild);
          }
        }
        
        // Re-add signature if it existed
        if (signature) {
          els.replyBodyInput.appendChild(signature);
        } else {
          // Add signature if available
          try {
            const signatureHtml = window.getEmailSignature ? window.getEmailSignature() : '';
            if (signatureHtml) {
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = signatureHtml;
              while (tempDiv.firstChild) {
                els.replyBodyInput.appendChild(tempDiv.firstChild);
              }
            }
          } catch (error) {
            console.warn('[EmailDetail] Error adding signature:', error);
          }
        }
        
        // Focus the body input
        els.replyBodyInput.focus();
      }
      
      if (status) status.textContent = 'Generated successfully!';
      
    } catch (error) {
      console.error('[EmailDetail] AI generation failed:', error);
      if (status) status.textContent = 'Generation failed. Please try again.';
      window.crm?.showToast('Failed to generate reply: ' + error.message);
    }
  }
  
  // Helper: Strip HTML tags
  function stripHtml(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }
  
  // Helper: Format standard reply
  function formatStandardReply(output, recipient) {
    // Get sender's first name for signature
    const settings = (window.SettingsPage?.getSettings?.()) || {};
    const senderFirstName = settings?.general?.firstName || 
                           window.authManager?.getCurrentUser()?.displayName?.split(' ')[0] || 
                           'Power Choosers Team';
    
    // If output is a string, try to parse as JSON first
    if (typeof output === 'string') {
      try {
        // Try to parse JSON (handles both ```json blocks and raw JSON)
        let jsonText = output.trim()
          .replace(/^\s*```json\s*/i, '')
          .replace(/^\s*```\s*/i, '')
          .replace(/\s*```\s*$/i, '');
        
        // Extract the first JSON object only (ignore trailing notes)
        const match = jsonText.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          
          // Successfully parsed JSON - format it
          const subject = parsed.subject || '';
          const greeting = parsed.greeting || '';
          const paragraphs = [
            parsed.paragraph1,
            parsed.paragraph2,
            parsed.paragraph3
          ].filter(Boolean);
          
          // Add signature to last paragraph
          const html = `<p>${greeting}</p>${paragraphs.map(p => `<p>${p}</p>`).join('')}<p><br></p><p>Best regards,<br>${senderFirstName}</p>`;
          
          return { subject, html };
        }
      } catch (e) {
        console.warn('[EmailDetail] JSON parse failed, treating as plain text:', e);
      }
      
      // Fallback: treat as plain text with signature
      return {
        subject: '',
        html: output.replace(/\n/g, '<br>') + `<br><br>Best regards,<br>${senderFirstName}`
      };
    }
    
    // Already an object - format directly
    const subject = output.subject || '';
    const greeting = output.greeting || '';
    const paragraphs = [
      output.paragraph1,
      output.paragraph2,
      output.paragraph3
    ].filter(Boolean);
    
    // Add signature to formatted output
    const html = `<p>${greeting}</p>${paragraphs.map(p => `<p>${p}</p>`).join('')}<p><br></p><p>Best regards,<br>${senderFirstName}</p>`;
    
    return { subject, html };
  }
  
  // Helper: Build simple HTML reply (fallback)
  function buildSimpleReplyHtml(data, recipient, fromEmail) {
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    const greeting = data.greeting || `Hi ${firstName},`;
    const opening = data.opening_paragraph || data.paragraph1 || '';
    const sections = data.sections || [];
    
    return `
      <p>${greeting}</p>
      ${opening ? `<p>${opening}</p>` : ''}
      ${sections.length > 0 ? `
        <p><strong>${data.list_header || 'Key Points:'}</strong></p>
        <ul>
          ${sections.map(s => `<li>${s}</li>`).join('')}
        </ul>
      ` : ''}
    `;
  }
  
  // Helper: Build general HTML template (imported from global compose)
  function buildGeneralHtml(data, recipient, fromEmail) {
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    
    // Get sender profile
    const settings = (window.SettingsPage?.getSettings?.()) || {};
    const g = settings?.general || {};
    const s = {
      name: (g.firstName && g.lastName) ? `${g.firstName} ${g.lastName}`.trim() : (g.agentName || 'Power Choosers Team'),
      title: g.title || 'Energy Strategist',
      company: g.companyName || 'Power Choosers',
      location: g.location || '',
      phone: g.phone || '',
      avatar: g.hostedPhotoURL || g.photoURL || ''
    };
    
    // Simplify subject for preview
    const simplifySubject = (subject) => {
      if (!subject) return `Energy Solutions for ${company}`;
      let simplified = subject.replace(/\s*-\s*[A-Za-z]+$/, '').trim();
      if (simplified.length > 50) {
        simplified = simplified.substring(0, 47) + '...';
      }
      return simplified || `Energy Solutions for ${company}`;
    };
    
    const displaySubject = simplifySubject(data.subject);
    
    const sections = data.sections || [
      'We\'ve secured exclusive rates for facilities that are 15-25% below typical renewal offers',
      'Our team handles all supplier negotiations and contract reviews at no cost to you',
      'You maintain complete control and transparency throughout the entire process',
      'Early action now protects you from anticipated rate increases'
    ];
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin:0; padding:0; background:#f1f5fa; font-family:'Segoe UI',Arial,sans-serif; color:#1e3a8a;}
    .container { max-width:600px; margin:30px auto; background:#fff; border-radius:12px;
      box-shadow:0 6px 28px rgba(30,64,175,0.11),0 1.5px 4px rgba(30,64,175,0.03); overflow:hidden;
    }
    .header { padding:32px 24px 18px 24px; background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);
      color:#fff; text-align:center;
    }
    .header img { max-width:190px; margin:0 auto 10px; display:block;}
    .brandline { font-size:16px; font-weight:600; letter-spacing:0.08em; opacity:0.92;}
    .subject-blurb { margin:20px 24px 10px 24px; font-size:14px; color:#234bb7;
      font-weight:600; letter-spacing:0.02em; opacity:0.93;
      background:#eff6ff; padding:8px 15px; border-radius:6px; display:inline-block;
    }
    .intro { margin:0 24px 18px 24px; padding:18px 0 2px 0; }
    .intro p { margin:0 0 12px 0; font-size:16px; color:#1e3a8a; line-height:1.6; }
    .intro p:last-child { margin-bottom:0; }
    .info-list { background:#f6f7fb; border-radius:8px;
      padding:12px 18px; margin:0 auto 18px auto; max-width:450px; box-shadow:0 2px 8px rgba(30,64,175,0.06);
      font-size:14px; color:#22223b;
    }
    .info-list ul {margin:0;padding:0;list-style:none;}
    .info-list ul li {padding:4px 0; border-bottom:1px solid #e5e8ec; line-height:1.5;}
    .info-list ul li:last-child { border-bottom:none; }
    .cta-container { text-align:center; padding:22px 24px;
      background:#eff6ff; border-radius:8px; margin:0 24px 18px 24px;
      box-shadow:0 2px 6px rgba(249,115,22,0.05);
    }
    .cta-btn { display:inline-block; padding:13px 36px; background:#f97316; color:#fff;
      border-radius:7px; font-weight:700; font-size:16px; text-decoration:none;
      box-shadow:0 2px 8px rgba(249,115,22,0.13); transition:background 0.18s;
    }
    .cta-btn:hover { background:#ea580c;}
    .signature { margin:15px 24px 22px 24px; font-size:15.3px; color:#1e40af;
      font-weight:500; padding:14px 0 0 0; border-top:1px solid #e9ebf3;
    }
    .footer { padding:22px 24px; color:#aaa; text-align:center; font-size:13px;
      background: #f1f5fa; border-bottom-left-radius:14px; border-bottom-right-radius:14px;
      letter-spacing:0.08em;
    }
    @media (max-width:650px){
      .info-list {margin:0 3vw 18px 3vw; max-width:100%;}
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/687d6d9c6ea5d6db744563ee_clear%20logo.png" alt="Power Choosers">
      <div class="brandline">Your Energy Partner</div>
    </div>
    <div class="subject-blurb">${displaySubject}</div>
    <div class="intro">
      <p>${data.greeting || `Hi ${firstName},`}</p>
      <p>${data.opening_paragraph || `I wanted to reach out about an interesting opportunity for ${company}.`}</p>
    </div>
    <div class="info-list">
      <strong>${data.list_header || 'How We Can Help:'}</strong>
      <ul>
        ${sections.map(section => `<li>${section}</li>`).join('')}
      </ul>
    </div>
    <div class="cta-container">
      <a href="https://powerchoosers.com/schedule" class="cta-btn">${data.cta_text || 'Schedule A Meeting'}</a>
      <div style="margin-top:8px;font-size:14px;color:#1e3a8a;opacity:0.83;">
        Prefer email or need more info? Just reply—happy to assist.
      </div>
    </div>
    <div class="signature">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
        ${s.avatar ? `<img src="${escapeHtml(s.avatar)}" alt="${escapeHtml(s.name)}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">` : ''}
        <div>
          <div style="font-weight: 600; font-size: 15px; color: #1e3a8a;">${escapeHtml(s.name)}</div>
          <div style="font-size: 13px; color: #1e40af; opacity: 0.9;">${escapeHtml(s.title)}</div>
        </div>
      </div>
      <div style="font-size: 14px; color: #1e40af; margin: 4px 0 0 0; line-height: 1.4;">
        ${s.location ? `<div style="margin: 0; line-height: 1.3;">${escapeHtml(s.location)}</div>` : ''}
        ${s.phone ? `<div style="margin: 2px 0 0 0; line-height: 1.3;">${escapeHtml(s.phone)}</div>` : ''}
        <div style="margin: 2px 0 0 0; line-height: 1.3;">${escapeHtml(s.company)}</div>
      </div>
    </div>
    <div class="footer">
      Power Choosers &bull; Your Energy Partner<br>
      &copy; 2025 PowerChoosers.com. All rights reserved.
    </div>
  </div>
</body>
</html>
    `;
  }
  
  // Helper: Render HTML email in iframe (like global compose)
  function renderHtmlEmailInIframe(editor, html) {
    // Create iframe for HTML email
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.minHeight = '400px';
    iframe.style.border = 'none';
    iframe.style.background = 'var(--bg-card)';
    iframe.style.borderRadius = 'var(--border-radius-sm)';
    iframe.style.overflow = 'hidden';
    iframe.setAttribute('sandbox', 'allow-same-origin');
    
    editor.innerHTML = '';
    editor.appendChild(iframe);
    
    // Write HTML to iframe with rounded corners styling
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    iframeDoc.open();
    
    // Inject CSS to round corners of email container
    // Try to find and replace existing border-radius, or add it
    let roundedHtml = html;
    
    // If there's already a style tag, inject into it
    if (/<style[^>]*>/i.test(roundedHtml)) {
      roundedHtml = roundedHtml.replace(
        /(<style[^>]*>)/i,
        `$1
        body > div:first-child,
        body > .container:first-child,
        body > [class*="container"]:first-child,
        body > table:first-child {
          border-radius: 12px !important;
          overflow: hidden !important;
        }
        body {
          margin: 0;
          padding: 0;
        }`
      );
    } else {
      // Add style tag if none exists
      roundedHtml = `<style>
        body > div:first-child,
        body > .container:first-child,
        body > [class*="container"]:first-child,
        body > table:first-child {
          border-radius: 12px !important;
          overflow: hidden !important;
        }
        body {
          margin: 0;
          padding: 0;
        }
      </style>` + roundedHtml;
    }
    
    // Also update any existing border-radius in container styles to match
    roundedHtml = roundedHtml.replace(
      /\.container\s*\{[^}]*border-radius:\s*[^;]+;/gi,
      '.container { border-radius: 12px;'
    );
    
    iframeDoc.write(roundedHtml);
    iframeDoc.close();
  }
  
  // Close reply container
  function closeReplyContainer() {
    if (!els.replyContainer) return;
    
    // Clear fields
    if (els.replyToInput) {
      els.replyToInput.value = '';
      els.replyToInput.removeAttribute('readonly'); // Reset readonly state
    }
    if (els.replyCcInput) els.replyCcInput.value = '';
    if (els.replyBccInput) els.replyBccInput.value = '';
    if (els.replySubjectInput) els.replySubjectInput.value = '';
    if (els.replyBodyInput) {
      els.replyBodyInput.innerHTML = '';
      els.replyBodyInput.contentEditable = 'true'; // Ensure editable
    }
    if (els.replyCcBcc) els.replyCcBcc.style.display = 'none';
    
    // Clear attachments when closing
    if (window.emailAttachments) {
      window.emailAttachments = [];
      updateReplyAttachmentBadge();
    }
    
    // Hide container
    els.replyContainer.style.display = 'none';
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

  // Add action buttons for scheduled emails (all statuses)
  function addScheduledEmailActions() {
    if (!els.actionBar || !state.currentEmail) return;

    const status = state.currentEmail.status || 'not_generated';

    // Remove any existing scheduled email buttons
    const existingBtns = els.actionBar.querySelectorAll('.approve-btn, .reject-btn, .regenerate-btn, .generate-btn');
    existingBtns.forEach(btn => btn.remove());

    // Show different buttons based on status
    if (status === 'not_generated') {
      // For not_generated: Show Generate button
      const generateBtn = document.createElement('button');
      generateBtn.className = 'btn-primary generate-btn';
      generateBtn.textContent = 'Generate Email';
      generateBtn.addEventListener('click', () => generateScheduledEmail(state.currentEmail.id));
      els.actionBar.insertBefore(generateBtn, els.deleteBtn);
    } else if (status === 'pending_approval') {
      // For pending_approval: Show Approve, Reject, and Regenerate buttons
      const approveBtn = document.createElement('button');
      approveBtn.className = 'btn-primary approve-btn';
      approveBtn.textContent = 'Approve';
      approveBtn.addEventListener('click', () => approveScheduledEmail(state.currentEmail.id));
      els.actionBar.insertBefore(approveBtn, els.deleteBtn);

      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'btn-secondary reject-btn';
      rejectBtn.textContent = 'Reject';
      rejectBtn.addEventListener('click', () => rejectScheduledEmail(state.currentEmail.id));
      els.actionBar.insertBefore(rejectBtn, els.deleteBtn);

      const regenerateBtn = document.createElement('button');
      regenerateBtn.className = 'btn-secondary regenerate-btn';
      regenerateBtn.textContent = 'Regenerate';
      regenerateBtn.addEventListener('click', () => regenerateScheduledEmail(state.currentEmail.id));
      els.actionBar.insertBefore(regenerateBtn, els.deleteBtn);
    } else if (status === 'approved') {
      // For approved: Show Regenerate button (can regenerate before sending)
      const regenerateBtn = document.createElement('button');
      regenerateBtn.className = 'btn-secondary regenerate-btn';
      regenerateBtn.textContent = 'Regenerate';
      regenerateBtn.addEventListener('click', () => regenerateScheduledEmail(state.currentEmail.id));
      els.actionBar.insertBefore(regenerateBtn, els.deleteBtn);
    } else if (status === 'rejected') {
      // For rejected: Show Regenerate button (can regenerate after rejection)
      const regenerateBtn = document.createElement('button');
      regenerateBtn.className = 'btn-primary regenerate-btn';
      regenerateBtn.textContent = 'Regenerate';
      regenerateBtn.addEventListener('click', () => regenerateScheduledEmail(state.currentEmail.id));
      els.actionBar.insertBefore(regenerateBtn, els.deleteBtn);
    }

    // Hide reply/forward buttons for scheduled emails
    if (els.replyBtn) els.replyBtn.style.display = 'none';
    if (els.forwardBtn) els.forwardBtn.style.display = 'none';
  }

  // Approve scheduled email
  async function approveScheduledEmail(emailId) {
    try {
      // Update via FreeSequenceAutomation if available
      if (window.freeSequenceAutomation && typeof window.freeSequenceAutomation.approveEmail === 'function') {
        await window.freeSequenceAutomation.approveEmail(emailId);
      } else {
        // Fallback: update Firebase directly
        const db = window.firebaseDB || (window.firebase && window.firebase.firestore());
        if (db) {
          await db.collection('emails').doc(emailId).update({
            status: 'approved',
            approvedAt: Date.now(),
            updatedAt: new Date().toISOString()
          });
        }
      }

      // Show success message
      if (window.crm && window.crm.showToast) {
        window.crm.showToast('Email approved and will be sent at scheduled time');
      }

      // Go back to emails page
      goBack();
    } catch (error) {
      console.error('[EmailDetail] Failed to approve email:', error);
      if (window.crm && window.crm.showToast) {
        window.crm.showToast('Failed to approve email');
      }
    }
  }

  // Reject scheduled email
  async function rejectScheduledEmail(emailId) {
    if (!confirm('Are you sure you want to reject this scheduled email?')) {
      return;
    }

    try {
      // Update via FreeSequenceAutomation if available
      if (window.freeSequenceAutomation && typeof window.freeSequenceAutomation.rejectEmail === 'function') {
        await window.freeSequenceAutomation.rejectEmail(emailId);
      } else {
        // Fallback: update Firebase directly
        const db = window.firebaseDB || (window.firebase && window.firebase.firestore());
        if (db) {
          await db.collection('emails').doc(emailId).update({
            status: 'rejected',
            rejectedAt: Date.now(),
            updatedAt: new Date().toISOString()
          });
        }
      }

      // Show success message
      if (window.crm && window.crm.showToast) {
        window.crm.showToast('Email rejected');
      }

      // Go back to emails page
      goBack();
    } catch (error) {
      console.error('[EmailDetail] Failed to reject email:', error);
      if (window.crm && window.crm.showToast) {
        window.crm.showToast('Failed to reject email');
      }
    }
  }

  // Generate scheduled email (for not_generated status)
  async function generateScheduledEmail(emailId) {
    try {
      const db = window.firebaseDB || (window.firebase && window.firebase.firestore());
      if (!db) {
        throw new Error('Firebase not available');
      }

      // Get email data
      const emailDoc = await db.collection('emails').doc(emailId).get();
      if (!emailDoc.exists) {
        throw new Error('Email not found');
      }

      const emailData = emailDoc.data();

      // Show loading state
      if (window.crm && window.crm.showToast) {
        window.crm.showToast('Generating email content...');
      }

      // Update status to generating
      await db.collection('emails').doc(emailId).update({
        status: 'generating',
        updatedAt: new Date().toISOString()
      });

      // Generate email using the same logic as generate-scheduled-emails.js
      await generateEmailContentForScheduledEmail(emailId, emailData);

      // Show success message
      if (window.crm && window.crm.showToast) {
        window.crm.showToast('Email generated successfully');
      }

      // Reload email detail
      await show(emailId);
    } catch (error) {
      console.error('[EmailDetail] Failed to generate email:', error);
      
      // Update status back to not_generated on error
      try {
        const db = window.firebaseDB || (window.firebase && window.firebase.firestore());
        if (db) {
          await db.collection('emails').doc(emailId).update({
            status: 'not_generated',
            errorMessage: error.message,
            updatedAt: new Date().toISOString()
          });
        }
      } catch (updateError) {
        console.error('[EmailDetail] Failed to update error status:', updateError);
      }
      
      if (window.crm && window.crm.showToast) {
        window.crm.showToast('Failed to generate email: ' + error.message);
      }
    }
  }

  // Regenerate scheduled email (for pending_approval, approved, or rejected status)
  async function regenerateScheduledEmail(emailId) {
    try {
      const db = window.firebaseDB || (window.firebase && window.firebase.firestore());
      if (!db) {
        throw new Error('Firebase not available');
      }

      // Get email data
      const emailDoc = await db.collection('emails').doc(emailId).get();
      if (!emailDoc.exists) {
        throw new Error('Email not found');
      }

      const emailData = emailDoc.data();

      // Show loading state
      if (window.crm && window.crm.showToast) {
        window.crm.showToast('Regenerating email content...');
      }

      // Update status to generating
      await db.collection('emails').doc(emailId).update({
        status: 'generating',
        updatedAt: new Date().toISOString()
      });

      // Generate email using the same logic as generate-scheduled-emails.js
      await generateEmailContentForScheduledEmail(emailId, emailData);

      // Show success message
      if (window.crm && window.crm.showToast) {
        window.crm.showToast('Email regenerated successfully');
      }

      // Reload email detail
      await show(emailId);
    } catch (error) {
      console.error('[EmailDetail] Failed to regenerate email:', error);
      
      // Update status back to previous status on error
      try {
        const db = window.firebaseDB || (window.firebase && window.firebase.firestore());
        if (db) {
          const emailDoc = await db.collection('emails').doc(emailId).get();
          const emailData = emailDoc.data();
          const previousStatus = emailData.status === 'generating' ? 'pending_approval' : emailData.status;
          
          await db.collection('emails').doc(emailId).update({
            status: previousStatus,
            errorMessage: error.message,
            updatedAt: new Date().toISOString()
          });
        }
      } catch (updateError) {
        console.error('[EmailDetail] Failed to update error status:', updateError);
      }
      
      if (window.crm && window.crm.showToast) {
        window.crm.showToast('Failed to regenerate email: ' + error.message);
      }
    }
  }

  // Helper: Generate email content for a scheduled email (uses perplexity-email endpoint)
  async function generateEmailContentForScheduledEmail(emailId, emailData) {
    const db = window.firebaseDB || (window.firebase && window.firebase.firestore());
    
    // Lookup contact data if contactId exists
    let recipient = null;
    if (emailData.contactId) {
      try {
        const contactDoc = await db.collection('people').doc(emailData.contactId).get();
        if (contactDoc.exists) {
          const contact = contactDoc.data();
          
          // Try to get account data
          let account = null;
          if (contact.accountId || contact.account_id) {
            const accountId = contact.accountId || contact.account_id;
            const accountDoc = await db.collection('accounts').doc(accountId).get();
            if (accountDoc.exists) {
              account = { id: accountDoc.id, ...accountDoc.data() };
            }
          }
          
          recipient = {
            id: contactDoc.id,
            email: emailData.to || contact.email || '',
            name: contact.name || contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
            firstName: contact.firstName || '',
            lastName: contact.lastName || '',
            fullName: contact.fullName || contact.name || '',
            company: contact.company || account?.accountName || account?.name || '',
            title: contact.title || contact.job || contact.role || '',
            phone: contact.phone || contact.mobile || '',
            account: account ? {
              id: account.id,
              name: account.accountName || account.name || '',
              industry: account.industry || '',
              domain: account.domain || account.website || '',
              annualUsage: account.annualUsage || ''
            } : null
          };
        }
      } catch (error) {
        console.warn('[EmailDetail] Failed to lookup contact:', error);
      }
    }
    
    // Build recipient from email data if contact lookup failed
    if (!recipient) {
      recipient = {
        email: emailData.to || '',
        name: emailData.contactName || '',
        firstName: (emailData.contactName || '').split(' ')[0] || '',
        company: emailData.contactCompany || ''
      };
    }
    
    // Get settings for AI generation
    const settings = (window.SettingsPage?.getSettings?.()) || {};
    const g = settings?.general || {};
    const senderName = (g.firstName && g.lastName) 
      ? `${g.firstName} ${g.lastName}`.trim()
      : (g.agentName || 'Power Choosers Team');
    
    const aiTemplates = settings?.aiTemplates || {};
    const whoWeAre = aiTemplates.who_we_are || 'You are an Energy Strategist at Power Choosers, a company that helps businesses secure lower electricity and natural gas rates.';
    const industrySegmentation = settings?.industrySegmentation || null;
    
    // Call Perplexity API (same as email-compose-global.js)
    const baseUrl = window.API_BASE_URL || window.location.origin || '';
    const genUrl = `${baseUrl}/api/perplexity-email`;
    
    const response = await fetch(genUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: emailData.aiPrompt || 'Write a professional follow-up email',
        recipient: recipient,
        mode: 'standard', // Use standard mode for scheduled emails
        senderName: senderName,
        whoWeAre: whoWeAre,
        marketContext: aiTemplates.marketContext,
        meetingPreferences: aiTemplates.meetingPreferences,
        industrySegmentation: industrySegmentation
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API error: ${response.status}`);
    }

    const result = await response.json();
    
    // Format the output (similar to email-compose-global.js formatGeneratedEmail)
    let subject = '';
    let html = '';
    let text = '';
    
    if (result.templateType) {
      // HTML template mode
      const formatted = formatTemplatedEmailForScheduled(result.output, recipient, result.templateType);
      subject = formatted.subject;
      html = formatted.html;
      text = stripHtml(html);
    } else {
      // Standard mode
      const formatted = formatStandardEmailForScheduled(result.output, recipient);
      subject = formatted.subject;
      html = formatted.html;
      text = formatted.text || stripHtml(html);
    }
    
    // Update email with generated content
    await db.collection('emails').doc(emailId).update({
      subject: subject,
      html: html,
      text: text,
      status: 'pending_approval',
      generatedAt: Date.now(),
      generatedBy: 'manual',
      updatedAt: new Date().toISOString()
    });
  }

  // Helper: Format templated email for scheduled emails
  function formatTemplatedEmailForScheduled(result, recipient, templateType) {
    // Use the same logic as email-compose-global.js formatTemplatedEmail
    // For now, use a simplified version
    const subject = result.subject || 'Energy Solutions';
    const html = result.html || result.output || '<p>Email content</p>';
    
    return { subject, html };
  }

  // Helper: Format standard email for scheduled emails
  function formatStandardEmailForScheduled(output, recipient) {
    // Parse JSON if needed
    let jsonData = null;
    try {
      if (typeof output === 'string') {
        let jsonText = output.trim()
          .replace(/^\s*```json\s*/i, '')
          .replace(/^\s*```\s*/i, '')
          .replace(/\s*```\s*$/i, '');
        const match = jsonText.match(/\{[\s\S]*\}/);
        if (match) {
          jsonData = JSON.parse(match[0]);
        }
      } else if (typeof output === 'object') {
        jsonData = output;
      }
    } catch (e) {
      console.warn('[EmailDetail] JSON parse failed, treating as plain text');
    }
    
    if (jsonData) {
      const subject = jsonData.subject || 'Energy Solutions';
      const paragraphs = [
        jsonData.greeting,
        jsonData.paragraph1,
        jsonData.paragraph2,
        jsonData.paragraph3
      ].filter(Boolean);
      
      const senderFirstName = (window.SettingsPage?.getSettings?.()?.general?.firstName || 'Power Choosers Team').split(' ')[0];
      const closing = `Best regards,\n${senderFirstName}`;
      
      const html = paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('') + `<p>${escapeHtml(closing)}</p>`;
      const text = paragraphs.join('\n\n') + '\n\n' + closing;
      
      return { subject, html, text };
    } else {
      // Plain text fallback
      const subject = 'Energy Solutions';
      const text = typeof output === 'string' ? output : JSON.stringify(output);
      const html = text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
      return { subject, html: `<p>${html}</p>`, text };
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

  // Cache for contact names looked up from Firebase (populated asynchronously)
  const contactNameCache = new Map();
  const pendingLookups = new Set(); // Track lookups in progress to avoid duplicates

  // Async helper to lookup contact name from Firebase and cache it
  async function lookupContactNameFromFirebase(emailAddress) {
    if (!emailAddress || !emailAddress.includes('@') || !window.firebaseDB) {
      return null;
    }

    const normalizedEmail = emailAddress.toLowerCase().trim();

    // Avoid duplicate lookups
    if (pendingLookups.has(normalizedEmail)) {
      return null;
    }

    pendingLookups.add(normalizedEmail);

    try {
      // Try contacts collection first
      let snap = await window.firebaseDB.collection('contacts')
        .where('email', '==', normalizedEmail)
        .limit(1)
        .get();

      // Fallback to people collection
      if (!snap || snap.empty) {
        snap = await window.firebaseDB.collection('people')
          .where('email', '==', normalizedEmail)
          .limit(1)
          .get();
      }

      if (snap && !snap.empty) {
        const doc = snap.docs[0];
        const contact = doc.data();
        
        // Build full name from contact
        const firstName = contact.firstName || '';
        const lastName = contact.lastName || '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
        
        if (fullName) {
          contactNameCache.set(normalizedEmail, fullName);
          // Trigger a re-render if email detail is showing
          if (state.currentEmail) {
            setTimeout(() => populateEmailDetails(state.currentEmail), 100);
          }
          return fullName;
        }
        
        // Fallback to contact name field
        if (contact.name) {
          contactNameCache.set(normalizedEmail, contact.name);
          setTimeout(() => populateEmailDetails(state.currentEmail), 100);
          return contact.name;
        }
      }
    } catch (error) {
      console.warn('[EmailDetail] Error looking up contact name from Firebase:', error);
    } finally {
      pendingLookups.delete(normalizedEmail);
    }

    return null;
  }

  // Helper function to format email username as "First Last"
  function formatEmailAsName(emailUsername) {
    if (!emailUsername || typeof emailUsername !== 'string') return emailUsername;
    
    // Remove common prefixes/suffixes
    let cleaned = emailUsername.toLowerCase().trim();
    
    // Handle common separators: aaron.rodriguez, aaron_rodriguez, aaron-rodriguez
    let parts = [];
    if (cleaned.includes('.')) {
      parts = cleaned.split('.');
    } else if (cleaned.includes('_')) {
      parts = cleaned.split('_');
    } else if (cleaned.includes('-')) {
      parts = cleaned.split('-');
    } else {
      // Try to split camelCase or detect word boundaries
      // For now, just return capitalized single word
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
    
    // Capitalize each part and join
    parts = parts
      .filter(p => p.length > 0) // Remove empty parts
      .map(p => p.charAt(0).toUpperCase() + p.slice(1)); // Capitalize first letter
    
    if (parts.length >= 2) {
      return parts.join(' ');
    } else if (parts.length === 1) {
      return parts[0];
    }
    
    return emailUsername; // Fallback
  }

  function extractName(email) {
    // Handle null, undefined, or empty values
    if (!email) return 'Unknown';
    
    // Convert to string if it's not already
    if (typeof email !== 'string') {
      email = String(email);
    }
    
    // If it's still empty after conversion, return Unknown
    if (!email.trim()) return 'Unknown';
    
    // Extract email address from various formats
    let emailAddress = '';
    let extractedName = '';
    
    // Handle format: "Name" <email@domain.com>
    const quotedMatch = email.match(/^"([^"]+)"\s*<(.+)>$/);
    if (quotedMatch) {
      extractedName = quotedMatch[1];
      emailAddress = quotedMatch[2].toLowerCase().trim();
    } else {
    // Handle format: Name <email@domain.com>
    const angleMatch = email.match(/^([^<]+)\s*<(.+)>$/);
    if (angleMatch) {
        extractedName = angleMatch[1].trim();
        emailAddress = angleMatch[2].toLowerCase().trim();
      } else {
        // Handle format: email@domain.com
        emailAddress = email.toLowerCase().trim();
      }
    }
    
    // If we already have a name from the email string, use it
    if (extractedName && extractedName.length > 0) {
      return extractedName;
    }
    
    // Otherwise, try to look up contact by email address
    if (emailAddress && emailAddress.includes('@')) {
      const normalizedEmail = emailAddress.toLowerCase().trim();
      
      // Priority 1: Check cache (populated by Firebase lookups)
      if (contactNameCache.has(normalizedEmail)) {
        return contactNameCache.get(normalizedEmail);
      }
      
      // Priority 2: Use cached people data - no API calls needed
      try {
        const people = window.getPeopleData ? window.getPeopleData() : [];
        const contact = people.find(p => {
          const contactEmail = (p.email || '').toLowerCase().trim();
          return contactEmail === normalizedEmail;
        });
        
        if (contact) {
          // Build full name from contact
          const firstName = contact.firstName || '';
          const lastName = contact.lastName || '';
          const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
          if (fullName) {
            // Cache it for future use
            contactNameCache.set(normalizedEmail, fullName);
            return fullName;
          }
          // Fallback to contact name field
          if (contact.name) {
            contactNameCache.set(normalizedEmail, contact.name);
            return contact.name;
          }
        }
      } catch (_) {
        // Silently fail and continue to fallback
      }
      
      // Priority 3: If cache is empty, trigger async Firebase lookup (non-blocking)
      // This will update the cache and trigger a re-render when complete
      if (window.firebaseDB && !pendingLookups.has(normalizedEmail)) {
        lookupContactNameFromFirebase(normalizedEmail).catch(() => {
          // Silently fail
        });
      }
    }
    
    // If no contact found, format email username as "First Last"
    if (emailAddress && emailAddress.includes('@')) {
      const emailMatch = emailAddress.match(/^(.+)@/);
    if (emailMatch) {
        const emailUsername = emailMatch[1];
        const formattedName = formatEmailAsName(emailUsername);
        return formattedName;
      }
    }
    
    return email; // Final fallback to full string
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

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
