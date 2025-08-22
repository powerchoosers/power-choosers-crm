(function () {
  'use strict';

  // Notes Widget for Contact Detail
  // Exposes: window.Widgets.openNotes(contactId)
  if (!window.Widgets) window.Widgets = {};

  const WIDGET_ID = 'notes-widget';
  let unsub = null; // Firestore unsubscribe for realtime listener
  let currentContactId = null;
  let autosaveTimer = null;
  let suppressRemoteWhileFocused = false;
  let lastRemoteText = '';

  function getPanelContentEl() {
    const panel = document.getElementById('widget-panel');
    if (!panel) return null;
    const content = panel.querySelector('.widget-content');
    return content || panel;
  }

  function removeExistingWidget() {
    try { if (typeof unsub === 'function') { unsub(); } } catch (_) { /* noop */ }
    unsub = null;
    const existing = document.getElementById(WIDGET_ID);
    // Remove any one-time preload listener attached to the previous card
    if (existing && existing._onPreloaded) {
      try { document.removeEventListener('pc:notes-preloaded', existing._onPreloaded); } catch (_) { /* noop */ }
      try { existing._onPreloaded = null; } catch (_) { /* noop */ }
    }
    if (existing && existing.parentElement) existing.parentElement.removeChild(existing);
  }

  function closeNotesWidget() {
    // Unsubscribe first
    try { if (typeof unsub === 'function') { unsub(); } } catch (_) { /* noop */ }
    unsub = null;
    const card = document.getElementById(WIDGET_ID);
    if (!card) return;
    // Clean up one-time preload listener if present
    if (card && card._onPreloaded) {
      try { document.removeEventListener('pc:notes-preloaded', card._onPreloaded); } catch (_) { /* noop */ }
      try { card._onPreloaded = null; } catch (_) { /* noop */ }
    }
    const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduce) {
      if (card.parentElement) card.parentElement.removeChild(card);
      return;
    }
    // Prepare collapse animation from current height and paddings
    const cs = window.getComputedStyle(card);
    const pt = parseFloat(cs.paddingTop) || 0;
    const pb = parseFloat(cs.paddingBottom) || 0;
    const start = card.scrollHeight; // includes padding
    card.style.overflow = 'hidden';
    card.style.height = start + 'px';
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
    // Force reflow
    void card.offsetHeight;
    card.style.transition = 'height 360ms ease-out, opacity 360ms ease-out, transform 360ms ease-out, padding-top 360ms ease-out, padding-bottom 360ms ease-out';
    card.style.height = '0px';
    card.style.paddingTop = '0px';
    card.style.paddingBottom = '0px';
    card.style.opacity = '0';
    card.style.transform = 'translateY(-6px)';
    const pending = new Set(['height', 'padding-top', 'padding-bottom']);
    const onEnd = (e) => {
      if (!e) return;
      if (pending.has(e.propertyName)) pending.delete(e.propertyName);
      if (pending.size > 0) return;
      card.removeEventListener('transitionend', onEnd);
      if (card.parentElement) card.parentElement.removeChild(card);
    };
    card.addEventListener('transitionend', onEnd);
  }

  function makeCard(contactId) {
    const card = document.createElement('div');
    card.className = 'widget-card notes-card';
    card.id = WIDGET_ID;

    card.innerHTML = `
      <div class="widget-card-header">
        <h4 class="widget-title">Notes</h4>
        <button type="button" class="btn-text notes-close" title="Close" aria-label="Close">×</button>
      </div>
      <div class="notes-body">
        <textarea class="textarea-dark notes-textarea" style="min-height: 220px; resize: vertical; padding: 10px; line-height: 1.4;" placeholder="Write notes for this"></textarea>
        <div class="notes-footer" style="display:flex; align-items:center; justify-content:space-between; gap: 12px;">
          <div class="notes-status" aria-live="polite" style="font-size: 12px; color: var(--text-muted);">Ready</div>
          <div class="notes-actions" style="display:flex; gap: 8px;">
            <button type="button" class="btn-secondary notes-clear">Clear</button>
            <button type="button" class="btn-primary notes-save">Save</button>
          </div>
        </div>
      </div>
    `;

    // Wire events
    const textarea = card.querySelector('.notes-textarea');
    const saveBtn = card.querySelector('.notes-save');
    const clearBtn = card.querySelector('.notes-clear');
    const closeBtn = card.querySelector('.notes-close');
    const statusEl = card.querySelector('.notes-status');
    const titleEl = card.querySelector('.widget-title');

    const setStatus = (txt) => { if (statusEl) statusEl.textContent = txt; };

    // Pre-populate from any preloaded cache
    try {
      const cached = window._preloadedNotes && window._preloadedNotes[String(contactId)];
      if (cached && textarea && !textarea.value) {
        textarea.value = cached.text || '';
        lastRemoteText = textarea.value;
        setStatus('Loaded');
      }
    } catch (_) { /* noop */ }

    // Listen once for late-arriving preload for this contact
    const onPreloaded = (e) => {
      try {
        if (!e || !e.detail || String(e.detail.id) !== String(contactId)) return;
        if (!textarea || document.activeElement === textarea) return;
        if (!textarea.value) {
          textarea.value = e.detail.text || '';
          lastRemoteText = textarea.value;
          setStatus('Loaded');
        }
      } catch (_) { /* noop */ }
      try { document.removeEventListener('pc:notes-preloaded', onPreloaded); } catch (_) { /* noop */ }
    };
    try { document.addEventListener('pc:notes-preloaded', onPreloaded); card._onPreloaded = onPreloaded; } catch (_) { /* noop */ }

    // Focus ring preference: subtle orange glow on focus
    if (textarea) {
      textarea.addEventListener('focus', () => textarea.classList.add('focus-orange'));
      textarea.addEventListener('blur', () => textarea.classList.remove('focus-orange'));
      textarea.addEventListener('focus', () => { suppressRemoteWhileFocused = true; });
      textarea.addEventListener('blur', () => { setTimeout(() => { suppressRemoteWhileFocused = false; }, 50); });
    }

    const saveNow = async () => {
      if (!currentContactId) return;
      const db = window.firebaseDB;
      const fv = window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue;
      if (!db) {
        try { window.crm?.showToast && window.crm.showToast('Firestore not initialized'); } catch (_) {}
        return;
      }
      const text = (textarea && textarea.value != null) ? String(textarea.value) : '';
      setStatus('Saving...');
      try {
        const ref = db.collection('contacts').doc(currentContactId);
        const payload = { notes: text, notesUpdatedAt: fv && typeof fv.serverTimestamp === 'function' ? fv.serverTimestamp() : Date.now() };
        await ref.set(payload, { merge: true });
        lastRemoteText = text;
        const ts = new Date();
        // American 12-hour time with AM/PM
        const timeStr = ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        setStatus(`Saved ${timeStr}`);
      } catch (err) {
        console.error('Save notes failed', err);
        setStatus('Save failed');
        try { window.crm?.showToast && window.crm.showToast('Failed to save notes'); } catch (_) {}
      }
    };

    const debouncedSave = () => {
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(saveNow, 800);
    };

    if (textarea) textarea.addEventListener('input', () => { setStatus('Editing...'); debouncedSave(); });
    if (saveBtn) saveBtn.addEventListener('click', () => saveNow());

    if (clearBtn) clearBtn.addEventListener('click', async () => {
      if (!textarea) return;
      const prev = textarea.value;
      textarea.value = '';
      await saveNow();
      try { window.crm?.showToast && window.crm.showToast('Cleared'); } catch (_) {}
      // Keep lastRemoteText in sync
      lastRemoteText = '';
    });

    if (closeBtn) closeBtn.addEventListener('click', () => {
      closeNotesWidget();
    });

    // Helper to compute and set dynamic title + placeholder
    const updateMeta = (data) => {
      if (!textarea || !titleEl) return;
      const first = (data.firstName || '').toString().trim();
      const last = (data.lastName || '').toString().trim();
      const name = (data.name || '').toString().trim();
      // Consider multiple possible fields for company label
      const company = (data.companyName || data.company || data.accountName || '').toString().trim();
      // Title: prefer first name explicitly
      const displayFirst = first || (name ? name.split(' ')[0] : '') || '';
      let ttl = 'Notes';
      if (displayFirst && company) ttl = `Notes for ${displayFirst} at ${company}`;
      else if (displayFirst) ttl = `Notes for ${displayFirst}`;
      else if (company) ttl = `Notes for ${company}`;
      titleEl.textContent = ttl;
      // Placeholder
      const base = (last || first || name || 'this contact').toString().trim();
      const firstToken = base.split(/\s+/)[0] || base;
      const placeholderName = firstToken.toLowerCase();
      textarea.placeholder = `Write notes for ${placeholderName}`;
    };

    // Immediately try to set meta from local data (People page cache) before Firestore returns
    try {
      if (typeof window.getPeopleData === 'function') {
        const people = window.getPeopleData() || [];
        const local = people.find(p => String(p.id || '') === String(contactId));
        if (local) updateMeta(local);
      }
    } catch (_) { /* noop */ }
    // Retry shortly after mount in case the cache populates a moment later
    setTimeout(() => {
      try {
        if (typeof window.getPeopleData === 'function') {
          const people = window.getPeopleData() || [];
          const local = people.find(p => String(p.id || '') === String(contactId));
          if (local) updateMeta(local);
        }
      } catch (_) { /* noop */ }
    }, 250);

    // Subscribe to Firestore realtime updates for this contact's notes and metadata
    subscribeToContact(contactId, textarea, setStatus, updateMeta);

    return card;
  }

  function subscribeToContact(contactId, textarea, setStatus, updateMeta) {
    const db = window.firebaseDB;
    if (!db || !contactId) return;
    try { if (typeof unsub === 'function') { unsub(); } } catch (_) { /* noop */ }

    const ref = db.collection('contacts').doc(contactId);
    unsub = ref.onSnapshot((snap) => {
      const data = snap && snap.exists ? (snap.data() || {}) : {};
      // Always attempt to update the meta immediately with whatever we have
      try { typeof updateMeta === 'function' && updateMeta(data); } catch (_) {}

      // If company not present, try to resolve it from accounts by id or by name
      const rawCompany = (data.companyName || data.accountName || data.company || '').toString().trim();
      const accountId = (data.accountId || data.account_id || '').toString().trim();
      const applyResolved = (companyName) => {
        if (!companyName) return;
        try { typeof updateMeta === 'function' && updateMeta({ ...data, companyName }); } catch (_) {}
      };
      if (!rawCompany && accountId) {
        try {
          db.collection('accounts').doc(accountId).get().then((doc) => {
            const acc = doc && doc.exists ? (doc.data() || {}) : {};
            const companyName = (acc.accountName || acc.name || acc.companyName || acc.company || '').toString().trim();
            applyResolved(companyName);
          }).catch(() => {});
        } catch (_) { /* noop */ }
      } else if (!rawCompany) {
        // As a fallback, try to match by name from any globally cached accounts list
        try {
          const getAccounts = (typeof window.getAccountsData === 'function') ? window.getAccountsData : null;
          if (getAccounts) {
            const accounts = getAccounts() || [];
            const key = (data.accountName || data.companyName || data.company || '').toString().trim().toLowerCase();
            if (key) {
              const match = accounts.find((a) => {
                const nm = (a.accountName || a.name || a.companyName || '').toString().trim().toLowerCase();
                return nm === key;
              });
              if (match) {
                const companyName = (match.accountName || match.name || match.companyName || '').toString().trim();
                applyResolved(companyName);
              }
            }
          }
        } catch (_) { /* noop */ }
      }

      const incoming = (data.notes == null ? '' : String(data.notes));
      // If user is actively editing, avoid clobbering their text unless remote is meaningfully different and user isn't focused
      const isFocused = textarea && (document.activeElement === textarea);
      if (!textarea) return;
      if (isFocused) {
        // Only update status to indicate presence of remote changes if differs
        if (incoming !== textarea.value) setStatus && setStatus('Remote update available');
        return;
      }
      if (incoming !== textarea.value) {
        textarea.value = incoming;
        lastRemoteText = incoming;
        setStatus && setStatus('Synced');
      }
    }, (err) => {
      console.warn('Notes listener error', err);
      setStatus && setStatus('Realtime disabled');
    });
  }

  function openNotes(contactId) {
    currentContactId = contactId;
    const content = getPanelContentEl();
    if (!content) {
      try { window.crm?.showToast && window.crm.showToast('Widget panel not found'); } catch (_) {}
      return;
    }
    if (!contactId) {
      try { window.crm?.showToast && window.crm.showToast('No contact selected'); } catch (_) {}
      return;
    }

    // Mount widget at the top of the panel content
    removeExistingWidget();
    const card = makeCard(contactId);

    // Smooth expand-in animation that pushes other widgets down
    const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReduce) {
      try { card.classList.add('notes-anim'); } catch (_) {}
      // Prevent flash before we collapse and read paddings after insertion
      card.style.opacity = '0';
      card.style.transform = 'translateY(-6px)';
    }

    if (content.firstChild) content.insertBefore(card, content.firstChild);
    else content.appendChild(card);

    if (!prefersReduce) {
      // Collapse now that it's in the DOM, and store paddings
      const cs = window.getComputedStyle(card);
      const pt = parseFloat(cs.paddingTop) || 0;
      const pb = parseFloat(cs.paddingBottom) || 0;
      card.dataset._pt = String(pt);
      card.dataset._pb = String(pb);
      card.style.overflow = 'hidden';
      card.style.height = '0px';
      card.style.paddingTop = '0px';
      card.style.paddingBottom = '0px';

      // Next frame: expand to natural height + paddings
      requestAnimationFrame(() => {
        // scrollHeight here is content height because padding is 0; don't add padding to height to avoid double-count
        const target = card.scrollHeight;
        card.style.transition = 'height 360ms ease-out, opacity 360ms ease-out, transform 360ms ease-out, padding-top 360ms ease-out, padding-bottom 360ms ease-out';
        card.style.height = target + 'px';
        card.style.paddingTop = pt + 'px';
        card.style.paddingBottom = pb + 'px';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
        const pending = new Set(['height', 'padding-top', 'padding-bottom']);
        const onEnd = (e) => {
          if (!e) return;
          if (pending.has(e.propertyName)) pending.delete(e.propertyName);
          if (pending.size > 0) return;
          card.removeEventListener('transitionend', onEnd);
          // Cleanup inline styles so the card behaves normally
          card.style.transition = '';
          card.style.height = '';
          card.style.overflow = '';
          card.style.opacity = '';
          card.style.transform = '';
          card.style.paddingTop = '';
          card.style.paddingBottom = '';
          try { delete card.dataset._pt; delete card.dataset._pb; } catch (_) {}
          try { card.classList.remove('notes-anim'); } catch (_) {}
        };
        card.addEventListener('transitionend', onEnd);
      });
    }

    // Bring panel into view
    try {
      const panel = document.getElementById('widget-panel');
      if (panel) panel.scrollTop = 0;
    } catch (_) { /* noop */ }

    try { window.crm?.showToast && window.crm.showToast('Notes opened'); } catch (_) {}
  }

  window.Widgets.openNotes = openNotes;
  // Expose close and is-open helpers for toggle behavior
  window.Widgets.closeNotes = closeNotesWidget;
  window.Widgets.isNotesOpen = function () { return !!document.getElementById(WIDGET_ID); };

})();
