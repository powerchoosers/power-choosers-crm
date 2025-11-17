/**
 * Global Email Compose Module
 * 
 * Provides email compose functionality globally, allowing any page
 * to open the email composer without requiring the emails page to be loaded.
 * 
 * Usage: window.EmailCompose.openTo('email@example.com', 'Contact Name')
 */

(function() {
  if (!window.EmailCompose) window.EmailCompose = {};
  
  window.EmailCompose.openTo = function(toEmail, name = '') {
    try {
      toEmail = String(toEmail || '').trim();
    } catch(_) {
      toEmail = '';
    }
    
    if (!toEmail || !/@/.test(toEmail)) {
      window.crm?.showToast && window.crm.showToast('No valid email found');
      return;
    }
    
    console.log('[EmailCompose] Opening compose for:', toEmail, name || '');
    
    // Always try to open compose window directly on current page
    // No navigation - stay on whatever page user is currently on
    openComposeWindowDirect(toEmail, name);
  };
  
  function openComposeWindowDirect(toEmail, name) {
    const composeWindow = document.getElementById('compose-window');
    
    if (!composeWindow) {
      console.warn('[EmailCompose] Compose window not found in DOM');
      window.crm?.showToast && window.crm.showToast('Email compose not available');
      return;
    }
    
    // Try emails-redesigned.js first, but fallback to direct DOM manipulation
    if (window.emailManager && typeof window.emailManager.openComposeWindow === 'function') {
      console.log('[EmailCompose] Using emails-redesigned.js compose function...');
      openComposeWithManager(toEmail, name);
    } else {
      console.log('[EmailCompose] emailManager not available, using direct DOM approach...');
      openComposeDirectly(toEmail, name);
    }
  }
  
  function openComposeWithManager(toEmail, name) {
    const emailManager = window.emailManager;
    
    if (emailManager && typeof emailManager.openComposeWindow === 'function') {
      console.log('[EmailCompose] Opening compose with emails-redesigned.js...');
      // Call openComposeWindow with null to ensure it's treated as a new email
      emailManager.openComposeWindow(null);
      
      // Wait for compose window to be ready, then prefill
      setTimeout(() => {
        const composeWindow = document.getElementById('compose-window');
        if (composeWindow) {
          const previewContainer = composeWindow.querySelector('.preview-container');
          if (composeWindow.classList.contains('preview-mode')) composeWindow.classList.remove('preview-mode');
          if (previewContainer) previewContainer.remove();
          const editorEl = composeWindow.querySelector('.body-input');
          if (editorEl) {
            editorEl.style.display = '';
            editorEl.classList.remove('preview-showing');
            editorEl.classList.remove('preview-hiding');
          }
          const composeHeader = composeWindow.querySelector('.compose-header');
          const composeRecipients = composeWindow.querySelector('.compose-recipients');
          const composeSubject = composeWindow.querySelector('.compose-subject');
          const composeFooter = composeWindow.querySelector('.compose-footer');
          if (composeHeader) composeHeader.style.display = '';
          if (composeRecipients) composeRecipients.style.display = '';
          if (composeSubject) composeSubject.style.display = '';
          if (composeFooter) composeFooter.style.display = '';
          const previewBtn = composeWindow.querySelector('[data-action="preview"]');
          if (previewBtn) {
            previewBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>`;
            previewBtn.setAttribute('title', 'Preview');
            previewBtn.setAttribute('aria-label', 'Preview message');
          }
        }
        const toInput = document.getElementById('compose-to');
        const subjectInput = document.getElementById('compose-subject');
        const bodyInput = document.querySelector('.body-input');
        
        console.log('[EmailCompose] Subject field value after opening:', subjectInput?.value);
        
        if (toInput) {
          toInput.value = toEmail;
        }
        
        // Ensure subject is empty for new emails
        if (subjectInput && subjectInput.value.includes('Re:')) {
          console.log('[EmailCompose] Clearing Re: prefix from subject');
          subjectInput.value = '';
        }
        
        // Ensure HTML mode is OFF when opening (show rendered view, not source)
        if (emailManager._isHtmlMode) {
          console.log('[EmailCompose] Resetting HTML mode on open');
          emailManager._isHtmlMode = false;
          const composeWindow = document.getElementById('compose-window');
          const codeBtn = composeWindow?.querySelector('.editor-toolbar [data-action="code"]');
          if (codeBtn) {
            codeBtn.classList.remove('is-active');
            codeBtn.setAttribute('aria-pressed', 'false');
            codeBtn.setAttribute('title', 'Edit raw HTML');
          }
        }
        
        // If body has HTML email content, ensure it's rendered (not shown as source)
        if (bodyInput && bodyInput.getAttribute('data-html-email') === 'true') {
          console.log('[EmailCompose] HTML email detected, ensuring rendered view');
          bodyInput.removeAttribute('data-mode');
        }
        
        // Detect if content is HTML template and set attribute for persistence
        if (bodyInput && bodyInput.innerHTML) {
          const content = bodyInput.innerHTML;
          const isHtml = content.includes('<!DOCTYPE html>') || 
                         content.includes('<html') || 
                         (content.includes('<div') && content.includes('class="container"')) ||
                         content.includes('class="header"') ||
                         content.includes('font-family: Arial') ||
                         content.includes('max-width: 600px');
          
          if (isHtml && !bodyInput.getAttribute('data-html-email')) {
            bodyInput.setAttribute('data-html-email', 'true');
            console.log('[EmailCompose] Detected HTML email, setting attribute for persistence');
          }
        }
          
        // Focus the To input
        setTimeout(() => toInput?.focus(), 100);
      }, 200);
      
      // Setup toolbar event listeners after compose window is ready
      setTimeout(() => {
        const composeWindow = document.getElementById('compose-window');
        if (composeWindow) {
          setupToolbarEventListeners(composeWindow);
        }
      }, 300);
    } else {
      console.warn('[EmailCompose] emailManager.openComposeWindow not available');
      window.crm?.showToast && window.crm.showToast('Email compose not available');
    }
  }
  
  function openComposeDirectly(toEmail, name) {
    const composeWindow = document.getElementById('compose-window');
    
    if (!composeWindow) {
      console.warn('[EmailCompose] Compose window not found');
      return;
    }
    
    // Reset compose window fields
    const toInput = document.getElementById('compose-to');
    const subjectInput = document.getElementById('compose-subject');
    const ccInput = document.getElementById('compose-cc');
    const bccInput = document.getElementById('compose-bcc');
    const bodyInput = document.querySelector('.body-input');
    
    // Clear all fields
    if (toInput) toInput.value = '';
    if (subjectInput) subjectInput.value = '';
    if (ccInput) ccInput.value = '';
    if (bccInput) bccInput.value = '';
    if (bodyInput) bodyInput.innerHTML = '';
    
    // Clear attachments
    if (window.emailAttachments) {
      window.emailAttachments = [];
      updateAttachmentBadge();
    }
    
    // Show compose window
    composeWindow.style.display = 'flex';
    setTimeout(() => {
      composeWindow.classList.add('open');
    }, 10);
    
    // Ensure preview state is reset when opening
    try {
      const previewContainer = composeWindow.querySelector('.preview-container');
      if (composeWindow.classList.contains('preview-mode')) composeWindow.classList.remove('preview-mode');
      if (previewContainer) previewContainer.remove();
      const editor = composeWindow.querySelector('.body-input');
      if (editor) {
        editor.style.display = '';
        editor.classList.remove('preview-showing');
        editor.classList.remove('preview-hiding');
      }
      const composeHeader = composeWindow.querySelector('.compose-header');
      const composeRecipients = composeWindow.querySelector('.compose-recipients');
      const composeSubject = composeWindow.querySelector('.compose-subject');
      const composeFooter = composeWindow.querySelector('.compose-footer');
      if (composeHeader) composeHeader.style.display = '';
      if (composeRecipients) composeRecipients.style.display = '';
      if (composeSubject) composeSubject.style.display = '';
      if (composeFooter) composeFooter.style.display = '';
      const previewBtn = composeWindow.querySelector('[data-action="preview"]');
      if (previewBtn) {
        previewBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>`;
        previewBtn.setAttribute('title', 'Preview');
        previewBtn.setAttribute('aria-label', 'Preview message');
      }
    } catch(_) {}
    
    // Prefill the To field
    setTimeout(() => {
      if (toInput) {
        toInput.value = toEmail;
        toInput.focus();
      }
    }, 100);
    
    // Setup close button functionality if not already set up
    setupComposeCloseButton();
    
    // Setup toolbar event listeners
    setupToolbarEventListeners(composeWindow);
    
    // Initialize AI bar if present
    const aiBar = composeWindow.querySelector('.ai-bar');
    if (aiBar && !aiBar.dataset.rendered) {
      setTimeout(() => {
        renderAIBar(aiBar);
      }, 200);
    }
    
    console.log('[EmailCompose] Opened compose window directly for:', toEmail);
  }
  
  function setupComposeCloseButton() {
    const closeBtn = document.getElementById('compose-close');
    const composeWindow = document.getElementById('compose-window');
    
    if (closeBtn && !closeBtn.dataset.listenerAdded) {
      closeBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('[EmailCompose] Closing and fully resetting compose window...');
        
        // FULL RESET: Clear all fields and state for clean slate on next open
        try {
          // 1. Clear all input fields
          const toInput = composeWindow?.querySelector('#compose-to');
          const ccInput = composeWindow?.querySelector('#compose-cc');
          const bccInput = composeWindow?.querySelector('#compose-bcc');
          const subjectInput = composeWindow?.querySelector('#compose-subject');
          const bodyInput = composeWindow?.querySelector('.body-input');
          
          if (toInput) toInput.value = '';
          if (ccInput) ccInput.value = '';
          if (bccInput) bccInput.value = '';
          if (subjectInput) subjectInput.value = '';
          if (bodyInput) {
            bodyInput.innerHTML = '';
            bodyInput.removeAttribute('data-html-email');
            bodyInput.removeAttribute('data-template-type');
            bodyInput.removeAttribute('data-mode');
            bodyInput.style.display = '';
            bodyInput.style.opacity = '';
            bodyInput.style.transform = '';
            bodyInput.style.transition = '';
            bodyInput.classList.remove('preview-showing', 'preview-hiding');
          }
          
          // 2. Reset preview state completely
          const previewContainer = composeWindow?.querySelector('.preview-container');
          if (composeWindow?.classList.contains('preview-mode')) {
            composeWindow.classList.remove('preview-mode');
          }
          if (previewContainer) {
            previewContainer.remove();
          }
          
          // 3. Restore all UI elements visibility
          const composeHeader = composeWindow?.querySelector('.compose-header');
          const composeRecipients = composeWindow?.querySelector('.compose-recipients');
          const composeSubject = composeWindow?.querySelector('.compose-subject');
          const composeFooter = composeWindow?.querySelector('.compose-footer');
          const editorToolbar = composeWindow?.querySelector('.editor-toolbar');
          
          if (composeHeader) composeHeader.style.display = '';
          if (composeRecipients) composeRecipients.style.display = '';
          if (composeSubject) composeSubject.style.display = '';
          if (composeFooter) composeFooter.style.display = '';
          if (editorToolbar) editorToolbar.style.display = '';
          
          // 4. Reset preview button to default state
          const previewBtn = composeWindow?.querySelector('[data-action="preview"]');
          if (previewBtn) {
            previewBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>`;
            previewBtn.setAttribute('title', 'Preview');
            previewBtn.setAttribute('aria-label', 'Preview message');
            previewBtn.disabled = false;
          }
          
          // 5. Clear AI bar state (prompt text and status)
          const aiBar = composeWindow?.querySelector('.ai-bar');
          if (aiBar) {
            const aiPrompt = aiBar.querySelector('.ai-prompt');
            const aiStatus = aiBar.querySelector('.ai-status');
            if (aiPrompt) aiPrompt.value = '';
            if (aiStatus) aiStatus.textContent = '';
            aiBar.classList.remove('open');
            aiBar.setAttribute('aria-hidden', 'true');
          }
          
          // 6. Close all toolbars
          const formattingBar = composeWindow?.querySelector('.formatting-bar');
          const linkBar = composeWindow?.querySelector('.link-bar');
          const variablesBar = composeWindow?.querySelector('.variables-bar');
          
          if (formattingBar) {
            formattingBar.classList.remove('open');
            formattingBar.setAttribute('aria-hidden', 'true');
          }
          if (linkBar) {
            linkBar.classList.remove('open');
            linkBar.setAttribute('aria-hidden', 'true');
          }
          if (variablesBar) {
            variablesBar.classList.remove('open');
            variablesBar.setAttribute('aria-hidden', 'true');
          }
          
          // 7. Reset HTML mode state
          if (window.emailManager && window.emailManager._isHtmlMode) {
            console.log('[EmailCompose] Resetting HTML mode state');
            window.emailManager._isHtmlMode = false;
            const codeBtn = composeWindow?.querySelector('.editor-toolbar [data-action="code"]');
            if (codeBtn) {
              codeBtn.classList.remove('is-active');
              codeBtn.setAttribute('aria-pressed', 'false');
              codeBtn.setAttribute('title', 'Edit raw HTML');
            }
          }
          
          // 8. Clear any generation metadata
          if (window._lastGeneratedMetadata) {
            window._lastGeneratedMetadata = null;
          }
          
          console.log('[EmailCompose] Full reset complete - clean slate ready');
        } catch(err) {
          console.error('[EmailCompose] Error during reset:', err);
        }
        
        // Close compose window with animation
        if (composeWindow) {
          composeWindow.classList.remove('open');
          setTimeout(() => {
            composeWindow.style.display = 'none';
          }, 300);
        }
        
        console.log('[EmailCompose] Compose window closed');
      });
      
      closeBtn.dataset.listenerAdded = 'true';
    }
  }
  
  // ========== TOOLBAR FUNCTIONS (from emails.js) ==========
  
  // Main toolbar action dispatcher
  function handleToolbarAction(action, btn, editor, formattingBar, linkBar, composeWindow) {
    try {
      const composeWindow = editor?.closest?.('#compose-window') || document.getElementById('compose-window');
      const variablesBar = composeWindow?.querySelector('.variables-bar');
      const aiBar = composeWindow?.querySelector('.ai-bar');
      console.log('[Toolbar] handleToolbarAction:', action, { editor, formattingBar, linkBar, variablesBar });
      
      // Helper function to close all toolbars
      const closeAllToolbars = () => {
        formattingBar?.classList.remove('open');
        formattingBar?.setAttribute('aria-hidden', 'true');
        linkBar?.classList.remove('open');
        linkBar?.setAttribute('aria-hidden', 'true');
        variablesBar?.classList.remove('open');
        variablesBar?.setAttribute('aria-hidden', 'true');
        aiBar?.classList.remove('open');
        aiBar?.setAttribute('aria-hidden', 'true');
        
        // Also close any formatting popovers
        composeWindow?.querySelectorAll('.format-popover').forEach(p => p.classList.remove('open'));
        
        // Reset button states
        composeWindow?.querySelectorAll('.toolbar-btn[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
      };
      
      switch (action) {
        case 'formatting': {
          closeAllToolbars();
          const isOpen = formattingBar?.classList.toggle('open');
          formattingBar?.setAttribute('aria-hidden', String(!isOpen));
          btn.setAttribute('aria-expanded', String(isOpen));
          break;
        }
        case 'link': {
          closeAllToolbars();
          const isOpen = linkBar?.classList.toggle('open');
          linkBar?.setAttribute('aria-hidden', String(!isOpen));
          btn.setAttribute('aria-expanded', String(isOpen));
          // Prefill link text from selection
          try {
            const sel = window.getSelection();
            const hasText = sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed && sel.toString();
            const textInput = linkBar?.querySelector('[data-link-text]');
            if (textInput && hasText) textInput.value = sel.toString();
            (linkBar?.querySelector('[data-link-url]') || textInput)?.focus();
          } catch (_) {}
          break;
        }
        case 'variables': {
          closeAllToolbars();
          if (variablesBar && !variablesBar.classList.contains('open')) {
            renderVariablesBar(variablesBar);
          }
          const isOpen = variablesBar?.classList.toggle('open');
          variablesBar?.setAttribute('aria-hidden', String(!isOpen));
          btn.setAttribute('aria-expanded', String(isOpen));
          break;
        }
        case 'ai': {
          // AI bar handling (already exists in global compose)
          break;
        }
        case 'image': {
          handleImageUpload(editor);
          break;
        }
        case 'attach': {
          handleFileAttachment(editor);
          break;
        }
        case 'code': {
          toggleHtmlMode(composeWindow);
          break;
        }
        case 'templates': {
          window.crm?.showToast('Email templates coming soon');
          break;
        }
        default: {
          console.log('[Toolbar] Unknown action:', action);
        }
      }
    } catch (e) {
      console.error('handleToolbarAction failed:', e);
    }
  }

  // Formatting handler for text formatting operations
  function handleFormatting(format, btn, editor, formattingBar, restoreSelection) {
    if (!editor) return;

    console.log('handleFormatting called with format:', format);

    // Handle popover toggles
    if (format === 'font' || format === 'size' || format === 'color' || format === 'highlight') {
      const popover = btn.nextElementSibling;
      console.log('Popover found:', popover);
      
      if (popover) {
        const isOpen = popover.classList.toggle('open');
        console.log('Popover isOpen:', isOpen);
        btn.setAttribute('aria-expanded', String(isOpen));
        
        // Close other popovers
        formattingBar.querySelectorAll('.format-popover').forEach(p => {
          if (p !== popover) {
            p.classList.remove('open');
          }
        });
        formattingBar.querySelectorAll('.fmt-btn').forEach(b => {
          if (b !== btn) {
            b.setAttribute('aria-expanded', 'false');
          }
        });
      }
      return;
    }

    // Handle text formatting
    if (format === 'bold' || format === 'italic' || format === 'underline') {
      console.log('🎨 Applying format:', format);
      
      // Ensure we have a selection and focus
      ensureSelection();
      editor.focus();
      
      // Check current state using queryCommandState for accuracy
      const isCurrentlyActive = document.queryCommandState(format);
      console.log('🎨 Current state from queryCommandState:', isCurrentlyActive);
      
      // Apply the formatting
      const result = document.execCommand(format, false, null);
      console.log('🎨 execCommand result:', result);
      
      // Update button state based on actual command state
      const newState = document.queryCommandState(format);
      console.log('🎨 New state after execCommand:', newState);
      btn.setAttribute('aria-pressed', String(newState));
      
      // Update persistent formatting state
      setFormattingState(format, newState);
      console.log('🎨 Updated persistent formatting state for:', format, '=', newState);
      
    } else if (format === 'insertOrderedList' || format === 'insertUnorderedList') {
      console.log('📝 Applying list format:', format);
      ensureSelection();
      editor.focus();
      const result = document.execCommand(format, false, null);
      console.log('📝 List execCommand result:', result);
    }
  }

  // Insert link functionality
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
    
    // Restore saved selection at editor before inserting
    restoreSavedSelection();
    ensureSelection();
    document.execCommand('insertHTML', false, linkHtml);
    
    // Clear inputs and close bar
    textInput.value = '';
    urlInput.value = '';
    linkBar.classList.remove('open');
    linkBar.setAttribute('aria-hidden', 'true');
  }

  // Insert variable chip functionality
  function insertVariableChip(editor, scope, key, label) {
    if (!editor || !scope || !key) return;
    // Restore caret
    restoreSavedSelection();
    ensureSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    // Build token chip
    const token = `{{${scope}.${key}}}`;
    const span = document.createElement('span');
    span.className = 'var-chip';
    span.setAttribute('data-var', `${scope}.${key}`);
    span.setAttribute('data-token', token);
    const friendly = (label || key).replace(/_/g, ' ').toLowerCase();
    span.setAttribute('contenteditable', 'false');
    span.textContent = friendly;
    // Insert chip and a trailing space
    range.insertNode(document.createTextNode(' '));
    range.insertNode(span);
    // Move caret after the chip+space
    const after = document.createRange();
    after.setStartAfter(span.nextSibling || span);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
  }

  // Render variables bar with people/account/sender variables
  function renderVariablesBar(variablesBar) {
    if (!variablesBar) return;
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
      <button class="var-item" data-scope="${scope}" data-key="${i.key}" role="menuitem">
        <span class="var-item-label">${i.label}</span>
      </button>
    `).join('');
    variablesBar.innerHTML = `
      <div class="vars-tabs" role="tablist">
        <button class="vars-tab active" role="tab" aria-selected="true" data-tab="people">People</button>
        <button class="vars-tab" role="tab" aria-selected="false" data-tab="account">Account</button>
        <button class="vars-tab" role="tab" aria-selected="false" data-tab="sender">Sender</button>
        <span class="spacer"></span>
        <button class="fmt-btn" type="button" data-vars-close>Close</button>
      </div>
      <div class="vars-panels">
        <div class="vars-panel" data-tab="people" role="tabpanel">
          <div class="var-list" role="menu">${renderList(people, 'contact')}</div>
        </div>
        <div class="vars-panel hidden" data-tab="account" role="tabpanel" aria-hidden="true">
          <div class="var-list" role="menu">${renderList(account, 'account')}</div>
        </div>
        <div class="vars-panel hidden" data-tab="sender" role="tabpanel" aria-hidden="true">
          <div class="var-list" role="menu">${renderList(sender, 'sender')}</div>
        </div>
      </div>`;
  }

  // ========== UTILITY FUNCTIONS ==========

  // Ensure editor has valid selection
  function ensureSelection() {
    console.log('🎯 ensureSelection called');
    const editor = document.querySelector('.body-input[contenteditable="true"]');
    console.log('🎯 Editor element:', editor);
    
    if (!editor) {
      console.log('🎯 No editor found, returning');
      return;
    }
    
    // Focus the editor
    editor.focus();
    console.log('🎯 Editor focused');
    
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      console.log('🎯 No selection, creating one');
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false); // to end
      sel.removeAllRanges();
      sel.addRange(range);
      console.log('🎯 Selection created');
    } else {
      console.log('🎯 Valid selection exists');
    }
  }

  // Apply CSS style to selection
  function applyStyleToSelection(editor, cssText) {
    console.log('🔧 applyStyleToSelection called with:', cssText);
    const selection = window.getSelection();
    
    if (!selection || selection.rangeCount === 0) {
      console.log('🔧 No selection, ensuring selection first');
      ensureSelection();
    }
    
    const range = selection.getRangeAt(0);
    if (range.collapsed) {
      console.log('🔧 Collapsed range, creating span for future typing');
      const span = document.createElement('span');
      span.style.cssText = cssText;
      span.innerHTML = '\u200C'; // Zero-width non-joiner
      range.insertNode(span);
      range.setStartAfter(span);
      range.setEndAfter(span);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      console.log('🔧 Non-collapsed range, applying style to selection');
      const span = document.createElement('span');
      span.style.cssText = cssText;
      range.surroundContents(span);
    }
  }

  // Set formatting state
  function setFormattingState(property, value) {
    console.log('🎨 Setting formatting state:', property, '=', value);
    if (!window._currentFormatting) window._currentFormatting = {};
    window._currentFormatting[property] = value;
    console.log('🎨 Current formatting state:', window._currentFormatting);
  }

  // Get formatting state
  function getFormattingState(property) {
    return window._currentFormatting?.[property];
  }

  // Clean up zero-width spans
  function cleanZeroWidthSpans(editor) {
    if (!editor) return;
    const spans = editor.querySelectorAll('span');
    spans.forEach(span => {
      // Never unwrap variable chips or any non-editable spans
      if (span.classList?.contains('var-chip') || span.hasAttribute('data-var') || span.getAttribute('contenteditable') === 'false') {
        return;
      }
      const text = span.textContent || '';
      const onlyZWNJ = text.replace(/\u200C/g, '') === '';
      const styleAttr = span.getAttribute('style');
      const hasNoStyle = !styleAttr || styleAttr.trim() === '';
      const trivialStyle = styleAttr && /^(?:\s*(background-color:\s*transparent;)?\s*(color:\s*var\(--text-primary\);)?\s*)$/i.test(styleAttr.trim());
      
      // Unwrap spans that are empty or style-less to prevent caret/backspace issues
      if ((onlyZWNJ && span.childNodes.length <= 1) || hasNoStyle || trivialStyle) {
        const parent = span.parentNode;
        if (!parent) return;
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
      }
    });
  }

  // Apply color to selection
  function applyColorToSelection(color) {
    console.log('🎨 [NEW] applyColorToSelection called with:', color);
    
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      console.log('🎨 [NEW] No selection found');
      return;
    }
    
    const range = selection.getRangeAt(0);
    console.log('🎨 [NEW] Range collapsed:', range.collapsed);
    console.log('🎨 [NEW] Selected text:', range.toString());
    
    if (color === 'transparent' || color === null) {
      // Only affect future typing; preserve existing content.
      if (!range.collapsed) {
        console.log('🎨 [NEW] Collapsing selection to end without altering existing color');
        range.collapse(false); // move caret to end of selection
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        console.log('🎨 [NEW] Collapsed caret - will only affect future typing');
      }
    } else {
      // Apply color
      console.log('🎨 [NEW] Applying color:', color);
      const success = document.execCommand('foreColor', false, color);
      console.log('🎨 [NEW] foreColor success:', success);
    }
    
    // Update formatting state
    setFormattingState('color', color);
    console.log('🎨 [NEW] Updated formatting state');

    // If turning off color, ensure caret is not inside a colored span
    if (color === null) {
      const ed = document.querySelector('.body-input[contenteditable="true"]');
      if (ed) {
        // Move caret out of any colored span so new typing uses default
        moveCursorOutsideColoredSpans(ed);
        // Create a neutral span at caret to guarantee future typing is plain
        ensurePlainTypingContext(ed, 'color');
        cleanZeroWidthSpans(ed);
      }
    }
  }

  // Apply highlight to selection
  function applyHighlightToSelection(color) {
    console.log('🖍️ [NEW] applyHighlightToSelection called with:', color);
    
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      console.log('🖍️ [NEW] No selection found');
      return;
    }
    
    const range = selection.getRangeAt(0);
    console.log('🖍️ [NEW] Range collapsed:', range.collapsed);
    console.log('🖍️ [NEW] Selected text:', range.toString());
    
    if (color === 'transparent' || color === null) {
      // Only affect future typing; preserve existing content.
      if (!range.collapsed) {
        console.log('🖍️ [NEW] Collapsing selection to end without altering existing highlight');
        range.collapse(false); // move caret to end of selection
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        console.log('🖍️ [NEW] Collapsed caret - will only affect future typing');
      }
    } else {
      // Apply highlight
      console.log('🖍️ [NEW] Applying highlight:', color);
      const success = document.execCommand('hiliteColor', false, color);
      console.log('🖍️ [NEW] hiliteColor success:', success);
    }
    
    // Update formatting state
    setFormattingState('backgroundColor', color);
    console.log('🖍️ [NEW] Updated formatting state');

    // If turning off highlight, ensure caret is not inside a highlighted span
    if (color === null) {
      const ed = document.querySelector('.body-input[contenteditable="true"]');
      if (ed) {
        // Move caret out of any highlighted span so new typing uses default
        moveCursorOutsideHighlightedSpans(ed);
        // Explicitly clear the pending highlight typing style at the caret
        try { document.execCommand('styleWithCSS', true); } catch (_) {}
        const r1 = document.execCommand('hiliteColor', false, 'transparent');
        const r2 = document.execCommand('backColor', false, 'transparent');
        console.log('🖍️ Cleared caret typing style: hiliteColor ->', r1, ' backColor ->', r2);
        // Create a neutral span at caret to guarantee future typing is plain
        ensurePlainTypingContext(ed, 'highlight');
        cleanZeroWidthSpans(ed);
      }
    }
  }

  // Restore saved selection
  function restoreSavedSelection() {
    try {
      const sel = window.getSelection();
      if (window._editorSelection && sel) {
        sel.removeAllRanges();
        sel.addRange(window._editorSelection);
      }
    } catch (_) {}
  }

  // Move cursor outside colored spans
  function moveCursorOutsideColoredSpans(editor) {
    console.log('🎨 Moving cursor outside colored spans');
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      console.log('🎨 No selection found');
      return;
    }

    const range = selection.getRangeAt(0);
    if (!range.collapsed) {
      console.log('🎨 Range is not collapsed, skipping');
      return; // Only work with collapsed ranges (cursor position)
    }

    console.log('🎨 Current range:', range);
    console.log('🎨 Range start container:', range.startContainer);
    console.log('🎨 Range start offset:', range.startOffset);

    // Find the current node
    let node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;

    // Identify the highest ancestor span that still has a text color
    let coloredAncestor = null;
    let walker = node;
    while (walker && walker !== editor) {
      if (walker.tagName === 'SPAN' && walker.style && walker.style.color &&
        walker.style.color !== '' && walker.style.color !== 'var(--text-primary)' && walker.style.color !== 'rgb(0, 0, 0)' && walker.style.color !== 'black') {
        coloredAncestor = walker; // keep walking to find the highest one
      }
      walker = walker.parentNode;
    }

    if (coloredAncestor) {
      const newRange = document.createRange();
      newRange.setStartAfter(coloredAncestor);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);
      console.log('🎨 Moved cursor after highest colored span');
      return;
    }
    
    console.log('🎨 No colored span found, cursor position unchanged');
  }

  // Move cursor outside highlighted spans
  function moveCursorOutsideHighlightedSpans(editor) {
    console.log('🖍️ Moving cursor outside highlighted spans');
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      console.log('🖍️ No selection found');
      return;
    }

    const range = selection.getRangeAt(0);
    if (!range.collapsed) {
      console.log('🖍️ Range is not collapsed, skipping');
      return; // Only work with collapsed ranges (cursor position)
    }

    console.log('🖍️ Current range:', range);
    console.log('🖍️ Range start container:', range.startContainer);
    console.log('🖍️ Range start offset:', range.startOffset);

    // Find the current node
    let node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;

    // Identify the highest ancestor span that still has a highlight
    let highlightedAncestor = null;
    let walker = node;
    while (walker && walker !== editor) {
      if (walker.tagName === 'SPAN' && walker.style && walker.style.backgroundColor &&
        walker.style.backgroundColor !== 'transparent' && walker.style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        highlightedAncestor = walker; // keep walking to find the highest one
      }
      walker = walker.parentNode;
    }

    if (highlightedAncestor) {
      const newRange = document.createRange();
      newRange.setStartAfter(highlightedAncestor);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);
      console.log('🖍️ Moved cursor after highest highlighted span');
      return;
    }
    
    console.log('🖍️ No highlighted span found, cursor position unchanged');
  }

  // Ensure plain typing context
  function ensurePlainTypingContext(editor, type) {
    console.log(`🎨 Ensuring plain typing context for ${type}`);
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    if (!range.collapsed) return;
    
    // Create a neutral span at caret
    const span = document.createElement('span');
    span.innerHTML = '\u200C'; // Zero-width non-joiner
    range.insertNode(span);
    range.setStartAfter(span);
    range.setEndAfter(span);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function toggleFormattingBar() {
    const formattingBar = document.querySelector('.formatting-bar');
    if (!formattingBar) return;
    
    const isOpen = formattingBar.classList.toggle('open');
    formattingBar.setAttribute('aria-hidden', String(!isOpen));
    
    // Update the button's aria-expanded state
    const formattingBtn = document.querySelector('[data-action="formatting"]');
    if (formattingBtn) {
      formattingBtn.setAttribute('aria-expanded', String(isOpen));
    }
    
    console.log('[Formatting] Bar toggled:', isOpen ? 'open' : 'closed');
  }

  function toggleHtmlMode(composeWindow) {
    console.log('[HTML Mode] toggleHtmlMode called with composeWindow:', composeWindow);
    
    if (!composeWindow) {
      composeWindow = document.querySelector('#compose-window, .compose-window');
      console.log('[HTML Mode] Found composeWindow:', composeWindow);
    }
    
    if (!composeWindow) {
      console.error('[HTML Mode] No compose window found');
      return;
    }
    
    const editor = composeWindow.querySelector('.body-input');
    const codeBtn = composeWindow.querySelector('[data-action="code"]');
    
    console.log('[HTML Mode] Editor:', editor, 'Code button:', codeBtn);
    
    if (!editor || !codeBtn) {
      console.error('[HTML Mode] Missing editor or code button');
      return;
    }
    
    // Check if we're in HTML mode using data-mode attribute (like the original)
    const isHtmlMode = editor.getAttribute('data-mode') === 'html';
    console.log('[HTML Mode] Current mode:', isHtmlMode ? 'HTML' : 'Rich text');
    
    if (isHtmlMode) {
      // Exit HTML mode: render HTML
      const raw = editor.textContent || '';
      editor.removeAttribute('data-mode');
      editor.innerHTML = raw;
      editor.contentEditable = 'true';
      
      // Update button
      codeBtn.textContent = '</>';
      codeBtn.setAttribute('aria-label', 'Edit raw HTML');
      codeBtn.classList.remove('is-active');
      codeBtn.setAttribute('aria-pressed', 'false');
      
      console.log('[HTML Mode] Switched to rich text mode');
    } else {
      // Enter HTML mode: show raw HTML
      const html = editor.innerHTML || '';
      editor.setAttribute('data-mode', 'html');
      editor.textContent = html;
      editor.contentEditable = 'true';
      
      // Update button
      codeBtn.textContent = 'Aa';
      codeBtn.setAttribute('aria-label', 'Exit HTML mode');
      codeBtn.classList.add('is-active');
      codeBtn.setAttribute('aria-pressed', 'true');
      
      console.log('[HTML Mode] Switched to HTML mode');
    }
  }

  function handleImageUpload(editor) {
    console.log('[Image Upload] handleImageUpload called with editor:', editor);
    
    if (!editor) {
      console.error('[Image Upload] No editor provided');
      return;
    }
    
    // Create a file input element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      // Check file size (limit to 5MB)
      if (file.size > 5 * 1024 * 1024) {
        window.crm?.showToast('Image file too large. Please choose a file under 5MB.');
        return;
      }
      
      // Create a FileReader to convert image to data URL
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        
        // Insert image into editor
        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.alt = file.name;
        
        // Insert at cursor position
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          range.insertNode(img);
          
          // Move cursor after the image
          range.setStartAfter(img);
          range.setEndAfter(img);
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          // If no selection, append to end
          editor.appendChild(img);
        }
        
        console.log('[Image Upload] Image inserted successfully');
        window.crm?.showToast('Image uploaded successfully');
      };
      
      reader.onerror = () => {
        console.error('[Image Upload] Error reading file');
        window.crm?.showToast('Error uploading image. Please try again.');
      };
      
      reader.readAsDataURL(file);
    });
    
    // Trigger file selection
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
  }

  function handleFileAttachment(editor) {
    console.log('[File Attachment] handleFileAttachment called with editor:', editor);
    
    // Create a file input element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true; // Allow multiple files
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
      
      // Store files and update UI
      files.forEach(file => {
        addAttachment(file);
      });
      
      console.log('[File Attachment] Added', files.length, 'files');
      window.crm?.showToast(`Added ${files.length} file${files.length > 1 ? 's' : ''}`);
    });
    
    // Trigger file selection
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
  }

  function addAttachment(file) {
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
    
    console.log('[File Attachment] Adding attachment with ID:', attachment.id, 'Type:', typeof attachment.id);
    
    window.emailAttachments.push(attachment);
    updateAttachmentBadge();
  }

  function removeAttachment(attachmentId) {
    console.log('[File Attachment] removeAttachment called with ID:', attachmentId, 'Type:', typeof attachmentId);
    console.log('[File Attachment] Current attachments:', window.emailAttachments);
    
    if (!window.emailAttachments) {
      console.log('[File Attachment] No attachments array found');
      return;
    }
    
    const initialLength = window.emailAttachments.length;
    
    // Convert to string for consistent comparison
    const stringId = String(attachmentId);
    console.log('[File Attachment] Converting ID to string:', stringId);
    
    // Log each attachment ID and type for debugging
    window.emailAttachments.forEach((att, index) => {
      console.log(`[File Attachment] Attachment ${index}: ID=${att.id}, Type=${typeof att.id}, Match=${att.id === stringId}`);
    });
    
    window.emailAttachments = window.emailAttachments.filter(att => {
      const matches = att.id !== stringId;
      console.log(`[File Attachment] Filtering attachment ${att.id}: ${matches ? 'KEEP' : 'REMOVE'}`);
      return matches;
    });
    
    const finalLength = window.emailAttachments.length;
    
    console.log('[File Attachment] Removed attachment. Before:', initialLength, 'After:', finalLength);
    
    updateAttachmentBadge();
  }

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

  function updateAttachmentBadge() {
    const composeFooter = document.querySelector('.compose-footer');
    if (!composeFooter) {
      console.log('[File Attachment] No compose footer found');
      return;
    }
    
    // Remove existing badge
    const existingBadge = composeFooter.querySelector('.attachment-badge');
    if (existingBadge) {
      console.log('[File Attachment] Removing existing badge');
      existingBadge.remove();
    }
    
    // Don't show badge if no attachments
    if (!window.emailAttachments || window.emailAttachments.length === 0) {
      console.log('[File Attachment] No attachments to display');
      return;
    }
    
    console.log('[File Attachment] Creating badge for', window.emailAttachments.length, 'attachments');
    
    // Create attachment badge
    const badge = document.createElement('div');
    badge.className = 'attachment-badge';
    badge.innerHTML = `
      <div class="attachment-list">
        ${window.emailAttachments.map(att => `
          <div class="attachment-item" data-id="${att.id}">
            <div class="attachment-icon">${att.icon}</div>
            <div class="attachment-info">
              <div class="attachment-name" title="${att.name}">${att.name}</div>
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
    
    // Add click handler for remove buttons - use more specific targeting
    badge.addEventListener('click', (e) => {
      console.log('[File Attachment] Badge clicked, target:', e.target);
      
      // Check if the clicked element or its parent is a remove button
      const removeBtn = e.target.closest('.attachment-remove');
      if (removeBtn) {
        const attachmentId = removeBtn.dataset.id; // Don't use parseInt for string IDs
        console.log('[File Attachment] Remove button clicked for ID:', attachmentId);
        e.preventDefault();
        e.stopPropagation();
        removeAttachment(attachmentId);
      }
    });
    
    // Insert badge after compose-actions
    const composeActions = composeFooter.querySelector('.compose-actions');
    if (composeActions) {
      composeActions.insertAdjacentElement('afterend', badge);
      console.log('[File Attachment] Badge inserted successfully');
    } else {
      console.error('[File Attachment] Could not find compose-actions element');
    }
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function togglePreviewMode() {
    const compose = document.getElementById('compose-window');
    if (!compose) return;

    const editor = compose.querySelector('.body-input');
    const previewContainer = compose.querySelector('.preview-container');
    const previewBtn = compose.querySelector('[data-action="preview"]');
    const composeHeader = compose.querySelector('.compose-header');
    const composeRecipients = compose.querySelector('.compose-recipients');
    const composeSubject = compose.querySelector('.compose-subject');
    const editorToolbar = compose.querySelector('.editor-toolbar');
    const composeFooter = compose.querySelector('.compose-footer');
    
    // Check if we're currently in preview mode
    const isPreview = compose.classList.contains('preview-mode');
    
    if (isPreview) {
      // Exit preview mode with animation
      
      // Remove preview-mode class immediately to restore toolbar interactivity
      compose.classList.remove('preview-mode');
      
      if (previewContainer) {
        // Add exit animation class
        previewContainer.classList.add('exiting');
        
        // Wait for animation to complete before removing
        setTimeout(() => {
          previewContainer.remove();
          
          // Show editor with animation
          if (editor) {
            editor.style.display = '';
            editor.classList.add('preview-showing');
            
            // Clean up animation class
            setTimeout(() => {
              editor.classList.remove('preview-showing');
            }, 300);
          }
          
          // Show UI elements (they'll fade in via CSS transition)
          if (composeHeader) composeHeader.style.display = '';
          if (composeRecipients) composeRecipients.style.display = '';
          if (composeSubject) composeSubject.style.display = '';
          if (composeFooter) composeFooter.style.display = '';
        }, 300); // Match animation duration
      }
      
      if (previewBtn) {
        previewBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>`;
        previewBtn.setAttribute('title', 'Preview');
        previewBtn.setAttribute('aria-label', 'Preview message');
      }
    } else {
      // Enter preview mode with animation
      
      // Animate editor out
      if (editor) {
        editor.classList.add('preview-hiding');
        
        // Wait for editor fade out before showing preview
        setTimeout(() => {
          editor.style.display = 'none';
          editor.classList.remove('preview-hiding');
        }, 250);
      }
      
      // Add preview-mode class (toolbar stays visible via CSS override)
      compose.classList.add('preview-mode');
      
      // Hide non-toolbar UI elements
      if (composeHeader) composeHeader.style.display = 'none';
      if (composeRecipients) composeRecipients.style.display = 'none';
      if (composeSubject) composeSubject.style.display = 'none';
      if (composeFooter) composeFooter.style.display = 'none';
      
      // Get current email content
      const bodyInput = compose.querySelector('.body-input');
      const isHtmlEmail = bodyInput?.getAttribute('data-html-email') === 'true';
      const content = bodyInput?.innerHTML || '';
      
      // Create preview container with rounded top corners
      const preview = document.createElement('div');
      preview.className = 'preview-container';
      preview.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: #f1f5fa;
        overflow-y: auto;
        padding: 0;
        z-index: 10;
        border-radius: 12px 12px 0 0;
      `;
      
      // Create back button container with rounded top
      const backBtnContainer = document.createElement('div');
      backBtnContainer.style.cssText = `
        position: sticky;
        top: 0;
        left: 0;
        right: 0;
        background: #fff;
        padding: 16px 20px;
        border-bottom: 1px solid #e5e7eb;
        z-index: 100;
        border-radius: 12px 12px 0 0;
      `;
      
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '← Back to Editor';
      closeBtn.style.cssText = `
        padding: 10px 20px;
        background: #1e3a8a;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
        transition: all 0.2s ease;
      `;
      closeBtn.onmouseover = () => {
        closeBtn.style.background = '#2563eb';
        closeBtn.style.transform = 'translateY(-1px)';
      };
      closeBtn.onmouseout = () => {
        closeBtn.style.background = '#1e3a8a';
        closeBtn.style.transform = 'translateY(0)';
      };
      closeBtn.onclick = () => togglePreviewMode();
      backBtnContainer.appendChild(closeBtn);
      preview.appendChild(backBtnContainer);
      
      // Create iframe container with padding
      const iframeContainer = document.createElement('div');
      iframeContainer.style.cssText = 'padding: 20px;';
      
      // Create preview content with proper iframe or direct HTML
      if (isHtmlEmail) {
        // HTML emails: use iframe for isolation
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width: 100%; min-height: 600px; border: none; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);';
        iframe.srcdoc = content;
        iframeContainer.appendChild(iframe);
      } else {
        // Standard emails: render directly with styling
        const contentWrapper = document.createElement('div');
        contentWrapper.style.cssText = `
          background: white;
          padding: 40px;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: #1f2937;
        `;
        contentWrapper.innerHTML = content;
        iframeContainer.appendChild(contentWrapper);
      }
      
      preview.appendChild(iframeContainer);
      
      // Add preview to compose editor (animation will trigger via CSS)
      compose.querySelector('.compose-editor').appendChild(preview);
      
      // Update button icon to edit/pencil
      if (previewBtn) {
        previewBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>`;
        previewBtn.setAttribute('title', 'Edit');
        previewBtn.setAttribute('aria-label', 'Edit message');
      }
    }
  }

  // ========== EVENT LISTENERS SETUP ==========

  // Setup all toolbar event listeners
  function setupToolbarEventListeners(composeWindow) {
    const editor = composeWindow.querySelector('.body-input');
    const toolbar = composeWindow.querySelector('.editor-toolbar');
    const formattingBar = composeWindow.querySelector('.formatting-bar');
    const linkBar = composeWindow.querySelector('.link-bar');
    const variablesBar = composeWindow.querySelector('.variables-bar');
    
    // Save selection on editor events
    const saveSelection = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        window._editorSelection = sel.getRangeAt(0).cloneRange();
      }
    };
    
    const restoreSelection = () => {
      if (!window._editorSelection) return;
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(window._editorSelection);
    };
    
    // Editor selection events
    editor?.addEventListener('keyup', saveSelection);
    editor?.addEventListener('mouseup', saveSelection);
    editor?.addEventListener('blur', saveSelection);
    
    // Toolbar actions - DEDUPLICATED to prevent multiple listeners
    if (!document._composeToolbarClickBound) {
      document._composeToolbarClickBound = true;
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.toolbar-btn');
        if (!btn) return;
        
        const action = btn.dataset.action;
        
        if (action === 'formatting') {
          toggleFormattingBar();
        } else if (action === 'preview') {
          togglePreviewMode();
        } else {
          // Handle all other toolbar actions
          const composeWindow = document.querySelector('#compose-window, .compose-window');
          const editor = composeWindow?.querySelector('.body-input');
          const formattingBar = composeWindow?.querySelector('.formatting-bar');
          const linkBar = composeWindow?.querySelector('.link-bar');
          const variablesBar = composeWindow?.querySelector('.variables-bar');
          
          if (editor) {
            handleToolbarAction(action, btn, editor, formattingBar, linkBar, composeWindow);
          }
        }
      });
      console.log('[EmailCompose] Toolbar click listener bound (deduplicated)');
    }
    
    // Formatting button clicks
    formattingBar?.addEventListener('click', (e) => {
      const btn = e.target.closest('.fmt-btn');
      if (!btn) return;
      
      const format = btn.getAttribute('data-fmt');
      console.log('🎨 Formatting format:', format);
      saveSelection();
      ensureSelection();
      handleFormatting(format, btn, editor, formattingBar, restoreSelection);
    });
    
    // Popover item interactions
    formattingBar?.addEventListener('click', (e) => {
      const popoverItem = e.target.closest('.popover-item');
      const colorSwatch = e.target.closest('.color-swatch');
      
      if (!popoverItem && !colorSwatch) return;
      
      e.stopPropagation();
      restoreSelection();
      
      // Handle font selection
      if (popoverItem && popoverItem.classList.contains('font-item')) {
        const fontFamily = popoverItem.getAttribute('data-font');
        const fontLabel = popoverItem.textContent;
        
        // Update the font button label
        const fontBtn = formattingBar.querySelector('[data-fmt="font"]');
        if (fontBtn) {
          const label = fontBtn.querySelector('[data-current-font]');
          if (label) label.textContent = fontLabel;
        }
        
        // Apply font to editor
        document.execCommand('fontName', false, fontFamily);
        
        // Close popover
        const popover = popoverItem.closest('.format-popover');
        if (popover) {
          popover.classList.remove('open');
          const btn = formattingBar.querySelector('[data-fmt="font"]');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        }
      }
      
      // Handle size selection
      if (popoverItem && popoverItem.classList.contains('size-item')) {
        const fontSize = popoverItem.getAttribute('data-size');
        
        // Update the size button label
        const sizeBtn = formattingBar.querySelector('[data-fmt="size"]');
        if (sizeBtn) {
          const label = sizeBtn.querySelector('[data-current-size]');
          if (label) label.textContent = fontSize;
        }
        
        ensureSelection();
        
        // Apply size using direct CSS styling
        applyStyleToSelection(editor, `font-size:${fontSize}px;`);
        
        // Close popover
        const popover = popoverItem.closest('.format-popover');
        if (popover) {
          popover.classList.remove('open');
          const btn = formattingBar.querySelector('[data-fmt="size"]');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        }
      }

      // Handle text color
      if (colorSwatch && colorSwatch.closest('.color-popover')) {
        const color = colorSwatch.getAttribute('data-color');
        
        ensureSelection();
        
        // Use the new simple color application method
        applyColorToSelection(color === 'transparent' ? null : color);
        
        const pop = colorSwatch.closest('.format-popover');
        pop?.classList.remove('open');
        
        const colorBtn = formattingBar.querySelector('[data-fmt="color"]');
        colorBtn?.setAttribute('aria-expanded','false');
      }

      // Handle highlight color
      if (colorSwatch && colorSwatch.closest('.highlight-popover')) {
        const color = colorSwatch.getAttribute('data-color');
        
        ensureSelection();
        
        // Use the new simple highlight application method
        applyHighlightToSelection(color === 'transparent' ? null : color);
        
        const pop = colorSwatch.closest('.format-popover');
        pop?.classList.remove('open');
        
        const highlightBtn = formattingBar.querySelector('[data-fmt="highlight"]');
        highlightBtn?.setAttribute('aria-expanded','false');
      }
    });
    
    // Link bar interactions
    linkBar?.addEventListener('click', (e) => {
      if (e.target.matches('[data-link-insert]')) {
        insertLink(editor, linkBar);
      } else if (e.target.matches('[data-link-cancel]')) {
        linkBar.classList.remove('open');
        linkBar.setAttribute('aria-hidden', 'true');
      }
    });
    
    // Variables bar interactions
    variablesBar?.addEventListener('click', (e) => {
      if (e.target.matches('[data-vars-close]')) {
        variablesBar.classList.remove('open');
        variablesBar.setAttribute('aria-hidden', 'true');
      } else if (e.target.matches('.var-item')) {
        const scope = e.target.getAttribute('data-scope');
        const key = e.target.getAttribute('data-key');
        const label = e.target.querySelector('.var-item-label')?.textContent;
        insertVariableChip(editor, scope, key, label);
      } else if (e.target.matches('.vars-tab')) {
        // Handle tab switching
        const tab = e.target.getAttribute('data-tab');
        variablesBar.querySelectorAll('.vars-tab').forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        variablesBar.querySelectorAll('.vars-panel').forEach(p => {
          p.classList.add('hidden');
          p.setAttribute('aria-hidden', 'true');
        });
        e.target.classList.add('active');
        e.target.setAttribute('aria-selected', 'true');
        const panel = variablesBar.querySelector(`[data-tab="${tab}"]`);
        if (panel) {
          panel.classList.remove('hidden');
          panel.setAttribute('aria-hidden', 'false');
        }
      }
    });
  }

  // ========== ENTER KEY HANDLER FOR SINGLE SPACING ==========
  
  function setupComposeEnterKeyHandler() {
    if (document._emailComposeEnterHandlerBound) return;
    
    // Use event delegation to handle dynamically created compose windows
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const editor = document.querySelector('.body-input');
        if (editor && editor.contains(e.target)) {
          console.log('[Enter] Enter key pressed in email editor');
          e.preventDefault();
          
          // Check if cursor is INSIDE signature (not just near it)
          const selection = window.getSelection();
          if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const isInsideSignature = isCursorInsideSignature(editor, range);
            if (isInsideSignature) {
              console.log('[Enter] Cursor inside signature - preventing edit');
              return;
            }
          }
          
          // Insert single line break for single spacing (like Gmail/Outlook)
          // Use a cleaner approach that doesn't compound with CSS line-height
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
            
            console.log('[Enter] Single line break inserted with proper spacing');
          } catch (error) {
            console.error('[Enter] Failed to insert line break:', error);
            // Fallback: try execCommand but it may have spacing issues
            try {
              document.execCommand('insertHTML', false, '<br>');
              console.log('[Enter] Fallback: Single line break inserted via execCommand');
            } catch (fallbackError) {
              console.error('[Enter] All methods failed:', fallbackError);
            }
          }
        }
      }
    });
    
    document._emailComposeEnterHandlerBound = true;
  }
  
  // Helper function to check if cursor is INSIDE signature (not just near)
  function isCursorInsideSignature(editor, range) {
    // Check if the cursor's parent node is within a signature element
    const signatureElements = editor.querySelectorAll('[data-signature], .signature, .email-signature');
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
  
  // Initialize the Enter key handler
  setupComposeEnterKeyHandler();

  // ========== AI GENERATION ANIMATION FUNCTIONS ==========
  
  function startGeneratingAnimation(composeWindow, mode = 'standard') {
    const subjectInput = composeWindow?.querySelector('#compose-subject');
    const bodyInput = composeWindow?.querySelector('.body-input');
    const composeBody = composeWindow?.querySelector('.compose-body');
    
    // Add glow effect and skeleton to subject input
    if (subjectInput) {
      subjectInput.classList.add('compose-generating');
      createSkeletonInField(subjectInput, 'subject');
    }
    
    // Add glow effect to compose-body container (outer border)
    if (composeBody) {
      composeBody.classList.add('compose-generating');
    }
    
    // Different body animations for HTML vs standard emails
    if (bodyInput) {
      if (mode === 'html') {
        // HTML emails: use shimmer effect
        createHtmlEmailShimmer(bodyInput);
      } else {
        // Standard emails: use skeleton bars
        createSkeletonInField(bodyInput, 'body');
      }
    }
    
    console.log(`[AI Animation] Started generating animation (${mode} mode)`);
  }
  
  function stopGeneratingAnimation(composeWindow) {
    const subjectInput = composeWindow?.querySelector('#compose-subject');
    const bodyInput = composeWindow?.querySelector('.body-input');
    const composeBody = composeWindow?.querySelector('.compose-body');
    
    // Remove glow effect and skeleton from subject input
    if (subjectInput) {
      subjectInput.classList.remove('compose-generating');
      removeSkeletonFromField(subjectInput);
    }
    
    // Remove glow effect from compose-body container
    if (composeBody) {
      composeBody.classList.remove('compose-generating');
    }
    
    // Remove skeleton or shimmer from body input
    if (bodyInput) {
      removeSkeletonFromField(bodyInput);
      removeHtmlEmailShimmer(bodyInput);
    }
    
    console.log('[AI Animation] Stopped generating animation');
  }
  
  function createSkeletonInField(inputField, type) {
    // Clear any existing content
    inputField.innerHTML = '';
    
    // Create skeleton container
    const skeletonContainer = document.createElement('div');
    skeletonContainer.className = 'field-skeleton-container';
    
    if (type === 'subject') {
      // Subject skeleton: 2 short bars
      skeletonContainer.innerHTML = `
        <div class="skeleton-bar skeleton-subject-1"></div>
        <div class="skeleton-bar skeleton-subject-2"></div>
      `;
    } else if (type === 'body') {
      // Body skeleton: 4-5 bars of varying lengths
      skeletonContainer.innerHTML = `
        <div class="skeleton-bar skeleton-body-1"></div>
        <div class="skeleton-bar skeleton-body-2"></div>
        <div class="skeleton-bar skeleton-body-3"></div>
        <div class="skeleton-bar skeleton-body-4"></div>
        <div class="skeleton-bar skeleton-body-5"></div>
      `;
    }
    
    // Add skeleton to input field
    inputField.appendChild(skeletonContainer);
    
    // Start skeleton animation
    setTimeout(() => {
      const bars = skeletonContainer.querySelectorAll('.skeleton-bar');
      bars.forEach((bar, index) => {
        bar.style.animationDelay = `${index * 0.15}s`;
        bar.classList.add('skeleton-animate');
      });
    }, 50);
  }
  
  function removeSkeletonFromField(inputField) {
    const skeletonContainer = inputField.querySelector('.field-skeleton-container');
    if (skeletonContainer) {
      // Fade out skeleton
      skeletonContainer.style.opacity = '0';
      skeletonContainer.style.transition = 'opacity 0.3s ease';
      
      // Remove after fade
      setTimeout(() => {
        if (skeletonContainer.parentNode) {
          skeletonContainer.remove();
        }
      }, 300);
    }
  }
  
  function typewriterEffect(element, text, speed = 30) {
    if (!element || !text) return;
    
    // Remove skeleton first
    removeSkeletonFromField(element);
    
    // Wait for skeleton to fade out, then start typewriter
    setTimeout(() => {
      // Handle both input fields and contentEditable elements
      const isInput = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';
      
      if (isInput) {
        // For input fields, use value property
        element.value = '';
        element.style.borderRight = '2px solid var(--orange-primary)';
        
        let i = 0;
        const timer = setInterval(() => {
          if (i < text.length) {
            element.value += text.charAt(i);
            i++;
          } else {
            clearInterval(timer);
            element.style.borderRight = 'none';
          }
        }, speed);
      } else {
        // For contentEditable elements, use innerHTML
        element.innerHTML = '';
        element.style.borderRight = '2px solid var(--orange-primary)';
        element.style.overflow = 'hidden';
        element.style.whiteSpace = 'nowrap';
        
        let i = 0;
        const timer = setInterval(() => {
          if (i < text.length) {
            element.innerHTML += text.charAt(i);
            i++;
          } else {
            clearInterval(timer);
            element.style.borderRight = 'none';
            element.style.overflow = 'visible';
            element.style.whiteSpace = 'normal';
          }
        }, speed);
      }
    }, 350); // Wait for skeleton fade out
  }
  
  function progressiveReveal(element, html) {
    if (!element || !html) return;
    
    // Remove skeleton first
    removeSkeletonFromField(element);
    
    // Wait for skeleton to fade out, then reveal content
    setTimeout(() => {
      // For HTML content, we need to render it properly
      // First, set the HTML content
      element.innerHTML = html;
      
      // Then animate the paragraphs in
      const paragraphs = element.querySelectorAll('p');
      paragraphs.forEach((p, index) => {
        p.classList.add('word-reveal');
        setTimeout(() => {
          p.classList.add('visible');
        }, index * 200);
      });
    }, 350); // Wait for skeleton fade out
  }
  
  function animateTextIntoField(field, content, animationType = 'progressive') {
    if (!field || !content) return;
    
    // Clear field first
    field.value = '';
    field.innerHTML = '';
    
    // Add temporary styling for animation
    field.style.position = 'relative';
    
    if (animationType === 'typewriter') {
      typewriterEffect(field, content);
    } else {
      progressiveReveal(field, content);
    }
  }
  
  // ========== HTML EMAIL TEMPLATE ANIMATION ==========
  
  function createHtmlEmailShimmer(bodyInput) {
    if (!bodyInput) return;
    
    // Clear existing content
    bodyInput.innerHTML = '';
    
    // Create shimmer placeholder that mimics email structure
    const shimmerContainer = document.createElement('div');
    shimmerContainer.className = 'html-email-shimmer-container';
    shimmerContainer.style.cssText = 'padding: 20px;';
    
    shimmerContainer.innerHTML = `
      <div class="html-email-shimmer" style="height: 60px; margin-bottom: 20px; border-radius: 8px;"></div>
      <div class="html-email-shimmer" style="height: 20px; width: 70%; margin-bottom: 12px; border-radius: 4px;"></div>
      <div class="html-email-shimmer" style="height: 80px; margin-bottom: 20px; border-radius: 6px;"></div>
      <div class="html-email-shimmer" style="height: 40px; width: 50%; margin: 0 auto 20px; border-radius: 20px;"></div>
      <div class="html-email-shimmer" style="height: 60px; border-radius: 8px;"></div>
    `;
    
    bodyInput.appendChild(shimmerContainer);
  }
  
  function removeHtmlEmailShimmer(bodyInput) {
    if (!bodyInput) return;
    
    const shimmerContainer = bodyInput.querySelector('.html-email-shimmer-container');
    if (shimmerContainer) {
      shimmerContainer.style.opacity = '0';
      shimmerContainer.style.transition = 'opacity 0.3s ease';
      
      setTimeout(() => {
        if (shimmerContainer.parentNode) {
          shimmerContainer.remove();
        }
      }, 300);
    }
  }
  
  // Render HTML email in an isolated iframe to prevent CSS bleeding
  function renderHtmlEmailInIframe(editor, html) {
    if (!editor || !html) return;
    
    // Remove shimmer first
    removeHtmlEmailShimmer(editor);
    
    // Wait for shimmer to fade out
    setTimeout(() => {
      // Clear editor and create iframe container
      editor.innerHTML = '';
      
      // Create iframe wrapper
      const iframeWrapper = document.createElement('div');
      iframeWrapper.className = 'html-email-iframe-wrapper';
      iframeWrapper.style.cssText = `
        width: 100%;
        height: 100%;
        min-height: 500px;
        position: relative;
        background: #f1f5fa;
        border-radius: 8px;
        overflow: hidden;
      `;
      
      // Create iframe for CSS isolation
      const iframe = document.createElement('iframe');
      iframe.className = 'html-email-iframe';
      iframe.style.cssText = `
        width: 100%;
        height: 100%;
        min-height: 500px;
        border: none;
        background: white;
        display: block;
      `;
      
      // Set iframe content using srcdoc (isolates CSS completely)
      iframe.srcdoc = html;
      
      // Auto-resize iframe to content height
      iframe.onload = () => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          const height = iframeDoc.body.scrollHeight;
          iframe.style.height = Math.max(height, 500) + 'px';
          iframeWrapper.style.minHeight = Math.max(height, 500) + 'px';
          console.log('[HTML Email] Iframe loaded, height:', height);
        } catch (e) {
          console.warn('[HTML Email] Could not resize iframe:', e);
        }
      };
      
      // Append iframe to wrapper and wrapper to editor
      iframeWrapper.appendChild(iframe);
      editor.appendChild(iframeWrapper);
      
      // Fade in animation
      editor.style.opacity = '0';
      editor.style.transform = 'translateY(10px)';
      editor.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      
      setTimeout(() => {
        editor.style.opacity = '1';
        editor.style.transform = 'translateY(0)';
      }, 50);
      
      console.log('[HTML Email] Rendered in isolated iframe to prevent CSS bleeding');
    }, 350);
  }
  
  function revealHtmlEmailSections(element, html) {
    if (!element || !html) return;
    
    // Remove shimmer first
    removeHtmlEmailShimmer(element);
    
    // Wait for shimmer to fade out
    setTimeout(() => {
      // Insert the HTML content
      element.innerHTML = html;
      
      // Find major sections and wrap them for animation
      // Look for common email template structures
      const children = Array.from(element.children);
      
      children.forEach((child, index) => {
        // Determine section type based on content and position
        let sectionType = 'body';
        
        if (index === 0) {
          sectionType = 'header';
        } else if (child.querySelector('a[href]') && child.textContent.length < 100) {
          sectionType = 'cta';
        } else if (child.querySelector('img') || child.textContent.toLowerCase().includes('best regards') || 
                   child.textContent.toLowerCase().includes('sincerely') || index === children.length - 1) {
          sectionType = 'signature';
        } else if (index === 1) {
          sectionType = 'greeting';
        }
        
        // Add reveal animation classes
        child.classList.add('html-email-reveal');
        child.setAttribute('data-section', sectionType);
        
        // Trigger animation
        setTimeout(() => {
          child.classList.add('visible');
        }, 50);
      });
    }, 350);
  }

  // ========== AI BAR RENDERING ==========
  
  function renderAIBar(aiBar) {
    if (!aiBar) return;
    
    if (aiBar.dataset.rendered === 'true') {
      console.log('[AI] Bar already rendered');
      return;
    }
    
    console.log('[AI] Rendering AI bar...');
    
    // Hardcoded prompt suggestions (no settings dependency)
    const suggestions = [
      { text: 'Warm intro after a call', prompt: 'warm intro email after our call', template: 'warm_intro' },
      { text: 'Follow-up with value', prompt: 'follow-up email with value proposition', template: 'follow_up' },
      { text: 'Energy Health Check', prompt: 'energy health check email', template: 'energy_health' },
      { text: 'Proposal delivery', prompt: 'proposal delivery email', template: 'proposal' },
      { text: 'Cold email outreach', prompt: 'cold email outreach', template: 'cold_email' },
      { text: 'Invoice request', prompt: 'invoice request email', template: 'invoice' }
    ];
    
    aiBar.innerHTML = `
      <div class="ai-inner">
        <div class="ai-row">
          <textarea class="ai-prompt input-dark" rows="3" 
                    placeholder="Describe the email you want... (tone, goal, offer, CTA)"></textarea>
        </div>
        <div class="ai-row suggestions" role="list">
          ${suggestions.map(s => 
            `<button class="ai-suggestion" type="button" 
                     data-prompt="${escapeHtml(s.prompt)}" 
                     data-template="${s.template}">${s.text}</button>`
          ).join('')}
        </div>
        <div class="ai-row actions">
          <button class="fmt-btn ai-generate" data-mode="standard">Generate Standard</button>
          <button class="fmt-btn ai-generate" data-mode="html">Generate HTML</button>
          <div class="ai-status" aria-live="polite"></div>
        </div>
      </div>
    `;
    
    // Wire events
    wireAIBarEvents(aiBar);
    aiBar.dataset.rendered = 'true';
  }

  // Wire AI bar events
  function wireAIBarEvents(aiBar) {
    console.log('[AI] Wiring suggestion button events...');
    const suggestionButtons = aiBar.querySelectorAll('.ai-suggestion');
    console.log('[AI] Found suggestion buttons:', suggestionButtons.length);
    
    suggestionButtons.forEach((btn, index) => {
      console.log(`[AI] Adding click listener to suggestion ${index}:`, btn.textContent);
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('[AI] Suggestion clicked:', btn.textContent);
        const ta = aiBar.querySelector('.ai-prompt');
        if (ta) {
          const prompt = btn.getAttribute('data-prompt') || btn.textContent;
          ta.value = prompt;
          ta.focus();
          console.log('[AI] Updated textarea value:', ta.value);
        }
      });
    });
    
    console.log('[AI] Wiring generate button events...');
    aiBar.querySelectorAll('.ai-generate').forEach((btn, index) => {
      console.log(`[AI] Adding click listener to generate button ${index}:`, btn.textContent);
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[AI] Generate button clicked:', btn.textContent);
        const mode = btn.getAttribute('data-mode') || 'standard';
        await generateWithAI(aiBar, mode);
      });
    });
  }


  // Helper function to escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Remove citation brackets from text (e.g., [1], [2], [3])
  function removeCitationBrackets(text) {
    if (!text) return text;
    return String(text)
      .replace(/\[\d+\]/g, '') // Remove [1], [2], [3], etc.
      .replace(/\s+/g, ' ') // Normalize multiple spaces
      .trim();
  }

  // ========== AI HELPER FUNCTIONS ==========
  
  async function lookupPersonByEmail(email) {
    try {
      const e = String(email || '').trim().toLowerCase();
      if (!e) return null;
      
      // Try Firebase first (like old emails.js)
      if (window.firebaseDB) {
        let snap;
        try {
          snap = await window.firebaseDB.collection('contacts').where('email', '==', e).limit(1).get();
        } catch (_) {
          snap = null;
        }
        if (!snap || snap.empty) {
          try {
            snap = await window.firebaseDB.collection('people').where('email', '==', e).limit(1).get();
          } catch (_) {
            snap = null;
          }
        }
        if (snap && !snap.empty) {
          const doc = snap.docs[0];
          const person = { id: doc.id, ...(doc.data ? doc.data() : {}) };
          
          // Attempt to match an account (like old emails.js)
          let account = null;
          if (window.BackgroundAccountsLoader) {
            const accounts = window.BackgroundAccountsLoader.getAccountsData() || [];
            const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\b(llc|inc|inc\.|co|co\.|corp|corp\.|ltd|ltd\.)\b/g,' ').replace(/\s+/g,' ').trim();
            const comp = norm(person.company || '');
            
            if (comp) {
              account = accounts.find(a => {
                const accountName = a.accountName || a.name || '';
                if (!accountName) return false;
                const normalizedAccountName = norm(accountName);
                return normalizedAccountName === comp || 
                       normalizedAccountName.includes(comp) || 
                       comp.includes(normalizedAccountName);
              }) || null;
            }
          }
          
          return {
            id: person.id,
            email: email,
            name: person.name || person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim() || email.split('@')[0],
            firstName: person.firstName || (person.name || '').split(' ')[0] || '',
            lastName: person.lastName || (person.name || '').split(' ').slice(1).join(' ') || '',
            fullName: person.fullName || person.name || `${person.firstName || ''} ${person.lastName || ''}`.trim(),
            company: person.company || account?.accountName || account?.name || '',
            title: person.title || person.job || person.role || '',
            phone: person.phone || person.mobile || '',
            linkedin: person.linkedin || person.linkedinUrl || '',
            linkedinUrl: person.linkedin || person.linkedinUrl || '',
            seniority: person.seniority || '',
            department: person.department || '',
            account: account ? {
              id: account.id,
              name: account.accountName || account.name || '',
              industry: account.industry || '',
              domain: account.domain || account.website || '',
              city: account.city || account.billingCity || account.locationCity || '',
              state: account.state || account.billingState || account.region || '',
              shortDescription: account.shortDescription || account.short_desc || account.descriptionShort || account.description || '',
              logoUrl: account.logoUrl || '',
              phone: account.phone || account.companyPhone || '',
              annualUsage: account.annualUsage || '',
              electricitySupplier: account.electricitySupplier || '',
              currentRate: account.currentRate || '',
              contractEndDate: account.contractEndDate || ''
            } : null
          };
        }
      }
      
      // Fallback to cache-based lookup
      let people = [];
      if (window.BackgroundPeopleLoader && typeof window.BackgroundPeopleLoader.getPeopleData === 'function') {
        people = window.BackgroundPeopleLoader.getPeopleData() || [];
      }
      
      const person = people.find(p => 
        p.email === email || 
        p.workEmail === email || 
        p.personalEmail === email
      );
      
      if (person) {
        return {
          email: email,
          name: person.name || person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim() || email.split('@')[0],
          firstName: person.firstName || (person.name || '').split(' ')[0] || '',
          lastName: person.lastName || (person.name || '').split(' ').slice(1).join(' ') || '',
          fullName: person.fullName || person.name || `${person.firstName || ''} ${person.lastName || ''}`.trim(),
          company: person.company || person.accountName || '',
          title: person.title || person.job || person.role || '',
          phone: person.phone || person.mobile || '',
          linkedin: person.linkedin || person.linkedinUrl || '',
          linkedinUrl: person.linkedin || person.linkedinUrl || '',
          seniority: person.seniority || '',
          department: person.department || ''
        };
      }
      
      // Final fallback
      return {
        email: email,
        name: email.split('@')[0],
        firstName: email.split('@')[0],
        company: '',
        title: '',
        phone: ''
      };
    } catch (error) {
      console.warn('[AI] Error looking up person:', error);
      return {
        email: email,
        name: email.split('@')[0],
        firstName: email.split('@')[0],
        company: '',
        title: '',
        phone: ''
      };
    }
  }

  async function enrichRecipientWithAccountData(recipient) {
    if (!recipient) return recipient;

    try {
      // Get accounts data
      let accounts = [];
      
      // Priority 1: BackgroundAccountsLoader
      if (window.BackgroundAccountsLoader && typeof window.BackgroundAccountsLoader.getAccountsData === 'function') {
        accounts = window.BackgroundAccountsLoader.getAccountsData() || [];
      }
      
      // Priority 2: CacheManager
      if (accounts.length === 0 && window.CacheManager && typeof window.CacheManager.get === 'function') {
        accounts = await window.CacheManager.get('accounts') || [];
      }

      // Find matching account by company name OR email domain
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\b(llc|inc|inc\.|co|co\.|corp|corp\.|ltd|ltd\.)\b/g,' ').replace(/\s+/g,' ').trim();
      const comp = norm(recipient.company || '');
      const domain = (recipient.email || '').split('@')[1]?.toLowerCase() || '';
      
      let acct = null;
      
      // Try company name match first
      if (comp) {
        acct = accounts.find(a => {
          const accountName = a.accountName || a.name || '';
          if (!accountName) return false;
          const normalizedAccountName = norm(accountName);
          return normalizedAccountName === comp || 
                 normalizedAccountName.includes(comp) || 
                 comp.includes(normalizedAccountName);
        }) || null;
      }
      
      // Try domain match if no company match
      if (!acct && domain) {
        acct = accounts.find(a => {
          const d = String(a.domain || a.website || '').toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
          return d && domain.endsWith(d);
        }) || null;
      }

      if (acct) {
        // Update recipient company if it was missing
        if (!recipient.company) {
          recipient.company = acct.accountName || acct.name || '';
        }
        
        const acctEnergy = {
          supplier: acct.electricitySupplier || '',
          currentRate: acct.currentRate || '',
          usage: acct.annualUsage || '',
          contractEnd: acct.contractEndDate || ''
        };
        
        recipient.account = {
          id: acct.id,
          name: acct.accountName || acct.name || '',
          industry: acct.industry || '',
          domain: acct.domain || acct.website || '',
          city: acct.city || acct.billingCity || acct.locationCity || '',
          state: acct.state || acct.billingState || acct.region || '',
          shortDescription: acct.shortDescription || acct.short_desc || acct.descriptionShort || acct.description || '',
          logoUrl: acct.logoUrl || '',
          phone: acct.phone || acct.companyPhone || '',
          annualUsage: acct.annualUsage || acct.annualKilowattUsage || acct.annual_usage || '',
          electricitySupplier: acct.electricitySupplier || '',
          currentRate: acct.currentRate || '',
          contractEndDate: acct.contractEndDate || acct.contractEnd || acct.contract_end_date || '',
          linkedin: acct.linkedin || acct.linkedinUrl || acct.companyLinkedin || '',
          linkedinUrl: acct.linkedin || acct.linkedinUrl || acct.companyLinkedin || '',
          employees: acct.employees || acct.companyEmployees || null,
          squareFootage: acct.squareFootage || acct.square_footage || acct.companySquareFootage || null,
          occupancyPct: acct.occupancyPct || acct.occupancy_pct || acct.companyOccupancyPct || null
        };
        
        let rate = String(acctEnergy.currentRate || '').trim();
        if (/^\.\d+$/.test(rate)) rate = '0' + rate;
        recipient.energy = { ...acctEnergy, currentRate: rate };
      }
    } catch (e) {
      console.warn('[AI] Could not enrich recipient with account data', e);
    }

    return recipient;
  }

  // ========== AI GENERATION CORE ==========
  
  /**
   * AUTHENTIC TONE OPENERS - Matching Lewis's voice (29-year-old professional)
   */
  window.AUTHENTIC_TONE_OPENERS = {
    disarming: [
      "Genuine question—",
      "Let me ask you something—",
      "Been wondering—",
      "You ever considered—",
      "So here's the thing—",
      "This might sound random, but—",
      "Honestly—",
      "Looking at your situation—",
      "Question for you—",
    ],
    observation: [
      "Here's what I'm seeing—",
      "Most people I talk to—",
      "From what I'm hearing—",
      "I've found that teams like yours—",
    ],
  };

  /**
   * RANDOMIZED ANGLES BY INDUSTRY
   * Each industry gets multiple angles with weighted probability
   */
  window.RANDOMIZED_ANGLES_BY_INDUSTRY = {
    Manufacturing: {
      angles: [
        {
          id: 'exemption_recovery',
          weight: 0.30,
          primaryMessage: 'electricity sales tax exemption recovery',
          openingTemplate: 'Are you currently claiming electricity exemptions on your production facilities, or haven\'t filed yet?',
          primaryValue: '$75K–$500K 4-year refund potential',
          condition: '!accountData || !accountData.industry || accountData.industry.toLowerCase().includes("manufacturing") || accountData.industry.toLowerCase().includes("manufacturer") || accountData.industry.toLowerCase().includes("industrial") || accountData.taxExemptStatus === "Manufacturing"',
          newsHooks: [],
        },
        {
          id: 'demand_efficiency',
          weight: 0.25,
          primaryMessage: 'demand-side efficiency optimization',
          openingTemplate: 'When you look at energy spend, are you focusing on rates, or have you already optimized consumption?',
          primaryValue: '12–20% reduction before rate negotiation',
          newsHooks: [],
        },
        {
          id: 'timing_strategy',
          weight: 0.25,
          primaryMessage: 'early renewal timing strategy',
          openingTemplate: 'How do you typically handle contract renewals—locking in early, or timing closer to expiration?',
          primaryValue: '8-15% protection from market spikes',
          situationalContext: 'Best practice is renewing 6 months to 1 year in advance, though most companies renew 30-60 days out or last minute if not careful.',
          newsHooks: ['rate_spike_national', 'rate_spike_regional'],
        },
        {
          id: 'consolidation',
          weight: 0.20,
          primaryMessage: 'multi-plant contract consolidation',
          openingTemplate: 'Do you manage energy renewals centrally across your plants, or does each location handle its own?',
          primaryValue: '2-4% overpay prevention + operational simplicity',
          newsHooks: [],
        },
      ],
    },
    Nonprofit: {
      angles: [
        {
          id: 'exemption_recovery',
          weight: 0.40,
          primaryMessage: 'tax exemption + refund recovery',
          openingTemplate: 'Is your nonprofit currently filing electricity exemption certificates with your utility?',
          primaryValue: '$40K–$200K+ in 4-year refund recovery',
          newsHooks: [],
        },
        {
          id: 'mission_funding',
          weight: 0.35,
          primaryMessage: 'mission-focused budget optimization',
          openingTemplate: 'How are you currently managing energy costs so more funding goes to your mission?',
          primaryValue: 'Redirect savings from operations to program impact',
          newsHooks: [],
        },
        {
          id: 'budget_stability',
          weight: 0.25,
          primaryMessage: 'budget predictability for board reporting',
          openingTemplate: 'When budgeting for energy, are you locking in costs, or dealing with volatility year to year?',
          primaryValue: '12–18% cost stability improvement',
          newsHooks: [],
        },
      ],
    },
    Retail: {
      angles: [
        {
          id: 'consolidation',
          weight: 0.40,
          primaryMessage: 'multi-location contract consolidation',
          openingTemplate: 'How many locations do you have, and are they all renewing on different schedules?',
          primaryValue: '2–4% overpay prevention + one renewal calendar',
          newsHooks: [],
        },
        {
          id: 'timing_strategy',
          weight: 0.35,
          primaryMessage: 'early renewal timing strategy',
          openingTemplate: 'When your locations renew, are you coordinating timing or letting each one handle it independently?',
          primaryValue: '8–15% savings from coordinated renewal timing',
          situationalContext: 'Best practice is renewing 6 months to 1 year in advance, though most companies renew 30-60 days out or last minute if not careful.',
          newsHooks: ['rate_spike_national', 'rate_spike_regional'],
        },
        {
          id: 'operational_simplicity',
          weight: 0.25,
          primaryMessage: 'centralized energy operations',
          openingTemplate: 'Right now, how much time are you spending managing energy renewals across your network?',
          primaryValue: 'Centralized management reduces vendor complexity',
          newsHooks: [],
        },
      ],
    },
    Healthcare: {
      angles: [
        {
          id: 'exemption_recovery',
          weight: 0.35,
          primaryMessage: 'tax exemption + mission-aligned savings',
          openingTemplate: 'Is your healthcare organization currently claiming electricity exemptions?',
          primaryValue: '$100K–$300K+ in refund + ongoing savings',
          condition: 'accountData?.taxExemptStatus === "Nonprofit"',
          newsHooks: [],
        },
        {
          id: 'consolidation',
          weight: 0.40,
          primaryMessage: 'multi-facility consolidation + compliance',
          openingTemplate: 'How many facilities are you managing energy for, and are they on different contracts?',
          primaryValue: '$100K–$500K network-wide optimization',
          newsHooks: [],
        },
        {
          id: 'operational_continuity',
          weight: 0.25,
          primaryMessage: 'uptime guarantee + budget certainty',
          openingTemplate: 'For healthcare operations, what\'s more critical—energy savings or guaranteed uptime?',
          primaryValue: 'Predictable costs + operational continuity',
          newsHooks: [],
        },
      ],
    },
    DataCenter: {
      angles: [
        {
          id: 'demand_efficiency',
          weight: 0.45,
          primaryMessage: 'demand-side efficiency + uptime resilience',
          openingTemplate: 'For a data center like yours, what matters more—cutting energy spend or guaranteeing uptime?',
          primaryValue: '12–20% consumption reduction + reliability',
          newsHooks: [],
        },
        {
          id: 'timing_strategy',
          weight: 0.35,
          primaryMessage: 'contract timing strategy (AI-driven demand)',
          openingTemplate: 'With AI driving energy demand up, are you thinking about locking rates early?',
          primaryValue: '8–15% protection from demand-driven spikes',
          situationalContext: 'Best practice is renewing 6 months to 1 year in advance, though most companies renew 30-60 days out or last minute if not careful.',
          newsHooks: ['datacenter_demand_spike'],
        },
        {
          id: 'data_governance',
          weight: 0.20,
          primaryMessage: 'unified metering data + predictive planning',
          openingTemplate: 'When you plan for energy, do you have unified metering across your data center?',
          primaryValue: 'Better forecasting + uptime prediction',
          newsHooks: [],
        },
      ],
    },
    Logistics: {
      angles: [
        {
          id: 'consolidation',
          weight: 0.45,
          primaryMessage: 'multi-location volume leverage',
          openingTemplate: 'With operations across multiple states, how are you coordinating energy contracts?',
          primaryValue: '3–6% collective savings from volume negotiation',
          newsHooks: [],
        },
        {
          id: 'timing_strategy',
          weight: 0.35,
          primaryMessage: 'strategic renewal timing (avoid scramble)',
          openingTemplate: 'Are you renewing energy contracts strategically, or waiting until the last minute?',
          primaryValue: '8–15% vs. emergency renewals',
          situationalContext: 'Best practice is renewing 6 months to 1 year in advance, though most companies renew 30-60 days out or last minute if not careful.',
          newsHooks: ['rate_spike_national', 'rate_spike_regional'],
        },
        {
          id: 'operational_efficiency',
          weight: 0.20,
          primaryMessage: 'warehouse efficiency optimization',
          openingTemplate: 'For your warehouses, what drives energy costs more—facility size or operations model?',
          primaryValue: 'Identify efficiency opportunities + rate savings',
          newsHooks: [],
        },
      ],
    },
    Hospitality: {
      angles: [
        {
          id: 'consolidation',
          weight: 0.40,
          primaryMessage: 'multi-property contract consolidation',
          openingTemplate: 'How many properties are you managing energy for, and are they all on different renewal schedules?',
          primaryValue: '2–4% overpay prevention + unified renewal calendar',
          newsHooks: [],
        },
        {
          id: 'timing_strategy',
          weight: 0.35,
          primaryMessage: 'seasonal planning + early renewal timing',
          openingTemplate: 'When do you typically renew energy contracts—before peak season or waiting until the last minute?',
          primaryValue: '8–15% savings from strategic timing',
          situationalContext: 'Best practice is renewing 6 months to 1 year in advance, though most companies renew 30-60 days out or last minute if not careful.',
          newsHooks: ['rate_spike_national', 'rate_spike_regional'],
        },
        {
          id: 'operational_efficiency',
          weight: 0.25,
          primaryMessage: 'guest comfort + cost control balance',
          openingTemplate: 'For your properties, what drives energy costs more—guest comfort requirements or operational efficiency?',
          primaryValue: 'Optimize consumption without impacting guest experience',
          newsHooks: [],
        },
      ],
    },
    Default: {
      angles: [
        {
          id: 'timing_strategy',
          weight: 0.40,
          primaryMessage: 'strategic contract renewal timing',
          openingTemplate: 'When does your current electricity contract renew?',
          primaryValue: '8–15% savings from early renewal',
          situationalContext: 'Best practice is renewing 6 months to 1 year in advance, though most companies renew 30-60 days out or last minute if not careful.',
          newsHooks: ['rate_spike_national', 'rate_spike_regional'],
        },
        {
          id: 'cost_control',
          weight: 0.35,
          primaryMessage: 'energy cost predictability and budget control',
          openingTemplate: 'Are you locking in energy costs ahead of time, or dealing with rate volatility?',
          primaryValue: 'Predictable costs + 10–20% savings opportunity',
          newsHooks: [],
        },
        {
          id: 'operational_simplicity',
          weight: 0.25,
          primaryMessage: 'simplified energy procurement management',
          openingTemplate: 'How much time are you spending managing energy procurement versus focusing on your core business?',
          primaryValue: 'Streamlined process + better rates',
          newsHooks: [],
        },
      ],
    },
  };

  /**
   * Helper: Randomize selection based on weights
   */
  function randomizeByWeight(angles) {
    const totalWeight = angles.reduce((sum, angle) => sum + angle.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (let angle of angles) {
      random -= angle.weight;
      if (random <= 0) {
        return angle;
      }
    }
    
    return angles[0]; // Fallback
  }

  /**
   * Helper: Infer industry from company name
   */
  function inferIndustryFromCompanyName(companyName) {
    if (!companyName) return '';
    
    const name = String(companyName).toLowerCase();
    
    // Hospitality keywords
    if (/\b(inn|hotel|motel|resort|lodge|suites|hospitality|accommodation|bed\s*and\s*breakfast|b&b|b\s*&\s*b)\b/i.test(name)) {
      return 'Hospitality';
    }
    
    // Restaurant/Food Service
    if (/\b(restaurant|cafe|diner|bistro|grill|bar\s*&?\s*grill|tavern|pub|eatery|food\s*service)\b/i.test(name)) {
      return 'Hospitality';
    }
    
    // Manufacturing
    if (/\b(manufacturing|manufacturer|industrial|factory|plant|production|fabrication)\b/i.test(name)) {
      return 'Manufacturing';
    }
    
    // Healthcare
    if (/\b(hospital|clinic|medical|healthcare|health\s*care|physician|doctor|dental|pharmacy)\b/i.test(name)) {
      return 'Healthcare';
    }
    
    // Retail
    if (/\b(retail|store|shop|market|outlet|merchandise|boutique)\b/i.test(name)) {
      return 'Retail';
    }
    
    // Logistics/Transportation
    if (/\b(logistics|transportation|warehouse|shipping|freight|delivery|distribution|trucking)\b/i.test(name)) {
      return 'Logistics';
    }
    
    // Data Center
    if (/\b(data\s*center|datacenter|server|hosting|cloud|colo)\b/i.test(name)) {
      return 'DataCenter';
    }
    
    // Nonprofit
    if (/\b(nonprofit|non-profit|charity|foundation|501c3|501\(c\)\(3\))\b/i.test(name)) {
      return 'Nonprofit';
    }
    
    return '';
  }

  /**
   * Helper: Infer industry from account description
   */
  function inferIndustryFromDescription(description) {
    if (!description) return '';
    
    const desc = String(description).toLowerCase();
    
    // Hospitality
    if (/\b(hotel|inn|motel|resort|lodge|accommodation|hospitality|guest|room|booking|stay)\b/i.test(desc)) {
      return 'Hospitality';
    }
    
    // Restaurant/Food
    if (/\b(restaurant|cafe|dining|food|beverage|menu|cuisine|chef)\b/i.test(desc)) {
      return 'Hospitality';
    }
    
    // Manufacturing
    if (/\b(manufacturing|production|factory|plant|industrial|assembly|fabrication)\b/i.test(desc)) {
      return 'Manufacturing';
    }
    
    // Healthcare
    if (/\b(hospital|clinic|medical|healthcare|patient|treatment|diagnosis|surgery)\b/i.test(desc)) {
      return 'Healthcare';
    }
    
    // Retail
    if (/\b(retail|store|merchandise|shopping|customer|product|sale)\b/i.test(desc)) {
      return 'Retail';
    }
    
    // Logistics
    if (/\b(logistics|warehouse|shipping|distribution|freight|transportation|delivery)\b/i.test(desc)) {
      return 'Logistics';
    }
    
    // Data Center
    if (/\b(data\s*center|server|hosting|cloud|infrastructure|computing)\b/i.test(desc)) {
      return 'DataCenter';
    }
    
    // Nonprofit
    if (/\b(nonprofit|charity|foundation|mission|donation|volunteer)\b/i.test(desc)) {
      return 'Nonprofit';
    }
    
    return '';
  }

  /**
   * Normalize industry name to match RANDOMIZED_ANGLES_BY_INDUSTRY keys
   */
  function normalizeIndustry(industry) {
    if (!industry) return 'Default';
    
    const normalized = String(industry).trim();
    
    // Industry mapping for common variations
    const industryMap = {
      'Transportation and Warehousing': 'Logistics',
      'Transportation': 'Logistics',
      'Warehousing': 'Logistics',
      'Logistics and Supply Chain': 'Logistics',
      'Supply Chain': 'Logistics',
      'Manufacturing': 'Manufacturing',
      'Manufacturer': 'Manufacturing',
      'Industrial': 'Manufacturing',
      'Nonprofit': 'Nonprofit',
      'Non-Profit': 'Nonprofit',
      'Charity': 'Nonprofit',
      'Foundation': 'Nonprofit',
      '501(c)(3)': 'Nonprofit',
      'Healthcare': 'Healthcare',
      'Hospital': 'Healthcare',
      'Medical': 'Healthcare',
      'Data Center': 'DataCenter',
      'DataCentre': 'DataCenter',
      'Retail': 'Retail',
      'Retail Trade': 'Retail',
      'Hospitality': 'Hospitality',
      'Hotel': 'Hospitality',
      'Hotels': 'Hospitality',
      'Restaurant': 'Hospitality',
      'Restaurants': 'Hospitality',
      'Food Service': 'Hospitality',
      'Food & Beverage': 'Hospitality',
      'Food and Beverage': 'Hospitality',
      'Accommodation': 'Hospitality',
      'Lodging': 'Hospitality',
      'Resort': 'Hospitality',
      'Resorts': 'Hospitality',
    };
    
    // Check exact match first
    if (industryMap[normalized]) {
      return industryMap[normalized];
    }
    
    // Check partial match (case-insensitive)
    const normalizedLower = normalized.toLowerCase();
    for (const [key, value] of Object.entries(industryMap)) {
      if (normalizedLower.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedLower)) {
        return value;
      }
    }
    
    // Check if it matches any key in RANDOMIZED_ANGLES_BY_INDUSTRY directly
    if (window.RANDOMIZED_ANGLES_BY_INDUSTRY[normalized]) {
      return normalized;
    }
    
    // Default fallback - use generic angles that work for any industry
    return 'Default';
  }

  /**
   * Select randomized angle based on industry weights
   */
  function selectRandomizedAngle(industry, manualAngleOverride, accountData) {
    // STEP 1: If user manually specified an angle, ALWAYS use it (respect user intent)
    if (manualAngleOverride) {
      return findAngleById(manualAngleOverride, industry);
    }
    
    // STEP 1.5: Normalize industry name
    const normalizedIndustry = normalizeIndustry(industry);
    
    // STEP 2: Get angles for this industry
    const industryAngles = window.RANDOMIZED_ANGLES_BY_INDUSTRY[normalizedIndustry];
    if (!industryAngles || !industryAngles.angles.length) {
      // Fallback to generic angles
      return {
        id: 'timing_strategy',
        primaryMessage: 'strategic contract timing',
        openingTemplate: 'When does your contract renew?',
        primaryValue: '8-15% savings from early renewal',
        newsHooks: [],
      };
    }
    
    // STEP 3: Filter angles (check conditions)
    let validAngles = industryAngles.angles.filter(angle => {
      if (angle.condition) {
        // Check if condition passes (e.g., "taxExemptStatus === 'Nonprofit'")
        try {
          // Replace accountData references in condition string
          const conditionCode = angle.condition.replace(/accountData\?\./g, 'accountData?.');
          // Create safe evaluation context - accountData might be recipient object
          const accountDataSafe = accountData || {};
          // If accountData is recipient object, extract account info for easier condition checking
          if (accountDataSafe.account) {
            accountDataSafe.industry = accountDataSafe.industry || accountDataSafe.account.industry || '';
            accountDataSafe.taxExemptStatus = accountDataSafe.taxExemptStatus || accountDataSafe.account.taxExemptStatus || '';
          }
          return eval(conditionCode);
        } catch (e) {
          console.warn('[Angle Selection] Condition evaluation failed:', e);
          return false;
        }
      }
      return true;
    });
    
    // STEP 4: Randomize based on weights
    if (validAngles.length === 0) {
      // If no valid angles after filtering, fall back to timing_strategy only
      console.warn('[Angle Selection] No valid angles after filtering, using timing_strategy fallback');
      return {
        id: 'timing_strategy',
        primaryMessage: 'strategic contract timing',
        openingTemplate: 'When does your contract renew?',
        primaryValue: '8-15% savings from early renewal',
        situationalContext: 'Best practice is renewing 6 months to 1 year in advance, though most companies renew 30-60 days out or last minute if not careful.',
        newsHooks: [],
      };
    }
    
    return randomizeByWeight(validAngles);
  }

  /**
   * Find angle by ID
   */
  function findAngleById(angleId, industry) {
    const normalizedIndustry = normalizeIndustry(industry);
    const industryAngles = window.RANDOMIZED_ANGLES_BY_INDUSTRY[normalizedIndustry];
    if (!industryAngles) return null;
    return industryAngles.angles.find(a => a.id === angleId) || null;
  }

  /**
   * Select random authentic tone opener
   */
  function selectRandomToneOpener(angleId = null) {
    const openings = window.AUTHENTIC_TONE_OPENERS.disarming;
    return openings[Math.floor(Math.random() * openings.length)];
  }

  /**
   * Helper: Detect if user's manual input specifies a different angle
   */
  function detectAngleFromInput(manualInput) {
    if (!manualInput) return null;
    const input = manualInput.toLowerCase();
    
    // Pattern matching for user intent
    if (input.includes('exemption') || input.includes('tax recovery')) {
      return 'exemption_recovery';
    }
    if (input.includes('demand') || input.includes('efficiency') || input.includes('consumption')) {
      return 'demand_efficiency';
    }
    if (input.includes('timing') || input.includes('early renewal') || input.includes('renewal')) {
      return 'timing_strategy';
    }
    if (input.includes('consolidat') || input.includes('multiple') || input.includes('multi-site')) {
      return 'consolidation';
    }
    if (input.includes('mission') || input.includes('nonprofit')) {
      return 'mission_funding';
    }
    
    return null; // No specific angle detected
  }

  /**
   * Helper: Build news context (if applicable)
   */
  function buildNewsContext(newsHooks, selectedAngle) {
    if (!newsHooks || newsHooks.length === 0) return '';
    
    // Note: This would integrate with a MARKET_CONTEXT object if available
    // For now, return empty string as news hooks are optional
    return '';
  }

  /**
   * Dynamic prompt builder that respects:
   * 1. Manual angle override (if user types specific angle)
   * 2. Authentic tone (matches your personality)
   * 3. Account data (news, industry triggers)
   * 4. News context (integrated naturally, not forced)
   */
  function buildDynamicPrompt(
    contact,
    account,
    selectedAngle,
    manualPromptOverride = null,
    newsHooks = null
  ) {
    // STEP 1: If user provided manual prompt override, use it as context (don't force angle)
    if (manualPromptOverride && manualPromptOverride.trim().length > 0) {
      return buildManualPrompt(
        contact,
        account,
        selectedAngle,
        manualPromptOverride
      );
    }
    
    // STEP 2: Otherwise, build dynamic prompt based on selected angle
    const toneOpener = selectRandomToneOpener(selectedAngle?.id);
    
    const prompt = `
Write a cold introduction email that MUST:

1. GREETING (RANDOMIZE FOR VARIETY)
   - RANDOMLY choose ONE of these greetings:
     * "Hi ${contact?.firstName || '[contact_first_name]'},"
     * "Hey ${contact?.firstName || '[contact_first_name]'},"
     * "Hello ${contact?.firstName || '[contact_first_name]'},"
   - DO NOT use "Hi [contact_first_name] there," or add extra words

2. OPEN WITH OBSERVATION (CRITICAL - MUST USE RESEARCH)
   - YOU MUST reference something SPECIFIC about ${account?.name || '[contact_company]'} that proves you researched them
   - REQUIRED: Include at least ONE of these research elements (reference naturally WITHOUT saying "I noticed" or "I saw"):
     * Location/facility details: "${account?.name || '[contact_company]'} operates in ${account?.city || '[city]'}, ${account?.state || '[state]'}..." or "With operations in ${account?.city || '[city]'}..." or "With [X] facilities in ${account?.state || '[state]'}..."
     * Recent activity from LinkedIn: Reference naturally, e.g., "${account?.name || '[contact_company]'} recently..." (if available)
     * Website insight: Reference naturally, e.g., "On your website..." or "Your website mentions..." (if available)
     * Industry pattern with peer context: "I've been talking to ${contact?.role || '[role]'}s across ${account?.state || '[state]'}, and..."
   - NEVER: "I noticed...", "I saw...", "I hope you're well", "I wanted to reach out", "I hope this email finds you well", "Let me ask you something—" (unless you actually ask a question immediately after)
   - MUST: Prove you researched - include specific details (location, facility size, operations type, operational model) - but weave it in naturally
   - CRITICAL: If you use "Let me ask you something—" or similar openers, you MUST immediately follow with an actual question. Never use these phrases without asking a question.

3. ACKNOWLEDGE THEIR SITUATION (ROLE-SPECIFIC)
   - For ${contact?.role || contact?.title || '[contact_job_title]'}: Show you understand what they actually deal with daily
   - For ${account?.industry || '[company_industry]'}: Reference industry-specific pain points naturally (not generic)
   - Use their role language (CFOs care about predictability/budgets, Operations care about uptime/reliability)
   - Make it about THEM, not about us (don't lead with "We help...")

4. ONE INSIGHT (SPECIFIC, NOT GENERIC)
   - Provide ONE concrete observation about why this matters to them NOW
   - Use SPECIFIC numbers and timing: "6 months early = 10-20% savings" NOT "thousands annually"
   - NOT: "Companies save 10-20%" (too generic)
   - YES: "With 4 facilities in Texas, timing is critical - locking in 6 months out vs 90 days is usually 10-20% difference"
   - Include timing context: early renewal (6 months) vs late (90 days) = money difference
   - CRITICAL: Mention the 10-20% savings figure ONLY ONCE in the entire email - do not repeat it multiple times
   - Use "10-20%" NOT "15-20%" or "15-25%" - be consistent with the 10-20% range
   - SELECTED ANGLE: ${selectedAngle?.primaryMessage || 'strategic contract timing'}
   - ANGLE VALUE: ${selectedAngle?.primaryValue || '10-20% savings from early renewal'}

5. TONE REQUIREMENTS (YOUR VOICE - 29-YEAR-OLD TEXAS BUSINESS PRO)
   - Write like a peer, not a salesperson (conversational, confident, direct)
   - Use contractions: "we're," "don't," "it's," "you're," "I'm"
   - Vary sentence length: Short. Medium sentence. Longer explanation when needed.
   - AVOID corporate jargon: "stabilize expenses," "leverage," "optimize," "streamline," "procurement," "unleash," "synergy," "dive into," "solution," "at Power Choosers"
   - Sound like: colleague who knows their industry and has talked to others like them
   - Use casual confidence: "Been wondering—" "Question for you—" "Here's what I'm seeing—"
   - NEVER: "Quick question—", "Real question—", "Out of curiosity—", "Let me ask you something—" (unless immediately followed by an actual question)
   - NO: "Would you be open to..." (permission-based, weak)
   - YES: Ask specific questions that assume conversation is happening
   - CRITICAL: If you use any question opener like "Let me ask you something—", you MUST immediately follow with an actual question. Never use these phrases without asking a question.
   - Opening tone suggestion: "${toneOpener}" (use naturally, not forced)

6. CALL TO ACTION (ASSERTIVE, NOT PERMISSION-BASED)
   - MUST: Assume the conversation is happening - don't ask for permission to talk
   - NO: "Would you be open to a conversation?", "Let's schedule a call", "If you ever want a second opinion on your setup, I can spend 10 minutes looking at your situation."
   - YES: Ask specific question about their contract, timing, or process
   - The CTA MUST be a direct question that relates to the email body and selected angle
   - Use angle opening template as inspiration: "${selectedAngle?.openingTemplate || 'When does your current electricity contract expire?'}"
   - Exactly ONE question mark (?) in the entire email

7. SUBJECT LINE (SPECIFIC, NOT VAGUE)
   - MUST be specific to their role and timing aspect (contract renewal, rate lock timing, budget cycle)
   - Examples: "${contact?.firstName || '[FirstName]'}, contract timing question" or "${contact?.firstName || '[FirstName]'}, rate lock timing question"
   - NOT generic: "thoughts on energy planning" or "insight to ease costs" or "thoughts on energy strategy"
   - Focus on: contract renewal, rate lock timing, budget cycle, facility renewal
   - Role-specific: For Controllers/CFO: "budget question about energy renewal timing"
   - For Operations/Facilities: "facility renewal timing question"

8. FORMAT
   - 100-130 words max (scannable, not overwhelming)
   - 2-3 short paragraphs (break up visually)
   - Scannable on mobile (short lines, clear breaks)
   - One CTA at end (a direct question related to the angle)

9. PERSONALIZATION
   - Include ${contact?.firstName || '[contact_first_name]'} naturally in randomized greeting
   - Reference ${account?.name || '[company_name]'} specifically (not "your company")
   - For ${account?.industry || '[company_industry]'}, use industry-specific language naturally
   - Reference location if available (${account?.city || '[city]'}, ${account?.state || '[state]'}) for regional context

10. PROOF OF RESEARCH
   - Include at least ONE specific detail that proves you researched (not just role description)
   - Examples: "4 locations across Texas," "24/7 operations," "both electricity and natural gas"
   - This makes you stand out from generic templates

ABSOLUTELY AVOID sounding like ChatGPT or a generic email template. You should sound like their peer—a 29-year-old Texas business pro who knows the industry and has talked to others in their situation. Be conversational, confident, and direct.

Generate ONLY email body (no signature, no HTML).
    `.trim();
    
    return prompt;
  }

  /**
   * Handle manual prompt overrides (user typed specific context)
   * This respects the user's intent while using the selected angle
   */
  function buildManualPrompt(contact, account, selectedAngle, manualInput) {
    // Check if manual input mentions a specific angle or instruction
    const manualAngle = detectAngleFromInput(manualInput);
    const finalAngle = manualAngle ? findAngleById(manualAngle, account?.industry) : selectedAngle;
    const toneOpener = selectRandomToneOpener(finalAngle?.id);
    
    const prompt = `
Write a cold introduction email that MUST:

1. GREETING (RANDOMIZE FOR VARIETY)
   - RANDOMLY choose ONE of these greetings:
     * "Hi ${contact?.firstName || '[contact_first_name]'},"
     * "Hey ${contact?.firstName || '[contact_first_name]'},"
     * "Hello ${contact?.firstName || '[contact_first_name]'},"
   - DO NOT use "Hi [contact_first_name] there," or add extra words

2. OPEN WITH OBSERVATION (CRITICAL - MUST USE RESEARCH)
   - YOU MUST reference something SPECIFIC about ${account?.name || '[contact_company]'} that proves you researched them
   - REQUIRED: Include at least ONE of these research elements (reference naturally WITHOUT saying "I noticed" or "I saw"):
     * Location/facility details: "${account?.name || '[contact_company]'} operates in ${account?.city || '[city]'}, ${account?.state || '[state]'}..." or "With operations in ${account?.city || '[city]'}..."
     * Recent activity from LinkedIn: Reference naturally, e.g., "${account?.name || '[contact_company]'} recently..." (if available)
     * Website insight: Reference naturally, e.g., "On your website..." or "Your website mentions..." (if available)
     * Industry pattern with peer context: "I've been talking to ${contact?.role || '[role]'}s across ${account?.state || '[state]'}, and..."
   - NEVER: "I noticed...", "I saw...", "I hope you're well", "I wanted to reach out", "I hope this email finds you well", "Let me ask you something—" (unless you actually ask a question immediately after)
   - MUST: Prove you researched - include specific details (location, facility size, operations type, operational model) - but weave it in naturally
   - CRITICAL: If you use "Let me ask you something—" or similar openers, you MUST immediately follow with an actual question. Never use these phrases without asking a question.

3. ACKNOWLEDGE THEIR SITUATION (ROLE-SPECIFIC)
   - For ${contact?.role || contact?.title || '[contact_job_title]'}: Show you understand what they actually deal with daily
   - For ${account?.industry || '[company_industry]'}: Reference industry-specific pain points naturally (not generic)
   - Use their role language (CFOs care about predictability/budgets, Operations care about uptime/reliability)
   - Make it about THEM, not about us (don't lead with "We help...")

4. ONE INSIGHT (SPECIFIC, NOT GENERIC)
   - Provide ONE concrete observation about why this matters to them NOW
   - Use SPECIFIC numbers and timing: "6 months early = 10-20% savings" NOT "thousands annually"
   - NOT: "Companies save 10-20%" (too generic)
   - YES: "With 4 facilities in Texas, timing is critical - locking in 6 months out vs 90 days is usually 10-20% difference"
   - Include timing context: early renewal (6 months) vs late (90 days) = money difference
   - CRITICAL: Mention the 10-20% savings figure ONLY ONCE in the entire email - do not repeat it multiple times
   - Use "10-20%" NOT "15-20%" or "15-25%" - be consistent with the 10-20% range
   - PRIMARY ANGLE (use if relevant): ${finalAngle?.primaryMessage || 'their energy situation'}
   - ANGLE VALUE: ${finalAngle?.primaryValue || 'observation-based value with specific numbers'}

5. TONE REQUIREMENTS (YOUR VOICE - 29-YEAR-OLD TEXAS BUSINESS PRO)
   - Write like a peer, not a salesperson (conversational, confident, direct)
   - Use contractions: "we're," "don't," "it's," "you're," "I'm"
   - Vary sentence length: Short. Medium sentence. Longer explanation when needed.
   - AVOID corporate jargon: "stabilize expenses," "leverage," "optimize," "streamline," "procurement," "unleash," "synergy," "dive into," "solution," "at Power Choosers"
   - Sound like: colleague who knows their industry and has talked to others like them
   - Use casual confidence: "Been wondering—" "Question for you—" "Here's what I'm seeing—"
   - NEVER: "Quick question—", "Real question—", "Out of curiosity—", "Let me ask you something—" (unless immediately followed by an actual question)
   - NO: "Would you be open to..." (permission-based, weak)
   - YES: Ask specific questions that assume conversation is happening
   - CRITICAL: If you use any question opener like "Let me ask you something—", you MUST immediately follow with an actual question. Never use these phrases without asking a question.
   - Opening tone suggestion: "${toneOpener}" (use naturally, not forced)

6. CALL TO ACTION (ASSERTIVE, NOT PERMISSION-BASED)
   - MUST: Assume the conversation is happening - don't ask for permission to talk
   - NO: "Would you be open to a conversation?", "Let's schedule a call", "If you ever want a second opinion on your setup, I can spend 10 minutes looking at your situation."
   - YES: Ask specific question about their contract, timing, or process
   - The CTA MUST be a direct question that relates to the email body and selected angle
   - Exactly ONE question mark (?) in the entire email

7. SUBJECT LINE (SPECIFIC, NOT VAGUE)
   - MUST be specific to their role and timing aspect (contract renewal, rate lock timing, budget cycle)
   - Examples: "${contact?.firstName || '[FirstName]'}, contract timing question" or "${contact?.firstName || '[FirstName]'}, rate lock timing question"
   - NOT generic: "thoughts on energy planning" or "insight to ease costs" or "thoughts on energy strategy"
   - Focus on: contract renewal, rate lock timing, budget cycle, facility renewal

8. FORMAT
   - 100-130 words max (scannable, not overwhelming)
   - 2-3 short paragraphs (break up visually)
   - Scannable on mobile (short lines, clear breaks)
   - One CTA at end (a direct question related to the angle)

9. PERSONALIZATION
   - Include ${contact?.firstName || '[contact_first_name]'} naturally in randomized greeting
   - Reference ${account?.name || '[company_name]'} specifically (not "your company")
   - For ${account?.industry || '[company_industry]'}, use industry-specific language naturally
   - Reference location if available (${account?.city || '[city]'}, ${account?.state || '[state]'}) for regional context

10. PROOF OF RESEARCH
   - Include at least ONE specific detail that proves you researched (not just role description)
   - Examples: "4 locations across Texas," "24/7 operations," "both electricity and natural gas"
   - This makes you stand out from generic templates

USER CONTEXT (RESPECT THIS INTENT):
${manualInput}

ABSOLUTELY AVOID sounding like ChatGPT or a generic email template. You should sound like their peer—a 29-year-old Texas business pro who knows the industry and has talked to others in their situation. Be conversational, confident, and direct. Respect the user's intent from manual context while following all the rules above.

Generate ONLY email body (no signature, no HTML).
    `.trim();
    
    return prompt;
  }

  async function generateWithAI(aiBar, mode = 'standard') {
    const compose = document.getElementById('compose-window');
    const editor = compose?.querySelector('.body-input');
    const status = aiBar?.querySelector('.ai-status');
    const prompt = aiBar?.querySelector('.ai-prompt')?.value?.trim() || '';
    const toInput = compose?.querySelector('#compose-to');
    const subjectInput = compose?.querySelector('#compose-subject');
    
    if (!editor) return;

    // Close AI bar immediately
    if (aiBar) {
      aiBar.classList.remove('open');
      aiBar.setAttribute('aria-hidden', 'true');
    }

    // Start generating animation with appropriate mode
    startGeneratingAnimation(compose, mode);
    if (status) status.textContent = 'Generating...';
    
    try {
      const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
      const genUrl = `${base}/api/perplexity-email`;
      
      console.log('[AI] Calling Perplexity Sonar...');

      // Get recipient data with enrichment
      let recipient = null;
      try {
        const toVal = toInput?.value || '';
        if (toVal) {
          recipient = await lookupPersonByEmail(toVal);
          // Enrich with account data
          recipient = await enrichRecipientWithAccountData(recipient);
        }
      } catch (error) {
        console.warn('[AI] Failed to lookup recipient:', error);
      }

      // Get sender name from settings (only thing we need from settings)
      const settings = (window.SettingsPage?.getSettings?.()) || {};
      const g = settings?.general || {};
      const senderName = (g.firstName && g.lastName) 
        ? `${g.firstName} ${g.lastName}`.trim()
        : 'Lewis Patterson';

      // Hardcoded identity - focus on electricity only
      const whoWeAre = 'You are an Energy Strategist at Power Choosers. You help businesses secure better electricity rates and manage energy procurement more effectively.';

      // Select randomized angle based on recipient industry (with inference fallbacks)
      let recipientIndustry = recipient?.industry || recipient?.account?.industry || '';
      
      // If no industry field, infer from company name
      if (!recipientIndustry && recipient?.company) {
        recipientIndustry = inferIndustryFromCompanyName(recipient.company);
      }
      
      // If still no industry, try to infer from account description
      if (!recipientIndustry && recipient?.account) {
        const accountDesc = recipient.account?.shortDescription || recipient.account?.short_desc || 
                           recipient.account?.descriptionShort || recipient.account?.description || 
                           recipient.account?.companyDescription || recipient.account?.accountDescription || '';
        if (accountDesc) {
          recipientIndustry = inferIndustryFromDescription(accountDesc);
        }
      }
      
      // Fallback to Default if still no industry detected
      if (!recipientIndustry) {
        recipientIndustry = 'Default';
      }
      
      const selectedAngle = selectRandomizedAngle(recipientIndustry, null, recipient);
      const toneOpener = selectRandomToneOpener();

      console.log('[AI] Selected angle:', selectedAngle?.id, 'for industry:', recipientIndustry);
      console.log('[AI] Using tone opener:', toneOpener);

      // Build comprehensive prompt using the prompt builders (enhances user's input with all rules)
      const contact = {
        firstName: recipient?.firstName || recipient?.name?.split(' ')[0] || '',
        role: recipient?.title || recipient?.job || recipient?.role || '',
        title: recipient?.title || recipient?.job || recipient?.role || ''
      };
      const account = recipient?.account || {
        name: recipient?.company || '',
        industry: recipient?.industry || recipient?.account?.industry || '',
        city: recipient?.account?.city || '',
        state: recipient?.account?.state || ''
      };
      
      // Use buildDynamicPrompt or buildManualPrompt to enhance the user's prompt
      const enhancedPrompt = prompt.trim().length > 0
        ? buildManualPrompt(contact, account, selectedAngle, prompt)
        : buildDynamicPrompt(contact, account, selectedAngle, null, null);

      console.log('[AI] Using enhanced prompt with comprehensive rules');

      // Call the API
      const response = await fetch(genUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: enhancedPrompt,
          recipient: recipient,
          mode: mode,
          senderName: senderName,
          whoWeAre: whoWeAre,
          // Pass selected angle and tone
          selectedAngle: selectedAngle,
          toneOpener: toneOpener
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();
      console.log('[AI] Received response:', result);

      // Save generation metadata for tracking (subject_style, cta_type, opening_style)
      try {
        window._lastGeneratedMetadata = result.metadata || null;
        console.log('[AI] Stored generation metadata:', window._lastGeneratedMetadata);
      } catch (_) {
        // non-fatal
      }

      // Handle different response formats based on mode and templateType
      const templateType = result.templateType || null;
      const output = result.output || '';

      let subject = '';
      let html = '';

      if (templateType) {
        // HTML mode with structured JSON
        const formatted = formatTemplatedEmail(output, recipient, templateType);
        subject = formatted.subject;
        html = formatted.html;
      } else {
        // Standard mode with plain text
        const formatted = formatGeneratedEmail(output, recipient, mode);
        subject = formatted.subject;
        html = formatted.html;
      }

      // Insert the formatted content
      if (subject && subjectInput) {
        // Remove "Re:" prefix if it's a new email (not a reply)
        let cleanSubject = subject;
        if (cleanSubject.startsWith('Re: ')) {
          cleanSubject = cleanSubject.substring(4);
        }
        
        // For cold emails, enhance subject with observation-based generator if it seems generic
        const isColdEmail = templateType === 'cold_email' || /cold.*email/i.test(prompt);
        if (isColdEmail && recipient) {
          const industry = recipient?.industry || recipient?.account?.industry || '';
          const observation = recipient?.account?.shortDescription || recipient?.account?.descriptionShort || '';
          // Use observation-based subject if API returned generic subject
          const apiSubject = cleanSubject.toLowerCase();
          const isGenericSubject = apiSubject.includes('hi') || apiSubject.includes('hello') || 
                                  apiSubject.includes('i can help') || apiSubject.length < 20;
          if (isGenericSubject) {
            cleanSubject = generateColdEmailSubject(recipient, industry, observation);
            console.log('[AI] Using observation-based subject line for cold email');
          }
        }
        
        // Animate subject line with typewriter effect
        setTimeout(() => {
          typewriterEffect(subjectInput, cleanSubject, 50);
        }, 500);
      }

      if (html && editor) {
        // Different animations for HTML templates vs standard emails
        setTimeout(() => {
          // IMPORTANT: For structured HTML templates, DO NOT append existing signature
          // since the template includes a hard-coded signature block.
          const finalHtml = templateType ? html : preserveSignatureAfterAI(editor, html);
          
          // Mark content type for sending (but don't activate HTML source view)
          if (templateType) {
            editor.setAttribute('data-template-type', templateType);
            editor.setAttribute('data-html-email', 'true');
          } else {
            editor.removeAttribute('data-template-type');
            editor.removeAttribute('data-html-email');
          }
          
          // Ensure we're NOT in HTML source code view mode
          // If emailManager exists and is in HTML mode, toggle it off to show rendered view
          if (window.emailManager && window.emailManager._isHtmlMode) {
            console.log('[AI] Exiting HTML source mode to show rendered template');
            window.emailManager.toggleHtmlMode(compose);
          }
          
          // Ensure data-mode is NOT set (this was causing the monospace font issue)
          editor.removeAttribute('data-mode');
          
          // Use different animations based on template type
          if (templateType) {
            // HTML email template: wrap in iframe to isolate CSS and prevent style bleeding
            renderHtmlEmailInIframe(editor, finalHtml);
          } else {
            // Standard email: use simple fade-in
            editor.innerHTML = finalHtml;
            editor.style.opacity = '0';
            editor.style.transform = 'translateY(10px)';
            editor.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            
            // Trigger the animation
            setTimeout(() => {
              editor.style.opacity = '1';
              editor.style.transform = 'translateY(0)';
            }, 50);
          }
        }, 800);
      }

      // Stop generating animation after content is inserted
      setTimeout(() => {
        stopGeneratingAnimation(compose);
        if (status) status.textContent = 'Generated successfully!';
      }, 1200);

    } catch (error) {
      console.error('[AI] Generation failed:', error);
      stopGeneratingAnimation(compose);
      if (status) status.textContent = 'Generation failed. Please try again.';
    }
  }

  // ========== TEMPLATE BUILDER FUNCTIONS ==========
  
  // Get industry-specific value props from settings
  function getIndustryValueProps(industry, jobTitle) {
    const settings = (window.SettingsPage?.getSettings?.()) || {};
    const industryData = settings?.industrySegmentation?.rules?.[industry?.toLowerCase()] || {};
    
    // Check for exact match first
    const industryKey = industry?.toLowerCase() || '';
    
    // Try to find matching industry rule
    let matchedRule = null;
    if (settings?.industrySegmentation?.rules) {
      // Exact match
      if (settings.industrySegmentation.rules[industryKey]) {
        matchedRule = settings.industrySegmentation.rules[industryKey];
      } else {
        // Partial match
        for (const [key, rule] of Object.entries(settings.industrySegmentation.rules)) {
          if (industryKey.includes(key) || key.includes(industryKey)) {
            matchedRule = rule;
            break;
          }
        }
      }
    }
    
    // Manufacturing-specific value props
    if (industry?.toLowerCase()?.includes('manufacturing') || industryKey === 'manufacturing') {
      return [
        'Production schedules protected through renewals',
        'Equipment uptime guaranteed with cost certainty',
        'Avoid peak-season supplier rush'
      ];
    }
    
    // Healthcare-specific
    if (industry?.toLowerCase()?.includes('healthcare') || industry?.toLowerCase()?.includes('hospital') || industryKey === 'healthcare') {
      return [
        'Budget predictability for annual cycles',
        'Compliance-ready procurement process',
        'Cost control without impacting patient care'
      ];
    }
    
    // Hospitality-specific
    if (industry?.toLowerCase()?.includes('hotel') || industry?.toLowerCase()?.includes('hospitality') || industryKey === 'hospitality') {
      return [
        'Multi-property cost management',
        'Seasonal demand planning with locked rates',
        'Guest experience maintained with reliable utilities'
      ];
    }
    
    // Food Production-specific
    if (industry?.toLowerCase()?.includes('food') || industry?.toLowerCase()?.includes('production') || industryKey === 'food') {
      return [
        'Temperature-controlled operations secured',
        'Production efficiency protected',
        'Operational continuity through renewals'
      ];
    }
    
    // Nonprofit-specific
    if (industry?.toLowerCase()?.includes('nonprofit') || industry?.toLowerCase()?.includes('charity') || industryKey === 'nonprofit') {
      return [
        'More budget for your mission',
        'Predictable operational costs',
        'Compliance handled professionally'
      ];
    }
    
    // Retail-specific
    if (industry?.toLowerCase()?.includes('retail') || industryKey === 'retail') {
      return [
        'Multi-location cost management',
        'Seasonal demand handled with predictable rates',
        'Centralized procurement for all locations'
      ];
    }
    
    // Education-specific
    if (industry?.toLowerCase()?.includes('education') || industryKey === 'education') {
      return [
        'Budget optimization for academic cycles',
        'Facility maintenance costs predictable',
        'Student safety maintained with reliable power'
      ];
    }
    
    // Generic fallback
    return [
      'Competitive market analysis vs. current spend',
      'Early planning advantage before renewal season',
      'Transparent pricing without hidden fees'
    ];
  }
  
  // Generate observation-based cold email subject lines
  function generateColdEmailSubject(recipient, industry, observation) {
    const company = recipient?.company || recipient?.accountName || 'your organization';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    
    // Observation-based subjects (highest open rate)
    const subjectTemplates = {
      manufacturing: [
        `Question about ${company}'s renewal timing`,
        `Noticed ${company} expanded operations`,
        `Production continuity + energy - quick question`,
        `${company} operations - question`
      ],
      healthcare: [
        `Budget planning question for ${company}`,
        `${company} 2025 budget cycle`,
        `Question about your facility costs`,
        `Quick question re: your renewal timing`
      ],
      hospitality: [
        `Question about your multi-property costs`,
        `${company} portfolio - quick note`,
        `Your properties + renewal timing`,
        `Question on ${company} operations`
      ],
      food: [
        `Question about ${company} operations`,
        `Production continuity + cost certainty`,
        `Your production schedule - quick question`,
        `${company} + operational efficiency`
      ],
      nonprofit: [
        `Budget question for ${company}`,
        `More resources for your mission?`,
        `${company} budget cycle planning`,
        `Quick question about your operational costs`
      ],
      retail: [
        `Question about ${company}'s multi-location costs`,
        `${company} locations + renewal timing`,
        `Quick question on your energy strategy`,
        `${company} operations question`
      ],
      education: [
        `Budget question for ${company}`,
        `${company} facility costs`,
        `Academic cycle planning question`,
        `Quick question about your operational costs`
      ],
      generic: [
        `Quick question about ${company}'s energy strategy`,
        `${firstName}, thoughts on energy planning?`,
        `Question about ${company} operations`,
        `${company} + energy costs - quick question`
      ]
    };
    
    const industryKey = industry?.toLowerCase() || 'generic';
    let templates = subjectTemplates.generic;
    
    // Find matching industry templates
    for (const [key, templateList] of Object.entries(subjectTemplates)) {
      if (industryKey.includes(key) || key.includes(industryKey)) {
        templates = templateList;
        break;
      }
    }
    
    // If specific templates found, use them; otherwise use generic
    if (templates.length > 0) {
      const subject = templates[Math.floor(Math.random() * templates.length)];
      
      // Replace variables
      return subject
        .replace(/\[company\]/gi, company)
        .replace(/\[first_name\]/gi, firstName)
        .replace(/\[job_title\]/gi, recipient?.title || recipient?.job || 'leader');
    }
    
    // Final fallback
    return `Quick question about ${company}'s energy strategy`;
  }
  
  // Build sender profile signature once for all HTML templates
  function getSenderProfile() {
    const settings = (window.SettingsPage?.getSettings?.()) || {};
    const g = settings?.general || {};
    const first = g.firstName || '';
    const last = g.lastName || '';
    
    // Priority: Settings (firstName + lastName) → Firebase auth displayName → "Power Choosers Team"
    let name = '';
    if (first && last) {
      name = `${first} ${last}`.trim();
    } else {
      // Try Firebase auth displayName as fallback
      try {
        const user = window.firebase?.auth?.().currentUser;
        if (user?.displayName) {
          name = user.displayName.trim();
        }
      } catch (_) {}
      
      // Final fallback to "Power Choosers Team" (NOT "Power Choosers CRM")
      if (!name) {
        name = 'Power Choosers Team';
      }
    }
    
    return {
      name,
      title: g.jobTitle || 'Energy Strategist',
      company: g.companyName || 'Power Choosers',
      location: g.location || '',
      phone: g.phone || '',
      email: g.email || 'l.patterson@powerchoosers.com',
      avatar: g.hostedPhotoURL || g.photoURL || ''
    };
  }

  function buildSignatureBlock() {
    const s = getSenderProfile();
    
    // Debug logging to verify location is being retrieved
    console.log('[Signature] Building signature block with:', {
      name: s.name,
      title: s.title,
      company: s.company,
      location: s.location,
      phone: s.phone,
      email: s.email
    });
    
    // Use separate divs for each line instead of <br> tags to ensure proper line breaks
    return `
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
        <div style="display:flex; gap:12px; align-items:flex-start;">
          ${s.avatar ? `<img src="${s.avatar}" alt="${s.name}" style="width:48px; height:48px; border-radius:50%; object-fit:cover; flex-shrink:0;">` : ''}
          <div style="flex:1;">
            <div style="font-weight: 600; font-size: 15px; color: #1e3a8a; margin: 0; line-height: 1.3;">
              ${s.name}
            </div>
            <div style="font-size: 13px; color: #1e40af; opacity: 0.9; margin: 2px 0; line-height: 1.3;">
              ${s.title}
            </div>
            <div style="font-size: 14px; color: #1e40af; margin: 4px 0 0 0; line-height: 1.4;">
              ${s.location ? `<div style="margin: 0; line-height: 1.3;">${s.location}</div>` : ''}
              ${s.phone ? `<div style="margin: 2px 0 0 0; line-height: 1.3;">Phone: ${s.phone}</div>` : ''}
              <div style="margin: 2px 0 0 0; line-height: 1.3;">Email: ${s.email}</div>
              <div style="margin: 2px 0 0 0; line-height: 1.3;">${s.company}</div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function buildWarmIntroHtml(data, recipient, fromEmail) {
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    const s = getSenderProfile();
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin:0; padding:0; background:#f1f5fa; font-family:'Segoe UI',Arial,sans-serif; color:#1e3a8a;}
    .container { max-width:600px; margin:30px auto; background:#fff; border-radius:14px;
      box-shadow:0 6px 28px rgba(30,64,175,0.11),0 1.5px 4px rgba(30,64,175,0.03);
      overflow:hidden;
    }
    .header { padding:32px 24px 18px 24px;
      background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);
      color:#fff; text-align:center;
    }
    .header img { max-width:190px; margin:0 auto 10px; display:block;}
    .brandline { font-size:16px; font-weight:600; letter-spacing:0.08em; opacity:0.92;}
    .subject-blurb {
      margin:20px 24px 2px 24px; font-size:14px; color:#234bb7;
      font-weight:600; letter-spacing:0.02em; opacity:0.93;
      background:#f3f8ff; padding:6px 13px; border-radius:6px; display:inline-block;
    }
    .intro { margin:0 24px 10px 24px; padding:18px 0 2px 0; }
    .intro p { margin:0 0 3px 0; font-size:16px; color:#1e3a8a; }
    .main-paragraph {margin:0 24px 18px 24px; padding:18px; background:#fff; border-radius:7px; line-height:1.6;}
    .cta-container {
      text-align:center; padding:22px 24px;
      background:#f3f8ff; border-radius:8px; margin:0 24px 18px 24px;
      box-shadow:0 2px 6px rgba(30,64,175,0.05);
    }
    .cta-btn {
      display:inline-block; padding:13px 36px; background:#1e3a8a; color:#fff;
      border-radius:7px; font-weight:700; font-size:16px; text-decoration:none;
      box-shadow:0 2px 8px rgba(30,64,175,0.13);
      transition:background 0.18s;
    }
    .cta-btn:hover { background:#1631a4;}
    .signature {
      margin:15px 24px 22px 24px; font-size:15.3px; color:#1e40af;
      font-weight:500; padding:14px 0 0 0; border-top:1px solid #e9ebf3;
    }
    .footer {
      padding:22px 24px; color:#aaa; text-align:center; font-size:13px;
      background: #f1f5fa; border-bottom-left-radius:14px; border-bottom-right-radius:14px;
      letter-spacing:0.08em;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/687d6d9c6ea5d6db744563ee_clear%20logo.png" alt="Power Choosers">
      <div class="brandline">Your Energy Partner</div>
    </div>
    <div class="subject-blurb">Great speaking with you about ${company}'s energy needs</div>
    <div class="intro">
      <p>Hi ${firstName},</p>
      <p>${data.call_reference || 'Thank you for taking my call today. I wanted to quickly follow up and ensure you have the key details about how Power Choosers can support your team\'s energy procurement goals.'}</p>
    </div>
    <div class="main-paragraph">
      <p>${data.main_message || 'I wanted to follow up on our conversation about your energy needs and how Power Choosers can help optimize your costs.'}</p>
    </div>
    <div class="cta-container">
      <a href="https://powerchoosers.com/schedule" class="cta-btn">${data.cta_text || 'Schedule a Follow-Up Call'}</a>
      <div style="margin-top:8px;font-size:14px;color:#1e3a8a;opacity:0.83;">
        Prefer email or need more info? Just reply—happy to assist.
      </div>
    </div>
    <div class="signature">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
        ${s.avatar ? `<img src="${s.avatar}" alt="${s.name}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">` : ''}
        <div>
          <div style="font-weight: 600; font-size: 15px; color: #1e3a8a;">${s.name}</div>
          <div style="font-size: 13px; color: #1e40af; opacity: 0.9;">${s.title}</div>
        </div>
      </div>
      <div style="font-size: 14px; color: #1e40af; margin: 4px 0 0 0; line-height: 1.4;">
        ${s.location ? `<div style="margin: 0; line-height: 1.3;">${s.location}</div>` : ''}
        ${s.phone ? `<div style="margin: 2px 0 0 0; line-height: 1.3;">${s.phone}</div>` : ''}
        <div style="margin: 2px 0 0 0; line-height: 1.3;">${s.company}</div>
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

  function buildFollowUpHtml(data, recipient, fromEmail) {
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    const s = getSenderProfile();
    
    const valueProps = data.value_props || [
      'Access to 50+ competitive suppliers',
      'No cost for our procurement service',
      'Transparent rate comparison',
      'Expert contract negotiation'
    ];
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin:0; padding:0; background:#f1f5fa; font-family:'Segoe UI',Arial,sans-serif; color:#1e3a8a;}
    .container { max-width:600px; margin:30px auto; background:#fff; border-radius:14px;
      box-shadow:0 6px 28px rgba(30,64,175,0.11),0 1.5px 4px rgba(30,64,175,0.03); overflow:hidden;
    }
    .header { padding:32px 24px 18px 24px; background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);
      color:#fff; text-align:center;
    }
    .header img { max-width:190px; margin:0 auto 10px; display:block;}
    .brandline { font-size:16px; font-weight:600; letter-spacing:0.08em; opacity:0.92;}
    .subject-blurb { margin:20px 24px 2px 24px; font-size:14px; color:#7c3aed;
      font-weight:600; letter-spacing:0.02em; opacity:0.93;
      background:#faf5ff; padding:6px 13px; border-radius:6px; display:inline-block;
    }
    .intro { margin:0 24px 10px 24px; padding:18px 0 2px 0; }
    .intro p { margin:0 0 3px 0; font-size:16px; color:#1e3a8a; }
    .main-paragraph {margin:0 24px 18px 24px; padding:18px; background:#fff; border-radius:7px; line-height:1.6;}
    .two-column { display:flex; gap:16px; margin:0 24px 18px 24px; }
    .column { flex:1; background:#f6f7fb; border-radius:8px; padding:16px;
      box-shadow:0 2px 8px rgba(30,64,175,0.06);
    }
    .column h4 { margin:0 0 12px 0; color:#7c3aed; font-size:15px; }
    .column ul { margin:0; padding:0; list-style:none; font-size:14px; }
    .column ul li { padding:4px 0; color:#22223b; }
    .alert-box { background:#fef3c7; border-left:4px solid #f59e0b;
      padding:14px 18px; margin:0 24px 18px 24px; border-radius:6px;
    }
    .alert-box p { margin:0; font-size:14px; color:#92400e; font-weight:600; }
    .cta-container { text-align:center; padding:22px 24px;
      background:#f3f8ff; border-radius:8px; margin:0 24px 18px 24px;
      box-shadow:0 2px 6px rgba(30,64,175,0.05);
    }
    .cta-btn { display:inline-block; padding:13px 36px; background:#10b981; color:#fff;
      border-radius:7px; font-weight:700; font-size:16px; text-decoration:none;
      box-shadow:0 2px 8px rgba(16,185,129,0.13); transition:background 0.18s;
    }
    .cta-btn:hover { background:#059669;}
    .signature { margin:15px 24px 22px 24px; font-size:15.3px; color:#1e40af;
      font-weight:500; padding:14px 0 0 0; border-top:1px solid #e9ebf3;
    }
    .footer { padding:22px 24px; color:#aaa; text-align:center; font-size:13px;
      background: #f1f5fa; border-bottom-left-radius:14px; border-bottom-right-radius:14px;
      letter-spacing:0.08em;
    }
    @media (max-width:650px){
      .two-column { flex-direction:column; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/687d6d9c6ea5d6db744563ee_clear%20logo.png" alt="Power Choosers">
      <div class="brandline">Your Energy Partner</div>
    </div>
    <div class="subject-blurb">Progress Update: ${company} Energy Analysis</div>
    <div class="intro">
      <p>Hi ${firstName},</p>
      <p>${data.progress_update || 'Following our initial conversation, I\'ve completed a market analysis for facilities in your area. The findings are compelling, and I wanted to share what we discovered.'}</p>
    </div>
    <div class="two-column">
      <div class="column">
        <h4>✓ Key Benefits</h4>
        <ul>
          ${valueProps.slice(0, Math.ceil(valueProps.length / 2)).map(prop => `<li>• ${prop}</li>`).join('')}
        </ul>
      </div>
      <div class="column">
        <h4>✓ Why Act Now</h4>
        <ul>
          ${valueProps.slice(Math.ceil(valueProps.length / 2)).map(prop => `<li>• ${prop}</li>`).join('')}
        </ul>
      </div>
    </div>
    <div class="alert-box">
      <p>⚠️ ${data.urgency_message || 'Market Update: Rates are climbing faster than expected'}</p>
    </div>
    <div class="cta-container">
      <a href="https://powerchoosers.com/schedule" class="cta-btn">${data.cta_text || 'Let\'s Continue the Conversation'}</a>
      <div style="margin-top:8px;font-size:14px;color:#1e3a8a;opacity:0.83;">
        Prefer a specific time? Just reply with your availability.
      </div>
    </div>
    <div class="signature">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
        ${s.avatar ? `<img src="${s.avatar}" alt="${s.name}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">` : ''}
        <div>
          <div style="font-weight: 600; font-size: 15px; color: #1e3a8a;">${s.name}</div>
          <div style="font-size: 13px; color: #1e40af; opacity: 0.9;">${s.title}</div>
        </div>
      </div>
      <div style="font-size: 14px; color: #1e40af; margin: 4px 0 0 0; line-height: 1.4;">
        ${s.location ? `<div style="margin: 0; line-height: 1.3;">${s.location}</div>` : ''}
        ${s.phone ? `<div style="margin: 2px 0 0 0; line-height: 1.3;">${s.phone}</div>` : ''}
        <div style="margin: 2px 0 0 0; line-height: 1.3;">${s.company}</div>
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

  function buildEnergyHealthHtml(data, recipient, fromEmail) {
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    const s = getSenderProfile();
    
    const assessmentItems = data.assessment_items || [
      'Current rate vs. market rates ($0.085/kWh benchmark)',
      'Contract expiration timeline',
      'Hidden charges and fees analysis',
      'Efficiency improvement opportunities'
    ];
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin:0; padding:0; background:#f1f5fa; font-family:'Segoe UI',Arial,sans-serif; color:#1e3a8a;}
    .container { max-width:600px; margin:30px auto; background:#fff; border-radius:14px;
      box-shadow:0 6px 28px rgba(30,64,175,0.11),0 1.5px 4px rgba(30,64,175,0.03); overflow:hidden;
    }
    .header { padding:32px 24px 18px 24px; background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);
      color:#fff; text-align:center;
    }
    .header img { max-width:190px; margin:0 auto 10px; display:block;}
    .brandline { font-size:16px; font-weight:600; letter-spacing:0.08em; opacity:0.92;}
    .subject-blurb { margin:20px 24px 2px 24px; font-size:14px; color:#0f766e;
      font-weight:600; letter-spacing:0.02em; opacity:0.93;
      background:#f0fdfa; padding:6px 13px; border-radius:6px; display:inline-block;
    }
    .intro { margin:0 24px 10px 24px; padding:18px 0 2px 0; }
    .intro p { margin:0 0 3px 0; font-size:16px; color:#1e3a8a; }
    .main-paragraph {margin:0 24px 18px 24px; padding:18px; background:#fff; border-radius:7px; line-height:1.6;}
    .info-list { background:#f0fdfa; border-radius:8px; border:1px solid #99f6e4;
      padding:16px 22px; margin:0 24px 18px 24px; box-shadow:0 2px 8px rgba(20,184,166,0.06);
      font-size:15.5px; color:#22223b;
    }
    .info-list h3 { margin:0 0 12px 0; color:#0f766e; font-size:16px; }
    .info-list ul {margin:0;padding:0;list-style:none;}
    .info-list ul li {padding:8px 12px; margin:6px 0; background:#fff; border-radius:6px; border-left:3px solid #14b8a6; box-shadow:0 1px 2px rgba(0,0,0,0.05);}
    .highlight-box { background:linear-gradient(135deg,#d1fae5 0%,#a7f3d0 100%);
      padding:16px 20px; margin:0 24px 18px 24px; border-radius:8px;
    }
    .highlight-box p { margin:0; color:#065f46; font-size:15px; }
    .highlight-box strong { color:#047857; }
    .cta-container { text-align:center; padding:22px 24px;
      background:#f0fdfa; border-radius:8px; margin:0 24px 18px 24px;
      box-shadow:0 2px 6px rgba(20,184,166,0.05);
    }
    .cta-btn { display:inline-block; padding:13px 36px; background:#14b8a6; color:#fff;
      border-radius:7px; font-weight:700; font-size:16px; text-decoration:none;
      box-shadow:0 2px 8px rgba(20,184,166,0.13); transition:background 0.18s;
    }
    .cta-btn:hover { background:#0d9488;}
    .signature { margin:15px 24px 22px 24px; font-size:15.3px; color:#1e40af;
      font-weight:500; padding:14px 0 0 0; border-top:1px solid #e9ebf3;
    }
    .footer { padding:22px 24px; color:#aaa; text-align:center; font-size:13px;
      background: #f1f5fa; border-bottom-left-radius:14px; border-bottom-right-radius:14px;
      letter-spacing:0.08em;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/687d6d9c6ea5d6db744563ee_clear%20logo.png" alt="Power Choosers">
      <div class="brandline">Your Energy Partner</div>
    </div>
    <div class="subject-blurb">⚡ Free Energy Health Check • No Obligation</div>
    <div class="intro">
      <p>Hi ${firstName},</p>
      <p>I wanted to share an opportunity for ${company} to get a comprehensive energy assessment at no cost. Our team will analyze your current energy profile and identify potential savings opportunities.</p>
    </div>
    <div class="main-paragraph">
      <p>${data.benefits || 'Our assessment typically uncovers <strong style="color:#14b8a6;">15-30% in cost reduction potential</strong> for facilities. We\'ll review your current rate structure, contract terms, and usage patterns to identify hidden charges and optimization opportunities.'}</p>
    </div>
    <div class="info-list">
      <h3>📋 What We'll Review</h3>
      <ul>
        ${assessmentItems.map(item => `<li>✓ ${item}</li>`).join('')}
      </ul>
    </div>
    <div class="highlight-box">
      <p>${data.contract_info || '<strong>Your Contract:</strong> Perfect timing for assessment'}</p>
    </div>
    <div class="cta-container">
      <a href="https://powerchoosers.com/schedule" class="cta-btn">${data.cta_text || 'Schedule Your Free Assessment'}</a>
      <div style="margin-top:8px;font-size:14px;color:#0f766e;opacity:0.83;">
        30-minute consultation • Zero pressure • Maximum insight
      </div>
    </div>
    <div class="signature">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
        ${s.avatar ? `<img src="${s.avatar}" alt="${s.name}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">` : ''}
        <div>
          <div style="font-weight: 600; font-size: 15px; color: #1e3a8a;">${s.name}</div>
          <div style="font-size: 13px; color: #1e40af; opacity: 0.9;">${s.title}</div>
        </div>
      </div>
      <div style="font-size: 14px; color: #1e40af; margin: 4px 0 0 0; line-height: 1.4;">
        ${s.location ? `<div style="margin: 0; line-height: 1.3;">${s.location}</div>` : ''}
        ${s.phone ? `<div style="margin: 2px 0 0 0; line-height: 1.3;">${s.phone}</div>` : ''}
        <div style="margin: 2px 0 0 0; line-height: 1.3;">${s.company}</div>
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

  function buildProposalHtml(data, recipient, fromEmail) {
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    const s = getSenderProfile();
    
    const timeline = data.timeline || [
      'Contract review and approval (24 Hours)',
      'Supplier onboarding and enrollment (30-45 days)',
      'Service activation (seamless transition)'
    ];
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin:0; padding:0; background:#f1f5fa; font-family:'Segoe UI',Arial,sans-serif; color:#1e3a8a;}
    .container { max-width:600px; margin:30px auto; background:#fff; border-radius:14px;
      box-shadow:0 6px 28px rgba(30,64,175,0.11),0 1.5px 4px rgba(30,64,175,0.03); overflow:hidden;
    }
    .header { padding:32px 24px 18px 24px; background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);
      color:#fff; text-align:center;
    }
    .header img { max-width:190px; margin:0 auto 10px; display:block;}
    .brandline { font-size:16px; font-weight:600; letter-spacing:0.08em; opacity:0.92;}
    .subject-blurb { margin:20px 24px 2px 24px; font-size:14px; color:#b45309;
      font-weight:600; letter-spacing:0.02em; opacity:0.93;
      background:#fef3c7; padding:6px 13px; border-radius:6px; display:inline-block;
    }
    .exclusive-badge { display:inline-block; background:#d97706; color:#fff;
      padding:3px 10px; border-radius:12px; font-size:11px; font-weight:700;
      letter-spacing:0.05em; margin-left:8px; vertical-align:middle;
    }
    .intro { margin:0 24px 10px 24px; padding:18px 0 2px 0; }
    .intro p { margin:0 0 3px 0; font-size:16px; color:#1e3a8a; }
    .main-paragraph {margin:0 24px 18px 24px; padding:18px; background:#fff; border-radius:7px; line-height:1.6;}
    .summary-box { background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);
      border:1px solid #fbbf24; padding:18px 20px; margin:0 24px 18px 24px;
      border-radius:8px; box-shadow:0 2px 8px rgba(245,158,11,0.08);
    }
    .summary-box h3 { margin:0 0 10px 0; color:#b45309; font-size:16px; }
    .summary-box p { margin:0; color:#1f2937; font-size:15px; line-height:1.5; }
    .pricing-highlight { background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);
      padding:20px; margin:0 24px 18px 24px; border-radius:8px;
      text-align:center; box-shadow:0 4px 12px rgba(245,158,11,0.3);
    }
    .pricing-highlight h3 { margin:0 0 10px 0; color:#fff; font-size:18px; text-shadow:0 2px 4px rgba(0,0,0,0.2); }
    .pricing-highlight p { margin:0; color:#fff; font-size:16px; font-weight:600; }
    .timeline-box { background:#fff; padding:18px 20px; margin:0 24px 18px 24px;
      border-radius:8px; border:1px solid #fbbf24; box-shadow:0 1px 3px rgba(0,0,0,0.05);
    }
    .timeline-box h3 { margin:0 0 15px 0; color:#b45309; font-size:16px; }
    .timeline-step { padding:12px; margin:8px 0; background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);
      border-radius:6px; border-left:4px solid #f59e0b;
    }
    .timeline-step p { margin:0; color:#1f2937; font-size:14px; }
    .timeline-step strong { color:#b45309; }
    .cta-container { text-align:center; padding:22px 24px;
      background:#fef3c7; border-radius:8px; margin:0 24px 18px 24px;
      box-shadow:0 2px 6px rgba(245,158,11,0.05);
    }
    .cta-btn { display:inline-block; padding:13px 36px; background:#f59e0b; color:#fff;
      border-radius:7px; font-weight:700; font-size:16px; text-decoration:none;
      box-shadow:0 2px 8px rgba(245,158,11,0.13); transition:background 0.18s;
    }
    .cta-btn:hover { background:#d97706;}
    .signature { margin:15px 24px 22px 24px; font-size:15.3px; color:#1e40af;
      font-weight:500; padding:14px 0 0 0; border-top:1px solid #e9ebf3;
    }
    .footer { padding:22px 24px; color:#aaa; text-align:center; font-size:13px;
      background: #f1f5fa; border-bottom-left-radius:14px; border-bottom-right-radius:14px;
      letter-spacing:0.08em;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/687d6d9c6ea5d6db744563ee_clear%20logo.png" alt="Power Choosers">
      <div class="brandline">Your Energy Partner</div>
    </div>
    <div class="subject-blurb">
      📄 Your Custom Proposal
      <span class="exclusive-badge">EXCLUSIVE</span>
    </div>
    <div class="intro">
      <p>Hi ${firstName},</p>
      <p>${data.proposal_summary || 'I\'m excited to share the custom energy proposal we\'ve prepared for ' + company + '. Based on your facility\'s profile and energy needs, we\'ve secured competitive rates from top-tier suppliers.'}</p>
    </div>
    <div class="summary-box">
      <h3>Proposal Summary</h3>
      <p>This proposal includes fixed-rate options that lock in significant savings, protecting you from projected rate increases.</p>
    </div>
    <div class="pricing-highlight">
      <h3>💰 Pricing Highlight</h3>
      <p>${data.pricing_highlight || 'Competitive rates below current market pricing'}</p>
    </div>
    <div class="timeline-box">
      <h3>📅 Implementation Timeline</h3>
      ${timeline.map((step, i) => `<div class="timeline-step"><p><strong>Step ${i+1}:</strong> ${step}</p></div>`).join('')}
    </div>
    <div class="main-paragraph">
      <p>Our team has negotiated these rates exclusively for your facility. The pricing is competitive, the transition is seamless, and you maintain complete control throughout the process. This is a <strong>time-sensitive offer</strong> as market conditions continue to shift.</p>
    </div>
    <div class="cta-container">
      <a href="https://powerchoosers.com/schedule" class="cta-btn">${data.cta_text || 'Let\'s Discuss Your Proposal'}</a>
      <div style="margin-top:8px;font-size:14px;color:#b45309;opacity:0.83;">
        Questions? I'm here to walk through every detail.
      </div>
    </div>
    <div class="signature">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
        ${s.avatar ? `<img src="${s.avatar}" alt="${s.name}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">` : ''}
        <div>
          <div style="font-weight: 600; font-size: 15px; color: #1e3a8a;">${s.name}</div>
          <div style="font-size: 13px; color: #1e40af; opacity: 0.9;">${s.title}</div>
        </div>
      </div>
      <div style="font-size: 14px; color: #1e40af; margin: 4px 0 0 0; line-height: 1.4;">
        ${s.location ? `<div style="margin: 0; line-height: 1.3;">${s.location}</div>` : ''}
        ${s.phone ? `<div style="margin: 2px 0 0 0; line-height: 1.3;">${s.phone}</div>` : ''}
        <div style="margin: 2px 0 0 0; line-height: 1.3;">${s.company}</div>
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

  function buildColdEmailHtml(data, recipient, fromEmail) {
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    const industry = recipient?.industry || recipient?.account?.industry || '';
    const s = getSenderProfile();
    
    // Get industry-specific value props if available
    const industryValueProps = getIndustryValueProps(industry, recipient?.title || recipient?.job);
    const valueProps = data.value_props || industryValueProps || [];
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin:0; padding:0; background:#f1f5fa; font-family:'Segoe UI',Arial,sans-serif; color:#1e3a8a;}
    .container { max-width:600px; margin:30px auto; background:#fff; border-radius:14px;
      box-shadow:0 6px 28px rgba(30,64,175,0.11),0 1.5px 4px rgba(30,64,175,0.03); overflow:hidden;
    }
    .header { padding:32px 24px 18px 24px; background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);
      color:#fff; text-align:center;
    }
    .header img { max-width:190px; margin:0 auto 10px; display:block;}
    .brandline { font-size:16px; font-weight:600; letter-spacing:0.08em; opacity:0.92;}
    .subject-blurb { margin:20px 24px 2px 24px; font-size:14px; color:#dc2626;
      font-weight:600; letter-spacing:0.02em; opacity:0.93;
      background:#fee2e2; padding:6px 13px; border-radius:6px; display:inline-block;
    }
    .intro { margin:0 24px 10px 24px; padding:18px 0 2px 0; }
    .intro p { margin:0 0 3px 0; font-size:16px; color:#1e3a8a; }
    .main-paragraph {margin:0 24px 18px 24px; padding:18px; background:#fff; border-radius:7px; line-height:1.6;}
    .challenges-box { background:linear-gradient(135deg,#fef2f2 0%,#fee2e2 100%);
      padding:18px 20px; margin:0 24px 18px 24px; border-radius:8px;
      border:1px solid #fca5a5; box-shadow:0 2px 8px rgba(239,68,68,0.06);
    }
    .challenges-box h3 { margin:0 0 12px 0; color:#b91c1c; font-size:16px; }
    .challenge-item { background:#fff; padding:10px 14px; margin:6px 0; border-radius:6px;
      box-shadow:0 1px 2px rgba(0,0,0,0.05); font-size:14px; color:#1f2937;
    }
    .solution-box { background:linear-gradient(135deg,#f0fdfa 0%,#ccfbf1 100%);
      border:1px solid #99f6e4; padding:18px 20px; margin:0 24px 18px 24px;
      border-radius:8px; box-shadow:0 2px 8px rgba(20,184,166,0.06);
    }
    .solution-box h3 { margin:0 0 10px 0; color:#0f766e; font-size:16px; }
    .solution-box p { margin:0; color:#1f2937; font-size:15px; line-height:1.5; }
    .social-proof { background:linear-gradient(135deg,#dbeafe 0%,#bfdbfe 100%);
      padding:14px 18px; margin:0 24px 18px 24px; border-radius:8px;
    }
    .social-proof p { margin:0; color:#1e40af; font-size:14px; font-style:italic; line-height:1.5; }
    .cta-container { text-align:center; padding:22px 24px;
      background:#fee2e2; border-radius:8px; margin:0 24px 18px 24px;
      box-shadow:0 2px 6px rgba(239,68,68,0.05);
    }
    .cta-btn { display:inline-block; padding:13px 36px; background:#ef4444; color:#fff;
      border-radius:7px; font-weight:700; font-size:16px; text-decoration:none;
      box-shadow:0 2px 8px rgba(239,68,68,0.13); transition:background 0.18s;
    }
    .cta-btn:hover { background:#dc2626;}
    .signature { margin:15px 24px 22px 24px; font-size:15.3px; color:#1e40af;
      font-weight:500; padding:14px 0 0 0; border-top:1px solid #e9ebf3;
    }
    .footer { padding:22px 24px; color:#aaa; text-align:center; font-size:13px;
      background: #f1f5fa; border-bottom-left-radius:14px; border-bottom-right-radius:14px;
      letter-spacing:0.08em;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/687d6d9c6ea5d6db744563ee_clear%20logo.png" alt="Power Choosers">
      <div class="brandline">Your Energy Partner</div>
    </div>
    <div class="subject-blurb">⚠️ Energy Costs Rising Fast</div>
    <div class="intro">
      <p>Hi ${firstName},</p>
      <p>${data.opening_hook || `I tried reaching you earlier but couldn't connect. I wanted to share some important information about energy cost trends that could significantly impact ${company}.`}</p>
    </div>
    <div class="solution-box">
      <h3>✓ How Power Choosers Helps</h3>
      <p>${data.value_proposition || (industry ? `Most ${industry} companies like ${company} see 10-20% savings through competitive procurement. The process is handled end-to-end—analyzing bills, negotiating with suppliers, and managing the switch. <strong>Zero cost to you.</strong>` : 'Most businesses see 10-20% savings through competitive procurement and efficiency solutions. The process is handled end-to-end—analyzing bills, negotiating with suppliers, and managing the switch. <strong>Zero cost to you.</strong>')}</p>
      ${valueProps.length > 0 ? `
      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #d1fae5;">
        <ul style="margin: 0; padding-left: 20px; list-style: none;">
          ${valueProps.slice(0, 3).map(prop => `<li style="padding: 4px 0; color: #1f2937; font-size: 14px;">• ${prop}</li>`).join('')}
        </ul>
      </div>` : ''}
    </div>
    ${data.social_proof_optional ? `<div class="social-proof"><p>${data.social_proof_optional}</p></div>` : ''}
    <div class="cta-container">
      <a href="https://powerchoosers.com/schedule" class="cta-btn">${data.cta_text || 'Explore Your Savings Potential'}</a>
      <div style="margin-top:8px;font-size:14px;color:#dc2626;opacity:0.83;">
        Quick 15-minute call to discuss your options—no obligation.
      </div>
    </div>
    <div class="signature">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
        ${s.avatar ? `<img src="${s.avatar}" alt="${s.name}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">` : ''}
        <div>
          <div style="font-weight: 600; font-size: 15px; color: #1e3a8a;">${s.name}</div>
          <div style="font-size: 13px; color: #1e40af; opacity: 0.9;">${s.title}</div>
        </div>
      </div>
      <div style="font-size: 14px; color: #1e40af; margin: 4px 0 0 0; line-height: 1.4;">
        ${s.location ? `<div style="margin: 0; line-height: 1.3;">${s.location}</div>` : ''}
        ${s.phone ? `<div style="margin: 2px 0 0 0; line-height: 1.3;">${s.phone}</div>` : ''}
        <div style="margin: 2px 0 0 0; line-height: 1.3;">${s.company}</div>
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

  function buildInvoiceHtml(data, recipient, fromEmail) {
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    const s = getSenderProfile();
    
    const checklistItems = data.checklist_items || [
      'Invoice date and service address',
      'Billing period (start and end dates)',
      'Detailed charge breakdown (kWh rate, demand charges, fees)',
      'Payment details and service address'
    ];
    
    const discrepancies = data.discrepancies || [
      'Above-market kWh rates',
      'Hidden demand charges',
      'Incorrect contract terms',
      'Billing errors and overcharges'
    ];
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin:0; padding:0; background:#f1f5fa; font-family:'Segoe UI',Arial,sans-serif; color:#1e3a8a;}
    .container { max-width:600px; margin:30px auto; background:#fff; border-radius:14px;
      box-shadow:0 6px 28px rgba(30,64,175,0.11),0 1.5px 4px rgba(30,64,175,0.03); overflow:hidden;
    }
    .header { padding:32px 24px 18px 24px; background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);
      color:#fff; text-align:center;
    }
    .header img { max-width:190px; margin:0 auto 10px; display:block;}
    .brandline { font-size:16px; font-weight:600; letter-spacing:0.08em; opacity:0.92;}
    .subject-blurb { margin:20px 24px 2px 24px; font-size:14px; color:#2563eb;
      font-weight:600; letter-spacing:0.02em; opacity:0.93;
      background:#f0f9ff; padding:6px 13px; border-radius:6px; display:inline-block;
    }
    .intro { margin:0 24px 10px 24px; padding:18px 0 2px 0; }
    .intro p { margin:0 0 3px 0; font-size:16px; color:#1e3a8a; }
    .key-points-box { background:linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%);
      border:1px solid #fbbf24; padding:20px 22px; margin:0 24px 18px 24px;
      border-radius:8px; box-shadow:0 1px 3px rgba(245,158,11,0.08);
    }
    .key-points-box h3 { margin:0 0 12px 0; color:#d97706; font-size:16px; font-weight:600;
      letter-spacing:0.02em;
    }
    .key-points-box p { margin:0; color:#1f2937; font-size:15.5px; line-height:1.6; font-weight:500; }
    .two-column-box { background:linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 100%);
      padding:20px; margin:0 24px 18px 24px; border-radius:8px;
      border:1px solid #bae6fd; box-shadow:0 2px 8px rgba(37,99,235,0.06);
    }
    .two-columns { display:flex; gap:20px; }
    .column { flex:1; }
    .column h3 { margin:0 0 12px 0; font-size:15px; }
    .column h3.review { color:#0369a1; }
    .column h3.discrepancies { color:#dc2626; }
    .column ul { margin:0; padding:0; list-style:none; }
    .column ul li { padding:4px 0; color:#1f2937; font-size:13px; line-height:1.5; }
    .urgency-banner { background:linear-gradient(135deg,#fee2e2 0%,#fecaca 100%);
      padding:16px 20px; margin:0 24px 18px 24px; border-radius:8px;
      border:1px solid #fca5a5; text-align:center;
    }
    .urgency-banner p { margin:0; color:#dc2626; font-size:16px; font-weight:600; }
    .cta-container { text-align:center; padding:22px 24px;
      background:#f0f9ff; border-radius:8px; margin:0 24px 18px 24px;
      box-shadow:0 2px 6px rgba(37,99,235,0.05);
    }
    .cta-btn { display:inline-block; padding:13px 36px; background:#2563eb; color:#fff;
      border-radius:7px; font-weight:700; font-size:16px; text-decoration:none;
      box-shadow:0 2px 8px rgba(37,99,235,0.13); transition:background 0.18s;
    }
    .cta-btn:hover { background:#1d4ed8;}
    .signature { margin:15px 24px 22px 24px; font-size:15.3px; color:#1e40af;
      font-weight:500; padding:14px 0 0 0; border-top:1px solid #e9ebf3;
    }
    .footer { padding:22px 24px; color:#aaa; text-align:center; font-size:13px;
      background: #f1f5fa; border-bottom-left-radius:14px; border-bottom-right-radius:14px;
      letter-spacing:0.08em;
    }
    @media (max-width:650px){
      .two-columns { flex-direction:column; gap:16px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/687d6d9c6ea5d6db744563ee_clear%20logo.png" alt="Power Choosers">
      <div class="brandline">Your Energy Partner</div>
    </div>
    <div class="subject-blurb">📎 Invoice Request for Energy Analysis</div>
    <div class="intro">
      <p>Hi ${firstName},</p>
      <p>${data.intro_paragraph || `As we discussed, we're conducting an energy analysis for ${company} to identify any discrepancies and determine how your facility is using energy. This will help us figure out the best plan moving forward.`}</p>
    </div>
    <div class="two-column-box">
      <div class="two-columns">
        <div class="column">
          <h3 class="review">✓ What We'll Review</h3>
          <ul>
            ${checklistItems.map(item => `<li>• ${item}</li>`).join('')}
          </ul>
        </div>
        <div class="column">
          <h3 class="discrepancies">⚠️ Common Discrepancies</h3>
          <ul>
            ${discrepancies.map(item => `<li>• ${item}</li>`).join('')}
          </ul>
        </div>
      </div>
    </div>
    <div class="urgency-banner">
      <p>⏰ ${data.deadline || 'Needed in 3 business days'}</p>
    </div>
    <div class="cta-container">
      <a href="https://powerchoosers.com/schedule" class="cta-btn">${data.cta_text || 'Schedule a Consultation'}</a>
      <div style="margin-top:8px;font-size:14px;color:#2563eb;opacity:0.83;">
        Or reply with your invoice attached—we'll get started right away.
      </div>
    </div>
    <div class="signature">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
        ${s.avatar ? `<img src="${s.avatar}" alt="${s.name}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">` : ''}
        <div>
          <div style="font-weight: 600; font-size: 15px; color: #1e3a8a;">${s.name}</div>
          <div style="font-size: 13px; color: #1e40af; opacity: 0.9;">${s.title}</div>
        </div>
      </div>
      <div style="font-size: 14px; color: #1e40af; margin: 4px 0 0 0; line-height: 1.4;">
        ${s.location ? `<div style="margin: 0; line-height: 1.3;">${s.location}</div>` : ''}
        ${s.phone ? `<div style="margin: 2px 0 0 0; line-height: 1.3;">${s.phone}</div>` : ''}
        <div style="margin: 2px 0 0 0; line-height: 1.3;">${s.company}</div>
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

  function buildGeneralHtml(data, recipient, fromEmail) {
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    const s = getSenderProfile();
    
    // Simplify subject for preview (remove sender name, keep first 50 chars)
    const simplifySubject = (subject) => {
      if (!subject) return `Energy Solutions for ${company}`;
      // Remove sender name pattern (e.g., "- Sean" or "- Lewis")
      let simplified = subject.replace(/\s*-\s*[A-Za-z]+$/, '').trim();
      // If still too long, truncate to 50 chars
      if (simplified.length > 50) {
        simplified = simplified.substring(0, 47) + '...';
      }
      return simplified || `Energy Solutions for ${company}`;
    };
    
    const displaySubject = simplifySubject(data.subject);
    
    const sections = data.sections || [
      'Most facilities see 10-20% savings when securing rates early, before typical renewal windows',
      'Supplier negotiations and contract reviews handled at no cost to you',
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
    .container { max-width:600px; margin:30px auto; background:#fff; border-radius:14px;
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
      <p>${data.opening_paragraph || `Been wondering—when does ${company}'s energy contract renew?`}</p>
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
        ${s.avatar ? `<img src="${s.avatar}" alt="${s.name}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">` : ''}
        <div>
          <div style="font-weight: 600; font-size: 15px; color: #1e3a8a;">${s.name}</div>
          <div style="font-size: 13px; color: #1e40af; opacity: 0.9;">${s.title}</div>
        </div>
      </div>
      <div style="font-size: 14px; color: #1e40af; margin: 4px 0 0 0; line-height: 1.4;">
        ${s.location ? `<div style="margin: 0; line-height: 1.3;">${s.location}</div>` : ''}
        ${s.phone ? `<div style="margin: 2px 0 0 0; line-height: 1.3;">${s.phone}</div>` : ''}
        <div style="margin: 2px 0 0 0; line-height: 1.3;">${s.company}</div>
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

  // ========== EMAIL FORMATTING FUNCTIONS ==========
  
  function wrapSonarHtmlWithBranding(sonarGeneratedHtml, recipient, subject) {
    const settings = (window.SettingsPage?.getSettings?.()) || {};
    const g = settings?.general || {};
    
    const senderFirstName = g.firstName || '';
    const senderLastName = g.lastName || '';
    const senderName = (senderFirstName && senderLastName) 
        ? `${senderFirstName} ${senderLastName}`.trim()
        : (g.agentName || 'Power Choosers Team');
    
    const senderEmail = g.email || 'l.patterson@powerchoosers.com';
    const senderPhone = g.phone || '';
    const senderTitle = g.jobTitle || 'Energy Strategist';
    const senderLocation = g.location || '';
    const senderCompany = g.companyName || 'Power Choosers';
    const senderAvatar = g.hostedPhotoURL || g.photoURL || '';
    
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto;">
        ${sonarGeneratedHtml}
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <div style="display:flex; gap:12px; align-items:flex-start;">
            ${senderAvatar ? `<img src="${senderAvatar}" alt="${senderName}" style="width:48px; height:48px; border-radius:50%; object-fit:cover; flex-shrink:0;">` : ''}
            <div style="flex:1;">
              <div style="font-weight: 600; font-size: 15px; color: #1e3a8a; margin: 0; line-height: 1.3;">
                ${senderName}
            </div>
              <div style="font-size: 13px; color: #1e40af; opacity: 0.9; margin: 2px 0; line-height: 1.3;">
                ${senderTitle}
              </div>
              <div style="font-size: 14px; color: #1e40af; margin: 4px 0 0 0; line-height: 1.4;">
                ${senderLocation ? `<div style="margin: 0; line-height: 1.3;">${senderLocation}</div>` : ''}
                ${senderPhone ? `<div style="margin: 2px 0 0 0; line-height: 1.3;">Phone: ${senderPhone}</div>` : ''}
                <div style="margin: 2px 0 0 0; line-height: 1.3;">Email: ${senderEmail}</div>
                <div style="margin: 2px 0 0 0; line-height: 1.3;">${senderCompany}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function improveSubject(subject, recipient) {
    try {
      const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || '';
      if (firstName && !subject.toLowerCase().includes(firstName.toLowerCase())) {
        return `${subject} - ${firstName}`;
      }
      return subject;
    } catch (e) {
      console.warn('[AI] improveSubject failed', e);
      return subject;
    }
  }

  function replaceVariablesInHtml(html, recipient) {
    try {
      const r = recipient || {};
      const contact = r;
      const account = r.account || {};
      
      // Get sender info from settings (like wrapSonarHtmlWithBranding does)
      const settings = (window.SettingsPage?.getSettings?.()) || {};
      const g = settings?.general || {};
      const senderFirstName = g.firstName || '';
      const senderLastName = g.lastName || '';
      const senderName = (senderFirstName && senderLastName) 
          ? `${senderFirstName} ${senderLastName}`.trim()
          : (g.agentName || 'Power Choosers Team');
      
      const sender = {
        first_name: senderFirstName,
        last_name: senderLastName,
        full_name: senderName,
        email: g.email || '',
        phone: g.phone || '',
        title: g.jobTitle || 'Energy Strategist',
        company: g.companyName || 'Power Choosers',
        location: g.location || ''
      };

      const get = (obj, key) => {
        const k = String(key || '').trim();
        const map = {
          first_name: (obj.firstName || (obj.name||'').split(' ')[0] || ''),
          last_name: (obj.lastName || (obj.name||'').split(' ').slice(1).join(' ') || ''),
          full_name: (obj.fullName || obj.name || [obj.firstName, obj.lastName].filter(Boolean).join(' ') || ''),
          title: (obj.title || obj.job || obj.role || obj.jobTitle || ''),
          email: (obj.email || ''),
          phone: (obj.phone || obj.mobile || ''),
          website: (obj.website || obj.domain || ''),
          name: (obj.name || obj.accountName || ''),
          industry: (obj.industry || ''),
          city: (obj.city || obj.billingCity || obj.locationCity || ''),
          state: (obj.state || obj.region || obj.billingState || ''),
          country: (obj.country || '')
        };
        return map.hasOwnProperty(k) ? (map[k] || '') : (obj[k] || '');
      };

      const senderCompanyName = g.companyName || 'Power Choosers';

      // Replace raw scoped tokens first ({{contact.*}}, {{account.*}}, {{sender.*}})
      let out = String(html || '')
        .replace(/\{\{\s*contact\.([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => escapeHtml(get(contact, k)))
        .replace(/\{\{\s*account\.([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => escapeHtml(get(account, k)))
        .replace(/\{\{\s*sender\.([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => escapeHtml(get(sender, k)));

      // Also replace common uppercase tokens used in example templates
      const contactName = (contact.fullName || contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim()) || '';
      const contactCompany = account.name || contact.company || '';
      out = out
        .replace(/\{\{\s*SENDER_AVATAR\s*\}\}/g, escapeHtml(g.hostedPhotoURL || g.photoURL || ''))
        .replace(/\{\{\s*SENDER_NAME\s*\}\}/g, escapeHtml(senderName))
        .replace(/\{\{\s*SENDER_TITLE\s*\}\}/g, escapeHtml(sender.title))
        .replace(/\{\{\s*SENDER_LOCATION\s*\}\}/g, escapeHtml(sender.location || g.location || ''))
        .replace(/\{\{\s*SENDER_PHONE\s*\}\}/g, escapeHtml(sender.phone || ''))
        .replace(/\{\{\s*SENDER_EMAIL\s*\}\}/g, escapeHtml(sender.email || ''))
        .replace(/\{\{\s*COMPANY_NAME\s*\}\}/g, escapeHtml(senderCompanyName))
        .replace(/\{\{\s*CONTACT_NAME\s*\}\}/g, escapeHtml(contactName))
        .replace(/\{\{\s*CONTACT_COMPANY\s*\}\}/g, escapeHtml(contactCompany));

      // Replace .var-chip elements if present
      const tmp = document.createElement('div');
      tmp.innerHTML = out;
      tmp.querySelectorAll('.var-chip').forEach(chip => {
        const dataVar = chip.getAttribute('data-var') || '';
        const m = dataVar.match(/^([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)$/);
        if (!m) { chip.replaceWith(document.createTextNode(chip.textContent||'')); return; }
        const scope = m[1];
        const key = m[2];
        let val = '';
        if (scope === 'contact') val = get(contact, key);
        else if (scope === 'account') val = get(account, key);
        else if (scope === 'sender') val = get(sender, key);
        chip.replaceWith(document.createTextNode(val || ''));
      });
      out = tmp.innerHTML;
      return out;
    } catch (e) {
      console.warn('[AI] replaceVariablesInHtml failed', e);
      return html;
    }
  }

  function formatTemplatedEmail(result, recipient, templateType) {
    try {
      console.log('[AI] Formatting templated email, type:', templateType);
      
      // Clean all string fields in result to remove citations
      if (result && typeof result === 'object') {
        Object.keys(result).forEach(key => {
          if (typeof result[key] === 'string') {
            result[key] = removeCitationBrackets(result[key]);
          } else if (Array.isArray(result[key])) {
            result[key] = result[key].map(item => 
              typeof item === 'string' ? removeCitationBrackets(item) : item
            );
          }
        });
      }
      
      // Extract data from JSON response
      const subject = result.subject || 'Energy Solutions';
      
      // Build template HTML using the appropriate builder
      let templateHtml = buildTemplateHtml(templateType, result, recipient);

      // Replace any template tokens (e.g., {{SENDER_AVATAR}}, {{CONTACT_NAME}})
      try {
        templateHtml = replaceVariablesInHtml(templateHtml, recipient);
      } catch (e) {
        console.warn('[AI] Token replacement failed (non-fatal):', e);
      }
      
      // IMPORTANT: Templates already include a hard-coded signature block.
      // Do NOT wrap with branding/signature to avoid duplication.
      console.log('[AI] Template email built successfully (no extra signature wrap)');
      
      return {
        subject: improveSubject(subject, recipient),
        html: templateHtml
      };
    } catch (error) {
      console.error('[AI] Error formatting templated email:', error);
      return {
        subject: 'Energy Solutions',
        html: '<p>Error generating email content.</p>'
      };
    }
  }

  /**
   * Extract signature from HTML using DOM parser (more reliable than regex)
   * Ported from emails.js lines 3077-3093
   */
  function extractSignature(html) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Look for signature div by multiple methods:
      // 1. Data attribute
      let sigDiv = doc.querySelector('[data-signature="true"]');
      
      // 2. Look for div with signature-like styling (check both inline and computed)
      if (!sigDiv) {
        sigDiv = Array.from(doc.querySelectorAll('div')).find(div => {
          const style = div.getAttribute('style') || '';
          // Check if style contains signature-like patterns
          return (style.includes('margin-top') && style.includes('padding-top') && style.includes('border-top')) ||
                 (style.includes('border-top: 1px solid'));
        });
      }
      
      // 3. Look for last div that contains typical signature content
      if (!sigDiv) {
        const allDivs = Array.from(doc.querySelectorAll('div'));
        sigDiv = allDivs.reverse().find(div => {
          const text = div.textContent.toLowerCase();
          return text.includes('energy strategist') || 
                 text.includes('power choosers') ||
                 (text.includes('phone:') && text.includes('email:'));
        });
      }
      
      return sigDiv ? sigDiv.outerHTML : null;
    } catch (e) {
      console.warn('[Email] extractSignature failed:', e);
      return null;
    }
  }

  /**
   * Preserve and restore signature after AI content insertion
   * Enhanced version from old emails.js lines 1120-1147
   */
  function preserveSignatureAfterAI(editor, aiContent) {
    if (!editor) return aiContent;
    
    try {
      // Extract existing signature BEFORE modifications
      const currentContent = editor.innerHTML;
      const signature = extractSignature(currentContent);
      
      console.log('[Signature] Current signature found:', signature ? 'YES' : 'NO');
      
      // Remove any existing signature from AI content using DOM parser
      let cleanHtml = aiContent;
      const aiSig = extractSignature(aiContent);
      if (aiSig) {
        console.log('[Signature] Removing signature from AI content');
        const parser = new DOMParser();
        const doc = parser.parseFromString(aiContent, 'text/html');
        const sigDiv = doc.querySelector('[data-signature="true"]') || 
                      Array.from(doc.querySelectorAll('div')).find(div => 
                        div.style.marginTop === '20px' && 
                        div.style.paddingTop === '20px'
                      );
        if (sigDiv) {
          sigDiv.remove();
          cleanHtml = doc.body.innerHTML;
        }
      }
      
      // Place signature after the AI content's closing
      let finalContent = cleanHtml;
      if (signature) {
        console.log('[Signature] Appending signature to AI content');
        // Always place signature at the very end, after any existing content
        finalContent = cleanHtml + signature;
      } else {
        console.log('[Signature] No signature to append');
      }
      
      return finalContent;
    } catch (e) {
      console.warn('[Signature] Failed to preserve signature:', e);
      return aiContent;
    }
  }

  function formatGeneratedEmail(result, recipient, mode) {
    try {
      console.log('[AI] Formatting generated email, mode:', mode);
      console.log('[AI] Raw result:', result);
      
      let subject = '';
      let body = '';
      
      // Try to parse as JSON first
      try {
        // 1) Strip code fences if present (```json ... ``` or ``` ... ```)
        let jsonText = String(result || '').trim()
          .replace(/^\s*```json\s*/i, '')
          .replace(/^\s*```\s*/i, '')
          .replace(/\s*```\s*$/i, '');

        // 2) Extract the first JSON object only (ignore any trailing notes)
        const match = jsonText.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('No JSON object found in response');
        jsonText = match[0];

        const jsonData = JSON.parse(jsonText);
        console.log('[AI] Parsed JSON successfully:', jsonData);

        // Clean all string fields in jsonData to remove citations
        Object.keys(jsonData).forEach(key => {
          if (typeof jsonData[key] === 'string') {
            jsonData[key] = removeCitationBrackets(jsonData[key]);
          } else if (Array.isArray(jsonData[key])) {
            jsonData[key] = jsonData[key].map(item => 
              typeof item === 'string' ? removeCitationBrackets(item) : item
            );
          }
        });

        subject = jsonData.subject || 'Energy Solutions';

        // Build body from JSON fields with proper paragraph structure
        const paragraphs = [];

        if (jsonData.greeting) {
          paragraphs.push(jsonData.greeting);
        }

        if (jsonData.paragraph1) {
          paragraphs.push(jsonData.paragraph1);
        }

        if (jsonData.paragraph2) {
          paragraphs.push(jsonData.paragraph2);
        }

        if (jsonData.paragraph3) {
          paragraphs.push(jsonData.paragraph3);
        }

        // Join paragraphs with double spacing
        body = paragraphs.join('\n\n');

        // Add closing as its OWN paragraph so it renders separately
        if (jsonData.closing) {
          // Ensure closing has proper line breaks (e.g., "Best regards,\nLewis")
          // Handle both escaped \n (from JSON) and actual newlines
          let closing = String(jsonData.closing || '');
          
          // CRITICAL FIX: Convert escaped \n (literal string "\\n") to actual newline first
          // This handles cases where Perplexity returns "Best regards,\nLewis" as escaped string
          closing = closing.replace(/\\n/g, '\n');
          
          // Handle different closing formats and ensure proper line break
          if (closing.includes('Best regards,')) {
            // Check if there's already a newline after the comma
            if (!closing.match(/Best regards,\s*\n/i)) {
            // Replace "Best regards, Name" with "Best regards,\nName"
            closing = closing.replace(/Best regards,\s*/i, 'Best regards,\n');
            }
          } else if (closing.includes('Sincerely,')) {
            if (!closing.match(/Sincerely,\s*\n/i)) {
            closing = closing.replace(/Sincerely,\s*/i, 'Sincerely,\n');
            }
          } else if (closing.includes('Regards,')) {
            if (!closing.match(/Regards,\s*\n/i)) {
            closing = closing.replace(/Regards,\s*/i, 'Regards,\n');
            }
          }
          
          body += '\n\n' + closing;
        }
        console.log('[AI] Built body from JSON:', body);

      } catch (jsonError) {
        console.log('[AI] Not JSON, falling back to text parsing');
        
        // Fallback to original text parsing
        const lines = result.split('\n');
        let inBody = false;
        
        for (const line of lines) {
          if (line.startsWith('Subject:')) {
            subject = removeCitationBrackets(line.replace('Subject:', '').trim());
          } else if (line.trim() === '') {
            inBody = true;
          } else if (inBody) {
            body += removeCitationBrackets(line) + '\n';
          }
        }
        
        // Clean the body
        body = removeCitationBrackets(body);
        
        // If no subject found, use a default
        if (!subject) {
          subject = 'Energy Solutions';
        }
      }
      
      // Convert body to HTML with proper paragraph spacing (emails.js approach)
      // Rebuild body and normalize paragraphs: ensure blank line between paragraphs
      const normalizedBody = body
        .trim()
        .split(/\n{2,}/)  // Split on 2+ newlines
        .map(p => {
          // Preserve bullet lists within a paragraph (lines starting with - or •)
          if (/^(\s*[•\-]\s+)/m.test(p)) {
            return String(p).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
          }
          // CRITICAL FIX: Preserve newlines in closing paragraphs (e.g., "Best regards,\nLewis")
          // Check if this paragraph contains closing signatures (with newline anywhere in it)
          const isClosing = /^(Best regards|Sincerely|Regards|Thanks|Thank you)/mi.test(p) && /\n/.test(p);
          if (isClosing) {
            // Preserve the newline structure in closing (don't convert \n to spaces)
            // This ensures "Best regards,\nLewis" stays as two lines
            return String(p).replace(/\r/g, '').trim();
          }
          // For regular paragraphs, convert single newlines to spaces
          return p.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
        })
        .filter(Boolean)
        .join('\n\n');

      // Build HTML paragraphs from normalized body
      const htmlBody = normalizedBody
        .split(/\n\n/)
        .map(p => p.trim())
        .filter(Boolean)
        .map(p => {
          // Check if it's a bullet paragraph
          if (/^(\s*[•\-]\s+)/m.test(p)) {
            // Build a list: optional header + bullet items
            const lines = String(p).replace(/\r/g, '').split(/\n+/).map(l => l.trim()).filter(Boolean);
            const items = [];
            const nonBullets = [];
            for (const l of lines) {
              if (/^(\s*[•\-]\s+)/.test(l)) {
                items.push(l.replace(/^(\s*[•\-]\s+)/, ''));
              } else {
                nonBullets.push(l);
              }
            }
            const header = nonBullets.length ? `<p style="margin: 0 0 8px 0;">${nonBullets.join(' ')}</p>` : '';
            const list = items.length
              ? `<ul style="margin: 0 0 16px 18px; padding: 0;">${items.map(i => `<li>${i}</li>`).join('')}</ul>`
              : '';
            return `${header}${list}`;
          } else {
            // Regular paragraph
            // Preserve single newlines inside a paragraph (e.g., closing: Best regards,\nLewis)
            const withLineBreaks = p.replace(/\n/g, '<br>');
            return `<p style="margin: 0 0 16px 0;">${withLineBreaks}</p>`;
          }
        })
        .join('');
      
      // Check mode: HTML uses profile branding, standard uses signature settings
      if (mode === 'html') {
        // HTML mode: Wrap with branding for profile-based signature
        const fullHtml = wrapSonarHtmlWithBranding(htmlBody, recipient, subject);
        
        return {
          subject: improveSubject(subject, recipient),
          html: fullHtml
        };
      } else {
        // Standard mode: Return content without branding so sendEmail() can append signature settings
        return {
          subject: improveSubject(subject, recipient),
          html: htmlBody
        };
      }
    } catch (error) {
      console.error('[AI] Error formatting generated email:', error);
      return {
        subject: 'Energy Solutions',
        html: '<p>Error generating email content.</p>'
      };
    }
  }

  function buildTemplateHtml(templateType, data, recipient) {
    const fromEmail = 'l.patterson@powerchoosers.com';
    
    switch (templateType) {
      case 'warm_intro':
        return buildWarmIntroHtml(data, recipient, fromEmail);
      case 'follow_up':
        return buildFollowUpHtml(data, recipient, fromEmail);
      case 'energy_health':
        return buildEnergyHealthHtml(data, recipient, fromEmail);
      case 'proposal':
        return buildProposalHtml(data, recipient, fromEmail);
      case 'cold_email':
        return buildColdEmailHtml(data, recipient, fromEmail);
      case 'invoice':
        return buildInvoiceHtml(data, recipient, fromEmail);
      case 'general':
        return buildGeneralHtml(data, recipient, fromEmail);
      default:
        return buildGeneralHtml(data, recipient, fromEmail);
    }
  }

  // ========== AI BUTTON HANDLER ==========
  
  function setupAIButtonHandler() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="ai"]')) {
        e.preventDefault();
        e.stopPropagation();
        
        const composeWindow = document.getElementById('compose-window');
        const aiBar = composeWindow?.querySelector('.ai-bar');
        
        if (aiBar) {
          // Initialize AI bar if not already rendered
          if (!aiBar.dataset.rendered) {
            renderAIBar(aiBar);
          }
          
          // Toggle AI bar
          const isOpen = aiBar.classList.toggle('open');
          aiBar.setAttribute('aria-hidden', String(!isOpen));
          
          console.log('[AI] AI bar toggled:', isOpen ? 'open' : 'closed');
        }
      }
    });
  }

  // ========== AI PANEL FUNCTIONS ==========
  
  /**
   * Opens the AI Panel, delegating to the main email manager if available.
   */
  function openAIPanel() {
    // Try to find the AI bar in any compose window
    const composeWindow = document.querySelector('#compose-window, .compose-window');
    const aiBar = composeWindow?.querySelector('.ai-bar');
    
    if (aiBar) {
      // Ensure AI bar is rendered before toggling
      if (!aiBar.dataset.rendered) {
        console.log('[EmailCompose] Rendering AI bar before toggle...');
        renderAIBar(aiBar);
      }
      
      const isOpen = aiBar.classList.toggle('open');
      aiBar.setAttribute('aria-hidden', String(!isOpen));
      console.log('[EmailCompose] Toggled AI bar directly. Open:', isOpen);
    } else {
      console.error('[EmailCompose] AI panel not found.');
    }
  }

  // ========== EMAIL SENDING FUNCTIONS ==========
  
  async function sendEmailViaSendGrid(emailData) {
    try {
      const { to, subject, content, from, fromName, _deliverability, threadId, inReplyTo, references, trackingMetadata, isHtmlEmail } = emailData;
      
      // Generate unique tracking ID for this email
      const trackingId = `sendgrid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Explicit boolean conversion - ensure it's always a boolean, never undefined
      const isHtmlEmailBoolean = Boolean(isHtmlEmail);
      
      console.log('[SendGrid] Email data received:', {
        isHtmlEmail: isHtmlEmailBoolean,
        contentLength: content.length,
        contentPreview: content.substring(0, 100) + '...',
        from: from || 'not set',
        fromName: fromName || 'not set'
      });
      
      // Prepare email data for SendGrid
      const emailPayload = {
        to: to,
        subject: subject,
        content: content,
        from: from,
        fromName: fromName,
        trackingId: trackingId,
        threadId: threadId,
        inReplyTo: inReplyTo,
        references: references,
        isHtmlEmail: isHtmlEmailBoolean, // Use explicit boolean, not || false
        _deliverability: _deliverability
      };
      
      // Send via SendGrid API
      const response = await fetch(`${window.API_BASE_URL}/api/email/sendgrid-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailPayload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send email via SendGrid');
      }

      const result = await response.json();
      console.log('[SendGrid] Email sent successfully:', result);
      
      // Store email record for tracking
      if (window.emailTrackingManager && result.trackingId) {
        const trackingEmailData = {
          id: result.trackingId,
          to: emailData.to,
          subject: emailData.subject,
          content: content,
          from: 'Lewis Patterson <noreply@powerchoosers.com>',
          provider: 'sendgrid',
          sentVia: 'sendgrid',
          sendgridMessageId: result.messageId, // SendGrid's x-message-id
          sentAt: new Date().toISOString(),
          threadId: threadId || null,
          inReplyTo: inReplyTo || null,
          references: Array.isArray(references) ? references : (references ? [references] : []),
          trackingMetadata: trackingMetadata || null
        };
        
        try {
          await window.emailTrackingManager.saveEmailRecord(trackingEmailData);
          console.log('[SendGrid] Email record saved to tracking system');
        } catch (trackingError) {
          console.warn('[SendGrid] Failed to save email record:', trackingError);
        }
      }
      
      return {
        success: true,
        trackingId: result.trackingId,
        messageId: result.trackingId,
        message: 'Email sent successfully via SendGrid'
      };

    } catch (error) {
      console.error('[SendGrid] Send error:', error);
      throw error;
    }
  }

  async function sendEmail() {
    const toInput = document.getElementById('compose-to');
    const subjectInput = document.getElementById('compose-subject');
    const bodyInput = document.querySelector('.body-input');
    
    const to = toInput?.value?.trim() || '';
    const subject = subjectInput?.value?.trim() || '';
    
    // Extract HTML content - handle iframe case for HTML templates
    let body = '';
    if (bodyInput) {
      // Check if HTML is rendered in an iframe (for HTML email templates)
      const iframe = bodyInput.querySelector('.html-email-iframe');
      if (iframe && iframe.srcdoc) {
        // Extract HTML from iframe's srcdoc attribute
        body = iframe.srcdoc;
        console.log('[EmailCompose] Extracted HTML from iframe srcdoc, length:', body.length);
      } else {
        // Standard case: get innerHTML directly
        body = bodyInput.innerHTML || '';
        console.log('[EmailCompose] Using innerHTML directly, length:', body.length);
      }
    }
    
    // Check attribute first, then detect HTML structure as fallback
    const hasHtmlAttribute = bodyInput?.getAttribute('data-html-email') === 'true';
    
    // More flexible HTML structure detection - check for common HTML email patterns
    const hasHtmlStructure = body && (
      body.includes('<!DOCTYPE html>') ||
      body.includes('<html') ||
      body.includes('<head>') ||
      body.includes('</head>') ||
      (body.includes('<style') && body.includes('</style>')) ||
      (body.includes('<div') && body.includes('class=') && body.includes('style=')) ||
      body.includes('class="header"') ||
      body.includes('class="email-template"') ||
      body.includes('class="container"') ||
      body.includes('font-family:') ||
      body.includes('max-width:') ||
      body.includes('background-color:') ||
      (body.includes('<table') && body.includes('style=')) // Common in HTML emails
    );
    
    // Explicit boolean conversion - prioritize attribute, then structure
    const isHtmlEmail = Boolean(hasHtmlAttribute || hasHtmlStructure);
    
    console.log('[EmailCompose] Email mode:', isHtmlEmail ? 'HTML Template' : 'Standard');
    console.log('[EmailCompose] Detection:', {hasHtmlAttribute, hasHtmlStructure});
    console.log('[EmailCompose] Content preview:', body.substring(0, 100) + '...');
    
    if (!to) {
      window.crm?.showToast('Please enter recipients');
      toInput?.focus();
      return;
    }
    
    if (!subject) {
      window.crm?.showToast('Please enter a subject');
      subjectInput?.focus();
      return;
    }
    
    if (!body) {
      window.crm?.showToast('Please enter email content');
      bodyInput?.focus();
      return;
    }

    try {
      // Get deliverability settings from settings.js
      const settings = (window.SettingsPage && window.SettingsPage.getSettings) ? window.SettingsPage.getSettings() : (JSON.parse(localStorage.getItem('crm-settings')||'{}'));
      const deliverRaw = settings?.emailDeliverability || {};
      
      // Map settings format to sendgrid-service format
      const deliver = {
        enableTracking: deliverRaw.enableTracking !== false && deliverRaw.enableClickTracking !== false,
        includeBulkHeaders: deliverRaw.includeBulkHeaders === true,
        includeListUnsubscribe: deliverRaw.includeListUnsubscribe !== false,
        includePriorityHeaders: deliverRaw.includePriorityHeaders === true,
        forceGmailOnly: false,
        useBrandedHtmlTemplate: deliverRaw.useBrandedHtmlTemplate === true,
        signatureImageEnabled: deliverRaw.signatureImageEnabled !== false
      };
      
      // Show sending state
      const sendButton = document.querySelector('#compose-send');
      if (sendButton) {
        sendButton.disabled = true;
        sendButton.textContent = 'Sending...';
      }

      // HTML emails: Use content as-is (has hardcoded signature from wrapSonarHtmlWithBranding)
      // Standard emails: Apply signature settings
      let contentWithSignature = body;
      
      if (isHtmlEmail) {
        // HTML email templates: Don't apply any signature settings
        // They have their own hardcoded signatures via wrapSonarHtmlWithBranding
        console.log('[Signature Debug] HTML email - skipping all signature settings');
        contentWithSignature = body;
      } else {
        // Standard email: Apply signature settings
        console.log('[Signature Debug] Standard email - applying signature settings');
        
        let preparedBody = body;
        
        // Optionally remove signature image if disabled (standard emails only)
        if (deliver.signatureImageEnabled === false) {
          preparedBody = preparedBody.replace(/<img[^>]*alt=\"Signature\"[\s\S]*?>/gi, '');
          console.log('[Signature Debug] Removed signature image (disabled in settings)');
        }

        // Check if signature is already in the body (prevent duplication)
        const signature = window.getEmailSignature ? window.getEmailSignature() : '';
        const hasSignature = preparedBody.includes('margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;');

        console.log('[Signature Debug] Signature retrieved:', signature ? 'YES' : 'NO', 'Length:', signature.length);
        console.log('[Signature Debug] hasSignature:', hasSignature);

        // Add signature if not already present
        if (!hasSignature) {
          let sig = signature;
          
          // If no signature from settings, build basic one
          if (!sig) {
            const settings = window.SettingsPage?.getSettings?.() || {};
            const general = settings.general || {};
            const name = (general.firstName && general.lastName) 
              ? `${general.firstName} ${general.lastName}`.trim()
              : (general.agentName || 'Power Choosers Team');
            
            sig = `<div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0; color: #666;">${name}</p>
              <p style="margin: 5px 0 0 0; color: #999; font-size: 14px;">Energy Strategist</p>
            </div>`;
            
            console.log('[Signature Debug] Using fallback signature');
          }
          
          if (sig) {
            console.log('[Signature Debug] Adding signature to email');
            contentWithSignature = preparedBody + sig;
          } else {
            contentWithSignature = preparedBody;
          }
        } else {
          console.log('[Signature Debug] Signature already present, not adding');
          contentWithSignature = preparedBody;
        }
      }

      // Get sender details from settings
      const senderProfile = getSenderProfile();
      const senderEmail = senderProfile.email || 'l.patterson@powerchoosers.com';
      let senderName = senderProfile.name;
      
      // Additional fallback: if name is still empty or "Power Choosers Team", try Firebase auth
      if (!senderName || senderName === 'Power Choosers Team') {
        try {
          const user = window.firebase?.auth?.().currentUser;
          if (user?.displayName) {
            senderName = user.displayName.trim();
            console.log('[EmailCompose] Using Firebase auth displayName as sender name:', senderName);
          }
        } catch (_) {}
        
        // Final fallback
        if (!senderName) {
          senderName = 'Power Choosers Team';
        }
      }
      
      // Debug logging to verify sender name
      console.log('[EmailCompose] Sender details:', {
        email: senderEmail,
        name: senderName,
        source: 'getSenderProfile + Firebase auth fallback'
      });

      const emailData = {
        to: to.split(',').map(email => email.trim()),
        subject,
        content: contentWithSignature,
        from: senderEmail,
        fromName: senderName,
        isHtmlEmail: Boolean(isHtmlEmail), // Explicit boolean conversion
        trackingMetadata: window._lastGeneratedMetadata || null
      };

      // Send via SendGrid
      let result;
      try {
        console.log('[EmailCompose] Sending via SendGrid with fromName:', senderName);
        result = await sendEmailViaSendGrid({ ...emailData, _deliverability: deliver });
        console.log('[EmailCompose] Email sent via SendGrid');
        
        // Track email performance if metadata is available
        if (window._lastGeneratedMetadata) {
          const trackingData = {
            emailId: result.trackingId || `email_${Date.now()}`,
            recipientEmail: to,
            subjectStyle: window._lastGeneratedMetadata.subject_style,
            ctaType: window._lastGeneratedMetadata.cta_type,
            openingStyle: window._lastGeneratedMetadata.opening_style,
            timestamp: new Date().toISOString(),
            event: 'sent'
          };
          
          // Send to tracking endpoint
          const baseUrl = window.API_BASE_URL || window.location.origin || '';
          fetch(`${baseUrl}/api/track-email-performance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(trackingData)
          }).catch(err => console.warn('[Tracking] Failed to log send event:', err));
          
          // Clear metadata after tracking
          window._lastGeneratedMetadata = null;
        }
      } catch (sendGridError) {
        console.error('[EmailCompose] SendGrid failed:', sendGridError);
        throw new Error(`Failed to send email: ${sendGridError.message}`);
      }
      
      // Close compose window on success
      closeComposeWindow();
      
      // Show success message
      window.crm?.showToast('Email sent successfully!');

    } catch (error) {
      console.error('[EmailCompose] Send email error:', error);
      window.crm?.showToast('Failed to send email: ' + error.message);
    } finally {
      // Reset send button
      const sendButton = document.querySelector('#compose-send');
      if (sendButton) {
        sendButton.disabled = false;
        sendButton.textContent = 'Send';
      }
    }
  }

  function closeComposeWindow() {
    const composeWindow = document.getElementById('compose-window');
    if (composeWindow) {
      composeWindow.classList.remove('open');
      setTimeout(() => {
        composeWindow.style.display = 'none';
        // Clear attachments when closing
        if (window.emailAttachments) {
          window.emailAttachments = [];
          updateAttachmentBadge();
        }
      }, 300);
    }
  }

  function setupSendButtonHandler() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('#compose-send')) {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('[EmailCompose] Send button clicked');
        sendEmail();
      }
    });
  }

  // ========== INITIALIZATION ==========
  
  // Setup AI functionality
  setupAIButtonHandler();
  
  // Setup send button functionality
  setupSendButtonHandler();

  console.log('[EmailCompose] Global module with AI and send functionality initialized');
})();
