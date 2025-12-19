
// Power Choosers CRM - Main JavaScript Functionality
// Strategic navigation and interactive features

(function suppressNoisyFirestoreHandshakeErrors() {
    try {
        const shouldSuppress = localStorage.getItem('pc-suppress-fs-400') !== 'false';
        if (!shouldSuppress) return;
        const originalConsoleError = window.console && window.console.error ? window.console.error.bind(window.console) : null;
        if (originalConsoleError) {
            window.console.error = function (...args) {
                try {
                    const text = args.map((a) => {
                        if (a && a.message) return String(a.message);
                        if (a && a.stack) return String(a.stack);
                        return String(a);
                    }).join(' ');
                    // Hide Firestore WebChannel Listen/channel 400 noise only
                    if (/google\.firestore\.v1\.Firestore\/Listen\/channel|WebChannel.*400|Listen\/channel.*400/i.test(text)) return;
                } catch (_) { /* noop */ }
                return originalConsoleError.apply(this, args);
            };
        }
        // Also prevent unhandledrejection spam from the same source (without masking real errors)
        window.addEventListener('unhandledrejection', (e) => {
            try {
                const msg = String((e && e.reason && (e.reason.message || e.reason)) || '');
                if (/google\.firestore\.v1\.Firestore\/Listen\/channel|WebChannel.*400|Listen\/channel.*400/i.test(msg)) {
                    e.preventDefault();
                }
            } catch (_) { /* noop */ }
        }, { capture: true });
    } catch (_) { /* noop */ }
})();

class PowerChoosersCRM {
    constructor() {
        this.currentPage = 'dashboard';
        this.sidebar = document.getElementById('sidebar');

        // Sidebar hover state
        this.sidebarOpenTimer = null;
        this.sidebarCloseTimer = null;
        this.sidebarLockCollapse = false;
        this.sidebarPointerInside = false;
        this.sidebarLastMouseX = 0;
        this.sidebarLastMouseY = 0;
        this.sidebarMouseMoved = false;
        this.sidebarLastEdgeCheck = 0;

        // Email automation
        this.emailAutomationInterval = null;

        // Email generation listener
        this._emailGenerationUnsubscribe = null;

        this.init();

        // PRE-LOAD ESSENTIAL DATA THEN LOAD WIDGETS
        this.initializeDashboardData();

        // Listen for activity refresh events
        document.addEventListener('pc:activities-refresh', (e) => {
            const { entityType, entityId, forceRefresh } = e.detail || {};
            if (entityType === 'global') {
                // Refresh home activities
                this.loadHomeActivities(forceRefresh);
            }
        });

        // CRITICAL FIX: Listen for task deletion events to refresh Today's Tasks widget
        document.addEventListener('pc:task-deleted', async (e) => {
            const { taskId } = e.detail || {};
            if (taskId) {
                console.log('[CRM] Task deleted, refreshing Today\'s Tasks widget:', taskId);
                // Clean up from localStorage
                try {
                    const getUserEmail = () => {
                        try {
                            if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
                                return window.DataManager.getCurrentUserEmail();
                            }
                            return (window.currentUserEmail || '').toLowerCase();
                        } catch (_) {
                            return (window.currentUserEmail || '').toLowerCase();
                        }
                    };
                    const email = getUserEmail();
                    const namespacedKey = email ? `userTasks:${email}` : 'userTasks';

                    // Remove from namespaced key
                    const namespacedTasks = JSON.parse(localStorage.getItem(namespacedKey) || '[]');
                    const filteredNamespaced = namespacedTasks.filter(t => t && t.id !== taskId);
                    localStorage.setItem(namespacedKey, JSON.stringify(filteredNamespaced));

                    // Also remove from legacy key
                    const legacyTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
                    const filteredLegacy = legacyTasks.filter(t => t && t.id !== taskId);
                    localStorage.setItem('userTasks', JSON.stringify(filteredLegacy));
                } catch (err) {
                    console.warn('[CRM] Could not clean up deleted task from localStorage:', err);
                }

                // Refresh Today's Tasks widget
                if (typeof this.loadTodaysTasks === 'function') {
                    this.loadTodaysTasks();
                }
            }
        });

        // CRITICAL FIX: Listen for tasksUpdated events with deleted flag
        window.addEventListener('tasksUpdated', async (e) => {
            const { taskId, deleted } = e.detail || {};
            if (deleted && taskId) {
                console.log('[CRM] Task deleted via tasksUpdated event, refreshing Today\'s Tasks widget:', taskId);
                // Refresh Today's Tasks widget
                if (typeof this.loadTodaysTasks === 'function') {
                    this.loadTodaysTasks();
                }
            }
        });

        // Listen for booking/lead creation events and show notifications
        window.addEventListener('pc:booking-created', (e) => {
            const { contactName, companyName, appointmentDate, selectedTime, source, taskId } = e.detail || {};
            if (!contactName || !companyName) return;

            // Use existing Notifications system
            if (window.Notifications && typeof window.Notifications.add === 'function') {
                const isBooking = source !== 'home-page';
                const title = isBooking ? 'New Consultation Scheduled' : 'New Lead Received';
                const message = isBooking
                    ? `${contactName} from ${companyName} scheduled a consultation${appointmentDate ? ` for ${appointmentDate}` : ''}${selectedTime ? ` at ${selectedTime}` : ''}`
                    : `${contactName} from ${companyName} submitted a lead form`;

                window.Notifications.add(
                    isBooking ? 'new-lead' : 'new-lead',
                    title,
                    message,
                    {
                        contactName: contactName,
                        companyName: companyName,
                        appointmentDate: appointmentDate,
                        selectedTime: selectedTime,
                        source: source,
                        taskId: taskId
                    }
                );
            }
        });

        // Memory monitoring (development mode)
        if (window.location.hostname === 'localhost' || localStorage.getItem('debug-memory') === 'true') {
            this.startMemoryMonitoring();
        }

        // Start listening for background email generation
        this.startEmailGenerationListener();
    }

    // Initialize dashboard data and widgets in correct order
    async initializeDashboardData() {
        console.log('[CRM] Initializing dashboard data...');

        // STEP 1: Pre-load essential data and WAIT for completion
        await this.preloadEssentialData();

        // STEP 2: Now load widgets that depend on this data
        this.loadDashboardWidgets();
    }

    // Listen for background email generation (cron jobs)
    startEmailGenerationListener() {
        // Guard: Prevent duplicate listeners
        if (this._emailGenerationUnsubscribe) {
            console.log('[CRM] Email generation listener already active, skipping');
            return;
        }

        if (!window.firebaseDB || !window.firebaseDB.collection) {
            console.warn('[CRM] Firestore not initialized, skipping email generation listener');
            return;
        }

        // Track which emails we've already notified about (to avoid duplicates)
        const notifiedEmailIds = new Set();

        // Get current user email for filtering
        const getUserEmail = () => {
            try {
                if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
                    return window.DataManager.getCurrentUserEmail();
                }
                return (window.currentUserEmail || '').toLowerCase();
            } catch (_) {
                return (window.currentUserEmail || '').toLowerCase();
            }
        };

        const userEmail = getUserEmail();
        if (!userEmail) {
            console.warn('[CRM] No user email found, skipping email generation listener');
            return;
        }

        console.log('[CRM] Starting email generation listener for:', userEmail);

        // Listen for emails with status 'pending_approval' that were recently generated
        // Only show notifications for emails generated in the last 5 minutes
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);

        const emailsQuery = window.firebaseDB.collection('emails')
            .where('type', '==', 'scheduled')
            .where('status', '==', 'pending_approval')
            .where('generatedAt', '>=', fiveMinutesAgo)
            .orderBy('generatedAt', 'desc')
            .limit(50); // Limit to recent emails only

        this._emailGenerationUnsubscribe = emailsQuery.onSnapshot((snapshot) => {
            try {
                snapshot.docChanges().forEach((change) => {
                    // Only process new documents (not modifications or deletions)
                    if (change.type !== 'added') return;

                    const emailData = change.doc.data();
                    const emailId = change.doc.id;

                    // Skip if we've already notified about this email
                    if (notifiedEmailIds.has(emailId)) return;

                    // Only notify for emails owned by current user
                    const emailOwner = (emailData.ownerId || emailData.assignedTo || '').toLowerCase();
                    if (emailOwner !== userEmail.toLowerCase()) return;

                    // Only notify if email was just generated (within last 2 minutes)
                    const generatedAt = emailData.generatedAt;
                    if (!generatedAt) return;

                    const twoMinutesAgo = Date.now() - (2 * 60 * 1000);
                    if (generatedAt < twoMinutesAgo) return;

                    // Mark as notified
                    notifiedEmailIds.add(emailId);

                    // Clean up old IDs (keep only last 100 to prevent memory leak)
                    if (notifiedEmailIds.size > 100) {
                        const firstId = notifiedEmailIds.values().next().value;
                        notifiedEmailIds.delete(firstId);
                    }

                    // Show notification
                    if (window.ToastManager && typeof window.ToastManager.showEmailGeneratedNotification === 'function') {
                        window.ToastManager.showEmailGeneratedNotification({
                            contactName: emailData.contactName || null,
                            subject: emailData.subject || 'Email ready for review',
                            sequenceName: emailData.sequenceName || null
                        });
                    }
                });
            } catch (error) {
                console.error('[CRM] Error in email generation listener:', error);
            }
        }, (error) => {
            console.warn('[CRM] Email generation listener error:', error);
        });
    }

    // Load dashboard widgets after data is ready
    loadDashboardWidgets() {
        console.log('[CRM] Loading dashboard widgets...');

        // Setup one-time animation handlers to prevent re-animation
        this.setupOneTimeAnimations();
        // Observe dashboard containers and animate height once when real content arrives
        this.setupEntranceObservers();

        // Progressive Loading: Start activities immediately
        // We don't wait for all background loaders. ActivityManager will render what it can (fallback)
        // and then we refresh when background data arrives.
        setTimeout(() => {
            this.loadHomeActivities();
        }, 100);

        // Setup listeners to refresh activities when background data becomes available
        this.setupActivityRefreshListeners();
    }

    // Load home page activities
    loadHomeActivities(forceRefresh = false) {
        if (window.ActivityManager && document.getElementById('dashboard-page')?.classList.contains('active')) {
            // Also check if contacts are ready - filtering relies on them, but we can render partials without them
            // The ActivityManager handles the "strict" filtering gracefully (just shows less or unlinked items)
            console.log('[CRM] Rendering home activities (Progressive Load)...');
            window.ActivityManager.renderActivities('home-activity-timeline', 'global', null, forceRefresh);
        }
    }

    // Setup listeners for background data updates (Progressive Loading)
    setupActivityRefreshListeners() {
        if (this._activityListenersSetup) return;
        this._activityListenersSetup = true;

        const refreshActivities = () => {
            // Debounce the refresh
            if (this._activityRefreshTimer) clearTimeout(this._activityRefreshTimer);
            this._activityRefreshTimer = setTimeout(() => {
                console.log('[CRM] Background data updated, refreshing activities...');
                // Force refresh to pick up new background data and re-apply filters
                this.loadHomeActivities(true);
            }, 1000);
        };

        // Listen for updates from background loaders
        window.addEventListener('pc:emails-updated', refreshActivities);
        window.addEventListener('tasksUpdated', refreshActivities);
        // Also listen for contact updates as they affect email filtering
        window.addEventListener('pc:contacts-updated', refreshActivities);
        window.addEventListener('pc:contact-created', refreshActivities);
    }

    // Observe first render of dashboard containers and animate height once
    setupEntranceObservers() {
        const widgetConfigs = [
            { containerSelector: '.tasks-list', itemSelector: '.task-item' },
            { containerSelector: '.news-list', itemSelector: '.news-item' }
        ];

        const activitiesConfig = { containerSelector: '.activities-list', itemSelector: '.activity-item' };

        const animateHeightOnce = (el) => {
            if (!el || el.dataset.heightAnimated === '1') return;
            el.dataset.heightAnimated = '1';

            const startHeight = el.offsetHeight;
            const targetHeight = el.scrollHeight;
            el.style.overflow = 'hidden';
            el.style.maxHeight = startHeight + 'px';
            el.style.transition = 'max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)';

            if (getComputedStyle(el).opacity === '0') el.style.opacity = '1';

            requestAnimationFrame(() => {
                el.style.maxHeight = Math.max(targetHeight, startHeight) + 'px';
                setTimeout(() => {
                    el.style.maxHeight = '';
                    el.style.overflow = '';
                }, 600);
            });
        };

        // Check if BOTH tasks and news are ready before animating either
        const checkBothWidgetsReady = () => {
            const tasksContainer = document.querySelector('.tasks-list');
            const newsContainer = document.querySelector('.news-list');

            const tasksReady = tasksContainer && tasksContainer.querySelector('.task-item');
            const newsReady = newsContainer && newsContainer.querySelector('.news-item');

            // Only animate when BOTH are ready
            if (tasksReady && newsReady) {
                console.log('[CRM] Both tasks and news ready - animating together');
                animateHeightOnce(tasksContainer);
                animateHeightOnce(newsContainer);
                return true;
            }
            return false;
        };

        // Watch both containers and animate together when both have content
        widgetConfigs.forEach(({ containerSelector }) => {
            const container = document.querySelector(containerSelector);
            if (!container) return;
            if (container.dataset.observerAttached === '1') return;
            container.dataset.observerAttached = '1';

            // Check if both are ready on initial load
            if (checkBothWidgetsReady()) return;

            // Observe for content arrival
            const mo = new MutationObserver(() => {
                if (checkBothWidgetsReady()) {
                    mo.disconnect();
                }
            });
            mo.observe(container, { childList: true });
        });

        // Activities animate independently
        const activitiesContainer = document.querySelector(activitiesConfig.containerSelector);
        if (activitiesContainer && !activitiesContainer.dataset.observerAttached) {
            activitiesContainer.dataset.observerAttached = '1';

            if (activitiesContainer.querySelector(activitiesConfig.itemSelector)) {
                animateHeightOnce(activitiesContainer);
            } else {
                const mo = new MutationObserver(() => {
                    if (activitiesContainer.querySelector(activitiesConfig.itemSelector)) {
                        animateHeightOnce(activitiesContainer);
                        mo.disconnect();
                    }
                });
                mo.observe(activitiesContainer, { childList: true });
            }
        }
    }

    // Setup one-time animations - prevents re-animation on content updates
    setupOneTimeAnimations() {
        const containers = [
            { selector: '.activities-list', items: '.activity-item' },
            { selector: '.tasks-list', items: '.task-item' },
            { selector: '.news-list', items: '.news-item' },
            { selector: '.quick-actions', items: '.action-btn' }
        ];

        containers.forEach(({ selector, items }) => {
            const container = document.querySelector(selector);
            if (container && !container.classList.contains('animated')) {
                // Mark container as animated immediately to prevent re-triggers
                setTimeout(() => {
                    container.classList.add('animated');
                    // Also mark all items as animated
                    container.querySelectorAll(items).forEach(item => {
                        item.classList.add('animated');
                    });
                }, 1500); // After all animations complete
            }
        });
    }

    // Pre-load essential data for widgets and navigation
    async preloadEssentialData() {
        console.log('[CRM] Pre-loading essential data for widgets...');

        try {
            // Load accounts data for account navigation and activity logos
            if (window.CacheManager && typeof window.CacheManager.get === 'function') {
                const accountsData = await window.CacheManager.get('accounts');
                if (accountsData && Array.isArray(accountsData)) {
                    // Limit to 200 most recent for widgets/navigation to save memory
                    window._essentialAccountsData = accountsData.slice(0, 200);

                    // Lazy-load full data function (loads on demand)
                    window.getAccountsData = (forceFullData = false) => {
                        // If called from a page that needs full data, return full dataset
                        // FIXED: 'account-details' (with s) for correct page name, added 'dashboard' for task icons, added 'calls' for call enrichment
                        const needsFullData = forceFullData || ['dashboard', 'accounts', 'account-details', 'task-detail', 'calls'].includes(window.crm?.currentPage);
                        if (needsFullData && accountsData.length > 200) {
                            return accountsData;  // Return full dataset when needed
                        }
                        return window._essentialAccountsData;  // Return limited set for widgets
                    };
                    console.log('[CRM] ✓ Pre-loaded 200 accounts (from', accountsData.length, 'total) - full data available on demand');
                }
            }

            // Load contacts data for contact navigation
            if (window.CacheManager && typeof window.CacheManager.get === 'function') {
                const contactsData = await window.CacheManager.get('contacts');
                if (contactsData && Array.isArray(contactsData)) {
                    // Limit to 200 most recent for widgets/navigation to save memory
                    window._essentialContactsData = contactsData.slice(0, 200);

                    // Lazy-load full data function (loads on demand)
                    window.getPeopleData = (forceFullData = false) => {
                        // Added 'dashboard' for task rendering with full contact data, added 'calls' for call enrichment
                        const needsFullData = forceFullData || ['dashboard', 'people', 'contact-detail', 'task-detail', 'calls'].includes(window.crm?.currentPage);
                        if (needsFullData && contactsData.length > 200) {
                            return contactsData;  // Return full dataset when needed
                        }
                        return window._essentialContactsData;  // Return limited set for widgets
                    };
                    console.log('[CRM] ✓ Pre-loaded 200 contacts (from', contactsData.length, 'total) - full data available on demand');
                }
            }

            // Load tasks - use tasks module if available, otherwise load from Firebase
            if (window.tasksModule && typeof window.tasksModule.getTasksData === 'function') {
                // Tasks module already loaded, use its data
                await window.tasksModule.loadDataOnce();
                const tasksData = window.tasksModule.getTasksData();
                window._essentialTasksData = tasksData;
                console.log('[CRM] ✓ Pre-loaded', tasksData.length, 'tasks from tasks module');
            } else if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.getTasksData === 'function') {
                // Use BackgroundTasksLoader if available (already handles ownership)
                window._essentialTasksData = window.BackgroundTasksLoader.getTasksData() || [];
                console.log('[CRM] ✓ Pre-loaded', window._essentialTasksData.length, 'tasks from BackgroundTasksLoader');
            } else if (window.firebaseDB) {
                // Fallback: load directly from Firebase with ownership filters
                let tasksData = [];

                // Helper functions
                const getUserEmail = () => {
                    try {
                        if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
                            return window.DataManager.getCurrentUserEmail();
                        }
                        return (window.currentUserEmail || '').toLowerCase();
                    } catch (_) {
                        return (window.currentUserEmail || '').toLowerCase();
                    }
                };
                const isAdmin = () => {
                    try {
                        if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
                            return window.DataManager.isCurrentUserAdmin();
                        }
                        return window.currentUserRole === 'admin';
                    } catch (_) {
                        return window.currentUserRole === 'admin';
                    }
                };

                try {
                    if (!isAdmin()) {
                        // Non-admin: use ownership-aware query
                        const email = getUserEmail();
                        if (email && window.DataManager && typeof window.DataManager.queryWithOwnership === 'function') {
                            tasksData = await window.DataManager.queryWithOwnership('tasks');
                            tasksData = tasksData.slice(0, 100); // Limit for preload
                        } else if (email) {
                            // Fallback: two separate queries
                            const [ownedSnap, assignedSnap] = await Promise.all([
                                window.firebaseDB.collection('tasks').where('ownerId', '==', email).orderBy('timestamp', 'desc').limit(100).get(),
                                window.firebaseDB.collection('tasks').where('assignedTo', '==', email).orderBy('timestamp', 'desc').limit(100).get()
                            ]);
                            const tasksMap = new Map();
                            ownedSnap.docs.forEach(doc => tasksMap.set(doc.id, { id: doc.id, ...doc.data() }));
                            assignedSnap.docs.forEach(doc => {
                                if (!tasksMap.has(doc.id)) tasksMap.set(doc.id, { id: doc.id, ...doc.data() });
                            });
                            tasksData = Array.from(tasksMap.values());
                        }
                    } else {
                        // Admin: unrestricted query
                        const snapshot = await window.firebaseDB.collection('tasks')
                            .orderBy('timestamp', 'desc')
                            .limit(100)
                            .get();
                        tasksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    }

                    // Merge with localStorage (filtered by ownership for non-admin)
                    try {
                        let localTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
                        if (!isAdmin() && localTasks.length > 0) {
                            const email = getUserEmail();
                            localTasks = localTasks.filter(t => {
                                if (!t) return false;
                                const ownerId = (t.ownerId || '').toLowerCase();
                                const assignedTo = (t.assignedTo || '').toLowerCase();
                                const createdBy = (t.createdBy || '').toLowerCase();
                                return ownerId === email || assignedTo === email || createdBy === email;
                            });
                        }
                        const existingIds = new Set(tasksData.map(t => t.id));
                        const newLocalTasks = localTasks.filter(t => !existingIds.has(t.id));
                        window._essentialTasksData = [...tasksData, ...newLocalTasks];
                    } catch (e) {
                        window._essentialTasksData = tasksData;
                    }
                    console.log('[CRM] ✓ Pre-loaded', window._essentialTasksData.length, 'tasks from Firebase');
                } catch (error) {
                    console.warn('[CRM] Could not pre-load tasks from Firebase:', error);
                    // Fallback to localStorage only
                    try {
                        let localTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
                        if (!isAdmin() && localTasks.length > 0) {
                            const email = getUserEmail();
                            localTasks = localTasks.filter(t => {
                                if (!t) return false;
                                const ownerId = (t.ownerId || '').toLowerCase();
                                const assignedTo = (t.assignedTo || '').toLowerCase();
                                const createdBy = (t.createdBy || '').toLowerCase();
                                return ownerId === email || assignedTo === email || createdBy === email;
                            });
                        }
                        window._essentialTasksData = localTasks;
                        console.log('[CRM] ✓ Pre-loaded', window._essentialTasksData.length, 'tasks from localStorage fallback');
                    } catch (e) {
                        window._essentialTasksData = [];
                    }
                }
            }

            console.log('[CRM] ✓✓✓ All essential data pre-loaded successfully');
        } catch (error) {
            console.error('[CRM] Error pre-loading essential data:', error);
        }
    }

    // Clean up page-specific memory on navigation
    // Cleanup email generation listener
    stopEmailGenerationListener() {
        if (this._emailGenerationUnsubscribe) {
            try {
                this._emailGenerationUnsubscribe();
                this._emailGenerationUnsubscribe = null;
                console.log('[CRM] Stopped email generation listener');
            } catch (error) {
                console.warn('[CRM] Error stopping email generation listener:', error);
            }
        }
    }

    cleanupPageMemory(previousPage) {
        console.log('[CRM] Cleaning up memory for:', previousPage);

        try {
            // Don't clean up dashboard - it's always potentially active
            // Dashboard widgets need persistent state for task rendering and activities
            if (previousPage === 'dashboard') {
                console.log('[CRM] Skipping dashboard cleanup - preserving widget state');
                return;
            }

            // Call page-specific cleanup functions
            if (previousPage === 'people' && window.peopleModule?.cleanup) {
                window.peopleModule.cleanup();
            }
            if (previousPage === 'accounts' && window.accountsModule?.cleanup) {
                window.accountsModule.cleanup();
            }
            if (previousPage === 'calls' && window.callsModule?.cleanup) {
                window.callsModule.cleanup();
            }

            console.log('[CRM] Memory cleanup complete for:', previousPage);
        } catch (error) {
            console.warn('[CRM] Error during memory cleanup:', error);
        }
    }

    // Memory monitoring for development
    startMemoryMonitoring() {
        console.log('[CRM] Memory monitoring enabled (to disable, run: localStorage.removeItem("debug-memory"))');

        setInterval(() => {
            if (performance.memory) {
                const used = Math.round(performance.memory.usedJSHeapSize / 1048576);
                const total = Math.round(performance.memory.totalJSHeapSize / 1048576);
                const limit = Math.round(performance.memory.jsHeapSizeLimit / 1048576);
                console.log(`[Memory] ${used}MB / ${total}MB (limit: ${limit}MB)`);

                // Warn if approaching 80% of limit
                if (used > limit * 0.8) {
                    console.warn('[Memory] ⚠️ High memory usage! Consider refreshing page.');
                }
            }
        }, 30000); // Log every 30 seconds
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

        // Open modal with animation
        modal.removeAttribute('hidden');

        // Double requestAnimationFrame ensures browser is ready for smooth animation
        // This prevents choppy first render by giving browser time to create compositor layers
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                modal.classList.add('show');
            });
        });

        // Focus management: move focus to Close button if present, else first input
        setTimeout(() => {
            const closeBtn = modal.querySelector('.pc-modal__close');
            const firstInput = modal.querySelector('input,button,select,textarea,[tabindex]:not([tabindex="-1"])');
            if (closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus();
            else if (firstInput && typeof firstInput.focus === 'function') firstInput.focus();

            // Setup parent company autocomplete
            const searchInput = modal.querySelector('#parent-company-search');
            const dropdown = modal.querySelector('#parent-company-dropdown');
            const hiddenId = modal.querySelector('#parent-company-id');
            if (searchInput && dropdown && hiddenId && window.AccountDetail && typeof window.AccountDetail.setupParentCompanyAutocomplete === 'function') {
                window.AccountDetail.setupParentCompanyAutocomplete(searchInput, dropdown, hiddenId);
            }
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
            // Start exit animation
            modal.classList.remove('show');

            // Hide modal after animation completes
            setTimeout(() => {
                modal.setAttribute('hidden', '');
                dialog.removeEventListener('keydown', handleKeyDown);
                document.removeEventListener('keydown', handleKeyDown);
            }, 300); // Match CSS transition duration
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

            // Service address plus and minus button handler (event delegation)
            const serviceAddressesContainer = modal.querySelector('#service-addresses-container');
            if (serviceAddressesContainer) {
                serviceAddressesContainer.addEventListener('click', (e) => {
                    const plusBtn = e.target.closest('.add-service-address-btn');
                    const minusBtn = e.target.closest('.remove-service-address-btn');

                    if (plusBtn) {
                        e.preventDefault();
                        const container = modal.querySelector('#service-addresses-container');
                        const currentRows = container.querySelectorAll('.service-address-input-row');
                        const newIndex = currentRows.length;
                        const newRow = document.createElement('div');
                        newRow.className = 'service-address-input-row';
                        newRow.style.cssText = 'display: flex; gap: 8px; align-items: center;';
                        newRow.innerHTML = `
              <input type="text" name="serviceAddress_${newIndex}" class="input-dark" placeholder="123 Main St, City, State" style="flex: 1;" />
              <button type="button" class="remove-service-address-btn" style="background: var(--grey-600); color: white; border: none; border-radius: 4px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;" title="Remove this service address">-</button>
              <button type="button" class="add-service-address-btn" style="background: var(--orange-primary); color: white; border: none; border-radius: 4px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;" title="Add another service address">+</button>
            `;
                        // Add focus ring to new input
                        const newInput = newRow.querySelector('input');
                        if (newInput) {
                            newInput.addEventListener('focus', () => newInput.classList.add('focus-orange'));
                            newInput.addEventListener('blur', () => newInput.classList.remove('focus-orange'));
                        }
                        container.appendChild(newRow);
                    } else if (minusBtn) {
                        e.preventDefault();
                        const container = modal.querySelector('#service-addresses-container');
                        const currentRows = container.querySelectorAll('.service-address-input-row');
                        // Only remove if there's more than one row
                        if (currentRows.length > 1) {
                            const rowToRemove = minusBtn.closest('.service-address-input-row');
                            if (rowToRemove) {
                                rowToRemove.remove();
                            }
                        }
                    }
                });
            }

            // Submit handler -> Firestore save
            if (form) {
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const data = {};
                    form.querySelectorAll('input, textarea').forEach(inp => { data[inp.name] = (inp.value || '').trim(); });

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

                    // Collect service addresses
                    const serviceAddresses = [];
                    form.querySelectorAll('[name^="serviceAddress_"]').forEach((input, idx) => {
                        if (input.value.trim()) {
                            serviceAddresses.push({
                                address: input.value.trim(),
                                isPrimary: idx === 0
                            });
                        }
                    });

                    try {
                        const db = window.firebaseDB;
                        const fv = window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue;
                        if (!db) throw new Error('Firestore not initialized');
                        const now = fv && typeof fv.serverTimestamp === 'function' ? fv.serverTimestamp() : Date.now();

                        // Normalize company phone if provided
                        if (data.phone) {
                            try { data.phone = this.normalizePhone(data.phone); } catch (_) { }
                        }

                        // Get user email for ownership fields (required for Firestore rules compliance)
                        const getUserEmail = () => {
                            try {
                                if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
                                    const email = window.DataManager.getCurrentUserEmail();
                                    if (email && typeof email === 'string' && email.trim()) {
                                        return email.toLowerCase().trim();
                                    }
                                }
                                const email = window.currentUserEmail || '';
                                if (email && typeof email === 'string' && email.trim()) {
                                    return email.toLowerCase().trim();
                                }
                            } catch (_) {
                                const email = window.currentUserEmail || '';
                                if (email && typeof email === 'string' && email.trim()) {
                                    return email.toLowerCase().trim();
                                }
                            }
                            return 'l.patterson@powerchoosers.com';
                        };
                        const userEmail = getUserEmail();

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
                            parentCompanyId: data.parentCompanyId || '',
                            parentCompanyName: data.parentCompanyName || '',
                            shortDescription: data.shortDescription || '',
                            electricitySupplier: data.electricitySupplier || '',
                            benefits: data.benefits || '',
                            painPoints: data.painPoints || '',
                            linkedin: data.linkedin || '',
                            // Branding
                            logoUrl: data.logoUrl || '',
                            // CRITICAL: Set ownership fields for Firestore rules compliance
                            ownerId: userEmail,
                            assignedTo: userEmail,
                            createdBy: userEmail,
                            // Timestamps
                            createdAt: now,
                            updatedAt: now,
                        };

                        // Use DataManager.addOwnership if available for server timestamps
                        const finalDoc = (window.DataManager && typeof window.DataManager.addOwnership === 'function')
                            ? window.DataManager.addOwnership(doc)
                            : doc;

                        // Add service addresses if any
                        if (serviceAddresses.length > 0) {
                            finalDoc.serviceAddresses = serviceAddresses;
                        }

                        const ref = await db.collection('accounts').add(finalDoc);

                        // Create UI document for notifications and navigation
                        // Use finalDoc instead of doc to include serviceAddresses and all other fields
                        const uiDoc = Object.assign({}, finalDoc, { createdAt: new Date(), updatedAt: new Date() });

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
        } catch (_) { }
        try {
            if (typeof PUBLIC_BASE_URL !== 'undefined' && PUBLIC_BASE_URL) return String(PUBLIC_BASE_URL).replace(/\/$/, '');
        } catch (_) { }
        try {
            if (typeof API_BASE_URL !== 'undefined' && API_BASE_URL) return String(API_BASE_URL).replace(/\/$/, '');
        } catch (_) { }
        const cloudRun = 'https://power-choosers-crm-792458658491.us-south1.run.app';
        if (/^https?:\/\//i.test(cloudRun)) return cloudRun;
        try { return (window.location && window.location.origin) ? window.location.origin.replace(/\/$/, '') : cloudRun; } catch (_) { return cloudRun; }
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

        // Open modal with animation
        modal.removeAttribute('hidden');

        // Double requestAnimationFrame ensures browser is ready for smooth animation
        // This prevents choppy first render by giving browser time to create compositor layers
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                modal.classList.add('show');
            });
        });

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
            // Start exit animation
            modal.classList.remove('show');

            // Hide modal after animation completes
            setTimeout(() => {
                modal.setAttribute('hidden', '');
                dialog.removeEventListener('keydown', handleKeyDown);
                document.removeEventListener('keydown', handleKeyDown);
            }, 300); // Match CSS transition duration
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
                    form.querySelectorAll('input, textarea').forEach(inp => { data[inp.name] = (inp.value || '').trim(); });

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
                        if (data.mobile) { try { normalized.mobile = this.normalizePhone(data.mobile); } catch (_) { normalized.mobile = data.mobile; } }
                        if (data.workDirectPhone) { try { normalized.workDirectPhone = this.normalizePhone(data.workDirectPhone); } catch (_) { normalized.workDirectPhone = data.workDirectPhone; } }
                        if (data.otherPhone) { try { normalized.otherPhone = this.normalizePhone(data.otherPhone); } catch (_) { normalized.otherPhone = data.otherPhone; } }

                        // Get user email for ownership fields
                        const userEmail = (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function')
                            ? window.DataManager.getCurrentUserEmail()
                            : ((window.currentUserEmail || '').toLowerCase());

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
                            // Ownership fields (required for Firestore rules)
                            ownerId: userEmail || '',
                            assignedTo: userEmail || '',
                            createdBy: userEmail || '',
                            // Timestamps
                            createdAt: now,
                            updatedAt: now,
                        };

                        // If adding from Account Details or Task Detail, link the contact to the current account immediately
                        try {
                            let accountId = window.AccountDetail?.state?.currentAccount?.id;

                            // If not from Account Detail, check if we're from Task Detail with an account
                            if (!accountId && window.TaskDetail?.state?.currentTask) {
                                const task = window.TaskDetail.state.currentTask;
                                if (task.accountId) {
                                    accountId = task.accountId;
                                } else if (task.account) {
                                    // Try to find account by name
                                    const accounts = window.getAccountsData?.() || [];
                                    const account = accounts.find(a =>
                                        (a.accountName || a.name || a.companyName) === task.account
                                    );
                                    if (account) {
                                        accountId = account.id;
                                    }
                                }
                            }

                            if (accountId) {
                                doc.accountId = accountId;
                            }
                        } catch (_) { /* noop */ }

                        // Use DataManager.addOwnership if available for server timestamps
                        const finalDoc = (window.DataManager && typeof window.DataManager.addOwnership === 'function')
                            ? window.DataManager.addOwnership(doc)
                            : doc;

                        const ref = await db.collection('contacts').add(finalDoc);

                        // If LinkedIn URL provided and contact is linked to an account, update account's LinkedIn
                        if (doc.linkedin) {
                            let accountId = doc.accountId;

                            // If no accountId but has companyName, try to find account by name
                            if (!accountId && doc.companyName) {
                                try {
                                    const accountQuery = await db.collection('accounts')
                                        .where('accountName', '==', doc.companyName)
                                        .limit(1)
                                        .get();
                                    if (!accountQuery.empty) {
                                        accountId = accountQuery.docs[0].id;
                                    }
                                } catch (_) { }
                            }

                            if (accountId) {
                                try {
                                    await db.collection('accounts').doc(accountId).update({
                                        linkedin: doc.linkedin,
                                        updatedAt: now
                                    });
                                    console.log('[AddContact] Updated account LinkedIn from contact');
                                } catch (err) {
                                    console.warn('[AddContact] Failed to update account LinkedIn:', err);
                                }
                            }
                        }

                        // Broadcast for optional listeners (e.g., People page refresh)
                        // Use UI-friendly timestamps so the table doesn't show N/A while serverTimestamp resolves
                        try {
                            const uiDoc = Object.assign({}, doc, {
                                createdAt: new Date(),
                                updatedAt: new Date(),
                            });
                            const newContact = { id: ref.id, ...uiDoc };

                            // IMMEDIATELY inject into essential data
                            if (window._essentialContactsData) {
                                window._essentialContactsData.push(newContact);
                                console.log('[Contact] Added to essential data');
                            }

                            // IMMEDIATELY update cache
                            if (window.CacheManager && typeof window.CacheManager.get === 'function') {
                                window.CacheManager.get('contacts').then(contacts => {
                                    if (contacts && Array.isArray(contacts)) {
                                        contacts.push(newContact);
                                        window.CacheManager.set('contacts', contacts);
                                        console.log('[Contact] Updated cache');
                                    }
                                }).catch(() => { });
                            }

                            document.dispatchEvent(new CustomEvent('pc:contact-created', {
                                detail: {
                                    id: ref.id,
                                    doc: uiDoc,
                                    contact: newContact  // Full contact object for immediate use
                                }
                            }));
                        } catch (_) { /* noop */ }

                        if (window.crm && typeof window.crm.showToast === 'function') window.crm.showToast('Contact added!');
                        try { form.reset(); } catch (_) { /* noop */ }
                        close();

                        // Navigate to the newly created contact detail page
                        try {
                            // Navigate to people page first
                            if (window.crm && typeof window.crm.navigateToPage === 'function') {
                                window.crm.navigateToPage('people');
                                // Show the contact detail after a longer delay to ensure page is fully loaded
                                setTimeout(() => {
                                    if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
                                        window.ContactDetail.show(ref.id);
                                    } else {
                                        // Enhanced retry mechanism with longer intervals
                                        let attempts = 0;
                                        const maxAttempts = 15;
                                        const retryInterval = 150;
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
                                }, 200);
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
        this.setupRefreshButton();
        this.loadInitialData();
        // Ensure widget panel visibility state is reflected on first load
        try {
            this.updateWidgetPanel(this.currentPage);
        } catch (_) { /* noop */ }

        // Pre-warm modal animations for smooth first use (performance optimization)
        setTimeout(() => this.preWarmModalAnimations(), 500);
    }

    // Pre-warm modal animations to prevent choppy first render
    preWarmModalAnimations() {
        // Force browser to create compositor layers for modals
        const modals = ['modal-add-contact', 'modal-add-account'];

        modals.forEach(modalId => {
            const modal = document.getElementById(modalId);
            if (!modal) return;

            const dialog = modal.querySelector('.pc-modal__dialog');
            const backdrop = modal.querySelector('.pc-modal__backdrop');

            if (!dialog || !backdrop) return;

            // Temporarily show modal off-screen to force layer creation
            // This pre-compiles the CSS and creates GPU layers without visible flash
            const originalHidden = modal.hasAttribute('hidden');
            const originalDisplay = modal.style.display;
            const originalTransform = dialog.style.transform;
            const originalOpacity = modal.style.opacity;

            // Force layout calculation by briefly showing elements
            modal.removeAttribute('hidden');
            modal.style.display = 'block';
            modal.style.opacity = '0';
            modal.style.visibility = 'hidden';
            modal.style.position = 'fixed';
            modal.style.top = '-9999px';
            modal.style.left = '-9999px';

            // Force browser to create compositor layers
            void dialog.offsetHeight; // Force layout
            void backdrop.offsetHeight; // Force layout

            // Trigger a micro-animation to warm up the GPU
            requestAnimationFrame(() => {
                dialog.style.transform = 'translate(-50%, -50%) scale(0.98) translateY(5px) translateZ(0)';
                backdrop.style.opacity = '0.1';

                requestAnimationFrame(() => {
                    // Reset everything
                    dialog.style.transform = originalTransform || '';
                    backdrop.style.opacity = '';
                    modal.style.display = originalDisplay || '';
                    modal.style.opacity = originalOpacity || '';
                    modal.style.visibility = '';
                    modal.style.position = '';
                    modal.style.top = '';
                    modal.style.left = '';

                    if (originalHidden) {
                        modal.setAttribute('hidden', '');
                    }
                });
            });
        });
    }

    // Navigation System
    setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        const pages = document.querySelectorAll('.page');

        navItems.forEach(item => {
            if (!item._navBound) {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    const targetPage = item.getAttribute('data-page');

                    // Collapse sidebar and lock to prevent immediate reopening
                    this.collapseSidebarAndLock();

                    // No special handling needed for Client Management - it has its own page now

                    this.navigateToPage(targetPage);
                });
                item._navBound = true;
            }
        });
    }

    async navigateToPage(pageName, params = {}) {
        // Clean up previous page memory BEFORE navigating
        if (this.currentPage && this.currentPage !== pageName) {
            this.cleanupPageMemory(this.currentPage);
        }

        // Update current page tracking
        this.currentPage = pageName;

        // Handle URL parameters for specific pages
        if (pageName === 'email-detail' && params.emailId) {
            const url = new URL(window.location);
            url.searchParams.set('emailId', params.emailId);
            window.history.pushState({}, '', url);
        }

        // Lazy load page scripts if needed
        if (window.loadPageScripts && typeof window.loadPageScripts === 'function') {
            try {
                await window.loadPageScripts(pageName);
            } catch (error) {
                console.error(`[CRM] Error loading scripts for ${pageName}:`, error);
            }
        }

        // Use View Transitions API for smooth page transitions
        const performNavigation = () => {
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
        };

        // Check if View Transitions API is supported
        if (document.startViewTransition) {
            // Determine transition scope based on page type
            const isSettingsPage = pageName === 'settings';
            const isFromSettingsPage = this.currentPage === 'settings';

            if (isSettingsPage || isFromSettingsPage) {
                // Settings page: whole screen transition (since it takes up full screen)
                document.startViewTransition(() => {
                    // Set view transition name for settings page
                    document.documentElement.style.viewTransitionName = 'settings-page';
                    performNavigation();
                });
            } else {
                // Other pages: scoped transition to page container only
                // This prevents top bar, sidebar, widgets, and surrounding area from fading
                const pageContainer = document.querySelector('.page-container');
                if (pageContainer) {
                    document.startViewTransition(() => {
                        // Set view transition name for page container
                        pageContainer.style.viewTransitionName = 'page-container';
                        performNavigation();
                    });
                } else {
                    // Fallback to whole screen if page container not found
                    document.startViewTransition(performNavigation);
                }
            }
        } else {
            // Fallback for browsers that don't support View Transitions API
            performNavigation();
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

        // Contact detail page - initialize contact detail functionality
        if (pageName === 'contact-detail') {
            setTimeout(() => {
                if (window.ContactDetail && typeof window.ContactDetail.init === 'function') {
                    window.ContactDetail.init();
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

        // Client Management page - initialize client management dashboard
        if (pageName === 'client-management') {
            setTimeout(() => {
                if (window.ClientManagement && typeof window.ClientManagement.show === 'function') {
                    window.ClientManagement.show();
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
                // DON'T re-init if we're restoring from back navigation
                if (window.__restoringListDetail) {
                    console.log('[Main] Skipping ListDetail.init() - restoring from back navigation');
                    return;
                }

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

        // Email Detail page - initialize email detail functionality
        if (pageName === 'email-detail') {
            setTimeout(() => {
                if (window.EmailDetail && typeof window.EmailDetail.init === 'function') {
                    window.EmailDetail.init();
                }

                // Check if we have an emailId parameter to show
                const urlParams = new URLSearchParams(window.location.search);
                const emailId = urlParams.get('emailId');
                if (emailId && window.EmailDetail && typeof window.EmailDetail.show === 'function') {
                    window.EmailDetail.show(emailId);
                }
            }, 100);
        }

        // Emails page - initialize emails functionality
        if (pageName === 'emails') {
            setTimeout(() => {
                if (window.EmailsPage && typeof window.EmailsPage.init === 'function') {
                    window.EmailsPage.init();
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

    // Setup Refresh Data Button
    setupRefreshButton() {
        const refreshBtn = document.getElementById('refresh-data-btn');
        if (!refreshBtn) {
            console.warn('[CRM] Refresh button not found');
            return;
        }

        refreshBtn.addEventListener('click', async () => {
            try {
                // Show visual feedback
                refreshBtn.style.opacity = '0.5';
                refreshBtn.disabled = true;

                console.log('[CRM] Refreshing all data...');

                // Invalidate all caches
                if (window.CacheManager && typeof window.CacheManager.invalidateAll === 'function') {
                    await window.CacheManager.invalidateAll();
                    this.showToast('Data refreshed successfully', 'success');

                    // Reload current page to fetch fresh data
                    const currentPage = this.currentPage;
                    if (currentPage) {
                        // Force reload by clearing loaded flags
                        if (window.peopleModule && currentPage === 'people') {
                            window.peopleModule.state.loaded = false;
                            window.peopleModule.loadDataOnce();
                        } else if (window.accountsModule && currentPage === 'accounts') {
                            window.accountsModule.state.loaded = false;
                            window.accountsModule.loadDataOnce();
                        } else if (window.callsModule && currentPage === 'calls') {
                            window.callsModule.state.loaded = false;
                            window.callsModule.loadDataOnce();
                        } else {
                            // For other pages, just reload the browser
                            location.reload();
                        }
                    }
                } else {
                    console.warn('[CRM] CacheManager not available');
                    this.showToast('Refresh not available', 'error');
                }
            } catch (error) {
                console.error('[CRM] Error refreshing data:', error);
                this.showToast('Error refreshing data', 'error');
            } finally {
                // Restore button state
                refreshBtn.style.opacity = '1';
                refreshBtn.disabled = false;
            }
        });

        console.log('[CRM] Refresh button initialized');
    }

    // Sidebar Hover Effects
    setupSidebarHover() {
        const sidebar = this.sidebar;
        if (!sidebar) return;

        // Helpers with requestAnimationFrame for smooth animations
        const openSidebar = () => {
            // Only open if not locked AND mouse has moved (prevents accidental reopening)
            if (!this.sidebarLockCollapse && this.sidebarMouseMoved) {
                // Use requestAnimationFrame for smoother animation
                requestAnimationFrame(() => {
                    sidebar.classList.add('expanded');
                });
            }
        };

        const closeSidebar = () => {
            if (!this.sidebarPointerInside) {
                // Use requestAnimationFrame for smoother animation
                requestAnimationFrame(() => {
                    sidebar.classList.remove('expanded');
                });
            }
        };

        if (!sidebar._hoverBound) {
            // Pointer-based hover inside the sidebar (passive for better performance)
            sidebar.addEventListener('pointerenter', () => {
                this.sidebarPointerInside = true;
                if (this.sidebarLockCollapse) return; // Don't open if locked
                if (this.sidebarCloseTimer) clearTimeout(this.sidebarCloseTimer);
                // Small show delay to avoid accidental flicker
                this.sidebarOpenTimer = setTimeout(openSidebar, 90);
            }, { passive: true });

            sidebar.addEventListener('pointerleave', () => {
                this.sidebarPointerInside = false;
                if (!this.sidebarLockCollapse) {
                    // Small hide delay for smoother exit
                    this.sidebarCloseTimer = setTimeout(closeSidebar, 150);
                }
            }, { passive: true });

            // Track mouse movement globally for movement detection (passive for better performance)
            document.addEventListener('pointermove', (e) => {
                // Throttle edge detection for performance (every 50ms max)
                const now = Date.now();
                const shouldCheckEdge = now - this.sidebarLastEdgeCheck >= 50;

                // Check if mouse has moved significantly (5px threshold)
                const movedX = Math.abs(e.clientX - this.sidebarLastMouseX);
                const movedY = Math.abs(e.clientY - this.sidebarLastMouseY);
                if (movedX > 5 || movedY > 5) {
                    this.sidebarMouseMoved = true;
                    this.sidebarLastMouseX = e.clientX;
                    this.sidebarLastMouseY = e.clientY;
                }

                // Edge-trigger: open when pointer approaches left edge (throttled)
                if (shouldCheckEdge) {
                    this.sidebarLastEdgeCheck = now;

                    if (this.sidebarLockCollapse || sidebar.classList.contains('click-locked')) return;

                    const edgeWidth = 12; // px
                    if (e.clientX <= edgeWidth) {
                        if (this.sidebarCloseTimer) clearTimeout(this.sidebarCloseTimer);
                        if (!sidebar.classList.contains('expanded')) {
                            if (this.sidebarOpenTimer) clearTimeout(this.sidebarOpenTimer);
                            this.sidebarOpenTimer = setTimeout(openSidebar, 90);
                        }
                    } else if (!this.sidebarPointerInside) {
                        if (this.sidebarOpenTimer) clearTimeout(this.sidebarOpenTimer);
                        // Debounced close when pointer moves away from edge and not inside
                        this.sidebarCloseTimer = setTimeout(closeSidebar, 150);
                    }
                }
            }, { passive: true }); // Passive listener prevents blocking the main thread

            // Collapse on hashchange/navigation to ensure closed state during page load
            window.addEventListener('hashchange', () => {
                this.collapseSidebarAndLock(1200);
            });

            sidebar._hoverBound = true;
        }
    }

    // Collapse sidebar and lock it to prevent immediate reopening
    collapseSidebarAndLock(duration = 1200) {
        if (!this.sidebar) return;

        // Use requestAnimationFrame for smoother collapse animation
        requestAnimationFrame(() => {
            this.sidebar.classList.add('click-locked');
            this.sidebarLockCollapse = true;
            this.sidebarMouseMoved = false; // Reset movement flag
            this.clearSidebarTimers();
            this.sidebar.classList.remove('expanded');
        });

        // Capture current mouse position for movement detection
        const captureCurrentPosition = (e) => {
            this.sidebarLastMouseX = e.clientX;
            this.sidebarLastMouseY = e.clientY;
            document.removeEventListener('pointermove', captureCurrentPosition, { once: true });
        };
        document.addEventListener('pointermove', captureCurrentPosition, { once: true });

        // Unlock after duration
        setTimeout(() => {
            requestAnimationFrame(() => {
                this.sidebar.classList.remove('click-locked');
                this.sidebarLockCollapse = false;
                // Don't clear pointerInside - let natural pointerleave event handle it
            });
        }, duration);
    }

    // Clear sidebar timers helper
    clearSidebarTimers() {
        if (this.sidebarOpenTimer) clearTimeout(this.sidebarOpenTimer);
        if (this.sidebarCloseTimer) clearTimeout(this.sidebarCloseTimer);
        this.sidebarOpenTimer = this.sidebarCloseTimer = null;
    }

    // Search Functionality
    setupSearchFunctionality() {
        const searchInput = document.querySelector('.search-input');
        const searchBtn = document.querySelector('.search-btn');

        if (!searchInput._searchBound) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.performSearch(searchInput.value);
                }
            });
            searchInput._searchBound = true;
        }

        if (!searchBtn._searchBound) {
            searchBtn.addEventListener('click', () => {
                this.performSearch(searchInput.value);
            });
            searchBtn._searchBound = true;
        }

        // Small search inputs in pages
        const smallSearchInputs = document.querySelectorAll('.search-input-small');
        smallSearchInputs.forEach(input => {
            if (!input._smallSearchBound) {
                input.addEventListener('input', (e) => {
                    this.filterPageContent(e.target.value);
                });
                input._smallSearchBound = true;
            }
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
        if (modalType === 'add-deal') {
            // Handle via deals.js
            if (window.Deals && typeof window.Deals.openModal === 'function') {
                window.Deals.openModal();
            }
            return;
        }
        if (modalType === 'create-post') {
            // Handle via post-editor.js
            if (window.PostEditor && typeof window.PostEditor.openCreate === 'function') {
                window.PostEditor.openCreate();
            } else {
                this.showToast('Post editor is loading...', 'info');
            }
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
            // Ensure we have valid dimensions
            if (ttRect.width === 0 || ttRect.height === 0) {
                console.warn('[Tooltip] Tooltip has zero dimensions, retrying...');
                // Force another reflow and try again
                tooltipEl.offsetHeight;
                const newTtRect = tooltipEl.getBoundingClientRect();
                if (newTtRect.width === 0 || newTtRect.height === 0) {
                    console.warn('[Tooltip] Tooltip still has zero dimensions, using fallback positioning');
                    // Fallback: position above element without centering
                    tooltipEl.style.left = `${rect.left}px`;
                    tooltipEl.style.top = `${rect.top - 30}px`;
                    tooltipEl.dataset.placement = 'top';
                    return;
                }
            }

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
                // Temporarily make tooltip visible for accurate measurement
                tooltipEl.style.visibility = 'visible';
                tooltipEl.style.opacity = '0';
                // Force a reflow to ensure the tooltip has been rendered with the text
                tooltipEl.offsetHeight; // This forces a reflow
                positionTooltip(el);
                // Now make it fully visible
                tooltipEl.style.visibility = 'visible';
                tooltipEl.style.opacity = '1';
            });
            // Link for a11y
            try { el.setAttribute('aria-describedby', 'pc-tooltip'); } catch (_) { }
        };

        const hideTooltip = () => {
            if (!tooltipEl) return;
            tooltipEl.classList.remove('visible');
            tooltipEl.style.opacity = '0';
            tooltipEl.style.visibility = 'hidden';
            if (anchorEl) {
                try { anchorEl.removeAttribute('aria-describedby'); } catch (_) { }
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

        if (!document._tooltipKeydownBound) {
            document.addEventListener('keydown', onKeyForModality, true);
            document._tooltipKeydownBound = true;
        }
        if (!document._tooltipMousedownBound) {
            document.addEventListener('mousedown', onPointerStart, true);
            document._tooltipMousedownBound = true;
        }
        if (!document._tooltipTouchstartBound) {
            document.addEventListener('touchstart', onPointerStart, { passive: true, capture: true });
            document._tooltipTouchstartBound = true;
        }

        // Use delegation so dynamically-added nodes are handled automatically
        if (!document._tooltipMouseenterBound) {
            document.addEventListener('mouseenter', handleEnter, true);
            document._tooltipMouseenterBound = true;
        }
        if (!document._tooltipFocusinBound) {
            document.addEventListener('focusin', handleEnter, true);
            document._tooltipFocusinBound = true;
        }
        if (!document._tooltipMouseleaveBound) {
            document.addEventListener('mouseleave', handleLeave, true);
            document._tooltipMouseleaveBound = true;
        }
        if (!document._tooltipFocusoutBound) {
            document.addEventListener('focusout', handleLeave, true);
            document._tooltipFocusoutBound = true;
        }
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
            if (!btn._quickActionBound) {
                btn.addEventListener('click', () => {
                    const action = btn.textContent.trim();
                    this.handleQuickAction(action);
                });
                btn._quickActionBound = true;
            }
        });

        // Filter tabs (Tasks page only)
        const tasksPage = document.getElementById('tasks-page');
        const filterTabs = tasksPage ? tasksPage.querySelectorAll('.filter-tab') : [];
        filterTabs.forEach(tab => {
            if (!tab._filterTabBound) {
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
                tab._filterTabBound = true;
            }
        });

        // Action buttons in tables
        if (!document._actionButtonsBound) {
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
            document._actionButtonsBound = true;
        }

        // Top bar: Phone button toggle for Phone widget
        const phoneBtn = document.querySelector('.call-btn');
        if (phoneBtn && !phoneBtn._phoneBound) {
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
            phoneBtn._phoneBound = true;
        }

        // Top bar: Scripts button -> navigate to Call Scripts page
        const scriptsBtn = document.getElementById('scripts-btn');
        if (scriptsBtn && !scriptsBtn._scriptsBound) {
            scriptsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateToPage('call-scripts');
            });
            scriptsBtn._scriptsBound = true;
        }
    }

    handleQuickAction(action) {
        switch (action) {
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

        // Show modal with animation
        modal.removeAttribute('hidden');

        // Trigger animation after a brief delay to ensure DOM is ready
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });

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

        // Reset to step 1 and ensure it's visible
        this.showCSVStep(modal, 1);

        // Reset buttons
        const nextBtn1 = modal.querySelector('#csv-next-step-1');
        if (nextBtn1) nextBtn1.disabled = true;

        // Reset Step 3 completion state
        const progressDiv = modal.querySelector('#csv-import-progress');
        const resultsDiv = modal.querySelector('#csv-import-results');
        const summaryDiv = modal.querySelector('#csv-results-summary');
        const startBtn = modal.querySelector('#csv-start-import');
        const finishBtn = modal.querySelector('#csv-finish-import');
        const reviewSummary = modal.querySelector('#csv-review-summary');
        const finalPreview = modal.querySelector('#csv-final-preview');

        if (progressDiv) progressDiv.hidden = true;
        if (resultsDiv) resultsDiv.hidden = true;
        if (summaryDiv) summaryDiv.innerHTML = '';
        if (startBtn) startBtn.hidden = false;
        if (finishBtn) finishBtn.hidden = true;
        if (reviewSummary) reviewSummary.innerHTML = '';
        if (finalPreview) finalPreview.innerHTML = '';

        // Clear any stored data
        modal._csvData = null;
        modal._csvHeaders = null;
        modal._csvRows = null;
        modal._importType = 'contacts';

        // Reset import type radio buttons to contacts
        const typeInputs = modal.querySelectorAll('input[name="importType"]');
        typeInputs.forEach(input => {
            input.checked = (input.value === 'contacts');
        });

        // Reset list dropdown selection
        delete modal.dataset.selectedListId;
        delete modal.dataset.selectedListName;
        const trigger = modal.querySelector('#csv-list-trigger .selected-list-name');
        if (trigger) trigger.textContent = 'No list assignment';
        const dropdown = modal.querySelector('#csv-list-dropdown');
        if (dropdown) dropdown.hidden = true;

        // Clean up event listeners
        if (modal._csvDropdownCleanup) {
            modal._csvDropdownCleanup.forEach(cleanup => cleanup());
            modal._csvDropdownCleanup = [];
        }

        // Reset initialization flag
        modal._csvDropdownInitialized = false;
    }

    bindBulkImportEvents(modal) {
        // Close button handlers
        modal.querySelectorAll('[data-close="bulk-import"]').forEach(btn => {
            btn.addEventListener('click', () => {
                // Start exit animation
                modal.classList.remove('show');

                // Hide modal after animation completes
                setTimeout(() => {
                    modal.setAttribute('hidden', '');
                    // Reset modal to initial state for next import
                    this.resetBulkImportModal(modal);
                }, 300); // Match CSS transition duration
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
        if (browseBtn && !browseBtn._csvBrowseBound) {
            browseBtn.addEventListener('click', () => {
                fileInput.click();
            });
            browseBtn._csvBrowseBound = true;
        }

        // File input change
        if (fileInput && !fileInput._csvFileInputBound) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleFileSelection(modal, e.target.files[0]);
                }
            });
            fileInput._csvFileInputBound = true;
        }

        // Drag and drop
        if (dropZone && !dropZone._csvDropZoneBound) {
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
            dropZone._csvDropZoneBound = true;
        }

        // Remove file button
        if (removeBtn && !removeBtn._csvRemoveBound) {
            removeBtn.addEventListener('click', () => {
                this.removeSelectedFile(modal);
            });
            removeBtn._csvRemoveBound = true;
        }
    }

    setupImportTypeSelection(modal) {
        const typeInputs = modal.querySelectorAll('input[name="importType"]');

        // Set initial import type based on which radio is checked
        const checkedInput = Array.from(typeInputs).find(input => input.checked);
        if (checkedInput) {
            modal._importType = checkedInput.value;
        }

        // Listen for changes and refresh list dropdown when type changes
        typeInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                modal._importType = e.target.value;

                // Refresh list dropdown to show correct kind of lists
                // Only refresh if we're on step 2 (where the list dropdown is visible)
                const step2 = modal.querySelector('#csv-step-2');
                if (step2 && !step2.hidden) {
                    this.populateListAssignment(modal);
                }
            });
        });
    }

    setupStepNavigation(modal) {
        // Step 1 -> 2
        const nextBtn1 = modal.querySelector('#csv-next-step-1');
        if (nextBtn1) {
            nextBtn1.addEventListener('click', () => {
                console.log('Next button clicked, CSV data:', modal._csvData);
                console.log('CSV headers:', modal._csvHeaders);
                console.log('CSV rows:', modal._csvRows);

                if (modal._csvData) {
                    this.generateFieldMapping(modal);
                    this.showCSVStep(modal, 2);
                } else {
                    console.error('No CSV data found!');
                    this.showToast('Please upload a CSV file first');
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

        if (startBtn && !startBtn._csvStartBound) {
            startBtn.addEventListener('click', () => {
                this.startImport(modal);
            });
            startBtn._csvStartBound = true;
        }

        if (finishBtn && !finishBtn._csvFinishBound) {
            finishBtn.addEventListener('click', () => {
                // Start exit animation
                modal.classList.remove('show');

                // Hide modal after animation completes
                setTimeout(() => {
                    modal.setAttribute('hidden', '');
                    // Reset modal to initial state for next import
                    this.resetBulkImportModal(modal);
                    // Trigger a page refresh if we're on contacts/accounts page
                    if (this.currentPage === 'people' || this.currentPage === 'accounts') {
                        window.location.reload();
                    }
                }, 300); // Match CSS transition duration
            });
            finishBtn._csvFinishBound = true;
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

            console.log('CSV data stored successfully:');
            console.log('Headers:', headers);
            console.log('Rows count:', rows.length);
            console.log('First few rows:', rows.slice(0, 2));

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
        console.log(`Switching to step ${stepNumber}`);

        // Hide all steps immediately
        modal.querySelectorAll('.csv-step-content').forEach(step => {
            if (step.id !== `csv-step-${stepNumber}`) {
                step.classList.remove('active');
                step.hidden = true;
            }
        });

        // Show target step
        const targetStep = modal.querySelector(`#csv-step-${stepNumber}`);
        if (targetStep) {
            console.log(`Found target step: ${targetStep.id}`);
            targetStep.hidden = false;

            // Trigger fade-in animation
            requestAnimationFrame(() => {
                targetStep.classList.add('active');
            });
        } else {
            console.error(`Target step #csv-step-${stepNumber} not found`);
        }

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
        console.log('generateFieldMapping called');
        console.log('CSV headers:', modal._csvHeaders);

        if (!modal._csvHeaders) {
            console.error('No CSV headers found!');
            return;
        }

        const previewTable = modal.querySelector('#csv-preview-table');
        const mappingList = modal.querySelector('#csv-field-mapping');

        console.log('Preview table element:', previewTable);
        console.log('Mapping list element:', mappingList);

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
            console.log('Preview table HTML generated:', tableHTML.substring(0, 200) + '...');
        }

        // Generate field mapping
        if (mappingList) {
            const importType = modal._importType || 'contacts';
            console.log('Import type:', importType);
            const crmFields = this.getCRMFields(importType);
            console.log('CRM fields:', crmFields);
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
                    `<option value="${field.value}" ${this.suggestMapping(header, field) ? 'selected' : ''
                    }>${field.label}</option>`
                ).join('')}
                            </select>
                        </div>
                    </div>
                `;
            });

            mappingList.innerHTML = mappingHTML;
            console.log('Mapping HTML generated:', mappingHTML.substring(0, 200) + '...');
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
        const dropdown = modal.querySelector('#csv-list-dropdown');
        if (!dropdown) return;

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

            // Build dropdown HTML
            let dropdownHTML = `
                <div class="csv-list-create-form" id="csv-list-create-form">
                    <div class="form-title">Create New List</div>
                    <input type="text" class="input-dark" id="csv-new-list-name" placeholder="Enter list name">
                    <div class="form-actions">
                        <button type="button" class="btn-secondary" id="csv-create-cancel">Cancel</button>
                        <button type="button" class="btn-primary" id="csv-create-save">Save</button>
                    </div>
                </div>
                <div class="csv-list-items" id="csv-list-items">
                    <div class="csv-list-item create-new" data-action="create">
                        <span class="list-name">
                            <span class="list-icon">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="8" y1="4" x2="8" y2="12"></line>
                                    <line x1="4" y1="8" x2="12" y2="8"></line>
                                </svg>
                            </span>
                            Create New List
                        </span>
                    </div>
                    <div class="csv-list-item" data-list-id="" data-list-name="No list assignment">
                        <span class="list-name">No list assignment</span>
                    </div>
            `;

            // Add list items
            lists.forEach(list => {
                const count = list.count || list.recordCount || 0;
                dropdownHTML += `
                    <div class="csv-list-item" data-list-id="${this.escapeHtml(list.id)}" data-list-name="${this.escapeHtml(list.name || 'Unnamed List')}">
                        <span class="list-name">${this.escapeHtml(list.name || 'Unnamed List')}</span>
                        <span class="list-count">(${count})</span>
                    </div>
                `;
            });

            dropdownHTML += `</div>`;
            dropdown.innerHTML = dropdownHTML;

            // Style the dropdown panel itself
            dropdown.style.borderRadius = 'var(--border-radius)';
            dropdown.style.border = '1px solid var(--border-light)';
            dropdown.style.overflow = 'hidden'; // Ensure content respects rounded corners

            // Ensure create form is hidden by default using inline styles
            const createForm = dropdown.querySelector('#csv-list-create-form');
            if (createForm) {
                createForm.style.display = 'none';
            }

            // Apply styles to list items container
            const listItemsContainer = dropdown.querySelector('#csv-list-items');
            if (listItemsContainer) {
                listItemsContainer.style.display = 'flex';
                listItemsContainer.style.flexDirection = 'column';
            }

            // Apply inline styles to all list items for guaranteed styling
            const allListItems = dropdown.querySelectorAll('.csv-list-item');
            allListItems.forEach(item => {
                item.style.display = 'flex';
                item.style.alignItems = 'center';
                item.style.justifyContent = 'space-between';
                item.style.padding = '10px 12px';
                item.style.cursor = 'pointer';
                item.style.borderBottom = '1px solid var(--border-light)';
                item.style.transition = 'background-color 0.15s ease';
                item.style.color = 'var(--text-primary)';

                // Style list name and count
                const listName = item.querySelector('.list-name');
                const listCount = item.querySelector('.list-count');
                if (listName) {
                    listName.style.fontSize = '0.9rem';
                    listName.style.fontWeight = '500';
                }
                if (listCount) {
                    listCount.style.fontSize = '0.85rem';
                    listCount.style.color = 'var(--text-secondary)';
                    listCount.style.opacity = '0.8';
                }

                // Special styling for "Create New List"
                if (item.classList.contains('create-new')) {
                    item.style.borderBottom = '2px solid var(--border-medium)';
                    item.style.fontWeight = '600';
                    item.style.color = 'var(--orange-primary)';

                    const icon = item.querySelector('.list-icon');
                    if (icon) {
                        icon.style.display = 'inline-flex';
                        icon.style.alignItems = 'center';
                        icon.style.marginRight = '6px';
                    }
                }

                // Hover effects
                item.addEventListener('mouseenter', () => {
                    if (item.classList.contains('create-new')) {
                        item.style.background = 'var(--orange-subtle)';
                        item.style.color = 'white';
                    } else {
                        item.style.background = 'var(--grey-800)';
                    }
                });

                item.addEventListener('mouseleave', () => {
                    if (!item.classList.contains('selected')) {
                        item.style.background = '';
                        if (item.classList.contains('create-new')) {
                            item.style.color = 'var(--orange-primary)';
                        } else {
                            item.style.color = 'var(--text-primary)';
                        }
                    }
                });
            });

            // Initialize dropdown interaction handlers
            this.initCustomListDropdown(modal);

        } catch (error) {
            console.error('Failed to load lists for assignment:', error);
        }
    }

    initCustomListDropdown(modal) {
        const trigger = modal.querySelector('#csv-list-trigger');
        const dropdown = modal.querySelector('#csv-list-dropdown');
        if (!trigger || !dropdown) return;

        // Check if already initialized to prevent duplicate listeners
        if (modal._csvDropdownInitialized) {
            return;
        }
        modal._csvDropdownInitialized = true;

        // Toggle dropdown on trigger click
        const handleTriggerClick = (e) => {
            e.stopPropagation();
            const isOpen = !dropdown.hidden;

            if (isOpen) {
                dropdown.hidden = true;
                trigger.classList.remove('open');
            } else {
                dropdown.hidden = false;
                trigger.classList.add('open');
            }
        };
        trigger.addEventListener('click', handleTriggerClick);

        // Handle list item clicks
        const handleDropdownClick = (e) => {
            const listItem = e.target.closest('.csv-list-item');
            if (!listItem) return;

            const action = listItem.dataset.action;
            if (action === 'create') {
                this.showInlineListCreateForm(modal, dropdown);
                return;
            }

            const listId = listItem.dataset.listId || '';
            const listName = listItem.dataset.listName || 'No list assignment';
            this.handleListSelection(modal, listId, listName);
        };
        dropdown.addEventListener('click', handleDropdownClick);

        // Close dropdown when clicking outside
        const closeDropdown = (e) => {
            if (!modal.contains(e.target)) return;
            if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.hidden = true;
                trigger.classList.remove('open');
            }
        };
        document.addEventListener('click', closeDropdown);

        // Keyboard support
        const handleKeydown = (e) => {
            if (e.key === 'Escape' && !dropdown.hidden) {
                dropdown.hidden = true;
                trigger.classList.remove('open');
                trigger.focus();
            }
        };
        document.addEventListener('keydown', handleKeydown);

        // Store cleanup functions on modal
        if (!modal._csvDropdownCleanup) {
            modal._csvDropdownCleanup = [];
        }
        modal._csvDropdownCleanup.push(() => {
            trigger.removeEventListener('click', handleTriggerClick);
            dropdown.removeEventListener('click', handleDropdownClick);
            document.removeEventListener('click', closeDropdown);
            document.removeEventListener('keydown', handleKeydown);
            modal._csvDropdownInitialized = false;
        });
    }

    handleListSelection(modal, listId, listName) {
        const trigger = modal.querySelector('#csv-list-trigger');
        const dropdown = modal.querySelector('#csv-list-dropdown');
        const selectedNameSpan = trigger?.querySelector('.selected-list-name');

        if (!trigger || !dropdown) return;

        // Update trigger text
        if (selectedNameSpan) {
            selectedNameSpan.textContent = listName;
        }

        // Store selection in modal dataset
        modal.dataset.selectedListId = listId;
        modal.dataset.selectedListName = listName;
        console.log('List selection saved:', listId, listName);

        // Update selected state in dropdown
        const allItems = dropdown.querySelectorAll('.csv-list-item:not(.create-new)');
        allItems.forEach(item => {
            const itemId = item.dataset.listId || '';
            if (itemId === listId) {
                item.classList.add('selected');
                item.style.background = 'var(--primary-700)';
                item.style.color = 'white';
            } else {
                item.classList.remove('selected');
                item.style.background = '';
                item.style.color = 'var(--text-primary)';
            }
        });

        // Close dropdown
        dropdown.hidden = true;
        trigger.classList.remove('open');
    }

    showInlineListCreateForm(modal, dropdown) {
        const createForm = dropdown.querySelector('#csv-list-create-form');
        const listItems = dropdown.querySelector('#csv-list-items');
        const nameInput = dropdown.querySelector('#csv-new-list-name');
        const saveBtn = dropdown.querySelector('#csv-create-save');
        const cancelBtn = dropdown.querySelector('#csv-create-cancel');

        if (!createForm || !listItems) return;

        // Hide list items, show create form using inline styles
        listItems.style.display = 'none';
        createForm.style.display = 'block';
        createForm.style.padding = '12px';
        createForm.style.borderBottom = '1px solid var(--border-light)';
        createForm.style.animation = 'formSlideIn 0.3s ease-out forwards';

        // Style the input field
        if (nameInput) {
            nameInput.style.width = '100%';
            nameInput.style.marginBottom = '10px';
        }

        // Focus input
        setTimeout(() => nameInput?.focus(), 100);

        // Handle save
        const handleSave = async () => {
            const name = nameInput?.value?.trim();
            if (!name) {
                nameInput?.focus();
                return;
            }

            try {
                const db = window.firebaseDB;
                if (!db) {
                    this.showToast('Database not available');
                    return;
                }

                const importType = modal._importType || 'contacts';
                const listKind = importType === 'accounts' ? 'accounts' : 'people';

                // Create new list
                const payload = {
                    name,
                    kind: listKind,
                    count: 0,
                    recordCount: 0,
                    ownerId: window.currentUserEmail || '',
                    createdBy: window.currentUserEmail || '',
                    assignedTo: window.currentUserEmail || ''
                };

                if (window.firebase?.firestore?.FieldValue?.serverTimestamp) {
                    payload.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
                    payload.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
                } else {
                    payload.createdAt = new Date();
                    payload.updatedAt = new Date();
                }

                const ref = await db.collection('lists').add(payload);
                const newListId = ref.id;

                // Notify lists overview page of new list creation
                try {
                    document.dispatchEvent(new CustomEvent('pc:list-created', {
                        detail: {
                            id: newListId,
                            list: { id: newListId, ...payload },
                            kind: listKind
                        }
                    }));
                } catch (_) { /* noop */ }

                // Select the new list
                this.handleListSelection(modal, newListId, name);

                // Reset form
                nameInput.value = '';
                createForm.style.display = 'none';
                listItems.style.display = '';

                // Refresh dropdown to show the new list
                await this.populateListAssignment(modal);

                // Re-select the newly created list
                this.handleListSelection(modal, newListId, name);

                this.showToast(`Created list "${name}"`);

            } catch (error) {
                console.error('Failed to create list:', error);
                this.showToast('Failed to create list');
            }
        };

        // Handle cancel
        const handleCancel = () => {
            nameInput.value = '';
            createForm.style.display = 'none';
            listItems.style.display = '';
        };

        // Bind buttons (remove old listeners first)
        const newSaveBtn = saveBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        saveBtn.replaceWith(newSaveBtn);
        cancelBtn.replaceWith(newCancelBtn);

        newSaveBtn.addEventListener('click', handleSave);
        newCancelBtn.addEventListener('click', handleCancel);

        // Enter key to save
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
            }
        });
    }

    async assignToList(db, recordId, modal) {
        // Get selected list ID from modal dataset (new custom dropdown)
        const listId = modal.dataset.selectedListId;
        if (!listId) {
            console.log('No list selected, skipping list assignment for record:', recordId);
            return;
        }
        console.log('Assigning record to list:', recordId, 'listId:', listId);

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

                // Increment list count
                try {
                    const increment = window.firebase?.firestore?.FieldValue?.increment?.(1);
                    if (increment) {
                        await db.collection('lists').doc(listId).update({
                            count: increment,
                            recordCount: increment,
                            updatedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date()
                        });
                    }
                } catch (countError) {
                    console.error('Failed to update list count:', countError);
                }
            }
        } catch (error) {
            console.error('Failed to assign record to list:', error);
        }
    }

    async batchAssignToList(db, assignments) {
        if (!assignments || assignments.length === 0) return;

        try {
            // Group assignments by listId and targetType
            const grouped = {};
            assignments.forEach(assignment => {
                const key = `${assignment.listId}-${assignment.targetType}`;
                if (!grouped[key]) {
                    grouped[key] = {
                        listId: assignment.listId,
                        targetType: assignment.targetType,
                        recordIds: []
                    };
                }
                grouped[key].recordIds.push(assignment.recordId);
            });

            // Process each group
            for (const [key, group] of Object.entries(grouped)) {
                const { listId, targetType, recordIds } = group;

                // 1. Get all existing members in one query
                const existingQuery = await db.collection('listMembers')
                    .where('listId', '==', listId)
                    .where('targetType', '==', targetType)
                    .get();

                const existingIds = new Set(existingQuery.docs.map(doc => doc.data().targetId));

                // 2. Filter out records already in list
                const newRecordIds = recordIds.filter(id => !existingIds.has(id));

                if (newRecordIds.length === 0) {
                    console.log(`All ${recordIds.length} ${targetType} already in list ${listId}`);
                    continue;
                }

                // Get user email for ownership (required for Firestore rules compliance)
                const getUserEmail = () => {
                    try {
                        if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
                            const email = window.DataManager.getCurrentUserEmail();
                            if (email && typeof email === 'string' && email.trim()) {
                                return email.toLowerCase().trim();
                            }
                        }
                        const email = window.currentUserEmail || '';
                        if (email && typeof email === 'string' && email.trim()) {
                            return email.toLowerCase().trim();
                        }
                    } catch (_) {
                        const email = window.currentUserEmail || '';
                        if (email && typeof email === 'string' && email.trim()) {
                            return email.toLowerCase().trim();
                        }
                    }
                    return 'l.patterson@powerchoosers.com';
                };
                const userEmail = getUserEmail();

                // 3. Batch write all new assignments
                const batch = db.batch();
                newRecordIds.forEach(recordId => {
                    const docRef = db.collection('listMembers').doc();
                    batch.set(docRef, {
                        listId: listId,
                        targetId: recordId,
                        targetType: targetType,
                        // CRITICAL: Set ownership fields for Firestore rules compliance
                        ownerId: userEmail,
                        assignedTo: userEmail,
                        createdBy: userEmail,
                        addedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || Date.now()
                    });
                });

                await batch.commit();

                // 4. CRITICAL FIX: Calculate ACTUAL count from listMembers collection (ensures accuracy)
                // This is more reliable than incrementing, especially after bulk imports
                try {
                    const actualCountQuery = await db.collection('listMembers')
                        .where('listId', '==', listId)
                        .where('targetType', '==', targetType)
                        .get();

                    const actualCount = actualCountQuery.size;

                    // Update list document with actual count
                    await db.collection('lists').doc(listId).update({
                        count: actualCount,
                        recordCount: actualCount,
                        updatedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date()
                    });

                    console.log(`✓ Updated list ${listId} with actual count: ${actualCount} ${targetType}`);

                    // Update BackgroundListsLoader cache immediately (cost-effective: no Firestore read)
                    if (window.BackgroundListsLoader && typeof window.BackgroundListsLoader.updateListCountLocally === 'function') {
                        window.BackgroundListsLoader.updateListCountLocally(listId, actualCount);
                    }

                    // Update CacheManager cache (cost-effective: IndexedDB write only)
                    if (window.CacheManager && typeof window.CacheManager.updateRecord === 'function') {
                        window.CacheManager.updateRecord('lists', listId, {
                            recordCount: actualCount,
                            count: actualCount,
                            updatedAt: new Date()
                        }).catch(err => console.warn('[Main] CacheManager update failed:', err));
                    }

                    // Dispatch event for lists page to refresh with ACTUAL count
                    try {
                        document.dispatchEvent(new CustomEvent('pc:list-updated', {
                            detail: {
                                id: listId,
                                recordCount: actualCount, // Send actual count
                                targetType: targetType,
                                isActualCount: true // Flag to indicate this is actual count, not increment
                            }
                        }));

                        // Also dispatch count-updated event for lists-overview
                        document.dispatchEvent(new CustomEvent('pc:list-count-updated', {
                            detail: {
                                listId: listId,
                                newCount: actualCount,
                                kind: targetType
                            }
                        }));
                    } catch (_) { }
                } catch (countError) {
                    console.error('Failed to calculate actual list count:', countError);
                    // Fallback to increment if count query fails
                    const increment = window.firebase?.firestore?.FieldValue?.increment?.(newRecordIds.length);
                    if (increment) {
                        await db.collection('lists').doc(listId).update({
                            count: increment,
                            recordCount: increment,
                            updatedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date()
                        });
                    }
                }

                console.log(`✓ Batch assigned ${newRecordIds.length} ${targetType} to list ${listId} (${recordIds.length - newRecordIds.length} already existed)`);

                // 5. Invalidate cache for this list so list detail page will refresh
                if (window.CacheManager && typeof window.CacheManager.invalidateListCache === 'function') {
                    try {
                        await window.CacheManager.invalidateListCache(listId);
                        console.log(`✓ Cache invalidated for list ${listId}`);
                    } catch (cacheError) {
                        console.warn('Cache invalidation failed:', cacheError);
                    }
                }
            }

        } catch (error) {
            console.error('Batch list assignment failed:', error);
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
                { value: 'serviceAddresses', label: 'Service Addresses (semicolon separated)' },
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

        // Get selected list info from modal dataset (custom dropdown)
        const selectedListName = modal.dataset.selectedListName || 'No list assignment';

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

            // Pre-fetch existing contacts for duplicate detection (once, not per row)
            let existingContacts = [];
            if (updateExisting && modal._importType === 'contacts' && window.ContactMerger) {
                console.log('Fetching existing contacts for duplicate detection...');
                const email = window.currentUserEmail || '';
                if (window.currentUserRole !== 'admin' && email) {
                    // Non-admin: use scoped query with limits
                    const [ownedSnap, assignedSnap] = await Promise.all([
                        db.collection('contacts').where('ownerId', '==', email).limit(2000).get(),
                        db.collection('contacts').where('assignedTo', '==', email).limit(2000).get()
                    ]);
                    const map = new Map();
                    ownedSnap.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
                    assignedSnap.forEach(d => { if (!map.has(d.id)) map.set(d.id, { id: d.id, ...d.data() }); });
                    existingContacts = Array.from(map.values());
                } else {
                    // OPTIMIZED: Admin query with limit to prevent loading entire collection
                    // 5000 contacts is enough for duplicate detection while keeping costs reasonable
                    const allContactsQuery = await db.collection('contacts').limit(5000).get();
                    existingContacts = allContactsQuery.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));
                }
                console.log(`Loaded ${existingContacts.length} existing contacts for comparison`);
            }

            // Initialize batch list assignment collection
            const listAssignments = [];

            // Process in batches
            const batchSize = 10;
            for (let i = 0; i < modal._csvRows.length; i += batchSize) {
                const batch = modal._csvRows.slice(i, i + batchSize);

                // Add timeout protection to prevent hanging
                const batchPromises = batch.map(async (row) => {
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Row processing timeout')), 30000)
                    );

                    const rowPromise = (async () => {
                        try {
                            const doc = {};

                            // Map CSV data to CRM fields
                            Object.entries(mappings).forEach(([csvIndex, crmField]) => {
                                const raw = row[parseInt(csvIndex)];
                                const value = typeof raw === 'string' ? raw.trim() : raw;
                                if (value) {
                                    // Special handling for service addresses
                                    const fieldKey = crmField;
                                    const fieldLc = String(crmField).toLowerCase();
                                    if (fieldLc === 'serviceaddresses') {
                                        // Split by semicolon and create array of address objects
                                        const addresses = String(value).split(';').map((addr, idx) => ({
                                            address: addr.trim(),
                                            isPrimary: idx === 0
                                        })).filter(a => a.address.length > 0);
                                        // Preserve the selected field name (camelCase) on the document
                                        doc[fieldKey] = addresses;
                                    } else {
                                        // Field-specific normalization (e.g., strip Excel leading apostrophe on phone)
                                        doc[fieldKey] = this.normalizeForField(fieldKey, value);
                                    }
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
                                // For contacts, use intelligent duplicate detection with pre-fetched contacts
                                if (window.ContactMerger && existingContacts.length > 0) {
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

                                // Collect for batch list assignment
                                if (modal.dataset.selectedListId) {
                                    listAssignments.push({
                                        listId: modal.dataset.selectedListId,
                                        recordId: existingRecord.id,
                                        targetType: modal._importType === 'accounts' ? 'accounts' : 'people'
                                    });
                                }

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
                                // Get user email for ownership fields
                                const userEmail = (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function')
                                    ? window.DataManager.getCurrentUserEmail()
                                    : ((window.currentUserEmail || '').toLowerCase());

                                doc.createdAt = now;
                                doc.updatedAt = now;
                                doc.importedAt = now;

                                // Add ownership fields (required for Firestore rules)
                                doc.ownerId = userEmail || '';
                                doc.assignedTo = userEmail || '';
                                doc.createdBy = userEmail || '';

                                // For contacts, check if we need to create/update an account
                                if (modal._importType === 'contacts' && doc.companyName) {
                                    await this.handleAccountCreationForContact(db, doc, now);
                                }

                                // Use DataManager.addOwnership if available for server timestamps
                                const finalDoc = (window.DataManager && typeof window.DataManager.addOwnership === 'function')
                                    ? window.DataManager.addOwnership(doc)
                                    : doc;

                                const ref = await db.collection(collection).add(finalDoc);
                                imported++;

                                // Collect for batch list assignment
                                if (modal.dataset.selectedListId) {
                                    listAssignments.push({
                                        listId: modal.dataset.selectedListId,
                                        recordId: ref.id,
                                        targetType: modal._importType === 'accounts' ? 'accounts' : 'people'
                                    });
                                }

                                // Live update tables (use UI-friendly timestamps so lists don't show N/A)
                                try {
                                    if (modal._importType === 'accounts') {
                                        // Use finalDoc instead of doc to include serviceAddresses and all other fields
                                        const uiDoc = Object.assign({}, finalDoc, { createdAt: new Date(), updatedAt: new Date() });
                                        document.dispatchEvent(new CustomEvent('pc:account-created', { detail: { id: ref.id, doc: uiDoc } }));
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
                    })();

                    try {
                        await Promise.race([rowPromise, timeoutPromise]);
                    } catch (error) {
                        console.error('Error importing row (with timeout):', error);
                        failed++;
                    }
                });

                await Promise.all(batchPromises);

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

            // Process batch list assignments (much more efficient than individual assignments)
            if (listAssignments.length > 0) {
                console.log(`Processing batch list assignments for ${listAssignments.length} records...`);
                await this.batchAssignToList(db, listAssignments);
            }

            // If we queued merges, present a summary and ask once to proceed
            let userApprovedQueuedMerges = true;
            try {
                const totalQueued = queuedContactMerges.length + queuedAccountMerges.length;
                console.log('=== IMPORT DEBUG ===');
                console.log('Main processing complete. Imported:', imported, 'Enriched:', enriched, 'Failed:', failed);
                console.log('Queued merges - Contacts:', queuedContactMerges.length, 'Accounts:', queuedAccountMerges.length);
                console.log('List assignments pending:', listAssignments.length);
                console.log('Total queued merges:', totalQueued);

                if (totalQueued > 0) {
                    console.log('About to show merge confirmation modal...');

                    // TEMPORARY: Skip modal for testing - uncomment the next line to bypass modal
                    // userApprovedQueuedMerges = true; console.log('Modal bypassed for testing');

                    userApprovedQueuedMerges = await this.showQueuedMergeSummaryModal({
                        contacts: queuedContactMerges,
                        accounts: queuedAccountMerges,
                        importType: modal._importType
                    });
                    console.log('Merge modal completed. User approved:', userApprovedQueuedMerges);
                } else {
                    console.log('No queued merges, proceeding to results...');
                }
            } catch (error) {
                console.error('Error in queued merge processing:', error);
            }

            // Apply queued merges if approved
            const queuedMergeAssignments = [];
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

                        // Collect for batch list assignment
                        if (modal.dataset.selectedListId) {
                            queuedMergeAssignments.push({
                                listId: modal.dataset.selectedListId,
                                recordId: item.existingRecord.id,
                                targetType: 'accounts'
                            });
                        }

                        // Notify UI
                        try {
                            document.dispatchEvent(new CustomEvent('pc:account-created', { detail: { id: item.existingRecord.id, doc: Object.assign({}, updateData) } }));
                        } catch (_) { }
                    } catch (e) { failed++; }
                }
                for (const item of queuedContactMerges) {
                    try {
                        const prev = (typeof item.existingRecord.data === 'function') ? item.existingRecord.data() : {};
                        const updateData = window.ContactMerger ? window.ContactMerger.mergeContacts(prev, item.incoming) : Object.assign({}, prev, item.incoming);
                        updateData.updatedAt = window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || Date.now();
                        updateData.enrichedAt = updateData.updatedAt;
                        await item.existingRecord.ref.update(updateData);
                        enriched++;

                        // Collect for batch list assignment
                        if (modal.dataset.selectedListId) {
                            queuedMergeAssignments.push({
                                listId: modal.dataset.selectedListId,
                                recordId: item.existingRecord.id,
                                targetType: 'people'
                            });
                        }

                        // Notify UI
                        try {
                            const uiChanges = Object.assign({}, updateData, { updatedAt: new Date() });
                            document.dispatchEvent(new CustomEvent('pc:contact-updated', { detail: { id: item.existingRecord.id, changes: uiChanges } }));
                        } catch (_) { }
                    } catch (e) { failed++; }
                }
            }

            // Process queued merge list assignments
            if (queuedMergeAssignments.length > 0) {
                console.log(`Processing queued merge list assignments for ${queuedMergeAssignments.length} records...`);
                await this.batchAssignToList(db, queuedMergeAssignments);
            }

            // CRITICAL FIX: Recalculate actual counts for all affected lists after bulk import
            // This ensures counts match actual members in listMembers collection
            const affectedLists = new Set([...listAssignments, ...queuedMergeAssignments].map(a => a.listId));
            for (const listId of affectedLists) {
                try {
                    // Get the list to determine its kind
                    const listDoc = await db.collection('lists').doc(listId).get();
                    if (!listDoc.exists) continue;

                    const listData = listDoc.data();
                    const listKind = listData.kind || listData.targetType || modal._importType || 'people';
                    const targetType = listKind === 'accounts' ? 'accounts' : 'people';

                    // Calculate ACTUAL count from listMembers collection
                    const actualCountQuery = await db.collection('listMembers')
                        .where('listId', '==', listId)
                        .where('targetType', '==', targetType)
                        .get();

                    const actualCount = actualCountQuery.size;

                    // Update list document with actual count
                    await db.collection('lists').doc(listId).update({
                        count: actualCount,
                        recordCount: actualCount,
                        updatedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date()
                    });

                    console.log(`✓ Updated list ${listId} with actual count: ${actualCount} ${targetType}`);

                    // Update BackgroundListsLoader cache (cost-effective: no Firestore read)
                    if (window.BackgroundListsLoader && typeof window.BackgroundListsLoader.updateListCountLocally === 'function') {
                        window.BackgroundListsLoader.updateListCountLocally(listId, actualCount);
                    }

                    // Update CacheManager cache (cost-effective: IndexedDB write only)
                    if (window.CacheManager && typeof window.CacheManager.updateRecord === 'function') {
                        window.CacheManager.updateRecord('lists', listId, {
                            recordCount: actualCount,
                            count: actualCount,
                            updatedAt: new Date()
                        }).catch(err => console.warn('[Main] CacheManager update failed:', err));
                    }

                    // Dispatch count update event for lists-overview
                    try {
                        document.dispatchEvent(new CustomEvent('pc:list-count-updated', {
                            detail: {
                                listId: listId,
                                newCount: actualCount,
                                kind: targetType
                            }
                        }));
                    } catch (_) { }
                } catch (countError) {
                    console.warn(`Failed to recalculate count for list ${listId}:`, countError);
                }

                // Clear in-memory cache (most important - IndexedDB can lag)
                if (window.listMembersCache && window.listMembersCache[listId]) {
                    delete window.listMembersCache[listId];
                    console.log(`✓ Cleared in-memory cache for list ${listId}`);
                }

                // Also clear IndexedDB cache
                if (window.CacheManager && typeof window.CacheManager.invalidateListCache === 'function') {
                    try {
                        await window.CacheManager.invalidateListCache(listId);
                        console.log(`✓ Cache invalidated for affected list ${listId}`);
                    } catch (cacheError) {
                        console.warn('Cache invalidation failed for list', listId, ':', cacheError);
                    }
                }

                // CRITICAL FIX: Dispatch event to notify pages to reload
                try {
                    document.dispatchEvent(new CustomEvent('pc:bulk-import-complete', {
                        detail: { listId, type: modal._importType }
                    }));
                    console.log(`✓ Dispatched bulk import complete event for ${listId}`);
                } catch (e) {
                    console.warn('Failed to dispatch bulk import event:', e);
                }
            }

            // Show results
            console.log('=== SHOWING RESULTS ===');
            console.log('About to show results. Imported:', imported, 'Enriched:', enriched, 'Failed:', failed);

            if (progressDiv) {
                console.log('Hiding progress div');
                progressDiv.hidden = true;
            }

            if (resultsDiv) {
                console.log('Showing results div');
                resultsDiv.hidden = false;
                resultsDiv.style.display = 'block';
                resultsDiv.style.visibility = 'visible';
                resultsDiv.style.opacity = '1';
                resultsDiv.style.position = 'relative';
                resultsDiv.style.zIndex = '10';
                console.log('Results div shown, imported:', imported, 'enriched:', enriched, 'failed:', failed);

                const summaryDiv = modal.querySelector('#csv-results-summary');
                console.log('Summary div found:', summaryDiv);
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
                    console.log('Results message set:', resultMessage);

                    // Force a reflow to ensure the results are visible
                    setTimeout(() => {
                        resultsDiv.style.display = 'block';
                        resultsDiv.style.visibility = 'visible';
                        resultsDiv.style.opacity = '1';
                    }, 100);
                } else {
                    console.error('Summary div not found!');
                }
            } else {
                console.error('Results div not found!');
                // Fallback: show results in progress div if results div not found
                if (progressDiv) {
                    progressDiv.innerHTML = '<div class="results-summary"><strong>Import Complete!</strong><br>Records processed successfully. You can now close this dialog.</div>';
                    progressDiv.hidden = false;
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

            // Refresh list detail page if we're viewing a list and records were added to lists
            if ((imported > 0 || enriched > 0) && modal.dataset.selectedListId) {
                console.log('Refreshing list views after import. Selected list:', modal.dataset.selectedListId);
                // Refresh list detail page if we're viewing a list
                if (window.ListDetail && window.ListDetail.refreshListMembership) {
                    window.ListDetail.refreshListMembership();
                }

                // Refresh list overview counts  
                if (window.ListsOverview && window.ListsOverview.refreshCounts) {
                    window.ListsOverview.refreshCounts();
                }
            } else {
                console.log('No list refresh needed. Imported:', imported, 'Enriched:', enriched, 'Selected list:', modal.dataset.selectedListId);
            }

        } catch (error) {
            console.error('Import error:', error);
            this.showToast('Import failed. Please try again.');

            // Reset UI and show error results
            if (progressDiv) progressDiv.hidden = true;
            if (startBtn) startBtn.hidden = false;
            if (resultsDiv) {
                resultsDiv.hidden = false;
                const summaryDiv = modal.querySelector('#csv-results-summary');
                if (summaryDiv) {
                    summaryDiv.innerHTML = '<strong>Import Failed!</strong><br>Please try again or check your data.';
                }
            }
        }
    }

    // Display a one-time confirmation modal summarizing all queued merges for this import
    showQueuedMergeSummaryModal({ contacts = [], accounts = [] } = {}) {
        return new Promise((resolve) => {
            try {
                const total = contacts.length + accounts.length;
                console.log('Creating merge confirmation modal for', total, 'records');
                if (total === 0) {
                    console.log('No merges to show, resolving immediately');
                    return resolve(true);
                }
                const overlay = document.createElement('div');
                overlay.className = 'pc-modal';
                // Ensure modal is visible
                overlay.style.display = 'block';
                overlay.style.visibility = 'visible';
                overlay.style.opacity = '1';
                overlay.style.position = 'fixed';
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.width = '100%';
                overlay.style.height = '100%';
                overlay.style.zIndex = '9999';
                overlay.style.backgroundColor = 'rgba(45, 45, 45, 0.8)';
                console.log('Modal HTML created, generating content...');
                overlay.innerHTML = `
                  <div class="pc-modal__backdrop" data-close="queued-merge" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(45, 45, 45, 0.8);"></div>
                  <div class="pc-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="merge-batch-title" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                    <div class="pc-modal__header">
                      <h3 id="merge-batch-title">Review potential merges</h3>
                      <button class="pc-modal__close" data-close="queued-merge" aria-label="Close">×</button>
                    </div>
                    <div class="pc-modal__body" style="max-height:60vh;overflow:auto;">
                      <p>${total} existing records look similar and can be enriched instead of creating duplicates.</p>
                      ${accounts.length ? `<h4>Accounts (${accounts.length})</h4>` : ''}
                      ${accounts.slice(0, 10).map(it => {
                    const prev = (typeof it.existingRecord.data === 'function') ? it.existingRecord.data() : {};
                    const fields = Object.keys(it.incoming || {}).filter(k => (it.incoming[k] != null && String(it.incoming[k]).trim() !== '' && String(it.incoming[k]) !== String(prev[k] || ''))).slice(0, 6);
                    return `<div class="merge-row"><strong>${this.escapeHtml(prev.accountName || '')}</strong> → enrich fields: ${fields.map(f => `<code>${this.escapeHtml(f)}</code>`).join(', ') || '—'}</div>`;
                }).join('')}
                      ${contacts.length ? `<h4 style="margin-top:12px;">Contacts (${contacts.length})</h4>` : ''}
                      ${contacts.slice(0, 10).map(it => {
                    const prev = (typeof it.existingRecord.data === 'function') ? it.existingRecord.data() : {};
                    const fields = Object.keys(it.incoming || {}).filter(k => (it.incoming[k] != null && String(it.incoming[k]).trim() !== '' && String(it.incoming[k]) !== String(prev[k] || ''))).slice(0, 6);
                    const name = `${prev.firstName || ''} ${prev.lastName || ''}`.trim();
                    return `<div class="merge-row"><strong>${this.escapeHtml(name || prev.email || 'Existing contact')}</strong> → enrich fields: ${fields.map(f => `<code>${this.escapeHtml(f)}</code>`).join(', ') || '—'}</div>`;
                }).join('')}
                      ${total > 10 ? `<div style="margin-top:8px;color:var(--text-secondary)">(+${total - 10} more hidden)</div>` : ''}
                    </div>
                    <div class="pc-modal__footer" style="display:flex;gap:8px;justify-content:flex-end;">
                      <button type="button" class="btn-secondary" data-action="cancel">Cancel</button>
                      <button type="button" class="btn-primary" data-action="enrich">Enrich</button>
                    </div>
                  </div>`;
                console.log('Modal HTML generated, appending to DOM...');
                document.body.appendChild(overlay);
                console.log('Modal appended to DOM, should be visible now');

                const close = (val) => {
                    console.log('Modal closing with value:', val);
                    try { overlay.parentNode && overlay.parentNode.removeChild(overlay); } catch (_) { };
                    resolve(val);
                };

                console.log('Setting up modal event handlers...');
                overlay.querySelectorAll('[data-close="queued-merge"]').forEach(btn => btn.addEventListener('click', () => close(false)));
                overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => close(false));
                overlay.querySelector('[data-action="enrich"]').addEventListener('click', () => close(true));
                console.log('Modal event handlers set up, waiting for user interaction...');

                // Fallback timeout to prevent infinite hanging (30 seconds)
                setTimeout(() => {
                    console.log('Modal timeout reached, auto-approving merges');
                    close(true);
                }, 30000);
            } catch (_) { resolve(true); }
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
            // Normalize service addresses (semicolon-separated)
            if (f === 'serviceaddresses') {
                let v = String(value == null ? '' : value).trim();
                if (!v) return '';
                // For display purposes, just return the original string
                // The array conversion happens during actual import
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

    // Parse phone number with extension
    // Extracts extension patterns like "ext. 123", "extension 456", "x789"
    parsePhoneWithExtension(input) {
        if (!input) return { number: '', extension: '' };
        let str = String(input).trim();

        // Match extension patterns: ext, ext., extension, x
        const extMatch = str.match(/\b(?:ext\.?|extension|x)\s*(\d+)\s*$/i);
        let extension = '';
        if (extMatch) {
            extension = extMatch[1];
            str = str.slice(0, extMatch.index).trim();
        }

        // Extract digits from the main number
        const digits = str.replace(/[^\d]/g, '');

        return { number: digits, extension };
    }

    // Normalize phone numbers imported from CSV
    // - Remove Excel leading apostrophe prefix '123...
    // - Unwrap Excel formula-like wrappers ="+1 234..." => +1 234...
    // - Strip zero-width/invisible characters
    // - Format as +1 (XXX) XXX-XXXX for US numbers
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

            // Parse number and extension
            const parsed = this.parsePhoneWithExtension(v);
            const digits = parsed.number;
            const ext = parsed.extension;

            if (!digits) return '';

            // Format US numbers as +1 (XXX) XXX-XXXX
            let formatted = '';
            if (digits.length === 11 && digits.startsWith('1')) {
                // 11 digits starting with 1
                formatted = `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 11)}`;
            } else if (digits.length === 10) {
                // 10 digits (US number without country code)
                formatted = `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
            } else {
                // Non-US or other format - return with + prefix
                formatted = '+' + digits;
            }

            // Append extension if present
            if (ext) {
                formatted += ` ext. ${ext}`;
            }

            return formatted;
        } catch (_) {
            return value;
        }
    }

    // Load Initial Data
    loadInitialData() {
        this.updateLivePrice();
        // Load tasks and news together to prevent re-renders
        Promise.all([
            this.loadTodaysTasks(),
            this.loadEnergyNews()
        ]).then(() => {
            console.log('[CRM] Tasks and News loaded together');
        });

        // OPTIMIZED: Increased from 5 to 10 minutes to reduce API calls and Cloud Run costs
        // Energy prices don't change frequently enough to warrant 5-minute updates
        setInterval(() => {
            this.updateLivePrice();
        }, 10 * 60 * 1000); // 10 minutes (increased from 5 minutes)

        // Energy News auto-refresh removed for cost optimization
        // News is cached server-side for 6 hours, users can manually refresh if needed
        // This eliminates unnecessary API calls and Gemini AI costs

        // Start email automation monitor
        // Client-side email automation is now handled by Cloud Scheduler cron jobs
        // this.startEmailAutomation();
    }

    // Email Automation Monitor - checks for emails that need generation/sending
    startEmailAutomation() {
        if (this.emailAutomationInterval) return; // Already running

        console.log('[CRM] Starting email automation monitor...');

        // OPTIMIZED: Increased from 2 to 5 minutes to reduce Cloud Run costs
        // Note: Cloud Scheduler cron jobs handle email automation in production
        // This client-side check is a backup and should run less frequently
        this.emailAutomationInterval = setInterval(async () => {
            await this.checkScheduledEmails();
        }, 5 * 60 * 1000); // 5 minutes (reduced from 2 minutes)

        // Run immediately on start (after a 5 second delay to let things initialize)
        setTimeout(() => {
            this.checkScheduledEmails();
        }, 5000);
    }

    async checkScheduledEmails() {
        if (!window.firebaseDB) return;

        try {
            const now = Date.now();
            const db = window.firebaseDB;

            // 1. Check for emails that need content generation
            const needsGenerationQuery = db.collection('emails')
                .where('type', '==', 'scheduled')
                .where('status', '==', 'not_generated')
                .where('scheduledSendTime', '>=', now - (60 * 1000)) // 1 min buffer
                .where('scheduledSendTime', '<=', now + (24 * 60 * 60 * 1000)) // Next 24 hours
                .limit(10);

            const needsGenerationSnapshot = await needsGenerationQuery.get();

            if (!needsGenerationSnapshot.empty) {
                console.log(`[CRM Automation] Found ${needsGenerationSnapshot.size} emails needing generation`);

                // Trigger generation
                try {
                    const baseUrl = window.API_BASE_URL || window.location.origin || '';
                    const response = await fetch(`${baseUrl}/api/generate-scheduled-emails`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ immediate: true })
                    });

                    if (response.ok) {
                        const result = await response.json();
                        console.log(`[CRM Automation] Generated ${result.count} emails`);

                        // Optional: Show toast notification
                        if (result.count > 0 && this.showToast) {
                            this.showToast(`✓ Generated ${result.count} scheduled email${result.count !== 1 ? 's' : ''}`, 'success');
                        }

                        // Refresh emails page if user is viewing it
                        if (this.currentPage === 'emails' && window.EmailsPage && typeof window.EmailsPage.refresh === 'function') {
                            window.EmailsPage.refresh();
                        }
                    }
                } catch (error) {
                    console.warn('[CRM Automation] Generation failed:', error);
                }
            }

            // 2. Check for approved emails ready to send
            const readyToSendQuery = db.collection('emails')
                .where('type', '==', 'scheduled')
                .where('status', '==', 'approved')
                .where('scheduledSendTime', '<=', now)
                .limit(10);

            const readyToSendSnapshot = await readyToSendQuery.get();

            if (!readyToSendSnapshot.empty) {
                console.log(`[CRM Automation] Found ${readyToSendSnapshot.size} emails ready to send`);

                // Trigger sending
                try {
                    const baseUrl = window.API_BASE_URL || window.location.origin || '';
                    const response = await fetch(`${baseUrl}/api/send-scheduled-emails`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });

                    if (response.ok) {
                        const result = await response.json();
                        console.log(`[CRM Automation] Sent ${result.count} emails`);

                        // Optional: Show toast notification
                        if (result.count > 0 && this.showToast) {
                            this.showToast(`✓ Sent ${result.count} scheduled email${result.count !== 1 ? 's' : ''}`, 'success');
                        }

                        // Refresh emails page if user is viewing it
                        if (this.currentPage === 'emails' && window.EmailsPage && typeof window.EmailsPage.refresh === 'function') {
                            window.EmailsPage.refresh();
                        }
                    }
                } catch (error) {
                    console.warn('[CRM Automation] Sending failed:', error);
                }
            }

        } catch (error) {
            console.error('[CRM Automation] Check failed:', error);
        }
    }

    // Add cleanup method
    stopEmailAutomation() {
        if (this.emailAutomationInterval) {
            clearInterval(this.emailAutomationInterval);
            this.emailAutomationInterval = null;
            console.log('[CRM] Email automation monitor stopped');
        }
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

    getPriorityBackground(priority) {
        const p = (priority || '').toLowerCase().trim();
        switch (p) {
            case 'low': return '#495057';
            case 'medium': return 'rgba(255, 193, 7, 0.15)';
            case 'high': return 'rgba(220, 53, 69, 0.15)';
            case 'sequence': return 'rgba(111, 66, 193, 0.18)';
            default: return '#495057';
        }
    }

    getPriorityColor(priority) {
        const p = (priority || '').toLowerCase().trim();
        switch (p) {
            case 'low': return '#e9ecef';
            case 'medium': return '#ffc107';
            case 'high': return '#dc3545';
            case 'sequence': return '#ffffff';
            default: return '#e9ecef';
        }
    }

    // Helper function to get LinkedIn tasks from sequences (matches tasks.js logic)
    async getLinkedInTasksFromSequences() {
        const linkedInTasks = [];
        const getUserEmail = () => {
            try {
                if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
                    return window.DataManager.getCurrentUserEmail().toLowerCase();
                }
                return (window.currentUserEmail || '').toLowerCase();
            } catch (_) {
                return (window.currentUserEmail || '').toLowerCase();
            }
        };
        const userEmail = getUserEmail();
        const isAdmin = () => {
            try {
                if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
                    return window.DataManager.isCurrentUserAdmin();
                }
                return window.currentUserRole === 'admin';
            } catch (_) {
                return window.currentUserRole === 'admin';
            }
        };

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

            console.log('[CRM] Loaded', linkedInTasks.length, 'LinkedIn sequence tasks for Today\'s Tasks widget');
        } catch (error) {
            console.error('[CRM] Error loading LinkedIn sequence tasks:', error);
        }

        return linkedInTasks;
    }

    async loadTodaysTasks(skipFirebase = false) {
        const taskLists = Array.from(document.querySelectorAll('.tasks-list'));
        if (!taskLists.length) return;

        // Prevent double-rendering - only skip if currently loading
        if (this._tasksLoading) {
            console.log('[CRM] Tasks already loading, skipping duplicate call');
            return;
        }
        this._tasksLoading = true;

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

        // Helper functions for ownership filtering
        const getUserEmail = () => {
            try {
                if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
                    return window.DataManager.getCurrentUserEmail();
                }
                return (window.currentUserEmail || '').toLowerCase();
            } catch (_) {
                return (window.currentUserEmail || '').toLowerCase();
            }
        };
        const isAdmin = () => {
            try {
                if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
                    return window.DataManager.isCurrentUserAdmin();
                }
                return window.currentUserRole === 'admin';
            } catch (_) {
                return window.currentUserRole === 'admin';
            }
        };

        // Load localStorage tasks first for immediate rendering
        // CRITICAL FIX: Use namespaced key to match task-detail.js and avoid stale data
        let localTasks = [];
        try {
            // Try namespaced key first (matches task-detail.js)
            const email = getUserEmail();
            const namespacedKey = email ? `userTasks:${email}` : 'userTasks';
            const namespacedTasks = JSON.parse(localStorage.getItem(namespacedKey) || '[]');

            // Also check legacy key for cross-browser compatibility
            const legacyTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');

            // Merge both sources, preferring namespaced key
            const tasksMap = new Map();
            namespacedTasks.forEach(t => { if (t && t.id) tasksMap.set(t.id, t); });
            legacyTasks.forEach(t => { if (t && t.id && !tasksMap.has(t.id)) tasksMap.set(t.id, t); });
            localTasks = Array.from(tasksMap.values());

            // CRITICAL: Filter by ownership for non-admin users (localStorage bypasses Firestore rules)
            if (!isAdmin() && localTasks.length > 0) {
                localTasks = localTasks.filter(t => {
                    if (!t) return false;
                    const ownerId = (t.ownerId || '').toLowerCase();
                    const assignedTo = (t.assignedTo || '').toLowerCase();
                    const createdBy = (t.createdBy || '').toLowerCase();
                    return ownerId === email || assignedTo === email || createdBy === email;
                });
            }

            // CRITICAL FIX: Filter out completed tasks from localStorage cache (they shouldn't show in Today's Tasks)
            // This prevents stale completed tasks from showing when switching browsers
            localTasks = localTasks.filter(t => (t.status || 'pending') !== 'completed');
        } catch (_) { localTasks = []; }

        // CRITICAL FIX: Also check BackgroundTasksLoader cache and filter out completed tasks
        // This prevents stale completed tasks from BackgroundTasksLoader cache from appearing
        try {
            if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.getTasksData === 'function') {
                const backgroundTasks = window.BackgroundTasksLoader.getTasksData() || [];
                // Filter out completed tasks and merge with localTasks (prefer localTasks for duplicates)
                const backgroundTasksMap = new Map();
                backgroundTasks.forEach(t => {
                    if (t && t.id && (t.status || 'pending') !== 'completed') {
                        // Only add if not already in localTasks (localStorage is more recent)
                        if (!localTasks.some(lt => lt.id === t.id)) {
                            backgroundTasksMap.set(t.id, t);
                        }
                    }
                });
                // Add non-duplicate background tasks to localTasks
                localTasks = [...localTasks, ...Array.from(backgroundTasksMap.values())];
                console.log('[CRM] Loaded', backgroundTasksMap.size, 'pending tasks from BackgroundTasksLoader for Today\'s Tasks widget');
            }
        } catch (e) {
            console.warn('[CRM] Could not load tasks from BackgroundTasksLoader for Today\'s Tasks widget:', e);
        }

        // Always render immediately from localStorage cache first
        this.renderTodaysTasks(localTasks, parseDateStrict, parseTimeToMinutes, today);

        // If not skipping Firebase, fetch Firebase data in background and update
        if (!skipFirebase) {
            try {
                if (window.firebaseDB) {
                    let query = window.firebaseDB.collection('tasks');

                    // CRITICAL: Add ownership filters for non-admin users
                    if (!isAdmin()) {
                        const email = getUserEmail();
                        if (email && window.DataManager && typeof window.DataManager.queryWithOwnership === 'function') {
                            // Use DataManager helper if available
                            const firebaseTasks = await window.DataManager.queryWithOwnership('tasks');

                            // CRITICAL FIX: Always prefer Firebase as the source of truth
                            // Firebase tasks override any stale local copies with the same ID
                            // CRITICAL: Filter out completed tasks from Firebase results
                            const mergedTasksMap = new Map();
                            firebaseTasks.forEach(t => {
                                if (t && t.id && (t.status || 'pending') !== 'completed') {
                                    mergedTasksMap.set(t.id, t);
                                }
                            });
                            localTasks.forEach(t => {
                                if (t && t.id && (t.status || 'pending') !== 'completed' && !mergedTasksMap.has(t.id)) {
                                    mergedTasksMap.set(t.id, t);
                                }
                            });

                            // CRITICAL FIX: Add LinkedIn sequence tasks (only pending ones)
                            const linkedInTasks = await this.getLinkedInTasksFromSequences();
                            linkedInTasks.forEach(t => {
                                if (t && t.id && (t.status || 'pending') !== 'completed' && !mergedTasksMap.has(t.id)) {
                                    mergedTasksMap.set(t.id, t);
                                }
                            });

                            const mergedTasks = Array.from(mergedTasksMap.values());

                            // CRITICAL FIX: Final safety check - ensure no completed tasks are saved to localStorage
                            const finalMergedTasks = mergedTasks.filter(t => t && t.id && (t.status || 'pending') !== 'completed');

                            // CRITICAL FIX: Save to both namespaced and legacy keys for compatibility
                            try {
                                const email = getUserEmail();
                                const namespacedKey = email ? `userTasks:${email}` : 'userTasks';
                                localStorage.setItem(namespacedKey, JSON.stringify(finalMergedTasks));
                                localStorage.setItem('userTasks', JSON.stringify(finalMergedTasks)); // Legacy key for compatibility
                            } catch (e) {
                                console.warn('Could not save merged tasks to localStorage cache:', e);
                            }
                            this.renderTodaysTasks(finalMergedTasks, parseDateStrict, parseTimeToMinutes, today);
                            this._tasksLoading = false;
                            return;
                        } else if (email) {
                            // Fallback: two separate queries and merge client-side
                            const [ownedSnap, assignedSnap] = await Promise.all([
                                window.firebaseDB.collection('tasks').where('ownerId', '==', email).orderBy('timestamp', 'desc').limit(200).get(),
                                window.firebaseDB.collection('tasks').where('assignedTo', '==', email).orderBy('timestamp', 'desc').limit(200).get()
                            ]);
                            const tasksMap = new Map();
                            ownedSnap.docs.forEach(doc => {
                                const data = doc.data() || {};
                                const createdAt = data.createdAt || (data.timestamp && typeof data.timestamp.toDate === 'function' ? data.timestamp.toDate().getTime() : data.timestamp) || Date.now();
                                tasksMap.set(doc.id, { ...data, id: doc.id, createdAt, status: data.status || 'pending' });
                            });
                            assignedSnap.docs.forEach(doc => {
                                if (!tasksMap.has(doc.id)) {
                                    const data = doc.data() || {};
                                    const createdAt = data.createdAt || (data.timestamp && typeof data.timestamp.toDate === 'function' ? data.timestamp.toDate().getTime() : data.timestamp) || Date.now();
                                    tasksMap.set(doc.id, { ...data, id: doc.id, createdAt, status: data.status || 'pending' });
                                }
                            });
                            const firebaseTasks = Array.from(tasksMap.values());

                            // CRITICAL FIX: Always prefer Firebase as the source of truth
                            // CRITICAL: Filter out completed tasks from Firebase results
                            const mergedTasksMap = new Map();
                            firebaseTasks.forEach(t => {
                                if (t && t.id && (t.status || 'pending') !== 'completed') {
                                    mergedTasksMap.set(t.id, t);
                                }
                            });
                            localTasks.forEach(t => {
                                if (t && t.id && (t.status || 'pending') !== 'completed' && !mergedTasksMap.has(t.id)) {
                                    mergedTasksMap.set(t.id, t);
                                }
                            });

                            // CRITICAL FIX: Add LinkedIn sequence tasks (only pending ones)
                            const linkedInTasks = await this.getLinkedInTasksFromSequences();
                            linkedInTasks.forEach(t => {
                                if (t && t.id && (t.status || 'pending') !== 'completed' && !mergedTasksMap.has(t.id)) {
                                    mergedTasksMap.set(t.id, t);
                                }
                            });

                            const mergedTasks = Array.from(mergedTasksMap.values());

                            // CRITICAL FIX: Final safety check - ensure no completed tasks are saved to localStorage
                            const finalMergedTasks = mergedTasks.filter(t => t && t.id && (t.status || 'pending') !== 'completed');

                            // CRITICAL FIX: Save to both namespaced and legacy keys for compatibility
                            try {
                                const email = getUserEmail();
                                const namespacedKey = email ? `userTasks:${email}` : 'userTasks';
                                localStorage.setItem(namespacedKey, JSON.stringify(finalMergedTasks));
                                localStorage.setItem('userTasks', JSON.stringify(finalMergedTasks)); // Legacy key for compatibility
                            } catch (e) {
                                console.warn('Could not save merged tasks to localStorage cache:', e);
                            }
                            this.renderTodaysTasks(finalMergedTasks, parseDateStrict, parseTimeToMinutes, today);
                            this._tasksLoading = false;
                            return;
                        }
                    }

                    // Admin path: unrestricted query
                    const snapshot = await query
                        .orderBy('timestamp', 'desc')
                        .limit(200)
                        .get();
                    const firebaseTasks = snapshot.docs.map(doc => {
                        const data = doc.data() || {};
                        const createdAt = data.createdAt || (data.timestamp && typeof data.timestamp.toDate === 'function' ? data.timestamp.toDate().getTime() : data.timestamp) || Date.now();
                        return { ...data, id: (data.id || doc.id), createdAt, status: data.status || 'pending' };
                    });

                    // CRITICAL FIX: Always prefer Firebase as the source of truth
                    // Firebase tasks override any stale local copies with the same ID
                    // CRITICAL: Filter out completed tasks from Firebase results
                    const allTasksMap = new Map();
                    firebaseTasks.forEach(t => {
                        if (t && t.id && (t.status || 'pending') !== 'completed') {
                            allTasksMap.set(t.id, t);
                        }
                    });
                    localTasks.forEach(t => {
                        if (t && t.id && (t.status || 'pending') !== 'completed' && !allTasksMap.has(t.id)) {
                            allTasksMap.set(t.id, t);
                        }
                    });

                    // CRITICAL FIX: Add LinkedIn sequence tasks (only pending ones)
                    const linkedInTasks = await this.getLinkedInTasksFromSequences();
                    linkedInTasks.forEach(t => {
                        if (t && t.id && (t.status || 'pending') !== 'completed' && !allTasksMap.has(t.id)) {
                            allTasksMap.set(t.id, t);
                        }
                    });

                    const mergedTasks = Array.from(allTasksMap.values());

                    // CRITICAL FIX: Final safety check - ensure no completed tasks are saved to localStorage
                    const finalMergedTasks = mergedTasks.filter(t => t && t.id && (t.status || 'pending') !== 'completed');

                    // CRITICAL FIX: Save to both namespaced and legacy keys for compatibility
                    try {
                        const email = getUserEmail();
                        const namespacedKey = email ? `userTasks:${email}` : 'userTasks';
                        localStorage.setItem(namespacedKey, JSON.stringify(finalMergedTasks));
                        localStorage.setItem('userTasks', JSON.stringify(finalMergedTasks)); // Legacy key for compatibility
                    } catch (e) {
                        console.warn('Could not save merged tasks to localStorage cache:', e);
                    }

                    // Re-render with complete merged data
                    this.renderTodaysTasks(finalMergedTasks, parseDateStrict, parseTimeToMinutes, today);
                }
            } catch (e) {
                console.warn("Could not load tasks from Firebase for Today's Tasks widget:", e);
            } finally {
                // CRITICAL FIX: Always reset loading flag, even if there was an error
                this._tasksLoading = false;
            }
        } else {
            // CRITICAL FIX: Reset loading flag if skipping Firebase
            this._tasksLoading = false;
        }
    }

    renderTodaysTasks(allTasks, parseDateStrict, parseTimeToMinutes, today) {
        const tasksList = document.querySelector('.tasks-list');
        if (!tasksList) return;

        // allTasks is already merged and deduped by the caller (local first, then Firebase)

        // Filter to today's and overdue pending tasks
        // CRITICAL FIX: Filter out completed tasks and tasks without valid due dates
        let todaysTasks = allTasks.filter(task => {
            // Exclude completed tasks
            if ((task.status || 'pending') === 'completed') return false;
            // Only include pending tasks
            if ((task.status || 'pending') !== 'pending') return false;
            // Must have a valid due date
            const d = parseDateStrict(task.dueDate);
            if (!d) return false;
            // Include today and overdue tasks
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
                const displayTitle = this.updateTaskTitle(task);
                // CRITICAL FIX: Set priority to 'sequence' for sequence tasks (matches tasks.js logic)
                const isSequenceTask = !!task.isSequenceTask || !!task.isLinkedInTask;
                const priorityValue = isSequenceTask ? 'sequence' : (task.priority || '');
                return `
                    <div class="task-item" data-task-id="${task.id}" style="cursor: pointer;">
                        <div class="task-info">
                            <div class="task-name" style="color: var(--grey-400); font-weight: 400; transition: var(--transition-fast);">${this.escapeHtml(displayTitle)}</div>
                            <div class="task-time">${timeText}</div>
                        </div>
                        <span class="priority-badge ${priorityValue}" style="background: ${this.getPriorityBackground(priorityValue)}; color: ${this.getPriorityColor(priorityValue)};">${priorityValue}</span>
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

        document.querySelectorAll('.tasks-list').forEach(list => { list.innerHTML = tasksHtml; });

        // Attach task click event listeners
        document.querySelectorAll('.tasks-list').forEach(list => {
            list.querySelectorAll('.task-item[data-task-id]').forEach(taskItem => {
                taskItem.addEventListener('click', (e) => {
                    e.preventDefault();
                    const taskId = taskItem.getAttribute('data-task-id');
                    if (taskId && window.TaskDetail && typeof window.TaskDetail.open === 'function') {
                        // Capture comprehensive dashboard state before opening task detail
                        const current = (window.crm && window.crm.currentPage) ? window.crm.currentPage : (document.querySelector('.page.active')?.getAttribute('data-page') || 'dashboard');

                        // Capture full dashboard state for proper back navigation
                        if (current === 'dashboard') {
                            try {
                                window._dashboardReturn = {
                                    page: 'dashboard',
                                    scroll: window.scrollY || (document.documentElement && document.documentElement.scrollTop) || 0,
                                    timestamp: Date.now(),
                                    // Capture any dashboard-specific state (widget filters, etc.)
                                    dashboardState: {
                                        todaysTasksPage: this.todaysTasksPagination?.currentPage || 1,
                                        todaysTasksScroll: document.querySelector('.tasks-list')?.scrollTop || 0
                                    }
                                };
                                console.log('[Dashboard] Captured state for task detail navigation:', window._dashboardReturn);
                            } catch (_) { /* noop */ }
                        } else if (current === 'accounts') {
                            // Capture accounts state for proper back navigation
                            try {
                                // Use the same comprehensive state capture pattern as accounts.js
                                const accountsState = {
                                    page: 'accounts',
                                    currentPage: 1, // Default, will be overridden by module state if available
                                    scroll: window.scrollY || (document.documentElement && document.documentElement.scrollTop) || 0,
                                    searchTerm: '',
                                    sortColumn: '',
                                    sortDirection: '',
                                    filters: {},
                                    selectedItems: [],
                                    timestamp: Date.now()
                                };

                                // Try to get current accounts page state if available
                                if (window.accountsModule && typeof window.accountsModule.getCurrentState === 'function') {
                                    const moduleState = window.accountsModule.getCurrentState();
                                    Object.assign(accountsState, moduleState);
                                }

                                // Also try to get search term from DOM
                                const quickSearch = document.getElementById('accounts-quick-search');
                                if (quickSearch) {
                                    accountsState.searchTerm = quickSearch.value || '';
                                }

                                window._accountsReturn = accountsState;
                                console.log('[Accounts] Captured state for task detail navigation:', window._accountsReturn);
                            } catch (_) { /* noop */ }
                        } else if (current === 'people') {
                            // Capture people state for proper back navigation
                            try {
                                const peopleState = {
                                    page: 'people',
                                    currentPage: 1,
                                    scroll: window.scrollY || (document.documentElement && document.documentElement.scrollTop) || 0,
                                    searchTerm: '',
                                    sortColumn: '',
                                    sortDirection: '',
                                    filters: {},
                                    selectedItems: [],
                                    timestamp: Date.now()
                                };

                                // Try to get current people page state if available
                                if (window.peopleModule && typeof window.peopleModule.getCurrentState === 'function') {
                                    const moduleState = window.peopleModule.getCurrentState();
                                    Object.assign(peopleState, moduleState);
                                }

                                // Also try to get search term from DOM
                                const quickSearch = document.getElementById('people-quick-search');
                                if (quickSearch) {
                                    peopleState.searchTerm = quickSearch.value || '';
                                }

                                window._peopleReturn = peopleState;
                                console.log('[People] Captured state for task detail navigation:', window._peopleReturn);
                            } catch (_) { /* noop */ }
                        } else if (current === 'tasks') {
                            // Capture tasks state for proper back navigation
                            try {
                                const tasksState = {
                                    page: 'tasks',
                                    currentPage: 1,
                                    scroll: window.scrollY || (document.documentElement && document.documentElement.scrollTop) || 0,
                                    filterMode: 'all',
                                    selectedItems: [],
                                    timestamp: Date.now()
                                };

                                // Try to get current tasks page state if available
                                if (window.tasksModule && typeof window.tasksModule.getCurrentState === 'function') {
                                    const moduleState = window.tasksModule.getCurrentState();
                                    Object.assign(tasksState, moduleState);
                                }

                                window._tasksReturn = tasksState;
                                console.log('[Tasks] Captured state for task detail navigation:', window._tasksReturn);
                            } catch (_) { /* noop */ }
                        }

                        window.TaskDetail.open(taskId, current);
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
        });

        // Attach pagination event listeners
        document.querySelectorAll('.tasks-list').forEach(list => {
            list.querySelectorAll('.pagination-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const action = btn.getAttribute('data-action');
                    const totalPages = Math.ceil(this.todaysTasksPagination.totalTasks / this.todaysTasksPagination.pageSize);

                    if (action === 'prev' && this.todaysTasksPagination.currentPage > 1) {
                        this.todaysTasksPagination.currentPage--;
                        this._tasksLoading = false; // Reset flag before pagination reload
                        this.loadTodaysTasks();
                    } else if (action === 'next' && this.todaysTasksPagination.currentPage < totalPages) {
                        this.todaysTasksPagination.currentPage++;
                        this._tasksLoading = false; // Reset flag before pagination reload
                        this.loadTodaysTasks();
                    }
                });
            });
        });

        // Reset loading flag after rendering completes
        this._tasksLoading = false;
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

    // Update task titles to descriptive format
    updateTaskTitle(task) {
        // Normalize task type first
        const normalizedType = this.normalizeTaskType(task.type);

        // Always update titles to use proper action-oriented format based on task type
        if (normalizedType && (task.contact || task.account)) {
            return this.buildTaskTitle(normalizedType, task.contact || '', task.account || '');
        }
        return task.title;
    }

    // Normalize task type to standard format
    normalizeTaskType(type) {
        const s = String(type || '').toLowerCase().trim();
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
        return type || 'custom-task';
    }

    async loadEnergyNews() {
        const newsList = document.querySelector('.news-list');
        const lastRef = document.getElementById('news-last-refreshed');

        // Prevent double-rendering - only skip if currently loading
        if (this._newsLoading) {
            console.log('[CRM] News already loading, skipping duplicate call');
            return;
        }
        this._newsLoading = true;

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
            // OPTIMIZED: Removed duplicate Cloud Run API call on localhost to reduce Cloud Run costs
            // Localhost should use local server, not hit production Cloud Run
            const urls = [`${base}/api/energy-news`];

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

            // Reset loading flag after successful load
            this._newsLoading = false;
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

            // Reset loading flag after error
            this._newsLoading = false;
        }
    }

    loadHomeActivities(forceRefresh = false) {
        if (!window.ActivityManager) return;

        // Check if we already have activities loaded and don't need to refresh
        const container = document.getElementById('home-activity-timeline');
        if (!forceRefresh && container?.children.length > 0 && !container.querySelector('.loading-spinner')) {
            // Activities are already loaded, just setup pagination
            console.log('[CRM] Activities already loaded, skipping duplicate render');
            this.setupHomeActivityPagination();
            return;
        }

        // Load global activities for home page
        if (forceRefresh) {
            // Clear cache and force refresh
            window.ActivityManager.clearCache('global');
            window.ActivityManager.renderActivities('home-activity-timeline', 'global');
        } else {
            window.ActivityManager.renderActivities('home-activity-timeline', 'global');
        }

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

                // Setup pagination buttons
                const prevBtn = document.getElementById('home-activity-prev');
                const nextBtn = document.getElementById('home-activity-next');
                const infoEl = document.getElementById('home-activity-info');

                if (prevBtn) {
                    prevBtn.disabled = window.ActivityManager.currentPage === 0;
                    prevBtn.onclick = () => {
                        window.ActivityManager.previousPage('home-activity-timeline', 'global');
                        updatePagination();
                    };
                }

                if (nextBtn) {
                    nextBtn.disabled = window.ActivityManager.currentPage >= totalPages - 1;
                    nextBtn.onclick = () => {
                        window.ActivityManager.nextPage('home-activity-timeline', 'global');
                        updatePagination();
                    };
                }

                // Update page button
                const pageButton = document.getElementById('home-activity-page');
                if (pageButton) {
                    pageButton.textContent = window.ActivityManager.currentPage + 1;
                    pageButton.classList.toggle('active', true);
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
    generateCompanyIconHTML: function (opts) {
        try {
            const size = parseInt((opts && opts.size) || 64, 10) || 64;
            const logoUrl = (opts && opts.logoUrl) ? String(opts.logoUrl).trim() : '';
            const domain = (opts && opts.domain) ? String(opts.domain).trim().replace(/^https?:\/\//, '').replace(/\/$/, '') : '';


            if (logoUrl) {
                // Only treat as domain if it's clearly a bare domain (no protocol, no path)
                const looksLikeBareDomain = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(logoUrl) && !/\s/.test(logoUrl) && !logoUrl.includes('/');
                let parsed = null;
                try { parsed = /^https?:\/\//i.test(logoUrl) ? new URL(logoUrl) : null; } catch (_) { parsed = null; }
                const path = parsed ? (parsed.pathname || '') : '';
                const looksLikeImagePath = /\.(png|jpe?g|gif|webp|svg|ico)(\?.*)?$/i.test(path);

                // Only use favicon fallback for bare domains, not for URLs
                if (looksLikeBareDomain) {
                    const clean = String(logoUrl).replace(/^www\./i, '');
                    if (clean) return this.generateFaviconHTML(clean, size);
                }
                // Otherwise treat as a direct image URL; fallback to favicon on error
                const cleanDomain = domain || (parsed ? parsed.hostname.replace(/^www\./i, '') : '');
                const containerId = `logo-${(cleanDomain || 'x').replace(/[^a-z0-9]/gi, '')}-${Date.now()}`;
                return `<img class="company-favicon" 
                             id="${containerId}"
                             src="${logoUrl}" 
                             alt="" 
                             referrerpolicy="no-referrer" 
                             loading="lazy"
                             style="width:${size}px;height:${size}px;object-fit:cover;border-radius:6px;flex-shrink:0;pointer-events:none;"
                             onerror="window.__pcFaviconHelper.onLogoError('${containerId}','${cleanDomain}',${size})">`;
            }
            if (domain) {
                return this.generateFaviconHTML(domain, size);
            }
            return window.__pcAccountsIcon();
        } catch (_) { return window.__pcAccountsIcon(); }
    },
    onLogoError: function (containerId, domain, size) {
        try {
            const img = document.getElementById(containerId);
            if (!img) return;
            const parent = img.parentNode;
            const doReplace = () => {
                const html = this.generateFaviconHTML(domain, size);
                const div = document.createElement('div');
                div.innerHTML = html;
                const replacement = div.firstElementChild;
                if (parent && replacement) parent.replaceChild(replacement, img);
                else if (img) img.src = `https://www.google.com/s2/favicons?sz=${size}&domain=${encodeURIComponent(domain)}`;
            };
            // Fade out before replacement for smoother UX
            try { img.classList.add('icon-unloading'); } catch (_) { }
            setTimeout(doReplace, 120);
        } catch (_) { }
    },
    // Generate favicon HTML with multiple fallback sources
    generateFaviconHTML: function (domain, size = 64) {
        if (!domain) {
            return window.__pcAccountsIcon();
        }

        const cleanDomain = domain.replace(/^www\./i, '');
        const fallbackIcon = window.__pcAccountsIcon();

        // Multiple favicon sources to try - ordered by quality and reliability
        const faviconSources = [
            `https://logo.clearbit.com/${encodeURIComponent(cleanDomain)}`, // Best for company logos
            `https://www.google.com/s2/favicons?sz=${size}&domain=${encodeURIComponent(cleanDomain)}`, // Google's service
            `https://favicons.githubusercontent.com/${encodeURIComponent(cleanDomain)}`, // GitHub's service  
            `https://api.faviconkit.com/${encodeURIComponent(cleanDomain)}/${size}`, // FaviconKit API
            `https://favicon.yandex.net/favicon/${encodeURIComponent(cleanDomain)}`, // Yandex service
            `https://icons.duckduckgo.com/ip3/${encodeURIComponent(cleanDomain)}.ico`, // DuckDuckGo
            `https://${cleanDomain}/favicon.ico` // Direct favicon
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
                 style="width:${size}px;height:${size}px;object-fit:cover;border-radius:6px;flex-shrink:0;pointer-events:none;"
                 onload="window.__pcFaviconHelper.onFaviconLoad('${containerId}')"
                 onerror="window.__pcFaviconHelper.onFaviconError('${containerId}', '${cleanDomain}', ${size})" />
        `;
    },

    // Handle successful favicon load
    onFaviconLoad: function (containerId) {
        const img = document.getElementById(containerId);
        if (img) {
            // Use requestAnimationFrame to ensure smooth animation
            requestAnimationFrame(() => {
                img.classList.add('icon-loaded');
            });
        }
    },

    // Handle favicon load error and try next source
    onFaviconError: function (containerId, domain, size) {
        const img = document.getElementById(containerId);
        if (!img) return;

        // Get current source index from data attribute
        let currentIndex = parseInt(img.dataset.sourceIndex || '0');
        if (isNaN(currentIndex)) currentIndex = 0;
        currentIndex++;

        // Try next favicon source - same order as generateFaviconHTML
        const faviconSources = [
            `https://logo.clearbit.com/${encodeURIComponent(domain)}`,
            `https://www.google.com/s2/favicons?sz=${size}&domain=${encodeURIComponent(domain)}`,
            `https://favicons.githubusercontent.com/${encodeURIComponent(domain)}`,
            `https://api.faviconkit.com/${encodeURIComponent(domain)}/${size}`,
            `https://favicon.yandex.net/favicon/${encodeURIComponent(domain)}`,
            `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`,
            `https://${domain}/favicon.ico`
        ];

        if (currentIndex < faviconSources.length) {
            // Fade out then try next source for smoother transition
            try { img.classList.add('icon-unloading'); } catch (_) { }
            setTimeout(() => {
                img.dataset.sourceIndex = currentIndex.toString();
                img.src = faviconSources[currentIndex];
                try { img.classList.remove('icon-unloading'); } catch (_) { }
            }, 120);
        } else {
            // All sources failed, show fallback icon with a graceful fade-out
            try { img.classList.add('icon-unloading'); } catch (_) { }
            setTimeout(() => {
                img.classList.add('favicon-failed');
                img.style.display = 'none';
                const fallbackIcon = window.__pcAccountsIcon();
                img.insertAdjacentHTML('afterend', fallbackIcon);
            }, 120);
        }
    }
};

// Global icon animation system - adds 'icon-loaded' class for smooth fade-in
window.__pcIconAnimator = {
    init: function () {
        // Observe all images (favicons, logos) and add loaded class
        this.observeImages();
        // Observe all SVG icons and add loaded class
        this.observeSVGs();
        // Observe all avatar circles
        this.observeAvatars();
    },

    observeImages: function () {
        // Get all favicon images currently in DOM
        const loadImage = (img) => {
            // Prevent duplicate processing
            if (img.dataset.iconObserved) return;
            img.dataset.iconObserved = 'true';

            // Ensure image starts hidden for animation
            if (!img.classList.contains('icon-loaded')) {
                img.style.opacity = '0';
                img.style.transform = 'scale(0.95)';
            }

            // Check if already loaded (cached images)
            const checkAndLoad = () => {
                if (img.complete && img.naturalWidth > 0) {
                    // For cached images, add a small delay to ensure smooth fade-in
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            img.classList.add('icon-loaded');
                        });
                    });
                    return true;
                }
                return false;
            };

            // Immediate check for cached images
            if (checkAndLoad()) return;

            // If not cached, wait for load event
            img.addEventListener('load', () => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        img.classList.add('icon-loaded');
                    });
                });
            }, { once: true });

            // Handle error - still show with animation
            img.addEventListener('error', () => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        img.classList.add('icon-loaded');
                    });
                });
            }, { once: true });
        };

        // Load existing images
        document.querySelectorAll('.company-favicon, .logo').forEach(loadImage);

        // Watch for new images with MutationObserver
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // Element node
                        if (node.matches && node.matches('.company-favicon, .logo')) {
                            loadImage(node);
                        }
                        // Check children
                        if (node.querySelectorAll) {
                            node.querySelectorAll('.company-favicon, .logo').forEach(loadImage);
                        }
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    },

    observeSVGs: function () {
        // Add loaded class to SVGs after a frame
        const loadSVG = (svg) => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => svg.classList.add('icon-loaded'));
            });
        };

        // Load existing SVGs
        document.querySelectorAll('button svg, .qa-btn svg, .action-btn svg, .toolbar-btn svg, .search-btn svg, .call-btn svg, .pc-modal__close svg, .nav-item svg, .toast-icon svg').forEach(loadSVG);

        // Watch for new SVGs
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        if (node.tagName === 'svg') {
                            loadSVG(node);
                        }
                        if (node.querySelectorAll) {
                            node.querySelectorAll('svg').forEach(loadSVG);
                        }
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    },

    observeAvatars: function () {
        // Add loaded class to avatar circles and task detail avatars/favicons
        const loadAvatar = (avatar) => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => avatar.classList.add('icon-loaded'));
            });
        };

        // Load existing avatars (including task detail page icons)
        document.querySelectorAll('.avatar-circle, .activity-entity-avatar-circle, .avatar-initials, .company-favicon-header').forEach(loadAvatar);

        // Watch for new avatars
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        if (node.matches && node.matches('.avatar-circle, .activity-entity-avatar-circle, .avatar-initials, .company-favicon-header')) {
                            loadAvatar(node);
                        }
                        if (node.querySelectorAll) {
                            node.querySelectorAll('.avatar-circle, .activity-entity-avatar-circle, .avatar-initials, .company-favicon-header').forEach(loadAvatar);
                        }
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Inject minimal CSS for icon fade animations once
        try {
            if (!document.getElementById('pc-icon-animations')) {
                const style = document.createElement('style');
                style.id = 'pc-icon-animations';
                style.textContent = `
                    .company-favicon, .logo, .avatar-circle, .avatar-initials, .company-favicon-header { opacity: 0; transition: opacity 0.2s ease; }
                    .icon-loaded { opacity: 1 !important; }
                    .icon-unloading { opacity: 0 !important; }
                `;
                document.head.appendChild(style);
            }
        } catch (_) { }
        window.__pcIconAnimator.init();
    });
} else {
    // Inject minimal CSS for icon fade animations once
    try {
        if (!document.getElementById('pc-icon-animations')) {
            const style = document.createElement('style');
            style.id = 'pc-icon-animations';
            style.textContent = `
                .company-favicon, .logo, .avatar-circle, .avatar-initials, .company-favicon-header { opacity: 0; transition: opacity 0.2s ease; }
                .icon-loaded { opacity: 1 !important; }
                .icon-unloading { opacity: 0 !important; }
            `;
            document.head.appendChild(style);
        }
    } catch (_) { }
    window.__pcIconAnimator.init();
}

// Global email signature helper function
window.getEmailSignature = function () {
    if (window.SettingsPage && window.SettingsPage.getEmailSignature) {
        return window.SettingsPage.getEmailSignature();
    }

    // Fallback: try to get from localStorage
    try {
        const savedSettings = localStorage.getItem('crm-settings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            const signature = settings.emailSignature;
            const general = settings.general || {};

            // Check if custom HTML signature is enabled
            if (signature && (signature.useCustomHtml || signature.customHtmlEnabled)) {
                return window.buildCustomHtmlSignature(general);
            }

            if (signature && (signature.text || signature.image)) {
                let signatureHtml = '<div contenteditable="false" data-signature="true" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">';

                if (signature.text) {
                    const textHtml = signature.text.replace(/\n/g, '<br>');
                    signatureHtml += `<div style="font-family: inherit; font-size: 14px; color: #333; line-height: 1.4;">${textHtml}</div>`;
                }

                if (signature.image) {
                    // Use imageSize from settings, with defaults if not set
                    const width = signature.imageSize?.width || 200;
                    const height = signature.imageSize?.height || 100;
                    signatureHtml += `<div style="margin-top: 10px;"><img src="${signature.image}" alt="Signature" style="max-width: ${width}px; max-height: ${height}px; border-radius: 4px;" /></div>`;
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

// Global custom HTML signature builder function
window.buildCustomHtmlSignature = function (general) {
    const g = general || {};

    // Get profile data with fallbacks
    const firstName = g.firstName || '';
    const lastName = g.lastName || '';
    const name = `${firstName} ${lastName}`.trim() || 'Your Name';
    const title = g.jobTitle || 'Energy Strategist';
    const company = g.companyName || 'Power Choosers';
    const phone = g.phone || '+1 (817) 809-3367';
    const email = g.email || '';
    const location = g.location || 'Fort Worth, TX';
    const linkedIn = g.linkedIn || 'https://www.linkedin.com/company/power-choosers';
    const avatar = g.hostedPhotoURL || g.photoURL || '';

    // Clean phone for tel: link
    const phoneClean = phone.replace(/[^\d+]/g, '');

    // Build initials fallback
    const initials = `${firstName.charAt(0).toUpperCase()}${lastName.charAt(0).toUpperCase()}`;

    // Build email-compatible HTML signature (table-based for maximum compatibility)
    return `
<div contenteditable="false" data-signature="true" style="margin-top: 28px; padding-top: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    <!-- Orange gradient divider -->
    <div style="height: 2px; background: linear-gradient(to right, #f59e0b 0%, #f59e0b 40%, transparent 100%); margin-bottom: 24px;"></div>
    
    <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
        <tr>
            <!-- Avatar -->
            <td style="vertical-align: top; padding-right: 20px;">
                ${avatar ? `
                <img src="${avatar}" 
                     alt="${name}" 
                     width="72" 
                     height="72" 
                     style="border-radius: 50%; border: 2px solid #f59e0b; display: block; object-fit: cover;">
                ` : `
                <div style="width: 72px; height: 72px; border-radius: 50%; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); text-align: center; line-height: 72px; color: white; font-size: 24px; font-weight: 600;">
                    ${initials}
                </div>
                `}
            </td>
            
            <!-- Info -->
            <td style="vertical-align: top;">
                <!-- Name -->
                <div style="font-size: 16px; font-weight: 600; color: #0b1b45; margin-bottom: 2px; letter-spacing: -0.3px;">
                    ${name}
                </div>
                
                <!-- Title -->
                <div style="font-size: 13px; font-weight: 500; color: #f59e0b; margin-bottom: 8px; letter-spacing: 0.3px;">
                    ${title}
                </div>
                
                <!-- Company -->
                <div style="font-size: 12px; font-weight: 500; color: #1e3a8a; letter-spacing: 0.5px; margin-bottom: 14px;">
                    ${company}
                </div>
                
                <!-- Contact Details -->
                <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; font-size: 12px; color: #64748b;">
                    <!-- Phone -->
                    <tr>
                        <td style="padding: 3px 12px 3px 0; color: #94a3b8; font-weight: 500; min-width: 50px;">Phone</td>
                        <td style="padding: 3px 0;">
                            <a href="tel:${phoneClean}" style="color: #64748b; text-decoration: none;">${phone}</a>
                        </td>
                    </tr>
                    <!-- Email -->
                    <tr>
                        <td style="padding: 3px 12px 3px 0; color: #94a3b8; font-weight: 500;">Email</td>
                        <td style="padding: 3px 0;">
                            <a href="mailto:${email}" style="color: #64748b; text-decoration: none;">${email}</a>
                        </td>
                    </tr>
                    <!-- Location -->
                    <tr>
                        <td style="padding: 3px 12px 3px 0; color: #94a3b8; font-weight: 500;">Location</td>
                        <td style="padding: 3px 0; color: #64748b;">${location}</td>
                    </tr>
                </table>
                
                <!-- Social Links -->
                <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                    <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
                        <tr>
                            <!-- LinkedIn -->
                            <td style="padding-right: 16px;">
                                <a href="${linkedIn}" target="_blank" style="font-size: 12px; font-weight: 500; color: #64748b; text-decoration: none;">
                                    <img src="https://img.icons8.com/ios-filled/16/64748b/linkedin.png" width="14" height="14" alt="" style="display: inline-block; vertical-align: middle; margin-right: 4px;">
                                    LinkedIn
                                </a>
                            </td>
                            <!-- Website -->
                            <td style="padding-right: 16px;">
                                <a href="https://powerchoosers.com" target="_blank" style="font-size: 12px; font-weight: 500; color: #64748b; text-decoration: none;">
                                    <img src="https://img.icons8.com/ios-filled/16/64748b/domain.png" width="14" height="14" alt="" style="display: inline-block; vertical-align: middle; margin-right: 4px;">
                                    Website
                                </a>
                            </td>
                            <!-- Schedule -->
                            <td>
                                <a href="https://powerchoosers.com/schedule" target="_blank" style="font-size: 12px; font-weight: 500; color: #64748b; text-decoration: none;">
                                    <img src="https://img.icons8.com/ios-filled/16/64748b/calendar--v1.png" width="14" height="14" alt="" style="display: inline-block; vertical-align: middle; margin-right: 4px;">
                                    Schedule
                                </a>
                            </td>
                        </tr>
                    </table>
                </div>
            </td>
        </tr>
    </table>
    
    <!-- Tagline -->
    <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #a0aec0; font-weight: 500; letter-spacing: 0.3px;">
        Power Choosers — Choose Wisely. Power Your Savings. 
        <a href="https://powerchoosers.com" target="_blank" style="color: #f59e0b; text-decoration: none; font-weight: 600;">powerchoosers.com</a>
    </div>
</div>`;
};

// Global email signature text helper function
window.getEmailSignatureText = function () {
    if (window.SettingsPage && window.SettingsPage.getEmailSignatureText) {
        return window.SettingsPage.getEmailSignatureText();
    }

    // Fallback: try to get from localStorage
    try {
        const savedSettings = localStorage.getItem('crm-settings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            const signature = settings.emailSignature;
            const general = settings.general || {};

            // Check if custom HTML signature is enabled - build plain text version
            if (signature && (signature.useCustomHtml || signature.customHtmlEnabled)) {
                const name = `${general.firstName || ''} ${general.lastName || ''}`.trim();
                const title = general.jobTitle || 'Energy Strategist';
                const company = general.companyName || 'Power Choosers';
                const phone = general.phone || '';
                const email = general.email || '';
                const location = general.location || 'Fort Worth, TX';

                let text = '\n\n---\n';
                text += `${name}\n`;
                text += `${title}\n`;
                text += `${company}\n\n`;
                if (phone) text += `Phone: ${phone}\n`;
                if (email) text += `Email: ${email}\n`;
                if (location) text += `Location: ${location}\n`;
                text += '\nChoose Wisely. Power Your Savings.\npowerchoosers.com';
                return text;
            }

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
    // Check for both standard signature and custom HTML signature
    if (currentContent.includes('data-signature="true"') ||
        currentContent.includes('margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;') ||
        currentContent.includes('margin-top: 28px; padding-top: 24px;')) {
        return; // Signature already present
    }

    // Get signature and add to body if it exists
    const signature = window.getEmailSignature ? window.getEmailSignature() : '';
    if (signature) {
        // Create a non-editable guard element that sits immediately BEFORE the signature
        // This gives us a stable insertion point for new lines and prevents the caret from
        // jumping into or past the signature block in contenteditable behaviors.
        const guard = '<div data-signature-guard="true" contenteditable="false" style="display:block;height:0;line-height:0;margin:0;padding:0;border:0;"></div>';
        // If body is empty, just add signature
        if (!currentContent.trim()) {
            // Use a single empty paragraph with no extra margin to avoid dual caret hot-spots
            bodyInput.innerHTML = '<p style="margin:0;"><br></p>' + guard + signature;
        } else {
            // Add signature to end of existing content
            // Avoid duplicate guard/signature insertion
            const alreadyHasGuard = currentContent.indexOf('data-signature-guard="true"') !== -1;
            bodyInput.innerHTML = currentContent + (alreadyHasGuard ? '' : guard) + signature;
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
                    let signatureHtml = '<div contenteditable="false" data-signature="true" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">';

                    if (signatureData.text) {
                        const textHtml = signatureData.text.replace(/\n/g, '<br>');
                        signatureHtml += `<div style="font-family: inherit; font-size: 14px; color: #333; line-height: 1.4;">${textHtml}</div>`;
                    }

                    if (signatureData.image) {
                        signatureHtml += `<div style="margin-top: 10px;"><img src="${signatureData.image}" alt="Signature" style="max-width: 200px; max-height: 100px; border-radius: 4px;" /></div>`;
                    }

                    signatureHtml += '</div>';

                    // Add signature to body with guard before it
                    const guard = '<div data-signature-guard="true" contenteditable="false" style="display:block;height:0;line-height:0;margin:0;padding:0;border:0;"></div>';
                    if (!currentContent.trim()) {
                        bodyInput.innerHTML = '<p><br></p>' + guard + signatureHtml;
                    } else {
                        const alreadyHasGuard = currentContent.indexOf('data-signature-guard="true"') !== -1;
                        bodyInput.innerHTML = currentContent + (alreadyHasGuard ? '' : guard) + signatureHtml;
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

// Initialize CRM when DOM is loaded OR immediately if already loaded
function initializeCRM() {
    // Prevent multiple initialization
    if (window.crm) {
        console.log('[Main] PowerChoosersCRM already initialized, skipping...');
        return;
    }

    console.log('[Main] Initializing PowerChoosersCRM...');
    window.crm = new PowerChoosersCRM();
    console.log('[Main] ✓ PowerChoosersCRM initialized');

    // Add compose button listener for signature injection (with guard)
    const composeBtn = document.getElementById('compose-email-btn');
    if (composeBtn && !composeBtn._composeBound) {
        composeBtn.addEventListener('click', () => {
            // Wait for compose window to open, then inject signature
            setTimeout(() => {
                injectEmailSignature();
            }, 100);
        });
        composeBtn._composeBound = true;
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

}

// Call immediately if DOM is already loaded, otherwise wait
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeCRM);
} else {
    // DOM already loaded (lazy loaded scripts case)
    initializeCRM();
}

// Export for potential module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PowerChoosersCRM;
}
