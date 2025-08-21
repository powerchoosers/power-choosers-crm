// Power Choosers CRM - Main JavaScript Functionality
// Strategic navigation and interactive features

class PowerChoosersCRM {
    constructor() {
        this.currentPage = 'dashboard';
        this.sidebar = document.getElementById('sidebar');
        this.init();
    }

  createAddAccountModal() {
    const modal = document.getElementById('modal-add-account');
    if (!modal) {
      this.showToast('Add Account modal not found');
      return;
    }

    const dialog = modal.querySelector('.pc-modal__dialog');
    const backdrop = modal.querySelector('.pc-modal__backdrop');
    const form = modal.querySelector('#form-add-account');

    // Open modal
    modal.removeAttribute('hidden');

    // Focus management: move focus to Close button if present, else first input
    setTimeout(() => {
      const closeBtn = modal.querySelector('.pc-modal__close');
      const firstInput = modal.querySelector('input,button,select,textarea,[tabindex]:not([tabindex="-1"])');
      if (closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus();
      else if (firstInput && typeof firstInput.focus === 'function') firstInput.focus();
    }, 0);

    // Focus trap within dialog
    const getFocusables = () => Array.from(dialog.querySelectorAll('a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Tab') {
        const f = getFocusables();
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    const close = () => {
      // Hide modal and cleanup listeners bound for this open session
      modal.setAttribute('hidden', '');
      dialog.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keydown', handleKeyDown);
    };

    // One-time static bindings (click handlers, focus ring, submit)
    if (!modal._bound) {
      // Click-away and close buttons
      if (backdrop) backdrop.addEventListener('click', close);
      modal.querySelectorAll('[data-close="account"]').forEach(btn => btn.addEventListener('click', close));

      // Subtle orange focus ring on inputs
      modal.querySelectorAll('input').forEach(input => {
        input.addEventListener('focus', () => input.classList.add('focus-orange'));
        input.addEventListener('blur', () => input.classList.remove('focus-orange'));
      });

      // Submit handler -> Firestore save
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const data = {};
          form.querySelectorAll('input').forEach(inp => { data[inp.name] = (inp.value || '').trim(); });

          // Sanitize if available
          if (window.escapeHtml) {
            Object.keys(data).forEach(k => { data[k] = window.escapeHtml(data[k]); });
          }

          // Derive domain from website if present
          if (data.website) {
            try {
              const u = new URL(data.website.startsWith('http') ? data.website : `https://${data.website}`);
              data.domain = u.hostname.replace(/^www\./i, '');
            } catch (_) {
              // Fallback simple parse: strip protocol/path
              data.domain = data.website.replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./i, '');
            }
          }

          // Remove empty fields
          Object.keys(data).forEach(k => { if (!data[k]) delete data[k]; });

          try {
            const db = window.firebaseDB;
            const fv = window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue;
            if (!db) throw new Error('Firestore not initialized');
            const now = fv && typeof fv.serverTimestamp === 'function' ? fv.serverTimestamp() : Date.now();
            const doc = {
              // Known account fields (flexible)
              accountName: data.accountName || data.name || 'New Account',
              industry: data.industry || '',
              domain: data.domain || '',
              website: data.website || '',
              phone: data.phone || '',
              city: data.city || '',
              state: data.state || '',
              // Timestamps
              createdAt: now,
              updatedAt: now,
            };

            const ref = await db.collection('accounts').add(doc);

            // Notify Accounts page to update its state without reload
            try {
              document.dispatchEvent(new CustomEvent('pc:account-created', { detail: { id: ref.id, doc } }));
            } catch (_) { /* noop */ }

            if (window.crm && typeof window.crm.showToast === 'function') window.crm.showToast('Account added!');
            // Reset form fields for next time
            try { form.reset(); } catch (_) { /* noop */ }
            close();
          } catch (err) {
            if (window.crm && typeof window.crm.showToast === 'function') window.crm.showToast('Failed to add account');
            console.error('Add account failed', err);
          }
        });
      }

      modal._bound = true;
    }

    // Bind per-open listeners
    dialog.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keydown', handleKeyDown);
  }

  createAddContactModal() {
    const modal = document.getElementById('modal-add-contact');
    if (!modal) {
      this.showToast('Add Contact modal not found');
      return;
    }

    const dialog = modal.querySelector('.pc-modal__dialog');
    const backdrop = modal.querySelector('.pc-modal__backdrop');
    const form = modal.querySelector('#form-add-contact');

    // Open modal
    modal.removeAttribute('hidden');

    // Focus management: move focus to Close button if present, else first input
    setTimeout(() => {
      const closeBtn = modal.querySelector('.pc-modal__close');
      const firstInput = modal.querySelector('input,button,select,textarea,[tabindex]:not([tabindex="-1"])');
      if (closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus();
      else if (firstInput && typeof firstInput.focus === 'function') firstInput.focus();
    }, 0);

    // Focus trap within dialog
    const getFocusables = () => Array.from(dialog.querySelectorAll('a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Tab') {
        const f = getFocusables();
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    const close = () => {
      // Hide modal and cleanup listeners bound for this open session
      modal.setAttribute('hidden', '');
      dialog.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keydown', handleKeyDown);
    };

    // One-time static bindings (click handlers, focus ring, submit)
    if (!modal._bound) {
      // Click-away and close buttons
      if (backdrop) backdrop.addEventListener('click', close);
      modal.querySelectorAll('[data-close="contact"]').forEach(btn => btn.addEventListener('click', close));

      // Subtle orange focus ring on inputs
      modal.querySelectorAll('input').forEach(input => {
        input.addEventListener('focus', () => input.classList.add('focus-orange'));
        input.addEventListener('blur', () => input.classList.remove('focus-orange'));
      });

      // Submit handler -> Firestore save
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const data = {};
          form.querySelectorAll('input').forEach(inp => { data[inp.name] = (inp.value || '').trim(); });

          // Sanitize if available
          if (window.escapeHtml) {
            Object.keys(data).forEach(k => { data[k] = window.escapeHtml(data[k]); });
          }

          // Remove empty fields
          Object.keys(data).forEach(k => { if (!data[k]) delete data[k]; });

          try {
            const db = window.firebaseDB;
            const fv = window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue;
            if (!db) throw new Error('Firestore not initialized');
            const now = fv && typeof fv.serverTimestamp === 'function' ? fv.serverTimestamp() : Date.now();
            const doc = {
              // Known contact fields
              firstName: data.firstName || '',
              lastName: data.lastName || '',
              title: data.title || '',
              companyName: data.companyName || '',
              email: data.email || '',
              phone: data.phone || '',
              // Timestamps
              createdAt: now,
              updatedAt: now,
            };

            const ref = await db.collection('contacts').add(doc);

            // Broadcast for optional listeners (e.g., People page refresh)
            try {
              document.dispatchEvent(new CustomEvent('pc:contact-created', { detail: { id: ref.id, doc } }));
            } catch (_) { /* noop */ }

            if (window.crm && typeof window.crm.showToast === 'function') window.crm.showToast('Contact added!');
            try { form.reset(); } catch (_) { /* noop */ }
            close();
          } catch (err) {
            if (window.crm && typeof window.crm.showToast === 'function') window.crm.showToast('Failed to add contact');
            console.error('Add contact failed', err);
          }
        });
      }

      modal._bound = true;
    }

    // Bind per-open listeners
    dialog.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keydown', handleKeyDown);
  }

    init() {
        this.setupNavigation();
        this.setupSidebarHover();
        this.setupSearchFunctionality();
        this.setupWidgetInteractions();
        this.installCustomTooltips();
        this.loadInitialData();
    }

    // Navigation System
    setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        const pages = document.querySelectorAll('.page');

        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const targetPage = item.getAttribute('data-page');
                this.navigateToPage(targetPage);
            });
        });
    }

    navigateToPage(pageName) {
        // Hide all pages
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        
        // Remove active class from all nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Show target page
        const targetPage = document.getElementById(`${pageName}-page`);
        if (targetPage) {
            targetPage.classList.add('active');
        }
        
        // Activate corresponding nav item
        const targetNav = document.querySelector(`[data-page="${pageName}"]`);
        if (targetNav) {
            targetNav.classList.add('active');
        }
        
        // Special handling for specific pages
        if (pageName === 'people' && window.peopleModule) {
            setTimeout(() => {
                if (typeof window.peopleModule.rebindDynamic === 'function') {
                    window.peopleModule.rebindDynamic();
                }
            }, 50);
        }
        
        if (pageName === 'accounts' && window.accountsModule) {
            setTimeout(() => {
                if (typeof window.accountsModule.init === 'function') {
                    window.accountsModule.init();
                }
            }, 50);
        }
        
        if (pageName === 'calls' && window.callsModule) {
            setTimeout(() => {
                if (typeof window.callsModule.startAutoRefresh === 'function') {
                    window.callsModule.startAutoRefresh();
                }
            }, 50);
        } else if (window.callsModule && typeof window.callsModule.stopAutoRefresh === 'function') {
            window.callsModule.stopAutoRefresh();
        }
        
        this.currentPage = pageName;
        this.updateWidgetPanel(pageName);
    }

    // Sidebar Hover Effects
    setupSidebarHover() {
        const sidebar = document.getElementById('sidebar');
        let hoverTimeout;

        sidebar.addEventListener('mouseenter', () => {
            clearTimeout(hoverTimeout);
            sidebar.classList.add('expanded');
        });

        sidebar.addEventListener('mouseleave', () => {
            hoverTimeout = setTimeout(() => {
                sidebar.classList.remove('expanded');
            }, 150);
        });
    }

    // Search Functionality
    setupSearchFunctionality() {
        const searchInput = document.querySelector('.search-input');
        const searchBtn = document.querySelector('.search-btn');

        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.performSearch(searchInput.value);
            }
        });

        searchBtn.addEventListener('click', () => {
            this.performSearch(searchInput.value);
        });

        // Small search inputs in pages
        const smallSearchInputs = document.querySelectorAll('.search-input-small');
        smallSearchInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                this.filterPageContent(e.target.value);
            });
        });
    }

    performSearch(query) {
        if (!query.trim()) return;
        
        console.log(`Searching for: ${query}`);
        // TODO: Implement actual search functionality
        this.showToast(`Searching for "${query}"...`);
    }

    filterPageContent(query) {
        // Filter current page content based on search
        const currentPageElement = document.querySelector('.page.active');
        const tableRows = currentPageElement.querySelectorAll('tbody tr');
        
        tableRows.forEach(row => {
            const text = row.textContent.toLowerCase();
            const matches = text.includes(query.toLowerCase());
            row.style.display = matches ? '' : 'none';
        });
    }

    // Utility Functions
    showModal(modalType) {
        if (modalType === 'add-account') {
            this.createAddAccountModal();
            return;
        }
        if (modalType === 'add-contact') {
            this.createAddContactModal();
            return;
        }
        // Fallback for other modal types not yet wired here
        this.showToast(`Opening ${modalType} modal...`);
    }

    showToast(message) {
        // Simple toast notification
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 90px;
            right: 25px;
            background: var(--grey-800);
            color: var(--text-inverse);
            padding: 12px 20px;
            border-radius: var(--border-radius);
            box-shadow: var(--shadow-lg);
            z-index: 10000;
            font-size: 0.875rem;
            opacity: 0;
            transform: translateY(-10px);
            transition: all 0.3s ease;
        `;
        
        document.body.appendChild(toast);
        
        // Animate in
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        }, 100);
        
        // Remove after 3 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 3000);
    }

    // Global dark tooltip replacing native browser title tooltips
    installCustomTooltips() {
        // Reuse one tooltip node for performance
        let tooltipEl = null;
        let anchorEl = null;
        let hideTimer = null;
        // Track input modality to avoid showing tooltips on mouse-initiated focus/clicks
        let lastFocusByKeyboard = false;

        const createTooltip = () => {
            if (tooltipEl) return tooltipEl;
            tooltipEl = document.createElement('div');
            tooltipEl.className = 'pc-tooltip';
            tooltipEl.setAttribute('role', 'tooltip');
            tooltipEl.id = 'pc-tooltip';
            tooltipEl.style.position = 'fixed';
            tooltipEl.style.opacity = '0';
            tooltipEl.style.pointerEvents = 'none';
            document.body.appendChild(tooltipEl);
            return tooltipEl;
        };

        const getTitle = (el) => {
            // Move native title into data-pc-title to prevent white browser tooltip
            if (el && el.hasAttribute('title')) {
                const t = el.getAttribute('title');
                el.setAttribute('data-pc-title', t || '');
                el.removeAttribute('title');
                return t;
            }
            return el ? el.getAttribute('data-pc-title') : '';
        };

        const positionTooltip = (el) => {
            if (!tooltipEl || !el) return;
            const rect = el.getBoundingClientRect();
            const gap = 8;
            const ttRect = tooltipEl.getBoundingClientRect();
            let left = Math.round(rect.left + (rect.width / 2) - (ttRect.width / 2));
            let top = Math.round(rect.top - ttRect.height - gap);
            // Keep in viewport
            left = Math.max(8, Math.min(left, window.innerWidth - ttRect.width - 8));
            if (top < 4) {
                // Flip below if no space above
                top = Math.round(rect.bottom + gap);
                tooltipEl.dataset.placement = 'bottom';
            } else {
                tooltipEl.dataset.placement = 'top';
            }
            tooltipEl.style.left = `${left}px`;
            tooltipEl.style.top = `${top}px`;
        };

        const showTooltip = (el) => {
            const text = getTitle(el);
            if (!text) return;
            anchorEl = el;
            createTooltip();
            tooltipEl.textContent = text;
            tooltipEl.style.opacity = '0';
            tooltipEl.style.transform = 'translateY(0)';
            tooltipEl.style.visibility = 'hidden';
            tooltipEl.classList.add('visible');
            // First paint to measure, then position and fade in
            requestAnimationFrame(() => {
                positionTooltip(el);
                tooltipEl.style.visibility = 'visible';
                tooltipEl.style.opacity = '1';
            });
            // Link for a11y
            try { el.setAttribute('aria-describedby', 'pc-tooltip'); } catch (_) {}
        };

        const hideTooltip = () => {
            if (!tooltipEl) return;
            tooltipEl.classList.remove('visible');
            tooltipEl.style.opacity = '0';
            tooltipEl.style.visibility = 'hidden';
            if (anchorEl) {
                try { anchorEl.removeAttribute('aria-describedby'); } catch (_) {}
            }
            anchorEl = null;
        };

        const handleEnter = (e) => {
            // Do not show tooltips while a popover/dialog like the Add-to-List panel is open
            if (document.getElementById('contact-lists-panel')) return;
            // Only show on mouse hover, or keyboard-initiated focus. Ignore mouse/touch focus.
            const isFocus = e.type === 'focusin';
            if (isFocus && !lastFocusByKeyboard) return;
            const t = e && e.target ? (e.target.nodeType === 1 ? e.target : e.target.parentElement) : null;
            const el = t && (t.closest('[title]') || t.closest('[data-pc-title]'));
            if (!el) return;
            clearTimeout(hideTimer);
            showTooltip(el);
        };

        const handleLeave = (e) => {
            const t = e && e.target ? (e.target.nodeType === 1 ? e.target : e.target.parentElement) : null;
            const el = t && t.closest('[data-pc-title]');
            if (!el) return;
            hideTimer = setTimeout(hideTooltip, 60);
        };

        // Input-modality tracking and suppression on clicks
        const onKeyForModality = (e) => {
            // Consider Tab/Arrow navigation as keyboard-driven focus
            const k = e.key || '';
            if (k === 'Tab' || k.startsWith('Arrow')) {
                lastFocusByKeyboard = true;
            }
        };
        const onPointerStart = () => {
            lastFocusByKeyboard = false;
            // Hide any visible tooltip immediately on mouse/touch down
            hideTooltip();
        };

        document.addEventListener('keydown', onKeyForModality, true);
        document.addEventListener('mousedown', onPointerStart, true);
        document.addEventListener('touchstart', onPointerStart, { passive: true, capture: true });

        // Use delegation so dynamically-added nodes are handled automatically
        document.addEventListener('mouseenter', handleEnter, true);
        document.addEventListener('focusin', handleEnter, true);
        document.addEventListener('mouseleave', handleLeave, true);
        document.addEventListener('focusout', handleLeave, true);
    }

    // Widget Panel Management
    updateWidgetPanel(pageName) {
        const widgetPanel = document.getElementById('widget-panel');
        
        // Show/hide widget panel based on page
        if (pageName === 'settings') {
            widgetPanel.style.display = 'none';
            document.querySelector('.main-content').style.flex = '1';
        } else {
            widgetPanel.style.display = 'block';
            document.querySelector('.main-content').style.flex = '3';
        }
    }

    // Widget Interactions
    setupWidgetInteractions() {
        // Quick Actions
        const quickActionBtns = document.querySelectorAll('.action-btn');
        quickActionBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.textContent.trim();
                this.handleQuickAction(action);
            });
        });

        // Filter tabs (Tasks page only)
        const tasksPage = document.getElementById('tasks-page');
        const filterTabs = tasksPage ? tasksPage.querySelectorAll('.filter-tab') : [];
        filterTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                // Only handle clicks originating inside #tasks-page
                if (!tasksPage || !tasksPage.contains(tab)) return;
                // Remove active from all tabs within tasks page
                filterTabs.forEach(t => t.classList.remove('active'));
                // Add active to clicked tab
                tab.classList.add('active');
                const filter = tab.textContent.trim().split(' ')[0].toLowerCase();
                this.filterTasks(filter);
            });
        });

        // Action buttons in tables
        document.addEventListener('click', (e) => {
            // Don't interfere with bulk selection popover
            if (e.target.closest && e.target.closest('#people-bulk-popover')) {
                return;
            }
            
            if (e.target.classList.contains('btn-success')) {
                this.completeTask(e.target);
            }
            if (e.target.classList.contains('btn-text') && e.target.textContent === 'Edit') {
                this.editTask(e.target);
            }
        });

        // Top bar: Phone button toggle for Phone widget
        const phoneBtn = document.querySelector('.call-btn');
        if (phoneBtn) {
            phoneBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const W = window.Widgets || {};
                try {
                    if (typeof W.isPhoneOpen === 'function' && W.isPhoneOpen()) {
                        if (typeof W.closePhone === 'function') W.closePhone();
                    } else {
                        if (typeof W.openPhone === 'function') W.openPhone();
                    }
                } catch (_) { /* noop */ }
            });
        }
    }

    handleQuickAction(action) {
        switch(action) {
            case 'Add Contact':
                this.showModal('add-contact');
                break;
            case 'Add Account':
                this.showModal('add-account');
                break;
            case 'Bulk Import CSV':
                this.showModal('bulk-import');
                break;
            default:
                this.showToast(`${action} clicked`);
        }
    }

    filterTasks(filter) {
        const tableRows = document.querySelectorAll('#tasks-page tbody tr');
        
        tableRows.forEach(row => {
            if (filter === 'all') {
                row.style.display = '';
            } else {
                const statusBadge = row.querySelector('.status-badge');
                const status = statusBadge ? statusBadge.textContent.trim() : '';
                
                const shouldShow = (
                    (filter === 'pending' && status === 'pending') ||
                    (filter === 'completed' && status === 'completed')
                );
                
                row.style.display = shouldShow ? '' : 'none';
            }
        });
    }

    completeTask(button) {
        const row = button.closest('tr');
        const statusBadge = row.querySelector('.status-badge');
        
        if (statusBadge) {
            statusBadge.textContent = 'completed';
            statusBadge.className = 'status-badge completed';
        }
        
        button.textContent = 'Completed';
        button.disabled = true;
        button.style.opacity = '0.6';
        
        this.showToast('Task marked as completed');
    }

    editTask(button) {
        const row = button.closest('tr');
        const taskTitle = row.querySelector('.task-title').textContent;
        this.showToast(`Editing task: ${taskTitle}`);
        // TODO: Implement edit modal
    }

    // Format relative time like "2 hours ago"
    formatTimeAgo(input) {
        try {
            const date = typeof input === 'string' ? new Date(input) : input;
            const now = new Date();
            const diffMs = now - date;
            const sec = Math.floor(diffMs / 1000);
            const min = Math.floor(sec / 60);
            const hr = Math.floor(min / 60);
            const day = Math.floor(hr / 24);
            if (sec < 45) return 'just now';
            if (min < 2) return '1 minute ago';
            if (min < 60) return `${min} minutes ago`;
            if (hr < 2) return '1 hour ago';
            if (hr < 24) return `${hr} hours ago`;
            if (day < 2) return '1 day ago';
            if (day < 7) return `${day} days ago`;
            return date.toLocaleDateString();
        } catch (_) {
            return '';
        }
    }

    // Load Initial Data
    loadInitialData() {
        this.updateLivePrice();
        this.loadTodaysTasks();
        this.loadEnergyNews();
        
        // Update live price every 5 minutes
        setInterval(() => {
            this.updateLivePrice();
        }, 300000);

        // Auto-refresh Energy News every 3 hours, starting immediately
        if (this.newsRefreshTimer) clearInterval(this.newsRefreshTimer);
        this.newsRefreshTimer = setInterval(() => {
            this.loadEnergyNews();
        }, 3 * 60 * 60 * 1000);
    }

    updateLivePrice() {
        // Simulate live price updates
        const priceElement = document.querySelector('.current-price');
        const changeElement = document.querySelector('.price-change');
        
        if (priceElement && changeElement) {
            const basePrice = 0.089;
            const variation = (Math.random() - 0.5) * 0.01;
            const newPrice = (basePrice + variation).toFixed(3);
            const change = (variation / basePrice * 100).toFixed(1);
            
            priceElement.textContent = `$${newPrice}`;
            changeElement.textContent = `${change > 0 ? '+' : ''}${change}%`;
            changeElement.className = `price-change ${change > 0 ? 'positive' : 'negative'}`;
        }
    }

    loadTodaysTasks() {
        // This would typically fetch from an API
        const tasksData = [
            {
                name: 'Call Johnson Electric',
                time: 'Due in 2 hours',
                priority: 'high'
            },
            {
                name: 'Send proposal to Metro',
                time: 'Due today',
                priority: 'medium'
            },
            {
                name: 'Follow up with Acme Corp',
                time: 'Due in 4 hours',
                priority: 'low'
            }
        ];

        const tasksList = document.querySelector('.tasks-list');
        if (tasksList) {
            tasksList.innerHTML = tasksData.map(task => `
                <div class="task-item">
                    <div class="task-info">
                        <div class="task-name">${task.name}</div>
                        <div class="task-time">${task.time}</div>
                    </div>
                    <span class="priority-badge ${task.priority}">${task.priority}</span>
                </div>
            `).join('');
        }
    }

    async loadEnergyNews() {
        const newsList = document.querySelector('.news-list');
        const lastRef = document.getElementById('news-last-refreshed');

        const escapeHtml = (str) => {
            if (window.escapeHtml) return window.escapeHtml(str);
            return String(str)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
        };

        try {
            const base = (window.API_BASE_URL || '').replace(/\/$/, '');
            const urls = [`${base}/api/energy-news`];
            if (!base || base.includes('localhost') || base.includes('127.0.0.1')) {
                urls.push('https://power-choosers-crm.vercel.app/api/energy-news');
            }

            let data = null;
            let lastError = null;
            for (const u of urls) {
                try {
                    const resp = await fetch(u, { cache: 'no-store' });
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                    data = await resp.json();
                    break;
                } catch (e) {
                    lastError = e;
                }
            }
            if (!data) throw lastError || new Error('No response');

            const items = (Array.isArray(data.items) ? data.items : []).slice(0, 4);

            if (lastRef && data.lastRefreshed) {
                const dt = new Date(data.lastRefreshed);
                lastRef.textContent = `Last updated: ${dt.toLocaleString()}`;
            }

            if (newsList) {
                newsList.innerHTML = items.map(it => {
                    const title = escapeHtml(it.title || '');
                    const url = (it.url || '').trim();
                    const when = it.publishedAt ? this.formatTimeAgo(it.publishedAt) : '';
                    const time = when || (it.publishedAt ? new Date(it.publishedAt).toLocaleString() : '');
                    const safeHref = escapeHtml(url);
                    return `
                        <a class="news-item" href="${safeHref}" target="_blank" rel="noopener noreferrer">
                            <div class="news-title">${title}</div>
                            <div class="news-time">${escapeHtml(time)}</div>
                        </a>
                    `;
                }).join('');
            }
        } catch (err) {
            console.error('Failed to load energy news', err);
            if (lastRef) lastRef.textContent = 'Last updated: failed to refresh';
            if (newsList) {
                newsList.innerHTML = `
                  <div class="news-item">
                    <div class="news-title">Unable to load energy news right now.</div>
                    <div class="news-time">Please try again later.</div>
                  </div>
                `;
            }
            this.showToast('Failed to refresh Energy News');
        }
    }
}

// Initialize CRM when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.crm = new PowerChoosersCRM();
    if (typeof initGlobalSearch === 'function') {
        initGlobalSearch();
    } else if (window.initGlobalSearch) {
        window.initGlobalSearch();
    }
});

// Export for potential module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PowerChoosersCRM;
}
