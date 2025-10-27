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
  function handleToolbarAction(action, btn, editor, formattingBar, linkBar) {
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
          window.crm?.showToast('File attachment coming soon');
          break;
        }
        case 'code': {
          toggleHtmlMode(composeWindow);
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
    
    const isHidden = formattingBar.getAttribute('aria-hidden') === 'true';
    formattingBar.setAttribute('aria-hidden', !isHidden);
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
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.toolbar-btn');
        if (!btn) return;
        
        const action = btn.dataset.action;
        
        if (action === 'ai') {
          openAIPanel();
        } else if (action === 'formatting') {
          toggleFormattingBar();
        } else if (action === 'preview') {
          togglePreviewMode();
        }
        // Other toolbar actions can be added here
      });
      document._composeToolbarClickBound = true;
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
          try {
            // Insert single <br> for single spacing
            document.execCommand('insertHTML', false, '<br>');
            console.log('[Enter] Single line break inserted via execCommand');
          } catch (error) {
            console.error('[Enter] execCommand failed:', error);
            // Try alternative approach
            try {
              const selection = window.getSelection();
              const range = selection.getRangeAt(0);
              range.deleteContents();
              
              // Insert single <br> tag for single spacing
              const br = document.createElement('br');
              range.insertNode(br);
              
              // Move cursor after the break
              range.setStartAfter(br);
              range.collapse(true);
              selection.removeAllRanges();
              selection.addRange(range);
              console.log('[Enter] Single line break inserted via DOM manipulation');
            } catch (fallbackError) {
              console.error('[Enter] DOM manipulation also failed:', fallbackError);
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
    
    // Get custom prompts from settings (Phase 1 integration)
    const aiTemplates = getAITemplatesFromSettings();
    
    const suggestions = [
      { text: 'Warm intro after a call', prompt: aiTemplates.warm_intro, template: 'warm_intro' },
      { text: 'Follow-up with value props', prompt: aiTemplates.follow_up, template: 'follow_up' },
      { text: 'Energy Health Check', prompt: aiTemplates.energy_health, template: 'energy_health' },
      { text: 'Proposal delivery', prompt: aiTemplates.proposal, template: 'proposal' },
      { text: 'Cold email outreach', prompt: aiTemplates.cold_email, template: 'cold_email' },
      { text: 'Invoice request', prompt: aiTemplates.invoice, template: 'invoice' }
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

  // Helper function to get AI templates from settings
  function getAITemplatesFromSettings() {
    try {
      const settings = window.SettingsPage?.getSettings?.() || {};
      const aiTemplates = settings?.aiTemplates || {};
      
      return {
        warm_intro: aiTemplates.warm_intro || 'Warm intro after a call',
        follow_up: aiTemplates.follow_up || 'Follow-up with tailored value props',
        energy_health: aiTemplates.energy_health || 'Schedule an Energy Health Check',
        proposal: aiTemplates.proposal || 'Proposal delivery with next steps',
        cold_email: aiTemplates.cold_email || 'Cold email outreach to energy procurement decision maker',
        invoice: aiTemplates.invoice || 'Standard Invoice Request',
        who_we_are: aiTemplates.who_we_are || 'You are an Energy Strategist at Power Choosers, a company that helps businesses secure lower electricity and natural gas rates.',
        // NEW: Market Context
        marketContext: aiTemplates.marketContext || {
          enabled: true,
          rateIncrease: '15-25%',
          renewalYears: '2025-2026',
          earlyRenewalSavings: '20-30%',
          typicalClientSavings: '10-20%',
          marketInsights: 'due to data center demand'
        },
        // NEW: Meeting Preferences
        meetingPreferences: aiTemplates.meetingPreferences || {
          enabled: true,
          useHardcodedTimes: true,
          slot1Time: '2-3pm',
          slot2Time: '10-11am',
          callDuration: '15-minute',
          timeZone: 'EST'
        }
      };
    } catch (error) {
      console.warn('[AI] Error getting templates from settings:', error);
      return {
        warm_intro: 'Warm intro after a call',
        follow_up: 'Follow-up with tailored value props',
        energy_health: 'Schedule an Energy Health Check',
        proposal: 'Proposal delivery with next steps',
        cold_email: 'Cold email to a lead I could not reach by phone',
        invoice: 'Standard Invoice Request',
        who_we_are: 'You are an Energy Strategist at Power Choosers, a company that helps businesses secure lower electricity and natural gas rates.',
        marketContext: {
          enabled: true,
          rateIncrease: '15-25%',
          renewalYears: '2025-2026',
          earlyRenewalSavings: '20-30%',
          typicalClientSavings: '10-20%',
          marketInsights: 'due to data center demand'
        },
        meetingPreferences: {
          enabled: true,
          useHardcodedTimes: true,
          slot1Time: '2-3pm',
          slot2Time: '10-11am',
          callDuration: '15-minute',
          timeZone: 'EST'
        }
      };
    }
  }

  // Helper function to escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
          phone: person.phone || person.mobile || ''
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
          annualUsage: acct.annualUsage || '',
          electricitySupplier: acct.electricitySupplier || '',
          currentRate: acct.currentRate || '',
          contractEndDate: acct.contractEndDate || ''
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

      // Get sender name from settings
      const settings = (window.SettingsPage?.getSettings?.()) || {};
      const g = settings?.general || {};
      const senderName = (g.firstName && g.lastName) 
        ? `${g.firstName} ${g.lastName}`.trim()
        : (g.agentName || 'Power Choosers Team');

      // Get "who we are" information from settings
      const aiTemplates = getAITemplatesFromSettings();
      const whoWeAre = aiTemplates.who_we_are || 'You are an Energy Strategist at Power Choosers, a company that helps businesses secure lower electricity and natural gas rates.';

      // Call the API
      const response = await fetch(genUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          recipient: recipient,
          mode: mode,
          senderName: senderName,
          whoWeAre: whoWeAre,
          // NEW: Pass market context
          marketContext: aiTemplates.marketContext,
          // NEW: Pass meeting preferences
          meetingPreferences: aiTemplates.meetingPreferences
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
  
  // Build sender profile signature once for all HTML templates
  function getSenderProfile() {
    const settings = (window.SettingsPage?.getSettings?.()) || {};
    const g = settings?.general || {};
    const first = g.firstName || '';
    const last = g.lastName || '';
    const name = (first && last) ? `${first} ${last}`.trim() : (g.agentName || 'Power Choosers Team');
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
    
    return `
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
        <div style="display:flex; gap:12px; align-items:center;">
          ${s.avatar ? `<img src="${s.avatar}" alt="${s.name}" style="width:48px; height:48px; border-radius:50%; object-fit:cover;">` : ''}
          <div>
            <p style="margin: 0; font-size: 14px;">
              <strong>${s.name}</strong><br>
              ${s.title}<br>
              ${s.company}<br>
              ${s.location ? `${s.location}<br>` : ''}
              ${s.phone ? `Phone: ${s.phone}<br>` : ''}
              Email: ${s.email}
            </p>
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
      <a href="mailto:${s.email}" class="cta-btn">${data.cta_text || 'Schedule a Follow-Up Call'}</a>
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
      <div style="font-size: 14px; color: #1e40af; line-height: 1.5;">
        ${s.location ? `${s.location}<br>` : ''}
        ${s.phone ? `${s.phone}<br>` : ''}
        ${s.company}
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
      <a href="mailto:${s.email}" class="cta-btn">${data.cta_text || 'Let\'s Continue the Conversation'}</a>
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
      <div style="font-size: 14px; color: #1e40af; line-height: 1.5;">
        ${s.location ? `${s.location}<br>` : ''}
        ${s.phone ? `${s.phone}<br>` : ''}
        ${s.company}
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
      <a href="mailto:${s.email}" class="cta-btn">${data.cta_text || 'Schedule Your Free Assessment'}</a>
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
      <div style="font-size: 14px; color: #1e40af; line-height: 1.5;">
        ${s.location ? `${s.location}<br>` : ''}
        ${s.phone ? `${s.phone}<br>` : ''}
        ${s.company}
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
      <a href="mailto:${s.email}" class="cta-btn">${data.cta_text || 'Let\'s Discuss Your Proposal'}</a>
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
      <div style="font-size: 14px; color: #1e40af; line-height: 1.5;">
        ${s.location ? `${s.location}<br>` : ''}
        ${s.phone ? `${s.phone}<br>` : ''}
        ${s.company}
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
      <p>${data.value_proposition || 'We help businesses like yours reduce energy costs through competitive procurement and efficiency solutions. Our team handles the entire process—analyzing bills, negotiating with suppliers, and managing the switch. <strong>Zero cost to you.</strong>'}</p>
    </div>
    ${data.social_proof_optional ? `<div class="social-proof"><p>${data.social_proof_optional}</p></div>` : ''}
    <div class="cta-container">
      <a href="mailto:${s.email}" class="cta-btn">${data.cta_text || 'Explore Your Savings Potential'}</a>
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
      <div style="font-size: 14px; color: #1e40af; line-height: 1.5;">
        ${s.location ? `${s.location}<br>` : ''}
        ${s.phone ? `${s.phone}<br>` : ''}
        ${s.company}
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
      <a href="mailto:${s.email}" class="cta-btn">${data.cta_text || 'Reply with Invoice Attached'}</a>
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
      <div style="font-size: 14px; color: #1e40af; line-height: 1.5;">
        ${s.location ? `${s.location}<br>` : ''}
        ${s.phone ? `${s.phone}<br>` : ''}
        ${s.company}
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
    <div class="subject-blurb">Energy Solutions for ${company}</div>
    <div class="intro">
      <p>Hi ${firstName},</p>
      <p>I wanted to reach out about an interesting opportunity for ${company}.</p>
    </div>
    <div class="info-list">
      <strong>${data.list_header || 'How We Can Help:'}</strong>
      <ul>
        ${sections.map(section => `<li>${section}</li>`).join('')}
      </ul>
    </div>
    <div class="cta-container">
      <a href="mailto:${s.email}" class="cta-btn">${data.cta_text || 'Schedule A Meeting'}</a>
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
      <div style="font-size: 14px; color: #1e40af; line-height: 1.5;">
        ${s.location ? `${s.location}<br>` : ''}
        ${s.phone ? `${s.phone}<br>` : ''}
        ${s.company}
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
          <div style="display:flex; gap:12px; align-items:center;">
            ${senderAvatar ? `<img src="${senderAvatar}" alt="${senderName}" style="width:48px; height:48px; border-radius:50%; object-fit:cover;">` : ''}
            <div>
              <p style="margin: 0; font-size: 14px;">
                <strong>${senderName}</strong><br>
                ${senderTitle}<br>
                ${senderCompany}<br>
                ${senderLocation ? `${senderLocation}<br>` : ''}
                ${senderPhone ? `Phone: ${senderPhone}<br>` : ''}
                Email: ${senderEmail}
              </p>
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
          // If AI returns "Best regards, Lewis" on one line, split it
          let closing = jsonData.closing;
          
          // Handle different closing formats and ensure proper line break
          if (closing.includes('Best regards,') && !closing.includes('\n')) {
            // Replace "Best regards, Name" with "Best regards,\nName"
            closing = closing.replace(/Best regards,\s*/i, 'Best regards,\n');
          } else if (closing.includes('Sincerely,') && !closing.includes('\n')) {
            closing = closing.replace(/Sincerely,\s*/i, 'Sincerely,\n');
          } else if (closing.includes('Regards,') && !closing.includes('\n')) {
            closing = closing.replace(/Regards,\s*/i, 'Regards,\n');
          } else if (closing.includes('Best regards,') && closing.includes('\\n')) {
            // Handle escaped newline \\n from API (convert to actual newline)
            closing = closing.replace(/\\n/g, '\n');
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
            subject = line.replace('Subject:', '').trim();
          } else if (line.trim() === '') {
            inBody = true;
          } else if (inBody) {
            body += line + '\n';
          }
        }
        
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

  // ========== EMAIL SENDING FUNCTIONS ==========
  
  async function sendEmailViaSendGrid(emailData) {
    try {
      const { to, subject, content, _deliverability, threadId, inReplyTo, references, trackingMetadata } = emailData;
      
      // Generate unique tracking ID for this email
      const trackingId = `sendgrid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Prepare email data for SendGrid
      const emailPayload = {
        to: to,
        subject: subject,
        content: content,
        trackingId: trackingId,
        threadId: threadId,
        inReplyTo: inReplyTo,
        references: references,
        isHtmlEmail: emailData.isHtmlEmail || false,
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
    
    // Detect if this is an HTML email template (full HTML with styling)
    const isHtmlEmail = bodyInput?.getAttribute('data-html-email') === 'true';
    const body = bodyInput?.innerHTML || '';
    
    console.log('[EmailCompose] Email mode:', isHtmlEmail ? 'HTML Template' : 'Standard');
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
      const deliver = settings?.emailDeliverability || {};
      
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

      const emailData = {
        to: to.split(',').map(email => email.trim()),
        subject,
        content: contentWithSignature,
        isHtmlEmail: isHtmlEmail,
        trackingMetadata: window._lastGeneratedMetadata || null
      };

      // Send via SendGrid
      let result;
      try {
        console.log('[EmailCompose] Sending via SendGrid...');
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
          fetch('/api/track-email-performance', {
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
