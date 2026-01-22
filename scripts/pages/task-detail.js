'use strict';

// Task Detail Page - Individual task pages with widgets and navigation
(function () {
  const state = {
    currentTask: null,
    taskType: null,
    contact: null,
    account: null,
    navigating: false,
    loadingTask: false, // CRITICAL FIX: Guard against concurrent loadTaskData calls
    _openTaskId: null,
    _openTaskAt: 0,
    _loadToken: 0,
    _activeLoadToken: 0,
    _activeTaskId: null,
    _contactListMemberships: {}, // NEW: Map of contactId -> list names
    _contactSequenceMemberships: {}, // NEW: Map of contactId -> sequence names
    widgets: {
      maps: null,
      energy: null,
      notes: null
    }
  };

  const els = {};

  function queueClassWhenVisible(targetEl, className, delayMs = 0) {
    try {
      const start = performance.now();
      const tick = () => {
        try {
          const page = els.page || document.getElementById('task-detail-page');
          if (!page || !targetEl || !targetEl.isConnected) return;
          const display = window.getComputedStyle(page).display;
          if (display !== 'none') {
            const apply = () => {
              try { void targetEl.offsetHeight; } catch (_) { }
              try { targetEl.classList.add(className); } catch (_) { }
            };
            if (delayMs > 0) setTimeout(apply, delayMs);
            else {
              // Double RAF to ensure initial state (opacity: 0) is painted before transition starts
              requestAnimationFrame(() => requestAnimationFrame(apply));
            }
            return;
          }
        } catch (_) { }

        if (performance.now() - start < 1200) requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    } catch (_) { }
  }

  function runWhenTaskDetailVisible(fn, maxWaitMs = 1200) {
    try {
      const start = performance.now();
      const tick = () => {
        try {
          const page = els.page || document.getElementById('task-detail-page');
          if (!page) return;
          const display = window.getComputedStyle(page).display;
          if (display !== 'none') {
            try { fn(); } catch (_) { }
            return;
          }
        } catch (_) { }

        if (performance.now() - start < maxWaitMs) requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    } catch (_) { }
  }

  function cleanupExistingAvatarsAndIcons() {
    try {
      const el = els.page || document.getElementById('task-detail-page');
      if (!el) return;
      const profileContainer = el.querySelector('.contact-header-profile');
      if (!profileContainer) return;

      const toRemove = profileContainer.querySelectorAll('.avatar-circle-small, .company-logo-header, .company-favicon-header, .td-header-skel-icon');
      toRemove.forEach(n => { try { n.remove(); } catch (_) { } });
    } catch (_) { }
  }

  function markTaskLoading() {
    const el = els.page;
    if (!el) return;
    el.classList.add('task-loading');
    el.classList.remove('task-loaded');
    el.classList.remove('task-fading-out');

    try {
      injectTaskDetailStyles();
    } catch (_) { }

    try {
      const profileContainer = el.querySelector('.contact-header-profile');
      if (profileContainer) {
        // CRITICAL FIX: Clean up any existing icons/avatars BEFORE adding skeleton
        // This prevents the old task's icon from persisting next to the skeleton
        cleanupExistingAvatarsAndIcons();

        const existingSkel = profileContainer.querySelector('.td-header-skel-icon');
        if (!existingSkel) {
          const skel = document.createElement('div');
          skel.className = 'td-header-skel-icon skeleton-shimmer-modern';
          skel.innerHTML = '<div class="skeleton-shape td-header-icon-shape"></div>';
          profileContainer.prepend(skel);
        }
      }

      if (els.title) {
        // Ensure the title element itself doesn't have the shimmer class
        els.title.classList.remove('skeleton-shimmer-modern');
        els.title.innerHTML = '<div class="task-detail-title-skeleton skeleton-shimmer-modern"><div class="skeleton-shape td-title-shape"></div></div>';
      }
      if (els.subtitle) {
        const existingInfo = el.querySelector('#task-contact-info');
        if (existingInfo) existingInfo.remove();

        const titleSection = el.querySelector('.contact-header-text');
        if (titleSection) {
          const info = document.createElement('div');
          info.id = 'task-contact-info';
          info.className = 'task-contact-info skeleton-shimmer-modern';
          info.innerHTML = '<div class="skeleton-shape td-contactinfo-shape"></div>';
          titleSection.insertBefore(info, els.subtitle);
        }

        els.subtitle.innerHTML = '<div class="task-detail-subtitle-skeleton skeleton-shimmer-modern"><div class="skeleton-shape td-subtitle-shape"></div></div>';
      }
      if (els.content) {
        // [Transition Fix] Prevent duplicate skeletons if already loading
        if (els.content.querySelector('.td-skeleton-layer')) {
          return;
        }

        // [Transition Fix] Handle existing content for smooth cross-fade
        const oldRealLayer = els.content.querySelector('.td-real-layer');
        if (oldRealLayer) {
          oldRealLayer.classList.remove('td-real-layer');
          oldRealLayer.classList.add('td-old-layer');
          oldRealLayer.style.pointerEvents = 'none';
          // Force reflow before transition if needed, but we want immediate fade out
          requestAnimationFrame(() => {
            oldRealLayer.style.opacity = '0';
          });
          setTimeout(() => {
            try { oldRealLayer.remove(); } catch (_) { }
          }, 200);
        } else {
          // If no real layer, clear anything else that might be there
          // but we want to avoid wiping if we just handled the layer
          if (!els.content.querySelector('.td-old-layer')) {
            els.content.innerHTML = '';
          }
        }

        const skelHtml = `
          <div class="main-content">
            <div class="task-card td-loading-card" id="task-action-card-skeleton">
              <h3 class="section-title"><span class="td-skel td-skel-title"></span></h3>
              <div class="linkedin-task-info">
                <div class="info-item">
                  <label>Contact</label>
                  <div class="info-value"><span class="td-skel td-skel-value td-w-60"></span></div>
                </div>
                <div class="info-item">
                  <label>Company</label>
                  <div class="info-value"><span class="td-skel td-skel-value td-w-55"></span></div>
                </div>
              </div>
              <div class="form-row">
                <label>Notes</label>
                <div class="td-skel td-skel-textarea"></div>
              </div>
              <div class="actions">
                <button class="btn-primary" disabled><span class="td-skel td-skel-btn"></span></button>
                <button class="btn-secondary" disabled><span class="td-skel td-skel-btn"></span></button>
              </div>
              <div class="linkedin-guidance">
                <p>
                  <span class="td-skel td-skel-line"></span>
                  <span class="td-skel td-skel-line"></span>
                  <span class="td-skel td-skel-line td-short"></span>
                </p>
              </div>
            </div>

            <div class="company-summary-card td-loading-card">
              <div class="company-summary-header">
                <div class="company-logo"><span class="td-skel td-skel-logo"></span></div>
                <div class="company-name"><span class="td-skel td-skel-title td-w-70"></span></div>
              </div>
              <div class="company-details">
                <div class="company-detail-item">
                  <span class="detail-label">Location:</span>
                  <span class="detail-value"><span class="td-skel td-skel-value td-w-65"></span></span>
                </div>
                <div class="company-detail-item">
                  <span class="detail-label">Industry:</span>
                  <span class="detail-value"><span class="td-skel td-skel-value td-w-55"></span></span>
                </div>
              </div>
              <div class="company-description">
                <div class="td-skel td-skel-line"></div>
                <div class="td-skel td-skel-line td-short"></div>
              </div>
            </div>
          </div>

          <div class="sidebar-content">
            <div class="contact-info-section td-loading-card">
              <h3 class="section-title">Contact Information</h3>
              <div class="info-grid">
                <div class="info-row"><div class="info-label">EMAIL</div><div class="info-value"><span class="td-skel td-skel-value td-w-85"></span></div></div>
                <div class="info-row"><div class="info-label">MOBILE</div><div class="info-value"><span class="td-skel td-skel-value td-w-75"></span></div></div>
                <div class="info-row"><div class="info-label">COMPANY PHONE</div><div class="info-value"><span class="td-skel td-skel-value td-w-70"></span></div></div>
                <div class="info-row"><div class="info-label">CITY</div><div class="info-value"><span class="td-skel td-skel-value td-w-55"></span></div></div>
                <div class="info-row"><div class="info-label">STATE</div><div class="info-value"><span class="td-skel td-skel-value td-w-45"></span></div></div>
                <div class="info-row"><div class="info-label">INDUSTRY</div><div class="info-value"><span class="td-skel td-skel-value td-w-60"></span></div></div>
              </div>
            </div>

            <div class="contact-info-section td-loading-card">
              <h3 class="section-title">Energy &amp; Contract</h3>
              <div class="info-grid">
                <div class="info-row"><div class="info-label">ELECTRICITY SUPPLIER</div><div class="info-value"><span class="td-skel td-skel-value td-w-80"></span></div></div>
                <div class="info-row"><div class="info-label">ANNUAL USAGE</div><div class="info-value"><span class="td-skel td-skel-value td-w-60"></span></div></div>
                <div class="info-row"><div class="info-label">CURRENT RATE</div><div class="info-value"><span class="td-skel td-skel-value td-w-50"></span></div></div>
                <div class="info-row"><div class="info-label">CONTRACT END</div><div class="info-value"><span class="td-skel td-skel-value td-w-55"></span></div></div>
              </div>
            </div>

            <div class="contact-info-section td-loading-card">
              <h3 class="section-title">Recent Calls</h3>
              <div class="rc-skeletons">
                <div class="rc-item premium-borderline" style="opacity: 0.7; pointer-events: none; margin-bottom: 8px;">
                  <div class="rc-meta skeleton-shimmer-modern" style="min-width: 0;">
                    <div class="skeleton-shape" style="width: 58%; height: 14px; border-radius: 4px; margin-bottom: 6px;"></div>
                    <div class="skeleton-shape" style="width: 86%; height: 12px; border-radius: 4px;"></div>
                  </div>
                  <div class="rc-actions" style="flex-shrink: 0;">
                    <span class="rc-outcome" style="border-color: transparent;">
                      <span class="skeleton-shimmer-modern" style="display: inline-block; vertical-align: middle;">
                        <span class="skeleton-shape" style="width: 70px; height: 18px; border-radius: 999px;"></span>
                      </span>
                    </span>
                    <button type="button" class="rc-icon-btn" disabled>
                      <span class="skeleton-shimmer-modern" style="display: inline-block;">
                        <span class="skeleton-shape" style="width: 16px; height: 16px; border-radius: 4px;"></span>
                      </span>
                    </button>
                  </div>
                </div>
                <div class="rc-item premium-borderline" style="opacity: 0.7; pointer-events: none; margin-bottom: 8px;">
                  <div class="rc-meta skeleton-shimmer-modern" style="min-width: 0;">
                    <div class="skeleton-shape" style="width: 62%; height: 14px; border-radius: 4px; margin-bottom: 6px;"></div>
                    <div class="skeleton-shape" style="width: 82%; height: 12px; border-radius: 4px;"></div>
                  </div>
                  <div class="rc-actions" style="flex-shrink: 0;">
                    <span class="rc-outcome" style="border-color: transparent;">
                      <span class="skeleton-shimmer-modern" style="display: inline-block; vertical-align: middle;">
                        <span class="skeleton-shape" style="width: 64px; height: 18px; border-radius: 999px;"></span>
                      </span>
                    </span>
                    <button type="button" class="rc-icon-btn" disabled>
                      <span class="skeleton-shimmer-modern" style="display: inline-block;">
                        <span class="skeleton-shape" style="width: 16px; height: 16px; border-radius: 4px;"></span>
                      </span>
                    </button>
                  </div>
                </div>
                <div class="rc-item premium-borderline" style="opacity: 0.7; pointer-events: none; margin-bottom: 8px;">
                  <div class="rc-meta skeleton-shimmer-modern" style="min-width: 0;">
                    <div class="skeleton-shape" style="width: 52%; height: 14px; border-radius: 4px; margin-bottom: 6px;"></div>
                    <div class="skeleton-shape" style="width: 88%; height: 12px; border-radius: 4px;"></div>
                  </div>
                  <div class="rc-actions" style="flex-shrink: 0;">
                    <span class="rc-outcome" style="border-color: transparent;">
                      <span class="skeleton-shimmer-modern" style="display: inline-block; vertical-align: middle;">
                        <span class="skeleton-shape" style="width: 72px; height: 18px; border-radius: 999px;"></span>
                      </span>
                    </span>
                    <button type="button" class="rc-icon-btn" disabled>
                      <span class="skeleton-shimmer-modern" style="display: inline-block;">
                        <span class="skeleton-shape" style="width: 16px; height: 16px; border-radius: 4px;"></span>
                      </span>
                    </button>
                  </div>
                </div>
                <div class="rc-item premium-borderline" style="opacity: 0.7; pointer-events: none; margin-bottom: 8px;">
                  <div class="rc-meta skeleton-shimmer-modern" style="min-width: 0;">
                    <div class="skeleton-shape" style="width: 60%; height: 14px; border-radius: 4px; margin-bottom: 6px;"></div>
                    <div class="skeleton-shape" style="width: 84%; height: 12px; border-radius: 4px;"></div>
                  </div>
                  <div class="rc-actions" style="flex-shrink: 0;">
                    <span class="rc-outcome" style="border-color: transparent;">
                      <span class="skeleton-shimmer-modern" style="display: inline-block; vertical-align: middle;">
                        <span class="skeleton-shape" style="width: 66px; height: 18px; border-radius: 999px;"></span>
                      </span>
                    </span>
                    <button type="button" class="rc-icon-btn" disabled>
                      <span class="skeleton-shimmer-modern" style="display: inline-block;">
                        <span class="skeleton-shape" style="width: 16px; height: 16px; border-radius: 4px;"></span>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="activity-section td-loading-card">
              <h3 class="section-title">Recent Activity</h3>
              <div class="activities-list">
                <div class="td-activity-skeleton">
                  <div class="td-skel td-skel-activity"></div>
                  <div class="td-skel td-skel-activity"></div>
                  <div class="td-skel td-skel-activity td-short"></div>
                </div>
              </div>
            </div>
          </div>
        `;

        const realLayer = document.createElement('div');
        realLayer.className = 'td-layout-grid td-real-layer';
        realLayer.setAttribute('aria-hidden', 'true');
        els.content.appendChild(realLayer);

        const skelLayer = document.createElement('div');
        skelLayer.className = 'td-layout-grid td-skeleton-layer';
        skelLayer.innerHTML = skelHtml;
        els.content.appendChild(skelLayer);

        try {
          void skelLayer.offsetWidth;
          queueClassWhenVisible(skelLayer, 'td-enter');
        } catch (_) { }
      }
    } catch (_) { }
  }

  function markTaskLoaded(loadToken, taskId) {
    const el = els.page;
    if (!el) return;

    try {
      if (loadToken && state._activeLoadToken && loadToken !== state._activeLoadToken) return;
      if (taskId && state._activeTaskId && String(taskId) !== String(state._activeTaskId)) return;
    } catch (_) { }

    runWhenTaskDetailVisible(() => {
      try {
        if (loadToken && state._activeLoadToken && loadToken !== state._activeLoadToken) return;
        if (taskId && state._activeTaskId && String(taskId) !== String(state._activeTaskId)) return;
      } catch (_) { }

      try {
        const content = els.content;
        if (content) {
          const realLayer = content.querySelector('.td-real-layer');
          if (realLayer) realLayer.setAttribute('aria-hidden', 'false');

          const skelLayer = content.querySelector('.td-skeleton-layer');

          if (realLayer) {
            // CRITICAL FIX: Ensure real layer enters BEFORE skeleton exits
            requestAnimationFrame(() => {
              try { realLayer.classList.add('td-enter'); } catch (_) { }
            });
          }

          if (skelLayer) {
            // Delay skeleton exit for cross-fade overlap
            setTimeout(() => {
              try { skelLayer.classList.add('td-exit'); } catch (_) { }
            }, 80);

            setTimeout(() => {
              try {
                if (loadToken && state._activeLoadToken && loadToken !== state._activeLoadToken) return;
                if (taskId && state._activeTaskId && String(taskId) !== String(state._activeTaskId)) return;
              } catch (_) { }
              try { skelLayer.remove(); } catch (_) { }
            }, 600);
          }
        }
      } catch (_) { }
    });
    try {
      const titleSkel = el.querySelector('.task-detail-title-skeleton');
      if (titleSkel) titleSkel.classList.add('td-skeleton-exit');
      const subtitleSkel = el.querySelector('.task-detail-subtitle-skeleton');
      if (subtitleSkel) subtitleSkel.classList.add('td-skeleton-exit');

      const headerSkelIcon = el.querySelector('.td-header-skel-icon');
      if (headerSkelIcon) headerSkelIcon.classList.add('td-skeleton-exit');

      const contactInfo = el.querySelector('#task-contact-info');
      if (contactInfo) contactInfo.classList.remove('skeleton-shimmer-modern');
    } catch (_) { }

    el.classList.add('task-loaded');

    runWhenTaskDetailVisible(() => {
      window.setTimeout(() => {
        try {
          if (loadToken && state._activeLoadToken && loadToken !== state._activeLoadToken) return;
          if (taskId && state._activeTaskId && String(taskId) !== String(state._activeTaskId)) return;
        } catch (_) { }
        try {
          try {
            const content = els.content;
            const skelLayer = content ? content.querySelector('.td-skeleton-layer') : null;
            if (skelLayer && skelLayer.parentNode) skelLayer.parentNode.removeChild(skelLayer);
          } catch (_) { }

          const headerSkelIcon = el.querySelector('.td-header-skel-icon');
          if (headerSkelIcon) headerSkelIcon.remove();
          const titleSkel = el.querySelector('.task-detail-title-skeleton');
          if (titleSkel) titleSkel.remove();
          const subtitleSkel = el.querySelector('.task-detail-subtitle-skeleton');
          if (subtitleSkel) subtitleSkel.remove();
        } catch (_) { }

        el.classList.remove('task-loading');
      }, 600);
    });
  }

  // Helper functions
  function getPriorityBackground(priority) {
    const p = (priority || '').toLowerCase().trim();
    switch (p) {
      case 'low': return '#495057';
      case 'medium': return 'rgba(255, 193, 7, 0.15)';
      case 'high': return 'rgba(220, 53, 69, 0.15)';
      default: return '#495057';
    }
  }

  function getPriorityColor(priority) {
    const p = (priority || '').toLowerCase().trim();
    switch (p) {
      case 'low': return '#e9ecef';
      case 'medium': return '#ffc107';
      case 'high': return '#dc3545';
      default: return '#e9ecef';
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ==== Date helpers for Energy & Contract fields ====
  function parseDateFlexible(s) {
    if (!s) return null;
    const str = String(s).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      const parts = str.split('-');
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return isNaN(d.getTime()) ? null : d;
    }
    const mdy = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})$/);
    if (mdy) {
      const d = new Date(parseInt(mdy[3], 10), parseInt(mdy[1], 10) - 1, parseInt(mdy[2], 10));
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(str + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  function toISODate(v) {
    const d = parseDateFlexible(v);
    if (!d) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function toMDY(v) {
    const d = parseDateFlexible(v);
    if (!d) return v ? String(v) : '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  function formatDateInputAsMDY(raw) {
    const digits = String(raw || '').replace(/[^0-9]/g, '').slice(0, 8);
    let out = '';
    if (digits.length >= 1) out = digits.slice(0, 2);
    if (digits.length >= 3) out = digits.slice(0, 2) + '/' + digits.slice(2, 4);
    if (digits.length >= 5) out = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4, 8);
    return out;
  }

  // ==== Phone normalization ====
  function normalizePhone(input) {
    const raw = (input || '').toString().trim();
    if (!raw) return '';
    const digits = raw.replace(/[^\d]/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (/^\+/.test(raw)) return raw;
    return raw;
  }

  // ==== SVG icon helpers ====
  function editIcon() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>`;
  }

  function copyIcon() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>`;
  }

  function trashIcon() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6"/>
      <path d="M14 11v6"/>
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
    </svg>`;
  }

  function saveIcon() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </svg>`;
  }

  // ==== Batch update system for individual field edits ====
  let updateBatch = {};
  let updateTimeout = null;

  async function processBatchUpdate() {
    if (Object.keys(updateBatch).length === 0) return;

    try {
      const db = window.firebaseDB;
      if (!db || typeof db.collection !== 'function') return;

      // Process account updates
      if (updateBatch.account) {
        for (const [accountId, fields] of Object.entries(updateBatch.account)) {
          if (!accountId || !fields || Object.keys(fields).length === 0) continue;

          await db.collection('accounts').doc(accountId).update({
            ...fields,
            updatedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp() || new Date()
          });

          // Update local state
          if (state.account && state.account.id === accountId) {
            Object.assign(state.account, fields);
          }

          // Update caches
          if (window.CacheManager && typeof window.CacheManager.updateRecord === 'function') {
            const accountData = state.account && state.account.id === accountId ? state.account : { id: accountId, ...fields };
            await window.CacheManager.updateRecord('accounts', accountId, accountData);
          }

          // Dispatch events for other pages
          try {
            const ev = new CustomEvent('pc:account-updated', {
              detail: { id: accountId, changes: { ...fields }, updatedAt: new Date() }
            });
            document.dispatchEvent(ev);
          } catch (_) { }

          // Dispatch energy update events
          Object.keys(fields).forEach(field => {
            if (['electricitySupplier', 'annualUsage', 'currentRate', 'contractEndDate'].includes(field)) {
              try {
                document.dispatchEvent(new CustomEvent('pc:energy-updated', {
                  detail: { entity: 'account', id: accountId, field, value: fields[field] }
                }));
              } catch (_) { }
            }
          });
        }
      }

      // Process contact updates
      if (updateBatch.contact) {
        for (const [contactId, fields] of Object.entries(updateBatch.contact)) {
          if (!contactId || !fields || Object.keys(fields).length === 0) continue;

          await db.collection('contacts').doc(contactId).update({
            ...fields,
            updatedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp() || new Date()
          });

          // Update local state
          if (state.contact && state.contact.id === contactId) {
            Object.assign(state.contact, fields);
          }

          // Update caches
          if (window.CacheManager && typeof window.CacheManager.updateRecord === 'function') {
            const contactData = state.contact && state.contact.id === contactId ? state.contact : { id: contactId, ...fields };
            await window.CacheManager.updateRecord('contacts', contactId, contactData);
          }

          // Dispatch events for other pages
          try {
            const ev = new CustomEvent('pc:contact-updated', {
              detail: { id: contactId, changes: { ...fields }, updatedAt: new Date() }
            });
            document.dispatchEvent(ev);
          } catch (_) { }
        }
      }

      updateBatch = {};
      if (window.crm?.showToast) window.crm.showToast('Saved');
    } catch (error) {
      console.error('[TaskDetail] Failed to save field:', error);
      window.crm?.showToast && window.crm.showToast('Failed to save');
    }
  }

  function getApiBaseUrl() {
    try {
      if (window.crm && typeof window.crm.getApiBaseUrl === 'function') {
        const resolved = window.crm.getApiBaseUrl();
        if (resolved) return resolved;
      }
    } catch (_) { /* noop */ }

    try {
      const fromWindow = (window.PUBLIC_BASE_URL || window.API_BASE_URL || '').toString().trim();
      if (fromWindow) return fromWindow.replace(/\/$/, '');
    } catch (_) { /* noop */ }

    try {
      if (typeof PUBLIC_BASE_URL !== 'undefined' && PUBLIC_BASE_URL) {
        return String(PUBLIC_BASE_URL).replace(/\/$/, '');
      }
    } catch (_) { /* noop */ }

    try {
      if (typeof API_BASE_URL !== 'undefined' && API_BASE_URL) {
        return String(API_BASE_URL).replace(/\/$/, '');
      }
    } catch (_) { /* noop */ }

    try {
      if (window.location && window.location.origin) {
        return window.location.origin.replace(/\/$/, '');
      }
    } catch (_) { /* noop */ }

    return '';
  }

  // Helper functions for ownership filtering and localStorage key management
  function getUserTasksKey() {
    try {
      const email = (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function')
        ? window.DataManager.getCurrentUserEmail()
        : (window.currentUserEmail || '').toLowerCase();
      return email ? `userTasks:${email}` : 'userTasks';
    } catch (_) {
      return 'userTasks';
    }
  }

  function getDeletedTasksKey() {
    try {
      const email = getUserEmail();
      return email ? `pc:deleted-tasks:${email}` : 'pc:deleted-tasks';
    } catch (_) {
      return 'pc:deleted-tasks';
    }
  }

  function tombstoneTaskId(taskId, source) {
    if (!taskId) return;
    try {
      const key = getDeletedTasksKey();
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : {};
      const map = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
      map[String(taskId)] = Date.now();
      localStorage.setItem(key, JSON.stringify(map));
    } catch (_) { }
  }

  function getUserEmail() {
    try {
      if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
        return window.DataManager.getCurrentUserEmail();
      }
      return (window.currentUserEmail || '').toLowerCase();
    } catch (_) {
      return (window.currentUserEmail || '').toLowerCase();
    }
  }

  function isAdmin() {
    try {
      if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
        return window.DataManager.isCurrentUserAdmin();
      }
      return window.currentUserRole === 'admin';
    } catch (_) {
      return window.currentUserRole === 'admin';
    }
  }

  function filterTasksByOwnership(tasks) {
    if (!tasks || !Array.isArray(tasks)) return [];
    if (isAdmin()) return tasks;

    const email = getUserEmail();
    if (!email) return [];

    return tasks.filter(t => {
      if (!t) return false;
      const ownerId = (t.ownerId || '').toLowerCase();
      const assignedTo = (t.assignedTo || '').toLowerCase();
      const createdBy = (t.createdBy || '').toLowerCase();
      return ownerId === email || assignedTo === email || createdBy === email;
    });
  }

  // Helper function to get LinkedIn tasks from sequences (matches tasks.js and main.js logic)
  async function getLinkedInTasksFromSequences() {
    const linkedInTasks = [];
    const userEmail = getUserEmail();

    try {
      if (!window.firebaseDB) {
        return linkedInTasks;
      }

      // Query tasks collection for sequence tasks
      const tasksQuery = window.firebaseDB.collection('tasks')
        .where('sequenceId', '!=', null)
        .get();

      const tasksSnapshot = await tasksQuery;

      if (tasksSnapshot.empty) {
        return linkedInTasks;
      }

      tasksSnapshot.forEach(doc => {
        const taskData = doc.data();

        // Only include LinkedIn task types
        const taskType = String(taskData.type || '').toLowerCase();
        if (!taskType.includes('linkedin') && !taskType.includes('li-')) {
          return;
        }

        // Filter by ownership (non-admin users)
        if (!isAdmin()) {
          const ownerId = (taskData.ownerId || '').toLowerCase();
          const assignedTo = (taskData.assignedTo || '').toLowerCase();
          const createdBy = (taskData.createdBy || '').toLowerCase();
          if (ownerId !== userEmail && assignedTo !== userEmail && createdBy !== userEmail) {
            return;
          }
        }

        // Only include pending tasks
        if (taskData.status === 'completed') {
          return;
        }

        // Convert Firestore data to task format
        const task = {
          id: taskData.id || doc.id,
          title: taskData.title || '',
          contact: taskData.contact || '',
          account: taskData.account || '',
          type: taskData.type || 'linkedin',
          priority: taskData.priority || 'sequence',
          dueDate: taskData.dueDate || '',
          dueTime: taskData.dueTime || '',
          status: taskData.status || 'pending',
          sequenceId: taskData.sequenceId || '',
          contactId: taskData.contactId || '',
          accountId: taskData.accountId || '',
          stepId: taskData.stepId || '',
          stepIndex: taskData.stepIndex !== undefined ? taskData.stepIndex : -1,
          isLinkedInTask: true,
          isSequenceTask: taskData.isSequenceTask || true,
          ownerId: taskData.ownerId || '',
          assignedTo: taskData.assignedTo || '',
          createdBy: taskData.createdBy || '',
          createdAt: taskData.createdAt || (taskData.timestamp && taskData.timestamp.toDate ? taskData.timestamp.toDate().getTime() : taskData.timestamp) || Date.now(),
          timestamp: taskData.timestamp && taskData.timestamp.toDate ? taskData.timestamp.toDate().getTime() : (taskData.timestamp || Date.now())
        };

        linkedInTasks.push(task);
      });

      // console.log('[TaskDetail] Loaded', linkedInTasks.length, 'LinkedIn sequence tasks for navigation');
    } catch (error) {
      console.error('[TaskDetail] Error loading LinkedIn sequence tasks:', error);
    }

    return linkedInTasks;
  }

  // Get primary phone data with type information (same logic as contact-detail.js)
  function getPrimaryPhoneData(contact) {
    if (!contact) return { value: '', type: 'mobile', field: 'mobile' };

    // Check if a preferred phone field is set on the contact (from contact-detail.js)
    try {
      const pref = (contact && contact.preferredPhoneField) ? String(contact.preferredPhoneField).trim() : '';
      if (pref === 'mobile' && contact.mobile) return { value: contact.mobile, type: 'mobile', field: 'mobile' };
      if (pref === 'workDirectPhone' && contact.workDirectPhone) return { value: contact.workDirectPhone, type: 'work direct', field: 'workDirectPhone' };
      if (pref === 'otherPhone' && contact.otherPhone) return { value: contact.otherPhone, type: 'other', field: 'otherPhone' };
    } catch (_) { }

    // Priority fallback: Mobile > Work Direct > Other
    if (contact.mobile) {
      return { value: contact.mobile, type: 'mobile', field: 'mobile' };
    }
    if (contact.workDirectPhone) {
      return { value: contact.workDirectPhone, type: 'work direct', field: 'workDirectPhone' };
    }
    if (contact.otherPhone) {
      return { value: contact.otherPhone, type: 'other', field: 'otherPhone' };
    }
    return { value: '', type: 'mobile', field: 'mobile' };
  }

  // Find the associated account for this contact (by id or normalized company name)
  // CRITICAL FIX: Now checks state.account first, then multiple data sources
  function findAssociatedAccount(contact) {
    try {
      if (!contact) return null;

      // Check state.account first (already loaded by loadContactAccountData)
      if (state.account) {
        const accountId = contact.accountId || contact.account_id || '';
        if (accountId && state.account.id === accountId) return state.account;

        const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
        const contactCompany = norm(contact.companyName || contact.accountName || '');
        const stateAccountName = norm(state.account.accountName || state.account.name || state.account.companyName || '');
        if (contactCompany && stateAccountName && contactCompany === stateAccountName) return state.account;
      }

      // Get accounts from multiple sources
      let accounts = [];
      if (typeof window.getAccountsData === 'function') {
        accounts = window.getAccountsData() || [];
      }
      if (accounts.length === 0 && window.BackgroundAccountsLoader) {
        accounts = window.BackgroundAccountsLoader.getAccountsData() || [];
      }

      if (accounts.length === 0) return null;

      // Prefer explicit accountId
      const accountId = contact.accountId || contact.account_id || '';
      if (accountId) {
        const m = accounts.find(a => a.id === accountId);
        if (m) return m;
      }
      // Fallback to company name
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
      const key = norm(contact.companyName || contact.accountName || '');
      if (!key) return null;
      return accounts.find(a => norm(a.accountName || a.name || a.companyName) === key) || null;
    } catch (_) { return null; }
  }

  // Find account by ID or name for account tasks
  // CRITICAL FIX: Now checks state.account first, then multiple data sources
  function findAccountByIdOrName(accountId, accountName) {
    try {
      // Check state.account first (already loaded by loadContactAccountData)
      if (state.account) {
        if (accountId && state.account.id === accountId) return state.account;

        const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
        const stateAccountName = norm(state.account.accountName || state.account.name || state.account.companyName || '');
        const searchName = norm(accountName || '');
        if (searchName && stateAccountName && searchName === stateAccountName) return state.account;
      }

      // Get accounts from multiple sources
      let accounts = [];
      if (typeof window.getAccountsData === 'function') {
        accounts = window.getAccountsData() || [];
      }
      if (accounts.length === 0 && window.BackgroundAccountsLoader) {
        accounts = window.BackgroundAccountsLoader.getAccountsData() || [];
      }

      if (accounts.length === 0) return null;

      // Try by ID first
      if (accountId) {
        const found = accounts.find(a => a.id === accountId);
        if (found) return found;
      }

      // Fallback to name matching
      if (accountName) {
        const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
        const key = norm(accountName);
        return accounts.find(a => norm(a.accountName || a.name || a.companyName) === key) || null;
      }

      return null;
    } catch (_) { return null; }
  }

  // Determine if this is an account task (vs contact task)
  function isAccountTask(task) {
    if (!task) return false;
    // Account task has account but no contact, or has explicit accountId
    return task.account && (!task.contact || task.contact.trim() === '');
  }

  // Handle quick actions for task detail header buttons (website, LinkedIn)
  function handleTaskDetailQuickAction(action) {
    try {
      const task = state.currentTask;
      if (!task) return;

      const isAcctTask = isAccountTask(task);
      const toast = (msg, type = 'info') => { if (window.crm && typeof window.crm.showToast === 'function') window.crm.showToast(msg, type); };

      if (action === 'website') {
        // For account tasks, use account website; for contact tasks, try contact/account
        let url = '';
        if (isAcctTask && state.account) {
          url = state.account.website || state.account.site || state.account.domain || '';
        } else if (state.contact) {
          // Try contact's account website
          const linkedAccount = state.account || findAssociatedAccount(state.contact);
          url = linkedAccount?.website || linkedAccount?.site || linkedAccount?.domain || '';
        }

        if (url) {
          if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
          try { window.open(url, '_blank', 'noopener'); } catch (e) { /* noop */ }
        } else {
          toast('No website available for this account', 'info');
        }
      } else if (action === 'linkedin') {
        //  For account tasks, use account LinkedIn; for contact tasks, use contact LinkedIn
        let url = '';
        if (isAcctTask && state.account) {
          url = state.account.linkedin || state.account.linkedinUrl || state.account.linkedin_url || '';
          // Fallback to company search
          if (!url) {
            const companyName = state.account.accountName || state.account.name || state.account.companyName || '';
            if (companyName) {
              url = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(companyName)}`;
            }
          }
        } else if (state.contact) {
          url = state.contact.linkedin || state.contact.linkedinUrl || state.contact.linkedin_url || '';
          // Fallback to person search
          if (!url) {
            const fullName = [state.contact.firstName, state.contact.lastName].filter(Boolean).join(' ') || state.contact.name || '';
            if (fullName) {
              url = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(fullName)}`;
            }
          }
        }

        if (url) {
          try { window.open(url, '_blank', 'noopener'); } catch (e) { /* noop */ }
        } else {
          const type = isAcctTask ? 'account' : 'contact';
          toast(`No LinkedIn profile or name available for this ${type}`, 'info');
        }
      }
    } catch (error) {
      console.error('[TaskDetail] Error in handleTaskDetailQuickAction:', error);
    }
  }

  // Inject header button styles (LinkedIn, Website, divider, action buttons)
  function injectTaskHeaderStyles() {
    if (document.getElementById('task-detail-header-styles')) return;
    const style = document.createElement('style');
    style.id = 'task-detail-header-styles';
    style.textContent = `
      /* Task Detail: header layout and alignment */
      #task-detail-page .contact-header-profile { 
        display: inline-flex; 
        align-items: center; 
        gap: 8px;
      }
      /* Ensure action buttons align perfectly with title */
      #task-detail-page .contact-header-profile > .quick-action-btn,
      #task-detail-page .contact-header-profile > .header-action-divider,
      #task-detail-page .contact-header-profile > .list-seq-group {
        position: relative;
        top: 0; /* Align on same line */
        z-index: 10;
      }
      /* Center the text content vertically with proper spacing */
      #task-detail-page .contact-header-text {
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 4px 0; /* Add vertical padding to prevent text cutoff */
        min-height: 40px; /* Ensure minimum height for text content */
      }
      /* Reset margin added globally so spacing is controlled here */
      #task-detail-page .linkedin-header-btn { margin-left: 0; margin-right: 0; }
      /* Vertical divider between LinkedIn and the List/Sequence group */
      #task-detail-page .header-action-divider {
        width: 0;
        height: 24px;
        background: transparent;
        border-left: 1px solid var(--border-light);
        opacity: 0.9;
        display: inline-block;
        margin: 0;
        border-radius: 1px;
      }
      #task-detail-page .list-header-btn svg { display: block; }
      #task-detail-page .list-seq-group { display: inline-flex; align-items: center; gap: 6px; }
    /* Ensure all quick action buttons are same size and clickable */
    #task-detail-page .quick-action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      cursor: pointer;
      pointer-events: auto;
      background: var(--bg-item);
      border: 1px solid var(--border-light);
      border-radius: var(--border-radius);
      color: var(--text-secondary);
      transition: all var(--transition-fast);
    }
    #task-detail-page .quick-action-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
      border-color: var(--accent-color);
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    #task-detail-page .quick-action-btn.active {
      color: var(--primary-color);
      border-color: var(--primary-color);
      background: var(--primary-bg-subtle);
    }
    `;
    // Append to head so rules actually apply
    document.head.appendChild(style);
  }

  // Generate header buttons HTML for task detail page
  function renderTaskHeaderButtons() {
    const task = state.currentTask;
    if (!task) return '';

    // Website button SVG
    const websiteSvg = `\u003csvg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\u003e
      \u003ccircle cx=\"12\" cy=\"12\" r=\"10\"/\u003e
      \u003cline x1=\"2\" y1=\"12\" x2=\"22\" y2=\"12\"/\u003e
      \u003cpath d=\"M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z\"/\u003e
    \u003c/svg\u003e`;

    // LinkedIn button SVG
    const linkedInSvg = `\u003csvg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"\u003e
      \u003cpath d=\"M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z\"/\u003e
      \u003crect x=\"2\" y=\"9\" width=\"4\" height=\"12\"/\u003e
      \u003ccircle cx=\"4\" cy=\"4\" r=\"2\"/\u003e
    \u003c/svg\u003e`;

    // Complete header buttons HTML
    return `
      <button class="quick-action-btn website-header-btn" data-action="website" title="Visit website" aria-label="Visit website">
        ${websiteSvg}
      </button>
      <button class="quick-action-btn linkedin-header-btn" data-action="linkedin" title="View on LinkedIn" aria-label="View on LinkedIn">
        ${linkedInSvg}
      </button>`;
  }

  function renderTaskListSequenceButtons() {
    const task = state.currentTask;
    if (!task) return '';

    const isAcctTask = isAccountTask(task);

    const listSvg = `\u003csvg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" aria-hidden=\"true\" focusable=\"false\"\u003e
      \u003ccircle cx=\"4\" cy=\"6\" r=\"1\"\u003e\u003c/circle\u003e
      \u003ccircle cx=\"4\" cy=\"12\" r=\"1\"\u003e\u003c/circle\u003e
      \u003ccircle cx=\"4\" cy=\"18\" r=\"1\"\u003e\u003c/circle\u003e
      \u003cline x1=\"8\" y1=\"6\" x2=\"20\" y2=\"6\"\u003e\u003c/line\u003e
      \u003cline x1=\"8\" y1=\"12\" x2=\"20\" y2=\"12\"\u003e\u003c/line\u003e
      \u003cline x1=\"8\" y1=\"18\" x2=\"20\" y2=\"18\"\u003e\u003c/line\u003e
    \u003c/svg\u003e`;

    const sequenceSvg = `\u003csvg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"\u003e
      \u003cpolygon points=\"7 4 20 12 7 20 7 4\"\u003e\u003c/polygon\u003e
    \u003c/svg\u003e`;

    return `
        <button class="quick-action-btn list-header-btn" id="task-add-to-list" title="Add to list" aria-label="Add to list" aria-haspopup="dialog">
          ${listSvg}
        </button>
        <button class="quick-action-btn sequence-header-btn" id="task-add-to-sequence" title="Add to sequence" aria-label="Add to sequence" aria-haspopup="dialog" ${isAcctTask ? 'hidden' : ''}>
          ${sequenceSvg}
        </button>`;
  }

  function injectTaskDetailStyles() {
    const id = 'task-detail-inline-styles';
    const css = `
      /* Task Detail Page Layout */
      #task-detail-page .page-header {
        display: flex;
        align-items: center;
        width: 100%;
        padding: var(--spacing-base);
        margin: 0;
        background: transparent;
        border-bottom: 1px solid var(--border-light);
      }

      #task-detail-page .page-title-section {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        margin-bottom: 0 !important;
        gap: 20px;
      }

      #task-detail-page .contact-header-info {
        display: flex;
        align-items: center;
        gap: 16px;
        min-width: 0;
        flex: 1;
      }

      #task-detail-page .contact-header-profile {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
        flex: 1;
        min-height: 40px; /* Minimum height, but allow growth */
      }

      #task-detail-page .avatar-circle-small {
        width: 40px;
        height: 40px;
        min-width: 40px;
        min-height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        background: var(--orange-subtle);
        color: #fff;
        font-weight: 600;
        font-size: 16px;
        letter-spacing: 0.5px;
      }

      #task-detail-page .company-logo-header,
      #task-detail-page .company-favicon-header {
        width: 40px;
        height: 40px;
        min-width: 40px;
        min-height: 40px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        flex-shrink: 0;
        background: var(--bg-hover);
      }

      #task-detail-page .company-logo-header img,
      #task-detail-page .company-favicon-header img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      #task-detail-page .contact-header-text {
        display: flex;
        flex-direction: column;
        justify-content: center;
        min-width: 0;
        flex: 0 1 auto; /* Don't force growth, but allow shrink */
        padding: 4px 0; /* Add vertical padding to prevent text cutoff */
        min-height: 40px; /* Ensure minimum height for text content */
      }

      #task-detail-page .page-title {
        margin: 0;
        font-size: 1.25rem; /* Slightly smaller to match contact detail better */
        font-weight: 700;
        color: var(--text-primary);
        line-height: 1.1;
        letter-spacing: -0.025em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      #task-detail-page .contact-subtitle,
      #task-detail-page .task-contact-info {
        font-size: 0.85rem;
        color: var(--text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin: 0;
        font-weight: 400;
        line-height: 1.2;
      }

      #task-detail-page .task-contact-info {
        margin-top: 1px;
      }

      #task-detail-page .page-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-left: 20px;
        flex-shrink: 0;
      }

      #task-detail-page .page-actions .btn-primary,
      #task-detail-page .page-actions .btn-secondary {
        height: 36px;
        padding: 0 16px;
        font-size: 0.85rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--border-radius);
      }

      #task-detail-page .page-actions .btn-icon,
      #task-detail-page .page-actions .quick-action-btn {
        width: 36px;
        height: 36px;
        min-width: 36px;
        min-height: 36px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--border-radius);
      }

      #task-detail-page .task-navigation {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      /* Page actions separator - vertical line between button groups */
      #task-detail-page .page-actions-separator {
        width: 0;
        height: 24px;
        background: transparent;
        border-left: 1px solid var(--border-light);
        margin: 0;
        flex-shrink: 0;
      }
      #task-detail-page .page-content { 
        position: relative;
        padding: 0;
        flex: 1;
        min-height: 0;
        overflow: hidden;
        width: 100%;
      }

      #task-detail-page .td-skeleton-layer,
      #task-detail-page .td-real-layer {
        position: absolute;
        inset: 0;
      }

      #task-detail-page .td-skeleton-layer {
        pointer-events: none;
        opacity: 0;
        z-index: 2;
        transform: translateY(2px);
        transition: opacity 200ms ease, transform 200ms ease;
      }

      #task-detail-page.task-loading .td-skeleton-layer {
        opacity: 1;
        transform: translateY(0);
      }

      #task-detail-page .td-skeleton-layer.td-enter {
        opacity: 1;
        transform: translateY(0);
      }

      #task-detail-page .td-skeleton-layer.td-exit {
        opacity: 0;
        transform: translateY(-2px);
        transition: opacity 400ms ease, transform 400ms ease;
      }

      #task-detail-page .td-real-layer {
        pointer-events: none;
        opacity: 0;
        z-index: 1;
        transform: none;
        transition: opacity 150ms ease;
      }

      #task-detail-page.task-loading .td-real-layer {
        opacity: 0;
        pointer-events: none;
      }

      #task-detail-page .td-real-layer.td-enter {
        pointer-events: auto;
        opacity: 1;
      }

      #task-detail-page .td-layout-grid {
        display: grid;
        grid-template-columns: 450px 1fr;
        grid-template-rows: 1fr;
        column-gap: 0px;
        row-gap: 25px;
        width: 100%;
        height: 100%;
        justify-items: stretch;
        align-items: start;
      }
      /* Ensure container has glassmorphism while the page background matches dashboard */
      #task-detail-page .page-container {
        /* Use standard height calculation from main.css */
        height: calc(100vh - var(--topbar-height) - (var(--spacing-base) * 2));
        display: flex;
        flex-direction: column;
        margin-bottom: 0;
      }
      /* Override any global styles that might affect grid gap */
      #task-detail-page .td-layout-grid > .main-content {
        margin: 0 !important;
      }
      #task-detail-page .td-layout-grid > .sidebar-content {
        margin: 0 !important;
      }
      #task-detail-page .main-content { 
        display: flex; 
        flex-direction: column; 
        gap: 25px; /* Explicit 25px spacing between cards */
        min-height: 0; /* allow child overflow */
        height: 100%; /* fill grid row height */
        overflow-y: auto; /* independent scroll */
        overscroll-behavior: contain;
        padding: 25px; /* Consistent 25px padding on all sides */
        /* Allow the left column to fully occupy its grid track (no artificial max width) */
        max-width: none;
        width: 100%;
        background: rgba(0, 0, 0, 0.12); /* Subtle darkening for 2-tone effect */
        border-right: 1px solid var(--border-light); /* Vertical divider */
      }
      #task-detail-page .main-content > * {
        flex: 0 0 auto;
      }
      #task-detail-page .sidebar-content { 
        display: flex; 
        flex-direction: column; 
        gap: 25px; /* Explicit 25px spacing between cards */
        min-height: 0; /* allow child overflow */
        height: 100%; /* fill grid row height */
        overflow-y: auto; /* independent scroll */
        overscroll-behavior: contain;
        padding: 25px; /* Consistent 25px padding on all sides */
        margin: 0;
        align-items: stretch; /* Align to top */
        width: 100%; /* Ensure full width */
      }
      #task-detail-page .sidebar-content > * {
        flex: 0 0 auto;
      }
      /* Ensure first child in sidebar has no extra top margin */
      #task-detail-page .sidebar-content > *:first-child {
        margin-top: 0 !important;
      }
      
      /* Task Action Cards */
      #task-detail-page .task-card { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--border-radius-lg); padding: var(--spacing-base); margin: 0; box-shadow: var(--elevation-card); }
      #task-detail-page .task-card .section-title { font-weight: 600; font-size: 1rem; color: var(--text-primary); margin: 0 0 var(--spacing-md) 0; }
      #task-detail-page .task-card .form-row { margin: var(--spacing-md) 0; display: block; }
      #task-detail-page .task-card .actions { display: flex; gap: var(--spacing-sm); margin-top: var(--spacing-base); }
      
      /* Company Summary Card */
      #task-detail-page .company-summary-card { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--border-radius-lg); padding: var(--spacing-base); margin: 0; box-shadow: var(--elevation-card); }
      #task-detail-page .company-summary-header { display: flex; align-items: center; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm); }
      #task-detail-page .company-logo { width: 32px; height: 32px; border-radius: var(--border-radius-sm); background: var(--bg-item); display: flex; align-items: center; justify-content: center; }
      #task-detail-page .company-logo img { width: 100%; height: 100%; object-fit: contain; border-radius: var(--border-radius-sm); }
      #task-detail-page .company-logo-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px; color: var(--text-secondary); }
      #task-detail-page .company-name { font-weight: 600; color: var(--text-primary); }
      #task-detail-page .company-details { margin: var(--spacing-sm) 0; display: flex; flex-direction: column; gap: 4px; }
      #task-detail-page .company-detail-item { display: flex; align-items: center; gap: var(--spacing-sm); }
      #task-detail-page .detail-label { color: var(--text-secondary); font-size: 0.8rem; font-weight: 600; min-width: 60px; }
      #task-detail-page .detail-value { color: var(--text-primary); font-size: 0.9rem; }
      #task-detail-page .company-description { color: var(--text-secondary); font-size: 0.9rem; line-height: 1.4; }
      
      /* Contact Information Grid */
      #task-detail-page .contact-info-section { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--border-radius-lg); padding: var(--spacing-base); margin: 0; width: 100%; box-shadow: var(--elevation-card); }
      #task-detail-page .contact-info-section .section-title { font-weight: 700; font-size: 1rem; color: var(--text-primary); margin: 0 0 var(--spacing-base) 0; letter-spacing: -0.025em; }
      #task-detail-page .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-sm) var(--spacing-md); }
      #task-detail-page .info-row { display: flex; flex-direction: column; gap: 4px; }
      #task-detail-page .info-label { color: var(--text-secondary); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
      #task-detail-page .info-value { color: var(--text-primary); font-size: 0.9rem; }
      #task-detail-page .info-value.empty { color: var(--text-secondary); }
      
      /* Call List Styling */
      #task-detail-page .call-list { margin: var(--spacing-sm) 0; }
      #task-detail-page .call-row { display: flex; align-items: center; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm); }
      #task-detail-page .call-number { color: var(--text-secondary); font-family: monospace; }
      
      /* Activity Section */
      #task-detail-page .activity-section { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--border-radius-lg); padding: var(--spacing-base); margin: 0; box-shadow: var(--elevation-card); }
      #task-detail-page .activity-section .section-title { font-weight: 600; font-size: 1rem; color: var(--text-primary); margin: 0 0 var(--spacing-base) 0; }
      
      /* Activity Timeline - uses global .activities-list styling */
      
      /* Avatar Styles - Match People Page */
      #task-detail-page .avatar-circle-small,
      #task-detail-page .avatar-initials {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--orange-subtle, #ff6b35);
        color: #fff;
        font-weight: 600;
        letter-spacing: 0.5px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        flex-shrink: 0;
      }
      
      #task-detail-page .company-logo-header {
        width: 40px;
        height: 40px;
        border-radius: var(--border-radius-sm);
        background: var(--bg-item);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        border: 1px solid var(--border-light);
      }
      #task-detail-page .company-logo-header img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        border-radius: var(--border-radius-sm);
      }
      
      /* Contact Details Container - normal flow, no flex */
      #task-detail-page .contact-details-normal {
        line-height: 1.4;
      }
      
      /* Task Contact Info - Ensure proper alignment */
      #task-detail-page .task-contact-info {
        margin-left: 0 !important;
        padding-left: 0 !important;
      }
      
      /* Task Navigation Buttons */
      #task-detail-page .task-navigation {
        display: flex;
        gap: 8px;
        margin-left: auto;
        margin-right: 0;
      }
      
      
      /* Widgets Wrap */
      #task-detail-page .widgets-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;
      }
      
      /* Widget Button - Square */
      #task-detail-page #task-open-widgets {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px !important;
        height: 36px !important;
        padding: 0 !important;
        min-width: 36px;
        min-height: 36px;
      }
      
      #task-detail-page #task-open-widgets svg {
        width: 18px;
        height: 18px;
        display: block;
        pointer-events: none;
      }
      
      /* Widget Button Hover */
      #task-detail-page #task-open-widgets:hover {
        background: var(--bg-secondary);
        border-color: var(--accent-color) !important;
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
      

      
      /* Ensure page-actions uses flexbox for proper alignment */
      #task-detail-page .page-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-left: auto;
      }
      
      #task-detail-page .btn-icon {
        width: 36px;
        height: 36px;
        border-radius: var(--border-radius);
        background: var(--bg-item);
        border: 1px solid var(--border-light);
        color: var(--text-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      
      #task-detail-page .btn-icon:hover {
        background: var(--bg-secondary);
        color: var(--text-primary);
        border-color: var(--accent-color) !important;
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
      
      #task-detail-page .btn-icon:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        transform: none !important;
        box-shadow: none !important;
      }
      
      #task-detail-page .btn-icon:disabled:hover {
        background: var(--bg-item);
        color: var(--text-secondary);
        border-color: var(--border-light);
      }

      /* Reschedule button: identical to quick-action-btn for consistency */
      #task-detail-page #task-reschedule-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        min-width: 36px;
        min-height: 36px;
        padding: 0;
        cursor: pointer;
        pointer-events: auto;
        background: var(--bg-item);
        border: 1px solid var(--border-light);
        border-radius: var(--border-radius);
        color: var(--text-secondary);
        transition: all var(--transition-fast);
        box-sizing: border-box;
      }
      #task-detail-page #task-reschedule-btn:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
        border-color: var(--accent-color);
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
      #task-detail-page #task-reschedule-btn svg {
        width: 18px;
        height: 18px;
        display: block;
      }
      
      /* Contact Link Styles */
      #task-detail-page .contact-link {
        color: var(--grey-400);
        text-decoration: none;
        cursor: pointer;
        transition: var(--transition-fast);
        font-weight: 400;
        vertical-align: baseline;
        display: inline;
      }
      
      #task-detail-page .contact-link:hover {
        color: var(--text-inverse);
        text-decoration: none;
      }
      
      #task-detail-page .contact-link:focus-visible {
        outline: 2px solid var(--orange-primary);
        outline-offset: 2px;
        border-radius: 2px;
      }
      
      /* Company Link Styles - Match Contact Detail */
      #task-detail-page .company-link {
        color: var(--grey-400);
        text-decoration: none;
        cursor: pointer;
        transition: var(--transition-fast);
        font-weight: 400;
      }
      
      #task-detail-page .company-link:hover {
        color: var(--text-inverse);
        text-decoration: none;
      }
      
      #task-detail-page .company-link:focus-visible {
        outline: 2px solid var(--orange-primary);
        outline-offset: 2px;
        border-radius: 2px;
      }
      
      /* Account Task Styles */
      #task-detail-page .contacts-list-card {
        background: var(--bg-card);
        border: 1px solid var(--border-light);
        border-radius: var(--border-radius-lg);
        padding: var(--spacing-base);
        margin: 0;
        box-shadow: var(--elevation-card);
      }
      
      #task-detail-page .section-header-with-action {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--spacing-md);
      }
      
      #task-detail-page .btn-icon-add {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        background: var(--bg-item);
        border: 1px solid var(--border-light);
        color: var(--text-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: var(--transition-fast);
      }
      
      #task-detail-page .icon-btn-sm:hover {
        background: var(--bg-hover);
        border-color: var(--accent-color) !important;
        color: var(--text-inverse);
      }
      
      #task-detail-page .btn-icon-add:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
        border-color: var(--accent-color) !important;
      }
      
      #task-detail-page .contacts-list {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-sm);
      }
      
      #task-detail-page .contact-item {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        padding: var(--spacing-sm);
        border: 1px solid var(--border-light);
        border-radius: var(--border-radius);
        background: var(--bg-item);
        transition: var(--transition-fast);
      }
      
      #task-detail-page .contact-item:hover {
        background: var(--bg-hover);
        border-color: var(--accent-color) !important;
      }
      
      #task-detail-page .contact-avatar {
        flex-shrink: 0;
      }
      
      #task-detail-page .avatar-circle-small {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--orange-subtle, #ff6b35);
        color: #fff;
        font-weight: 600;
        letter-spacing: 0.5px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
      }
      
      #task-detail-page .contact-info {
        flex: 1;
        min-width: 0;
      }
      
      #task-detail-page .contact-name {
        font-weight: 500;
        color: var(--text-primary);
        font-size: 0.9rem;
        margin-bottom: 2px;
      }
      
      #task-detail-page .contact-details {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        font-size: 0.8rem;
        color: var(--text-secondary);
      }
      
      #task-detail-page .contact-title,
      #task-detail-page .contact-email,
      #task-detail-page .contact-phone {
        color: var(--text-secondary);
      }
      
      #task-detail-page .contacts-placeholder {
        text-align: center;
        padding: var(--spacing-lg);
        color: var(--text-secondary);
        font-size: 0.9rem;
      }
      
      #task-detail-page .company-summary-section {
        margin-top: var(--spacing-base);
        padding-top: var(--spacing-base);
        border-top: 1px solid var(--border-light);
      }
      
      #task-detail-page .company-summary-text {
        color: var(--text-primary);
        font-size: 0.9rem;
        line-height: 1.5;
        margin-top: 8px;
      }
      
      #task-detail-page .website-link {
        color: var(--grey-400);
        text-decoration: none;
        cursor: pointer;
        transition: var(--transition-fast);
        font-weight: 400;
      }
      
      #task-detail-page .website-link:hover {
        color: var(--text-inverse);
        text-decoration: none;
      }
      
      /* Company Favicon in Header */
      #task-detail-page .company-favicon-header {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      #task-detail-page .company-favicon-header img {
        max-width: 40px;
        max-height: 40px;
        object-fit: contain;
      }
      
      /* Responsive adjustments */
      @media (max-width: 1200px) {
        #task-detail-page .page-content { grid-template-columns: 400px 1fr; }
      }
      @media (max-width: 968px) {
        #task-detail-page .page-content { grid-template-columns: 1fr; }
        #task-detail-page .main-content { max-width: none; }
        #task-detail-page .info-grid { grid-template-columns: 1fr; }
      }
    `;

    const existing = document.getElementById(id);
    if (existing) {
      existing.textContent = css;
      return;
    }

    const style = document.createElement('style');
    style.id = id;
    style.type = 'text/css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function initDomRefs() {
    els.page = document.getElementById('task-detail-page');
    // Header may not have a fixed id in markup; fall back to the page-local header element
    els.header = document.getElementById('task-detail-header') || (els.page && els.page.querySelector('.page-header')) || null;
    els.title = document.getElementById('task-detail-title');
    els.subtitle = document.getElementById('task-detail-subtitle');
    els.content = document.getElementById('task-detail-content');
    els.backBtn = document.getElementById('task-detail-back-btn');
    els.completeBtn = document.getElementById('task-complete-btn');
    els.rescheduleBtn = document.getElementById('task-reschedule-btn');

    // Only require the elements we actually need for interaction
    return !!(els.page && els.content);
  }

  function attachEvents() {
    if (els.backBtn) {
      els.backBtn.addEventListener('click', (e) => { e.preventDefault(); handleBackNavigation(); });
    }

    if (els.completeBtn) {
      els.completeBtn.addEventListener('click', handleTaskComplete);
    }

    if (els.rescheduleBtn) {
      enhanceRescheduleButton(els.rescheduleBtn);
      els.rescheduleBtn.addEventListener('click', handleTaskReschedule);
    }

    // Task navigation buttons
    const prevBtn = document.getElementById('task-prev-btn');
    const nextBtn = document.getElementById('task-next-btn');

    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => { e.preventDefault(); navigateToAdjacentTask('prev'); });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => { e.preventDefault(); navigateToAdjacentTask('next'); });
    }

    const widgetsBtn = document.getElementById('task-open-widgets');
    const widgetsWrap = document.querySelector('#task-detail-page .widgets-wrap');
    const widgetsDrawer = document.getElementById('task-widgets-drawer') || document.querySelector('#task-detail-page .widgets-drawer');

    if (widgetsBtn && widgetsWrap && widgetsDrawer && !widgetsDrawer._pcBound) {
      const portalize = (el) => {
        try {
          if (!el || el.__pcPortalized) return;
          const parent = el.parentNode;
          const next = el.nextSibling;
          el.__pcPortalized = true;
          el.__pcPortalParent = parent;
          el.__pcPortalNext = next;
          document.body.appendChild(el);
        } catch (_) { }
      };

      const positionDrawer = (force = false) => {
        try {
          const rect = widgetsBtn.getBoundingClientRect();
          widgetsDrawer.style.position = 'fixed';
          widgetsDrawer.style.left = '0px';
          widgetsDrawer.style.top = '0px';
          widgetsDrawer.style.right = 'auto';

          const drawerRect = widgetsDrawer.getBoundingClientRect();
          const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
          const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

          let left = rect.left - drawerRect.width - 8;
          let top = rect.top + (rect.height / 2) - (drawerRect.height / 2);

          if (left < 8) {
            left = rect.right + 8;
          }

          left = Math.max(8, Math.min(left, viewportWidth - drawerRect.width - 8));
          top = Math.max(8, Math.min(top, viewportHeight - drawerRect.height - 8));

          widgetsDrawer.style.left = `${left}px`;
          widgetsDrawer.style.top = `${top}px`;
        } catch (_) { }
      };

      const setOpen = (open) => {
        try {
          clearTimeout(widgetsWrap._closeTimer);
          if (open) {
            portalize(widgetsDrawer);
            positionDrawer(true);
            widgetsWrap.classList.add('open');
            widgetsDrawer.classList.add('--open');
            widgetsBtn.setAttribute('aria-expanded', 'true');
            positionDrawer(true);
            requestAnimationFrame(() => {
              try { positionDrawer(true); } catch (_) { }
            });
          } else {
            widgetsWrap.classList.remove('open');
            widgetsDrawer.classList.remove('--open');
            widgetsBtn.setAttribute('aria-expanded', 'false');
          }
        } catch (_) { }
      };

      const openNow = () => setOpen(true);
      const closeSoon = () => {
        clearTimeout(widgetsWrap._closeTimer);
        widgetsWrap._closeTimer = setTimeout(() => setOpen(false), 320);
      };

      widgetsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const isOpen = widgetsDrawer.classList.contains('--open');
        setOpen(!isOpen);
      });

      widgetsWrap.addEventListener('mouseenter', openNow);
      widgetsWrap.addEventListener('mouseleave', closeSoon);
      widgetsWrap.addEventListener('focusin', openNow);
      widgetsWrap.addEventListener('focusout', (e) => {
        try {
          const rt = e.relatedTarget;
          if (rt && (widgetsWrap.contains(rt) || widgetsDrawer.contains(rt))) return;
        } catch (_) { }
        closeSoon();
      });

      widgetsDrawer.addEventListener('mouseenter', openNow);
      widgetsDrawer.addEventListener('mouseleave', closeSoon);
      widgetsDrawer.addEventListener('focusin', openNow);
      widgetsDrawer.addEventListener('focusout', (e) => {
        try {
          const rt = e.relatedTarget;
          if (rt && (widgetsWrap.contains(rt) || widgetsDrawer.contains(rt))) return;
        } catch (_) { }
        closeSoon();
      });

      document.addEventListener('mousedown', (e) => {
        try {
          if (!widgetsDrawer.classList.contains('--open')) return;
          if (widgetsWrap.contains(e.target) || widgetsDrawer.contains(e.target)) return;
          setOpen(false);
        } catch (_) { }
      }, true);

      document.addEventListener('keydown', (e) => {
        try {
          if (e.key !== 'Escape') return;
          if (!widgetsDrawer.classList.contains('--open')) return;
          setOpen(false);
        } catch (_) { }
      }, true);

      window.addEventListener('resize', positionDrawer, true);
      window.addEventListener('scroll', positionDrawer, true);

      widgetsDrawer._pcBound = '1';
    }

    // Widget drawer item clicks
    const widgetsDrawerClick = document.getElementById('task-widgets-drawer') || document.querySelector('#task-detail-page .widgets-drawer');
    if (widgetsDrawerClick && !widgetsDrawerClick._bound) {
      widgetsDrawerClick.addEventListener('click', (e) => {
        const item = e.target.closest?.('.widget-item');
        if (!item) return;
        const which = item.getAttribute('data-widget');
        handleWidgetAction(which);
      });
      widgetsDrawerClick._bound = '1';
    }

    // CRITICAL: Listen for task deletion events (e.g. sequence removal) to auto-navigate
    if (!document._taskDetailDeletionBound) {
      document.addEventListener('pc:task-deleted', async (e) => {
        const { taskId, source } = e.detail || {};
        if (source === 'task-detail') return;
        if (state.currentTask && taskId === state.currentTask.id && !state.navigating) {
          // console.log('[TaskDetail] Current task was deleted (e.g. sequence removal), navigating to next task...');
          try {
            // Small delay to ensure any prior state transitions complete
            await new Promise(resolve => setTimeout(resolve, 200));
            await navigateToAdjacentTask('next');
          } catch (err) {
            console.warn('[TaskDetail] Auto-navigation after task deletion failed:', err);
            handleBackNavigation();
          }
        }
      });
      
      // Listen for sequence membership changes to update badges
      document.addEventListener('pc:sequence-member-added', (e) => {
        const { sequenceId, contactId } = e.detail || {};
        if (!sequenceId || !contactId) return;
        
        // Update local state if we have sequence name
        if (window.BackgroundSequencesLoader?.getSequencesData) {
          const seq = window.BackgroundSequencesLoader.getSequencesData().find(s => s.id === sequenceId);
          if (seq && seq.name) {
            if (!state._contactSequenceMemberships[contactId]) state._contactSequenceMemberships[contactId] = [];
            if (!state._contactSequenceMemberships[contactId].includes(seq.name)) {
              state._contactSequenceMemberships[contactId].push(seq.name);
              // Refresh account contacts if visible
              const contactsContainer = document.querySelector('.account-contacts-list');
              if (contactsContainer && state.account) {
                renderAccountContacts(state.account).then(html => {
                  contactsContainer.innerHTML = html;
                });
              }
            }
          }
        }
      });

      document.addEventListener('pc:sequence-member-removed', (e) => {
        const { sequenceId, contactId } = e.detail || {};
        if (!sequenceId || !contactId) return;
        
        // Update local state
        if (window.BackgroundSequencesLoader?.getSequencesData) {
          const seq = window.BackgroundSequencesLoader.getSequencesData().find(s => s.id === sequenceId);
          if (seq && seq.name && state._contactSequenceMemberships[contactId]) {
            const idx = state._contactSequenceMemberships[contactId].indexOf(seq.name);
            if (idx >= 0) {
              state._contactSequenceMemberships[contactId].splice(idx, 1);
              // Refresh account contacts if visible
              const contactsContainer = document.querySelector('.account-contacts-list');
              if (contactsContainer && state.account) {
                renderAccountContacts(state.account).then(html => {
                  contactsContainer.innerHTML = html;
                });
              }
              // Update header button
              const seqBtn = document.getElementById('task-add-to-sequence');
              if (seqBtn) {
                const hasMemberships = state._contactSequenceMemberships[contactId] && state._contactSequenceMemberships[contactId].length > 0;
                if (hasMemberships) {
                   seqBtn.classList.add('active');
                   seqBtn.title = 'In Sequence';
                   seqBtn.setAttribute('aria-label', 'In Sequence');
                } else {
                   seqBtn.classList.remove('active');
                   seqBtn.title = 'Add to sequence';
                   seqBtn.setAttribute('aria-label', 'Add to sequence');
                }
              }
            }
          }
        }
      });

      document._taskDetailDeletionBound = true;
    }
  }

  function handleWidgetAction(which) {
    // Get contact and account IDs from task state
    const task = state.currentTask;
    if (!task) {
      try { window.crm?.showToast && window.crm.showToast('No task data available'); } catch (_) { }
      return;
    }

    // Get contact ID from task or state
    const contactId = task.contactId || state.contact?.id || state.contact?._id;

    // Get account ID - prioritize state.account, then contact's linked account
    let accountId = task.accountId || state.account?.id || state.account?.accountId || state.account?._id;
    if (!accountId && state.contact) {
      accountId = state.contact.accountId || state.contact.account_id;
    }

    switch (which) {
      case 'lusha': {
        // Use Lusha/Apollo widget - use account if available, otherwise contact
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (accountId && typeof api.openLushaForAccount === 'function') {
              api.openLushaForAccount(accountId); return;
            } else if (contactId && typeof api.openLusha === 'function') {
              api.openLusha(contactId); return;
            }
          } catch (_) { /* noop */ }
        }
        // console.log('Widget: Prospect for', accountId ? 'account' : 'contact', accountId || contactId);
        try { window.crm?.showToast && window.crm.showToast('Open Prospect'); } catch (_) { }
        break;
      }
      case 'maps': {
        // Google Maps - use account if available, otherwise contact
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (accountId && typeof api.openMapsForAccount === 'function') {
              api.openMapsForAccount(accountId); return;
            } else if (contactId && typeof api.openMaps === 'function') {
              api.openMaps(contactId); return;
            }
          } catch (_) { /* noop */ }
        }
        // console.log('Widget: Google Maps for', accountId ? 'account' : 'contact', accountId || contactId);
        try { window.crm?.showToast && window.crm.showToast('Open Google Maps'); } catch (_) { }
        break;
      }
      case 'health': {
        // Energy Health Check - use contact's linked account (like health.js does)
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (typeof api.isHealthOpen === 'function' && api.isHealthOpen()) {
              if (typeof api.closeHealth === 'function') { api.closeHealth(); return; }
            } else if (accountId && typeof api.openHealthForAccount === 'function') {
              api.openHealthForAccount(accountId); return;
            } else if (contactId && typeof api.openHealth === 'function') {
              // Health widget uses contact's linked account internally
              api.openHealth(contactId); return;
            }
          } catch (_) { /* noop */ }
        }
        // console.log('Widget: Energy Health Check for', accountId ? 'account' : 'contact', accountId || contactId);
        try { window.crm?.showToast && window.crm.showToast('Open Energy Health Check'); } catch (_) { }
        break;
      }
      case 'deal': {
        // Deal Calculator - saved to account
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (typeof api.isDealOpen === 'function' && api.isDealOpen()) {
              if (typeof api.closeDeal === 'function') { api.closeDeal(); return; }
            } else if (accountId && typeof api.openDealForAccount === 'function') {
              api.openDealForAccount(accountId); return;
            } else if (contactId && typeof api.openDeal === 'function') {
              // Deal calculator should use account, but fallback to contact if no account
              api.openDeal(contactId); return;
            }
          } catch (_) { /* noop */ }
        }
        // console.log('Widget: Deal Calculator for', accountId ? 'account' : 'contact', accountId || contactId);
        try { window.crm?.showToast && window.crm.showToast('Open Deal Calculator'); } catch (_) { }
        break;
      }
      case 'notes': {
        // Notes - use contact directly
        if (!contactId) {
          try { window.crm?.showToast && window.crm.showToast('No contact associated with this task'); } catch (_) { }
          return;
        }
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (typeof api.isNotesOpen === 'function' && api.isNotesOpen()) {
              if (typeof api.closeNotes === 'function') { api.closeNotes(); return; }
            } else if (typeof api.openNotes === 'function') {
              api.openNotes(contactId); return;
            }
          } catch (_) { /* noop */ }
        }
        // console.log('Widget: Notes for contact', contactId);
        try { window.crm?.showToast && window.crm.showToast('Open Notes'); } catch (_) { }
        break;
      }
      default:
      // console.log('Unknown widget action:', which);
    }
  }

  function handleBackNavigation() {
    try {
      // Standardize navigation source detection to match account detail pattern
      const src = window._taskNavigationSource || '';
      // Default action helper
      const nav = (page) => { if (window.crm && typeof window.crm.navigateToPage === 'function') { window.crm.navigateToPage(page); } };

      if (src === 'account-details') {
        // Handle account details navigation with proper state restoration
        const restore = window.__accountDetailsRestoreData || {};
        nav('account-details');
        setTimeout(() => {
          try {
            // Restore account details state if available
            if (restore.accountId && window.showAccountDetail && typeof window.showAccountDetail === 'function') {
              window.showAccountDetail(restore.accountId);
            }
            // Dispatch account details restore event
            document.dispatchEvent(new CustomEvent('pc:account-details-restore', { detail: restore || {} }));
            // console.log('[Task Detail] Restored account details state:', restore);
          } catch (_) { }
        }, 80);
        return;
      }
      if (src === 'task-detail') {
        // Handle task detail navigation (when coming back from account detail)
        const restore = window.__taskDetailRestoreData || {};
        nav('task-detail');
        setTimeout(() => {
          try {
            // Restore task detail state if available
            if (restore.taskId && window.TaskDetail && typeof window.TaskDetail.open === 'function') {
              window.TaskDetail.open(restore.taskId, restore.source || 'dashboard');
            }
            // console.log('[Task Detail] Restored task detail state:', restore);
          } catch (_) { }
        }, 80);
        return;
      }
      if (src === 'accounts') {
        const restore = window._accountsReturn || window.__accountsRestoreData || (window.accountsModule && typeof window.accountsModule.getCurrentState === 'function' ? window.accountsModule.getCurrentState() : null);
        nav('accounts');
        setTimeout(() => {
          try { window.accountsModule && typeof window.accountsModule.rebindDynamic === 'function' && window.accountsModule.rebindDynamic(); } catch (_) { }
          try { document.dispatchEvent(new CustomEvent('pc:accounts-restore', { detail: restore || {} })); } catch (_) { }
        }, 80);
        return;
      }
      if (src === 'people') {
        const restore = window.__peopleRestoreData || (window.peopleModule && typeof window.peopleModule.getCurrentState === 'function' ? window.peopleModule.getCurrentState() : null);
        nav('people');
        setTimeout(() => {
          try { window.peopleModule && typeof window.peopleModule.rebindDynamic === 'function' && window.peopleModule.rebindDynamic(); } catch (_) { }
          try { document.dispatchEvent(new CustomEvent('pc:people-restore', { detail: restore || {} })); } catch (_) { }
        }, 80);
        return;
      }
      if (src === 'tasks') {
        const restore = window.__tasksRestoreData || { scroll: window.__tasksScrollY || 0 };
        nav('tasks');
        setTimeout(() => {
          try { document.dispatchEvent(new CustomEvent('pc:tasks-restore', { detail: restore || {} })); } catch (_) { }
        }, 80);
        return;
      }
      if (src === 'dashboard') {
        // Handle dashboard navigation with proper state restoration
        const restore = window._dashboardReturn || { scroll: 0 };
        nav('dashboard');
        setTimeout(() => {
          try {
            // Restore dashboard scroll position
            if (restore.scroll && restore.scroll > 0) {
              window.scrollTo(0, restore.scroll);
            }
            // Restore Today's Tasks widget state if available
            if (restore.dashboardState && window.crm && typeof window.crm.loadTodaysTasks === 'function') {
              // Restore Today's Tasks pagination
              if (restore.dashboardState.todaysTasksPage && window.crm.todaysTasksPagination) {
                window.crm.todaysTasksPagination.currentPage = restore.dashboardState.todaysTasksPage;
              }
              // Reload Today's Tasks to reflect restored state
              window.crm.loadTodaysTasks();
            }
            // Dispatch dashboard restore event
            document.dispatchEvent(new CustomEvent('pc:dashboard-restore', { detail: restore || {} }));
            // console.log('[Task Detail] Restored dashboard state:', restore);
          } catch (_) { }
        }, 80);
        return;
      }
      if (src) { nav(src); return; }
      // Fallback: go to tasks
      nav('tasks');
    } catch (e) {
      try { window.crm && window.crm.navigateToPage && window.crm.navigateToPage('tasks'); } catch (_) { }
    }
  }

  async function handleTaskComplete() {
    if (!state.currentTask) return;

    tombstoneTaskId(state.currentTask.id, 'task-detail.js.complete');

    // CRITICAL FIX: Identify the next task in the global queue BEFORE deleting the current one
    // This must be done before any deletion logic runs
    let nextQueueTaskId = null;
    try {
      // Use the shared queue generator to ensure consistent sorting
      const queue = await getSortedTasksQueue();
      // Filter out completed tasks just in case
      const activeQueue = queue.filter(t => t.status !== 'completed');

      const currentIndex = activeQueue.findIndex(t => t.id === state.currentTask.id);

      if (currentIndex !== -1 && currentIndex < activeQueue.length - 1) {
        // Next task is the one immediately following current task
        nextQueueTaskId = activeQueue[currentIndex + 1].id;
        // console.log('[TaskDetail] Pre-identified next task in queue (Priority 1):', nextQueueTaskId);
      } else if (activeQueue.length > 0 && currentIndex === -1) {
        // If current task is not in the queue (e.g. freshly loaded), go to the first available task
        nextQueueTaskId = activeQueue[0].id;
        // console.log('[TaskDetail] Current task not in queue, defaulting to first available:', nextQueueTaskId);
      } else if (currentIndex !== -1 && currentIndex === activeQueue.length - 1 && activeQueue.length > 1) {
        // If we are at the end, maybe go to the first one? Or just null (end of queue)
        // Let's try to go to the first one if it's different
        if (activeQueue[0].id !== state.currentTask.id) {
          nextQueueTaskId = activeQueue[0].id;
        }
      }
    } catch (e) {
      console.warn('[TaskDetail] Failed to pre-calculate next task:', e);
    }

    let nextSequenceTaskId = null;
    let nextSequenceTaskData = null;

    // CRITICAL: Verify ownership before deletion
    if (!isAdmin()) {
      const email = getUserEmail();
      const task = state.currentTask;
      const ownerId = (task.ownerId || '').toLowerCase();
      const assignedTo = (task.assignedTo || '').toLowerCase();
      const createdBy = (task.createdBy || '').toLowerCase();

      if (ownerId !== email && assignedTo !== email && createdBy !== email) {
        console.error('[TaskDetail] User does not have permission to complete this task');
        if (window.crm && typeof window.crm.showToast === 'function') {
          window.crm.showToast('You do not have permission to complete this task', 'error');
        }
        return;
      }
    }

    // Get updated notes from the form
    const callNotesEl = document.getElementById('call-notes');
    const updatedNotes = callNotesEl ? callNotesEl.value.trim() : '';
    const finalNotes = updatedNotes || state.currentTask.notes || '';

    // Save notes to recent activities if there are any
    if (finalNotes) {
      try {
        await saveTaskNotesToRecentActivity(state.currentTask, finalNotes);
      } catch (e) {
        console.warn('Could not save notes to recent activity:', e);
      }
    }

    // Trigger sequence next step BEFORE deleting the current task so the API can read it
    if (state.currentTask && (state.currentTask.isSequenceTask || state.currentTask.sequenceId)) {
      try {
        const baseUrl = getApiBaseUrl();
        const response = await fetch(`${baseUrl}/api/complete-sequence-task`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: state.currentTask.id })
        });

        let result;
        try {
          result = await response.json();
        } catch (parseError) {
          throw parseError;
        }

        if (result.success) {
          // console.log('[TaskDetail] Next step created:', result.nextStepType, result);

          if (result.nextStepType === 'task' && result.taskId) {
            nextSequenceTaskId = result.taskId;

            try {
              if (window.firebaseDB) {
                try {
                  const nextDoc = await window.firebaseDB.collection('tasks').doc(nextSequenceTaskId).get();
                  if (nextDoc && nextDoc.exists) {
                    nextSequenceTaskData = { id: nextDoc.id, ...nextDoc.data() };
                  }
                } catch (_) { }

                if (!nextSequenceTaskData) {
                  try {
                    const snap = await window.firebaseDB.collection('tasks')
                      .where('id', '==', nextSequenceTaskId)
                      .limit(1)
                      .get();
                    if (snap && !snap.empty) {
                      const doc = snap.docs[0];
                      nextSequenceTaskData = { id: doc.id, ...doc.data() };
                    }
                  } catch (_) { }
                }
              }

              if (nextSequenceTaskData && window.CacheManager && typeof window.CacheManager.updateRecord === 'function') {
                await window.CacheManager.updateRecord('tasks', nextSequenceTaskData.id, nextSequenceTaskData);
              }
            } catch (_) { }
          }

          if (result.nextStepType) {
            window.dispatchEvent(new CustomEvent('tasksUpdated', {
              detail: {
                source: 'sequenceTaskCompletion',
                newTaskCreated: result.nextStepType === 'task',
                nextStepType: result.nextStepType,
                taskData: nextSequenceTaskData
              }
            }));
          }
        } else {
          console.warn('[TaskDetail] Failed to create next step:', result.message || result.error);
        }
      } catch (error) {
        console.error('[TaskDetail] Error creating next sequence step:', error);
      }
    }

    // Remove from localStorage completely (use namespaced key)
    try {
      const key = getUserTasksKey();
      const userTasks = JSON.parse(localStorage.getItem(key) || '[]');
      const filteredTasks = userTasks.filter(t => t && t.id !== state.currentTask.id);
      localStorage.setItem(key, JSON.stringify(filteredTasks));

      // Also clean up legacy key (for cross-browser compatibility)
      const legacyTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
      const filteredLegacy = legacyTasks.filter(t => t && t.id !== state.currentTask.id);
      localStorage.setItem('userTasks', JSON.stringify(filteredLegacy));

      // CRITICAL FIX: Also clean up from BackgroundTasksLoader cache if available
      if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.removeTask === 'function') {
        try {
          const removed = window.BackgroundTasksLoader.removeTask(state.currentTask.id);
          if (removed) {
            // console.log('[TaskDetail] Removed task from BackgroundTasksLoader cache');
          }
        } catch (e) {
          console.warn('[TaskDetail] Could not remove task from BackgroundTasksLoader:', e);
        }
      }
    } catch (e) {
      console.warn('Could not remove task from localStorage:', e);
    }

    // Delete from Firebase completely (with ownership check)
    try {
      if (window.firebaseDB && state.currentTask.id) {
        // CRITICAL FIX: Try both methods - direct document ID and query by id field
        // Tasks created from bookings may not have an id field in the document data
        let taskDoc = null;
        let taskData = null;

        // Method 1: Try direct document ID (for tasks created from bookings)
        try {
          const directDoc = await window.firebaseDB.collection('tasks').doc(state.currentTask.id).get();
          if (directDoc.exists) {
            taskDoc = directDoc;
            taskData = directDoc.data();
          }
        } catch (directError) {
          console.warn('[TaskDetail] Direct document lookup failed, trying query method:', directError);
        }

        // Method 2: If direct lookup failed, try querying by id field (for tasks with id field in data)
        if (!taskDoc) {
          const snapshot = await window.firebaseDB.collection('tasks')
            .where('id', '==', state.currentTask.id)
            .limit(1)
            .get();

          if (!snapshot.empty) {
            taskDoc = snapshot.docs[0];
            taskData = taskDoc.data();
          }
        }

        if (taskDoc && taskData) {
          // Verify ownership before deletion
          if (!isAdmin()) {
            const email = getUserEmail();
            const ownerId = (taskData.ownerId || '').toLowerCase();
            const assignedTo = (taskData.assignedTo || '').toLowerCase();
            const createdBy = (taskData.createdBy || '').toLowerCase();

            if (ownerId !== email && assignedTo !== email && createdBy !== email) {
              console.error('[TaskDetail] User does not have permission to delete this task');
              return;
            }
          }

          // Delete using the document reference
          await taskDoc.ref.delete();
          // console.log('[TaskDetail] Successfully deleted task from Firestore:', state.currentTask.id);

          if (window.CacheManager && typeof window.CacheManager.deleteRecord === 'function') {
            await window.CacheManager.deleteRecord('tasks', state.currentTask.id);
          }
        } else {
          console.warn('[TaskDetail] Task not found in Firestore for deletion:', state.currentTask.id);
        }
      }
    } catch (e) {
      console.error('[TaskDetail] Could not delete task from Firebase:', e);
    }

    // CRITICAL FIX: Remove from BackgroundTasksLoader cache FIRST before refreshing widget
    // This prevents the widget from loading stale data from BackgroundTasksLoader
    if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.removeTask === 'function') {
      try {
        window.BackgroundTasksLoader.removeTask(state.currentTask.id);
        // console.log('[TaskDetail] Removed task from BackgroundTasksLoader cache');
      } catch (e) {
        console.warn('[TaskDetail] Could not remove task from BackgroundTasksLoader:', e);
      }
    }

    await new Promise(resolve => setTimeout(resolve, 50));

    // Show success message
    if (window.crm && typeof window.crm.showToast === 'function') {
      window.crm.showToast('Task completed successfully');
    }

    // CRITICAL FIX: Refresh Today's Tasks widget AFTER cache is cleared and Firebase deletion completes
    try {
      if (window.crm && typeof window.crm.loadTodaysTasks === 'function') {
        // Force reload BackgroundTasksLoader to ensure fresh data
        if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.forceReload === 'function') {
          try {
            window.BackgroundTasksLoader.forceReload()
              .then(() => { /* console.log('[TaskDetail] Forced BackgroundTasksLoader reload before refreshing widget') */ })
              .catch((reloadError) => console.warn('[TaskDetail] Failed to force reload BackgroundTasksLoader:', reloadError));
          } catch (reloadError) {
            console.warn('[TaskDetail] Failed to force reload BackgroundTasksLoader:', reloadError);
          }
        }
        window.crm.loadTodaysTasks();
      }
    } catch (e) {
      console.warn('Could not refresh Today\'s Tasks widget:', e);
    }

    // Trigger tasks updated event for other components (with taskId for cleanup)
    window.dispatchEvent(new CustomEvent('tasksUpdated', {
      detail: { source: 'taskCompletion', taskId: state.currentTask.id, deleted: true }
    }));

    // CRITICAL FIX: Also dispatch to document for cross-browser sync
    document.dispatchEvent(new CustomEvent('pc:task-deleted', {
      detail: { taskId: state.currentTask.id, source: 'task-detail' }
    }));

    // Navigate to next task instead of going back
    try {
      // Clean up any existing avatars/icons before navigation
      cleanupExistingAvatarsAndIcons();

      // Small delay to ensure task deletion has been processed
      await new Promise(resolve => setTimeout(resolve, 100));

      // CRITICAL FIX: Prioritize global queue navigation over sequence creation
      // This ensures user flows through their daily list instead of getting stuck in a sequence loop
      if (nextQueueTaskId) {
        await loadTaskData(nextQueueTaskId);
      } else if (nextSequenceTaskId) {
        await loadTaskData(nextSequenceTaskId);
      } else {
        // Fallback to standard navigation (might fail if list is empty)
        await navigateToAdjacentTask('next');
      }
    } catch (e) {
      console.warn('Could not navigate to next task, falling back to previous page:', e);
      // Fallback: navigate back if no next task available
      handleBackNavigation();
    }
  }

  function handleTaskReschedule() {
    try {
      if (!els.rescheduleBtn) return;
      injectRescheduleStyles();
      openReschedulePopover(els.rescheduleBtn);
    } catch (err) {
      console.warn('[TaskDetail] Reschedule failed to open', err);
    }
  }

  let _reschedulePopover = null;
  let _reschedulePopoverCleanup = null;

  function enhanceRescheduleButton(btn) {
    if (!btn || btn.dataset.rescheduleReady) return;
    btn.dataset.rescheduleReady = 'true';
    btn.setAttribute('aria-label', 'Reschedule task');
    btn.setAttribute('title', 'Reschedule');
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
        <line x1="9" y1="14" x2="11" y2="14"></line>
        <line x1="13" y1="18" x2="15" y2="18"></line>
      </svg>
    `;
  }

  function injectRescheduleStyles() {
    const id = 'task-detail-reschedule-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      .reschedule-popover {
        position: absolute;
        z-index: 1300;
        background: var(--bg-card);
        color: var(--text-primary);
        border: 1px solid var(--border-light);
        border-radius: var(--border-radius-lg);
        box-shadow: var(--elevation-card);
        min-width: 320px;
        max-width: 380px;
        overflow: visible;
        opacity: 0;
        transform: translateY(-6px);
        --arrow-size: 10px;
      }
      .reschedule-popover.--show {
        animation: reschedulePopoverIn 200ms ease forwards;
      }
      .reschedule-popover.--hide {
        animation: reschedulePopoverOut 300ms ease forwards;
      }
      @keyframes reschedulePopoverIn {
        from { opacity: 0; transform: translateY(-6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes reschedulePopoverOut {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-6px); }
      }
      .reschedule-popover::before,
      .reschedule-popover::after {
        content: "";
        position: absolute;
        width: var(--arrow-size);
        height: var(--arrow-size);
        transform: rotate(45deg);
        pointer-events: none;
      }
      .reschedule-popover[data-placement="bottom"]::before {
        left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2 + 1px));
        top: calc(-1 * var(--arrow-size) / 2 + 1px);
        background: var(--border-light);
      }
      .reschedule-popover[data-placement="bottom"]::after {
        left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2 + 1px));
        top: calc(-1 * var(--arrow-size) / 2 + 2px);
        background: var(--bg-card);
      }
      .reschedule-popover .tp-inner { padding: 12px 12px 10px 12px; }
      .reschedule-popover .tp-header { display:flex; align-items:center; justify-content:space-between; margin-bottom: 10px; }
      .reschedule-popover .tp-title { font-weight: 600; color: var(--text-primary); }
      .reschedule-popover .tp-body { max-height: 480px; overflow: auto; }
      .reschedule-popover .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
      .reschedule-popover label { display:flex; flex-direction:column; gap:6px; font-size:12px; color: var(--text-secondary); position: relative; }
      .reschedule-popover input.input-dark, .reschedule-popover textarea.input-dark {
        width: 100%; padding: 10px 12px; background: var(--bg-item); color: var(--text-primary);
        border: 2px solid var(--border-light); border-radius: 8px; font-size: 0.9rem;
      }
      .reschedule-popover .form-actions { display:flex; justify-content:flex-end; gap:8px; }
      .reschedule-popover .btn-primary { height:32px; padding:0 12px; border-radius: var(--border-radius-sm); background: var(--orange-primary); color: var(--text-inverse); border:1px solid var(--orange-primary); font-weight:600; }
      .reschedule-popover .btn-primary:hover { background: var(--orange-dark, #e67e00); border-color: var(--accent-color) !important; filter: brightness(0.95); }
      .reschedule-popover .btn-text { height:32px; padding:0 12px; border-radius: var(--border-radius-sm); background: transparent; color: var(--text-secondary); border:1px solid transparent; transition: var(--transition-fast); }
      .reschedule-popover .btn-text:hover { background: var(--grey-700); color: var(--text-inverse); border-color: var(--accent-color) !important; }
      .reschedule-popover .close-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; min-width: 28px; min-height: 28px; padding: 0; background: var(--bg-item); color: var(--grey-300); border: 1px solid var(--border-light); border-radius: var(--border-radius-sm); line-height: 1; font-size: 16px; font-weight: 600; cursor: pointer; transition: var(--transition-fast); box-sizing: border-box; }
      .reschedule-popover .close-btn:hover { background: var(--grey-600); color: var(--text-inverse); border-color: var(--accent-color) !important; }
      .reschedule-popover .calendar-toolbar { display: none; margin-top: 8px; background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--border-radius); box-shadow: var(--elevation-card); padding: 8px; }
      .reschedule-popover .calendar-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
      .reschedule-popover .calendar-month-year { font-weight: 600; }
      .reschedule-popover .calendar-nav-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: var(--bg-item); color: var(--text-inverse); border: 1px solid var(--border-light); border-radius: var(--border-radius-sm); cursor: pointer; transition: var(--transition-fast); }
      .reschedule-popover .calendar-nav-btn:hover { background: var(--bg-secondary); border-color: var(--accent-color) !important; box-shadow: 0 2px 8px rgba(0,0,0,.1); }
      .reschedule-popover .calendar-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 4px; }
      .reschedule-popover .calendar-weekday { text-align: center; font-size: 11px; color: var(--text-secondary); font-weight: 600; }
      .reschedule-popover .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
      .reschedule-popover .calendar-grid button { padding: 6px 0; background: var(--bg-item); color: var(--text-inverse); border: 1px solid var(--border-light); border-radius: var(--border-radius-sm); cursor: pointer; transition: var(--transition-fast); }
      .reschedule-popover .calendar-grid button:hover { background: var(--bg-secondary); border-color: var(--accent-color) !important; }
      .reschedule-popover .calendar-grid > div:empty { background: transparent; border: none; }
      .reschedule-popover .calendar-grid button.today { border-color: var(--orange-primary); }
      .reschedule-popover .calendar-grid button.selected { background: var(--orange-primary); color: #fff; border-color: var(--orange-primary); }
      .reschedule-popover .calendar-slide-in { animation: rescheduleCalIn 200ms ease forwards; }
      .reschedule-popover .calendar-slide-out { animation: rescheduleCalOut 300ms ease forwards; }
      @keyframes rescheduleCalIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes rescheduleCalOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-8px); } }
    `;
    document.head.appendChild(style);
  }

  function openReschedulePopover(anchorEl) {
    closeReschedulePopover();
    const task = state.currentTask || {};

    const pop = document.createElement('div');
    pop.className = 'reschedule-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Reschedule task');

    const initialDate = parseDateStrictSafe(task.dueDate) || new Date();
    const initialTime = task.dueTime || '';

    pop.innerHTML = `
      <div class="arrow" aria-hidden="true"></div>
      <div class="tp-inner">
        <div class="tp-header">
          <div class="tp-title">Reschedule</div>
          <button type="button" class="close-btn" data-close aria-label="Close">×</button>
        </div>
        <div class="tp-body">
          <form id="reschedule-form">
            <div class="form-row">
              <label>Time
                <input type="text" name="dueTime" class="input-dark" value="${escapeHtml(initialTime)}" placeholder="10:30 AM" required />
              </label>
              <label>Due date
                <input type="text" name="dueDate" class="input-dark" value="${escapeHtml(fmtDate(initialDate))}" readonly />
                <button type="button" class="calendar-toggle-btn" aria-label="Open calendar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </button>
              </label>
            </div>
            <div class="calendar-toolbar" style="display:none;">
              <div class="calendar-header">
                <button type="button" class="calendar-nav-btn" data-nav="-1" aria-label="Previous month">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="15,18 9,12 15,6"></polyline>
                  </svg>
                </button>
                <div class="calendar-month-year"></div>
                <button type="button" class="calendar-nav-btn" data-nav="1" aria-label="Next month">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9,18 15,12 9,6"></polyline>
                  </svg>
                </button>
              </div>
              <div class="calendar-weekdays">
                <div class="calendar-weekday">S</div>
                <div class="calendar-weekday">M</div>
                <div class="calendar-weekday">T</div>
                <div class="calendar-weekday">W</div>
                <div class="calendar-weekday">T</div>
                <div class="calendar-weekday">F</div>
                <div class="calendar-weekday">S</div>
              </div>
              <div class="calendar-grid"></div>
            </div>
            <div class="form-actions">
              <button type="button" class="btn-text" data-close>Cancel</button>
              <button type="submit" class="btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(pop);
    requestAnimationFrame(() => pop.classList.add('--show'));
    positionPopover(anchorEl, pop);

    const form = pop.querySelector('#reschedule-form');
    const dueDateInput = form.querySelector('input[name="dueDate"]');
    const dueTimeInput = form.querySelector('input[name="dueTime"]');
    const toolbar = form.querySelector('.calendar-toolbar');
    const daysEl = form.querySelector('.calendar-grid');
    const monthYearEl = form.querySelector('.calendar-month-year');

    let viewDate = new Date(initialDate);
    let selectedDate = new Date(initialDate);

    const renderCalendar = () => {
      monthYearEl.textContent = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      daysEl.innerHTML = '';
      const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
      const pad = first.getDay();
      for (let i = 0; i < pad; i++) daysEl.insertAdjacentHTML('beforeend', `<div></div>`);
      const last = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
      const today = new Date();
      for (let d = 1; d <= last; d++) {
        const dt = new Date(viewDate.getFullYear(), viewDate.getMonth(), d);
        const isSel = dt.toDateString() === selectedDate.toDateString();
        const isToday = dt.toDateString() === today.toDateString();
        const classes = [];
        if (isSel) classes.push('selected');
        if (isToday && !isSel) classes.push('today');
        const dayBtn = document.createElement('button');
        dayBtn.type = 'button';
        dayBtn.textContent = d;
        dayBtn.className = classes.join(' ');
        dayBtn.addEventListener('click', () => {
          selectedDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), d);
          dueDateInput.value = fmtDate(selectedDate);
          renderCalendar();
          closeCalendar();
        });
        daysEl.appendChild(dayBtn);
      }
    };

    const openCalendar = () => {
      if (!toolbar) return;
      renderCalendar();
      toolbar.style.display = 'block';
      toolbar.offsetHeight; // Force reflow
      toolbar.classList.add('calendar-slide-in');
    };

    const closeCalendar = () => {
      if (!toolbar) return;
      toolbar.classList.remove('calendar-slide-in');
      toolbar.classList.add('calendar-slide-out');
      const handleEnd = (ev) => {
        if (ev.target !== toolbar) return;
        toolbar.removeEventListener('animationend', handleEnd);
        toolbar.style.display = 'none';
        toolbar.classList.remove('calendar-slide-out');
      };
      toolbar.addEventListener('animationend', handleEnd);
      setTimeout(() => {
        try { toolbar.removeEventListener('animationend', handleEnd); } catch (_) { }
        toolbar.style.display = 'none';
        toolbar.classList.remove('calendar-slide-out');
      }, 350);
    };

    const toggleCalendar = () => {
      const visible = toolbar && toolbar.style.display === 'block';
      if (visible) closeCalendar();
      else openCalendar();
    };

    const close = () => {
      // Close calendar first if open
      if (toolbar && toolbar.style.display === 'block') {
        closeCalendar();
      }
      // Animate out the popover using CSS animation
      pop.classList.remove('--show');
      pop.classList.add('--hide');
      const handlePopoverEnd = (ev) => {
        if (ev.target !== pop) return;
        pop.removeEventListener('animationend', handlePopoverEnd);
        pop.classList.remove('--hide');
        closeReschedulePopover();
      };
      pop.addEventListener('animationend', handlePopoverEnd);
      setTimeout(() => {
        try { pop.removeEventListener('animationend', handlePopoverEnd); } catch (_) { }
        pop.classList.remove('--hide');
        closeReschedulePopover();
      }, 350);
    };

    const onClick = (e) => {
      if (e.target.closest('[data-close]')) {
        e.preventDefault();
        close();
        return;
      }
      if (e.target.closest('.calendar-toggle-btn')) {
        e.preventDefault();
        toggleCalendar();
        return;
      }
      const navBtn = e.target.closest('.calendar-nav-btn');
      if (navBtn) {
        const delta = Number(navBtn.dataset.nav || 0);
        viewDate.setMonth(viewDate.getMonth() + delta);
        renderCalendar();
        return;
      }
    };

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };

    const onOutsideClick = (e) => {
      if (!pop.contains(e.target) && e.target !== anchorEl) {
        close();
      }
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const dueDate = dueDateInput.value.trim();
      const dueTime = normalizeTimeInput(dueTimeInput.value.trim());
      if (!dueDate || !dueTime) return;
      dueTimeInput.value = dueTime;
      await saveReschedule({ dueDate, dueTime });
      close();
      await navigateToAdjacentTask('next');
    });

    pop.addEventListener('click', onClick);
    document.addEventListener('click', onOutsideClick, true);
    document.addEventListener('keydown', onKey);

    _reschedulePopover = pop;
    _reschedulePopoverCleanup = () => {
      document.removeEventListener('click', onOutsideClick, true);
      document.removeEventListener('keydown', onKey);
      if (pop && pop.parentElement) pop.parentElement.removeChild(pop);
      _reschedulePopover = null;
      _reschedulePopoverCleanup = null;
    };
  }

  function closeReschedulePopover() {
    if (_reschedulePopoverCleanup) _reschedulePopoverCleanup();
  }

  function normalizeTimeInput(raw) {
    if (!raw) return '';
    let v = raw.toUpperCase().replace(/[^\dAPM:\s]/g, '').trim();
    v = v.replace(/\s+/g, ' ');
    const match = v.match(/(\d{1,2})(?::?(\d{2}))?\s*(AM|PM)?/);
    if (!match) return raw;
    let h = parseInt(match[1], 10);
    let m = match[2] ? match[2] : '00';
    let ap = match[3] || '';
    if (m.length === 1) m = `0${m}`;
    if (h === 0) h = 12;
    if (h > 12 && !ap) { ap = 'PM'; h = h - 12; }
    if (!ap) ap = 'AM';
    return `${h}:${m} ${ap}`.replace(/\s+/g, ' ').trim();
  }

  async function saveReschedule({ dueDate, dueTime }) {
    const task = state.currentTask;
    if (!task || !task.id) return;

    const payload = {
      dueDate,
      dueTime,
      status: task.status || 'pending',
      updatedAt: Date.now(),
      timestamp: Date.now()
    };

    try {
      if (window.firebaseDB) {
        await window.firebaseDB.collection('tasks').doc(task.id).update(payload);
      }
    } catch (err) {
      console.warn('[TaskDetail] Failed to reschedule task in Firestore', err);
    }

    try { Object.assign(task, payload); } catch (_) { }

    const updateLocalCache = (key) => {
      try {
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        const updated = arr.map(t => {
          if (t && t.id === task.id) return { ...t, ...payload };
          return t;
        });
        localStorage.setItem(key, JSON.stringify(updated));
      } catch (_) { }
    };

    // CRITICAL FIX: Remove task from BackgroundTasksLoader cache FIRST to ensure it's removed from old position
    // This prevents the task from appearing in both old and new positions
    if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.removeTask === 'function') {
      try {
        window.BackgroundTasksLoader.removeTask(task.id);
        // console.log('[TaskDetail] Removed rescheduled task from BackgroundTasksLoader cache');
      } catch (e) {
        console.warn('[TaskDetail] Failed to remove task from BackgroundTasksLoader:', e);
      }
    }

    // Update localStorage with new dueDate/dueTime
    try {
      const getUserEmail = () => {
        try {
          if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') return window.DataManager.getCurrentUserEmail();
          return (window.currentUserEmail || '').toLowerCase();
        } catch (_) { return (window.currentUserEmail || '').toLowerCase(); }
      };
      const email = getUserEmail();
      const namespacedKey = email ? `userTasks:${email}` : 'userTasks';
      updateLocalCache(namespacedKey);
      updateLocalCache('userTasks');
    } catch (_) { }

    // CRITICAL FIX: Invalidate cache BEFORE reloading to ensure fresh data
    if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
      try {
        await window.CacheManager.invalidate('tasks');
        // console.log('[TaskDetail] Invalidated tasks cache after reschedule');
      } catch (_) { }
    }

    // CRITICAL FIX: Force reload BackgroundTasksLoader to get updated task with new dueDate/dueTime
    // Small delay to ensure Firebase update completes
    await new Promise(resolve => setTimeout(resolve, 150));

    if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.forceReload === 'function') {
      try {
        await window.BackgroundTasksLoader.forceReload();
        // console.log('[TaskDetail] BackgroundTasksLoader reloaded after reschedule');
      } catch (e) {
        console.warn('[TaskDetail] Failed to refresh BackgroundTasksLoader after reschedule', e);
      }
    }

    // CRITICAL FIX: Refresh Today's Tasks widget AFTER reload completes
    if (window.crm && typeof window.crm.loadTodaysTasks === 'function') {
      try {
        // Small delay to ensure BackgroundTasksLoader reload completes
        setTimeout(() => {
          window.crm.loadTodaysTasks();
        }, 100);
      } catch (_) { }
    }

    // Dispatch events to notify other components
    window.dispatchEvent(new CustomEvent('tasksUpdated', { detail: { taskId: task.id, rescheduled: true } }));
    document.dispatchEvent(new CustomEvent('pc:task-updated', { detail: { id: task.id, changes: { dueDate, dueTime } } }));

    if (window.crm && typeof window.crm.showToast === 'function') {
      try { window.crm.showToast('Task rescheduled'); } catch (_) { }
    }
  }

  function fmtDate(date) {
    if (!(date instanceof Date) || isNaN(date)) return '';
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  function parseDateStrictSafe(dateStr) {
    if (!dateStr) return null;
    try {
      if (dateStr.includes('/')) {
        const [mm, dd, yyyy] = dateStr.split('/').map(n => parseInt(n, 10));
        if (!isNaN(mm) && !isNaN(dd) && !isNaN(yyyy)) return new Date(yyyy, mm - 1, dd);
      } else if (dateStr.includes('-')) {
        const [yyyy, mm, dd] = dateStr.split('-').map(n => parseInt(n, 10));
        if (!isNaN(mm) && !isNaN(dd) && !isNaN(yyyy)) return new Date(yyyy, mm - 1, dd);
      }
      const d = new Date(dateStr);
      if (!isNaN(d)) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    } catch (_) { }
    return null;
  }

  function positionPopover(anchorEl, pop) {
    try {
      const rect = anchorEl.getBoundingClientRect();
      const popRect = pop.getBoundingClientRect();
      const anchorCenter = rect.left + rect.width / 2;
      const desiredLeft = Math.round(window.scrollX + anchorCenter - popRect.width / 2);
      const clampedLeft = Math.max(8, Math.min(desiredLeft, (window.scrollX + document.documentElement.clientWidth) - popRect.width - 8));
      const top = Math.round(window.scrollY + rect.bottom + 8);
      pop.style.left = `${clampedLeft}px`;
      pop.style.top = `${top}px`;

      // Position arrow to point to the center of the anchor button
      const arrowLeft = Math.round(anchorCenter - clampedLeft);
      pop.style.setProperty('--arrow-left', `${arrowLeft}px`);
      pop.setAttribute('data-placement', 'bottom');
    } catch (_) { }
  }

  // Save task notes to recent activities
  async function saveTaskNotesToRecentActivity(task, notes) {
    if (!notes || !window.firebaseDB) return;

    try {
      const activityData = {
        type: 'task_completed',
        title: `Task completed: ${task.title}`,
        description: notes,
        entityType: isAccountTask(task) ? 'account' : 'contact',
        entityId: isAccountTask(task) ? (task.accountId || '') : (task.contactId || ''),
        entityName: isAccountTask(task) ? (task.account || '') : (task.contact || ''),
        taskType: task.type,
        taskPriority: task.priority,
        completedAt: new Date(),
        createdAt: new Date(),
        userId: window.currentUser?.uid || 'anonymous'
      };

      // Save to Firebase activities collection
      await window.firebaseDB.collection('activities').add({
        ...activityData,
        timestamp: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || Date.now()
      });

      // console.log('Task notes saved to recent activities:', activityData);
    } catch (error) {
      console.error('Error saving task notes to recent activities:', error);
    }
  }

  async function getSortedTasksQueue() {
    // Get all tasks from the same source (localStorage + Firebase) with ownership filtering
    let allTasks = [];

    // Load from localStorage (with ownership filtering)
    try {
      const key = getUserTasksKey();
      const userTasks = JSON.parse(localStorage.getItem(key) || '[]');
      allTasks = filterTasksByOwnership(userTasks);

      // Fallback to legacy key
      if (allTasks.length === 0) {
        const legacyTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
        allTasks = filterTasksByOwnership(legacyTasks);
      }
    } catch (_) { allTasks = []; }

    // Load from BackgroundTasksLoader (cache-first, cost-efficient)
    if (window.BackgroundTasksLoader) {
      try {
        const cachedTasks = window.BackgroundTasksLoader.getTasksData() || [];
        const filteredCached = filterTasksByOwnership(cachedTasks);

        // Merge with localStorage (local takes precedence for duplicates)
        const allTasksMap = new Map();
        allTasks.forEach(t => { if (t && t.id) allTasksMap.set(t.id, t); });
        filteredCached.forEach(t => { if (t && t.id && !allTasksMap.has(t.id)) allTasksMap.set(t.id, t); });
        allTasks = Array.from(allTasksMap.values());
      } catch (e) {
        console.warn('Could not load tasks from BackgroundTasksLoader:', e);
      }
    }

    // CRITICAL FIX: Always add LinkedIn sequence tasks (regardless of BackgroundTasksLoader)
    try {
      const linkedInTasks = await getLinkedInTasksFromSequences();
      const allTasksMap = new Map();
      allTasks.forEach(t => { if (t && t.id) allTasksMap.set(t.id, t); });
      linkedInTasks.forEach(t => { if (t && t.id && !allTasksMap.has(t.id)) allTasksMap.set(t.id, t); });
      allTasks = Array.from(allTasksMap.values());
    } catch (e) {
      console.warn('Could not load LinkedIn tasks for navigation:', e);
    }

    // Only query Firebase if BackgroundTasksLoader doesn't have enough data
    if (allTasks.length < 10 && window.firebaseDB) {
      try {
        let firebaseTasks = [];

        if (!isAdmin()) {
          const email = getUserEmail();
          if (email && window.DataManager && typeof window.DataManager.queryWithOwnership === 'function') {
            firebaseTasks = await window.DataManager.queryWithOwnership('tasks');
            firebaseTasks = firebaseTasks.slice(0, 200);
          } else if (email) {
            // Fallback: two separate queries
            const [ownedSnap, assignedSnap] = await Promise.all([
              window.firebaseDB.collection('tasks')
                .where('ownerId', '==', email)
                .orderBy('timestamp', 'desc')
                .limit(100)
                .get(),
              window.firebaseDB.collection('tasks')
                .where('assignedTo', '==', email)
                .orderBy('timestamp', 'desc')
                .limit(100)
                .get()
            ]);

            const tasksMap = new Map();
            ownedSnap.docs.forEach(doc => {
              const data = doc.data();
              tasksMap.set(doc.id, {
                id: doc.id,
                ...data,
                createdAt: data.createdAt || (data.timestamp && data.timestamp.toDate ? data.timestamp.toDate().getTime() : data.timestamp) || Date.now(),
                status: data.status || 'pending'
              });
            });
            assignedSnap.docs.forEach(doc => {
              if (!tasksMap.has(doc.id)) {
                const data = doc.data();
                tasksMap.set(doc.id, {
                  id: doc.id,
                  ...data,
                  createdAt: data.createdAt || (data.timestamp && data.timestamp.toDate ? data.timestamp.toDate().getTime() : data.timestamp) || Date.now(),
                  status: data.status || 'pending'
                });
              }
            });
            firebaseTasks = Array.from(tasksMap.values());
          }
        } else {
          // Admin: unrestricted query
          const snapshot = await window.firebaseDB.collection('tasks')
            .orderBy('timestamp', 'desc')
            .limit(200)
            .get();
          firebaseTasks = snapshot.docs.map(doc => {
            const data = doc.data() || {};
            const createdAt = data.createdAt || (data.timestamp && typeof data.timestamp.toDate === 'function' ? data.timestamp.toDate().getTime() : data.timestamp) || Date.now();
            return { ...data, id: (data.id || doc.id), createdAt, status: data.status || 'pending' };
          });
        }

        // Merge with existing tasks
        const allTasksMap = new Map();
        allTasks.forEach(t => { if (t && t.id) allTasksMap.set(t.id, t); });
        firebaseTasks.forEach(t => { if (t && t.id && !allTasksMap.has(t.id)) allTasksMap.set(t.id, t); });

        // CRITICAL FIX: Add LinkedIn sequence tasks (in case they weren't loaded earlier)
        const linkedInTasks = await getLinkedInTasksFromSequences();
        linkedInTasks.forEach(t => { if (t && t.id && !allTasksMap.has(t.id)) allTasksMap.set(t.id, t); });

        allTasks = Array.from(allTasksMap.values());
      } catch (e) {
        console.warn('Could not load tasks from Firebase for navigation:', e);
      }
    }

    // Filter to today's and overdue pending tasks (same logic as Today's Tasks widget)
    const today = new Date();
    const localMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const parseDateStrict = (dateStr) => {
      if (!dateStr) return null;
      try {
        if (dateStr.includes('/')) {
          const [mm, dd, yyyy] = dateStr.split('/').map(n => parseInt(n, 10));
          if (!isNaN(mm) && !isNaN(dd) && !isNaN(yyyy)) return new Date(yyyy, mm - 1, dd);
        } else if (dateStr.includes('-')) {
          const [yyyy, mm, dd] = dateStr.split('-').map(n => parseInt(n, 10));
          if (!isNaN(mm) && !isNaN(dd) && !isNaN(yyyy)) return new Date(yyyy, mm - 1, dd);
        }
        const d = new Date(dateStr);
        if (!isNaN(d)) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
      } catch (_) { /* noop */ }
      return null;
    };

    const todaysTasks = allTasks.filter(task => {
      if ((task.status || 'pending') !== 'pending') return false;
      const d = parseDateStrict(task.dueDate);
      if (!d) return false;
      return d.getTime() <= localMidnight.getTime();
    });

    // Sort by due date/time (earliest to latest)
    todaysTasks.sort((a, b) => {
      const da = parseDateStrict(a.dueDate);
      const db = parseDateStrict(b.dueDate);
      if (da && db) {
        const dd = da - db;
        if (dd !== 0) return dd;
      } else if (da && !db) {
        return -1;
      } else if (!da && db) {
        return 1;
      }

      const parseTimeToMinutes = (timeStr) => {
        if (!timeStr || typeof timeStr !== 'string') return NaN;
        const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (!m) return NaN;
        let h = parseInt(m[1], 10);
        const mins = parseInt(m[2], 10);
        const ap = m[3].toUpperCase();
        if (h === 12) h = 0;
        if (ap === 'PM') h += 12;
        return h * 60 + mins;
      };

      const ta = parseTimeToMinutes(a.dueTime);
      const tb = parseTimeToMinutes(b.dueTime);
      const taValid = !isNaN(ta), tbValid = !isNaN(tb);
      if (taValid && tbValid) {
        const td = ta - tb; if (td !== 0) return td;
      } else if (taValid && !tbValid) {
        return -1;
      } else if (!taValid && tbValid) {
        return 1;
      }

      return (a.createdAt || 0) - (b.createdAt || 0);
    });

    return todaysTasks;
  }

  async function navigateToAdjacentTask(direction) {
    if (!state.currentTask) return;

    // Prevent multiple rapid clicks
    if (state.navigating) {
      // console.log('Navigation already in progress, ignoring click');
      return;
    }

    state.navigating = true;

    try {
      const todaysTasks = await getSortedTasksQueue();

      // Find current task index
      const currentIndex = todaysTasks.findIndex(task => task.id === state.currentTask.id);

      // If current task not found (e.g., just completed), find the appropriate next task
      let targetIndex;
      if (currentIndex === -1) {
        // console.log('Current task not found in filtered list (likely just completed)');
        if (direction === 'next') {
          // For next navigation after completion, go to the first remaining task
          targetIndex = 0;
        } else {
          // For previous navigation after completion, go to the last remaining task
          targetIndex = todaysTasks.length - 1;
        }
      } else {
        // Calculate next/previous index normally
        if (direction === 'next') {
          targetIndex = currentIndex + 1;
        } else {
          targetIndex = currentIndex - 1;
        }
      }

      // Check bounds - don't navigate if at the end
      if (targetIndex < 0 || targetIndex >= todaysTasks.length) {
        // console.log(`Navigation ${direction} blocked: targetIndex ${targetIndex}, total tasks ${todaysTasks.length}`);
        return;
      }

      // Navigate to the target task
      const targetTask = todaysTasks[targetIndex];
      if (targetTask && targetTask.id) {
        // console.log(`Navigating ${direction} from task ${currentIndex} to task ${targetIndex}: ${targetTask.title}`);

        // Clean up any existing avatars/icons before loading new task
        cleanupExistingAvatarsAndIcons();

        // CRITICAL FIX: Add error handling for navigation
        try {
          // Load the target task data directly instead of calling TaskDetail.open
          await loadTaskData(targetTask.id);
        } catch (loadError) {
          console.error('[TaskDetail] Failed to load adjacent task:', loadError);
          // Show user-friendly error
          if (window.crm && typeof window.crm.showToast === 'function') {
            window.crm.showToast('Failed to load next task. Please try again.', 'error');
          }
          // Don't navigate away - stay on current task
        }
      }

    } catch (error) {
      console.error('Error navigating to adjacent task:', error);
      // Show user-friendly error
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Navigation error. Please refresh the page.', 'error');
      }
    } finally {
      // Reset navigation flag after a short delay
      setTimeout(() => {
        state.navigating = false;
      }, 500);
    }
  }

  async function updateNavigationButtons() {
    if (!state.currentTask) return;

    const prevBtn = document.getElementById('task-prev-btn');
    const nextBtn = document.getElementById('task-next-btn');

    if (!prevBtn || !nextBtn) return;

    try {
      // Get all tasks (same logic as navigation) with ownership filtering
      let allTasks = [];

      // Load from localStorage (with ownership filtering)
      try {
        const key = getUserTasksKey();
        const userTasks = JSON.parse(localStorage.getItem(key) || '[]');
        allTasks = filterTasksByOwnership(userTasks);

        // Fallback to legacy key
        if (allTasks.length === 0) {
          const legacyTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
          allTasks = filterTasksByOwnership(legacyTasks);
        }
      } catch (_) { allTasks = []; }

      // Load from BackgroundTasksLoader (cache-first, cost-efficient)
      if (window.BackgroundTasksLoader) {
        try {
          const cachedTasks = window.BackgroundTasksLoader.getTasksData() || [];
          const filteredCached = filterTasksByOwnership(cachedTasks);

          // Merge with localStorage (local takes precedence for duplicates)
          const allTasksMap = new Map();
          allTasks.forEach(t => { if (t && t.id) allTasksMap.set(t.id, t); });
          filteredCached.forEach(t => { if (t && t.id && !allTasksMap.has(t.id)) allTasksMap.set(t.id, t); });
          allTasks = Array.from(allTasksMap.values());
        } catch (e) {
          console.warn('Could not load tasks from BackgroundTasksLoader:', e);
        }
      }

      // Only query Firebase if BackgroundTasksLoader doesn't have enough data
      if (allTasks.length < 10 && window.firebaseDB) {
        try {
          let firebaseTasks = [];

          if (!isAdmin()) {
            const email = getUserEmail();
            if (email && window.DataManager && typeof window.DataManager.queryWithOwnership === 'function') {
              firebaseTasks = await window.DataManager.queryWithOwnership('tasks');
              firebaseTasks = firebaseTasks.slice(0, 200);
            } else if (email) {
              // Fallback: two separate queries
              const [ownedSnap, assignedSnap] = await Promise.all([
                window.firebaseDB.collection('tasks')
                  .where('ownerId', '==', email)
                  .orderBy('timestamp', 'desc')
                  .limit(100)
                  .get(),
                window.firebaseDB.collection('tasks')
                  .where('assignedTo', '==', email)
                  .orderBy('timestamp', 'desc')
                  .limit(100)
                  .get()
              ]);

              const tasksMap = new Map();
              ownedSnap.docs.forEach(doc => {
                const data = doc.data();
                tasksMap.set(doc.id, {
                  id: doc.id,
                  ...data,
                  createdAt: data.createdAt || (data.timestamp && data.timestamp.toDate ? data.timestamp.toDate().getTime() : data.timestamp) || Date.now(),
                  status: data.status || 'pending'
                });
              });
              assignedSnap.docs.forEach(doc => {
                if (!tasksMap.has(doc.id)) {
                  const data = doc.data();
                  tasksMap.set(doc.id, {
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt || (data.timestamp && data.timestamp.toDate ? data.timestamp.toDate().getTime() : data.timestamp) || Date.now(),
                    status: data.status || 'pending'
                  });
                }
              });
              firebaseTasks = Array.from(tasksMap.values());
            }
          } else {
            // Admin: unrestricted query
            const snapshot = await window.firebaseDB.collection('tasks')
              .orderBy('timestamp', 'desc')
              .limit(200)
              .get();
            firebaseTasks = snapshot.docs.map(doc => {
              const data = doc.data() || {};
              const createdAt = data.createdAt || (data.timestamp && typeof data.timestamp.toDate === 'function' ? data.timestamp.toDate().getTime() : data.timestamp) || Date.now();
              return { ...data, id: (data.id || doc.id), createdAt, status: data.status || 'pending' };
            });
          }

          // Merge with existing tasks
          const allTasksMap = new Map();
          allTasks.forEach(t => { if (t && t.id) allTasksMap.set(t.id, t); });
          firebaseTasks.forEach(t => { if (t && t.id && !allTasksMap.has(t.id)) allTasksMap.set(t.id, t); });

          // CRITICAL FIX: Add LinkedIn sequence tasks
          const linkedInTasks = await getLinkedInTasksFromSequences();
          linkedInTasks.forEach(t => { if (t && t.id && !allTasksMap.has(t.id)) allTasksMap.set(t.id, t); });

          allTasks = Array.from(allTasksMap.values());
        } catch (e) {
          console.warn('Could not load tasks from Firebase for navigation buttons:', e);
        }
      }

      // Filter to today's and overdue pending tasks
      const today = new Date();
      const localMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      const parseDateStrict = (dateStr) => {
        if (!dateStr) return null;
        try {
          if (dateStr.includes('/')) {
            const [mm, dd, yyyy] = dateStr.split('/').map(n => parseInt(n, 10));
            if (!isNaN(mm) && !isNaN(dd) && !isNaN(yyyy)) return new Date(yyyy, mm - 1, dd);
          } else if (dateStr.includes('-')) {
            const [yyyy, mm, dd] = dateStr.split('-').map(n => parseInt(n, 10));
            if (!isNaN(mm) && !isNaN(dd) && !isNaN(yyyy)) return new Date(yyyy, mm - 1, dd);
          }
          const d = new Date(dateStr);
          if (!isNaN(d)) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
        } catch (_) { /* noop */ }
        return null;
      };

      const todaysTasks = allTasks.filter(task => {
        if ((task.status || 'pending') !== 'pending') return false;
        const d = parseDateStrict(task.dueDate);
        if (!d) return false;
        return d.getTime() <= localMidnight.getTime();
      });

      // Sort by due date/time (same logic as navigation)
      todaysTasks.sort((a, b) => {
        const da = parseDateStrict(a.dueDate);
        const db = parseDateStrict(b.dueDate);
        if (da && db) {
          const dd = da - db;
          if (dd !== 0) return dd;
        } else if (da && !db) {
          return -1;
        } else if (!da && db) {
          return 1;
        }

        const parseTimeToMinutes = (timeStr) => {
          if (!timeStr || typeof timeStr !== 'string') return NaN;
          const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
          if (!m) return NaN;
          let h = parseInt(m[1], 10);
          const mins = parseInt(m[2], 10);
          const ap = m[3].toUpperCase();
          if (h === 12) h = 0;
          if (ap === 'PM') h += 12;
          return h * 60 + mins;
        };

        const ta = parseTimeToMinutes(a.dueTime);
        const tb = parseTimeToMinutes(b.dueTime);
        const taValid = !isNaN(ta), tbValid = !isNaN(tb);
        if (taValid && tbValid) {
          const td = ta - tb; if (td !== 0) return td;
        } else if (taValid && !tbValid) {
          return -1;
        } else if (!taValid && tbValid) {
          return 1;
        }

        return (a.createdAt || 0) - (b.createdAt || 0);
      });

      // Find current task index
      const currentIndex = todaysTasks.findIndex(task => task.id === state.currentTask.id);

      // Update button states
      if (currentIndex === -1) {
        // Current task not found in filtered list
        prevBtn.disabled = true;
        nextBtn.disabled = true;
      } else {
        // Enable/disable based on position
        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = currentIndex === todaysTasks.length - 1;
      }

    } catch (error) {
      console.error('Error updating navigation buttons:', error);
      // Disable both buttons on error
      prevBtn.disabled = true;
      nextBtn.disabled = true;
    }
  }

  /**
   * Fetch list and sequence memberships for a set of contacts and store in state
   */
  async function fetchContactMemberships(contacts) {
    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) return;
    if (!window.firebaseDB) return;

    try {
      const contactIds = contacts.map(c => c.id || c.contactId).filter(Boolean);
      if (contactIds.length === 0) return;

      // Reset memberships for these contacts to avoid stale data
      contactIds.forEach(id => {
        state._contactListMemberships[id] = [];
        state._contactSequenceMemberships[id] = [];
      });

      const db = window.firebaseDB;
      const listsData = (window.BackgroundListsLoader && typeof window.BackgroundListsLoader.getListsData === 'function')
        ? window.BackgroundListsLoader.getListsData()
        : [];

      const sequencesData = (window.BackgroundSequencesLoader && typeof window.BackgroundSequencesLoader.getSequencesData === 'function')
        ? window.BackgroundSequencesLoader.getSequencesData()
        : [];

      // Fetch in chunks of 30 (Firestore IN limit)
      for (let i = 0; i < contactIds.length; i += 30) {
        const chunk = contactIds.slice(i, i + 30);

        // Fetch List Memberships
        const listSnapshot = await db.collection('listMembers')
          .where('targetType', 'in', ['people', 'contact', 'contacts'])
          .where('targetId', 'in', chunk)
          .get();

        listSnapshot.forEach(doc => {
          const data = doc.data();
          const contactId = data.targetId;
          const listId = data.listId;
          const list = listsData.find(l => l.id === listId);
          if (list && list.name) {
            if (!state._contactListMemberships[contactId]) state._contactListMemberships[contactId] = [];
            if (!state._contactListMemberships[contactId].includes(list.name)) {
              state._contactListMemberships[contactId].push(list.name);
            }
          }
        });

        // Fetch Sequence Memberships
        const sequenceSnapshot = await db.collection('sequenceMembers')
          .where('targetType', 'in', ['people', 'contact', 'contacts'])
          .where('targetId', 'in', chunk)
          .get();

        sequenceSnapshot.forEach(doc => {
          const data = doc.data();
          const contactId = data.targetId;
          const sequenceId = data.sequenceId;
          const sequence = sequencesData.find(s => s.id === sequenceId);
          if (sequence && sequence.name) {
            if (!state._contactSequenceMemberships[contactId]) state._contactSequenceMemberships[contactId] = [];
            if (!state._contactSequenceMemberships[contactId].includes(sequence.name)) {
              state._contactSequenceMemberships[contactId].push(sequence.name);
            }
          }
        });
      }
    } catch (error) {
      console.warn('[TaskDetail] Failed to fetch contact memberships:', error);
    }
  }

  async function loadTaskData(taskId) {
    const t0 = performance.now();

    let loadToken = 0;

    try {
      const page = els.page || document.getElementById('task-detail-page');
      if (page && page.classList.contains('task-loaded') && state.currentTask && String(state.currentTask.id) === String(taskId)) {
        return;
      }
    } catch (_) { }

    // CRITICAL FIX: Prevent race conditions - if already loading, queue latest request
    if (state.loadingTask) {
      state._pendingTaskId = taskId;
      console.warn('[TaskDetail] Task load already in progress, queuing latest taskId');
      return;
    }

    state.loadingTask = true;

    if (!taskId) {
      console.error('[TaskDetail] No taskId provided to loadTaskData');
      showTaskError('No task ID provided');
      state.loadingTask = false;
      return;
    }

    loadToken = ++state._loadToken;
    state._activeLoadToken = loadToken;
    state._activeTaskId = taskId;

    // CRITICAL FIX: Clear previous state to prevent stale data from persisting
    state.contact = null;
    state.account = null;
    state._taskAccountFound = false;
    state._taskAccountNotFound = false;
    // Clear currentTask to prevent UI from rendering stale data during load
    // But keep ID if needed? No, loadTaskData takes taskId as arg.
    if (state.currentTask && state.currentTask.id !== taskId) {
      state.currentTask = null;
    }


    try {
      // CRITICAL: Re-initialize DOM refs to ensure els.content exists
      if (!initDomRefs()) {
        console.warn('[TaskDetail] DOM not ready, retrying...');
        // CRITICAL FIX: Reset loading flag before retry to prevent deadlock
        state.loadingTask = false;

        // Retry after a short delay (max 10 attempts with exponential backoff)
        let retryCount = 0;
        const maxRetries = 10;
        const retry = () => {
          if (retryCount >= maxRetries) {
            console.error('[TaskDetail] Failed to initialize DOM refs after', maxRetries, 'attempts');
            showTaskError('Page not ready. Please refresh.');
            state.loadingTask = false; // Ensure flag is reset
            return;
          }
          retryCount++;
          const delay = Math.min(100 * retryCount, 500); // Exponential backoff, max 500ms
          setTimeout(async () => {
            if (initDomRefs()) {
              await loadTaskData(taskId);
            } else {
              retry();
            }
          }, delay);
        };
        retry();
        return;
      }

      markTaskLoading();

      // Load task from localStorage and Firebase with ownership filtering
      let task = null;

      // Try localStorage first (with ownership filtering)
      try {
        const key = getUserTasksKey();
        const userTasks = JSON.parse(localStorage.getItem(key) || '[]');
        const filteredTasks = filterTasksByOwnership(userTasks);
        task = filteredTasks.find(t => t.id === taskId);

        // Fallback to legacy key if not found
        if (!task) {
          const legacyTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
          const filteredLegacy = filterTasksByOwnership(legacyTasks);
          task = filteredLegacy.find(t => t.id === taskId);
        }
      } catch (e) {
        console.warn('Could not load task from localStorage:', e);
      }

      // If not found, try pre-loaded essential data (with ownership filtering)
      if (!task && window._essentialTasksData) {
        const filteredEssential = filterTasksByOwnership(window._essentialTasksData);
        task = filteredEssential.find(t => t.id === taskId);
      }

      // If not found, try BackgroundTasksLoader (cache-first, cost-efficient)
      if (!task && window.BackgroundTasksLoader) {
        try {
          const allTasks = window.BackgroundTasksLoader.getTasksData() || [];
          const filteredTasks = filterTasksByOwnership(allTasks);

          // Try exact match first
          task = filteredTasks.find(t => t && (t.id === taskId || String(t.id) === String(taskId)));

          // If still not found, try document ID match (some tasks might have id field different from doc ID)
          if (!task) {
            task = filteredTasks.find(t => {
              const docId = t._docId || t._id || '';
              return docId === taskId || String(docId) === String(taskId);
            });
          }

          if (task) {
            // console.log('[TaskDetail] Using BackgroundTasksLoader cached data');
          } else {
            // console.log('[TaskDetail] Task not found in BackgroundTasksLoader cache, will try Firebase');
          }
        } catch (e) {
          console.warn('Could not load task from BackgroundTasksLoader:', e);
        }
      }

      // If not found, try Firebase (with ownership filtering)
      if (!task && window.firebaseDB) {
        try {
          // CRITICAL FIX: Try multiple strategies to find the task
          // Strategy 1: Try to get document directly by ID (if taskId is a document ID)
          try {
            const directDoc = await window.firebaseDB.collection('tasks').doc(taskId).get();
            if (directDoc.exists) {
              const data = directDoc.data();
              // Verify ownership for non-admin users
              if (isAdmin() || !data.ownerId && !data.assignedTo) {
                // Admin or no ownership fields - allow
                task = { ...data, id: data.id || directDoc.id };
                // console.log('[TaskDetail] Found task by document ID:', directDoc.id);
              } else {
                const email = getUserEmail();
                const ownerId = (data.ownerId || '').toLowerCase();
                const assignedTo = (data.assignedTo || '').toLowerCase();
                const createdBy = (data.createdBy || '').toLowerCase();
                if (ownerId === email || assignedTo === email || createdBy === email) {
                  task = { ...data, id: data.id || directDoc.id };
                  // console.log('[TaskDetail] Found task by document ID (ownership verified):', directDoc.id);
                }
              }
            }
          } catch (directError) {
            // console.log('[TaskDetail] Direct document lookup failed, trying queries:', directError);
          }

          // Strategy 2: Query by 'id' field (if taskId is stored as a field)
          if (!task) {
            // Use ownership-aware query for non-admin users
            if (!isAdmin()) {
              const email = getUserEmail();
              if (email && window.DataManager && typeof window.DataManager.queryWithOwnership === 'function') {
                const allTasks = await window.DataManager.queryWithOwnership('tasks');
                task = allTasks.find(t => (t.id === taskId) || (t.id && String(t.id) === String(taskId)));
                if (task) {
                  // console.log('[TaskDetail] Found task via DataManager.queryWithOwnership');
                }
              } else if (email) {
                // Fallback: try queries with 'id' field
                try {
                  const [ownedSnap, assignedSnap] = await Promise.all([
                    window.firebaseDB.collection('tasks')
                      .where('id', '==', taskId)
                      .where('ownerId', '==', email)
                      .limit(1)
                      .get(),
                    window.firebaseDB.collection('tasks')
                      .where('id', '==', taskId)
                      .where('assignedTo', '==', email)
                      .limit(1)
                      .get()
                  ]);

                  if (!ownedSnap.empty) {
                    const doc = ownedSnap.docs[0];
                    const data = doc.data();
                    task = { ...data, id: data.id || doc.id };
                    // console.log('[TaskDetail] Found task via ownerId query:', doc.id);
                  } else if (!assignedSnap.empty) {
                    const doc = assignedSnap.docs[0];
                    const data = doc.data();
                    task = { ...data, id: data.id || doc.id };
                    // console.log('[TaskDetail] Found task via assignedTo query:', doc.id);
                  }
                } catch (queryError) {
                  console.warn('[TaskDetail] Query by id field failed (may not be indexed):', queryError);
                }
              }
            } else {
              // Admin: unrestricted query
              try {
                const snapshot = await window.firebaseDB.collection('tasks')
                  .where('id', '==', taskId)
                  .limit(1)
                  .get();

                if (!snapshot.empty) {
                  const doc = snapshot.docs[0];
                  const data = doc.data();
                  task = { ...data, id: data.id || doc.id };
                }
              } catch (queryError) {
                console.warn('[TaskDetail] Admin query by id field failed (may not be indexed):', queryError);
              }
            }
          }

          // Strategy 3: Load all tasks and find by ID (fallback if queries fail)
          if (!task) {
            // console.log('[TaskDetail] Trying fallback: load all tasks and find by ID');
            try {
              let allTasks = [];
              if (!isAdmin()) {
                const email = getUserEmail();
                if (email && window.DataManager && typeof window.DataManager.queryWithOwnership === 'function') {
                  allTasks = await window.DataManager.queryWithOwnership('tasks');
                } else if (email) {
                  const [ownedSnap, assignedSnap] = await Promise.all([
                    window.firebaseDB.collection('tasks')
                      .where('ownerId', '==', email)
                      .limit(200)
                      .get(),
                    window.firebaseDB.collection('tasks')
                      .where('assignedTo', '==', email)
                      .limit(200)
                      .get()
                  ]);
                  const tasksMap = new Map();
                  ownedSnap.docs.forEach(doc => {
                    const data = doc.data();
                    tasksMap.set(doc.id, { ...data, id: data.id || doc.id });
                  });
                  assignedSnap.docs.forEach(doc => {
                    if (!tasksMap.has(doc.id)) {
                      const data = doc.data();
                      tasksMap.set(doc.id, { ...data, id: data.id || doc.id });
                    }
                  });
                  allTasks = Array.from(tasksMap.values());
                }
              } else {
                const snapshot = await window.firebaseDB.collection('tasks')
                  .limit(200)
                  .get();
                allTasks = snapshot.docs.map(doc => {
                  const data = doc.data();
                  return { ...data, id: data.id || doc.id };
                });
              }

              // Find task by matching id field or document ID
              task = allTasks.find(t => {
                const tId = t.id || '';
                const docId = t._docId || '';
                return String(tId) === String(taskId) || String(docId) === String(taskId);
              });

              if (task) {
                // console.log('[TaskDetail] Found task via fallback search through all tasks');
              }
            } catch (fallbackError) {
              console.warn('[TaskDetail] Fallback search failed:', fallbackError);
            }
          }

          if (task) {
            const createdAt = task.createdAt || (task.timestamp && typeof task.timestamp.toDate === 'function' ?
              task.timestamp.toDate().getTime() : task.timestamp) || Date.now();
            task.createdAt = createdAt;
            task.status = task.status || 'pending';
          } else {
            console.warn('[TaskDetail] Task not found in Firebase after all strategies:', taskId);
          }
        } catch (error) {
          console.error('[TaskDetail] Error loading task data:', error);
        }
      }

      if (!task) {
        console.error('[TaskDetail] Task not found after all attempts:', taskId);
        /* console.log('[TaskDetail] Debug info:', {
          taskId,
          hasFirebase: !!window.firebaseDB,
          hasBackgroundLoader: !!window.BackgroundTasksLoader,
          backgroundLoaderCount: window.BackgroundTasksLoader ? (window.BackgroundTasksLoader.getTasksData() || []).length : 0,
          localStorageKey: getUserTasksKey(),
          localStorageCount: (JSON.parse(localStorage.getItem(getUserTasksKey()) || '[]')).length,
          legacyLocalStorageCount: (JSON.parse(localStorage.getItem('userTasks') || '[]')).length
        }); */

        // CRITICAL FIX: Try force reloading cache before giving up
        try {
          if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.forceReload === 'function') {
            // console.log('[TaskDetail] Task not found in cache, forcing cache reload...');
            await window.BackgroundTasksLoader.forceReload();

            // Try one more time after reload
            const reloadedTasks = window.BackgroundTasksLoader.getTasksData() || [];
            const filteredReloaded = filterTasksByOwnership(reloadedTasks);
            task = filteredReloaded.find(t => t && (t.id === taskId || String(t.id) === String(taskId)));

            if (task) {
              // console.log('[TaskDetail] Found task after force reload');
            } else {
              console.warn('[TaskDetail] Task still not found after force reload');
            }
          }
        } catch (reloadError) {
          console.warn('[TaskDetail] Error during force reload:', reloadError);
        }

        if (!task) {
          // CRITICAL FIX: Treat this as a stale/ghost task and clean it up locally
          try {
            cleanupStaleTask(taskId);
          } catch (_) { }

          showTaskError('Task not found or you do not have access to this task. Please refresh the page.');
          state.loadingTask = false;
          return;
        }
      }

      // CRITICAL FIX: Validate task data before normalization
      if (typeof task !== 'object' || !task.id) {
        console.error('[TaskDetail] Invalid task data:', task);
        // console.log('[TaskDetail] Task object keys:', task ? Object.keys(task) : 'null');
        showTaskError('Invalid task data. Please refresh the page.');
        state.loadingTask = false;
        return;
      }

      // CRITICAL FIX: Ensure task has all required fields with defaults
      task.title = task.title || 'Untitled Task';
      task.type = task.type || 'custom-task';
      task.status = task.status || 'pending';
      task.dueDate = task.dueDate || '';
      task.dueTime = task.dueTime || '';
      task.contact = task.contact || '';
      task.account = task.account || '';
      task.contactId = task.contactId || '';
      task.accountId = task.accountId || '';

      /* console.log('[TaskDetail] Task validated and normalized:', {
        id: task.id,
        type: task.type,
        title: task.title,
        hasContact: !!task.contact,
        hasAccount: !!task.account
      }); */

      // Normalize legacy task shapes/titles/types
      const normType = (t) => {
        const s = String(t || '').toLowerCase().trim();
        if (s === 'phone call' || s === 'phone' || s === 'call') return 'phone-call';
        if (s === 'manual email' || s === 'email' || s === 'manual-email') return 'manual-email';
        if (s === 'auto email' || s === 'automatic email' || s === 'auto-email') return 'auto-email';
        if (s === 'follow up' || s === 'follow-up') return 'follow-up';
        if (s === 'custom task' || s === 'custom-task' || s === 'task') return 'custom-task';
        if (s === 'demo') return 'demo';
        if (s === 'li-connect' || s === 'linkedin-connect' || s === 'linkedin - send connection request') return 'li-connect';
        if (s === 'li-message' || s === 'linkedin-message' || s === 'linkedin - send message') return 'li-message';
        if (s === 'li-view-profile' || s === 'linkedin-view' || s === 'linkedin - view profile') return 'li-view-profile';
        if (s === 'li-interact-post' || s === 'linkedin-interact' || s === 'linkedin - interact with post') return 'li-interact-post';
        return t || 'custom-task';
      };
      task.type = normType(task.type);
      // Upgrade legacy title like "Task — Name" to descriptive form
      try {
        const looksLegacy = /^task\s+[—-]\s+/i.test(String(task.title || ''));
        if (looksLegacy && window.crm && typeof window.crm.buildTaskTitle === 'function') {
          task.title = window.crm.buildTaskTitle(task.type, task.contact || '', task.account || '');
        }
      } catch (_) { }

      state.currentTask = task;
      state.taskType = task.type;

      /* console.log('[TaskDetail] Task loaded, preparing to render:', {
        id: task.id,
        type: task.type,
        title: task.title,
        contact: task.contact,
        account: task.account
      }); */

      // Load contact/account data - AWAIT to ensure data is loaded before rendering
      await loadContactAccountData(task);

      /* console.log('[TaskDetail] Contact/account data loading complete:', {
        hasContact: !!state.contact,
        hasAccount: !!state.account,
        contactId: state.contact?.id,
        accountId: state.account?.id
      }); */

      // CRITICAL FIX: Ensure DOM is ready before rendering
      if (!els.content) {
        console.warn('[TaskDetail] Content element not found, retrying DOM init...');
        if (!initDomRefs()) {
          console.error('[TaskDetail] Failed to initialize DOM refs for rendering');
          showTaskError('Page not ready. Please refresh.');
          state.loadingTask = false;
          return;
        }
      }

      // Render the task page
      try {
        await renderTaskPage();
      } catch (renderError) {
        console.error('[TaskDetail] Error rendering task page:', renderError);
        showTaskError('Failed to render task. Please refresh the page.');
      }
    } catch (error) {
      console.error('[TaskDetail] Error loading task data:', error);
      console.error('[TaskDetail] Error details:', {
        taskId,
        error: error.message,
        stack: error.stack,
        hasFirebase: !!window.firebaseDB,
        hasBackgroundLoader: !!window.BackgroundTasksLoader,
        backgroundLoaderCount: window.BackgroundTasksLoader ? (window.BackgroundTasksLoader.getTasksData() || []).length : 0
      });
      showTaskError('Failed to load task. Please try again or refresh the page.');
    } finally {
      // CRITICAL FIX: Always reset loading flag, even on error
      state.loadingTask = false;

      try {
        if (loadToken && loadToken === state._activeLoadToken && String(taskId) === String(state._activeTaskId)) {
          markTaskLoaded(loadToken, taskId);
        }
      } catch (_) { }

      try {
        const pendingTaskId = state._pendingTaskId;
        if (pendingTaskId && String(pendingTaskId) !== String(taskId)) {
          state._pendingTaskId = null;
          setTimeout(async () => {
            try { await loadTaskData(pendingTaskId); } catch (_) { }
          }, 0);
        } else {
          state._pendingTaskId = null;
        }
      } catch (_) {
        state._pendingTaskId = null;
      }
    }
  }

  // CRITICAL FIX: Helper function to show errors even if DOM isn't ready
  function showTaskError(message) {
    try {
      if (els.content) {
        els.content.innerHTML = `<div class="empty" style="padding: 2rem; text-align: center; color: var(--text-secondary);">${escapeHtml(message)}</div>`;
      } else {
        // Fallback: try to find content element or create error display
        const page = document.getElementById('task-detail-page');
        if (page) {
          const errorDiv = document.createElement('div');
          errorDiv.className = 'empty';
          errorDiv.style.cssText = 'padding: 2rem; text-align: center; color: var(--text-secondary); position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--border-radius-lg); z-index: 10000;';
          errorDiv.textContent = message;
          page.appendChild(errorDiv);
        } else {
          // Last resort: alert
          alert(message);
        }
      }
    } catch (e) {
      console.error('[TaskDetail] Failed to show error message:', e);
      alert(message); // Final fallback
    }
  }

  // CRITICAL FIX: Clean up stale tasks that can no longer be loaded
  function cleanupStaleTask(taskId) {
    if (!taskId) return;

    try {
      // Remove from namespaced localStorage key
      try {
        const key = getUserTasksKey();
        const userTasks = JSON.parse(localStorage.getItem(key) || '[]');
        const filteredTasks = userTasks.filter(t => t && t.id !== taskId);
        localStorage.setItem(key, JSON.stringify(filteredTasks));
      } catch (e) {
        console.warn('[TaskDetail] Failed to remove stale task from namespaced localStorage:', e);
      }

      // Also clean up legacy key
      try {
        const legacyTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
        const filteredLegacy = legacyTasks.filter(t => t && t.id !== taskId);
        localStorage.setItem('userTasks', JSON.stringify(filteredLegacy));
      } catch (e) {
        console.warn('[TaskDetail] Failed to remove stale task from legacy localStorage:', e);
      }

      // Best-effort cache cleanup so BackgroundTasksLoader won't keep returning the ghost task
      try {
        if (window.CacheManager && typeof window.CacheManager.deleteRecord === 'function') {
          window.CacheManager.deleteRecord('tasks', taskId);
        } else if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
          // Fallback: invalidate entire tasks cache
          window.CacheManager.invalidate('tasks');
        }
      } catch (e) {
        console.warn('[TaskDetail] Failed to clean up stale task from cache:', e);
      }

      // Notify other pages (Tasks page, dashboard widget) to refresh their task lists
      try {
        window.dispatchEvent(new CustomEvent('tasksUpdated', {
          detail: { source: 'staleCleanup', taskId }
        }));
      } catch (e) {
        console.warn('[TaskDetail] Failed to dispatch tasksUpdated for stale task cleanup:', e);
      }

      // console.log('[TaskDetail] Cleaned up stale task locally:', taskId);
    } catch (e) {
      console.warn('[TaskDetail] Unexpected error during stale task cleanup:', e);
    }
  }

  async function loadContactAccountData(task) {
    if (!task) return;

    // CRITICAL FIX: Load data from CacheManager first (most reliable source)
    // This ensures data is available even if page modules haven't loaded yet
    let contactsData = [];
    let accountsData = [];

    // Method 1: Try CacheManager first (most reliable - always available)
    if (window.CacheManager && typeof window.CacheManager.get === 'function') {
      try {
        // console.log('[TaskDetail] Loading contacts/accounts from CacheManager...');
        const [cachedContacts, cachedAccounts] = await Promise.all([
          window.CacheManager.get('contacts').catch(() => []),
          window.CacheManager.get('accounts').catch(() => [])
        ]);
        contactsData = cachedContacts || [];
        accountsData = cachedAccounts || [];
        // console.log('[TaskDetail] CacheManager returned', contactsData.length, 'contacts,', accountsData.length, 'accounts');
      } catch (e) {
        console.warn('[TaskDetail] CacheManager failed:', e);
      }
    }

    // Method 2: Try getPeopleData/getAccountsData (page module data)
    if (contactsData.length === 0 && typeof window.getPeopleData === 'function') {
      contactsData = window.getPeopleData() || [];
      // console.log('[TaskDetail] getPeopleData returned', contactsData.length, 'contacts');
    }
    if (accountsData.length === 0 && typeof window.getAccountsData === 'function') {
      accountsData = window.getAccountsData(true) || [];
      // console.log('[TaskDetail] getAccountsData returned', accountsData.length, 'accounts');
    }

    // Method 3: Try BackgroundContactsLoader/BackgroundAccountsLoader if available
    if (contactsData.length === 0 && window.BackgroundContactsLoader) {
      contactsData = window.BackgroundContactsLoader.getContactsData() || [];
      // console.log('[TaskDetail] BackgroundContactsLoader returned', contactsData.length, 'contacts');
    }
    if (accountsData.length === 0 && window.BackgroundAccountsLoader) {
      accountsData = window.BackgroundAccountsLoader.getAccountsData() || [];
      // console.log('[TaskDetail] BackgroundAccountsLoader returned', accountsData.length, 'accounts');
    }

    // Method 4: If still no data, retry with CacheManager (no artificial delay)
    if ((contactsData.length === 0 || accountsData.length === 0) && window.CacheManager) {
      try {
        if (contactsData.length === 0) {
          contactsData = await window.CacheManager.get('contacts').catch(() => []) || [];
        }
        if (accountsData.length === 0) {
          accountsData = await window.CacheManager.get('accounts').catch(() => []) || [];
        }
      } catch (e) {
        console.warn('[TaskDetail] Retry CacheManager failed:', e);
      }
    }

    // Load contact data if available
    if (task.contactId || task.contact) {
      try {
        let contact = null;

        // Try to find by contactId first
        if (task.contactId && contactsData.length > 0) {
          contact = contactsData.find(p => p.id === task.contactId);
          // if (contact) console.log('[TaskDetail] Found contact by ID:', task.contactId);
        }

        // Fallback: try to find by name
        if (!contact && task.contact && contactsData.length > 0) {
          contact = contactsData.find(p => {
            const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
            return fullName && fullName.toLowerCase() === String(task.contact).toLowerCase();
          });
          // if (contact) console.log('[TaskDetail] Found contact by name:', task.contact);
        }

        // LAST RESORT: Direct Firebase query if cache/loaders failed
        if (!contact && window.firebaseDB) {
          // console.log('[TaskDetail] Cache miss - querying Firebase directly for contact...');
          try {
            // Try by ID first (direct document lookup - most efficient)
            if (task.contactId) {
              const doc = await window.firebaseDB.collection('contacts').doc(task.contactId).get();
              if (doc.exists) {
                contact = { id: doc.id, ...doc.data() };
                // console.log('[TaskDetail] ✓ Found contact via direct Firebase query by ID');
              }
            }

            // If not found by ID, try by name (requires query)
            if (!contact && task.contact) {
              // Query by firstName + lastName combination
              const nameParts = String(task.contact).trim().split(/\s+/);
              if (nameParts.length >= 2) {
                const firstName = nameParts[0];
                const lastName = nameParts.slice(1).join(' ');
                const snap = await window.firebaseDB.collection('contacts')
                  .where('firstName', '==', firstName)
                  .where('lastName', '==', lastName)
                  .limit(1)
                  .get();
                if (!snap.empty) {
                  const doc = snap.docs[0];
                  contact = { id: doc.id, ...doc.data() };
                  // console.log('[TaskDetail] ✓ Found contact via Firebase query by name');
                }
              }
            }
          } catch (fbError) {
            console.warn('[TaskDetail] Firebase direct query failed:', fbError);
          }
        }

        if (contact) {
          state.contact = contact;
          // console.log('[TaskDetail] ✓ Loaded contact data:', contact.id, contact.firstName, contact.lastName);
        } else {
          console.warn('[TaskDetail] ✗ Could not find contact:', task.contactId || task.contact, '(searched', contactsData.length, 'contacts + Firebase)');
        }
      } catch (e) {
        console.warn('[TaskDetail] Error loading contact data:', e);
      }
    }

    // Load account data if available
    if (task.accountId || task.account) {
      try {
        let account = null;
        const taskHasAccountName = !!(task.account && task.account.trim());

        // Try to find by accountId first
        if (task.accountId && accountsData.length > 0) {
          account = accountsData.find(a => a.id === task.accountId);
        }

        // Fallback: try to find by name
        if (!account && task.account && accountsData.length > 0) {
          account = accountsData.find(a => {
            const accountName = a.accountName || a.name || a.companyName || '';
            return accountName && accountName.toLowerCase() === String(task.account).toLowerCase();
          });
        }

        // LAST RESORT: Direct Firebase query if cache/loaders failed
        if (!account && window.firebaseDB) {
          // console.log('[TaskDetail] Cache miss - querying Firebase directly for account...');
          try {
            // Try by ID first (direct document lookup - most efficient)
            if (task.accountId) {
              const doc = await window.firebaseDB.collection('accounts').doc(task.accountId).get();
              if (doc.exists) {
                account = { id: doc.id, ...doc.data() };
              }
            }

            // If not found by ID, try by name (requires query)
            if (!account && task.account) {
              // Query by accountName field
              const snap = await window.firebaseDB.collection('accounts')
                .where('accountName', '==', task.account)
                .limit(1)
                .get();
              if (!snap.empty) {
                const doc = snap.docs[0];
                account = { id: doc.id, ...doc.data() };
                // console.log('[TaskDetail] ✓ Found account via Firebase query by accountName');
              }

              // Also try 'name' field as fallback
              if (!account) {
                const snap2 = await window.firebaseDB.collection('accounts')
                  .where('name', '==', task.account)
                  .limit(1)
                  .get();
                if (!snap2.empty) {
                  const doc = snap2.docs[0];
                  account = { id: doc.id, ...doc.data() };
                }
              }
            }
          } catch (fbError) {
            console.warn('[TaskDetail] Firebase direct query failed:', fbError);
          }
        }

        if (account) {
          state.account = account;
          // Mark that we successfully found the account for this task
          state._taskAccountFound = true;
          // console.log('[TaskDetail] ✓ Loaded account data:', account.id, account.accountName || account.name);
        } else {
          // CRITICAL FIX: Explicitly set state.account to null when account is not found
          // This prevents stale account data from previous tasks from persisting
          state.account = null;
          // Mark that the task's account was not found - prevents findAssociatedAccount from using stale data
          state._taskAccountNotFound = taskHasAccountName;
          console.warn('[TaskDetail] ✗ Could not find account:', task.accountId || task.account, '(searched', accountsData.length, 'accounts + Firebase). Cleared state.account to prevent stale data.');
        }
      } catch (e) {
        console.warn('[TaskDetail] Error loading account data:', e);
        state.account = null;
        state._taskAccountNotFound = !!(task.account && task.account.trim());
      }
    } else {
      // No account specified in task - allow findAssociatedAccount to work normally
      state._taskAccountNotFound = false;
      state._taskAccountFound = false;
    }
  }

  // Helper function to render avatar or icon with retry logic
  function renderAvatarOrIcon(elementSelector, htmlContent, isAvatar = false) {
    const maxRetries = 10;
    let retries = 0;

    const tryRender = () => {
      // Target the profile container for flex alignment
      const profileContainer = document.querySelector('#task-detail-page .contact-header-profile');
      if (profileContainer) {
        // Cleanup existing avatar/icon elements in the profile container
        const existingElements = profileContainer.querySelectorAll('.avatar-initials, .company-favicon-header, .avatar-circle-small, .company-logo-header, .td-header-skel-icon');
        existingElements.forEach(el => el.remove());

        // Create the wrapper - no absolute positioning, let flex handle it
        let wrapper;
        if (isAvatar) {
          // For avatars, create a div with the initials
          wrapper = document.createElement('div');
          wrapper.className = 'avatar-circle-small';
          wrapper.setAttribute('aria-hidden', 'true');
          wrapper.textContent = htmlContent; // htmlContent is just the initials text
        } else {
          // For company icons, htmlContent is already a complete HTML string from generateCompanyIconHTML
          // Create a wrapper div to contain it
          wrapper = document.createElement('div');
          wrapper.className = 'company-logo-header';
          wrapper.innerHTML = htmlContent;
        }

        // Prepend so it appears before the text
        profileContainer.prepend(wrapper);

        // Add icon-loaded class
        requestAnimationFrame(() => {
          wrapper.classList.add('icon-loaded');
        });

        return true;
      } else if (retries < maxRetries) {
        retries++;
        requestAnimationFrame(tryRender);
        return false;
      } else {
        console.warn(`[TaskDetail] Failed to render ${isAvatar ? 'avatar' : 'icon'} after ${maxRetries} retries`);
        return false;
      }
    };

    // Start with a small delay, then retry
    setTimeout(() => {
      requestAnimationFrame(tryRender);
    }, 50);
  }

  // Robust cleanup function to remove all existing avatars/icons
  function cleanupExistingAvatarsAndIcons() {
    const profileContainer = document.querySelector('#task-detail-page .contact-header-profile');
    if (!profileContainer) return;

    const selectors = [
      '.avatar-initials',
      '.avatar-circle-small',
      '.company-favicon-header',
      '.company-logo-header',
      '.td-header-skel-icon',
      '.avatar-absolute'
    ];

    selectors.forEach(selector => {
      const elements = profileContainer.querySelectorAll(selector);
      elements.forEach(el => el.remove());
    });
  }

  // Inject header buttons into the task detail page header
  function injectTaskHeaderButtonsIntoDOM() {
    const profileHeader = document.querySelector('#task-detail-page .contact-header-profile');
    if (!profileHeader) {
      console.warn('[TaskDetail] Header container not found for button injection');
      return;
    }

    const isAcctTask = isAccountTask(state.currentTask);

    const alreadyInjected = !!document.querySelector('#task-detail-page .website-header-btn, #task-detail-page .linkedin-header-btn');
    if (!alreadyInjected) {
      const buttonsHTML = renderTaskHeaderButtons();
      if (buttonsHTML) profileHeader.insertAdjacentHTML('beforeend', buttonsHTML);
    }

    const pageActions = document.querySelector('#task-detail-page .page-actions');
    if (!pageActions) return;

    const websiteBtn = profileHeader.querySelector('.website-header-btn') || pageActions.querySelector('.website-header-btn');
    const linkedinBtn = profileHeader.querySelector('.linkedin-header-btn') || pageActions.querySelector('.linkedin-header-btn');

    if (websiteBtn && websiteBtn.parentElement !== pageActions) {
      pageActions.insertBefore(websiteBtn, pageActions.firstChild);
    }
    if (linkedinBtn && linkedinBtn.parentElement !== pageActions) {
      const insertBefore = (websiteBtn && websiteBtn.parentElement === pageActions)
        ? websiteBtn.nextElementSibling
        : pageActions.firstChild;
      pageActions.insertBefore(linkedinBtn, insertBefore);
    }

    profileHeader.querySelectorAll('.header-action-divider, .list-seq-group').forEach(el => el.remove());

    let listSeqGroup = pageActions.querySelector('.list-seq-group');
    const addTaskBtn = document.getElementById('task-add-task');
    const addTaskSeparator = addTaskBtn?.nextElementSibling && addTaskBtn.nextElementSibling.classList.contains('page-actions-separator')
      ? addTaskBtn.nextElementSibling
      : null;

    if (!listSeqGroup) {
      listSeqGroup = document.createElement('div');
      listSeqGroup.className = 'list-seq-group';
      if (addTaskBtn) pageActions.insertBefore(listSeqGroup, addTaskBtn);
      else pageActions.insertBefore(listSeqGroup, pageActions.firstChild);
    }

    if (linkedinBtn) {
      const firstChild = pageActions.firstElementChild;
      if (firstChild && firstChild !== websiteBtn && firstChild !== linkedinBtn) {
        pageActions.insertBefore(linkedinBtn, firstChild);
      }

      if (listSeqGroup.parentElement === pageActions) {
        const prev = listSeqGroup.previousElementSibling;
        if (!prev || !prev.classList.contains('page-actions-separator')) {
          const sep = document.createElement('div');
          sep.className = 'page-actions-separator';
          pageActions.insertBefore(sep, listSeqGroup);
        }

        const refAfterIcons = (listSeqGroup.previousElementSibling && listSeqGroup.previousElementSibling.classList.contains('page-actions-separator'))
          ? listSeqGroup.previousElementSibling
          : null;
        if (refAfterIcons && refAfterIcons.previousElementSibling !== linkedinBtn) {
          pageActions.insertBefore(listSeqGroup, linkedinBtn.nextElementSibling);
          pageActions.insertBefore(refAfterIcons, listSeqGroup);
        }
      }
    }

    const hasList = !!listSeqGroup.querySelector('#task-add-to-list');
    const hasSeq = !!listSeqGroup.querySelector('#task-add-to-sequence');
    if (!hasList && !hasSeq) {
      const html = renderTaskListSequenceButtons();
      if (html) listSeqGroup.insertAdjacentHTML('afterbegin', html);
    }

    const seqBtn = listSeqGroup.querySelector('#task-add-to-sequence');
    if (seqBtn) {
      if (isAcctTask) seqBtn.setAttribute('hidden', '');
      else seqBtn.removeAttribute('hidden');
    }

    if (addTaskBtn && addTaskBtn.parentElement !== listSeqGroup) {
      listSeqGroup.appendChild(addTaskBtn);
    }

    if (addTaskSeparator && addTaskSeparator.parentElement === pageActions) {
      pageActions.insertBefore(addTaskSeparator, listSeqGroup.nextSibling);
    }

    const nav = pageActions.querySelector('.task-navigation');
    const completeBtn = document.getElementById('task-complete-btn');
    if (nav && completeBtn) {
      const next = nav.nextElementSibling;
      const hasSep = next && next.classList && next.classList.contains('page-actions-separator');
      if (!hasSep) {
        const sep = document.createElement('div');
        sep.className = 'page-actions-separator';
        pageActions.insertBefore(sep, completeBtn);
      }
    }
  }


  async function renderTaskPage() {
    if (!state.currentTask) {
      console.error('[TaskDetail] Cannot render: no current task in state');
      showTaskError('No task data available. Please refresh the page.');
      return;
    }

    // console.log('[TaskDetail] Rendering task page for task:', {
    //   id: state.currentTask.id,
    //   type: state.currentTask.type,
    //   title: state.currentTask.title
    // });

    // CRITICAL: Ensure DOM refs are initialized
    if (!els.content) {
      if (!initDomRefs()) {
        console.warn('[TaskDetail] DOM not ready for rendering, retrying...');
        setTimeout(async () => await renderTaskPage(), 100);
        return;
      }
    }

    // CRITICAL FIX: Ensure task has minimum required data
    if (!state.currentTask.id) {
      console.error('[TaskDetail] Task missing ID:', state.currentTask);
      showTaskError('Invalid task data. Please refresh the page.');
      return;
    }

    // Clean up any existing avatars/icons first
    cleanupExistingAvatarsAndIcons();

    injectTaskDetailStyles();
    injectTaskHeaderStyles(); // CRITICAL: Inject header button styles

    // CRITICAL FIX: Always update subtitle first to clear "Loading task..." message
    if (els.subtitle) {
      const dueDate = state.currentTask.dueDate || '';
      const dueTime = state.currentTask.dueTime || '';
      if (dueDate && dueTime) {
        els.subtitle.textContent = `Due: ${dueDate} at ${dueTime}`;
      } else if (dueDate) {
        els.subtitle.textContent = `Due: ${dueDate}`;
      } else {
        els.subtitle.textContent = '';
      }
    }

    // For phone tasks, add header info based on task type
    if (state.taskType === 'phone-call') {
      // Check if this is an account task or contact task
      if (isAccountTask(state.currentTask)) {
        // Account task header
        const accountName = state.currentTask.account || '';
        const accountId = state.currentTask.accountId || '';
        const account = findAccountByIdOrName(accountId, accountName);

        // Prepare company icon/favicon
        const deriveDomain = (input) => {
          try {
            if (!input) return '';
            let s = String(input).trim();
            if (/^https?:\/\//i.test(s)) { const u = new URL(s); return (u.hostname || '').replace(/^www\./i, ''); }
            if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) { return s.replace(/^www\./i, ''); }
            return '';
          } catch (_) { return ''; }
        };
        const domain = account?.domain ? String(account.domain).replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./i, '') : deriveDomain(account?.website || '');
        const logoUrl = account?.logoUrl || '';

        const companyIconSize = 40; // Larger icon for header
        let companyIconHTML = '';
        try {
          if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
            companyIconHTML = window.__pcFaviconHelper.generateCompanyIconHTML({
              logoUrl,
              domain,
              website: account?.website || '',
              size: companyIconSize
            });
          }
        } catch (_) { /* noop */ }

        // If no icon HTML generated, create a fallback with first letter
        if (!companyIconHTML) {
          const fallbackLetter = accountName ? accountName.charAt(0).toUpperCase() : 'C';
          companyIconHTML = `<div style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: var(--bg-item); border-radius: 6px; font-weight: 600; font-size: 18px; color: var(--text-secondary);">${fallbackLetter}</div>`;
        }

        // Update title with company name link and actions
        if (els.title && accountName) {
          const companyLinkHTML = `<a href="#account-details" class="company-link" data-account-id="${escapeHtml(accountId)}" data-account-name="${escapeHtml(accountName)}">${escapeHtml(accountName)}</a>`;

          const actionsHTML = `
            <div class="title-actions" aria-hidden="true">
              <button type="button" class="icon-btn-sm title-edit" title="Edit account" data-action="edit-account" data-id="${escapeHtml(accountId)}">${editIcon()}</button>
              <button type="button" class="icon-btn-sm title-copy" title="Copy name" data-action="copy-name" data-text="${escapeHtml(accountName)}">${copyIcon()}</button>
              <button type="button" class="icon-btn-sm title-clear" title="Delete" data-action="delete-account" data-id="${escapeHtml(accountId)}">${trashIcon()}</button>
            </div>`;

          els.title.innerHTML = `Call <span class="contact-title-row" style="display:inline-flex; align-items:center; gap:8px">${companyLinkHTML}${actionsHTML}</span>`;

          // Ensure handlers are set up
          if (!document._taskHeaderActionsBound) {
            setupHeaderActions();
          }
        }

        // Add company icon/favicon to header using retry helper
        renderAvatarOrIcon('', companyIconHTML, false);

        // CRITICAL FIX: Subtitle is already updated above, but ensure it's set here too
        if (els.subtitle) {
          const dueDate = state.currentTask.dueDate || '';
          const dueTime = state.currentTask.dueTime || '';
          if (dueDate && dueTime) {
            els.subtitle.textContent = `Due: ${dueDate} at ${dueTime}`;
          } else if (dueDate) {
            els.subtitle.textContent = `Due: ${dueDate}`;
          } else {
            els.subtitle.textContent = '';
          }
        }

        // Add location info under title
        let contactInfoEl = document.getElementById('task-contact-info');
        if (!contactInfoEl) {
          contactInfoEl = document.createElement('div');
          contactInfoEl.id = 'task-contact-info';
          contactInfoEl.className = 'task-contact-info';
          contactInfoEl.style.cssText = 'color: var(--text-secondary); font-size: 14px;';

          // CRITICAL FIX: Scope selector to task-detail-page
          const titleSection = document.querySelector('#task-detail-page .contact-header-text');
          const subtitle = document.getElementById('task-detail-subtitle');
          if (titleSection && subtitle) {
            subtitle.insertAdjacentElement('beforebegin', contactInfoEl);
          }
        }

        const city = account?.city || account?.locationCity || '';
        const stateVal = account?.state || account?.locationState || '';
        const locationHTML = city && stateVal ? `${escapeHtml(city)}, ${escapeHtml(stateVal)}` : (city || stateVal || '');
        contactInfoEl.innerHTML = `<div class="contact-details-normal">${locationHTML}</div>`;

      } else {
        // Contact task header (existing logic)
        const contactName = state.currentTask.contact || '';
        const accountName = state.currentTask.account || '';
        const contactId = state.currentTask.contactId || '';

        // CRITICAL FIX: Try multiple sources to find contact
        let person = null;

        // Method 1: Try by contactId first (most reliable)
        if (contactId) {
          if (typeof window.getPeopleData === 'function') {
            const people = window.getPeopleData() || [];
            person = people.find(p => p.id === contactId);
          }
          if (!person && window.BackgroundContactsLoader) {
            const contacts = window.BackgroundContactsLoader.getContactsData() || [];
            person = contacts.find(c => c.id === contactId);
          }
        }

        // Method 2: Try by name if not found by ID
        if (!person && contactName) {
          if (typeof window.getPeopleData === 'function') {
            const people = window.getPeopleData() || [];
            person = people.find(p => {
              const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
              return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
            });
          }
          if (!person && window.BackgroundContactsLoader) {
            const contacts = window.BackgroundContactsLoader.getContactsData() || [];
            person = contacts.find(c => {
              const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.name || '';
              return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
            });
          }
        }

        // Use found person or empty object
        person = person || {};
        // CRITICAL FIX: Use state.contact if available (already loaded by loadContactAccountData) for most reliable title
        const title = (state.contact && state.contact.title) || person.title || '';
        const company = person.companyName || accountName;

        // Compute initials for avatar (same logic as people.js)
        const initials = (() => {
          const parts = String(contactName || '').trim().split(/\s+/).filter(Boolean);
          const chars = parts.length > 1 ? [parts[0][0], parts[parts.length - 1][0]] : (parts[0] ? [parts[0][0]] : []);
          const str = chars.join('').toUpperCase();
          if (str) return str;
          const e = String(person.email || '').trim();
          return e ? e[0].toUpperCase() : '?';
        })();

        // console.log('Contact task - Contact name:', contactName, 'Initials:', initials);

        // Update the main title to include clickable contact name
        if (els.title && contactName) {
          // CRITICAL FIX: Use multiple sources to resolve contactId (priority order)
          let finalContactId = '';

          // Priority 1: Use state.contact if available (most reliable)
          if (state.contact && state.contact.id) {
            finalContactId = state.contact.id;
            // console.log('[TaskDetail] Using contactId from state.contact:', finalContactId);
          }
          // Priority 2: Use person.id if found from lookup
          else if (person && person.id) {
            finalContactId = person.id;
            // console.log('[TaskDetail] Using contactId from person lookup:', finalContactId);
          }
          // Priority 3: Use task contactId
          else if (contactId) {
            finalContactId = contactId;
            // console.log('[TaskDetail] Using contactId from task:', finalContactId);
          }
          // Priority 4: Check person._id as fallback
          else if (person && person._id) {
            finalContactId = person._id;
            // console.log('[TaskDetail] Using contactId from person._id:', finalContactId);
          }
          // Priority 5: Last resort - try to find contact by name in BackgroundContactsLoader
          else if (contactName && window.BackgroundContactsLoader) {
            try {
              const contacts = window.BackgroundContactsLoader.getContactsData() || [];
              const foundContact = contacts.find(c => {
                const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.name || '';
                return fullName && fullName.toLowerCase() === contactName.toLowerCase();
              });
              if (foundContact && foundContact.id) {
                finalContactId = foundContact.id;
                // console.log('[TaskDetail] Found contactId from BackgroundContactsLoader:', finalContactId);
              }
            } catch (e) {
              console.warn('[TaskDetail] Error finding contact in BackgroundContactsLoader:', e);
            }
          }

          /* console.log('[TaskDetail] Rendering contact link:', {
            contactName,
            contactId: finalContactId,
            hasPerson: !!person,
            personId: person?.id,
            hasStateContact: !!state.contact,
            stateContactId: state.contact?.id
          }); */

          // CRITICAL FIX: Always render the link, even without ID (handler will try to resolve it)
          const contactLinkHTML = `<a href="#contact-details" class="contact-link" data-contact-id="${escapeHtml(finalContactId || '')}" data-contact-name="${escapeHtml(contactName)}" style="cursor: pointer;">${escapeHtml(contactName)}</a>`;

          const actionsHTML = `
            <div class="title-actions" aria-hidden="true">
              <button type="button" class="icon-btn-sm title-edit" title="Edit contact" data-action="edit-contact" data-id="${escapeHtml(finalContactId || '')}">${editIcon()}</button>
              <button type="button" class="icon-btn-sm title-copy" title="Copy name" data-action="copy-name" data-text="${escapeHtml(contactName)}">${copyIcon()}</button>
              <button type="button" class="icon-btn-sm title-clear" title="Delete" data-action="delete-contact" data-id="${escapeHtml(finalContactId || '')}">${trashIcon()}</button>
            </div>`;

          els.title.innerHTML = `Call <span class="contact-title-row" style="display:inline-flex; align-items:center; gap:8px">${contactLinkHTML}${actionsHTML}</span>`;

          // Ensure handlers are set up
          if (!document._taskHeaderActionsBound) {
            setupHeaderActions();
          }

          // CRITICAL FIX: Test click immediately after render
          requestAnimationFrame(() => {
            const contactLink = els.title.querySelector('.contact-link');
            if (contactLink) {
              // // console.log('[TaskDetail] ✓ Contact link rendered successfully:', {
              //   contactId: contactLink.getAttribute('data-contact-id'),
              //   contactName: contactLink.getAttribute('data-contact-name'),
              //   hasHandler: !!document._taskDetailContactHandlersBound
              // });

              // Verify event handler is set up
              if (!document._taskDetailContactHandlersBound) {
                console.warn('[TaskDetail] Contact handlers not bound, setting up now...');
                setupContactLinkHandlers();
              }
            } else {
              console.error('[TaskDetail] ✗ Contact link not found after rendering!');
            }
          });
        }

        // Create or update contact info element (no avatar here)
        let contactInfoEl = document.getElementById('task-contact-info');
        if (!contactInfoEl) {
          contactInfoEl = document.createElement('div');
          contactInfoEl.id = 'task-contact-info';
          contactInfoEl.className = 'task-contact-info';
          contactInfoEl.style.cssText = 'margin-top: 0px; color: var(--text-secondary); font-size: 14px;';

          // Insert between title and subtitle
          // CRITICAL FIX: Scope selector to task-detail-page
          const titleSection = document.querySelector('#task-detail-page .contact-header-text');
          const subtitle = document.getElementById('task-detail-subtitle');
          if (titleSection && subtitle) {
            // Insert the contact info element before the subtitle
            subtitle.insertAdjacentElement('beforebegin', contactInfoEl);
          }
        }

        // Create contact details content (no avatar here)
        // CRITICAL FIX: Match contact-detail.js format: "(title) at (company link)" or just "(title)" or just "(company link)"
        let contactDetailsHTML = '';

        // CRITICAL FIX: Use state.account if available (already loaded by loadContactAccountData) for most reliable account data
        const linkedAccount = state.account || findAssociatedAccount(person);
        const accountId = linkedAccount?.id || '';
        const companyLink = company ? `<a href="#account-details" class="company-link" id="task-header-company-link" title="View account details" data-account-id="${escapeHtml(accountId)}" data-account-name="${escapeHtml(company)}">${escapeHtml(company)}</a>` : '';

        // Match contact-detail.js format exactly: title + " at " + company link (if both exist)
        if (title && company) {
          contactDetailsHTML = `${escapeHtml(title)} at ${companyLink}`;
        } else if (title) {
          contactDetailsHTML = escapeHtml(title);
        } else if (company) {
          contactDetailsHTML = companyLink;
        }

        // Set the contact details content
        contactInfoEl.innerHTML = `<div class="contact-details-normal">${contactDetailsHTML}</div>`;

        // Add avatar to the left of contact name (as sibling, not child)
        // Ensure we have valid initials
        const finalInitials = initials && initials !== '?' ? initials : (contactName ? contactName.charAt(0).toUpperCase() : 'C');
        // console.log('Contact task - Rendering avatar with initials:', finalInitials);

        // Render avatar using the proper helper (adds as sibling to .contact-header-text)
        renderAvatarOrIcon('', escapeHtml(finalInitials), true);
      }
    } else if (state.taskType === 'li-connect' || state.taskType === 'li-message' || state.taskType === 'li-view-profile' || state.taskType === 'li-interact-post' ||
      state.taskType === 'linkedin-connect' || state.taskType === 'linkedin-message' || state.taskType === 'linkedin-view' || state.taskType === 'linkedin-interact') {
      // LinkedIn task header (same styling as call tasks)
      const contactName = state.currentTask.contact || '';
      const accountName = state.currentTask.account || '';
      const contactId = state.currentTask.contactId || '';

      // CRITICAL FIX: Try multiple sources to find contact (same as phone-call tasks)
      let person = null;

      // Method 1: Try by contactId first (most reliable)
      if (contactId) {
        if (typeof window.getPeopleData === 'function') {
          const people = window.getPeopleData() || [];
          person = people.find(p => p.id === contactId);
        }
        if (!person && window.BackgroundContactsLoader) {
          const contacts = window.BackgroundContactsLoader.getContactsData() || [];
          person = contacts.find(c => c.id === contactId);
        }
      }

      // Method 2: Try by name if not found by ID
      if (!person && contactName) {
        if (typeof window.getPeopleData === 'function') {
          const people = window.getPeopleData() || [];
          person = people.find(p => {
            const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
            return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
          });
        }
        if (!person && window.BackgroundContactsLoader) {
          const contacts = window.BackgroundContactsLoader.getContactsData() || [];
          person = contacts.find(c => {
            const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.name || '';
            return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
          });
        }
      }

      // Use found person or empty object
      person = person || {};
      // CRITICAL FIX: Use state.contact if available (already loaded by loadContactAccountData) for most reliable title
      const title = (state.contact && state.contact.title) || person.title || '';
      const company = person.companyName || accountName;

      // Compute initials for avatar (same logic as people.js)
      const initials = (() => {
        const parts = String(contactName || '').trim().split(/\s+/).filter(Boolean);
        const chars = parts.length > 1 ? [parts[0][0], parts[parts.length - 1][0]] : (parts[0] ? [parts[0][0]] : []);
        const str = chars.join('').toUpperCase();
        if (str) return str;
        const e = String(person.email || '').trim();
        return e ? e[0].toUpperCase() : '?';
      })();

      // console.log('LinkedIn task - Contact name:', contactName, 'Initials:', initials);

      // Update the main title to include clickable contact name
      if (els.title && contactName) {
        // CRITICAL FIX: Use multiple sources to resolve contactId (priority order)
        let finalContactId = '';
        const taskContactId = state.currentTask.contactId || ''; // Define taskContactId here

        // Priority 1: Use state.contact if available (most reliable)
        if (state.contact && state.contact.id) {
          finalContactId = state.contact.id;
          // console.log('[TaskDetail] LinkedIn: Using contactId from state.contact:', finalContactId);
        }
        // Priority 2: Use person.id if found from lookup
        else if (person && person.id) {
          finalContactId = person.id;
          // console.log('[TaskDetail] LinkedIn: Using contactId from person lookup:', finalContactId);
        }
        // Priority 3: Use task contactId
        else if (taskContactId) {
          finalContactId = taskContactId;
          // console.log('[TaskDetail] LinkedIn: Using contactId from task:', finalContactId);
        }
        // Priority 4: Check person._id as fallback
        else if (person && person._id) {
          finalContactId = person._id;
          // console.log('[TaskDetail] LinkedIn: Using contactId from person._id:', finalContactId);
        }
        // Priority 5: Last resort - try to find contact by name in BackgroundContactsLoader
        else if (contactName && window.BackgroundContactsLoader) {
          try {
            const contacts = window.BackgroundContactsLoader.getContactsData() || [];
            const foundContact = contacts.find(c => {
              const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.name || '';
              return fullName && fullName.toLowerCase() === contactName.toLowerCase();
            });
            if (foundContact && foundContact.id) {
              finalContactId = foundContact.id;
              // console.log('[TaskDetail] LinkedIn: Found contactId from BackgroundContactsLoader:', finalContactId);
            }
          } catch (e) {
            console.warn('[TaskDetail] LinkedIn: Error finding contact in BackgroundContactsLoader:', e);
          }
        }

        // console.log('[TaskDetail] Rendering LinkedIn contact link:', {
        //   contactName,
        //   contactId: finalContactId,
        //   hasPerson: !!person,
        //   personId: person?.id,
        //   hasStateContact: !!state.contact,
        //   stateContactId: state.contact?.id
        // });

        const contactLinkHTML = `<a href="#contact-details" class="contact-link" data-contact-id="${escapeHtml(finalContactId || '')}" data-contact-name="${escapeHtml(contactName)}" style="cursor: pointer;">${escapeHtml(contactName)}</a>`;

        const actionsHTML = `<div class="title-actions" aria-hidden="true"><button type="button" class="icon-btn-sm title-edit" title="Edit contact" data-action="edit-contact" data-id="${escapeHtml(finalContactId || '')}">${editIcon()}</button><button type="button" class="icon-btn-sm title-copy" title="Copy name" data-action="copy-name" data-text="${escapeHtml(contactName)}">${copyIcon()}</button><button type="button" class="icon-btn-sm title-clear" title="Delete" data-action="delete-contact" data-id="${escapeHtml(finalContactId || '')}">${trashIcon()}</button></div>`;

        // Determine action text based on task type (contact name goes in the middle)
        let actionPrefix = '';
        let actionSuffix = '';
        switch (state.taskType) {
          case 'li-connect':
          case 'linkedin-connect':
            actionPrefix = 'Add';
            actionSuffix = 'on LinkedIn';
            break;
          case 'li-message':
          case 'linkedin-message':
            actionPrefix = 'Send a message to';
            actionSuffix = 'on LinkedIn';
            break;
          case 'li-view-profile':
          case 'linkedin-view':
            actionPrefix = 'View';
            actionSuffix = 'on LinkedIn';
            break;
          case 'li-interact-post':
          case 'linkedin-interact':
            actionPrefix = 'Interact with';
            actionSuffix = 'on LinkedIn';
            break;
          default:
            actionPrefix = 'LinkedIn Task for';
            actionSuffix = '';
        }

        const suffixHTML = actionSuffix ? `<span>${escapeHtml(actionSuffix)}</span>` : '';
        els.title.innerHTML = `<span class="contact-title-row" style="display:inline-flex; align-items:center; gap: 4px; vertical-align: middle;"><span>${escapeHtml(actionPrefix)}</span>${contactLinkHTML}${actionsHTML}${suffixHTML}</span>`;

        setTimeout(() => {
          if (!document._taskHeaderActionsBound) {
            setupHeaderActions();
          }

          const contactLink = els.title.querySelector('.contact-link');
          if (contactLink) {
            if (!document._taskDetailContactHandlersBound) {
              setupContactLinkHandlers();
            }
          }
        }, 100);
      }

      // Create or update contact info element
      let contactInfoEl = document.getElementById('task-contact-info');
      if (!contactInfoEl) {
        contactInfoEl = document.createElement('div');
        contactInfoEl.id = 'task-contact-info';
        contactInfoEl.className = 'task-contact-info';
        contactInfoEl.style.cssText = 'margin-top: 0px; color: var(--text-secondary); font-size: 14px;';

        // Insert between title and subtitle
        // CRITICAL FIX: Scope selector to task-detail-page
        const titleSection = document.querySelector('#task-detail-page .contact-header-text');
        const subtitle = document.getElementById('task-detail-subtitle');
        if (titleSection && subtitle) {
          subtitle.insertAdjacentElement('beforebegin', contactInfoEl);
        }
      }

      // Create contact details content
      // CRITICAL FIX: Match contact-detail.js format: "(title) at (company link)" or just "(title)" or just "(company link)"
      let contactDetailsHTML = '';

      // CRITICAL FIX: Use state.account if available (already loaded by loadContactAccountData) for most reliable account data
      // Don't use findAssociatedAccount if task's account was explicitly not found (prevents stale data)
      const linkedAccount = state.account || (state._taskAccountNotFound ? null : findAssociatedAccount(person)) || null;
      const accountId = linkedAccount?.id || '';
      const companyLink = company ? `<a href="#account-details" class="company-link" id="task-header-company-link" title="View account details" data-account-id="${escapeHtml(accountId)}" data-account-name="${escapeHtml(company)}">${escapeHtml(company)}</a>` : '';

      // Match contact-detail.js format exactly: title + " at " + company link (if both exist)
      if (title && company) {
        contactDetailsHTML = `${escapeHtml(title)} at ${companyLink}`;
      } else if (title) {
        contactDetailsHTML = escapeHtml(title);
      } else if (company) {
        contactDetailsHTML = companyLink;
      }

      // Set the contact details content
      contactInfoEl.innerHTML = `<div class="contact-details-normal">${contactDetailsHTML}</div>`;

      // Add avatar to the left of contact name (as sibling, not child)
      const finalInitials = initials && initials !== '?' ? initials : (contactName ? contactName.charAt(0).toUpperCase() : 'C');
      // console.log('LinkedIn task - Rendering avatar with initials:', finalInitials);

      // Render avatar using the proper helper (adds as sibling to .contact-header-text)
      renderAvatarOrIcon('', escapeHtml(finalInitials), true);
    } else {
      // For other non-phone-call tasks, set title and subtitle normally
      if (els.title) {
        els.title.textContent = state.currentTask.title;
      }

      // CRITICAL FIX: Subtitle is already updated above, but ensure it's set here too
      if (els.subtitle) {
        const dueDate = state.currentTask.dueDate || '';
        const dueTime = state.currentTask.dueTime || '';
        if (dueDate && dueTime) {
          els.subtitle.textContent = `Due: ${dueDate} at ${dueTime}`;
        } else if (dueDate) {
          els.subtitle.textContent = `Due: ${dueDate}`;
        } else {
          els.subtitle.textContent = '';
        }
      }
    }

    // Render task-specific content (split layout similar to Apollo screenshot)
    await renderTaskContent();

    // CRITICAL FIX: Event handlers are now set up once using event delegation
    // No need to re-attach - they work automatically for dynamically added elements
    // Just ensure they're initialized if not already
    if (!document._taskDetailCompanyHandlersBound) {
      setupCompanyLinkHandlers();
    }
    if (!document._taskDetailContactHandlersBound) {
      setupContactLinkHandlers();
    }

    // CRITICAL FIX: Also ensure phone click handlers are set up
    if (!document._taskDetailPhoneHandlersBound) {
      setupPhoneClickHandlers();
    }

    // CRITICAL FIX: Inject header action buttons after header is rendered
    // This ensures buttons appear for both contact and account tasks
    requestAnimationFrame(() => {
      injectTaskHeaderButtonsIntoDOM();
      // Ensure header button handlers are set up
      if (!document._taskDetailHeaderButtonsHandlersBound) {
        setupTaskHeaderButtonHandlers();
      }
    });

    // Load widgets
    loadTaskWidgets();

    // Load recent activity data (contact or account tasks)
    loadRecentActivityForTask({ forceRefresh: true });

    // If phone task, embed contact details on the right
    try {
      if ((state.taskType || '') === 'phone-call') embedContactDetails();
    } catch (_) { }

    // Update navigation button states
    updateNavigationButtons();

    // Process click-to-call and click-to-email elements
    setTimeout(() => {
      processClickToCallAndEmail();
    }, 100);

    // Add event listener for "Log call & complete task" button
    const logCompleteBtn = document.getElementById('log-complete-call');
    if (logCompleteBtn) {
      logCompleteBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        // Get notes from the form
        const callNotesEl = document.getElementById('call-notes');
        const callPurposeEl = document.getElementById('call-purpose');

        if (callNotesEl) {
          const formNotes = callNotesEl.value.trim();
          const purpose = callPurposeEl ? callPurposeEl.value : 'Prospecting Call';

          // Update task notes with form data
          if (formNotes) {
            state.currentTask.notes = `${purpose}: ${formNotes}`;
          } else if (purpose !== 'Prospecting Call') {
            state.currentTask.notes = `Call purpose: ${purpose}`;
          }
        }

        // Complete the task
        await handleTaskComplete();
      });
    }
  }

  // Setup event delegation for task detail header action buttons
  function setupTaskHeaderButtonHandlers() {
    if (document._taskDetailHeaderButtonsHandlersBound) return;
    document._taskDetailHeaderButtonsHandlersBound = true;

    document.addEventListener('click', (e) => {
      // Only handle clicks within task-detail-page
      const taskPage = e.target.closest('#task-detail-page');
      if (!taskPage) return;

      // Double check if we're actually inside the header for these buttons
      const isHeaderClick = e.target.closest('#task-detail-header') || e.target.closest('.contact-header-profile');


      // Website button click
      const websiteBtn = e.target.closest('.website-header-btn');
      if (websiteBtn) {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleTaskDetailQuickAction('website');
        return;
      }

      // LinkedIn button click
      const linkedinBtn = e.target.closest('.linkedin-header-btn');
      if (linkedinBtn) {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleTaskDetailQuickAction('linkedin');
        return;
      }

      // Add to List button
      const addToListBtn = e.target.closest('#task-add-to-list');
      if (addToListBtn) {
        e.preventDefault();
        e.stopImmediatePropagation();

        // Determine if account task or contact task, then open appropriate panel
        const isAcctTask = isAccountTask(state.currentTask);
        if (isAcctTask && state.account) {
          // Open account lists panel
          if (window.AccountDetail && typeof window.AccountDetail.openAccountListsPanel === 'function') {
            // Temporarily set AccountDetail state for the panel
            const prevAccount = window.AccountDetail.state?.currentAccount;
            if (window.AccountDetail.state) {
              window.AccountDetail.state.currentAccount = state.account;
            }
            window.AccountDetail.openAccountListsPanel(addToListBtn);
            // Restore previous state after a delay
            setTimeout(() => {
              if (window.AccountDetail.state && prevAccount !== undefined) {
                window.AccountDetail.state.currentAccount = prevAccount;
              }
            }, 100);
          } else {
            console.warn('[TaskDetail] AccountDetail.openAccountListsPanel not available');
          }
        } else if (state.contact) {
          // Open contact lists panel
          if (window.ContactDetail && typeof window.ContactDetail.openContactListsPanel === 'function') {
            // Temporarily set ContactDetail state for the panel
            const prevContact = window.ContactDetail.state?.currentContact;
            if (window.ContactDetail.state) {
              window.ContactDetail.state.currentContact = state.contact;
            }
            window.ContactDetail.openContactListsPanel(addToListBtn);
            // Restore previous state after a delay
            setTimeout(() => {
              if (window.ContactDetail.state && prevContact !== undefined) {
                window.ContactDetail.state.currentContact = prevContact;
              }
            }, 100);
          } else {
            console.warn('[TaskDetail] ContactDetail.openContactListsPanel not available');
          }
        }
        return;
      }

      // Add to Sequence button (contact tasks only)
      const addToSequenceBtn = e.target.closest('#task-add-to-sequence');
      if (addToSequenceBtn) {
        e.preventDefault();
        e.stopImmediatePropagation();

        // Only for contact tasks
        if (state.contact) {
          if (window.ContactDetail && typeof window.ContactDetail.openContactSequencesPanel === 'function') {
            // Temporarily set ContactDetail state for the panel
            const prevContact = window.ContactDetail.state?.currentContact;
            if (window.ContactDetail.state) {
              window.ContactDetail.state.currentContact = state.contact;
            }
            window.ContactDetail.openContactSequencesPanel(addToSequenceBtn);
            // Restore previous state after a delay
            setTimeout(() => {
              if (window.ContactDetail.state && prevContact !== undefined) {
                window.ContactDetail.state.currentContact = prevContact;
              }
            }, 100);
          } else {
            console.warn('[TaskDetail] ContactDetail.openContactSequencesPanel not available');
          }
        }
        return;
      }

      // Add Task button
      const addTaskBtn = e.target.closest('#task-add-task');
      if (addTaskBtn) {
        e.preventDefault();
        e.stopImmediatePropagation();

        // Determine if account task or contact task, then open appropriate popover
        const isAcctTask = isAccountTask(state.currentTask);
        if (isAcctTask && state.account) {
          // Open account task popover
          if (window.AccountDetail && typeof window.AccountDetail.openAccountTaskPopover === 'function') {
            // Temporarily set AccountDetail state for the popover
            const prevAccount = window.AccountDetail.state?.currentAccount;
            if (window.AccountDetail.state) {
              window.AccountDetail.state.currentAccount = state.account;
            }
            window.AccountDetail.openAccountTaskPopover(addTaskBtn);
            // Restore previous state after a delay
            setTimeout(() => {
              if (window.AccountDetail.state && prevAccount !== undefined) {
                window.AccountDetail.state.currentAccount = prevAccount;
              }
            }, 100);
          } else {
            console.warn('[TaskDetail] AccountDetail.openAccountTaskPopover not available');
          }
        } else if (state.contact) {
          // Open contact task popover
          if (window.ContactDetail && typeof window.ContactDetail.openContactTaskPopover === 'function') {
            // Temporarily set ContactDetail state for the popover
            const prevContact = window.ContactDetail.state?.currentContact;
            if (window.ContactDetail.state) {
              window.ContactDetail.state.currentContact = state.contact;
            }
            window.ContactDetail.openContactTaskPopover(addTaskBtn);
            // Restore previous state after a delay
            setTimeout(() => {
              if (window.ContactDetail.state && prevContact !== undefined) {
                window.ContactDetail.state.currentContact = prevContact;
              }
            }, 100);
          } else {
            console.warn('[TaskDetail] ContactDetail.openContactTaskPopover not available');
          }
        }
        return;
      }
    }, { capture: true });

    // console.log('[TaskDetail] Header button handlers bound via event delegation');
  }

  function setupCompanyLinkHandlers() {
    // CRITICAL FIX: Use document-level guard like fix-duplicate-listeners.js pattern
    if (document._taskDetailCompanyHandlersBound) return;
    document._taskDetailCompanyHandlersBound = true;

    // Handle company link clicks using event delegation (works after re-renders)
    document.addEventListener('click', (e) => {
      // FIX: Skip navigation if click originated from a button inside the link
      if (e.target.closest('button')) {
        return;
      }

      const companyLink = e.target.closest('#task-detail-page .company-link');
      if (!companyLink) return;

      e.preventDefault();
      const accountId = companyLink.getAttribute('data-account-id');
      const accountName = companyLink.getAttribute('data-account-name');

      // console.log('[TaskDetail] Company link clicked:', { accountId, accountName });

      // Capture task detail state for back navigation
      if (state.currentTask) {
        window.__taskDetailRestoreData = {
          taskId: state.currentTask.id,
          source: window._taskNavigationSource || 'dashboard',
          timestamp: Date.now()
        };
        // Set navigation source for account details
        window._accountNavigationSource = 'task-detail';
      }

      if (accountId && window.AccountDetail && typeof window.AccountDetail.show === 'function') {
        try {
          window.AccountDetail.show(accountId);
        } catch (error) {
          console.error('[TaskDetail] Failed to navigate to account detail:', error);
          if (window.crm && typeof window.crm.showToast === 'function') {
            window.crm.showToast('Failed to open account. Please try again.', 'error');
          }
        }
      } else if (accountName && window.AccountDetail && typeof window.AccountDetail.show === 'function') {
        // Fallback: try to find account by name
        try {
          if (typeof window.getAccountsData === 'function') {
            const accounts = window.getAccountsData() || [];
            const account = accounts.find(acc => {
              const accName = (acc.accountName || acc.name || acc.companyName || '').toLowerCase().trim();
              const searchName = accountName.toLowerCase().trim();
              return accName === searchName || accName.includes(searchName) || searchName.includes(accName);
            });
            if (account && account.id) {
              // console.log('[TaskDetail] Found account by name:', account.id);
              window.AccountDetail.show(account.id);
            } else {
              console.warn('[TaskDetail] Account not found:', accountName);
              if (window.crm && typeof window.crm.showToast === 'function') {
                window.crm.showToast('Account not found in system. Please check Accounts page.', 'error');
              }
            }
          }
        } catch (error) {
          console.error('[TaskDetail] Error finding account by name:', error);
          if (window.crm && typeof window.crm.showToast === 'function') {
            window.crm.showToast('Error finding account. Please try again.', 'error');
          }
        }
      }
    });

    // Note: setupInlineEditing() is now called directly after renderTaskContent() 
    // to ensure it runs after every DOM replacement, not just once
  }

  async function renderTaskContent() {
    if (!els.content) return;

    const task = state.currentTask;
    const taskType = task.type;

    let contentHtml = '';

    // Check if this is an account task
    if (isAccountTask(task)) {
      contentHtml = await renderAccountTaskContent(task);
    } else {
      // Contact task - use existing logic
      switch (taskType) {
        case 'phone-call':
          contentHtml = renderCallTaskContent(task);
          break;
        case 'manual-email':
        case 'auto-email':
          contentHtml = renderEmailTaskContent(task);
          break;
        case 'li-connect':
        case 'li-message':
        case 'li-view-profile':
        case 'li-interact-post':
          contentHtml = renderLinkedInTaskContent(task);
          break;
        default:
          contentHtml = renderGenericTaskContent(task);
      }
    }

    const realLayer = els.content.querySelector('.td-real-layer');
    if (realLayer) {
      const isLoading = !!(els.page && els.page.classList.contains('task-loading'));
      if (isLoading) {
        try { realLayer.classList.remove('td-enter'); } catch (_) { }
        try { realLayer.setAttribute('aria-hidden', 'true'); } catch (_) { }
      }
      realLayer.innerHTML = contentHtml;
    } else {
      // [Fix] Create real layer wrapper if it doesn't exist
      // This preserves the skeleton layer if it exists, allowing for cross-fade
      const newRealLayer = document.createElement('div');
      newRealLayer.className = 'td-real-layer td-layout-grid';
      const skelLayer = els.content.querySelector('.td-skeleton-layer');
      const hasSkeleton = !!skelLayer;
      const isLoading = !!(els.page && els.page.classList.contains('task-loading'));
      newRealLayer.setAttribute('aria-hidden', hasSkeleton || isLoading ? 'true' : 'false');
      if (!hasSkeleton && !isLoading) newRealLayer.classList.add('td-enter');
      newRealLayer.innerHTML = contentHtml;

      // Ensure real layer is BEHIND skeleton if skeleton exists
      if (skelLayer) {
        els.content.insertBefore(newRealLayer, skelLayer);
      } else {
        els.content.appendChild(newRealLayer);
      }

    }

    // CRITICAL FIX: Setup inline editing after every DOM replacement
    // This must be called after each render since DOM elements are replaced
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      // console.log('[TaskDetail] Setting up inline editing for new content...');
      setupInlineEditing();

      const rcList = document.getElementById('task-recent-calls-list');
      if (rcList) taskRcSetLoading(rcList);

      // Load recent calls for the task
      loadRecentCallsForTask();
    });

    try { attachTaskSpecificHandlers(); } catch (_) { }
  }

  function attachTaskSpecificHandlers() {
    // LinkedIn task handlers
    const accessLinkedInBtn = document.getElementById('access-linkedin-btn');
    const markCompleteLinkedInBtn = document.getElementById('mark-complete-linkedin-btn');

    if (accessLinkedInBtn) {
      if (!accessLinkedInBtn.dataset.pcBoundClick) {
        accessLinkedInBtn.dataset.pcBoundClick = '1';
        accessLinkedInBtn.addEventListener('click', handleAccessLinkedIn);
      }
    }

    if (markCompleteLinkedInBtn) {
      if (!markCompleteLinkedInBtn.dataset.pcBoundClick) {
        markCompleteLinkedInBtn.dataset.pcBoundClick = '1';
        markCompleteLinkedInBtn.addEventListener('click', async () => {
          // Get notes from textarea
          const notesEl = document.getElementById('linkedin-notes');
          const notes = notesEl ? notesEl.value.trim() : '';

          // Save notes if provided
          if (notes && state.currentTask) {
            try {
              await saveTaskNotesToRecentActivity(state.currentTask, notes);
            } catch (e) {
              console.warn('Could not save LinkedIn task notes to recent activity:', e);
            }
          }

          // Complete the task
          await handleTaskComplete();
        });
      }
    }
  }

  function handleAccessLinkedIn() {
    if (!state.currentTask) return;

    const contactName = state.currentTask.contact || '';
    const contactId = state.currentTask.contactId || '';

    // Try to find the contact in the people data
    let person = null;
    if (typeof window.getPeopleData === 'function') {
      const people = window.getPeopleData() || [];
      if (contactId) {
        person = people.find(p => p.id === contactId);
      }
      if (!person && contactName) {
        person = people.find(p => {
          const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
          return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
        });
      }
    }

    // Use the same LinkedIn logic as contact-detail.js
    if (person && person.linkedin) {
      // console.log('[TaskDetail] Using contact personal LinkedIn:', person.linkedin);
      try {
        window.open(person.linkedin, '_blank', 'noopener');
      } catch (e) {
        console.error('[TaskDetail] Failed to open LinkedIn URL:', e);
        if (window.crm && typeof window.crm.showToast === 'function') {
          window.crm.showToast('Failed to open LinkedIn. Please check the URL.', 'error');
        }
      }
    } else {
      // Fallback to search for the person
      const fullName = person ? ([person.firstName, person.lastName].filter(Boolean).join(' ') || person.name || '') : contactName;
      const query = encodeURIComponent(fullName);
      const url = `https://www.linkedin.com/search/results/people/?keywords=${query}`;
      // console.log('[TaskDetail] No personal LinkedIn, searching for person:', fullName);
      // console.log('[TaskDetail] LinkedIn search URL:', url);
      try {
        window.open(url, '_blank', 'noopener');
      } catch (e) {
        console.error('[TaskDetail] Failed to open LinkedIn search:', e);
        if (window.crm && typeof window.crm.showToast === 'function') {
          window.crm.showToast('Failed to open LinkedIn search. Please try again.', 'error');
        }
      }
    }
  }

  async function renderAccountTaskContent(task) {
    // Get account information
    const accountName = task.account || '';
    const accountId = task.accountId || '';

    // Load the account data
    const account = findAccountByIdOrName(accountId, accountName);

    if (!account) {
      return `<div class="task-content"><div class="empty">Account not found: ${escapeHtml(accountName)}</div></div>`;
    }

    // Get account fields
    const companyPhone = account.companyPhone || account.phone || account.primaryPhone || account.mainPhone || '';
    const industry = account.industry || '';
    const employees = account.employees || '';
    const shortDescription = account.shortDescription || '';
    const city = account.city || account.locationCity || '';
    const stateVal = account.state || account.locationState || '';
    const website = account.website || '';

    // Energy & contract fields
    const electricitySupplier = account.electricitySupplier || '';
    const annualUsage = account.annualUsage || '';
    const currentRate = account.currentRate || '';
    const contractEndDate = account.contractEndDate || '';

    // Prepare company icon using global favicon helper
    const deriveDomain = (input) => {
      try {
        if (!input) return '';
        let s = String(input).trim();
        if (/^https?:\/\//i.test(s)) { const u = new URL(s); return (u.hostname || '').replace(/^www\./i, ''); }
        if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) { return s.replace(/^www\./i, ''); }
        return '';
      } catch (_) { return ''; }
    };
    const domain = account.domain ? String(account.domain).replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./i, '') : deriveDomain(website);
    const logoUrl = account.logoUrl || '';
    let companyIconHTML = '';
    try {
      if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
        companyIconHTML = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl, domain, size: 32 });
      }
    } catch (_) { /* noop */ }
    if (!companyIconHTML) {
      if (window.__pcAccountsIcon) companyIconHTML = window.__pcAccountsIcon();
      else companyIconHTML = `<div class="company-logo-fallback">${accountName ? accountName.charAt(0).toUpperCase() : 'C'}</div>`;
    }

    // Render contacts list
    const contactsListHTML = await renderAccountContacts(account);

    return `
      <div class="main-content">
        <!-- Log Call Card (for phone tasks) -->
        ${task.type === 'phone-call' ? `
        <div class="task-card" id="call-log-card">
          <h3 class="section-title">Log call</h3>
          <div class="call-list">
            ${companyPhone ? `<div class="call-row"><button class="btn-secondary phone-text" data-phone="${escapeHtml(companyPhone)}" data-account-id="${escapeHtml(account.id || '')}" data-account-name="${escapeHtml(accountName || '')}" data-logo-url="${escapeHtml(logoUrl || '')}" data-is-company-phone="true" data-city="${escapeHtml(city || '')}" data-state="${escapeHtml(stateVal || '')}" data-domain="${escapeHtml(domain || '')}" data-call="${companyPhone}">Call</button><span class="call-number phone-text" data-phone="${escapeHtml(companyPhone)}" data-account-id="${escapeHtml(account.id || '')}" data-account-name="${escapeHtml(accountName || '')}" data-logo-url="${escapeHtml(logoUrl || '')}" data-is-company-phone="true" data-city="${escapeHtml(city || '')}" data-state="${escapeHtml(stateVal || '')}" data-domain="${escapeHtml(domain || '')}">${escapeHtml(companyPhone)}</span></div>` : '<div class="empty">No company phone number on file</div>'}
          </div>
          <div class="form-row">
            <label>Call purpose</label>
            <select class="input-dark" id="call-purpose">
              <option value="Prospecting Call" selected>Prospecting Call</option>
              <option value="Discovery">Discovery</option>
              <option value="Follow-up">Follow-up</option>
            </select>
          </div>
          <div class="form-row">
            <label>Notes</label>
            <textarea class="input-dark" id="call-notes" rows="3" placeholder="Add call notes...">${task.notes ? escapeHtml(task.notes) : ''}</textarea>
          </div>
          <div class="actions">
            <button class="btn-primary" id="log-complete-call">Log call & complete task</button>
            <button class="btn-secondary" id="schedule-meeting">Schedule a meeting</button>
          </div>
        </div>
        ` : ''}

        <!-- Contacts List Card -->
        <div class="task-card contacts-list-card">
          <div class="section-header-with-action">
            <h3 class="section-title">Contacts</h3>
            <button class="btn-icon-add" id="add-contact-btn" title="Add contact" aria-label="Add new contact">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>
          <div class="contacts-list" id="account-contacts-list">
            ${contactsListHTML}
          </div>
        </div>
      </div>
      
      <div class="sidebar-content">
        <!-- Account Information -->
        <div class="contact-info-section">
          <h3 class="section-title">Account Information</h3>
          <div class="info-grid">
            <div class="info-row">
              <div class="info-label">COMPANY PHONE</div>
              <div class="info-value-wrap" data-field="companyPhone">
                <span class="info-value-text ${!companyPhone ? 'empty' : ''}">${companyPhone ? `<span class="phone-text" data-phone="${escapeHtml(companyPhone)}" data-account-id="${escapeHtml(account.id || '')}" data-account-name="${escapeHtml(accountName || '')}" data-logo-url="${escapeHtml(logoUrl || '')}" data-is-company-phone="true" data-city="${escapeHtml(city || '')}" data-state="${escapeHtml(stateVal || '')}" data-domain="${escapeHtml(domain || '')}">${escapeHtml(companyPhone)}</span>` : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">INDUSTRY</div>
              <div class="info-value-wrap" data-field="industry">
                <span class="info-value-text ${!industry ? 'empty' : ''}">${escapeHtml(industry) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">EMPLOYEES</div>
              <div class="info-value-wrap" data-field="employees">
                <span class="info-value-text ${!employees ? 'empty' : ''}">${escapeHtml(employees) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">WEBSITE</div>
              <div class="info-value-wrap" data-field="website">
                <span class="info-value-text ${!website ? 'empty' : ''}">${website ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer" class="website-link">${escapeHtml(website)}</a>` : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">CITY</div>
              <div class="info-value-wrap" data-field="city">
                <span class="info-value-text ${!city ? 'empty' : ''}">${escapeHtml(city) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">STATE</div>
              <div class="info-value-wrap" data-field="state">
                <span class="info-value-text ${!stateVal ? 'empty' : ''}">${escapeHtml(stateVal) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
          </div>
          ${shortDescription ? `
          <div class="company-summary-section">
            <div class="info-label">COMPANY SUMMARY</div>
            <div class="company-summary-text">${escapeHtml(shortDescription)}</div>
          </div>
          ` : ''}
        </div>
        
        <!-- Energy & Contract Details -->
        <div class="contact-info-section">
          <h3 class="section-title">Energy & Contract</h3>
          <div class="info-grid">
            <div class="info-row">
              <div class="info-label">ELECTRICITY SUPPLIER</div>
              <div class="info-value-wrap" data-field="electricitySupplier">
                <span class="info-value-text ${!electricitySupplier ? 'empty' : ''}">${escapeHtml(electricitySupplier) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">ANNUAL USAGE</div>
              <div class="info-value-wrap" data-field="annualUsage">
                <span class="info-value-text ${!annualUsage ? 'empty' : ''}">${annualUsage ? escapeHtml(String(annualUsage).replace(/[^0-9]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')) : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">CURRENT RATE</div>
              <div class="info-value-wrap" data-field="currentRate">
                <span class="info-value-text ${!currentRate ? 'empty' : ''}">${escapeHtml(currentRate) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">CONTRACT END</div>
              <div class="info-value-wrap" data-field="contractEndDate">
                <span class="info-value-text ${!contractEndDate ? 'empty' : ''}">${contractEndDate ? escapeHtml(toMDY(contractEndDate)) : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Recent Calls Section -->
        <div class="contact-info-section" style="border-bottom: none; margin-bottom: 0;">
          <div class="section-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 class="section-title" style="margin-bottom: 0;">Recent Calls</h3>
            <div id="task-recent-calls-pagination" class="unified-pagination" style="display: none; margin-top: 0;"></div>
          </div>
          <div class="rc-list recent-calls-list" id="task-recent-calls-list"></div>
        </div>
        
        <!-- Recent Activity -->
        <div class="activity-section">
          <h3 class="section-title">Recent Activity</h3>
          <div class="activities-list" id="task-activity-timeline">
            <div class="activity-placeholder">
              <div class="placeholder-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 1v6m0 6v6"/>
                </svg>
              </div>
              <div class="placeholder-text">No recent activity</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCallTaskContent(task) {
    // Get contact information
    const contactName = task.contact || '';
    const accountName = task.account || '';

    // CRITICAL FIX: Use state.contact if available (already loaded by loadContactAccountData)
    // Only fall back to name-based lookup if state.contact is not set
    let person = state.contact || null;

    if (!person && typeof window.getPeopleData === 'function') {
      const people = window.getPeopleData() || [];
      person = people.find(p => {
        const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
        return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
      });
    }

    // Also try BackgroundContactsLoader if still not found
    if (!person && window.BackgroundContactsLoader) {
      try {
        const contacts = window.BackgroundContactsLoader.getContactsData() || [];
        person = contacts.find(c => {
          const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.name || '';
          return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
        });
      } catch (_) { /* noop */ }
    }

    // Also try by contactId if name match fails
    if (!person && task.contactId) {
      if (typeof window.getPeopleData === 'function') {
        const people = window.getPeopleData() || [];
        person = people.find(p => p.id === task.contactId);
      }
      if (!person && window.BackgroundContactsLoader) {
        try {
          const contacts = window.BackgroundContactsLoader.getContactsData() || [];
          person = contacts.find(c => c.id === task.contactId);
        } catch (_) { /* noop */ }
      }
    }

    person = person || {};

    // Get contact details for the sidebar
    const contactId = person.id || person.contactId || task.contactId || '';
    const email = person.email || '';
    const city = person.city || person.locationCity || '';
    const stateVal = person.state || person.locationState || '';
    const industry = person.industry || person.companyIndustry || '';
    const seniority = person.seniority || '';
    const department = person.department || '';
    const companyName = person.companyName || accountName;

    // CRITICAL FIX: Use state.account if available (already loaded by loadContactAccountData)
    // Only fall back to findAssociatedAccount if state.account is not set AND task didn't explicitly have an account that wasn't found
    // This prevents showing stale/deleted account data when the task's account was not found
    const linkedAccount = state.account || (state._taskAccountNotFound ? null : findAssociatedAccount(person)) || null;

    // Get location data from both contact and account
    const finalCity = city || linkedAccount?.city || linkedAccount?.locationCity || '';
    const finalState = stateVal || linkedAccount?.state || linkedAccount?.locationState || '';
    const finalIndustry = industry || linkedAccount?.industry || '';

    const electricitySupplier = linkedAccount?.electricitySupplier || '';
    const annualUsage = linkedAccount?.annualUsage || '';
    const currentRate = linkedAccount?.currentRate || '';
    const contractEndDate = linkedAccount?.contractEndDate || '';
    const shortDescription = linkedAccount?.shortDescription || '';
    const companyPhone = linkedAccount?.companyPhone || linkedAccount?.phone || linkedAccount?.primaryPhone || linkedAccount?.mainPhone || '';

    // Prepare company icon using global favicon helper
    const deriveDomain = (input) => {
      try {
        if (!input) return '';
        let s = String(input).trim();
        if (/^https?:\/\//i.test(s)) { const u = new URL(s); return (u.hostname || '').replace(/^www\./i, ''); }
        if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) { return s.replace(/^www\./i, ''); }
        return '';
      } catch (_) { return ''; }
    };
    const domain = linkedAccount?.domain ? String(linkedAccount.domain).replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./i, '') : deriveDomain(linkedAccount?.website || '');
    const logoUrl = linkedAccount?.logoUrl || '';
    let companyIconHTML = '';
    try {
      if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
        companyIconHTML = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl, domain, size: 32 });
      }
    } catch (_) { /* noop */ }
    if (!companyIconHTML) {
      if (window.__pcAccountsIcon) companyIconHTML = window.__pcAccountsIcon();
      else companyIconHTML = `<div class="company-logo-fallback">${companyName ? companyName.charAt(0).toUpperCase() : 'C'}</div>`;
    }

    // Build company description: prefer shortDescription; fallback to previous industry/location line
    const locationPart = city && stateVal ? ` • Located in ${escapeHtml(city)}, ${escapeHtml(stateVal)}` : (city ? ` • Located in ${escapeHtml(city)}` : (stateVal ? ` • Located in ${escapeHtml(stateVal)}` : ''));
    const companyDescriptionHTML = shortDescription ? escapeHtml(shortDescription) : `${industry ? `Industry: ${escapeHtml(industry)}` : ''}${locationPart}`;

    // Get primary phone data with type information
    const phoneData = getPrimaryPhoneData(person);
    const { value: primaryPhone, type: phoneType } = phoneData;
    const phones = [person.mobile, person.workDirectPhone, person.otherPhone].filter(Boolean);
    const phoneList = phones.map(ph => `<div class="call-row"><button class="btn-secondary" data-call="${ph}">Call</button><span class="call-number">${ph}</span></div>`).join('') || '<div class="empty">No phone numbers on file</div>';

    return `
      <div class="main-content">
        <!-- Log Call Card -->
        <div class="task-card" id="call-log-card">
          <h3 class="section-title">Log call</h3>
          <div class="call-list">${phoneList}</div>
          <div class="form-row">
            <label>Call purpose</label>
            <select class="input-dark" id="call-purpose">
              <option value="Prospecting Call" selected>Prospecting Call</option>
              <option value="Discovery">Discovery</option>
              <option value="Follow-up">Follow-up</option>
            </select>
          </div>
          <div class="form-row">
            <label>Notes</label>
            <textarea class="input-dark" id="call-notes" rows="3" placeholder="Add call notes...">${task.notes ? escapeHtml(task.notes) : ''}</textarea>
          </div>
          <div class="actions">
            <button class="btn-primary" id="log-complete-call">Log call & complete task</button>
            <button class="btn-secondary" id="schedule-meeting">Schedule a meeting</button>
          </div>
        </div>

        <!-- Company Summary Card -->
        <div class="company-summary-card">
          <div class="company-summary-header">
            <div class="company-logo">
              ${companyIconHTML}
            </div>
            <div class="company-name">${companyName ? `<a href="#account-details" class="company-link" id="task-company-link" title="View account details" data-account-id="${escapeHtml(linkedAccount?.id || '')}" data-account-name="${escapeHtml(companyName)}">${escapeHtml(companyName)}</a>` : 'Unknown Company'}</div>
          </div>
          <div class="company-details">
            <div class="company-detail-item">
              <span class="detail-label">Location:</span>
              <span class="detail-value">${finalCity && finalState ? `${escapeHtml(finalCity)}, ${escapeHtml(finalState)}` : (finalCity ? escapeHtml(finalCity) : (finalState ? escapeHtml(finalState) : '--'))}</span>
            </div>
            <div class="company-detail-item">
              <span class="detail-label">Industry:</span>
              <span class="detail-value">${escapeHtml(finalIndustry) || '--'}</span>
            </div>
          </div>
          <div class="company-description">
            ${companyDescriptionHTML}
          </div>
        </div>
        
      </div>
      
      <div class="sidebar-content">
        <!-- Contact Information -->
        <div class="contact-info-section">
          <h3 class="section-title">Contact Information</h3>
          <div class="info-grid">
            <div class="info-row">
              <div class="info-label">EMAIL</div>
              <div class="info-value-wrap" data-field="email" data-entity="contact" data-entity-id="${escapeHtml(contactId || '')}">
                <span class="info-value-text ${!email ? 'empty' : ''}">${email ? `<span class="email-text" data-email="${escapeHtml(email)}" data-contact-name="${escapeHtml(contactName)}" data-contact-id="${escapeHtml(contactId || '')}">${escapeHtml(email)}</span>` : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">${phoneType.toUpperCase()}</div>
              <div class="info-value-wrap" data-field="phone" data-entity="contact" data-entity-id="${escapeHtml(contactId || '')}" data-phone-type="${phoneType}">
                <span class="info-value-text ${!primaryPhone ? 'empty' : ''}">${primaryPhone ? `<span class="phone-text" data-phone="${escapeHtml(primaryPhone)}" data-contact-name="${escapeHtml(contactName)}" data-contact-id="${escapeHtml(contactId || '')}" data-account-id="${escapeHtml(linkedAccount?.id || '')}" data-account-name="${escapeHtml(companyName || '')}" data-company-name="${escapeHtml(companyName || '')}" data-logo-url="${escapeHtml(linkedAccount?.logoUrl || '')}" data-city="${escapeHtml(finalCity || '')}" data-state="${escapeHtml(finalState || '')}" data-domain="${escapeHtml(domain || '')}" data-phone-type="${phoneType}">${escapeHtml(primaryPhone)}</span>` : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">COMPANY PHONE</div>
              <div class="info-value-wrap" data-field="companyPhone" data-entity="account" data-entity-id="${escapeHtml(linkedAccount?.id || '')}">
                <span class="info-value-text ${!companyPhone ? 'empty' : ''}">${companyPhone ? `<span class="phone-text" data-phone="${escapeHtml(companyPhone)}" data-contact-name="" data-contact-id="" data-account-id="${escapeHtml(linkedAccount?.id || '')}" data-account-name="${escapeHtml(companyName || '')}" data-company-name="${escapeHtml(companyName || '')}" data-logo-url="${escapeHtml(linkedAccount?.logoUrl || '')}" data-city="${escapeHtml(finalCity || '')}" data-state="${escapeHtml(finalState || '')}" data-domain="${escapeHtml(domain || '')}" data-is-company-phone="true">${escapeHtml(companyPhone)}</span>` : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">CITY</div>
              <div class="info-value-wrap" data-field="city" data-entity="contact" data-entity-id="${escapeHtml(contactId || '')}">
                <span class="info-value-text ${!city ? 'empty' : ''}">${escapeHtml(city) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">STATE</div>
              <div class="info-value-wrap" data-field="state" data-entity="contact" data-entity-id="${escapeHtml(contactId || '')}">
                <span class="info-value-text ${!stateVal ? 'empty' : ''}">${escapeHtml(stateVal) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">INDUSTRY</div>
              <div class="info-value-wrap" data-field="industry" data-entity="contact" data-entity-id="${escapeHtml(contactId || '')}">
                <span class="info-value-text ${!industry ? 'empty' : ''}">${escapeHtml(industry) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        ${linkedAccount ? `
        <!-- Energy & Contract Details -->
        <div class="contact-info-section" style="border-bottom: none; margin-bottom: 0;">
          <h3 class="section-title">Energy & Contract</h3>
          <div class="info-grid">
            <div class="info-row">
              <div class="info-label">ELECTRICITY SUPPLIER</div>
              <div class="info-value-wrap" data-field="electricitySupplier" data-entity="account" data-entity-id="${escapeHtml(linkedAccount?.id || '')}">
                <span class="info-value-text ${!electricitySupplier ? 'empty' : ''}">${escapeHtml(electricitySupplier) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">ANNUAL USAGE</div>
              <div class="info-value-wrap" data-field="annualUsage" data-entity="account" data-entity-id="${escapeHtml(linkedAccount?.id || '')}">
                <span class="info-value-text ${!annualUsage ? 'empty' : ''}">${annualUsage ? escapeHtml(String(annualUsage).replace(/[^0-9]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')) : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">CURRENT RATE</div>
              <div class="info-value-wrap" data-field="currentRate" data-entity="account" data-entity-id="${escapeHtml(linkedAccount?.id || '')}">
                <span class="info-value-text ${!currentRate ? 'empty' : ''}">${escapeHtml(currentRate) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">CONTRACT END</div>
              <div class="info-value-wrap" data-field="contractEndDate" data-entity="account" data-entity-id="${escapeHtml(linkedAccount?.id || '')}">
                <span class="info-value-text ${!contractEndDate ? 'empty' : ''}">${contractEndDate ? escapeHtml(toMDY(contractEndDate)) : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        ` : ''}

        <!-- Recent Calls Section -->
        <div class="contact-info-section" style="border-bottom: none; margin-bottom: 0;">
          <div class="section-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 class="section-title" style="margin-bottom: 0;">Recent Calls</h3>
            <div id="task-recent-calls-pagination" class="unified-pagination" style="display: none; margin-top: 0;"></div>
          </div>
          <div class="rc-list recent-calls-list" id="task-recent-calls-list"></div>
        </div>
        
        <!-- Recent Activity -->
        <div class="activity-section">
          <h3 class="section-title">Recent Activity</h3>
          <div class="activities-list" id="task-activity-timeline">
            <div class="activity-placeholder">
              <div class="placeholder-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 1v6m0 6v6"/>
                </svg>
              </div>
              <div class="placeholder-text">No recent activity</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderEmailTaskContent(task) {
    // Get contact information (same as call/linkedin tasks)
    const contactName = task.contact || '';
    const accountName = task.account || '';

    // CRITICAL FIX: Use state.contact if available
    let person = state.contact || null;

    if (!person && typeof window.getPeopleData === 'function') {
      const people = window.getPeopleData() || [];
      person = people.find(p => {
        const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
        return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
      });
    }

    // Also try BackgroundContactsLoader
    if (!person && window.BackgroundContactsLoader) {
      try {
        const contacts = window.BackgroundContactsLoader.getContactsData() || [];
        person = contacts.find(c => {
          const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.name || '';
          return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
        });
      } catch (_) { }
    }

    // Also try by contactId
    if (!person && task.contactId) {
      if (typeof window.getPeopleData === 'function') {
        const people = window.getPeopleData() || [];
        person = people.find(p => p.id === task.contactId);
      }
      if (!person && window.BackgroundContactsLoader) {
        try {
          const contacts = window.BackgroundContactsLoader.getContactsData() || [];
          person = contacts.find(c => c.id === task.contactId);
        } catch (_) { }
      }
    }

    person = person || {};

    // Get contact details for the sidebar
    const contactId = person.id || person.contactId || task.contactId || '';
    const email = person.email || '';
    const city = person.city || person.locationCity || '';
    const stateVal = person.state || person.locationState || '';
    const industry = person.industry || person.companyIndustry || '';
    const seniority = person.seniority || '';
    const department = person.department || '';
    const companyName = person.companyName || accountName;

    // CRITICAL FIX: Use state.account if available
    const linkedAccount = state.account || (state._taskAccountNotFound ? null : findAssociatedAccount(person)) || null;

    // Get location data from both contact and account
    const finalCity = city || linkedAccount?.city || linkedAccount?.locationCity || '';
    const finalState = stateVal || linkedAccount?.state || linkedAccount?.locationState || '';
    const finalIndustry = industry || linkedAccount?.industry || '';

    const electricitySupplier = linkedAccount?.electricitySupplier || '';
    const annualUsage = linkedAccount?.annualUsage || '';
    const currentRate = linkedAccount?.currentRate || '';
    const contractEndDate = linkedAccount?.contractEndDate || '';
    const companyPhone = linkedAccount?.companyPhone || linkedAccount?.phone || linkedAccount?.primaryPhone || linkedAccount?.mainPhone || '';

    // Get primary phone data with type information
    const phoneData = getPrimaryPhoneData(person);
    const { value: primaryPhone, type: phoneType } = phoneData;

    // Domain for phone data
    const deriveDomain = (input) => {
      try {
        if (!input) return '';
        let s = String(input).trim();
        if (/^https?:\/\//i.test(s)) { const u = new URL(s); return (u.hostname || '').replace(/^www\./i, ''); }
        if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) { return s.replace(/^www\./i, ''); }
        return '';
      } catch (_) { return ''; }
    };
    const domain = linkedAccount?.domain ? String(linkedAccount.domain).replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./i, '') : deriveDomain(linkedAccount?.website || '');

    return `
      <div class="main-content">
        <div class="task-card email-composer-card">
          <div class="email-composer">
            <h3>Email Composer</h3>
            <div class="compose-header">
              <div class="form-row">
                <label>To</label>
                <input type="email" class="input-dark" value="${task.contact || ''}" readonly />
              </div>
              <div class="form-row">
                <label>Subject</label>
                <input type="text" class="input-dark" placeholder="Email subject" />
              </div>
            </div>
            
            <div class="compose-body">
              <div class="email-editor" contenteditable="true" placeholder="Compose your email..."></div>
            </div>
            
            <div class="compose-actions">
              <button class="btn-secondary" id="save-draft-btn">Save Draft</button>
              <button class="btn-primary" id="send-email-btn">Send Email</button>
              <button class="btn-secondary" id="schedule-email-btn">Schedule</button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="sidebar-content">
        <!-- Contact Information -->
        <div class="contact-info-section">
          <h3 class="section-title">Contact Information</h3>
          <div class="info-grid">
            <div class="info-row">
              <div class="info-label">EMAIL</div>
              <div class="info-value-wrap" data-field="email" data-entity="contact" data-entity-id="${escapeHtml(contactId || '')}">
                <span class="info-value-text ${!email ? 'empty' : ''}">${email ? `<span class="email-text" data-email="${escapeHtml(email)}" data-contact-name="${escapeHtml(contactName)}" data-contact-id="${escapeHtml(contactId || '')}">${escapeHtml(email)}</span>` : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">${phoneType.toUpperCase()}</div>
              <div class="info-value-wrap" data-field="phone" data-entity="contact" data-entity-id="${escapeHtml(contactId || '')}" data-phone-type="${phoneType}">
                <span class="info-value-text ${!primaryPhone ? 'empty' : ''}">${primaryPhone ? `<span class="phone-text" data-phone="${escapeHtml(primaryPhone)}" data-contact-name="${escapeHtml(contactName)}" data-contact-id="${escapeHtml(contactId || '')}" data-account-id="${escapeHtml(linkedAccount?.id || '')}" data-account-name="${escapeHtml(companyName || '')}" data-company-name="${escapeHtml(companyName || '')}" data-logo-url="${escapeHtml(linkedAccount?.logoUrl || '')}" data-city="${escapeHtml(finalCity || '')}" data-state="${escapeHtml(finalState || '')}" data-domain="${escapeHtml(domain || '')}" data-phone-type="${phoneType}">${escapeHtml(primaryPhone)}</span>` : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">COMPANY PHONE</div>
              <div class="info-value-wrap" data-field="companyPhone" data-entity="account" data-entity-id="${escapeHtml(linkedAccount?.id || '')}">
                <span class="info-value-text ${!companyPhone ? 'empty' : ''}">${companyPhone ? `<span class="phone-text" data-phone="${escapeHtml(companyPhone)}" data-contact-name="" data-contact-id="" data-account-id="${escapeHtml(linkedAccount?.id || '')}" data-account-name="${escapeHtml(companyName || '')}" data-company-name="${escapeHtml(companyName || '')}" data-logo-url="${escapeHtml(linkedAccount?.logoUrl || '')}" data-city="${escapeHtml(finalCity || '')}" data-state="${escapeHtml(finalState || '')}" data-domain="${escapeHtml(domain || '')}" data-is-company-phone="true">${escapeHtml(companyPhone)}</span>` : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">CITY</div>
              <div class="info-value-wrap" data-field="city" data-entity="contact" data-entity-id="${escapeHtml(contactId || '')}">
                <span class="info-value-text ${!city ? 'empty' : ''}">${escapeHtml(city) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">STATE</div>
              <div class="info-value-wrap" data-field="state" data-entity="contact" data-entity-id="${escapeHtml(contactId || '')}">
                <span class="info-value-text ${!stateVal ? 'empty' : ''}">${escapeHtml(stateVal) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">INDUSTRY</div>
              <div class="info-value-wrap" data-field="industry" data-entity="contact" data-entity-id="${escapeHtml(contactId || '')}">
                <span class="info-value-text ${!industry ? 'empty' : ''}">${escapeHtml(industry) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        ${linkedAccount ? `
        <!-- Energy & Contract Details -->
        <div class="contact-info-section">
          <h3 class="section-title">Energy & Contract</h3>
          <div class="info-grid">
            <div class="info-row">
              <div class="info-label">ELECTRICITY SUPPLIER</div>
              <div class="info-value-wrap" data-field="electricitySupplier" data-entity="account" data-entity-id="${escapeHtml(linkedAccount?.id || '')}">
                <span class="info-value-text ${!electricitySupplier ? 'empty' : ''}">${escapeHtml(electricitySupplier) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">ANNUAL USAGE</div>
              <div class="info-value-wrap" data-field="annualUsage" data-entity="account" data-entity-id="${escapeHtml(linkedAccount?.id || '')}">
                <span class="info-value-text ${!annualUsage ? 'empty' : ''}">${annualUsage ? escapeHtml(String(annualUsage).replace(/[^0-9]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')) : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">CURRENT RATE</div>
              <div class="info-value-wrap" data-field="currentRate" data-entity="account" data-entity-id="${escapeHtml(linkedAccount?.id || '')}">
                <span class="info-value-text ${!currentRate ? 'empty' : ''}">${escapeHtml(currentRate) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">CONTRACT END</div>
              <div class="info-value-wrap" data-field="contractEndDate" data-entity="account" data-entity-id="${escapeHtml(linkedAccount?.id || '')}">
                <span class="info-value-text ${!contractEndDate ? 'empty' : ''}">${contractEndDate ? escapeHtml(toMDY(contractEndDate)) : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        ` : ''}

        <!-- Recent Calls Section -->
        <div class="contact-info-section" style="border-bottom: none; margin-bottom: 0;">
          <div class="section-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 class="section-title" style="margin-bottom: 0;">Recent Calls</h3>
            <div id="task-recent-calls-pagination" class="unified-pagination" style="display: none; margin-top: 0;"></div>
          </div>
          <div class="rc-list recent-calls-list" id="task-recent-calls-list"></div>
        </div>
        
        <!-- Recent Activity -->
        <div class="activity-section">
          <h3 class="section-title">Recent Activity</h3>
          <div class="activities-list" id="task-activity-timeline">
            <div class="activity-placeholder">
              <div class="placeholder-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 1v6m0 6v6"/>
                </svg>
              </div>
              <div class="placeholder-text">No recent activity</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderLinkedInTaskContent(task) {
    // Get contact information (same as call tasks)
    const contactName = task.contact || '';
    const accountName = task.account || '';

    // CRITICAL FIX: Use state.contact if available (already loaded by loadContactAccountData)
    // Only fall back to name-based lookup if state.contact is not set
    let person = state.contact || null;

    if (!person && typeof window.getPeopleData === 'function') {
      const people = window.getPeopleData() || [];
      person = people.find(p => {
        const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
        return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
      });
    }

    // Also try BackgroundContactsLoader if still not found
    if (!person && window.BackgroundContactsLoader) {
      try {
        const contacts = window.BackgroundContactsLoader.getContactsData() || [];
        person = contacts.find(c => {
          const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.name || '';
          return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
        });
      } catch (_) { /* noop */ }
    }

    // Also try by contactId if name match fails
    if (!person && task.contactId) {
      if (typeof window.getPeopleData === 'function') {
        const people = window.getPeopleData() || [];
        person = people.find(p => p.id === task.contactId);
      }
      if (!person && window.BackgroundContactsLoader) {
        try {
          const contacts = window.BackgroundContactsLoader.getContactsData() || [];
          person = contacts.find(c => c.id === task.contactId);
        } catch (_) { /* noop */ }
      }
    }

    person = person || {};

    // Get contact details for the sidebar
    const contactId = person.id || person.contactId || task.contactId || '';
    const email = person.email || '';
    const city = person.city || person.locationCity || '';
    const stateVal = person.state || person.locationState || '';
    const industry = person.industry || person.companyIndustry || '';
    const seniority = person.seniority || '';
    const department = person.department || '';
    const companyName = person.companyName || accountName;
    const linkedinUrl = person.linkedin || '';

    // CRITICAL FIX: Use state.account if available (already loaded by loadContactAccountData)
    // Only fall back to findAssociatedAccount if state.account is not set AND task didn't explicitly have an account that wasn't found
    // This prevents showing stale/deleted account data when the task's account was not found
    const linkedAccount = state.account || (state._taskAccountNotFound ? null : findAssociatedAccount(person)) || null;

    // Get location data from both contact and account
    const finalCity = city || linkedAccount?.city || linkedAccount?.locationCity || '';
    const finalState = stateVal || linkedAccount?.state || linkedAccount?.locationState || '';
    const finalIndustry = industry || linkedAccount?.industry || '';

    const electricitySupplier = linkedAccount?.electricitySupplier || '';
    const annualUsage = linkedAccount?.annualUsage || '';
    const currentRate = linkedAccount?.currentRate || '';
    const contractEndDate = linkedAccount?.contractEndDate || '';
    const shortDescription = linkedAccount?.shortDescription || '';
    const companyPhone = linkedAccount?.companyPhone || linkedAccount?.phone || linkedAccount?.primaryPhone || linkedAccount?.mainPhone || '';

    // Prepare company icon using global favicon helper
    const deriveDomain = (input) => {
      try {
        if (!input) return '';
        let s = String(input).trim();
        if (/^https?:\/\//i.test(s)) { const u = new URL(s); return (u.hostname || '').replace(/^www\./i, ''); }
        if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) { return s.replace(/^www\./i, ''); }
        return '';
      } catch (_) { return ''; }
    };
    const domain = linkedAccount?.domain ? String(linkedAccount.domain).replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./i, '') : deriveDomain(linkedAccount?.website || '');
    const logoUrl = linkedAccount?.logoUrl || '';
    let companyIconHTML = '';
    try {
      if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
        companyIconHTML = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl, domain, size: 32 });
      }
    } catch (_) { /* noop */ }
    if (!companyIconHTML) {
      if (window.__pcAccountsIcon) companyIconHTML = window.__pcAccountsIcon();
      else companyIconHTML = `<div class="company-logo-fallback">${companyName ? companyName.charAt(0).toUpperCase() : 'C'}</div>`;
    }

    // Build company description: prefer shortDescription; fallback to previous industry/location line
    const locationPart = city && stateVal ? ` • Located in ${escapeHtml(city)}, ${escapeHtml(stateVal)}` : (city ? ` • Located in ${escapeHtml(city)}` : (stateVal ? ` • Located in ${escapeHtml(stateVal)}` : ''));
    const companyDescriptionHTML = shortDescription ? escapeHtml(shortDescription) : `${industry ? `Industry: ${escapeHtml(industry)}` : ''}${locationPart}`;

    // Get primary phone data with type information
    const phoneData = getPrimaryPhoneData(person);
    const { value: primaryPhone, type: phoneType } = phoneData;

    // Determine LinkedIn task action text
    const taskType = task.type;
    let actionText = '';
    let guidanceText = '';

    switch (taskType) {
      case 'li-connect':
      case 'linkedin-connect':
        actionText = 'Add on LinkedIn';
        guidanceText = 'Click "Access LinkedIn" to open the contact\'s LinkedIn profile. Send them a connection request, then mark this task as complete.';
        break;
      case 'li-message':
      case 'linkedin-message':
        actionText = 'Send a message on LinkedIn';
        guidanceText = 'Click "Access LinkedIn" to open the contact\'s LinkedIn profile. Send them a message, then mark this task as complete.';
        break;
      case 'li-view-profile':
      case 'linkedin-view':
        actionText = 'View LinkedIn profile';
        guidanceText = 'Click "Access LinkedIn" to open the contact\'s LinkedIn profile. Review their profile for context, then mark this task as complete.';
        break;
      case 'li-interact-post':
      case 'linkedin-interact':
        actionText = 'Interact with LinkedIn Post';
        guidanceText = 'Click "Access LinkedIn" to open the contact\'s LinkedIn profile. Like, comment, or share one of their recent posts, then mark this task as complete.';
        break;
      default:
        actionText = 'LinkedIn Task';
        guidanceText = 'Click "Access LinkedIn" to open the contact\'s LinkedIn profile and complete the required action.';
    }

    return `
      <div class="main-content">
        <!-- LinkedIn Task Card -->
        <div class="task-card" id="linkedin-task-card">
          <h3 class="section-title">${actionText}</h3>
          <div class="linkedin-task-info">
            <div class="info-item">
              <label>Contact</label>
              <div class="info-value">${escapeHtml(contactName) || 'Not specified'}</div>
            </div>
            <div class="info-item">
              <label>Company</label>
              <div class="info-value">${escapeHtml(companyName) || 'Not specified'}</div>
            </div>
          </div>
          
          <div class="form-row">
            <label>Notes</label>
            <textarea class="input-dark" id="linkedin-notes" rows="3" placeholder="Add notes about this LinkedIn interaction...">${task.notes ? escapeHtml(task.notes) : ''}</textarea>
          </div>
          
          <div class="actions">
            <button class="btn-primary" id="access-linkedin-btn">Access LinkedIn</button>
            <button class="btn-secondary" id="mark-complete-linkedin-btn">Mark as Complete</button>
          </div>
          
          <div class="linkedin-guidance">
            <p>${guidanceText}</p>
          </div>
        </div>
        
        <!-- Company Summary Card -->
        <div class="company-summary-card">
          <div class="company-summary-header">
            <div class="company-logo">
              ${companyIconHTML}
            </div>
            <div class="company-name">${companyName ? `<a href="#account-details" class="company-link" id="task-company-link" title="View account details" data-account-id="${escapeHtml(linkedAccount?.id || '')}" data-account-name="${escapeHtml(companyName)}">${escapeHtml(companyName)}</a>` : 'Unknown Company'}</div>
          </div>
          <div class="company-details">
            <div class="company-detail-item">
              <span class="detail-label">Location:</span>
              <span class="detail-value">${finalCity && finalState ? `${escapeHtml(finalCity)}, ${escapeHtml(finalState)}` : (finalCity ? escapeHtml(finalCity) : (finalState ? escapeHtml(finalState) : '--'))}</span>
            </div>
            <div class="company-detail-item">
              <span class="detail-label">Industry:</span>
              <span class="detail-value">${escapeHtml(finalIndustry) || '--'}</span>
            </div>
          </div>
          <div class="company-description">
            ${companyDescriptionHTML}
          </div>
        </div>
      </div>
      
      <div class="sidebar-content">
        <!-- Contact Information -->
        <div class="contact-info-section">
          <h3 class="section-title">Contact Information</h3>
          <div class="info-grid">
            <div class="info-row">
              <div class="info-label">EMAIL</div>
              <div class="info-value-wrap" data-field="email" data-entity="contact" data-entity-id="${escapeHtml(contactId || '')}">
                <span class="info-value-text ${!email ? 'empty' : ''}">${email ? `<span class="email-text" data-email="${escapeHtml(email)}" data-contact-name="${escapeHtml(contactName)}" data-contact-id="${escapeHtml(contactId || '')}">${escapeHtml(email)}</span>` : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">${phoneType.toUpperCase()}</div>
              <div class="info-value-wrap" data-field="phone" data-entity="contact" data-entity-id="${escapeHtml(contactId || '')}" data-phone-type="${phoneType}">
                <span class="info-value-text ${!primaryPhone ? 'empty' : ''}">${primaryPhone ? `<span class="phone-text" data-phone="${escapeHtml(primaryPhone)}" data-contact-name="${escapeHtml(contactName)}" data-contact-id="${escapeHtml(contactId || '')}" data-account-id="${escapeHtml(linkedAccount?.id || '')}" data-account-name="${escapeHtml(companyName || '')}" data-company-name="${escapeHtml(companyName || '')}" data-logo-url="${escapeHtml(linkedAccount?.logoUrl || '')}" data-city="${escapeHtml(finalCity || '')}" data-state="${escapeHtml(finalState || '')}" data-domain="${escapeHtml(domain || '')}" data-phone-type="${phoneType}">${escapeHtml(primaryPhone)}</span>` : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">COMPANY PHONE</div>
              <div class="info-value-wrap" data-field="companyPhone" data-entity="account" data-entity-id="${escapeHtml(linkedAccount?.id || '')}">
                <span class="info-value-text ${!companyPhone ? 'empty' : ''}">${companyPhone ? `<span class="phone-text" data-phone="${escapeHtml(companyPhone)}" data-contact-name="" data-contact-id="" data-account-id="${escapeHtml(linkedAccount?.id || '')}" data-account-name="${escapeHtml(companyName || '')}" data-company-name="${escapeHtml(companyName || '')}" data-logo-url="${escapeHtml(linkedAccount?.logoUrl || '')}" data-city="${escapeHtml(finalCity || '')}" data-state="${escapeHtml(finalState || '')}" data-domain="${escapeHtml(domain || '')}" data-is-company-phone="true">${escapeHtml(companyPhone)}</span>` : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">CITY</div>
              <div class="info-value-wrap" data-field="city" data-entity="contact" data-entity-id="${escapeHtml(contactId || '')}">
                <span class="info-value-text ${!city ? 'empty' : ''}">${escapeHtml(city) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">STATE</div>
              <div class="info-value-wrap" data-field="state" data-entity="contact" data-entity-id="${escapeHtml(contactId || '')}">
                <span class="info-value-text ${!stateVal ? 'empty' : ''}">${escapeHtml(stateVal) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">INDUSTRY</div>
              <div class="info-value-wrap" data-field="industry" data-entity="contact" data-entity-id="${escapeHtml(contactId || '')}">
                <span class="info-value-text ${!industry ? 'empty' : ''}">${escapeHtml(industry) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        ${linkedAccount ? `
        <!-- Energy & Contract Details -->
        <div class="contact-info-section">
          <h3 class="section-title">Energy & Contract</h3>
          <div class="info-grid">
            <div class="info-row">
              <div class="info-label">ELECTRICITY SUPPLIER</div>
              <div class="info-value-wrap" data-field="electricitySupplier" data-entity="account" data-entity-id="${escapeHtml(linkedAccount?.id || '')}">
                <span class="info-value-text ${!electricitySupplier ? 'empty' : ''}">${escapeHtml(electricitySupplier) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">ANNUAL USAGE</div>
              <div class="info-value-wrap" data-field="annualUsage" data-entity="account" data-entity-id="${escapeHtml(linkedAccount?.id || '')}">
                <span class="info-value-text ${!annualUsage ? 'empty' : ''}">${annualUsage ? escapeHtml(String(annualUsage).replace(/[^0-9]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')) : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">CURRENT RATE</div>
              <div class="info-value-wrap" data-field="currentRate" data-entity="account" data-entity-id="${escapeHtml(linkedAccount?.id || '')}">
                <span class="info-value-text ${!currentRate ? 'empty' : ''}">${escapeHtml(currentRate) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">CONTRACT END</div>
              <div class="info-value-wrap" data-field="contractEndDate" data-entity="account" data-entity-id="${escapeHtml(linkedAccount?.id || '')}">
                <span class="info-value-text ${!contractEndDate ? 'empty' : ''}">${contractEndDate ? escapeHtml(toMDY(contractEndDate)) : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        ` : ''}
        
        <!-- Recent Calls Section -->
        <div class="contact-info-section" style="border-bottom: none; margin-bottom: 0;">
          <h3 class="section-title">Recent Calls</h3>
          <div class="rc-list recent-calls-list" id="task-recent-calls-list"></div>
          <div id="task-recent-calls-pagination" class="pagination-controls" style="display: none; margin-top: 10px;"></div>
        </div>
                
        <!-- Recent Activity -->
        <div class="activity-section">
          <h3 class="section-title">Recent Activity</h3>
          <div class="activities-list" id="task-activity-timeline">
            <div class="activity-placeholder">
              <div class="placeholder-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 1v6m0 6v6"/>
                </svg>
              </div>
              <div class="placeholder-text">No recent activity</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderGenericTaskContent(task) {
    return `
      <div class="task-content">
        <div class="task-info-section">
          <h3>Task Information</h3>
          <div class="info-grid">
            <div class="info-item">
              <label>Type</label>
              <div class="info-value">${task.type}</div>
            </div>
            <div class="info-item">
              <label>Priority</label>
              <div class="info-value priority-badge ${task.priority}" style="background: ${getPriorityBackground(task.priority)}; color: ${getPriorityColor(task.priority)};">${task.priority}</div>
            </div>
            <div class="info-item">
              <label>Status</label>
              <div class="info-value status-badge ${task.status}">${task.status}</div>
            </div>
          </div>
        </div>
        
        <div class="task-notes-section">
          <h3>Notes</h3>
          <div class="notes-content">${task.notes || 'No notes provided'}</div>
        </div>
      </div>
    `;
  }

  function loadTaskWidgets() {
    // Load maps widget if account data is available
    if (state.account) {
      loadMapsWidget();
    }

    // Load energy health check if account data is available
    if (state.account) {
      loadEnergyHealthCheck();
    }

    // Load notes widget
    loadNotesWidget();
  }

  function loadMapsWidget() {
    // TODO: Load maps widget with account location
    // console.log('Loading maps widget for account:', state.account);
  }

  function loadEnergyHealthCheck() {
    // TODO: Load energy health check widget with account data
    // console.log('Loading energy health check for account:', state.account);
  }

  function loadNotesWidget() {
    // TODO: Load notes widget
    // console.log('Loading notes widget');
  }

  // Embed contact detail below-header section into right pane for context
  function embedContactDetails() {
    const mount = document.getElementById('task-contact-embed');
    if (!mount) return;
    const contactName = state.currentTask?.contact || '';
    const people = (typeof window.getPeopleData === 'function') ? (window.getPeopleData() || []) : [];
    let contact = null;
    if (state.currentTask?.contactId) {
      contact = people.find(p => String(p.id || '') === String(state.currentTask.contactId));
    }
    if (!contact && contactName) {
      const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
      contact = people.find(p => norm([p.firstName, p.lastName].filter(Boolean).join(' ') || p.name || '') === norm(contactName));
    }
    if (!contact) {
      mount.innerHTML = '<div class="empty">Contact not found in local data.</div>';
      return;
    }
    // Render the same contact detail body into this mount using existing renderer
    try {
      if (window.ContactDetail && typeof window.ContactDetail.renderInline === 'function') {
        window.ContactDetail.renderInline(contact, mount);
      } else {
        // Fallback: richer inline summary mirroring contact detail info grid
        const email = contact.email || '';
        const phoneData = getPrimaryPhoneData(contact);
        const { value: primaryPhone, type: phoneType } = phoneData;
        const city = contact.city || contact.locationCity || '';
        const stateVal = contact.state || contact.locationState || '';
        const industry = contact.industry || contact.companyIndustry || '';
        const company = contact.companyName || '';
        mount.innerHTML = `
          <div class="contact-inline">
            <h3 class="section-title">Contact information</h3>
            <div class="info-grid">
              <div class="info-row"><div class="info-label">EMAIL</div><div class="info-value">${email || '--'}</div></div>
              <div class="info-row"><div class="info-label">${phoneType.toUpperCase()}</div><div class="info-value">${primaryPhone ? `<span class="phone-text" data-phone="${escapeHtml(primaryPhone)}" data-contact-name="${escapeHtml(contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' '))}" data-contact-id="${escapeHtml(contact.id || '')}" data-account-id="${escapeHtml(contact.accountId || contact.account_id || '')}" data-account-name="${escapeHtml(company)}" data-company-name="${escapeHtml(company)}" data-logo-url="${escapeHtml(contact.logoUrl || '')}" data-city="${escapeHtml(city)}" data-state="${escapeHtml(stateVal)}" data-domain="${escapeHtml(contact.domain || '')}" data-phone-type="${phoneType}">${escapeHtml(primaryPhone)}</span>` : '--'}</div></div>
              <div class="info-row"><div class="info-label">COMPANY</div><div class="info-value">${company || '--'}</div></div>
              <div class="info-row"><div class="info-label">CITY</div><div class="info-value">${city || '--'}</div></div>
              <div class="info-row"><div class="info-label">STATE</div><div class="info-value">${stateVal || '--'}</div></div>
              <div class="info-row"><div class="info-label">INDUSTRY</div><div class="info-value">${industry || '--'}</div></div>
            </div>
          </div>`;
      }
    } catch (_) { }
  }

  // Handle contact phone clicks with proper contact context (same as contact-detail.js)
  function handleContactPhoneClick(phoneElement, person) {
    try {
      // console.log('[Task Detail] Contact phone clicked, setting contact context');

      // Get the phone type from the data attribute
      const phoneType = phoneElement.getAttribute('data-phone-type') || 'mobile';

      // Get the associated account to include logo and domain
      const linkedAccount = findAssociatedAccount(person);

      // Get domain from account if available
      const deriveDomain = (input) => {
        try {
          if (!input) return '';
          let s = String(input).trim();
          if (/^https?:\/\//i.test(s)) { const u = new URL(s); return (u.hostname || '').replace(/^www\./i, ''); }
          if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) { return s.replace(/^www\./i, ''); }
          return '';
        } catch (_) { return ''; }
      };
      const domain = linkedAccount?.domain ? String(linkedAccount.domain).replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./i, '') : deriveDomain(linkedAccount?.website || '');

      // Build contact context for contact phone calls
      const contextPayload = {
        contactId: person.id || person.contactId || person._id || '',
        contactName: person.name || [person.firstName, person.lastName].filter(Boolean).join(' ') || '',
        accountId: person.accountId || person.account_id || linkedAccount?.id || '',
        accountName: person.companyName || person.company || person.account || '',
        company: person.companyName || person.company || person.account || '',
        name: person.name || [person.firstName, person.lastName].filter(Boolean).join(' ') || '', // Contact name as primary
        city: person.city || person.locationCity || '',
        state: person.state || person.locationState || '',
        domain: domain || person.domain || '',
        logoUrl: linkedAccount?.logoUrl || person.logoUrl || '',
        isCompanyPhone: false, // This is a contact phone call
        phoneType: phoneType, // Include the phone type (mobile, work direct, other)
        suggestedContactId: person.id || person.contactId || person._id || '',
        suggestedContactName: person.name || [person.firstName, person.lastName].filter(Boolean).join(' ') || ''
      };

      // console.log('[Task Detail] Setting contact phone context:', contextPayload);

      // Set the context in the phone widget
      if (window.Widgets && typeof window.Widgets.setCallContext === 'function') {
        window.Widgets.setCallContext(contextPayload);

        // Also trigger contact display to show the contact info
        if (window.Widgets && typeof window.Widgets.setContactDisplay === 'function') {
          try {
            window.Widgets.setContactDisplay(contextPayload, '');
          } catch (_) { }
        }
      }

      // Mark that we've set a specific context to prevent generic click-to-call from overriding
      try {
        window._pcPhoneContextSetByPage = true;
        setTimeout(() => { window._pcPhoneContextSetByPage = false; }, 1000);
      } catch (_) { }

    } catch (error) {
      console.error('[Task Detail] Error setting contact phone context:', error);
    }
  }

  // Handle company phone clicks with proper company context (same pattern as account-detail.js and contact-detail.js)
  function handleCompanyPhoneClick(phoneElement) {
    try {
      // console.log('[Task Detail] Company phone clicked, setting company context');

      // Extract context from data attributes (first priority - most reliable for this specific phone element)
      const dataAccountId = phoneElement.getAttribute('data-account-id') || '';
      const dataAccountName = phoneElement.getAttribute('data-account-name') || phoneElement.getAttribute('data-company-name') || '';
      const dataLogoUrl = phoneElement.getAttribute('data-logo-url') || '';
      const dataCity = phoneElement.getAttribute('data-city') || '';
      const dataState = phoneElement.getAttribute('data-state') || '';
      const dataDomain = phoneElement.getAttribute('data-domain') || '';

      // CRITICAL: Also try to get account from state.account if available (most reliable source, like account-detail.js)
      let account = state.account || null;

      // If no state.account, try to find by accountId from data attributes
      if (!account && dataAccountId) {
        account = findAccountByIdOrName(dataAccountId, dataAccountName);
      }

      // Extract domain from account if available (same pattern as account-detail.js)
      let domain = dataDomain || '';
      if (!domain && account) {
        domain = account.domain || '';
        if (!domain && account.website) {
          try {
            const url = account.website.startsWith('http') ? account.website : `https://${account.website}`;
            const u = new URL(url);
            domain = u.hostname.replace(/^www\./i, '');
          } catch (_) {
            domain = String(account.website).replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./i, '');
          }
        }
      }

      // Compute logoUrl with robust fallbacks (same pattern as account-detail.js)
      const logoUrlComputed = (function () {
        try {
          // Priority 1: From account object (most reliable)
          if (account) {
            const fromAccount = account.logoUrl || account.logo || account.companyLogo || account.iconUrl || account.companyIcon || account.imageUrl || account.companyImage;
            if (fromAccount) return String(fromAccount);
          }

          // Priority 2: From data attribute
          if (dataLogoUrl) return String(dataLogoUrl);

          // Priority 3: Try DOM elements (like account-detail.js does)
          const root = document.querySelector('#task-detail-page') || document;
          const imgSel = [
            '#task-detail-page .company-favicon-header img',
            '#task-detail-page .company-logo img',
            '#task-detail-page img.company-favicon',
            '.page-header img.company-favicon',
            '#task-detail-page img[alt=""]'
          ].join(',');
          const img = root.querySelector(imgSel);
          if (img && img.src) return img.src;

          return '';
        } catch (_) { return ''; }
      })();

      // Build company context for company phone calls (same pattern as account-detail.js)
      const contextPayload = {
        accountId: account?.id || dataAccountId || null,
        accountName: account?.accountName || account?.name || account?.companyName || dataAccountName || null,
        company: account?.accountName || account?.name || account?.companyName || dataAccountName || null,
        contactId: null, // Explicitly null for company calls
        contactName: '', // Explicitly empty for company calls
        name: account?.accountName || account?.name || account?.companyName || dataAccountName || '', // Company name as primary
        city: account?.city || account?.locationCity || dataCity || '',
        state: account?.state || account?.locationState || dataState || '',
        domain: domain || '',
        logoUrl: logoUrlComputed || '',
        isCompanyPhone: true, // CRITICAL: Mark as company phone
        suggestedContactId: null,
        suggestedContactName: ''
      };

      // Set the context in the phone widget (same pattern as account-detail.js)
      if (window.Widgets && typeof window.Widgets.setCallContext === 'function') {
        window.Widgets.setCallContext(contextPayload);

        // Also trigger contact display to show the company info
        if (window.Widgets && typeof window.Widgets.setContactDisplay === 'function') {
          try {
            window.Widgets.setContactDisplay(contextPayload, '');
          } catch (_) { }
        }
      }

      // Mark that we've set a specific context to prevent generic click-to-call from overriding
      try {
        window._pcPhoneContextSetByPage = true;
        // Clear the flag after a short delay (same as account-detail.js uses 100ms)
        setTimeout(() => { window._pcPhoneContextSetByPage = false; }, 100);
      } catch (_) { }

    } catch (error) {
      console.error('[Task Detail] Error setting company phone context:', error);
    }
  }

  // --- Recent Calls Logic (Ported from Contact/Account Detail) ---

  function setupTaskRecentCallsHooks() {
    if (window._taskRcHooksBound) return;
    window._taskRcHooksBound = true;

    const refresh = debounce(() => {
      // Only refresh if task page is active
      if (document.getElementById('task-detail-page')?.classList.contains('active')) {
        loadRecentCallsForTask();
      }
    }, 1500);

    document.addEventListener('callEnded', refresh);
    document.addEventListener('pc:call-logged', refresh);
  }

  async function loadRecentCallsForTask(retryCount = 0) {
    const list = document.getElementById('task-recent-calls-list');
    if (!list) return;

    const page = document.getElementById('task-detail-page');
    const isVisible = page && page.classList.contains('active') && !page.hidden;
    if (!isVisible) return;

    const isDebug = window.PC_DEBUG === true;
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    if (isDebug) {
      // console.log('[TaskDetail] loadRecentCallsForTask:start', {
      //   retryCount,
      //   taskId: state.currentTask?.id || '',
      //   taskType: state.currentTask?.type || ''
      // });
    }

    const task = state.currentTask;
    if (!task) return;

    const isAcct = isAccountTask(task);
    let entityId = '';

    if (isAcct) {
      entityId = (state.account && state.account.id) || task.accountId || task.accountID || '';
      if (!entityId && task.account) {
        try {
          const a = findAccountByIdOrName(task.accountId || '', task.account);
          if (a && a.id) entityId = a.id;
        } catch (_) { }
      }
      if (!entityId) {
        list.innerHTML = '<div class="rc-empty">No account context</div>';
        try { const pager = document.getElementById('task-recent-calls-pagination'); if (pager) pager.style.display = 'none'; } catch (_) { }
        return;
      }
    } else {
      entityId = (state.contact && state.contact.id) || task.contactId || task.contactID || '';
      if (!entityId && task.contact) {
        try {
          const people = (typeof window.getPeopleData === 'function') ? (window.getPeopleData() || []) : [];
          const want = String(task.contact || '').trim().toLowerCase();
          if (want) {
            const p = people.find(pp => {
              const full = [pp.firstName, pp.lastName].filter(Boolean).join(' ').trim() || pp.name || '';
              return full && String(full).trim().toLowerCase() === want;
            });
            if (p && p.id) entityId = p.id;
          }
        } catch (_) { }
      }
      if (!entityId) {
        list.innerHTML = '<div class="rc-empty">No contact context</div>';
        try { const pager = document.getElementById('task-recent-calls-pagination'); if (pager) pager.style.display = 'none'; } catch (_) { }
        return;
      }
    }

    const loadingKey = `${isAcct ? 'account' : 'contact'}:${String(entityId)}`;
    if (state._rcLoadingKey === loadingKey) return;
    state._rcLoadingKey = loadingKey;

    taskRcSetLoading(list);

    const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
    const endpoint = isAcct ? 'account' : 'contact';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const token = (window.firebase && window.firebase.auth && window.firebase.auth().currentUser)
        ? await window.firebase.auth().currentUser.getIdToken()
        : null;

      let r;
      try {
        r = await fetch(`${base}/api/calls/${endpoint}/${encodeURIComponent(entityId)}?limit=50`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          signal: controller.signal
        });
      } catch (fetchError) {
        if (fetchError && fetchError.name === 'AbortError') {
          return;
        }
        throw fetchError;
      } finally {
        clearTimeout(timeoutId);
      }

      const j = await r.json().catch(() => ({}));
      const calls = (j && j.ok && Array.isArray(j.calls)) ? j.calls : [];

      const bizList = Array.isArray(window.CRM_BUSINESS_NUMBERS)
        ? window.CRM_BUSINESS_NUMBERS.map(n => String(n || '').replace(/\D/g, '').slice(-10)).filter(Boolean)
        : [];
      const isBiz = (p) => bizList.includes(p);
      const norm = (s) => String(s || '').replace(/\D/g, '').slice(-10);

      calls.forEach(c => {
        if (!c.id) c.id = c.twilioSid || c.callSid || c.sid || `${c.to || ''}_${c.from || ''}_${c.timestamp || c.callTime || ''}`;
        const to10 = norm(c.to);
        const from10 = norm(c.from);
        let direction = 'unknown';
        if (String(c.from || '').startsWith('client:') || isBiz(from10)) direction = 'outbound';
        else if (String(c.to || '').startsWith('client:') || isBiz(to10)) direction = 'inbound';
        const counter10 = direction === 'outbound' ? to10 : (direction === 'inbound' ? from10 : (to10 || from10));
        const pretty = counter10 ? `+1 (${counter10.slice(0, 3)}) ${counter10.slice(3, 6)}-${counter10.slice(6)}` : '';
        c.direction = c.direction || direction;
        c.counterpartyPretty = c.counterpartyPretty || pretty;
        c.contactPhone = c.contactPhone || pretty;

        try {
          if (!c.contactName && !isAcct) {
            const fullName = [state.contact?.firstName, state.contact?.lastName].filter(Boolean).join(' ') || state.contact?.name || task.contact;
            if (fullName) c.contactName = fullName;
          }
          if (!c.accountName) {
            const acctName = state.account?.accountName || state.account?.name || task.account;
            if (acctName) c.accountName = acctName;
          }
        } catch (_) { }
      });

      state._rcCalls = calls;
      state._rcPage = 1;
      renderTaskRecentCallsPage();
      bindTaskRecentCallsPager();
      try { window.ClickToCall?.processSpecificPhoneElements?.(); } catch (_) { }
    } catch (err) {
      console.warn('[TaskDetail] Error loading recent calls:', err);
      list.innerHTML = '<div class="rc-empty">Failed to load recent calls</div>';
      try { const pager = document.getElementById('task-recent-calls-pagination'); if (pager) pager.style.display = 'none'; } catch (_) { }
    } finally {
      try { if (state._rcLoadingKey === loadingKey) state._rcLoadingKey = null; } catch (_) { }
    }
  }

  function renderTaskRecentCallsPage() {
    const list = document.getElementById('task-recent-calls-list');
    if (!list) return;

    const allCalls = state._rcCalls || [];
    if (allCalls.length === 0) {
      list.innerHTML = '<div class="rc-empty">No recent calls</div>';
      const pager = document.getElementById('task-recent-calls-pagination');
      if (pager) pager.style.display = 'none';
      return;
    }

    const RC_PAGE_SIZE = 5;
    const page = state._rcPage || 1;
    const start = (page - 1) * RC_PAGE_SIZE;
    const slice = allCalls.slice(start, start + RC_PAGE_SIZE);
    const total = allCalls.length;

    // Check signature to avoid unnecessary re-renders (perf optimization)
    try {
      const key = slice.map(c => `${c.id}|${c.status}|${c.durationSec}|${c.transcript ? '1' : '0'}|${c.aiInsights ? '1' : '0'}`).join('||');
      const sig = `${state.currentTask?.id}::p${page}::${key}`;
      if (list.dataset.pcRecentCallsSig === sig) return;
      list.dataset.pcRecentCallsSig = sig;
    } catch (_) { }

    taskRcUpdateListAnimated(list, slice.map((call, index) => taskRcItemHtml(call, index)).join(''));

    const totalPages = Math.max(1, Math.ceil(total / RC_PAGE_SIZE));
    updateTaskRecentCallsPager(page, totalPages);
  }

  function taskRcItemHtml(c, index = 0) {
    // Prefer contact name; if absent (company call), show company once
    const hasContact = !!(c.contactId && c.contactName);
    const rawCompany = String(c.accountName || c.company || '');
    const displayName = hasContact ? String(c.contactName) : rawCompany || 'Unknown';
    const name = escapeHtml(displayName);
    const company = escapeHtml(rawCompany);
    const outcome = escapeHtml(c.outcome || c.status || '');
    const ts = c.callTime || c.timestamp || new Date().toISOString();
    const when = new Date(ts).toLocaleString();
    const idAttr = escapeHtml(String(c.id || c.twilioSid || c.callSid || ''));

    // Duration logic
    let durStr = '';
    const dur = Math.max(0, parseInt(c.durationSec || c.duration || 0, 10));
    durStr = `${Math.floor(dur / 60)}m ${dur % 60}s`;

    const phone = escapeHtml(String(c.targetPhone || c.to || c.from || c.contactPhone || c.counterpartyPretty || ''));
    const direction = escapeHtml((c.direction || '').charAt(0).toUpperCase() + (c.direction || '').slice(1));
    const title = `${name}${(hasContact && rawCompany && rawCompany !== displayName) ? ` • ${company}` : ''}`;

    // const delay = (index * 0.05).toFixed(2);

    // Check if CI is processed
    const hasInsights = c.transcript && c.aiInsights && Object.keys(c.aiInsights).length > 0;

    return `
      <div class="rc-item premium-borderline" data-id="${idAttr}">
        <div class="rc-meta">
          <div class="rc-title">${title}</div>
          <div class="rc-sub">${when} • <span class="rc-duration">${durStr}</span> • <span class="phone-number">${phone}</span>${direction ? ` • ${direction}` : ''}</div>
        </div>
        <div class="rc-actions">
          <span class="rc-outcome">${outcome}</span>
          <button type="button" class="rc-icon-btn rc-insights ${!hasInsights ? 'not-processed' : ''}" data-id="${idAttr}" aria-label="View insights" title="${!hasInsights ? 'Process Call' : 'View AI insights'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </div>`;
  }

  function taskRcUpdateListAnimated(list, html) {
    list.innerHTML = html;
    
    // Restore open states
    try {
      if (state._rcOpenIds && state._rcOpenIds.size > 0) {
        state._rcOpenIds.forEach(id => {
          const btn = list.querySelector(`.rc-insights[data-id="${CSS.escape(id)}"]`);
          const call = (state._rcCalls || []).find(c => String(c.id || c.twilioSid || c.callSid || '') === String(id));
          if (btn && call) {
            // Re-open without animation for restoration
            const item = btn.closest('.rc-item');
            if (item && !item.nextElementSibling?.classList.contains('rc-details')) {
              const panel = document.createElement('div');
              panel.className = 'rc-details';
              panel.innerHTML = `<div class="rc-details-inner">${taskRc_insightsInlineHtml(call)}</div>`;
              item.insertAdjacentElement('afterend', panel);
              panel.style.height = 'auto';
              panel.style.opacity = '1';
            }
          }
        });
      }
    } catch (_) { }

    // Re-bind insights buttons
    list.querySelectorAll('.rc-insights').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const callId = btn.getAttribute('data-id');
        const call = (state._rcCalls || []).find(c => String(c.id) === String(callId));
        if (call) toggleTaskRcDetails(btn, call);
      });
    });
  }

  function toggleTaskRcDetails(btn, call) {
    // If no insights, trigger CI
    if (!call.transcript || !call.aiInsights) {
      triggerTaskCI(call.id, call.recordingSid, btn);
      return;
    }

    const item = btn.closest('.rc-item');
    if (!item) return;
    const existing = item.nextElementSibling && item.nextElementSibling.classList && item.nextElementSibling.classList.contains('rc-details') ? item.nextElementSibling : null;
    const idStr = String(call.id || call.twilioSid || call.callSid || '');
    
    if (existing) {
      // Close
      try { if (state._rcOpenIds && state._rcOpenIds instanceof Set) state._rcOpenIds.delete(idStr); } catch (_) { }
      taskRc_animateCollapse(existing, () => existing.remove());
      return;
    }

    // Open
    try { if (!state._rcOpenIds || !(state._rcOpenIds instanceof Set)) state._rcOpenIds = new Set(); state._rcOpenIds.add(idStr); } catch (_) { }
    const panel = document.createElement('div');
    panel.className = 'rc-details';
    panel.innerHTML = `<div class="rc-details-inner">${taskRc_insightsInlineHtml(call)}</div>`;
    item.insertAdjacentElement('afterend', panel);
    taskRc_animateExpand(panel);

    // Background transcript fetch if missing
    try {
      const candidateSid = call.twilioSid || call.callSid || (typeof call.id === 'string' && /^CA[0-9a-zA-Z]+$/.test(call.id) ? call.id : '');
      if ((!call.transcript || String(call.transcript).trim() === '') && candidateSid) {
        const base = (window.API_BASE_URL || '').replace(/\/$/, '');
        const url = base ? `${base}/api/twilio/ai-insights` : '/api/twilio/ai-insights';
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callSid: candidateSid })
        }).then(res => res.json()).then(data => {
          if (data && data.transcript) {
            call.transcript = data.transcript;
            const tEl = panel.querySelector('.pc-transcript-container');
            if (tEl) tEl.innerHTML = taskRc_renderTranscriptHtml(call.aiInsights, call.transcript, call);
          }
        }).catch(() => { });
      }
    } catch (_) { }
  }

  // --- Task RC Helpers (Ported from Contact/Account Detail) ---
  
  function taskRc_animateExpand(el) {
    el.style.height = '0px'; el.style.opacity = '0';
    const h = el.scrollHeight; 
    requestAnimationFrame(() => {
      el.classList.add('expanding');
      el.style.transition = 'height 180ms ease, opacity 180ms ease';
      el.style.height = h + 'px'; el.style.opacity = '1';
      setTimeout(() => { el.style.height = ''; el.style.transition = ''; el.classList.remove('expanding'); }, 200);
    });
  }

  function taskRc_animateCollapse(el, done) {
    const h = el.scrollHeight;
    el.style.height = h + 'px'; el.style.opacity = '1';
    requestAnimationFrame(() => {
      el.classList.add('collapsing');
      el.style.transition = 'height 140ms ease, opacity 140ms ease';
      el.style.height = '0px'; el.style.opacity = '0';
      setTimeout(() => { el.classList.remove('collapsing'); done && done(); }, 160);
    });
  }

  function taskRc_getAgentAvatar() { return `<div class="transcript-avatar-circle agent-avatar" aria-hidden="true">Y</div>`; }

  function taskRc_getContactAvatar(contactName, call) {
    try {
      if (window.getPeopleData && call && call.contactId) {
         const people = window.getPeopleData() || [];
         const c = people.find(p => p.id === call.contactId);
         if (c && c.firstName) {
            const initials = (c.firstName.charAt(0) + (c.lastName ? c.lastName.charAt(0) : '')).toUpperCase();
            return `<div class="transcript-avatar-circle contact-avatar" aria-hidden="true">${initials}</div>`;
         }
      }
    } catch(_) {}

    // Account fallback
    const accountInfo = taskRc_getAccountInfoForAvatar(call && (call.accountName || ''));
    const { logoUrl, domain } = accountInfo;
    if (logoUrl || domain) {
      if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
        const iconHTML = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl, domain, size: 28 });
        return `<div class="transcript-avatar-circle company-avatar" aria-hidden="true">${iconHTML}</div>`;
      } else if (domain && window.__pcFaviconHelper) {
        return `<div class="transcript-avatar-circle company-avatar" aria-hidden="true">${window.__pcFaviconHelper.generateFaviconHTML(domain, 28)}</div>`;
      }
    }
    const initial = (String(contactName || 'C').charAt(0) || 'C').toUpperCase();
    return `<div class="transcript-avatar-circle contact-avatar" aria-hidden="true">${initial}</div>`;
  }

  function taskRc_getAccountInfoForAvatar(name) {
    const result = { logoUrl: '', domain: '' };
    if (!name) return result;
    try {
      const key = String(name).trim().toLowerCase();
      if (typeof window.getAccountsData === 'function') {
        const accounts = window.getAccountsData() || [];
        const hit = accounts.find(a => String(a.name || a.accountName || '').trim().toLowerCase() === key);
        if (hit) {
          result.logoUrl = hit.logoUrl || hit.iconUrl || hit.logo || hit.companyLogo || '';
          const dom = hit.domain || hit.website || '';
          if (dom) result.domain = String(dom).replace(/^https?:\/\//, '').replace(/\/$/, '');
        }
      }
    } catch (_) { }
    return result;
  }

  function taskRc_normalizeSupplierTokens(s) { try { if (!s) return ''; let out = String(s); out = out.replace(/\bT\s*X\s*U\b/gi, 'TXU'); out = out.replace(/\bN\s*R\s*G\b/gi, 'NRG'); out = out.replace(/\breliant\b/gi, 'Reliant'); return out; } catch (_) { return s || ''; } }

  function taskRc_toMMSS(s) { const m = Math.floor((s || 0) / 60), ss = (s || 0) % 60; return `${String(m)}:${String(ss).padStart(2, '0')}`; }

  function taskRc_parseSpeakerTranscript(text) {
      const out = []; if (!text) return out; const lines = String(text).split(/\r?\n/);
      for (const raw of lines) {
        const line = raw.trim(); if (!line) continue;
        let m = line.match(/^([A-Za-z][A-Za-z0-9 ]{0,30})\s+(\d+):(\d{2}):\s*(.*)$/);
        if (!m) { m = line.match(/^([A-Za-z][A-Za-z0-9 ]{0,30})\s+\d+\s+(\d+):(\d{2}):\s*(.*)$/); if (m) { m = [m[0], m[1], m[2], m[3], m[4]]; } }
        if (m) { const label = m[1].trim(); const mm = parseInt(m[2], 10) || 0; const ss = parseInt(m[3], 10) || 0; const txt = m[4] || ''; out.push({ label, t: mm * 60 + ss, text: txt }); continue; }
        out.push({ label: '', t: null, text: line });
      }
      return out;
  }

  function taskRc_renderTranscriptHtml(A, raw, call) {
      let turns = Array.isArray(A?.speakerTurns) ? A.speakerTurns : [];
      if (turns.length && !turns.some(t => t && (t.role === 'agent' || t.role === 'customer'))) {
        let next = 'customer';
        turns = turns.map(t => ({ t: Number(t.t) || 0, role: next = (next === 'agent' ? 'customer' : 'agent'), text: t.text || '' }));
      }
      if (turns.length) {
        const contactFirst = (String(call.contactName || '').trim().split(/\s+/)[0]) || 'Customer';
        const groups = [];
        let current = null;
        for (const t of turns) {
          const roleKey = t.role === 'agent' ? 'agent' : (t.role === 'customer' ? 'customer' : 'other');
          const text = taskRc_normalizeSupplierTokens(t.text || '');
          const ts = Number(t.t) || 0;
          if (current && current.role === roleKey) { current.texts.push(text); current.end = ts; }
          else { if (current) groups.push(current); current = { role: roleKey, start: ts, texts: [text] }; }
        }
        if (current) groups.push(current);
        return groups.map(g => {
          const label = g.role === 'agent' ? 'You' : (g.role === 'customer' ? contactFirst : 'Speaker');
          const avatar = g.role === 'agent' ? taskRc_getAgentAvatar() : taskRc_getContactAvatar(contactFirst, call);
          return `<div class="transcript-message ${g.role}"><div class="transcript-avatar">${avatar}</div><div class="transcript-content"><div class="transcript-header"><span class="transcript-speaker">${label}</span><span class="transcript-time">${taskRc_toMMSS(g.start)}</span></div><div class="transcript-text">${escapeHtml(g.texts.join(' ').trim())}</div></div></div>`;
        }).join('');
      }
      const parsed = taskRc_parseSpeakerTranscript(raw || '');
      if (parsed.some(p => p.label && p.t != null)) {
        const contactFirst = (String(call.contactName || '').trim().split(/\s+/)[0]) || 'Customer';
        let toggle = 'customer';
        return parsed.map(p => {
          if (!p.label) return `<div class="transcript-message"><div class="transcript-content"><div class="transcript-text">${escapeHtml(p.text || '')}</div></div></div>`;
          let roleLabel = p.label; let role = 'other';
          if (/^speaker\b/i.test(roleLabel)) { roleLabel = (toggle === 'agent') ? 'You' : contactFirst; role = toggle; toggle = (toggle === 'agent') ? 'customer' : 'agent'; }
          const avatar = role === 'agent' ? taskRc_getAgentAvatar() : taskRc_getContactAvatar(contactFirst, call);
          return `<div class="transcript-message ${role}"><div class="transcript-avatar">${avatar}</div><div class="transcript-content"><div class="transcript-header"><span class="transcript-speaker">${escapeHtml(roleLabel)}</span><span class="transcript-time">${taskRc_toMMSS(p.t)}</span></div><div class="transcript-text">${escapeHtml(p.text || '')}</div></div></div>`;
        }).join('');
      }
      const fallback = raw || (A && Object.keys(A).length ? 'Transcript processing...' : 'Transcript not available');
      return escapeHtml(fallback);
  }

  function taskRc_insightsInlineHtml(r) {
    const AI = r.aiInsights || {};
    let paragraph = '';
    let bulletItems = [];
    const rawTwilioSummary = (AI && typeof AI.summary === 'string') ? AI.summary.trim() : '';
    if (rawTwilioSummary) {
      const parts = rawTwilioSummary.split(' • ').map(s => s.trim()).filter(Boolean);
      paragraph = parts.shift() || '';
      bulletItems = parts;
    } else if (r.aiSummary && String(r.aiSummary).trim()) {
      paragraph = String(r.aiSummary).trim();
    } else if (AI && Object.keys(AI).length) {
      const sentiment = AI.sentiment || 'Unknown';
      const disposition = AI.disposition || '';
      const topics = Array.isArray(AI.keyTopics) ? AI.keyTopics.slice(0, 3).join(', ') : '';
      const who = r.contactName ? `Call with ${r.contactName}` : 'Call';
      let p = `${who}`;
      if (disposition) p += ` — ${disposition.toLowerCase()} disposition`;
      if (topics) p += `. Topics: ${topics}`;
      if (sentiment) p += `. ${sentiment} sentiment.`;
      paragraph = p;
    } else {
      paragraph = 'No summary available';
    }
    const redundant = /(current rate|rate type|supplier|utility|contract|usage|term|budget|timeline|topic|next step|pain point|entities?)/i;
    const filteredBullets = (bulletItems || []).filter(b => b && !redundant.test(b)).slice(0, 6);
    const sentiment = AI.sentiment || 'Unknown';
    const disposition = AI.disposition || '';
    const keyTopics = Array.isArray(AI.keyTopics) ? AI.keyTopics : [];
    const nextSteps = Array.isArray(AI.nextSteps) ? AI.nextSteps : [];
    const pain = Array.isArray(AI.painPoints) ? AI.painPoints : [];
    const flags = AI.flags || {};

    let transcriptHtml = '';
    try {
      const ci = r.conversationalIntelligence || {};
      const sentences = Array.isArray(ci.sentences) ? ci.sentences : [];
      const channelMap = ci.channelRoleMap || {};
      const normalizeChannel = (c) => { const s = (c == null ? '' : String(c)).trim(); if (s === '0') return '1'; if (/^[Aa]$/.test(s)) return '1'; if (/^[Bb]$/.test(s)) return '2'; return s; };
      const resolveRole = (ch) => {
        const n = normalizeChannel(ch);
        const mapped = channelMap[n];
        if (mapped === 'agent' || mapped === 'customer') return mapped;
        const agentCh = String(ci.agentChannel || channelMap.agentChannel || '');
        if (agentCh && n === agentCh) return 'agent';
        if (agentCh) return 'customer';
        return '';
      };
      if (sentences.length && (Object.keys(channelMap).length || ci.agentChannel != null || channelMap.agentChannel != null)) {
        const turns = sentences.map(s => {
          const role = resolveRole(s.channel ?? s.channelNumber ?? s.channel_id ?? s.channelIndex) || 'other';
          const t = Math.max(0, Number(s.startTime || 0));
          const text = (s.text || s.transcript || '').trim();
          return { t, role, text };
        });
        transcriptHtml = taskRc_renderTranscriptHtml({ speakerTurns: turns }, '', r);
      } else {
        const transcriptToUse = r.formattedTranscript || r.transcript;
        transcriptHtml = taskRc_renderTranscriptHtml(AI, transcriptToUse, r);
      }
    } catch (_) {
      try { const transcriptToUse = r.formattedTranscript || r.transcript; transcriptHtml = taskRc_renderTranscriptHtml(AI, transcriptToUse, r); } catch (__) { transcriptHtml = 'Transcript not available'; }
    }

    const rawRec = r.audioUrl || r.recordingUrl || '';
    let audioSrc = '';
    if (rawRec) {
      if (String(rawRec).includes('/api/recording?url=')) {
        audioSrc = rawRec;
      } else {
        const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
        const playbackBase = base; // Use local server for playback
        audioSrc = `${playbackBase}/api/recording?url=${encodeURIComponent(rawRec)}`;
      }
    }
    const audio = audioSrc ? `<audio controls preload="metadata" style="width:100%; margin-top:8px;"><source src="${audioSrc}" type="audio/mpeg">Your browser does not support audio playback.</audio>` : '<div style="color:var(--text-muted); font-size:12px;">No recording available</div>';
    const hasAI = AI && Object.keys(AI).length > 0;
    const svgEye = () => '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';

    const get = (obj, keys, d = '') => { for (const k of keys) { const v = obj && obj[k]; if (v !== undefined && v !== null && v !== '') return v; } return d; };
    const toLongDate = (v) => { try { const d = new Date(v); return isNaN(d) ? v : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); } catch (_) { return v || ''; } };

    const contract = AI.contract || {};
    const rate = get(contract, ['currentRate', 'current_rate', 'rate'], 'Unknown');
    const supplier = get(contract, ['supplier', 'utility'], 'Unknown');
    const contractEnd = get(contract, ['contractEnd', 'contract_end', 'endDate'], 'Not discussed');
    const contractEndDisplay = contractEnd ? toLongDate(contractEnd) : 'Not discussed';
    const usage = String(get(contract, ['usageKWh', 'usage_k_wh', 'usage'], 'Not provided'));
    const rateType = get(contract, ['rateType', 'rate_type'], 'Unknown');
    const contractLength = String(get(contract, ['contractLength', 'contract_length'], 'Unknown'));
    const budget = get(AI, ['budget'], 'Unclear');
    const timeline = get(AI, ['timeline'], 'Not specified');
    const entities = Array.isArray(AI.entities) ? AI.entities : [];
    const entitiesHtml = entities.length ? entities.slice(0, 20).map(e => `<span class="pc-chip">${escapeHtml(e.type || 'Entity')}: ${escapeHtml(e.text || '')}</span>`).join('') : '<span class="pc-chip">None</span>';

    const chips = [
      `<span class="pc-chip ${sentiment === 'Positive' ? 'ok' : sentiment === 'Negative' ? 'danger' : 'info'}">Sentiment: ${escapeHtml(sentiment)}</span>`,
      disposition ? `<span class="pc-chip info">Disposition: ${escapeHtml(disposition)}</span>` : '',
      flags.nonEnglish ? '<span class="pc-chip warn">Non‑English</span>' : '',
      flags.voicemailDetected ? '<span class="pc-chip warn">Voicemail</span>' : '',
      flags.callTransfer ? '<span class="pc-chip info">Transferred</span>' : '',
      flags.doNotContact ? '<span class="pc-chip danger">Do Not Contact</span>' : '',
      flags.recordingDisclosure ? '<span class="pc-chip ok">Recording Disclosure</span>' : ''
    ].filter(Boolean).join('');
    const topicsHtml = keyTopics.length ? keyTopics.map(t => `<span class="pc-chip">${escapeHtml(t)}</span>`).join('') : '<span class="pc-chip">None</span>';
    const nextHtml = nextSteps.length ? nextSteps.map(t => `<div>• ${escapeHtml(t)}</div>`).join('') : '<div>None</div>';
    const painHtml = pain.length ? pain.map(t => `<div>• ${escapeHtml(t)}</div>`).join('') : '<div>None mentioned</div>';

    return `
      <div class="insights-grid">
        <div>
          <div class="ip-card">
            <h4>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14,2 14,8 20,8"></polyline></svg>
              AI Call Summary
            </h4>
            <div class="pc-chips" style="margin:6px 0 10px 0;">${chips}</div>
            <div style="color:var(--text-secondary); line-height:1.5; margin-bottom:8px;">${escapeHtml(paragraph)}</div>
            ${filteredBullets.length ? `<ul class="summary-bullets" style="margin:0; padding-left:18px; color:var(--text-secondary);">${filteredBullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : ''}
          </div>
          <div class="ip-card" style="margin-top:12px;">
            <h4>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              Call Transcript
            </h4>
            <div class="pc-transcript-container">${transcriptHtml}</div>
          </div>
        </div>
        <div>
          <div class="ip-card">
            <h4>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              Call Recording
            </h4>
            <div style="color:var(--text-secondary); font-style:italic;">${audio}</div>
            ${audioSrc ? '' : '<div style="color:var(--text-muted); font-size:12px; margin-top:4px;">Recording may take 1-2 minutes to process after call completion</div>'}
            ${audioSrc && r.recordingChannels ? `<div style="color:var(--text-secondary); font-size:12px; margin-top:4px;">Recording: ${r.recordingChannels === '2' ? 'Dual-Channel (2 Channels)' : 'Single Channel'} • Source: ${r.recordingSource || 'Unknown'}</div>` : ''}
            ${hasAI ? '<div style="color:var(--orange-subtle); font-size:12px; margin-top:4px;">✓ AI analysis completed</div>' : '<div style="color:var(--text-muted); font-size:12px; margin-top:4px;">AI analysis in progress...</div>'}
          </div>
          <div class="ip-card" style="margin-top:12px;">
            <h4>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
              Energy & Contract Details
            </h4>
            <div class="pc-kv">
              <div class="k">Current rate</div><div class="v">${escapeHtml(rate)}</div>
              <div class="k">Supplier/Utility</div><div class="v">${escapeHtml(supplier)}</div>
              <div class="k">Contract end</div><div class="v">${escapeHtml(contractEndDisplay)}</div>
              <div class="k">Usage</div><div class="v">${escapeHtml(usage)}</div>
              <div class="k">Rate type</div><div class="v">${escapeHtml(rateType)}</div>
              <div class="k">Term</div><div class="v">${escapeHtml(contractLength)}</div>
              <div class="k">Budget</div><div class="v">${escapeHtml(budget)}</div>
              <div class="k">Timeline</div><div class="v">${escapeHtml(timeline)}</div>
            </div>
          </div>
          <div class="ip-card" style="margin-top:12px;"><h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg> Key Topics</h4><div class="pc-chips">${topicsHtml}</div></div>
          <div class="ip-card" style="margin-top:12px;"><h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg> Next Steps</h4><div style="color:var(--text-secondary); font-size:12px;">${nextHtml}</div></div>
          <div class="ip-card" style="margin-top:12px;"><h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> Pain Points</h4><div style="color:var(--text-secondary); font-size:12px;">${painHtml}</div></div>
          <div class="ip-card" style="margin-top:12px;"><h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg> Entities</h4><div class="pc-chips">${entitiesHtml}</div></div>
          <div class="ip-card" style="margin-top:12px; text-align:right;"><button class="rc-icon-btn" onclick="(function(){ try{ openInsightsModal && openInsightsModal('${String(r.id || '')}'); }catch(_){}})()" title="Open full modal" aria-label="Open full modal">${svgEye()}</button></div>
        </div>
      </div>`;
  }

  async function triggerTaskCI(callSid, recordingSid, btn) {
    if (window.SharedCIProcessor) {
      await window.SharedCIProcessor.processCall(callSid, recordingSid, btn, {
        context: 'task-detail',
        onSuccess: (updatedCall) => {
          // Update local state
          if (state._rcCalls) {
            const idx = state._rcCalls.findIndex(c => c.id === updatedCall.id);
            if (idx !== -1) state._rcCalls[idx] = { ...state._rcCalls[idx], ...updatedCall };
          }
          renderTaskRecentCallsPage();
        }
      });
    }
  }

  function taskRcSetLoading(list) {
    try {
      if (window.PCSkeletons && typeof window.PCSkeletons.mountListSkeleton === 'function') {
        window.PCSkeletons.mountListSkeleton(list, { count: 4, variant: 'recentCalls' });
        return;
      }
    } catch (_) { }
    list.innerHTML = `
        <div class="rc-skeletons">
          <div class="rc-item premium-borderline" style="opacity: 0.7; pointer-events: none; margin-bottom: 8px;">
            <div class="rc-meta skeleton-shimmer-modern" style="min-width: 0;">
              <div class="skeleton-shape" style="width: 58%; height: 14px; border-radius: 4px; margin-bottom: 6px;"></div>
              <div class="skeleton-shape" style="width: 86%; height: 12px; border-radius: 4px;"></div>
            </div>
            <div class="rc-actions" style="flex-shrink: 0;">
              <span class="rc-outcome" style="border-color: transparent;">
                <span class="skeleton-shimmer-modern" style="display: inline-block; vertical-align: middle;">
                  <span class="skeleton-shape" style="width: 70px; height: 18px; border-radius: 999px;"></span>
                </span>
              </span>
              <button type="button" class="rc-icon-btn" disabled>
                <span class="skeleton-shimmer-modern" style="display: inline-block;">
                  <span class="skeleton-shape" style="width: 16px; height: 16px; border-radius: 4px;"></span>
                </span>
              </button>
            </div>
          </div>
          <div class="rc-item premium-borderline" style="opacity: 0.7; pointer-events: none; margin-bottom: 8px;">
            <div class="rc-meta skeleton-shimmer-modern" style="min-width: 0;">
              <div class="skeleton-shape" style="width: 62%; height: 14px; border-radius: 4px; margin-bottom: 6px;"></div>
              <div class="skeleton-shape" style="width: 82%; height: 12px; border-radius: 4px;"></div>
            </div>
            <div class="rc-actions" style="flex-shrink: 0;">
              <span class="rc-outcome" style="border-color: transparent;">
                <span class="skeleton-shimmer-modern" style="display: inline-block; vertical-align: middle;">
                  <span class="skeleton-shape" style="width: 64px; height: 18px; border-radius: 999px;"></span>
                </span>
              </span>
              <button type="button" class="rc-icon-btn" disabled>
                <span class="skeleton-shimmer-modern" style="display: inline-block;">
                  <span class="skeleton-shape" style="width: 16px; height: 16px; border-radius: 4px;"></span>
                </span>
              </button>
            </div>
          </div>
          <div class="rc-item premium-borderline" style="opacity: 0.7; pointer-events: none; margin-bottom: 8px;">
            <div class="rc-meta skeleton-shimmer-modern" style="min-width: 0;">
              <div class="skeleton-shape" style="width: 52%; height: 14px; border-radius: 4px; margin-bottom: 6px;"></div>
              <div class="skeleton-shape" style="width: 88%; height: 12px; border-radius: 4px;"></div>
            </div>
            <div class="rc-actions" style="flex-shrink: 0;">
              <span class="rc-outcome" style="border-color: transparent;">
                <span class="skeleton-shimmer-modern" style="display: inline-block; vertical-align: middle;">
                  <span class="skeleton-shape" style="width: 72px; height: 18px; border-radius: 999px;"></span>
                </span>
              </span>
              <button type="button" class="rc-icon-btn" disabled>
                <span class="skeleton-shimmer-modern" style="display: inline-block;">
                  <span class="skeleton-shape" style="width: 16px; height: 16px; border-radius: 4px;"></span>
                </span>
              </button>
            </div>
          </div>
          <div class="rc-item premium-borderline" style="opacity: 0.7; pointer-events: none; margin-bottom: 8px;">
            <div class="rc-meta skeleton-shimmer-modern" style="min-width: 0;">
              <div class="skeleton-shape" style="width: 60%; height: 14px; border-radius: 4px; margin-bottom: 6px;"></div>
              <div class="skeleton-shape" style="width: 84%; height: 12px; border-radius: 4px;"></div>
            </div>
            <div class="rc-actions" style="flex-shrink: 0;">
              <span class="rc-outcome" style="border-color: transparent;">
                <span class="skeleton-shimmer-modern" style="display: inline-block; vertical-align: middle;">
                  <span class="skeleton-shape" style="width: 66px; height: 18px; border-radius: 999px;"></span>
                </span>
              </span>
              <button type="button" class="rc-icon-btn" disabled>
                <span class="skeleton-shimmer-modern" style="display: inline-block;">
                  <span class="skeleton-shape" style="width: 16px; height: 16px; border-radius: 4px;"></span>
                </span>
              </button>
            </div>
          </div>
        </div>
      `;
  }

  function bindTaskRecentCallsPager() {
    const container = document.getElementById('task-recent-calls-pagination');
    if (!container) return;

    // Clear existing content to avoid duplicates if re-binding
    container.innerHTML = '';
    container.className = 'unified-pagination';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'pagination-arrow';
    prevBtn.setAttribute('data-action', 'prev');
    prevBtn.setAttribute('aria-label', 'Previous page');
    prevBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-loaded"><polyline points="15,18 9,12 15,6"></polyline></svg>`;
    prevBtn.addEventListener('click', () => {
      if (state._rcPage > 1) {
        state._rcPage--;
        renderTaskRecentCallsPage();
      }
    });

    const nextBtn = document.createElement('button');
    nextBtn.className = 'pagination-arrow';
    nextBtn.setAttribute('data-action', 'next');
    nextBtn.setAttribute('aria-label', 'Next page');
    nextBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-loaded"><polyline points="9,18 15,12 9,6"></polyline></svg>`;
    nextBtn.addEventListener('click', () => {
      const total = (state._rcCalls || []).length;
      const totalPages = Math.max(1, Math.ceil(total / 5));
      if (state._rcPage < totalPages) {
        state._rcPage++;
        renderTaskRecentCallsPage();
      }
    });

    const currentContainer = document.createElement('div');
    currentContainer.className = 'pagination-current-container';

    const label = document.createElement('button');
    label.className = 'pagination-current';
    label.setAttribute('data-action', 'show-picker');
    label.id = 'task-rc-page-label';
    label.textContent = '1';

    currentContainer.appendChild(label);

    container.appendChild(prevBtn);
    container.appendChild(currentContainer);
    container.appendChild(nextBtn);

    // Store references for updates
    container._prevBtn = prevBtn;
    container._nextBtn = nextBtn;
    container._label = label;
  }

  function updateTaskRecentCallsPager(page, totalPages) {
    const container = document.getElementById('task-recent-calls-pagination');
    if (!container) return;

    // Ensure visible if we have pages
    container.style.display = totalPages > 1 ? 'flex' : 'none';
    if (totalPages <= 1) return;

    if (container._label) {
      container._label.textContent = `${page}`;
      container._label.setAttribute('aria-label', `Current page ${page} of ${totalPages}`);
    }
    if (container._prevBtn) container._prevBtn.disabled = page <= 1;
    if (container._nextBtn) container._nextBtn.disabled = page >= totalPages;
  }

  // Process click-to-call and click-to-email elements
  function processClickToCallAndEmail() {
    // Process phone numbers
    if (window.ClickToCall && typeof window.ClickToCall.processSpecificPhoneElements === 'function') {
      window.ClickToCall.processSpecificPhoneElements();
    }

    // Process email addresses
    if (window.ClickToEmail && typeof window.ClickToEmail.processSpecificEmailElements === 'function') {
      window.ClickToEmail.processSpecificEmailElements();
    }
  }

  // Load recent activity for the task (account or contact)
  async function loadRecentActivityForTask(opts = {}) {
    await new Promise(resolve => setTimeout(resolve, 500));

    const timelineEl = document.getElementById('task-activity-timeline');
    if (!timelineEl) return;

    const forceRefresh = !!(opts && opts.forceRefresh);

    // Check if this is an account task or contact task
    const isAcctTask = isAccountTask(state.currentTask);

    if (isAcctTask) {
      // ACCOUNT TASK - Load account activities
      const accountName = state.currentTask?.account || '';
      const accountId = state.currentTask?.accountId || '';

      if (!accountName && !accountId) {
        timelineEl.innerHTML = `
          <div class="activity-placeholder">
            <div class="placeholder-text">No account specified for this task</div>
          </div>
        `;
        return;
      }

      try {
        if (window.ActivityManager) {
          // Find the account ID
          let finalAccountId = accountId;
          if (!finalAccountId && accountName) {
            const account = findAccountByIdOrName('', accountName);
            finalAccountId = account?.id || '';
          }

          if (finalAccountId) {
            await window.ActivityManager.renderActivities('task-activity-timeline', 'account', finalAccountId, forceRefresh);
            // Ensure activities know they're being clicked from task-detail
            window._activityClickSource = 'task-detail';
          } else {
            // Show empty state if account not found
            timelineEl.innerHTML = `
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
        } else {
          timelineEl.innerHTML = `
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
      } catch (error) {
        console.error('Error loading account activity:', error);
        timelineEl.innerHTML = `
          <div class="activity-placeholder">
            <div class="placeholder-text">Error loading activity</div>
          </div>
        `;
      }
    } else {
      // CONTACT TASK - Load contact activities
      const contactName = state.currentTask?.contact || '';

      if (!contactName) {
        timelineEl.innerHTML = `
          <div class="activity-placeholder">
            <div class="placeholder-text">No contact specified for this task</div>
          </div>
        `;
        return;
      }

      try {
        // Use ActivityManager to load real activities for the contact
        if (window.ActivityManager) {
          // Find the contact ID from the contact name
          const contactId = findContactIdByName(contactName);
          if (contactId) {
            await window.ActivityManager.renderActivities('task-activity-timeline', 'contact', contactId, forceRefresh);
            // Ensure activities know they're being clicked from task-detail
            window._activityClickSource = 'task-detail';
          } else {
            // Show empty state if contact not found
            timelineEl.innerHTML = `
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
        } else {
          // Show empty state if ActivityManager not available
          timelineEl.innerHTML = `
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
      } catch (error) {
        console.error('Error loading contact activity:', error);
        timelineEl.innerHTML = `
          <div class="activity-placeholder">
            <div class="placeholder-text">Error loading activity</div>
          </div>
        `;
      }
    }
  }

  // Helper function to find contact ID by name
  function findContactIdByName(contactName) {
    if (!contactName || !window.getPeopleData) return null;

    try {
      const contacts = window.getPeopleData() || [];
      const contact = contacts.find(c => {
        const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ');
        return fullName === contactName || c.name === contactName || c.firstName === contactName;
      });
      return contact ? contact.id : null;
    } catch (error) {
      console.error('Error finding contact by name:', error);
      return null;
    }
  }

  // Get SVG icon for activity type
  function getActivityIcon(type) {
    switch (type) {
      case 'phone':
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
      case 'email':
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`;
      case 'task':
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
      default:
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/></svg>`;
    }
  }

  // Render contacts list for account tasks
  async function renderAccountContacts(account) {
    if (!account || !window.getPeopleData) {
      return '<div class="contacts-placeholder">No contacts found</div>';
    }

    try {
      const allContacts = window.getPeopleData() || [];
      const accountName = account.accountName || account.name || account.companyName;

      // Find contacts associated with this account
      const associatedContacts = allContacts.filter(contact => {
        // Check if contact has accountId matching this account
        if (contact.accountId === account.id) return true;

        // Check if contact's company name matches this account name
        const contactCompany = contact.companyName || contact.accountName || '';
        return contactCompany.toLowerCase().trim() === accountName.toLowerCase().trim();
      });

      if (associatedContacts.length === 0) {
        return '<div class="contacts-placeholder">No contacts found for this account</div>';
      }

      // NEW: Fetch list memberships for all associated contacts
      await fetchContactMemberships(associatedContacts);

      return associatedContacts.map(contact => {
        const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.name || 'Unknown Contact';
        const title = contact.title || '';
        const email = contact.email || '';
        const phone = contact.workDirectPhone || contact.mobile || contact.otherPhone || '';

        // Compute initials for avatar
        const parts = fullName.trim().split(/\s+/);
        const initials = parts.length >= 2
          ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
          : (parts[0] ? parts[0][0].toUpperCase() : '?');

        // Get list and sequence name badges
        const listMemberships = state._contactListMemberships[contact.id] || [];
        const sequenceMemberships = state._contactSequenceMemberships[contact.id] || [];

        const listIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 4px; opacity: 0.8;"><circle cx="4" cy="6" r="1"></circle><circle cx="4" cy="12" r="1"></circle><circle cx="4" cy="18" r="1"></circle><line x1="8" y1="6" x2="20" y2="6"></line><line x1="8" y1="12" x2="20" y2="12"></line><line x1="8" y1="18" x2="20" y2="18"></line></svg>`;
        const sequenceIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; opacity: 0.8;"><polygon points="7 4 20 12 7 20 7 4"></polygon></svg>`;

        const listBadges = listMemberships.map(name => `<span class="contact-list-badge">${listIcon}${escapeHtml(name)}</span>`).join('');
        const sequenceBadges = sequenceMemberships.map(name => `<span class="contact-sequence-badge">${sequenceIcon}${escapeHtml(name)}</span>`).join('');
        const badgeHtml = listBadges + sequenceBadges;

        return `
          <div class="contact-item contact-link" data-contact-id="${escapeHtml(contact.id)}" data-contact-name="${escapeHtml(fullName)}" style="cursor: pointer;">
            <div class="contact-avatar">
              <div class="avatar-circle-small" aria-hidden="true">${initials}</div>
            </div>
            <div class="contact-info">
              <div class="contact-name-container">
                <div class="contact-name">
                  <span class="contact-name-text">${escapeHtml(fullName)}</span>
                </div>
                ${badgeHtml}
              </div>
              <div class="contact-details">
                ${title ? `<span class="contact-title">${escapeHtml(title)}</span>` : ''}
                ${email ? `<span class="email-text" data-email="${escapeHtml(email)}" data-contact-name="${escapeHtml(fullName)}" data-contact-id="${escapeHtml(contact.id || '')}">${escapeHtml(email)}</span>` : ''}
                ${phone ? `<span class="phone-text" data-phone="${escapeHtml(phone)}" data-contact-name="${escapeHtml(fullName)}" data-contact-id="${escapeHtml(contact.id || '')}" data-account-id="${escapeHtml(account.id || '')}" data-account-name="${escapeHtml(accountName || '')}" data-logo-url="${escapeHtml(account.logoUrl || '')}" data-city="${escapeHtml(account.city || account.locationCity || '')}" data-state="${escapeHtml(account.state || account.locationState || '')}" data-domain="${escapeHtml(account.domain || '')}">${escapeHtml(phone)}</span>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (error) {
      console.error('Error rendering account contacts:', error);
      return '<div class="contacts-placeholder">Error loading contacts</div>';
    }
  }

  // Setup phone click handlers for contact phones (capture-phase to win race vs ClickToCall)
  function setupPhoneClickHandlers() {
    const hasMouseDownHandler = typeof document._taskDetailPhoneMouseDownHandler === 'function';
    const hasClickHandler = typeof document._taskDetailPhoneClickHandler === 'function';

    if (document._taskDetailPhoneHandlersBound && hasMouseDownHandler && hasClickHandler) {
      return;
    }

    if (document._taskDetailPhoneHandlersBound && (!hasMouseDownHandler || !hasClickHandler)) {
      console.warn('[TaskDetail] Phone handler guard set but listeners missing. Rebinding.');
    }

    // Helper: resolve person from current task contact name
    function resolvePerson() {
      const contactName = state.currentTask?.contact || '';
      const people = (typeof window.getPeopleData === 'function') ? (window.getPeopleData() || []) : [];
      return people.find(p => {
        const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
        return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
      }) || null;
    }

    // Target any contact phone span within task detail that declares a phone type
    function findContactPhoneTarget(evtTarget) {
      return evtTarget.closest('#task-detail-page .phone-text[data-phone-type]');
    }

    // Target company phone elements (same pattern as contact phones)
    function findCompanyPhoneTarget(evtTarget) {
      return evtTarget.closest('#task-detail-page .phone-text[data-is-company-phone="true"]');
    }

    const mouseDownHandler = (e) => {
      // Check for company phone first (capture phase to win race)
      const companyPhoneElement = findCompanyPhoneTarget(e.target);
      if (companyPhoneElement) {
        try { window._pcPhoneContextSetByPage = true; } catch (_) { }
        handleCompanyPhoneClick(companyPhoneElement);
        return;
      }

      // Then check for contact phone
      const phoneElement = findContactPhoneTarget(e.target);
      if (!phoneElement) return;
      try { window._pcPhoneContextSetByPage = true; } catch (_) { }
      const person = resolvePerson();
      if (person && person.id) {
        // Set context early so ClickToCall sees the guard and skips its own context
        handleContactPhoneClick(phoneElement, person);
      }
    };
    // Capture-phase mousedown sets the guard before ClickToCall runs
    document.addEventListener('mousedown', mouseDownHandler, true);
    document._taskDetailPhoneMouseDownHandler = mouseDownHandler;

    const clickHandler = (e) => {
      // Check for company phone first
      const companyPhoneElement = findCompanyPhoneTarget(e.target);
      if (companyPhoneElement) {
        handleCompanyPhoneClick(companyPhoneElement);
        return;
      }

      // Then check for contact phone
      const phoneElement = findContactPhoneTarget(e.target);
      if (!phoneElement) return;
      const person = resolvePerson();
      if (person && person.id) {
        handleContactPhoneClick(phoneElement, person);
      }
    };

    // Capture-phase click as a backup to ensure context is set
    document.addEventListener('click', clickHandler, true);
    document._taskDetailPhoneClickHandler = clickHandler;

    document._taskDetailPhoneHandlersBound = true;
  }

  // Setup contact link handlers
  function setupContactLinkHandlers() {
    const haveLinkHandler = typeof document._taskDetailContactHandler === 'function';
    const haveAddBtnHandler = typeof document._taskDetailAddContactHandler === 'function';

    if (document._taskDetailContactHandlersBound && haveLinkHandler && haveAddBtnHandler) {
      // console.log('[TaskDetail] Contact handlers already bound, skipping');
      return;
    }

    if (document._taskDetailContactHandlersBound && (!haveLinkHandler || !haveAddBtnHandler)) {
      console.warn('[TaskDetail] Contact handler guard was set but listeners were missing. Rebinding now.');
    }

    // console.log('[TaskDetail] Setting up contact link handlers');

    const contactLinkHandler = (e) => {
      // FIX: Skip navigation if click originated from a button inside the link
      if (e.target.closest('button')) {
        return;
      }

      // CRITICAL FIX: Check if click is within task-detail-page first
      const taskPage = e.target.closest('#task-detail-page');
      if (!taskPage) return;

      // CRITICAL FIX: Try multiple ways to find the contact link
      let contactLink = null;

      // Method 1: Check if target itself is the link
      if (e.target.classList && e.target.classList.contains('contact-link')) {
        contactLink = e.target;
      }

      // Method 2: Check if target is inside a contact-link
      if (!contactLink) {
        contactLink = e.target.closest('.contact-link');
      }

      // Method 3: Check if we're inside the title element which contains the link
      if (!contactLink) {
        const titleEl = e.target.closest('#task-detail-title');
        if (titleEl) {
          contactLink = titleEl.querySelector('.contact-link');
        }
      }

      if (!contactLink) return;

      e.preventDefault();
      e.stopPropagation(); // Prevent any other handlers from interfering

      const contactId = contactLink.getAttribute('data-contact-id');
      const contactName = contactLink.getAttribute('data-contact-name');

      // console.log('[TaskDetail] Contact link clicked:', { contactId, contactName, target: e.target, link: contactLink });

      // If no contactId, try to find the contact by name
      if (!contactId && contactName) {
        // console.log('[TaskDetail] No contactId, searching by name:', contactName);
        try {
          const people = (typeof window.getPeopleData === 'function') ? (window.getPeopleData() || []) : [];
          const contact = people.find(p => {
            const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
            return fullName && contactName && fullName.toLowerCase() === contactName.toLowerCase();
          });

          if (contact && contact.id) {
            // console.log('[TaskDetail] Found contact by name:', contact.id);
            // Update the link with the found ID
            contactLink.setAttribute('data-contact-id', contact.id);
            // Retry the click with the ID
            contactLink.click();
            return;
          } else {
            console.warn('[TaskDetail] Contact not found:', contactName);
            if (window.crm && typeof window.crm.showToast === 'function') {
              window.crm.showToast('Contact not found in system. Please check People page.', 'error');
            }
            return;
          }
        } catch (error) {
          console.error('[TaskDetail] Error finding contact:', error);
        }
      }

      // CRITICAL FIX: Handle both cases - with contactId and without
      if (!contactId && !contactName) {
        console.warn('[TaskDetail] Contact link has no ID or name');
        return;
      }

      // Final contactId to use
      let finalContactId = contactId;

      // If no contactId but we have a name, try to find it
      if (!finalContactId && contactName) {
        try {
          // Try getPeopleData first
          if (typeof window.getPeopleData === 'function') {
            const people = window.getPeopleData() || [];
            const contact = people.find(p => {
              const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
              return fullName && contactName && fullName.toLowerCase() === contactName.toLowerCase();
            });
            if (contact && contact.id) {
              finalContactId = contact.id;
              // console.log('[TaskDetail] Found contact by name via getPeopleData:', finalContactId);
            }
          }

          // Try BackgroundContactsLoader if still not found
          if (!finalContactId && window.BackgroundContactsLoader) {
            const contacts = window.BackgroundContactsLoader.getContactsData() || [];
            const contact = contacts.find(c => {
              const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.name || '';
              return fullName && contactName && fullName.toLowerCase() === contactName.toLowerCase();
            });
            if (contact && contact.id) {
              finalContactId = contact.id;
              // console.log('[TaskDetail] Found contact by name via BackgroundContactsLoader:', finalContactId);
            }
          }
        } catch (error) {
          console.error('[TaskDetail] Error finding contact by name:', error);
        }
      }

      if (!finalContactId) {
        console.warn('[TaskDetail] Could not find contact ID for:', contactName);
        if (window.crm && typeof window.crm.showToast === 'function') {
          window.crm.showToast('Contact not found in system. Please check People page.', 'error');
        }
        return;
      }

      if (window.ContactDetail) {
        // Capture task detail state for back navigation
        window.__taskDetailRestoreData = {
          taskId: state.currentTask?.id,
          taskType: state.currentTask?.type,
          contact: state.currentTask?.contact,
          account: state.currentTask?.account,
          scroll: window.scrollY || 0,
          timestamp: Date.now()
        };

        // Set navigation source for back button
        window._contactNavigationSource = 'task-detail';
        window._contactNavigationContactId = finalContactId;

        // Navigate to contact detail
        if (window.crm && typeof window.crm.navigateToPage === 'function') {
          window.crm.navigateToPage('people');

          // CRITICAL FIX: Use retry pattern with timeout and error handling
          requestAnimationFrame(() => {
            let attempts = 0;
            const maxAttempts = 25; // 2 seconds at 80ms intervals (increased for reliability)

            const tryShowContact = () => {
              if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
                try {
                  // console.log('[TaskDetail] Opening contact detail for ID:', finalContactId);
                  window.ContactDetail.show(finalContactId);
                } catch (error) {
                  console.error('[TaskDetail] Error showing contact:', error);
                  if (window.crm && typeof window.crm.showToast === 'function') {
                    window.crm.showToast('Failed to open contact. Please try again.', 'error');
                  }
                }
              } else if (attempts < maxAttempts) {
                attempts++;
                setTimeout(tryShowContact, 80);
              } else {
                console.warn('[TaskDetail] ContactDetail module not ready after 2 seconds');
                if (window.crm && typeof window.crm.showToast === 'function') {
                  window.crm.showToast('Contact page is loading. Please try again in a moment.', 'error');
                }
              }
            };

            tryShowContact();
          });
        } else {
          console.error('[TaskDetail] CRM navigateToPage function not available');
        }
      } else {
        console.error('[TaskDetail] ContactDetail module not available');
      }
    }; // Use capture phase to catch clicks early

    // Handle contact link clicks in capture phase so no other listener swallows it
    document.addEventListener('click', contactLinkHandler, true);
    document._taskDetailContactHandler = contactLinkHandler;

    const addContactHandler = (e) => {
      const addContactBtn = e.target.closest('#add-contact-btn');
      if (!addContactBtn) return;

      e.preventDefault();
      openAddContactModal();
    };

    document.addEventListener('click', addContactHandler);
    document._taskDetailAddContactHandler = addContactHandler;

    document._taskDetailContactHandlersBound = true;
  }

  // Open add contact modal with prefilled account information
  function openAddContactModal() {
    // Use the main CRM's modal opening function to ensure proper event binding
    if (window.crm && typeof window.crm.createAddContactModal === 'function') {
      // Pre-fill the company name and industry before opening the modal
      const modal = document.getElementById('modal-add-contact');
      if (modal && state.currentTask) {
        // Get account information from the current task
        const accountName = state.currentTask.account || '';
        const accountId = state.currentTask.accountId || '';

        // Find the account data to get industry
        const account = findAccountByIdOrName(accountId, accountName);
        const industry = account?.industry || '';

        // Pre-fill company name
        const companyInput = modal.querySelector('input[name="companyName"]');
        if (companyInput && accountName) {
          companyInput.value = accountName;
        }

        // Pre-fill industry
        const industryInput = modal.querySelector('input[name="industry"]');
        if (industryInput && industry) {
          industryInput.value = industry;
        }

        // Set navigation context so after creating the contact we return here
        try {
          window._contactNavigationSource = 'task-detail';
          window._taskNavigationSource = 'task-detail';
          window.__taskDetailRestoreData = {
            taskId: state.currentTask?.id,
            taskType: state.currentTask?.type,
            contact: state.currentTask?.contact,
            account: state.currentTask?.account,
            scroll: window.scrollY || 0,
            timestamp: Date.now()
          };
        } catch (_) { }
      }

      // Open the modal using the proper function
      window.crm.createAddContactModal();
    } else {
      console.error('CRM createAddContactModal function not available');
    }
  }

  // Setup contact creation listener to refresh contacts list
  function setupContactCreationListener() {
    const hasCreatedHandler = typeof document._taskDetailContactCreatedHandler === 'function';
    const hasUpdatedHandler = typeof document._taskDetailContactUpdatedHandler === 'function';

    if (document._taskDetailContactCreationBound && hasCreatedHandler && hasUpdatedHandler) {
      return;
    }

    if (document._taskDetailContactCreationBound && (!hasCreatedHandler || !hasUpdatedHandler)) {
      console.warn('[TaskDetail] Contact creation guard set but listeners missing. Rebinding.');
    }

    const onContactCreated = async (e) => {
      if (state.currentTask && isAccountTask(state.currentTask)) {
        // Refresh the contacts list for account tasks
        const contactsList = document.getElementById('account-contacts-list');
        if (contactsList) {
          // Get the account data
          const accountName = state.currentTask.account || '';
          const accountId = state.currentTask.accountId || '';
          const account = findAccountByIdOrName(accountId, accountName);

          if (account) {
            contactsList.innerHTML = await renderAccountContacts(account);
          }
        }
      }
    };
    document.addEventListener('pc:contact-created', onContactCreated);
    document._taskDetailContactCreatedHandler = onContactCreated;

    const onContactUpdated = async (e) => {
      const { id, changes } = e.detail || {};
      if (!id || !state.currentTask) return;

      // Check if this contact update is relevant to the current task
      const taskContactId = state.currentTask?.contactId || '';
      const stateContactId = state.contact?.id || '';

      if (id === taskContactId || id === stateContactId) {
        // OPTIMISTIC UPDATE: Apply changes to state immediately
        if (state.contact && changes) {
          state.contact = {
            ...state.contact,
            ...changes
          };
          // Re-render immediately with optimistic data
          await renderTaskPage();

          // Re-process click-to-call to ensure context is updated
          setTimeout(() => {
            processClickToCallAndEmail();
          }, 50);
        }

        try {
          // STILL fetch from Firestore to ensure we have the absolute latest/full data
          if (window.firebaseDB && id) {
            const contactDoc = await window.firebaseDB.collection('contacts').doc(id).get();
            if (contactDoc.exists) {
              const updatedContact = { id: contactDoc.id, ...contactDoc.data() };

              // Only re-render if the fetched data is different from our optimistic state
              // (e.g. server-side timestamps or other fields we didn't have)
              const hasChanges = JSON.stringify(updatedContact) !== JSON.stringify(state.contact);

              state.contact = updatedContact;

              if (hasChanges) {
                await renderTaskPage();
              }

              // Update cache if available
              if (window.CacheManager && typeof window.CacheManager.updateRecord === 'function') {
                await window.CacheManager.updateRecord('contacts', id, updatedContact);
              }

              // Update BackgroundContactsLoader cache if available (best-effort)
              try {
                if (window.BackgroundContactsLoader && typeof window.BackgroundContactsLoader.getContactsData === 'function') {
                  const contacts = window.BackgroundContactsLoader.getContactsData() || [];
                  const contactIndex = contacts.findIndex(c => c && c.id === id);
                  if (contactIndex !== -1) {
                    contacts[contactIndex] = updatedContact;
                  }
                }
              } catch (e) {
              }
            }
          }
        } catch (error) {
          console.warn('[TaskDetail] Failed to reload contact data after update:', error);
        }
      }
    };

    // Listen for contact updates (e.g., when preferred phone field changes on contact-detail page)
    document.addEventListener('pc:contact-updated', onContactUpdated);
    document._taskDetailContactUpdatedHandler = onContactUpdated;

    document._taskDetailContactCreationBound = true;
  }

  // ==== Inline editing functions for Account Information and Energy & Contract ====
  function setupInlineEditing() {
    const infoGrids = document.querySelectorAll('#task-detail-page .info-grid');

    infoGrids.forEach(infoGrid => {
      if (infoGrid && !infoGrid._bound) {
        infoGrid.addEventListener('click', async (e) => {
          const wrap = e.target.closest?.('.info-value-wrap');
          if (!wrap) return;
          const field = wrap.getAttribute('data-field');
          if (!field) return;

          // Edit button: switch to input
          const editBtn = e.target.closest('.info-edit');
          if (editBtn) {
            e.preventDefault();
            beginEditField(wrap, field);
            return;
          }

          // Copy button
          const copyBtn = e.target.closest('.info-copy');
          if (copyBtn) {
            const txt = wrap.querySelector('.info-value-text')?.textContent?.trim() || '';
            try {
              await navigator.clipboard?.writeText(txt);
              if (window.crm?.showToast) window.crm.showToast('Copied');
            } catch (_) { }
            return;
          }

          // Delete button
          const delBtn = e.target.closest('.info-delete');
          if (delBtn) {
            e.preventDefault();
            await saveField(field, '');
            updateFieldText(wrap, '');
            return;
          }
        });
        infoGrid._bound = '1';
      }
    }, true);
  }

  function beginEditField(wrap, field) {
    const textEl = wrap.querySelector('.info-value-text');
    if (!textEl) return;

    const currentText = textEl.textContent || '';
    const isMultiline = false; // No multiline fields in task detail
    const inputControl = field === 'contractEndDate'
      ? `<input type="date" class="info-edit-input" value="${escapeHtml(toISODate(currentText))}">`
      : `<input type="text" class="info-edit-input" value="${escapeHtml(currentText === '--' ? '' : currentText)}">`;

    const inputHtml = `
      ${inputControl}
      <div class="info-actions">
        <button class="icon-btn-sm info-save" title="Save">
          ${saveIcon()}
        </button>
        <button class="icon-btn-sm info-cancel" title="Cancel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>`;

    wrap.classList.add('editing');
    textEl.style.display = 'none';

    const actionsEl = wrap.querySelector('.info-actions');
    if (actionsEl) {
      actionsEl.remove();
    }

    const inputWrap = document.createElement('div');
    inputWrap.className = 'info-input-wrap';
    inputWrap.innerHTML = inputHtml;

    const input = inputWrap.querySelector('input');
    const saveBtn = inputWrap.querySelector('.info-save');
    const cancelBtn = inputWrap.querySelector('.info-cancel');

    if (input && saveBtn && cancelBtn) {
      wrap.appendChild(inputWrap);
      input.focus();

      // Live comma formatting for annual usage
      if (field === 'annualUsage') {
        const seed = (currentText === '--' ? '' : currentText).replace(/,/g, '');
        input.value = seed;
        input.addEventListener('input', (e) => {
          const el = e.target;
          const raw = String(el.value || '').replace(/[^0-9]/g, '');
          const beforeLen = String(el.value || '').length;
          const caret = el.selectionStart || 0;
          const formatted = raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          el.value = formatted;
          const afterLen = formatted.length;
          const delta = afterLen - beforeLen;
          const nextCaret = Math.max(0, Math.min(afterLen, caret + delta));
          try { el.setSelectionRange(nextCaret, nextCaret); } catch (_) { }
        });
      }

      // Add supplier suggestions for electricity supplier field
      if (field === 'electricitySupplier' && window.addSupplierSuggestions) {
        window.addSupplierSuggestions(input, 'task-supplier-list');
      }

      // Live MM/DD/YYYY formatting for contract end date (when using text input)
      if (field === 'contractEndDate' && input.type === 'text') {
        input.addEventListener('input', () => {
          const caret = input.selectionStart;
          const formatted = formatDateInputAsMDY(input.value);
          input.value = formatted;
          try {
            input.selectionStart = input.selectionEnd = Math.min(formatted.length, (caret || formatted.length));
          } catch (_) { }
        });
      }

      // Save handler
      saveBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await commitEdit(wrap, field, input.value);
      });

      // Cancel handler
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        cancelEdit(wrap, field, currentText);
      });

      // Enter/Escape key handler
      input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await commitEdit(wrap, field, input.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelEdit(wrap, field, currentText);
        }
      });
    }
  }

  async function commitEdit(wrap, field, value) {
    const entity = wrap.dataset.entity || 'account';
    const entityId = wrap.dataset.entityId || null;
    let toSave = value;

    // Convert contractEndDate to MM/DD/YYYY for storage
    if (field === 'contractEndDate') {
      toSave = toMDY(value);
    }

    // Normalize phone numbers
    if (field === 'companyPhone' || field === 'phone') {
      toSave = normalizePhone(value);
    }

    // If website updated, also compute and persist domain
    if (field === 'website') {
      try {
        const src = String(value || '').trim();
        let nextDomain = '';
        if (src) {
          try {
            const u = new URL(/^https?:\/\//i.test(src) ? src : `https://${src}`);
            nextDomain = (u.hostname || '').replace(/^www\./i, '');
          } catch (_) {
            nextDomain = src.replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./i, '');
          }
        }
        if (nextDomain) {
          await saveField('domain', nextDomain, entity, entityId);
        }
      } catch (_) { /* noop */ }
    }

    await saveField(field, toSave, entity, entityId);
    updateFieldText(wrap, toSave);

    // If phone field was updated, refresh click-to-call bindings
    if (field === 'companyPhone' || field === 'phone') {
      try {
        setTimeout(() => {
          if (window.ClickToCall && typeof window.ClickToCall.processSpecificPhoneElements === 'function') {
            window.ClickToCall.processSpecificPhoneElements();
          }
        }, 100);
      } catch (_) { /* noop */ }
    }

    cancelEdit(wrap, field, toSave);
  }

  function cancelEdit(wrap, field, originalValue) {
    const inputWrap = wrap.querySelector('.info-input-wrap');
    if (inputWrap) {
      inputWrap.remove();
    }

    const textEl = wrap.querySelector('.info-value-text');
    if (textEl) {
      textEl.style.display = '';
    }

    wrap.classList.remove('editing');

    // Restore default actions
    const actionsEl = wrap.querySelector('.info-actions');
    if (!actionsEl) {
      const actions = document.createElement('div');
      actions.className = 'info-actions';
      actions.innerHTML = `
        <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
        <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
        <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
      `;
      wrap.appendChild(actions);
    }
  }

  async function saveField(field, value, entity = 'account', entityId = null) {
    // Determine entity ID from parameter or state
    let id = entityId;
    if (!id) {
      if (entity === 'account') {
        id = state.account?.id;
      } else if (entity === 'contact') {
        id = state.contact?.id;
      }
    }

    if (!id) {
      console.warn('[TaskDetail] Cannot save field: no entity ID for', entity);
      return;
    }

    // Store entity type and ID with the batch update
    if (!updateBatch[entity]) {
      updateBatch[entity] = {};
    }
    if (!updateBatch[entity][id]) {
      updateBatch[entity][id] = {};
    }
    updateBatch[entity][id][field] = value;

    // Update local state immediately for instant UI feedback
    if (entity === 'account' && state.account && state.account.id === id) {
      state.account[field] = value;
    } else if (entity === 'contact' && state.contact && state.contact.id === id) {
      state.contact[field] = value;
    }

    // Clear existing timeout
    if (updateTimeout) clearTimeout(updateTimeout);

    // Set new timeout for batch update (2 seconds after last edit)
    updateTimeout = setTimeout(async () => {
      await processBatchUpdate();
    }, 2000);

    // Show immediate feedback
    if (window.crm?.showToast) window.crm.showToast('Saving...');
  }

  function updateFieldText(wrap, value) {
    const textEl = wrap.querySelector('.info-value-text');
    const field = wrap.getAttribute('data-field');
    if (!textEl) return;

    const val = value == null ? '' : String(value);

    if (field === 'website' && val) {
      const url = /^https?:\/\//i.test(val) ? val : 'https://' + val;
      textEl.innerHTML = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="website-link">${escapeHtml(val)}</a>`;
      textEl.classList.remove('empty');
    } else if (field === 'contractEndDate') {
      const pretty = toMDY(val);
      textEl.textContent = pretty || '--';
      if (!pretty) textEl.classList.add('empty');
      else textEl.classList.remove('empty');
    } else if (field === 'annualUsage' && val) {
      const numeric = String(val).replace(/[^0-9]/g, '');
      textEl.textContent = numeric ? numeric.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '--';
      if (!numeric) textEl.classList.add('empty');
      else textEl.classList.remove('empty');
    } else if (field === 'companyPhone' || field === 'phone') {
      const display = normalizePhone(val);
      textEl.textContent = display || '--';
      if (!display) {
        textEl.classList.add('empty');
      } else {
        textEl.classList.remove('empty');
        // Re-bind click-to-call
        try {
          const phoneSpan = textEl.querySelector('.phone-text');
          if (phoneSpan && window.ClickToCall) {
            // Update phone data attributes
            phoneSpan.setAttribute('data-phone', display);
            setTimeout(() => {
              if (window.ClickToCall.processSpecificPhoneElements) {
                window.ClickToCall.processSpecificPhoneElements();
              }
            }, 50);
          }
        } catch (_) { }
      }
    } else if (field === 'email' && val) {
      // For email fields, preserve the email-text span structure
      const emailSpan = textEl.querySelector('.email-text');
      if (emailSpan) {
        emailSpan.textContent = val;
        emailSpan.setAttribute('data-email', val);
      } else {
        textEl.innerHTML = `<span class="email-text" data-email="${escapeHtml(val)}">${escapeHtml(val)}</span>`;
      }
      textEl.classList.remove('empty');
    } else {
      textEl.textContent = val || '--';
      if (!val) textEl.classList.add('empty');
      else textEl.classList.remove('empty');
    }
  }

  // CRITICAL FIX: Listen for account updates to refresh account data when updated on account-detail page
  if (!document._taskDetailAccountUpdateBound) {
    const onAccountUpdated = async (e) => {
      const { id, changes } = e.detail || {};
      if (!id || !state.currentTask) return;

      // Check if this account update is relevant to the current task
      // Account can be linked via: task.accountId, contact.accountId, or state.account.id
      const taskAccountId = state.currentTask?.accountId || '';
      const contactAccountId = state.contact && (state.contact.accountId || state.contact.account_id || '');
      const stateAccountId = state.account?.id || '';

      // Only refresh if the updated account matches the task's account (any source)
      if (id === taskAccountId || id === contactAccountId || id === stateAccountId) {
        try {
          // Reload account data from Firestore to get latest changes
          if (window.firebaseDB && id) {
            const accountDoc = await window.firebaseDB.collection('accounts').doc(id).get();
            if (accountDoc.exists) {
              const updatedAccount = { id: accountDoc.id, ...accountDoc.data() };
              state.account = updatedAccount;
              // console.log('[TaskDetail] ✓ Reloaded account data:', updatedAccount.accountName || updatedAccount.name);

              // Re-render the task page to show updated account information
              await renderTaskPage();

              // Update cache if available
              if (window.CacheManager && typeof window.CacheManager.updateRecord === 'function') {
                await window.CacheManager.updateRecord('accounts', id, updatedAccount);
              }

              // Update BackgroundAccountsLoader cache if available (best-effort)
              try {
                if (window.BackgroundAccountsLoader && typeof window.BackgroundAccountsLoader.getAccountsData === 'function') {
                  const accounts = window.BackgroundAccountsLoader.getAccountsData() || [];
                  const accountIndex = accounts.findIndex(a => a && a.id === id);
                  if (accountIndex !== -1) {
                    accounts[accountIndex] = updatedAccount;
                  }
                }
              } catch (e) {
                console.warn('[TaskDetail] Could not update BackgroundAccountsLoader cache:', e);
              }
            }
          }
        } catch (error) {
          console.warn('[TaskDetail] Failed to reload account data after update:', error);
        }
      }
    };

    document.addEventListener('pc:account-updated', onAccountUpdated);
    document._taskDetailAccountUpdateHandler = onAccountUpdated;
    document._taskDetailAccountUpdateBound = true;

    // CRITICAL FIX: Also listen for energy-specific updates (contract end date, supplier, etc.)
    const onEnergyUpdated = async (e) => {
      const { entity, id, field, value } = e.detail || {};
      if (entity !== 'account' || !id || !state.currentTask) return;

      // Check if this energy update is relevant to the current task
      // Account can be linked via: task.accountId, contact.accountId, or state.account.id
      const taskAccountId = state.currentTask?.accountId || '';
      const contactAccountId = state.contact && (state.contact.accountId || state.contact.account_id || '');
      const stateAccountId = state.account?.id || '';

      // Only refresh if the updated account matches the task's account (any source)
      if (id === taskAccountId || id === contactAccountId || id === stateAccountId) {
        try {
          // Reload account data from Firestore to get latest energy fields
          if (window.firebaseDB && id) {
            const accountDoc = await window.firebaseDB.collection('accounts').doc(id).get();
            if (accountDoc.exists) {
              const updatedAccount = { id: accountDoc.id, ...accountDoc.data() };
              state.account = updatedAccount;

              // Re-render the task page to show updated energy information
              await renderTaskPage();

              // Update cache if available
              if (window.CacheManager && typeof window.CacheManager.updateRecord === 'function') {
                await window.CacheManager.updateRecord('accounts', id, updatedAccount);
              }
            }
          }
        } catch (error) {
          console.warn('[TaskDetail] Failed to reload account data after energy update:', error);
        }
      }
    };

    document.addEventListener('pc:energy-updated', onEnergyUpdated);
    document._taskDetailEnergyUpdateHandler = onEnergyUpdated;
  }

  // Public API
  window.TaskDetail = {
    state: state, // Expose state so widgets can access account/contact data
    open: async function (taskId, navigationSource = 'tasks') {
      if (!taskId) return;
      state._openTaskId = taskId;
      state._openTaskAt = Date.now();
      try {
        // CRITICAL: Capture navigation source BEFORE calling navigateToPage
        // Standardize navigation source detection to match account detail pattern
        const crmPage = (window.crm && window.crm.currentPage) ? String(window.crm.currentPage) : '';
        const active = document.querySelector('.page.active');
        const domPage = active ? (active.getAttribute('data-page') || active.id || '').replace('-page', '') : '';
        let src = navigationSource || crmPage || domPage || 'tasks';

        // Normalize aliases
        const alias = {
          'account-detail': 'account-details',
          'account-details': 'account-details',
          'contact-detail': 'people',
          'contact-details': 'people'
        };
        if (alias[src]) src = alias[src];

        // Use single, reliable navigation source pattern like account detail
        window._taskNavigationSource = src;

        // Capture comprehensive per-page restore data
        if (src === 'accounts' && window.accountsModule && typeof window.accountsModule.getCurrentState === 'function') {
          // Add small delay to ensure DOM elements are ready
          setTimeout(() => {
            window.__accountsRestoreData = window.accountsModule.getCurrentState();
          }, 50);
        } else if (src === 'people' && window.peopleModule && typeof window.peopleModule.getCurrentState === 'function') {
          window.__peopleRestoreData = window.peopleModule.getCurrentState();
        } else if (src === 'tasks') {
          // Enhanced restore data for Tasks page
          window.__tasksRestoreData = {
            scroll: window.scrollY || 0,
            timestamp: Date.now()
          };
          window.__tasksScrollY = window.scrollY || 0;
        } else if (src === 'dashboard') {
          // Dashboard state should already be captured in main.js
          // Just ensure we have a fallback
          if (!window._dashboardReturn) {
            window._dashboardReturn = {
              page: 'dashboard',
              scroll: window.scrollY || 0,
              timestamp: Date.now()
            };
          }
        }

      } catch (_) { /* noop */ }

      // [Transition Fix] Prepare UI BEFORE navigation to prevent flash of old content
      // This ensures that when the page becomes visible, it's already in the loading state.
      if (initDomRefs()) {
        markTaskLoading();
      }

      // Navigate to task detail page AFTER capturing navigation source
      if (window.crm && typeof window.crm.navigateToPage === 'function') {
        window.crm.navigateToPage('task-detail');
      }

      // Load task data
      await loadTaskData(taskId);
    },

    init: function () {
      if (!initDomRefs()) return;
      // CRITICAL FIX: Inject styles immediately on init to prevent unstyled header on cold start
      injectTaskDetailStyles();
      attachEvents();
      setupContactLinkHandlers();
      setupPhoneClickHandlers();
      setupContactCreationListener();
      try { setupTaskRecentCallsHooks(); } catch (_) { }
    }
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.TaskDetail.init);
  } else {
    window.TaskDetail.init();
  }


  // Process click-to-call and click-to-email when task detail page loads
  document.addEventListener('pc:page-loaded', function (e) {
    if (e.detail && e.detail.page === 'task-detail') {
      setTimeout(() => {
        processClickToCallAndEmail();
      }, 100);
    }
  });

  // Listen for task detail restore event
  document.addEventListener('pc:task-detail-restore', async (e) => {
    const restoreData = e.detail || {};

    if (restoreData.taskId) {
      try {
        if (state._openTaskId && String(state._openTaskId) === String(restoreData.taskId) && (Date.now() - (state._openTaskAt || 0) < 2000)) {
          return;
        }
      } catch (_) { }

      try {
        const page = els.page || document.getElementById('task-detail-page');
        if (page && page.classList.contains('task-loaded') && state.currentTask && String(state.currentTask.id) === String(restoreData.taskId)) {
          return;
        }
      } catch (_) { }

      // Don't call TaskDetail.open() - just reload the task data directly
      // This preserves the navigation source that was already set
      await loadTaskData(restoreData.taskId);

      // Restore scroll position if available
      if (restoreData.scroll !== undefined && restoreData.scroll !== null) {
        setTimeout(() => {
          window.scrollTo(0, restoreData.scroll);
        }, 50);
      }
    }
  });

  // CRITICAL FIX: Listen for navigation back from account-detail to refresh account data
  // This ensures account updates (contract end date, supplier, etc.) are visible immediately
  if (!document._taskDetailAccountDetailsRestoreBound) {
    const onAccountDetailsRestore = async (e) => {
      // Only refresh if we're currently viewing a task with an account
      if (state.currentTask && state.account?.id) {
        const accountId = state.account.id;
        try {
          // Force reload account data from Firestore (bypass cache to get latest changes)
          if (window.firebaseDB && accountId) {
            const accountDoc = await window.firebaseDB.collection('accounts').doc(accountId).get();
            if (accountDoc.exists) {
              const updatedAccount = { id: accountDoc.id, ...accountDoc.data() };
              state.account = updatedAccount;
              // console.log('[TaskDetail] ✓ Reloaded account data after returning from account-detail');

              // Re-render the task page to show updated account information
              await renderTaskPage();

              // Update cache with fresh data
              if (window.CacheManager && typeof window.CacheManager.updateRecord === 'function') {
                await window.CacheManager.updateRecord('accounts', accountId, updatedAccount);
              }
            }
          }
        } catch (error) {
          console.warn('[TaskDetail] Failed to refresh account data after returning from account-detail:', error);
        }
      }
    };

    document.addEventListener('pc:account-details-restore', onAccountDetailsRestore);
    document._taskDetailAccountDetailsRestoreHandler = onAccountDetailsRestore;
    document._taskDetailAccountDetailsRestoreBound = true;
  }

  function setupHeaderActions() {
    if (document._taskHeaderActionsBound) return;

    document.addEventListener('click', (e) => {
      // Only handle clicks inside task detail page header
      if (!e.target.closest('#task-detail-header') && !e.target.closest('#task-detail-title')) return;

      const btn = e.target.closest('button');
      if (!btn) return;

      const action = btn.dataset.action;
      if (!action) return;

      if (action === 'edit-account') {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.id;
        if (id && window.AccountDetail && window.AccountDetail.openEditModal) {
          // Pass the current account state to the modal
          const accountData = state.account || (state.currentTask && state.currentTask.account ? { id: state.currentTask.accountId, name: state.currentTask.account } : null);
          window.AccountDetail.openEditModal(accountData);
        } else {
          console.warn('[TaskDetail] AccountDetail.openEditModal not available');
        }
      } else if (action === 'edit-contact') {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.id;
        if (id && window.ContactDetail && window.ContactDetail.openEditModal) {
          // Pass the current contact state to the modal
          const contactData = state.contact || (state.currentTask && state.currentTask.contact ? { id: state.currentTask.contactId, name: state.currentTask.contact } : null);
          window.ContactDetail.openEditModal(contactData);
        } else {
          console.warn('[TaskDetail] ContactDetail.openEditModal not available');
        }
      } else if (action === 'copy-name') {
        e.preventDefault();
        e.stopPropagation();
        const text = btn.dataset.text;
        if (text) {
          navigator.clipboard.writeText(text).then(() => {
            if (window.crm && window.crm.showToast) window.crm.showToast('Name copied to clipboard');
          }).catch(err => console.error('Failed to copy:', err));
        }
      } else if (action === 'delete-account' || action === 'delete-contact') {
        e.preventDefault();
        e.stopPropagation();
        if (window.crm && window.crm.showToast) {
          window.crm.showToast('Delete functionality is not yet fully implemented for this context.', 'info');
        }
      }
    }, true);

    document._taskHeaderActionsBound = true;
  }

})();
