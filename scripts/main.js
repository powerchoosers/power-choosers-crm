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
              squareFootage: data.squareFootage || '',
              occupancyPct: data.occupancyPct || '',
              employees: data.employees || '',
              shortDescription: data.shortDescription || '',
              electricitySupplier: data.electricitySupplier || '',
              benefits: data.benefits || '',
              painPoints: data.painPoints || '',
              linkedin: data.linkedin || '',
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
                this.createBulkImportModal();
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

    // CSV Import Modal functionality
    createBulkImportModal() {
        const modal = document.getElementById('modal-bulk-import');
        if (!modal) {
            this.showToast('Bulk Import modal not found');
            return;
        }

        // Reset modal to initial state
        this.resetBulkImportModal(modal);
        
        // Show modal
        modal.removeAttribute('hidden');
        
        // Focus management
        setTimeout(() => {
            const firstInput = modal.querySelector('input[type="file"]');
            if (firstInput) firstInput.focus();
        }, 0);

        // Bind events if not already bound
        if (!modal._csvBound) {
            this.bindBulkImportEvents(modal);
            modal._csvBound = true;
        }
    }

    resetBulkImportModal(modal) {
        // Reset to step 1
        this.showCSVStep(modal, 1);
        
        // Clear file input and info
        const fileInput = modal.querySelector('#csv-file-input');
        const fileInfo = modal.querySelector('#csv-file-info');
        const dropZone = modal.querySelector('#csv-drop-zone');
        
        if (fileInput) fileInput.value = '';
        if (fileInfo) fileInfo.hidden = true;
        if (dropZone) dropZone.style.display = 'flex';
        
        // Reset step indicator
        modal.querySelectorAll('.csv-step').forEach(step => {
            step.classList.remove('active', 'completed');
        });
        modal.querySelector('.csv-step[data-step="1"]').classList.add('active');
        
        // Reset buttons
        const nextBtn1 = modal.querySelector('#csv-next-step-1');
        if (nextBtn1) nextBtn1.disabled = true;
        
        // Clear any stored data
        modal._csvData = null;
        modal._csvHeaders = null;
        modal._csvRows = null;
        modal._importType = 'contacts';
    }

    bindBulkImportEvents(modal) {
        // Close button handlers
        modal.querySelectorAll('[data-close="bulk-import"]').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.setAttribute('hidden', '');
            });
        });

        // File input and drop zone
        this.setupFileUpload(modal);
        
        // Import type selection
        this.setupImportTypeSelection(modal);
        
        // Step navigation
        this.setupStepNavigation(modal);
        
        // Field mapping
        this.setupFieldMapping(modal);
        
        // Import process
        this.setupImportProcess(modal);
    }

    setupFileUpload(modal) {
        const fileInput = modal.querySelector('#csv-file-input');
        const browseBtn = modal.querySelector('#csv-browse-btn');
        const dropZone = modal.querySelector('#csv-drop-zone');
        const removeBtn = modal.querySelector('#csv-remove-file');
        
        // Browse button
        if (browseBtn) {
            browseBtn.addEventListener('click', () => {
                fileInput.click();
            });
        }
        
        // File input change
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleFileSelection(modal, e.target.files[0]);
                }
            });
        }
        
        // Drag and drop
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('dragover');
            });
            
            dropZone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
            });
            
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                
                if (e.dataTransfer.files.length > 0) {
                    const file = e.dataTransfer.files[0];
                    if (file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')) {
                        this.handleFileSelection(modal, file);
                    } else {
                        this.showToast('Please select a CSV file');
                    }
                }
            });
        }
        
        // Remove file button
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                this.removeSelectedFile(modal);
            });
        }
    }

    setupImportTypeSelection(modal) {
        const typeInputs = modal.querySelectorAll('input[name="importType"]');
        typeInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                modal._importType = e.target.value;
            });
        });
    }

    setupStepNavigation(modal) {
        // Step 1 -> 2
        const nextBtn1 = modal.querySelector('#csv-next-step-1');
        if (nextBtn1) {
            nextBtn1.addEventListener('click', () => {
                if (modal._csvData) {
                    this.generateFieldMapping(modal);
                    this.showCSVStep(modal, 2);
                }
            });
        }
        
        // Step 2 -> 3
        const nextBtn2 = modal.querySelector('#csv-next-step-2');
        if (nextBtn2) {
            nextBtn2.addEventListener('click', () => {
                // Persist current field mappings before moving to review
                this.saveFieldMappingToStorage(modal);
                this.generateReviewSummary(modal);
                this.showCSVStep(modal, 3);
            });
        }
        
        // Back buttons
        const backBtn2 = modal.querySelector('#csv-back-step-2');
        if (backBtn2) {
            backBtn2.addEventListener('click', () => {
                this.showCSVStep(modal, 1);
            });
        }
        
        const backBtn3 = modal.querySelector('#csv-back-step-3');
        if (backBtn3) {
            backBtn3.addEventListener('click', () => {
                this.showCSVStep(modal, 2);
            });
        }
    }

    setupFieldMapping(modal) {
        // Field mapping is set up dynamically in generateFieldMapping
    }

    setupImportProcess(modal) {
        const startBtn = modal.querySelector('#csv-start-import');
        const finishBtn = modal.querySelector('#csv-finish-import');
        
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                this.startImport(modal);
            });
        }
        
        if (finishBtn) {
            finishBtn.addEventListener('click', () => {
                modal.setAttribute('hidden', '');
                // Trigger a page refresh if we're on contacts/accounts page
                if (this.currentPage === 'people' || this.currentPage === 'accounts') {
                    window.location.reload();
                }
            });
        }
    }

    async handleFileSelection(modal, file) {
        // Validate file
        if (!file.name.toLowerCase().endsWith('.csv')) {
            this.showToast('Please select a CSV file');
            return;
        }
        
        if (file.size > 10 * 1024 * 1024) { // 10MB
            this.showToast('File size must be less than 10MB');
            return;
        }
        
        try {
            // Read file
            const text = await this.readFileAsText(file);
            const { headers, rows } = this.parseCSV(text);
            
            if (rows.length === 0) {
                this.showToast('CSV file appears to be empty');
                return;
            }
            
            // Store data
            modal._csvData = text;
            modal._csvHeaders = headers;
            modal._csvRows = rows;
            
            // Update UI
            this.displayFileInfo(modal, file, rows.length);
            
            // Enable next button
            const nextBtn = modal.querySelector('#csv-next-step-1');
            if (nextBtn) nextBtn.disabled = false;
            
        } catch (error) {
            console.error('Error reading CSV file:', error);
            this.showToast('Error reading CSV file. Please check the file format.');
        }
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    parseCSV(text) {
        if (!text) return { headers: [], rows: [] };

        // Strip UTF-8 BOM if present
        if (text.charCodeAt(0) === 0xFEFF) {
            text = text.slice(1);
        }

        const records = [];
        let row = [];
        let field = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            if (inQuotes) {
                if (char === '"') {
                    // Handle escaped quotes
                    if (i + 1 < text.length && text[i + 1] === '"') {
                        field += '"';
                        i++; // skip next quote
                    } else {
                        inQuotes = false; // closing quote
                    }
                } else {
                    field += char;
                }
            } else {
                if (char === '"') {
                    inQuotes = true;
                } else if (char === ',') {
                    row.push(field.trim());
                    field = '';
                } else if (char === '\n') {
                    // Line Feed ends record
                    row.push(field.trim());
                    field = '';
                    // Skip potential preceding CR already handled below
                    records.push(row);
                    row = [];
                } else if (char === '\r') {
                    // Carriage Return may be part of CRLF; treat as end of record
                    // Push field and row, then skip a following \n if present
                    row.push(field.trim());
                    field = '';
                    records.push(row);
                    row = [];
                    if (i + 1 < text.length && text[i + 1] === '\n') {
                        i++; // skip LF in CRLF
                    }
                } else {
                    field += char;
                }
            }
        }

        // Push last field/row if any content remains
        if (field.length > 0 || inQuotes || row.length > 0) {
            row.push(field.trim());
        }
        if (row.length > 0) {
            records.push(row);
        }

        // Remove empty rows (all cells blank)
        const nonEmpty = records.filter(r => r && r.some(c => String(c).trim() !== ''));
        if (nonEmpty.length === 0) return { headers: [], rows: [] };

        const headers = nonEmpty[0];
        const rows = nonEmpty.slice(1);
        return { headers, rows };
    }

    parseCSVLine(line) {
        // Robust single-line CSV field parsing with escaped quotes (RFC4180-style)
        const result = [];
        let field = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (inQuotes) {
                if (char === '"') {
                    // Escaped quote inside quoted field
                    if (i + 1 < line.length && line[i + 1] === '"') {
                        field += '"';
                        i++; // skip the next quote
                    } else {
                        inQuotes = false; // closing quote
                    }
                } else {
                    field += char;
                }
            } else {
                if (char === '"') {
                    inQuotes = true;
                } else if (char === ',') {
                    result.push(field.trim());
                    field = '';
                } else {
                    field += char;
                }
            }
        }

        result.push(field.trim());
        return result;
    }

    displayFileInfo(modal, file, rowCount) {
        const fileName = modal.querySelector('#csv-file-name');
        const fileSize = modal.querySelector('#csv-file-size');
        const rowCountEl = modal.querySelector('#csv-row-count');
        const fileInfo = modal.querySelector('#csv-file-info');
        const dropZone = modal.querySelector('#csv-drop-zone');
        
        if (fileName) fileName.textContent = file.name;
        if (fileSize) fileSize.textContent = this.formatFileSize(file.size);
        if (rowCountEl) rowCountEl.textContent = rowCount;
        
        if (fileInfo) fileInfo.hidden = false;
        if (dropZone) dropZone.style.display = 'none';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    removeSelectedFile(modal) {
        const fileInput = modal.querySelector('#csv-file-input');
        const fileInfo = modal.querySelector('#csv-file-info');
        const dropZone = modal.querySelector('#csv-drop-zone');
        const nextBtn = modal.querySelector('#csv-next-step-1');
        
        if (fileInput) fileInput.value = '';
        if (fileInfo) fileInfo.hidden = true;
        if (dropZone) dropZone.style.display = 'flex';
        if (nextBtn) nextBtn.disabled = true;
        
        modal._csvData = null;
        modal._csvHeaders = null;
        modal._csvRows = null;
    }

    showCSVStep(modal, stepNumber) {
        // Hide all steps
        modal.querySelectorAll('.csv-step-content').forEach(step => {
            step.hidden = true;
        });
        
        // Show target step
        const targetStep = modal.querySelector(`#csv-step-${stepNumber}`);
        if (targetStep) targetStep.hidden = false;
        
        // Update step indicator
        modal.querySelectorAll('.csv-step').forEach(step => {
            const stepNum = parseInt(step.dataset.step);
            step.classList.remove('active', 'completed');
            
            if (stepNum === stepNumber) {
                step.classList.add('active');
            } else if (stepNum < stepNumber) {
                step.classList.add('completed');
            }
        });
    }

    generateFieldMapping(modal) {
        if (!modal._csvHeaders) return;
        
        const previewTable = modal.querySelector('#csv-preview-table');
        const mappingList = modal.querySelector('#csv-field-mapping');
        
        // Generate preview table
        if (previewTable) {
            const previewRows = modal._csvRows.slice(0, 3);
            let tableHTML = '<table><thead><tr>';
            
            modal._csvHeaders.forEach(header => {
                tableHTML += `<th>${this.escapeHtml(header)}</th>`;
            });
            tableHTML += '</tr></thead><tbody>';
            
            previewRows.forEach((row, idx) => {
                tableHTML += '<tr>';
                row.forEach((cell, idx2) => {
                    const header = modal._csvHeaders[idx2] || '';
                    const disp = this.displaySanitizeCell(cell, header);
                    tableHTML += `<td>${this.escapeHtml(disp)}</td>`;
                });
                tableHTML += '</tr>';
            });
            
            tableHTML += '</tbody></table>';
            previewTable.innerHTML = tableHTML;
        }
        
        // Generate field mapping
        if (mappingList) {
            const crmFields = this.getCRMFields(modal._importType || 'contacts');
            let mappingHTML = '';
            
            modal._csvHeaders.forEach((header, index) => {
                mappingHTML += `
                    <div class="mapping-row">
                        <div class="mapping-source">${this.escapeHtml(header)}</div>
                        <div class="mapping-arrow">→</div>
                        <div class="mapping-target">
                            <select data-csv-column="${index}">
                                <option value="">-- Skip this field --</option>
                                ${crmFields.map(field => 
                                    `<option value="${field.value}" ${
                                        this.suggestMapping(header, field) ? 'selected' : ''
                                    }>${field.label}</option>`
                                ).join('')}
                            </select>
                        </div>
                    </div>
                `;
            });
            
            mappingList.innerHTML = mappingHTML;
            // Restore saved mappings if available
            const stored = this.loadFieldMappingFromStorage(modal);
            this.applyStoredFieldMappings(modal, stored);
            // Auto-save on change (persists including skipped selections)
            const selects = modal.querySelectorAll('#csv-field-mapping select');
            selects.forEach(sel => {
                sel.addEventListener('change', () => this.saveFieldMappingToStorage(modal));
            });
        }
    }

    getCRMFields(importType) {
        if (importType === 'accounts') {
            return [
                { value: 'accountName', label: 'Account Name' },
                { value: 'industry', label: 'Industry' },
                { value: 'website', label: 'Website' },
                { value: 'phone', label: 'Phone' },
                { value: 'city', label: 'City' },
                { value: 'state', label: 'State' },
                { value: 'squareFootage', label: 'SQ FT' },
                { value: 'occupancyPct', label: 'Occupancy %' },
                { value: 'employees', label: 'Employees' },
                { value: 'shortDescription', label: 'Short Description' },
                { value: 'electricitySupplier', label: 'Electricity Supplier' },
                { value: 'benefits', label: 'Benefits' },
                { value: 'painPoints', label: 'Pain Points' },
                { value: 'linkedin', label: 'LinkedIn URL' }
            ];
        } else {
            return [
                { value: 'firstName', label: 'First Name' },
                { value: 'lastName', label: 'Last Name' },
                { value: 'email', label: 'Email' },
                { value: 'phone', label: 'Phone' },
                { value: 'title', label: 'Job Title' },
                { value: 'companyName', label: 'Company Name' }
            ];
        }
    }

    suggestMapping(csvHeader, crmField) {
        const header = csvHeader.toLowerCase().replace(/[^a-z0-9]/g, '');
        const field = crmField.value.toLowerCase();
        
        // Simple matching logic
        if (header.includes(field) || field.includes(header)) return true;
        
        // Special cases
        const mappings = {
            'firstname': 'firstName',
            'lastname': 'lastName', 
            'name': 'firstName',
            'company': 'companyName',
            'jobtitle': 'title',
            'position': 'title',
            'website': 'website',
            'url': 'website'
        };
        
        return mappings[header] === crmField.value;
    }

    generateReviewSummary(modal) {
        const summaryDiv = modal.querySelector('#csv-review-summary');
        const previewDiv = modal.querySelector('#csv-final-preview');
        
        if (!modal._csvRows || !summaryDiv) return;
        
        // Get field mappings
        const mappings = this.getFieldMappings(modal);
        const mappedFieldCount = Object.keys(mappings).length;
        
        // Generate summary
        const summaryHTML = `
            <div class="summary-item">
                <div class="summary-value">${modal._csvRows.length}</div>
                <div class="summary-label">Records to Import</div>
            </div>
            <div class="summary-item">
                <div class="summary-value">${mappedFieldCount}</div>
                <div class="summary-label">Fields Mapped</div>
            </div>
            <div class="summary-item">
                <div class="summary-value">${modal._importType === 'contacts' ? 'Contacts' : 'Accounts'}</div>
                <div class="summary-label">Import Type</div>
            </div>
        `;
        
        summaryDiv.innerHTML = summaryHTML;
        
        // Generate final preview
        if (previewDiv) {
            const previewRows = modal._csvRows.slice(0, 5);
            let tableHTML = '<table><thead><tr>';
            
            // Show only mapped fields
            Object.values(mappings).forEach(fieldLabel => {
                tableHTML += `<th>${this.escapeHtml(fieldLabel)}</th>`;
            });
            tableHTML += '</tr></thead><tbody>';
            
            previewRows.forEach(row => {
                tableHTML += '<tr>';
                Object.keys(mappings).forEach(csvIndex => {
                    const idx = parseInt(csvIndex);
                    const cellValue = row[idx] || '';
                    // Use selected field value (not label) to normalize properly
                    const sel = modal.querySelector(`#csv-field-mapping select[data-csv-column="${idx}"]`);
                    const fieldValue = sel ? sel.value : '';
                    const normalized = fieldValue ? this.normalizeForField(fieldValue, cellValue) : this.displaySanitizeCell(cellValue, mappings[csvIndex]);
                    tableHTML += `<td>${this.escapeHtml(normalized)}</td>`;
                });
                tableHTML += '</tr>';
            });
            
            tableHTML += '</tbody></table>';
            previewDiv.innerHTML = tableHTML;
        }
    }

    // Return mapping of csvIndex -> human-friendly CRM field label
    getFieldMappings(modal) {
        const result = {};
        const selects = modal.querySelectorAll('#csv-field-mapping select');
        selects.forEach(select => {
            if (select.value) {
                const opt = select.options[select.selectedIndex];
                const label = opt ? (opt.textContent || '').trim() : select.value;
                result[select.dataset.csvColumn] = label;
            }
        });
        return result;
    }

    // Generate a deterministic signature for the current CSV header set
    getHeaderSignature(headers) {
        if (!Array.isArray(headers)) return '';
        return headers.map(h => String(h || '').trim().toLowerCase()).join('|');
    }

    // Build a unique localStorage key based on import type and header signature
    getMappingStorageKey(modal) {
        try {
            const type = modal._importType || 'contacts';
            const sig = this.getHeaderSignature(modal._csvHeaders || []);
            if (!sig) return '';
            return `pc:bulkImport:mapping:${type}:${sig}`;
        } catch (_) {
            return '';
        }
    }

    // Persist current mapping selections (csvIndex -> crmFieldValue)
    // Note: we also persist explicit "skip" selections (empty string) so skipped fields are remembered.
    saveFieldMappingToStorage(modal) {
        try {
            const key = this.getMappingStorageKey(modal);
            if (!key) return;
            const selects = modal.querySelectorAll('#csv-field-mapping select');
            const map = {};
            selects.forEach(s => {
                const idx = s.dataset.csvColumn;
                // Save all values, including '' which represents Skip
                map[idx] = s.value;
            });
            localStorage.setItem(key, JSON.stringify(map));
        } catch (_) { /* ignore storage errors */ }
    }

    // Load previously-saved mapping (csvIndex -> crmFieldValue)
    loadFieldMappingFromStorage(modal) {
        try {
            const key = this.getMappingStorageKey(modal);
            if (!key) return null;
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const obj = JSON.parse(raw);
            return obj && typeof obj === 'object' ? obj : null;
        } catch (_) {
            return null;
        }
    }

    // Apply saved mapping to the current selects
    // Apply even when value is '' (Skip) so skipped fields are restored.
    applyStoredFieldMappings(modal, stored) {
        if (!stored) return;
        const selects = modal.querySelectorAll('#csv-field-mapping select');
        selects.forEach(s => {
            const idx = s.dataset.csvColumn;
            if (Object.prototype.hasOwnProperty.call(stored, idx)) {
                s.value = stored[idx];
            }
        });
    }

    async startImport(modal) {
        const progressDiv = modal.querySelector('#csv-import-progress');
        const progressFill = modal.querySelector('#csv-progress-fill');
        const progressStats = modal.querySelector('#csv-progress-stats');
        const resultsDiv = modal.querySelector('#csv-import-results');
        const startBtn = modal.querySelector('#csv-start-import');
        const finishBtn = modal.querySelector('#csv-finish-import');
        
        // Show progress, hide other elements
        if (progressDiv) progressDiv.hidden = false;
        if (startBtn) startBtn.hidden = true;
        
        // Use current select values for actual import
        const mappings = {};
        const selects = modal.querySelectorAll('#csv-field-mapping select');
        selects.forEach(select => {
            if (select.value) {
                mappings[select.dataset.csvColumn] = select.value;
            }
        });
        
        const updateExisting = modal.querySelector('#csv-update-existing')?.checked;
        
        let imported = 0;
        let enriched = 0;
        let failed = 0;
        const total = modal._csvRows.length;
        
        try {
            const db = window.firebaseDB;
            const fv = window.firebase?.firestore?.FieldValue;
            if (!db) throw new Error('Database not available');
            
            const collection = modal._importType === 'accounts' ? 'accounts' : 'contacts';
            
            // Process in batches
            const batchSize = 10;
            for (let i = 0; i < modal._csvRows.length; i += batchSize) {
                const batch = modal._csvRows.slice(i, i + batchSize);
                
                await Promise.all(batch.map(async (row) => {
                    try {
                        const doc = {};
                        
                        // Map CSV data to CRM fields
                        Object.entries(mappings).forEach(([csvIndex, crmField]) => {
                            const raw = row[parseInt(csvIndex)];
                            const value = typeof raw === 'string' ? raw.trim() : raw;
                            if (value) {
                                // Field-specific normalization (e.g., strip Excel leading apostrophe on phone)
                                doc[crmField] = this.normalizeForField(crmField, value);
                            }
                        });
                        
                        // Skip if no data
                        if (Object.keys(doc).length === 0) return;
                        
                        // Check for existing record if update is enabled
                        let existingRecord = null;
                        if (updateExisting) {
                            // Try to find existing record by email for contacts, by accountName for accounts
                            const matchField = modal._importType === 'accounts' ? 'accountName' : 'email';
                            if (doc[matchField]) {
                                const query = await db.collection(collection)
                                    .where(matchField, '==', doc[matchField])
                                    .limit(1)
                                    .get();
                                
                                if (!query.empty) {
                                    existingRecord = query.docs[0];
                                }
                            }
                        }
                        
                        const now = fv?.serverTimestamp?.() || Date.now();
                        
                        if (existingRecord) {
                            // Update existing record
                            doc.updatedAt = now;
                            doc.enrichedAt = now;
                            await existingRecord.ref.update(doc);
                            enriched++;

                            // Live update tables
                            try {
                                if (modal._importType === 'accounts') {
                                    // Accounts module listens to pc:account-created; send merged full doc so row renders correctly
                                    const prev = (typeof existingRecord.data === 'function') ? existingRecord.data() : {};
                                    const merged = Object.assign({}, prev, doc);
                                    document.dispatchEvent(new CustomEvent('pc:account-created', { detail: { id: existingRecord.id, doc: merged } }));
                                } else {
                                    // People module listens to pc:contact-updated with { changes }
                                    document.dispatchEvent(new CustomEvent('pc:contact-updated', { detail: { id: existingRecord.id, changes: Object.assign({}, doc) } }));
                                }
                            } catch (_) { /* noop */ }
                        } else {
                            // Create new record
                            doc.createdAt = now;
                            doc.updatedAt = now;
                            doc.importedAt = now;
                            const ref = await db.collection(collection).add(doc);
                            imported++;

                            // Live update tables
                            try {
                                if (modal._importType === 'accounts') {
                                    document.dispatchEvent(new CustomEvent('pc:account-created', { detail: { id: ref.id, doc } }));
                                } else {
                                    document.dispatchEvent(new CustomEvent('pc:contact-created', { detail: { id: ref.id, doc } }));
                                }
                            } catch (_) { /* noop */ }
                        }
                    } catch (error) {
                        console.error('Error importing row:', error);
                        failed++;
                    }
                }));
                
                // Update progress
                const processed = Math.min(i + batchSize, total);
                const percentage = (processed / total) * 100;
                
                if (progressFill) progressFill.style.width = `${percentage}%`;
                if (progressStats) {
                    progressStats.textContent = `${processed} of ${total} processed`;
                }
                
                // Small delay to show progress
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            // Show results
            if (progressDiv) progressDiv.hidden = true;
            if (resultsDiv) {
                resultsDiv.hidden = false;
                const summaryDiv = modal.querySelector('#csv-results-summary');
                if (summaryDiv) {
                    const recordType = modal._importType === 'accounts' ? 'accounts' : 'contacts';
                    let resultMessage = '<strong>Import Complete!</strong><br>';
                    
                    if (imported > 0) {
                        resultMessage += `New ${recordType} created: ${imported}<br>`;
                    }
                    if (enriched > 0) {
                        resultMessage += `Existing ${recordType} enriched: ${enriched}<br>`;
                    }
                    if (failed > 0) {
                        resultMessage += `Failed: ${failed} records<br>`;
                    }
                    resultMessage += 'You can now close this dialog.';
                    
                    summaryDiv.innerHTML = resultMessage;
                }
            }
            if (finishBtn) finishBtn.hidden = false;
            
            // Show appropriate notification
            const recordType = modal._importType === 'accounts' ? 'accounts' : 'contacts';
            let toastMessage = '';
            
            if (imported > 0 && enriched > 0) {
                toastMessage = `Import complete! ${imported} new ${recordType} added, ${enriched} existing ${recordType} enriched.`;
            } else if (imported > 0) {
                toastMessage = `Import complete! ${imported} new ${recordType} imported.`;
            } else if (enriched > 0) {
                toastMessage = `Enrichment complete! ${enriched} existing ${recordType} updated with new data.`;
            } else {
                toastMessage = `Import complete, but no ${recordType} were processed. Please check your data and mapping.`;
            }
            
            this.showToast(toastMessage);
            
        } catch (error) {
            console.error('Import error:', error);
            this.showToast('Import failed. Please try again.');
            
            // Reset UI
            if (progressDiv) progressDiv.hidden = true;
            if (startBtn) startBtn.hidden = false;
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Sanitize cell for preview display without mutating stored CSV
    displaySanitizeCell(value, headerText) {
        try {
            const header = String(headerText || '').toLowerCase();
            let v = String(value == null ? '' : value);
            // If column header suggests phone OR value looks like phone starting with apostrophe, sanitize
            const isPhoneHeader = /phone/.test(header);
            const looksLikePhoneWithApos = /^'\s*[+0-9(]/.test(v);
            if (isPhoneHeader || looksLikePhoneWithApos) {
                // Remove leading apostrophe and unwrap ="..."
                if (v.startsWith("'")) v = v.slice(1);
                v = v.replace(/^=\s*["']?(.+?)["']?$/u, '$1');
                v = v.replace(/[\u200B-\u200D\uFEFF]/g, '');
            }
            return v;
        } catch (_) {
            return value;
        }
    }

    // Normalize specific CRM field values
    normalizeForField(field, value) {
        try {
            if (!field) return value;
            if (field === 'phone') return this.normalizePhone(value);
            return value;
        } catch (_) {
            return value;
        }
    }

    // Normalize phone numbers imported from CSV
    // - Remove Excel leading apostrophe prefix '123...
    // - Unwrap Excel formula-like wrappers ="+1 234..." => +1 234...
    // - Strip zero-width/invisible characters
    normalizePhone(value) {
        try {
            let v = String(value == null ? '' : value).trim();
            // Remove a single leading apostrophe used by spreadsheets
            if (v.startsWith("'")) v = v.slice(1);
            // Unwrap ="..." or = '...' pattern some CSVs contain
            v = v.replace(/^=\s*["']?(.+?)["']?$/u, '$1');
            // Remove zero-width spaces and BOM
            v = v.replace(/[\u200B-\u200D\uFEFF]/g, '');
            return v.trim();
        } catch (_) {
            return value;
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
