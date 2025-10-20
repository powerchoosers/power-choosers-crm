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
        const toInput = document.getElementById('compose-to');
        const subjectInput = document.getElementById('compose-subject');
        
        console.log('[EmailCompose] Subject field value after opening:', subjectInput?.value);
        
        if (toInput) {
          toInput.value = toEmail;
        }
        
        // Ensure subject is empty for new emails
        if (subjectInput && subjectInput.value.includes('Re:')) {
          console.log('[EmailCompose] Clearing Re: prefix from subject');
          subjectInput.value = '';
          }
          
          // Focus the To input
          setTimeout(() => toInput.focus(), 100);
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
        
        // Close compose window
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

  // Handle image upload
  function handleImageUpload(editor) {
    window.crm?.showToast('Image upload coming soon');
  }

  // Toggle HTML mode
  function toggleHtmlMode(composeWindow) {
    const editor = composeWindow.querySelector('.body-input');
    if (!editor) return;
    
    const isHtmlMode = editor.getAttribute('data-mode') === 'html';
    if (isHtmlMode) {
      // Switch to text mode
      editor.setAttribute('data-mode', 'text');
      editor.setAttribute('contenteditable', 'true');
      editor.innerHTML = editor.textContent || '';
    } else {
      // Switch to HTML mode
      editor.setAttribute('data-mode', 'html');
      editor.setAttribute('contenteditable', 'true');
      const htmlContent = editor.innerHTML;
      editor.textContent = htmlContent;
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
    
    // Toolbar button clicks
    toolbar?.addEventListener('click', (e) => {
      const btn = e.target.closest('.toolbar-btn');
      if (!btn) return;
      
      const action = btn.getAttribute('data-action');
      console.log('🔧 Toolbar action:', action);
      
      if (typeof handleToolbarAction === 'function') {
        handleToolbarAction(action, btn, editor, formattingBar, linkBar);
      }
    });
    
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
          
          // Check if cursor is at or near signature boundary
          const selection = window.getSelection();
          if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const isNearSignature = isCursorNearSignature(editor, range);
            if (isNearSignature) {
              console.log('[Enter] Cursor near signature - preventing edit');
              return;
            }
          }
          
          // Simple approach: just insert a line break
          try {
            document.execCommand('insertHTML', false, '<br>');
            console.log('[Enter] Line break inserted via execCommand');
          } catch (error) {
            console.error('[Enter] execCommand failed:', error);
            // Try alternative approach
            try {
              const br = document.createElement('br');
              const selection = window.getSelection();
              const range = selection.getRangeAt(0);
              range.deleteContents();
              range.insertNode(br);
              range.setStartAfter(br);
              range.collapse(true);
              selection.removeAllRanges();
              selection.addRange(range);
              console.log('[Enter] Line break inserted via DOM manipulation');
            } catch (fallbackError) {
              console.error('[Enter] DOM manipulation also failed:', fallbackError);
            }
          }
        }
      }
    });
    
    document._emailComposeEnterHandlerBound = true;
  }
  
  // Helper function to check if cursor is near signature
  function isCursorNearSignature(editor, range) {
    // Check if cursor is near signature boundary to prevent editing into signature area
    const signatureElements = editor.querySelectorAll('[data-signature], .signature, .email-signature');
    if (signatureElements.length === 0) return false;
    
    for (const signature of signatureElements) {
      const signatureRange = document.createRange();
      signatureRange.selectNode(signature);
      
      // Check if cursor is within 50px of signature
      const cursorRect = range.getBoundingClientRect();
      const signatureRect = signatureRange.getBoundingClientRect();
      
      if (Math.abs(cursorRect.top - signatureRect.top) < 50) {
        return true;
      }
    }
    return false;
  }
  
  // Initialize the Enter key handler
  setupComposeEnterKeyHandler();

  // ========== AI GENERATION ANIMATION FUNCTIONS ==========
  
  function startGeneratingAnimation(composeWindow) {
    const subjectInput = composeWindow?.querySelector('#compose-subject');
    const bodyInput = composeWindow?.querySelector('.body-input');
    
    // Add glow effect and skeleton to subject input
    if (subjectInput) {
      subjectInput.classList.add('compose-generating');
      createSkeletonInField(subjectInput, 'subject');
    }
    
    // Add glow effect and skeleton to body input
    if (bodyInput) {
      bodyInput.classList.add('compose-generating');
      createSkeletonInField(bodyInput, 'body');
    }
    
    console.log('[AI Animation] Started generating animation in input fields');
  }
  
  function stopGeneratingAnimation(composeWindow) {
    const subjectInput = composeWindow?.querySelector('#compose-subject');
    const bodyInput = composeWindow?.querySelector('.body-input');
    
    // Remove glow effect and skeleton from subject input
    if (subjectInput) {
      subjectInput.classList.remove('compose-generating');
      removeSkeletonFromField(subjectInput);
    }
    
    // Remove glow effect and skeleton from body input
    if (bodyInput) {
      bodyInput.classList.remove('compose-generating');
      removeSkeletonFromField(bodyInput);
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
    
    // Start the generation animation
    startGeneratingAnimation(compose);
    const subjectInput = compose?.querySelector('#compose-subject');
    
    if (!editor) return;

    // Close AI bar immediately
    if (aiBar) {
      aiBar.classList.remove('open');
      aiBar.setAttribute('aria-hidden', 'true');
    }

    // Start generating animation
    startGeneratingAnimation(compose);
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
        // For HTML content, render it directly with a simple fade-in
        setTimeout(() => {
          // Preserve signature before AI content insertion (emails.js approach)
          const contentWithSignature = preserveSignatureAfterAI(editor, html);
          
          editor.innerHTML = contentWithSignature;
          // Mark editor mode for proper signature handling
          if (templateType) {
            editor.setAttribute('data-mode', 'html');
          } else {
            editor.removeAttribute('data-mode');
          }
          editor.style.opacity = '0';
          editor.style.transform = 'translateY(10px)';
          editor.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
          
          // Trigger the animation
          setTimeout(() => {
            editor.style.opacity = '1';
            editor.style.transform = 'translateY(0)';
          }, 50);
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
  
  function buildWarmIntroHtml(data, recipient, fromEmail) {
    const mail = fromEmail || 'l.patterson@powerchoosers.com';
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hi ${firstName},</p>
        
        <p>${data.call_reference || 'Thank you for taking the time to speak with me today.'}</p>
        
        <p>${data.main_message || 'I wanted to follow up on our conversation about your energy needs and how Power Choosers can help optimize your costs.'}</p>
        
        <p>${data.cta_text || 'Would you be available for a brief call this week to discuss next steps?'}</p>
        
        <p>Best regards,<br>
        Power Choosers Team</p>
      </div>
    `;
  }

  function buildFollowUpHtml(data, recipient, fromEmail) {
    const mail = fromEmail || 'l.patterson@powerchoosers.com';
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    
    const valueProps = data.value_props || [
      'Lower electricity rates through competitive procurement',
      'Expert market analysis and timing recommendations',
      'Ongoing monitoring of your energy portfolio',
      'Transparent pricing with no hidden fees'
    ];
    
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hi ${firstName},</p>
        
        <p>${data.progress_update || 'I wanted to follow up on our previous conversation about optimizing your energy costs.'}</p>
        
        <p>Here's how we can help ${company}:</p>
        <ul>
          ${valueProps.map(prop => `<li>${prop}</li>`).join('')}
        </ul>
        
        <p>${data.urgency_message || 'With energy markets showing volatility, now is an ideal time to secure favorable rates.'}</p>
        
        <p>${data.cta_text || 'Would you be interested in scheduling a brief call to discuss your specific situation?'}</p>
        
        <p>Best regards,<br>
        Power Choosers Team</p>
      </div>
    `;
  }

  function buildEnergyHealthHtml(data, recipient, fromEmail) {
    const mail = fromEmail || 'l.patterson@powerchoosers.com';
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    
    const assessmentItems = data.assessment_items || [
      'Current rate analysis and market comparison',
      'Contract terms and renewal timing',
      'Usage patterns and optimization opportunities',
      'Potential savings calculations'
    ];
    
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hi ${firstName},</p>
        
        <p>I'd like to offer ${company} a complimentary Energy Health Check to ensure you're getting the best value from your current energy setup.</p>
        
        <p>During this assessment, we'll review:</p>
        <ul>
          ${assessmentItems.map(item => `<li>${item}</li>`).join('')}
        </ul>
        
        <p>${data.contract_info || 'This is especially valuable as your current contract approaches renewal.'}</p>
        
        <p>${data.benefits || 'You\'ll receive a detailed report with specific recommendations and potential savings opportunities.'}</p>
        
        <p>${data.cta_text || 'Would you be available for a 30-minute call this week to conduct this assessment?'}</p>
        
        <p>Best regards,<br>
        Power Choosers Team</p>
      </div>
    `;
  }

  function buildProposalHtml(data, recipient, fromEmail) {
    const mail = fromEmail || 'l.patterson@powerchoosers.com';
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    
    const timeline = data.timeline || [
      'Contract review and market analysis',
      'Rate negotiation with suppliers',
      'Proposal presentation and review',
      'Implementation and monitoring setup'
    ];
    
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hi ${firstName},</p>
        
        <p>${data.proposal_summary || 'I\'m pleased to present our proposal for optimizing your energy procurement strategy.'}</p>
        
        <p>${data.pricing_highlight || 'Based on current market conditions, we can secure rates that represent significant savings compared to your current arrangement.'}</p>
        
        <p>Our implementation timeline:</p>
        <ol>
          ${timeline.map(step => `<li>${step}</li>`).join('')}
        </ol>
        
        <p>${data.cta_text || 'I\'d like to schedule a call to walk through the proposal details and answer any questions you may have.'}</p>
        
        <p>Best regards,<br>
        Power Choosers Team</p>
      </div>
    `;
  }

  function buildColdEmailHtml(data, recipient, fromEmail) {
    const mail = fromEmail || 'l.patterson@powerchoosers.com';
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hi ${firstName},</p>
        
        <p>${data.opening_hook || `${company} likely faces the same energy cost challenges as other businesses in your industry.`}</p>
        
        <p>${data.value_proposition || 'Power Choosers helps companies like yours secure better energy rates through competitive procurement and market expertise.'}</p>
        
        ${data.social_proof_optional ? `<p>${data.social_proof_optional}</p>` : ''}
        
        <p>${data.cta_text || 'Would you be open to a brief conversation about your current energy situation?'}</p>
        
        <p>Best regards,<br>
        Power Choosers Team</p>
      </div>
    `;
  }

  function buildInvoiceHtml(data, recipient, fromEmail) {
    const mail = fromEmail || 'l.patterson@powerchoosers.com';
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    
    const checklistItems = data.checklist_items || [
      'Invoice date and service address',
      'Billing period (start and end dates)',
      'Detailed charge breakdown',
      'Payment details and terms'
    ];
    
    const discrepancies = data.discrepancies || [
      'High delivery charges',
      'Incorrect rate classifications',
      'Hidden fees or surcharges',
      'Poor contract terms'
    ];
    
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hi ${firstName},</p>
        
        <p>${data.intro_paragraph || `As we discussed, I'll conduct a comprehensive energy analysis for ${company} to identify potential cost savings and optimization opportunities.`}</p>
        
        <p>To get started, I'll need to review your most recent energy invoice. Here's what I'll be looking for:</p>
        <ul>
          ${checklistItems.map(item => `<li>${item}</li>`).join('')}
        </ul>
        
        <p>Common issues I typically find include:</p>
        <ul>
          ${discrepancies.map(item => `<li>${item}</li>`).join('')}
        </ul>
        
        <p>${data.deadline || 'Please send the invoice by end of day so I can begin the analysis.'}</p>
        
        <p>${data.cta_text || 'Will you be able to send over the invoice by end of day so me and my team can get started?'}</p>
        
        <p>Best regards,<br>
        Power Choosers Team</p>
      </div>
    `;
  }

  function buildGeneralHtml(data, recipient, fromEmail) {
    const mail = fromEmail || 'l.patterson@powerchoosers.com';
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    
    const sections = data.sections || [
      'We help businesses optimize their energy procurement',
      'Our expertise can identify significant cost savings',
      'We provide ongoing monitoring and support'
    ];
    
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hi ${firstName},</p>
        
        <p>${data.list_header || 'How We Can Help:'}</p>
        <ul>
          ${sections.map(section => `<li>${section}</li>`).join('')}
        </ul>
        
        <p>${data.cta_text || 'I\'d love to discuss how we can help optimize your energy costs.'}</p>
        
        <p>Best regards,<br>
        Power Choosers Team</p>
      </div>
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
    
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto;">
        ${sonarGeneratedHtml}
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="margin: 0; font-size: 14px;">
            <strong>${senderName}</strong><br>
            ${senderTitle}<br>
            Power Choosers<br>
            ${senderLocation ? `${senderLocation}<br>` : ''}
            ${senderPhone ? `Phone: ${senderPhone}<br>` : ''}
            Email: ${senderEmail}
          </p>
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
        company: g.companyName || 'Power Choosers'
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

      // Replace raw tokens first
      let out = String(html || '')
        .replace(/\{\{\s*contact\.([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => escapeHtml(get(contact, k)))
        .replace(/\{\{\s*account\.([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => escapeHtml(get(account, k)))
        .replace(/\{\{\s*sender\.([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => escapeHtml(get(sender, k)));

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
      const templateHtml = buildTemplateHtml(templateType, result, recipient);
      
      // Wrap with branding (header + footer)
      const fullHtml = wrapSonarHtmlWithBranding(templateHtml, recipient, subject);
      
      console.log('[AI] Template email built successfully');
      
      return {
        subject: improveSubject(subject, recipient),
        html: fullHtml
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
      // Look for signature div by data attribute or style pattern
      const sigDiv = doc.querySelector('[data-signature="true"]') || 
                    Array.from(doc.querySelectorAll('div')).find(div => 
                      div.style.marginTop === '20px' && 
                      div.style.paddingTop === '20px' && 
                      (div.style.borderTop && div.style.borderTop.includes('1px solid'))
                    );
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

        // Join paragraphs with double spacing, but handle closing specially
        body = paragraphs.join('\n\n');

        // Add closing with single line break (not double spacing)
        if (jsonData.closing) {
          body += '\n' + jsonData.closing;
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
            return `<p style="margin: 0 0 16px 0;">${p}</p>`;
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
    
    // Detect HTML mode and extract content appropriately
    const isHtmlMode = bodyInput?.getAttribute('data-mode') === 'html';
    const body = isHtmlMode ? 
      (bodyInput?.textContent || '') :  // HTML mode: get raw HTML code
      (bodyInput?.innerHTML || '');     // Text mode: get rendered HTML
    
    console.log('[EmailCompose] Email mode:', isHtmlMode ? 'HTML' : 'Text');
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

      // Optionally remove signature image if disabled
      let preparedBody = body;
      if (deliver.signatureImageEnabled === false) {
        preparedBody = preparedBody.replace(/<img[^>]*alt=\"Signature\"[\s\S]*?>/gi, '');
      }

      // Check if signature is already in the body (prevent duplication)
      const signature = window.getEmailSignature ? window.getEmailSignature() : '';
      const hasSignature = preparedBody.includes('margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;');

      // Debug signature retrieval
      console.log('[Signature Debug] Signature retrieved:', signature ? 'YES' : 'NO', 'Length:', signature.length);
      console.log('[Signature Debug] isHtmlMode:', isHtmlMode);
      console.log('[Signature Debug] hasSignature:', hasSignature);
      console.log('[Signature Debug] preparedBody length:', preparedBody.length);

      // Only add signature for standard mode (non-HTML AI emails)
      // HTML templates have their own hardcoded signatures via wrapSonarHtmlWithBranding
      let contentWithSignature = preparedBody;
      if (!isHtmlMode && !hasSignature) {
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
        }
      } else {
        console.log('[Signature Debug] NOT adding signature. Reasons:', {
          isHtmlMode,
          hasSignature,
          hasSignatureFunction: !!window.getEmailSignature,
          signatureEmpty: !signature
        });
      }

      const emailData = {
        to: to.split(',').map(email => email.trim()),
        subject,
        content: contentWithSignature,
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
