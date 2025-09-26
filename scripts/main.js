// Power Choosers CRM - Main JavaScript Functionality
// Strategic navigation and interactive features

class PowerChoosersCRM {
    constructor() {
        this.currentPage = 'dashboard';
        this.sidebar = document.getElementById('sidebar');
        this.init();
        
        // Load home activities on initial load if we're on the dashboard
        setTimeout(() => {
            if (window.ActivityManager && document.getElementById('dashboard-page')?.classList.contains('active')) {
                this.loadHomeActivities();
            }
        }, 100);

        // Listen for activity refresh events
        document.addEventListener('pc:activities-refresh', (e) => {
            const { entityType } = e.detail || {};
            if (entityType === 'global') {
                // Refresh home activities
                this.loadHomeActivities();
            }
        });
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

          // If explicit logo/icon URL provided, persist as logoUrl
          if (data.logoUrl) {
            data.logoUrl = data.logoUrl.trim();
          }

          // Remove empty fields
          Object.keys(data).forEach(k => { if (!data[k]) delete data[k]; });

          try {
            const db = window.firebaseDB;
            const fv = window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue;
            if (!db) throw new Error('Firestore not initialized');
            const now = fv && typeof fv.serverTimestamp === 'function' ? fv.serverTimestamp() : Date.now();

            // Normalize company phone if provided
            if (data.phone) {
              try { data.phone = this.normalizePhone(data.phone); } catch(_) {}
            }

            const doc = {
              // Known account fields (flexible)
              accountName: data.accountName || data.name || 'New Account',
              industry: data.industry || '',
              domain: data.domain || '',
              website: data.website || '',
              companyPhone: data.phone || '',
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
              // Branding
              logoUrl: data.logoUrl || '',
              // Timestamps
              createdAt: now,
              updatedAt: now,
            };

            const ref = await db.collection('accounts').add(doc);

            // Create UI document for notifications and navigation
            const uiDoc = Object.assign({}, doc, { createdAt: new Date(), updatedAt: new Date() });

            // Notify Accounts page to update its state without reload
            try {
              document.dispatchEvent(new CustomEvent('pc:account-created', { detail: { id: ref.id, doc: uiDoc } }));
            } catch (_) { /* noop */ }

            if (window.crm && typeof window.crm.showToast === 'function') window.crm.showToast('Account added!');
            
            // Navigate to account details page after successful creation
            try {
              // Set up navigation source tracking for back button
              window._accountNavigationSource = 'add-account';
              // Use the state that was captured when the add account button was clicked
              // If no state was captured, create a default one
              if (!window._addAccountReturn) {
                window._addAccountReturn = {
                  page: window.crm?.currentPage || 'accounts',
                  scroll: window.scrollY || (document.documentElement && document.documentElement.scrollTop) || 0,
                  searchTerm: '',
                  sortColumn: '',
                  sortDirection: '',
                  selectedItems: []
                };
              }
              
              // Navigate to account details page
              console.log('[Add Account] Attempting navigation to account details for ID:', ref.id);
              console.log('[Add Account] AccountDetail available:', !!window.AccountDetail);
              console.log('[Add Account] AccountDetail.show available:', !!(window.AccountDetail && typeof window.AccountDetail.show === 'function'));
              
              if (window.AccountDetail && typeof window.AccountDetail.show === 'function') {
                // Prefetch the account data for immediate display
                window._prefetchedAccountForDetail = Object.assign({}, uiDoc, { id: ref.id });
                console.log('[Add Account] Calling AccountDetail.show with ID:', ref.id);
                window.AccountDetail.show(ref.id);
              } else {
                // Try to navigate to account-details page and then show the account
                console.log('[Add Account] AccountDetail not available, using fallback navigation');
                if (window.crm && typeof window.crm.navigateToPage === 'function') {
                  window.crm.navigateToPage('account-details');
                  
                  // Retry showing the account detail after page navigation
                  let retryCount = 0;
                  const maxRetries = 20; // 2 seconds with 100ms intervals
                  const retryInterval = setInterval(() => {
                    retryCount++;
                    if (window.AccountDetail && typeof window.AccountDetail.show === 'function') {
                      console.log('[Add Account] Retry successful, showing account detail');
                      window._prefetchedAccountForDetail = Object.assign({}, uiDoc, { id: ref.id });
                      window.AccountDetail.show(ref.id);
                      clearInterval(retryInterval);
                    } else if (retryCount >= maxRetries) {
                      console.error('[Add Account] Failed to load AccountDetail after retries');
                      clearInterval(retryInterval);
                    }
                  }, 100);
                } else {
                  console.error('[Add Account] No navigation method available');
                }
              }
              
              // Close modal after navigation is initiated
              setTimeout(() => {
                try { form.reset(); } catch (_) { /* noop */ }
                close();
              }, 100); // Small delay to ensure navigation starts
              
            } catch (e) {
              console.error('Navigation to account details failed:', e);
              // If navigation fails, still close the modal
              try { form.reset(); } catch (_) { /* noop */ }
              close();
            }
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

  // Prefer PUBLIC_BASE_URL → API_BASE_URL → Vercel fallback → location.origin
  getApiBaseUrl() {
    try {
      const fromWindow = (window.PUBLIC_BASE_URL || window.API_BASE_URL || '').toString().trim();
      if (fromWindow) return fromWindow.replace(/\/$/, '');
    } catch(_) {}
    try {
      if (typeof PUBLIC_BASE_URL !== 'undefined' && PUBLIC_BASE_URL) return String(PUBLIC_BASE_URL).replace(/\/$/, '');
    } catch(_) {}
    try {
      if (typeof API_BASE_URL !== 'undefined' && API_BASE_URL) return String(API_BASE_URL).replace(/\/$/, '');
    } catch(_) {}
    const vercel = 'https://power-choosers-crm.vercel.app';
    if (/^https?:\/\//i.test(vercel)) return vercel;
    try { return (window.location && window.location.origin) ? window.location.origin.replace(/\/$/, '') : vercel; } catch(_) { return vercel; }
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

            // Normalize contact phone fields
            const normalized = {};
            if (data.mobile) { try { normalized.mobile = this.normalizePhone(data.mobile); } catch(_) { normalized.mobile = data.mobile; } }
            if (data.workDirectPhone) { try { normalized.workDirectPhone = this.normalizePhone(data.workDirectPhone); } catch(_) { normalized.workDirectPhone = data.workDirectPhone; } }
            if (data.otherPhone) { try { normalized.otherPhone = this.normalizePhone(data.otherPhone); } catch(_) { normalized.otherPhone = data.otherPhone; } }

          const doc = {
              // Known contact fields
              firstName: data.firstName || '',
              lastName: data.lastName || '',
              title: data.title || '',
              companyName: data.companyName || '',
              email: data.email || '',
              // Phones
              mobile: normalized.mobile || '',
              workDirectPhone: normalized.workDirectPhone || '',
              otherPhone: normalized.otherPhone || '',
              // Optional extras
              city: data.city || '',
              state: data.state || '',
              industry: data.industry || '',
              seniority: data.seniority || '',
              department: data.department || '',
              linkedin: data.linkedin || '',
              // Timestamps
              createdAt: now,
              updatedAt: now,
            };

          // If adding from Account Details, link the contact to the current account immediately
          try {
            const accountId = window.AccountDetail?.state?.currentAccount?.id;
            if (accountId) {
              doc.accountId = accountId;
            }
          } catch (_) { /* noop */ }

            const ref = await db.collection('contacts').add(doc);

            // Broadcast for optional listeners (e.g., People page refresh)
            // Use UI-friendly timestamps so the table doesn't show N/A while serverTimestamp resolves
            try {
              const uiDoc = Object.assign({}, doc, {
                createdAt: new Date(),
                updatedAt: new Date(),
              });
              document.dispatchEvent(new CustomEvent('pc:contact-created', { detail: { id: ref.id, doc: uiDoc } }));
            } catch (_) { /* noop */ }

            if (window.crm && typeof window.crm.showToast === 'function') window.crm.showToast('Contact added!');
            try { form.reset(); } catch (_) { /* noop */ }
            close();

            // Navigate to the newly created contact detail page
            try {
              // Navigate to people page first
              if (window.crm && typeof window.crm.navigateToPage === 'function') {
                window.crm.navigateToPage('people');
                // Show the contact detail after a short delay to ensure page is loaded
                setTimeout(() => {
                  if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
                    window.ContactDetail.show(ref.id);
                  } else {
                    // Retry mechanism in case ContactDetail isn't ready yet
                    let attempts = 0;
                    const maxAttempts = 10;
                    const retryInterval = 100;
                    const retry = () => {
                      attempts++;
                      if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
                        window.ContactDetail.show(ref.id);
                      } else if (attempts < maxAttempts) {
                        setTimeout(retry, retryInterval);
                      } else {
                        console.error('ContactDetail not available after', maxAttempts, 'attempts');
                      }
                    };
                    retry();
                  }
                }, 100);
              }
            } catch (error) {
              console.error('Error navigating to contact detail:', error);
            }
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
        // Ensure widget panel visibility state is reflected on first load
        try {
            this.updateWidgetPanel(this.currentPage);
        } catch (_) { /* noop */ }
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
        // When on Account Details, keep highlight on Accounts in the sidebar
        // When on List Detail, keep highlight on Lists in the sidebar
        const navPageToActivate = (pageName === 'account-details') ? 'accounts' : 
                                 (pageName === 'list-detail') ? 'lists' : pageName;
        const targetNav = document.querySelector(`[data-page="${navPageToActivate}"]`);
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
        
        // Load activities for home page
        if (pageName === 'dashboard' && window.ActivityManager) {
            setTimeout(() => {
                this.loadHomeActivities();
            }, 50);
        }
        
        // Tasks page - ensure data is loaded from Firebase and localStorage
        if (pageName === 'tasks') {
            setTimeout(() => {
                // Trigger a refresh of tasks data when navigating to tasks page
                if (window.dispatchEvent) {
                    window.dispatchEvent(new CustomEvent('tasksUpdated', { 
                        detail: { source: 'navigation' } 
                    }));
                }
            }, 50);
        }
        
        // Task detail page - initialize task detail functionality
        if (pageName === 'task-detail') {
            setTimeout(() => {
                if (window.TaskDetail && typeof window.TaskDetail.init === 'function') {
                    window.TaskDetail.init();
                }
            }, 100);
        }
        
        // Lists page - ensure overview is shown by default
        if (pageName === 'lists') {
            // Make sure we show the overview, not any detail view
            setTimeout(() => {
                // Hide any detail views that might be showing
                const listDetail = document.getElementById('lists-detail');
                if (listDetail) {
                    listDetail.hidden = true;
                    listDetail.style.display = 'none';
                }
                
                // Show the main lists content (overview)
                const listsContent = document.querySelector('#lists-page .page-content');
                if (listsContent) {
                    listsContent.style.display = 'block';
                    listsContent.classList.add('lists-grid');
                }
                
                // Ensure lists overview module is initialized
                if (window.ListsOverview && typeof window.ListsOverview.refreshCounts === 'function') {
                    window.ListsOverview.refreshCounts();
                }
            }, 50);
        }
        
        // Call Scripts page - store navigation source and initialize the module
        if (pageName === 'call-scripts') {
            // Store navigation source for back button functionality
            const currentPage = this.currentPage;
            if (currentPage && currentPage !== 'call-scripts') {
                // Get current page state for restoration
                let returnState = {};
                
                // Try to get state from current page modules
                if (currentPage === 'people' && window.peopleModule && typeof window.peopleModule.getCurrentState === 'function') {
                    returnState = window.peopleModule.getCurrentState();
                } else if (currentPage === 'calls' && window.callsModule && typeof window.callsModule.getCurrentState === 'function') {
                    returnState = window.callsModule.getCurrentState();
                } else if (currentPage === 'accounts' && window.accountsModule && typeof window.accountsModule.getCurrentState === 'function') {
                    returnState = window.accountsModule.getCurrentState();
                } else if (currentPage === 'lists' && window.listsModule && typeof window.listsModule.getCurrentState === 'function') {
                    returnState = window.listsModule.getCurrentState();
                } else {
                    // Fallback: store basic state
                    returnState = {
                        page: currentPage,
                        scroll: window.scrollY || 0,
                        timestamp: Date.now()
                    };
                }
                
                window._callScriptsNavigationSource = currentPage;
                window._callScriptsReturn = returnState;
                
                console.log('[Main] Stored call scripts navigation source:', currentPage, 'with state:', returnState);
            }
            
            // Initialize the module
            if (window.callScriptsModule) {
                setTimeout(() => {
                    try {
                        if (typeof window.callScriptsModule.init === 'function') {
                            window.callScriptsModule.init();
                        }
                    } catch (_) { /* noop */ }
                }, 50);
            }
        }

        // List Detail page - initialize the detail view
        if (pageName === 'list-detail') {
            setTimeout(() => {
                // Initialize the list detail module if needed
                if (window.ListDetail && typeof window.ListDetail.init === 'function') {
                    // Use context passed from the lists overview
                    const context = window.listDetailContext || {
                        listId: null,
                        listName: 'List',
                        listKind: 'people'
                    };
                    window.ListDetail.init(context);
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

    showToast(message, type = 'info', options = {}) {
        // Use the new enhanced toast manager if available
        if (window.ToastManager) {
            return window.ToastManager.showToast({
                type: type,
                message: message,
                ...options
            });
        }
        
        // No fallback - ToastManager should always be available
        console.warn('ToastManager not available for toast notification:', message);
    }

    // Unified pagination component
    createPagination(currentPage, totalPages, onPageChange, containerId = null) {
        // Always show pagination, even for single page or empty lists
        if (totalPages < 1) totalPages = 1;
        
        const container = containerId ? document.getElementById(containerId) : null;
        const paginationId = `pagination-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const html = `
            <div class="unified-pagination" id="${paginationId}">
                <button class="pagination-arrow" data-action="prev" ${currentPage <= 1 ? 'disabled' : ''} aria-label="Previous page">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="15,18 9,12 15,6"></polyline>
                    </svg>
                </button>
                
                <div class="pagination-current-container">
                    <button class="pagination-current" data-action="show-picker" aria-label="Current page ${currentPage} of ${totalPages}">
                        ${currentPage}
                    </button>
                    <div class="pagination-picker" id="${paginationId}-picker">
                        <div class="pagination-picker-content">
                            <div class="pagination-picker-header">Go to page</div>
                            <div class="pagination-picker-pages">
                                ${this.generatePagePickerPages(currentPage, totalPages, paginationId)}
                            </div>
                        </div>
                    </div>
                </div>
                
                <button class="pagination-arrow" data-action="next" ${currentPage >= totalPages ? 'disabled' : ''} aria-label="Next page">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9,18 15,12 9,6"></polyline>
                    </svg>
                </button>
            </div>
        `;
        
        if (container) {
            container.innerHTML = html;
            this.attachPaginationEvents(paginationId, onPageChange, totalPages);
        }
        
        return html;
    }
    
    generatePagePickerPages(currentPage, totalPages, paginationId) {
        const pages = [];
        const maxVisible = 10; // Show up to 10 pages in picker
        
        if (totalPages <= maxVisible) {
            // Show all pages
            for (let i = 1; i <= totalPages; i++) {
                pages.push(`<button class="picker-page ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`);
            }
        } else {
            // Show smart range around current page
            let start = Math.max(1, currentPage - 4);
            let end = Math.min(totalPages, currentPage + 4);
            
            // Adjust if we're near the beginning or end
            if (start === 1) {
                end = Math.min(totalPages, start + maxVisible - 1);
            } else if (end === totalPages) {
                start = Math.max(1, end - maxVisible + 1);
            }
            
            // Add first page if not in range
            if (start > 1) {
                pages.push(`<button class="picker-page" data-page="1">1</button>`);
                if (start > 2) {
                    pages.push(`<span class="picker-ellipsis">...</span>`);
                }
            }
            
            // Add pages in range
            for (let i = start; i <= end; i++) {
                pages.push(`<button class="picker-page ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`);
            }
            
            // Add last page if not in range
            if (end < totalPages) {
                if (end < totalPages - 1) {
                    pages.push(`<span class="picker-ellipsis">...</span>`);
                }
                pages.push(`<button class="picker-page" data-page="${totalPages}">${totalPages}</button>`);
            }
        }
        
        return pages.join('');
    }
    
    attachPaginationEvents(paginationId, onPageChange, totalPages) {
        const pagination = document.getElementById(paginationId);
        if (!pagination) return;
        
        const currentBtn = pagination.querySelector('.pagination-current');
        const picker = pagination.querySelector('.pagination-picker');
        const prevBtn = pagination.querySelector('[data-action="prev"]');
        const nextBtn = pagination.querySelector('[data-action="next"]');
        
        // Show/hide picker on hover
        let hoverTimeout;
        
        currentBtn.addEventListener('mouseenter', () => {
            clearTimeout(hoverTimeout);
            picker.style.display = 'block';
            setTimeout(() => picker.classList.add('visible'), 10);
        });
        
        pagination.addEventListener('mouseleave', () => {
            hoverTimeout = setTimeout(() => {
                picker.classList.remove('visible');
                setTimeout(() => picker.style.display = 'none', 200);
            }, 100);
        });
        
        // Page selection in picker
        picker.addEventListener('click', (e) => {
            const pageBtn = e.target.closest('.picker-page');
            if (pageBtn) {
                const page = parseInt(pageBtn.dataset.page);
                if (page && page !== parseInt(currentBtn.textContent)) {
                    onPageChange(page);
                }
            }
        });
        
        // Prev/Next buttons
        prevBtn.addEventListener('click', () => {
            const current = parseInt(currentBtn.textContent);
            if (current > 1) {
                onPageChange(current - 1);
            }
        });
        
        nextBtn.addEventListener('click', () => {
            const current = parseInt(currentBtn.textContent);
            if (current < totalPages) {
                onPageChange(current + 1);
            }
        });
    }

    showProgressToast(message, total, current = 0) {
        // Progress toast notification with circular progress indicator
        const toast = document.createElement('div');
        toast.className = 'toast progress-toast';
        toast.style.cssText = `
            position: fixed;
            top: 90px;
            right: 25px;
            background: var(--grey-800);
            color: var(--text-inverse);
            padding: 16px 20px;
            border-radius: var(--border-radius);
            box-shadow: var(--shadow-lg);
            z-index: 10000;
            font-size: 0.875rem;
            opacity: 0;
            transform: translateY(-10px);
            transition: all 0.3s ease;
            min-width: 200px;
            display: flex;
            align-items: center;
            gap: 12px;
        `;
        
        // Create progress circle
        const progressCircle = document.createElement('div');
        progressCircle.style.cssText = `
            width: 20px;
            height: 20px;
            border-radius: 50%;
            border: 2px solid var(--grey-600);
            border-top: 2px solid var(--orange-subtle);
            animation: spin 1s linear infinite;
            flex-shrink: 0;
        `;
        
        // Create text container
        const textContainer = document.createElement('div');
        textContainer.style.cssText = `
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;
        `;
        
        const messageEl = document.createElement('div');
        messageEl.textContent = message;
        messageEl.style.cssText = `
            font-weight: 500;
        `;
        
        const progressText = document.createElement('div');
        progressText.style.cssText = `
            font-size: 0.75rem;
            color: var(--text-muted);
        `;
        
        textContainer.appendChild(messageEl);
        textContainer.appendChild(progressText);
        
        toast.appendChild(progressCircle);
        toast.appendChild(textContainer);
        
        // Add CSS animation if not already present
        if (!document.querySelector('#progress-toast-styles')) {
            const style = document.createElement('style');
            style.id = 'progress-toast-styles';
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(toast);
        
        // Animate in
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        }, 100);
        
        // Update progress function
        const updateProgress = (current, total) => {
            const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
            progressText.textContent = `${current} of ${total} (${percentage}%)`;
        };
        
        // Initial progress
        updateProgress(current, total);
        
        // Return update function and cleanup function
        return {
            update: (newCurrent, newTotal = total) => {
                updateProgress(newCurrent, newTotal);
            },
            complete: (successMessage) => {
                // Replace progress circle with checkmark
                progressCircle.style.cssText = `
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: var(--green-subtle);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                `;
                progressCircle.innerHTML = `
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20,6 9,17 4,12"></polyline>
                    </svg>
                `;
                
                if (successMessage) {
                    messageEl.textContent = successMessage;
                }
                progressText.textContent = 'Complete';
                
                // Remove after 2 seconds
                setTimeout(() => {
                    toast.style.opacity = '0';
                    toast.style.transform = 'translateY(-10px)';
                    setTimeout(() => {
                        if (toast.parentNode) {
                            document.body.removeChild(toast);
                        }
                    }, 300);
                }, 2000);
            },
            error: (errorMessage) => {
                // Replace progress circle with error icon
                progressCircle.style.cssText = `
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: var(--red-subtle);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                `;
                progressCircle.innerHTML = `
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                `;
                
                if (errorMessage) {
                    messageEl.textContent = errorMessage;
                }
                progressText.textContent = 'Failed';
                
                // Remove after 3 seconds
                setTimeout(() => {
                    toast.style.opacity = '0';
                    toast.style.transform = 'translateY(-10px)';
                    setTimeout(() => {
                        if (toast.parentNode) {
                            document.body.removeChild(toast);
                        }
                    }, 300);
                }, 3000);
            }
        };
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
        const mainContentEl = document.querySelector('.main-content');
        
        // Show/hide widget panel based on page
        if (pageName === 'settings') {
            if (widgetPanel) {
                widgetPanel.style.display = 'none';
                widgetPanel.classList.remove('is-visible');
            }
            if (mainContentEl) {
                mainContentEl.style.flex = '1';
                // Remove flag so CSS fallback doesn't reserve space
                mainContentEl.classList.remove('has-widget-panel');
            }
        } else {
            if (widgetPanel) {
                widgetPanel.style.display = 'block';
                widgetPanel.classList.add('is-visible');
            }
            if (mainContentEl) {
                mainContentEl.style.flex = '3';
                // Add flag so CSS fallback can adjust #lists-grid margin
                mainContentEl.classList.add('has-widget-panel');
            }
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

        // Top bar: Scripts button -> navigate to Call Scripts page
        const scriptsBtn = document.getElementById('scripts-btn');
        if (scriptsBtn) {
            scriptsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateToPage('call-scripts');
            });
        }
    }

    handleQuickAction(action) {
        switch(action) {
            case 'Add Contact':
                this.showModal('add-contact');
                break;
            case 'Add Account':
                // Capture current page state before opening modal for back button navigation
                this.captureCurrentPageState();
                this.showModal('add-account');
                break;
            case 'Bulk Import CSV':
                this.createBulkImportModal();
                break;
            default:
                this.showToast(`${action} clicked`);
        }
    }

    captureCurrentPageState() {
        // Capture current page state for back button navigation from Quick Actions
        try {
            const currentPage = this.currentPage;
            let pageState = {
                page: currentPage,
                scroll: window.scrollY || (document.documentElement && document.documentElement.scrollTop) || 0,
                searchTerm: '',
                sortColumn: '',
                sortDirection: '',
                selectedItems: []
            };

            // Try to capture page-specific state based on current page
            if (currentPage === 'accounts') {
                const quickSearch = document.getElementById('accounts-quick-search');
                if (quickSearch) pageState.searchTerm = quickSearch.value;
                
                // Try to get accounts page state if available
                if (window.accountsModule && window.accountsModule.state) {
                    const state = window.accountsModule.state;
                    pageState.sortColumn = state.sortColumn || '';
                    pageState.sortDirection = state.sortDirection || '';
                    pageState.selectedItems = Array.from(state.selected || []);
                }
            } else if (currentPage === 'people') {
                const quickSearch = document.getElementById('people-quick-search');
                if (quickSearch) pageState.searchTerm = quickSearch.value;
                
                // Try to get people page state if available
                if (window.peopleModule && window.peopleModule.state) {
                    const state = window.peopleModule.state;
                    pageState.sortColumn = state.sortColumn || '';
                    pageState.sortDirection = state.sortDirection || '';
                    pageState.selectedItems = Array.from(state.selected || []);
                }
            } else if (currentPage === 'calls') {
                const quickSearch = document.getElementById('calls-quick-search');
                if (quickSearch) pageState.searchTerm = quickSearch.value;
                
                // Try to get calls page state if available
                if (window.callsModule && window.callsModule.state) {
                    const state = window.callsModule.state;
                    pageState.sortColumn = state.sortColumn || '';
                    pageState.sortDirection = state.sortDirection || '';
                    pageState.selectedItems = Array.from(state.selected || []);
                }
            }

            // Store the captured state for use in account creation
            window._addAccountReturn = pageState;
            console.log('[Quick Actions] Captured page state for Add Account:', pageState);
        } catch (e) {
            console.error('Failed to capture current page state:', e);
            // Fallback to basic state
            window._addAccountReturn = {
                page: this.currentPage || 'accounts',
                scroll: 0,
                searchTerm: '',
                sortColumn: '',
                sortDirection: '',
                selectedItems: []
            };
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
                    row.push(this.cleanCSVField(field.trim()));
                    field = '';
                } else if (char === '\n') {
                    // Line Feed ends record
                    row.push(this.cleanCSVField(field.trim()));
                    field = '';
                    // Skip potential preceding CR already handled below
                    records.push(row);
                    row = [];
                } else if (char === '\r') {
                    // Carriage Return may be part of CRLF; treat as end of record
                    // Push field and row, then skip a following \n if present
                    row.push(this.cleanCSVField(field.trim()));
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
            row.push(this.cleanCSVField(field.trim()));
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

    cleanCSVField(field) {
        if (!field) return field;
        
        // Remove leading apostrophe (common CSV issue)
        if (field.startsWith("'")) {
            field = field.slice(1);
        }
        
        // Remove Excel formula wrappers
        field = field.replace(/^=\s*["']?(.+?)["']?$/u, '$1');
        
        // Remove invisible characters
        field = field.replace(/[\u200B-\u200D\uFEFF]/g, '');
        
        return field;
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
        
        // Populate list assignment dropdown
        this.populateListAssignment(modal);
    }

    async populateListAssignment(modal) {
        const listSelect = modal.querySelector('#csv-assign-list');
        if (!listSelect) return;
        
        // Clear existing options except the first one
        listSelect.innerHTML = '<option value="">No list assignment</option>';
        
        try {
            const db = window.firebaseDB;
            if (!db) return;
            
            const importType = modal._importType || 'contacts';
            const listKind = importType === 'accounts' ? 'accounts' : 'people';
            
            // Load lists of the appropriate kind
            let query = db.collection('lists');
            if (query.where) {
                query = query.where('kind', '==', listKind);
            }
            const snap = await (query.limit ? query.limit(200).get() : query.get());
            const lists = (snap && snap.docs) ? snap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
            
            // Sort by name
            lists.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            
            // Add list options
            lists.forEach(list => {
                const option = document.createElement('option');
                option.value = list.id;
                option.textContent = list.name || 'Unnamed List';
                listSelect.appendChild(option);
            });
            
        } catch (error) {
            console.error('Failed to load lists for assignment:', error);
        }
    }

    async assignToList(db, recordId, modal) {
        const listSelect = modal.querySelector('#csv-assign-list');
        if (!listSelect || !listSelect.value) return;
        
        const listId = listSelect.value;
        if (!listId) return;
        
        try {
            const importType = modal._importType || 'contacts';
            const targetType = importType === 'accounts' ? 'accounts' : 'people';
            
            // Check if already in list to avoid duplicates
            const existingQuery = await db.collection('listMembers')
                .where('listId', '==', listId)
                .where('targetId', '==', recordId)
                .where('targetType', '==', targetType)
                .limit(1)
                .get();
            
            if (existingQuery.empty) {
                // Add to list
                await db.collection('listMembers').add({
                    listId: listId,
                    targetId: recordId,
                    targetType: targetType,
                    addedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || Date.now()
                });
            }
        } catch (error) {
            console.error('Failed to assign record to list:', error);
        }
    }

    getCRMFields(importType) {
        if (importType === 'accounts') {
            return [
                { value: 'accountName', label: 'Account Name' },
                { value: 'industry', label: 'Industry' },
                { value: 'website', label: 'Website' },
                { value: 'companyPhone', label: 'Company Phone' },
                { value: 'city', label: 'City' },
                { value: 'state', label: 'State' },
                { value: 'squareFootage', label: 'SQ FT' },
                { value: 'occupancyPct', label: 'Occupancy %' },
                { value: 'employees', label: 'Employees' },
                { value: 'shortDescription', label: 'Short Description' },
                { value: 'electricitySupplier', label: 'Electricity Supplier' },
                { value: 'contractEndDate', label: 'Contract End Date' },
                { value: 'benefits', label: 'Benefits' },
                { value: 'painPoints', label: 'Pain Points' },
                { value: 'linkedin', label: 'LinkedIn URL' },
                { value: 'logoUrl', label: 'Icon URL (Logo/Favicon)' }
            ];
        } else {
            return [
                // Contact Fields
                { value: 'firstName', label: 'First Name' },
                { value: 'lastName', label: 'Last Name' },
                { value: 'email', label: 'Email' },
                { value: 'emailStatus', label: 'Email Status' },
                { value: 'workDirectPhone', label: 'Work Direct Phone' },
                { value: 'mobile', label: 'Mobile Phone' },
                { value: 'otherPhone', label: 'Other Phone' },
                { value: 'title', label: 'Job Title' },
                { value: 'seniority', label: 'Seniority' },
                { value: 'department', label: 'Department' },
                { value: 'linkedin', label: 'Contact LinkedIn URL' },
                { value: 'city', label: 'City' },
                { value: 'state', label: 'State' },
                { value: 'companyName', label: 'Company Name' },
                // Company/Account Fields (will update associated account)
                { value: 'companyWebsite', label: 'Company Website' },
                { value: 'companyLinkedin', label: 'Company LinkedIn URL' },
                { value: 'companyCity', label: 'Company City' },
                { value: 'companyState', label: 'Company State' },
                { value: 'companyPhone', label: 'Company Phone' },
                { value: 'companyEmployees', label: 'Company Employees' },
                { value: 'companyIndustry', label: 'Company Industry' },
                { value: 'companySquareFootage', label: 'Company SQ FT' },
                { value: 'companyOccupancyPct', label: 'Company Occupancy %' },
                { value: 'companyElectricitySupplier', label: 'Company Electricity Supplier' },
                { value: 'companyShortDescription', label: 'Company Short Description' }
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
            'website': 'companyWebsite',
            'url': 'companyWebsite',
            'industry': 'companyIndustry',
            'sqft': 'companySquareFootage',
            'squarefootage': 'companySquareFootage',
            'occupancy': 'companyOccupancyPct',
            'electricity': 'companyElectricitySupplier',
            'supplier': 'companyElectricitySupplier',
            'description': 'companyShortDescription',
            'employees': 'companyEmployees',
            'phone': 'companyPhone',
            'linkedin': 'companyLinkedin'
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
        
        // Get selected list info
        const listSelect = modal.querySelector('#csv-assign-list');
        const selectedListName = listSelect && listSelect.value ? 
            (listSelect.selectedOptions[0]?.textContent || 'Unknown List') : 
            'No list assignment';
        
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
            <div class="summary-item">
                <div class="summary-value">${selectedListName}</div>
                <div class="summary-label">List Assignment</div>
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
        // Queue possible merges for end-of-import confirmation
        const queuedContactMerges = [];
        const queuedAccountMerges = [];
        
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

                        // Derive domain from website fields post-mapping (accounts import)
                        try {
                            if (modal._importType === 'accounts') {
                                if (doc.website && !doc.domain) {
                                    const src = String(doc.website).trim();
                                    try {
                                        const u = new URL(src.startsWith('http') ? src : `https://${src}`);
                                        doc.domain = (u.hostname || '').replace(/^www\./i, '');
                                    } catch (_) {
                                        doc.domain = src.replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./i, '');
                                    }
                                }
                            }
                        } catch (_) { /* noop */ }
                        
                        // Skip if no data
                        if (Object.keys(doc).length === 0) return;
                        
                        // Check for existing record if update is enabled
                        let existingRecord = null;
                        let mergeAction = 'create'; // 'create', 'merge', 'skip'
                        
                        if (updateExisting && modal._importType === 'contacts') {
                            // For contacts, use intelligent duplicate detection
                            if (window.ContactMerger) {
                                // Get all existing contacts for comparison
                                const allContactsQuery = await db.collection('contacts').get();
                                const existingContacts = allContactsQuery.docs.map(doc => ({
                                    id: doc.id,
                                    ...doc.data()
                                }));
                                
                                const duplicates = await window.ContactMerger.findDuplicates(doc, existingContacts);
                                
                                if (duplicates.length > 0) {
                                    const bestMatch = duplicates[0];
                                    if (bestMatch.similarity.score >= 0.8) {
                                        // Queue merge; defer user decision to end-of-import summary
                                        existingRecord = { 
                                            ref: db.collection('contacts').doc(bestMatch.contact.id),
                                            data: () => bestMatch.contact
                                        };
                                        queuedContactMerges.push({ existingRecord, incoming: doc, similarity: bestMatch.similarity });
                                        // Skip immediate update for this row
                                        return;
                                    }
                                }
                            }
                        } else if (updateExisting && modal._importType === 'accounts') {
                            // For accounts, use simple email/name matching
                            const matchField = 'accountName';
                            if (doc[matchField]) {
                                const query = await db.collection(collection)
                                    .where(matchField, '==', doc[matchField])
                                    .limit(1)
                                    .get();
                                
                                if (!query.empty) {
                                    existingRecord = query.docs[0];
                                    // Queue merge for end-of-import confirmation instead of immediate update
                                    queuedAccountMerges.push({ existingRecord, incoming: doc });
                                    // Skip immediate update for this row
                                    return;
                                }
                            }
                        }
                        
                        const now = fv?.serverTimestamp?.() || Date.now();
                        
                        if (existingRecord) {
                            // Update existing record
                            let updateData = doc;
                            
                            if (mergeAction === 'merge' && window.ContactMerger) {
                                // Use intelligent merging
                                const existingData = existingRecord.data();
                                updateData = window.ContactMerger.mergeContacts(existingData, doc);
                            }
                            // Always stamp updated/enriched times for DB
                            updateData.updatedAt = now;
                            updateData.enrichedAt = now;
                            
                            await existingRecord.ref.update(updateData);
                            enriched++;

                            // Assign to list if selected
                            await this.assignToList(db, existingRecord.id, modal);

                            // Live update tables (use UI-friendly timestamps)
                            try {
                                if (modal._importType === 'accounts') {
                                    // Accounts module listens to pc:account-created; send merged full doc so row renders correctly
                                    const prev = (typeof existingRecord.data === 'function') ? existingRecord.data() : {};
                                    const merged = Object.assign({}, prev, doc);
                                    document.dispatchEvent(new CustomEvent('pc:account-created', { detail: { id: existingRecord.id, doc: merged } }));
                                } else {
                                    // People module listens to pc:contact-updated with { changes }
                                    const uiChanges = Object.assign({}, doc, { updatedAt: new Date() });
                                    document.dispatchEvent(new CustomEvent('pc:contact-updated', { detail: { id: existingRecord.id, changes: uiChanges } }));
                                }
                            } catch (_) { /* noop */ }
                        } else {
                            // Create new record
                            doc.createdAt = now;
                            doc.updatedAt = now;
                            doc.importedAt = now;
                            
                            // For contacts, check if we need to create/update an account
                            if (modal._importType === 'contacts' && doc.companyName) {
                                await this.handleAccountCreationForContact(db, doc, now);
                            }
                            
                            const ref = await db.collection(collection).add(doc);
                            imported++;

                            // Assign to list if selected
                            await this.assignToList(db, ref.id, modal);

                            // Live update tables (use UI-friendly timestamps so lists don't show N/A)
                            try {
                                if (modal._importType === 'accounts') {
                                    document.dispatchEvent(new CustomEvent('pc:account-created', { detail: { id: ref.id, doc } }));
                                } else {
                                    const uiDoc = Object.assign({}, doc, { createdAt: new Date(), updatedAt: new Date() });
                                    document.dispatchEvent(new CustomEvent('pc:contact-created', { detail: { id: ref.id, doc: uiDoc } }));
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
            
            // If we queued merges, present a summary and ask once to proceed
            let userApprovedQueuedMerges = true;
            try {
                const totalQueued = queuedContactMerges.length + queuedAccountMerges.length;
                if (totalQueued > 0) {
                    userApprovedQueuedMerges = await this.showQueuedMergeSummaryModal({
                        contacts: queuedContactMerges,
                        accounts: queuedAccountMerges,
                        importType: modal._importType
                    });
                }
            } catch(_) {}

            // Apply queued merges if approved
            if (userApprovedQueuedMerges) {
                for (const item of queuedAccountMerges) {
                    try {
                        const prev = (typeof item.existingRecord.data === 'function') ? item.existingRecord.data() : {};
                        const updateData = Object.assign({}, prev);
                        Object.keys(item.incoming || {}).forEach(k => {
                            const v = item.incoming[k];
                            if (v !== undefined && v !== null && String(v).trim() !== '') updateData[k] = v;
                        });
                        updateData.updatedAt = window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || Date.now();
                        updateData.enrichedAt = updateData.updatedAt;
                        await item.existingRecord.ref.update(updateData);
                        enriched++;
                        // Notify UI
                        try {
                            document.dispatchEvent(new CustomEvent('pc:account-created', { detail: { id: item.existingRecord.id, doc: Object.assign({}, updateData) } }));
                        } catch(_) {}
                    } catch(e) { failed++; }
                }
                for (const item of queuedContactMerges) {
                    try {
                        const prev = (typeof item.existingRecord.data === 'function') ? item.existingRecord.data() : {};
                        const updateData = window.ContactMerger ? window.ContactMerger.mergeContacts(prev, item.incoming) : Object.assign({}, prev, item.incoming);
                        updateData.updatedAt = window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || Date.now();
                        updateData.enrichedAt = updateData.updatedAt;
                        await item.existingRecord.ref.update(updateData);
                        enriched++;
                        // Notify UI
                        try {
                            const uiChanges = Object.assign({}, updateData, { updatedAt: new Date() });
                            document.dispatchEvent(new CustomEvent('pc:contact-updated', { detail: { id: item.existingRecord.id, changes: uiChanges } }));
                        } catch(_) {}
                    } catch(e) { failed++; }
                }
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

    // Display a one-time confirmation modal summarizing all queued merges for this import
    showQueuedMergeSummaryModal({ contacts = [], accounts = [] } = {}) {
        return new Promise((resolve) => {
            try {
                const total = contacts.length + accounts.length;
                if (total === 0) return resolve(true);
                const overlay = document.createElement('div');
                overlay.className = 'pc-modal';
                overlay.innerHTML = `
                  <div class="pc-modal__backdrop" data-close="queued-merge"></div>
                  <div class="pc-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="merge-batch-title">
                    <div class="pc-modal__header">
                      <h3 id="merge-batch-title">Review potential merges</h3>
                      <button class="pc-modal__close" data-close="queued-merge" aria-label="Close">×</button>
                    </div>
                    <div class="pc-modal__body" style="max-height:60vh;overflow:auto;">
                      <p>${total} existing records look similar and can be enriched instead of creating duplicates.</p>
                      ${accounts.length ? `<h4>Accounts (${accounts.length})</h4>` : ''}
                      ${accounts.slice(0, 10).map(it => {
                        const prev = (typeof it.existingRecord.data === 'function') ? it.existingRecord.data() : {};
                        const fields = Object.keys(it.incoming||{}).filter(k => (it.incoming[k] != null && String(it.incoming[k]).trim() !== '' && String(it.incoming[k]) !== String(prev[k]||''))).slice(0,6);
                        return `<div class="merge-row"><strong>${this.escapeHtml(prev.accountName || '')}</strong> → enrich fields: ${fields.map(f=>`<code>${this.escapeHtml(f)}</code>`).join(', ') || '—'}</div>`;
                      }).join('')}
                      ${contacts.length ? `<h4 style="margin-top:12px;">Contacts (${contacts.length})</h4>` : ''}
                      ${contacts.slice(0, 10).map(it => {
                        const prev = (typeof it.existingRecord.data === 'function') ? it.existingRecord.data() : {};
                        const fields = Object.keys(it.incoming||{}).filter(k => (it.incoming[k] != null && String(it.incoming[k]).trim() !== '' && String(it.incoming[k]) !== String(prev[k]||''))).slice(0,6);
                        const name = `${prev.firstName||''} ${prev.lastName||''}`.trim();
                        return `<div class="merge-row"><strong>${this.escapeHtml(name||prev.email||'Existing contact')}</strong> → enrich fields: ${fields.map(f=>`<code>${this.escapeHtml(f)}</code>`).join(', ') || '—'}</div>`;
                      }).join('')}
                      ${total>10?`<div style="margin-top:8px;color:var(--text-secondary)">(+${total-10} more hidden)</div>`:''}
                    </div>
                    <div class="pc-modal__footer" style="display:flex;gap:8px;justify-content:flex-end;">
                      <button type="button" class="btn-secondary" data-action="cancel">Cancel</button>
                      <button type="button" class="btn-primary" data-action="enrich">Enrich</button>
                    </div>
                  </div>`;
                document.body.appendChild(overlay);
                const close = (val) => { try { overlay.parentNode && overlay.parentNode.removeChild(overlay); } catch(_) {}; resolve(val); };
                overlay.querySelectorAll('[data-close="queued-merge"]').forEach(btn => btn.addEventListener('click', () => close(false)));
                overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => close(false));
                overlay.querySelector('[data-action="enrich"]').addEventListener('click', () => close(true));
            } catch(_) { resolve(true); }
        });
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
            
            // Always remove leading apostrophe if present (common CSV issue)
            if (v.startsWith("'")) {
                v = v.slice(1);
            }
            
            // Remove Excel formula wrappers
            v = v.replace(/^=\s*["']?(.+?)["']?$/u, '$1');
            
            // Remove invisible characters
            v = v.replace(/[\u200B-\u200D\uFEFF]/g, '');
            
            return v;
        } catch (_) {
            return value;
        }
    }

    // Normalize specific CRM field values
    normalizeForField(field, value) {
        try {
            if (!field) return value;
            const f = String(field).toLowerCase();
            // Normalize any field that is clearly a phone number
            // Examples: phone, primaryPhone, mainPhone, workDirectPhone, mobile, otherPhone, companyPhone
            if (f.includes('phone') || f === 'mobile') {
                return this.normalizePhone(value);
            }
            // Normalize website-looking fields (trim, unwrap common CSV wrappers)
            if (f === 'website' || f === 'companywebsite') {
                let v = String(value == null ? '' : value).trim();
                if (!v) return '';
                // Remove Excel formula-style wrappers
                v = v.replace(/^=\s*["']?(.+?)["']?$/u, '$1').trim();
                return v;
            }
            return value;
        } catch (_) {
            return value;
        }
    }

    async handleAccountCreationForContact(db, contactDoc, timestamp) {
        try {
            const companyName = contactDoc.companyName;
            if (!companyName) return;

            // Check if account already exists
            const existingAccountQuery = await db.collection('accounts')
                .where('accountName', '==', companyName)
                .limit(1)
                .get();

            let accountId;
            if (!existingAccountQuery.empty) {
                // Account exists, update it with any new company fields
                const existingAccount = existingAccountQuery.docs[0];
                accountId = existingAccount.id;
                
                const updateData = {};
                if (contactDoc.companyIndustry && !existingAccount.data().industry) {
                    updateData.industry = contactDoc.companyIndustry;
                }
                if (contactDoc.companyWebsite && !existingAccount.data().website) {
                    updateData.website = contactDoc.companyWebsite;
                }
                if (contactDoc.companyLinkedin && !existingAccount.data().linkedin) {
                    updateData.linkedin = contactDoc.companyLinkedin;
                }
                if (contactDoc.companyCity && !existingAccount.data().city) {
                    updateData.city = contactDoc.companyCity;
                }
                if (contactDoc.companyState && !existingAccount.data().state) {
                    updateData.state = contactDoc.companyState;
                }
                if (contactDoc.companyPhone && !existingAccount.data().companyPhone) {
                    updateData.companyPhone = contactDoc.companyPhone;
                }
                if (contactDoc.companyEmployees && !existingAccount.data().employees) {
                    updateData.employees = contactDoc.companyEmployees;
                }
                if (contactDoc.companySquareFootage && !existingAccount.data().squareFootage) {
                    updateData.squareFootage = contactDoc.companySquareFootage;
                }
                if (contactDoc.companyOccupancyPct && !existingAccount.data().occupancyPct) {
                    updateData.occupancyPct = contactDoc.companyOccupancyPct;
                }
                if (contactDoc.companyElectricitySupplier && !existingAccount.data().electricitySupplier) {
                    updateData.electricitySupplier = contactDoc.companyElectricitySupplier;
                }
                if (contactDoc.companyShortDescription && !existingAccount.data().shortDescription) {
                    updateData.shortDescription = contactDoc.companyShortDescription;
                }

                if (Object.keys(updateData).length > 0) {
                    updateData.updatedAt = timestamp;
                    await existingAccount.ref.update(updateData);
                }
            } else {
                // Create new account
                const accountData = {
                    accountName: companyName,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                    importedAt: timestamp
                };

                // Add company fields if they exist in the contact
                if (contactDoc.companyIndustry) accountData.industry = contactDoc.companyIndustry;
                if (contactDoc.companyWebsite) accountData.website = contactDoc.companyWebsite;
                if (contactDoc.companyLinkedin) accountData.linkedin = contactDoc.companyLinkedin;
                if (contactDoc.companyCity) accountData.city = contactDoc.companyCity;
                if (contactDoc.companyState) accountData.state = contactDoc.companyState;
                if (contactDoc.companyPhone) accountData.companyPhone = contactDoc.companyPhone;
                if (contactDoc.companyEmployees) accountData.employees = contactDoc.companyEmployees;
                if (contactDoc.companySquareFootage) accountData.squareFootage = contactDoc.companySquareFootage;
                if (contactDoc.companyOccupancyPct) accountData.occupancyPct = contactDoc.companyOccupancyPct;
                if (contactDoc.companyElectricitySupplier) accountData.electricitySupplier = contactDoc.companyElectricitySupplier;
                if (contactDoc.companyShortDescription) accountData.shortDescription = contactDoc.companyShortDescription;

                const accountRef = await db.collection('accounts').add(accountData);
                accountId = accountRef.id;
            }

            // Link the contact to the account
            contactDoc.accountId = accountId;
        } catch (error) {
            console.error('Error handling account creation for contact:', error);
        }
    }

    // Normalize phone numbers imported from CSV
    // - Remove Excel leading apostrophe prefix '123...
    // - Unwrap Excel formula-like wrappers ="+1 234..." => +1 234...
    // - Strip zero-width/invisible characters
    // - Format as +1XXXXXXXXXX for US numbers
    normalizePhone(value) {
        try {
            let v = String(value == null ? '' : value).trim();
            // Remove a single leading apostrophe used by spreadsheets
            if (v.startsWith("'")) v = v.slice(1);
            // Unwrap ="..." or = '...' pattern some CSVs contain
            v = v.replace(/^=\s*["']?(.+?)["']?$/u, '$1');
            // Remove zero-width spaces and BOM
            v = v.replace(/[\u200B-\u200D\uFEFF]/g, '');
            v = v.trim();
            
            if (!v) return '';
            
            // If already in +<digits> form, keep plus and digits only
            if (/^\+/.test(v)) {
                const cleaned = '+' + v.replace(/[^\d]/g, '');
                return cleaned;
            }
            
            const digits = v.replace(/[^\d]/g, '');
            if (!digits) return '';
            
            // US default. If 11 and starts with 1, or exactly 10, format as +1XXXXXXXXXX
            if (digits.length === 11 && digits.startsWith('1')) {
                return '+' + digits;
            } else if (digits.length === 10) {
                return '+1' + digits;
            }
            
            // For other lengths, just return the digits with + prefix
            return '+' + digits;
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

    async loadTodaysTasks() {
        const tasksList = document.querySelector('.tasks-list');
        if (!tasksList) return;

        // Helpers (scoped to this method)
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

        // Today's local midnight
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Load tasks from both localStorage and Firebase
        let localTasks = [];
        try {
            localTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
        } catch (_) { localTasks = []; }

        let firebaseTasks = [];
        try {
            if (window.firebaseDB) {
                const snapshot = await window.firebaseDB.collection('tasks')
                    .orderBy('timestamp', 'desc')
                    .limit(200)
                    .get();
                firebaseTasks = snapshot.docs.map(doc => {
                    const data = doc.data() || {};
                    const createdAt = data.createdAt || (data.timestamp && typeof data.timestamp.toDate === 'function' ? data.timestamp.toDate().getTime() : data.timestamp) || Date.now();
                    // Prefer the embedded id saved at creation time so it matches localStorage for dedupe
                    return { ...data, id: (data.id || doc.id), createdAt, status: data.status || 'pending' };
                });
            }
        } catch (e) {
            console.warn("Could not load tasks from Firebase for Today's Tasks widget:", e);
        }

        // Merge and dedupe by task id (local tasks take precedence)
        const allTasksMap = new Map();
        localTasks.forEach(t => { if (t && t.id) allTasksMap.set(t.id, t); });
        firebaseTasks.forEach(t => { if (t && t.id && !allTasksMap.has(t.id)) allTasksMap.set(t.id, t); });
        const allTasks = Array.from(allTasksMap.values());

        // Filter to today's and overdue pending tasks
        let todaysTasks = allTasks.filter(task => {
            if ((task.status || 'pending') !== 'pending') return false;
            const d = parseDateStrict(task.dueDate);
            if (!d) return false;
            return d.getTime() <= today.getTime();
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

            // Final tiebreaker: creation time (oldest first to keep stability)
            return (a.createdAt || 0) - (b.createdAt || 0);
        });

        // Initialize pagination state if not exists
        if (!this.todaysTasksPagination) {
            this.todaysTasksPagination = {
                currentPage: 1,
                pageSize: 3,
                totalTasks: todaysTasks.length
            };
        }

        // Update total tasks count
        this.todaysTasksPagination.totalTasks = todaysTasks.length;
        this.todaysTasksPagination.currentPage = Math.min(this.todaysTasksPagination.currentPage, Math.ceil(todaysTasks.length / this.todaysTasksPagination.pageSize) || 1);

        // Get tasks for current page
        const startIndex = (this.todaysTasksPagination.currentPage - 1) * this.todaysTasksPagination.pageSize;
        const endIndex = startIndex + this.todaysTasksPagination.pageSize;
        const pageTasks = todaysTasks.slice(startIndex, endIndex);

        // Generate HTML for tasks
        let tasksHtml = '';
        if (pageTasks.length === 0) {
            tasksHtml = `
                <div class="task-item empty-state">
                    <div class="task-info">
                        <div class="task-name">No tasks for today</div>
                        <div class="task-time">You're all caught up!</div>
                    </div>
                </div>
            `;
        } else {
            tasksHtml = pageTasks.map(task => {
                const timeText = this.getTaskTimeText(task);
                return `
                    <div class="task-item" data-task-id="${task.id}" style="cursor: pointer;">
                        <div class="task-info">
                            <div class="task-name" style="color: var(--grey-400); font-weight: 400; transition: var(--transition-fast);">${this.escapeHtml(task.title)}</div>
                            <div class="task-time">${timeText}</div>
                        </div>
                        <span class="priority-badge ${task.priority}">${task.priority}</span>
                    </div>
                `;
            }).join('');
        }

        // Add pagination if needed
        const totalPages = Math.ceil(todaysTasks.length / this.todaysTasksPagination.pageSize);
        if (totalPages > 1) {
            tasksHtml += `
                <div class="tasks-pagination">
                    <button class="pagination-btn prev-btn" ${this.todaysTasksPagination.currentPage === 1 ? 'disabled' : ''} data-action="prev">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="15,18 9,12 15,6"></polyline>
                        </svg>
                    </button>
                    <div class="pagination-current">${this.todaysTasksPagination.currentPage}</div>
                    <button class="pagination-btn next-btn" ${this.todaysTasksPagination.currentPage === totalPages ? 'disabled' : ''} data-action="next">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9,18 15,12 9,6"></polyline>
                        </svg>
                    </button>
                </div>
            `;
        }

        tasksList.innerHTML = tasksHtml;

        // Attach task click event listeners
        tasksList.querySelectorAll('.task-item[data-task-id]').forEach(taskItem => {
            taskItem.addEventListener('click', (e) => {
                e.preventDefault();
                const taskId = taskItem.getAttribute('data-task-id');
                if (taskId && window.TaskDetail && typeof window.TaskDetail.open === 'function') {
                    window.TaskDetail.open(taskId, 'dashboard');
                }
            });
            
            // Add hover effects
            const taskName = taskItem.querySelector('.task-name');
            if (taskName) {
                taskItem.addEventListener('mouseenter', () => {
                    taskName.style.color = 'var(--text-inverse)';
                });
                taskItem.addEventListener('mouseleave', () => {
                    taskName.style.color = 'var(--grey-400)';
                });
            }
        });

        // Attach pagination event listeners
        tasksList.querySelectorAll('.pagination-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const action = btn.getAttribute('data-action');
                if (action === 'prev' && this.todaysTasksPagination.currentPage > 1) {
                    this.todaysTasksPagination.currentPage--;
                    this.loadTodaysTasks();
                } else if (action === 'next' && this.todaysTasksPagination.currentPage < totalPages) {
                    this.todaysTasksPagination.currentPage++;
                    this.loadTodaysTasks();
                }
            });
        });
    }

    getTaskTimeText(task) {
        const today = new Date();
        const due = new Date(task.dueDate);
        const diffTime = due - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let timeText = '';
        if (diffDays === 0) {
            timeText = 'Due today';
        } else if (diffDays === 1) {
            timeText = 'Due tomorrow';
        } else if (diffDays > 1) {
            timeText = `Due in ${diffDays} days`;
        } else {
            timeText = 'Overdue';
        }

        // Add time if available
        if (task.dueTime) {
            // Format time (assuming it's in HH:MM format)
            const time = task.dueTime;
            timeText += ` at ${time}`;
        }

        return timeText;
    }

    escapeHtml(str) {
        if (window.escapeHtml) return window.escapeHtml(str);
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Shared task title builder with descriptive format
    buildTaskTitle(type, contactName, accountName = '') {
        const name = contactName || accountName || 'contact';
        
        const typeMap = {
            'phone-call': 'Call',
            'manual-email': 'Email',
            'auto-email': 'Email',
            'li-connect': 'Add on LinkedIn',
            'li-message': 'Send a message on LinkedIn',
            'li-view-profile': 'View LinkedIn profile',
            'li-interact-post': 'Interact with LinkedIn Post',
            'custom-task': 'Custom Task for',
            'follow-up': 'Follow-up with',
            'demo': 'Demo for'
        };
        
        const action = typeMap[type] || 'Task for';
        return `${action} ${name}`;
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
                lastRef.textContent = `Last updated: ${dt.toLocaleTimeString()}`;
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
    
    loadHomeActivities() {
        if (!window.ActivityManager) return;
        
        // Load global activities for home page
        window.ActivityManager.renderActivities('home-activity-timeline', 'global');
        
        // Setup pagination
        this.setupHomeActivityPagination();
    }

    
    setupHomeActivityPagination() {
        const paginationEl = document.getElementById('home-activity-pagination');
        
        if (!paginationEl) return;
        
        // Show pagination if there are more than 4 activities
        const updatePagination = async () => {
            if (!window.ActivityManager) return;
            
            const activities = await window.ActivityManager.getActivities('global');
            const totalPages = Math.ceil(activities.length / window.ActivityManager.maxActivitiesPerPage);
            
            if (totalPages > 1) {
                paginationEl.style.display = 'flex';
                
                // Use unified pagination component
                if (this.createPagination) {
                    this.createPagination(
                        window.ActivityManager.currentPage + 1, 
                        totalPages, 
                        (page) => {
                            window.ActivityManager.goToPage(page - 1, 'home-activity-timeline', 'global');
                            updatePagination();
                        }, 
                        paginationEl.id
                    );
                }
            } else {
                paginationEl.style.display = 'none';
            }
        };
        
        updatePagination();
    }
}

// Global helper function for accounts icon fallback
window.__pcAccountsIcon = () => {
    return `<span class="company-favicon company-favicon--fallback" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1"></path>
        </svg>
    </span>`;
};

// Enhanced favicon system with multiple fallback sources
window.__pcFaviconHelper = {
    // Prefer explicit account/company logo URL; fallback to computed favicon chain
    generateCompanyIconHTML: function(opts){
        try {
            const size = parseInt((opts && opts.size) || 64, 10) || 64;
            const logoUrl = (opts && opts.logoUrl) ? String(opts.logoUrl).trim() : '';
            const domain = (opts && opts.domain) ? String(opts.domain).trim().replace(/^https?:\/\//,'').replace(/\/$/,'') : '';
            
            
            if (logoUrl) {
                // Only treat as domain if it's clearly a bare domain (no protocol, no path)
                const looksLikeBareDomain = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(logoUrl) && !/\s/.test(logoUrl) && !logoUrl.includes('/');
                let parsed = null;
                try { parsed = /^https?:\/\//i.test(logoUrl) ? new URL(logoUrl) : null; } catch(_) { parsed = null; }
                const path = parsed ? (parsed.pathname || '') : '';
                const looksLikeImagePath = /\.(png|jpe?g|gif|webp|svg|ico)(\?.*)?$/i.test(path);
                
                // Only use favicon fallback for bare domains, not for URLs
                if (looksLikeBareDomain) {
                    const clean = String(logoUrl).replace(/^www\./i,'');
                    if (clean) return this.generateFaviconHTML(clean, size);
                }
                // Otherwise treat as a direct image URL; fallback to favicon on error
                const cleanDomain = domain || (parsed ? parsed.hostname.replace(/^www\./i,'') : '');
                const containerId = `logo-${(cleanDomain||'x').replace(/[^a-z0-9]/gi,'')}-${Date.now()}`;
                return `<img class="company-favicon" 
                             id="${containerId}"
                             src="${logoUrl}" 
                             alt="" 
                             referrerpolicy="no-referrer" 
                             loading="lazy"
                             style="width:${size}px;height:${size}px;object-fit:cover;border-radius:6px;"
                             onerror="window.__pcFaviconHelper.onLogoError('${containerId}','${cleanDomain}',${size})">`;
            }
            if (domain) {
                return this.generateFaviconHTML(domain, size);
            }
            return window.__pcAccountsIcon();
        } catch(_) { return window.__pcAccountsIcon(); }
    },
    onLogoError: function(containerId, domain, size){
        try {
            const img = document.getElementById(containerId);
            if (!img) return;
            const parent = img.parentNode;
            const html = this.generateFaviconHTML(domain, size);
            const div = document.createElement('div');
            div.innerHTML = html;
            const replacement = div.firstElementChild;
            if (parent && replacement) parent.replaceChild(replacement, img);
            else if (img) img.src = `https://www.google.com/s2/favicons?sz=${size}&domain=${encodeURIComponent(domain)}`;
        } catch(_) {}
    },
    // Generate favicon HTML with multiple fallback sources
    generateFaviconHTML: function(domain, size = 64) {
        if (!domain) {
            return window.__pcAccountsIcon();
        }

        const cleanDomain = domain.replace(/^www\./i, '');
        const fallbackIcon = window.__pcAccountsIcon();
        
        // Multiple favicon sources to try
        const faviconSources = [
            `https://www.google.com/s2/favicons?sz=${size}&domain=${encodeURIComponent(cleanDomain)}`,
            `https://favicons.githubusercontent.com/${encodeURIComponent(cleanDomain)}`,
            `https://icons.duckduckgo.com/ip3/${encodeURIComponent(cleanDomain)}.ico`,
            `https://${cleanDomain}/favicon.ico`
        ];

        // Create a unique ID for this favicon container
        const containerId = `favicon-${cleanDomain.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}`;
        
        return `
            <img class="company-favicon" 
                 id="${containerId}"
                 src="${faviconSources[0]}" 
                 alt="" 
                 referrerpolicy="no-referrer" 
                 loading="lazy"
                 onload="window.__pcFaviconHelper.onFaviconLoad('${containerId}')"
                 onerror="window.__pcFaviconHelper.onFaviconError('${containerId}', '${cleanDomain}', ${size})" />
        `;
    },

    // Handle successful favicon load
    onFaviconLoad: function(containerId) {
        const img = document.getElementById(containerId);
        if (img) {
            img.classList.add('favicon-loaded');
        }
    },

    // Handle favicon load error and try next source
    onFaviconError: function(containerId, domain, size) {
        const img = document.getElementById(containerId);
        if (!img) return;

        // Get current source index from data attribute
        let currentIndex = parseInt(img.dataset.sourceIndex || '0');
        currentIndex++;

        // Try next favicon source
        const faviconSources = [
            `https://www.google.com/s2/favicons?sz=${size}&domain=${encodeURIComponent(domain)}`,
            `https://favicons.githubusercontent.com/${encodeURIComponent(domain)}`,
            `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`,
            `https://${domain}/favicon.ico`
        ];

        if (currentIndex < faviconSources.length) {
            // Try next source
            img.dataset.sourceIndex = currentIndex.toString();
            img.src = faviconSources[currentIndex];
        } else {
            // All sources failed, show fallback icon
            img.classList.add('favicon-failed');
            img.style.display = 'none';
            // Insert fallback icon after the failed image
            const fallbackIcon = window.__pcAccountsIcon();
            img.insertAdjacentHTML('afterend', fallbackIcon);
        }
    }
};

// Global email signature helper function
window.getEmailSignature = function() {
    if (window.SettingsPage && window.SettingsPage.getEmailSignature) {
        return window.SettingsPage.getEmailSignature();
    }
    
    // Fallback: try to get from localStorage
    try {
        const savedSettings = localStorage.getItem('crm-settings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            const signature = settings.emailSignature;
            if (signature && (signature.text || signature.image)) {
                let signatureHtml = '<div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">';
                
                if (signature.text) {
                    const textHtml = signature.text.replace(/\n/g, '<br>');
                    signatureHtml += `<div style="font-family: inherit; font-size: 14px; color: #333; line-height: 1.4;">${textHtml}</div>`;
                }
                
                if (signature.image) {
                    signatureHtml += `<div style="margin-top: 10px;"><img src="${signature.image}" alt="Signature" style="max-width: 200px; max-height: 100px; border-radius: 4px;" /></div>`;
                }
                
                signatureHtml += '</div>';
                return signatureHtml;
            }
        }
    } catch (error) {
        console.error('Error getting email signature from localStorage:', error);
    }
    
    return '';
};

// Global email signature text helper function
window.getEmailSignatureText = function() {
    if (window.SettingsPage && window.SettingsPage.getEmailSignatureText) {
        return window.SettingsPage.getEmailSignatureText();
    }
    
    // Fallback: try to get from localStorage
    try {
        const savedSettings = localStorage.getItem('crm-settings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            const signature = settings.emailSignature;
            if (signature && signature.text) {
                return '\n\n' + signature.text;
            }
        }
    } catch (error) {
        console.error('Error getting email signature text from localStorage:', error);
    }
    
    return '';
};

// Email compose signature injection
function injectEmailSignature() {
    const bodyInput = document.querySelector('.body-input');
    if (!bodyInput) return;
    
    // Check if signature is already in the body (prevent duplication)
    const currentContent = bodyInput.innerHTML;
    if (currentContent.includes('margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;')) {
        return; // Signature already present
    }
    
    // Get signature and add to body if it exists
    const signature = window.getEmailSignature ? window.getEmailSignature() : '';
    if (signature) {
        // If body is empty, just add signature
        if (!currentContent.trim()) {
            bodyInput.innerHTML = '<p><br></p>' + signature;
        } else {
            // Add signature to end of existing content
            bodyInput.innerHTML = currentContent + signature;
        }

        // Move cursor to before the signature
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(bodyInput);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    } else {
        // Debug: Check if signature is actually being retrieved
        console.log('[Signature] No signature found - checking settings...');
        // Try to get signature directly from localStorage as fallback
        try {
            const savedSettings = localStorage.getItem('crm-settings');
            if (savedSettings) {
                const settings = JSON.parse(savedSettings);
                const signatureData = settings.emailSignature;
                console.log('[Signature] Settings from localStorage:', signatureData);

                if (signatureData && (signatureData.text || signatureData.image)) {
                    let signatureHtml = '<div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">';

                    if (signatureData.text) {
                        const textHtml = signatureData.text.replace(/\n/g, '<br>');
                        signatureHtml += `<div style="font-family: inherit; font-size: 14px; color: #333; line-height: 1.4;">${textHtml}</div>`;
                    }

                    if (signatureData.image) {
                        signatureHtml += `<div style="margin-top: 10px;"><img src="${signatureData.image}" alt="Signature" style="max-width: 200px; max-height: 100px; border-radius: 4px;" /></div>`;
                    }

                    signatureHtml += '</div>';

                    // Add signature to body
                    if (!currentContent.trim()) {
                        bodyInput.innerHTML = '<p><br></p>' + signatureHtml;
                    } else {
                        bodyInput.innerHTML = currentContent + signatureHtml;
                    }

                    console.log('[Signature] Added signature from localStorage');
                } else {
                    console.log('[Signature] No signature data found in settings');
                }
            }
        } catch (error) {
            console.error('[Signature] Error getting signature from localStorage:', error);
        }
    }
}

// Function to add signature to AI-generated content (not HTML AI)
function addSignatureToAIContent(content, isHtmlMode = false) {
    // Don't add signature to HTML AI emails (they have custom signatures)
    if (isHtmlMode) {
        return content;
    }
    
    // Check if signature is already present
    if (content.includes('margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;')) {
        return content;
    }
    
    // Add signature to AI-generated content
    const signature = window.getEmailSignature ? window.getEmailSignature() : '';
    return content + signature;
}

// Initialize CRM when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.crm = new PowerChoosersCRM();
    
    // Add compose button listener for signature injection
    const composeBtn = document.getElementById('compose-email-btn');
    if (composeBtn) {
        composeBtn.addEventListener('click', () => {
            // Wait for compose window to open, then inject signature
            setTimeout(() => {
                injectEmailSignature();
            }, 100);
        });
    }
    
    // Watch for compose window visibility changes
    const composeWindow = document.getElementById('compose-window');
    if (composeWindow) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const isVisible = !composeWindow.style.display || composeWindow.style.display !== 'none';
                    if (isVisible) {
                        // Ensure compose window is positioned correctly
                        composeWindow.style.position = 'fixed';
                        composeWindow.style.bottom = '0';
                        composeWindow.style.right = '20px';
                        composeWindow.style.top = 'auto';
                        composeWindow.style.left = 'auto';
                        
                        // Compose window is now visible, inject signature
                        setTimeout(() => {
                            injectEmailSignature();
                        }, 50);
                    }
                }
            });
        });
        
        observer.observe(composeWindow, {
            attributes: true,
            attributeFilter: ['style']
        });
    }
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
