// Power Choosers CRM Dashboard - Utilities Module
// This module contains utility functions, event listeners, and common helpers

// Extend CRMApp with utility functions
Object.assign(CRMApp, {
    // Setup event listeners
    setupEventListeners() {
        // Navigation links
        document.querySelectorAll('.nav-item').forEach(link => {
            link.addEventListener('click', (e) => {
                const viewName = e.currentTarget.getAttribute('data-view');
                // If it's a view-switching link, prevent default and switch view
                if (viewName) {
                    e.preventDefault();
                    this.showView(viewName);
                    this.updateActiveNavButton(e.currentTarget);
                }
                // If no data-view attribute, the default link behavior will execute.
            });
        });

        // Search functionality
        const searchInput = document.getElementById('global-search');
        if (searchInput) {
            searchInput.addEventListener('input', debounce((e) => {
                this.handleSearch(e.target.value);
            }, 300));
        }

        // Notification button
        const notificationBtn = document.getElementById('notification-btn');
        const notificationDropdown = document.getElementById('notification-dropdown');
        if (notificationBtn && notificationDropdown) {
            notificationBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                notificationDropdown.classList.toggle('active');
            });
            
            document.addEventListener('click', (e) => {
                if (!notificationDropdown.contains(e.target) && notificationDropdown.classList.contains('active')) {
                    notificationDropdown.classList.remove('active');
                }
            });
        }

        // Phone button (next to search) opens a temporary dialer widget in the right panel
        const phoneBtn = document.getElementById('phone-call-btn');
        if (phoneBtn) {
            phoneBtn.addEventListener('click', (e) => {
                e.preventDefault();
                // Open dialer in the default CRM widgets panel without changing views
                if (this.openDialerWidget) {
                    this.openDialerWidget('crm');
                } else {
                    console.warn('openDialerWidget not available');
                }
            });
        }

        // Call Scripts button
        const callScriptsBtn = document.getElementById('call-scripts-btn');
        if (callScriptsBtn) {
            callScriptsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Navigate to the calls view; this will invoke showCallScriptsView() internally
                this.showView('calls-view');
            });
        }
        
        // Activity carousel navigation buttons
        const activityPrevBtn = document.getElementById('activity-prev-btn');
        const activityNextBtn = document.getElementById('activity-next-btn');
        if (activityPrevBtn) {
            activityPrevBtn.addEventListener('click', () => this.scrollActivityCarousel('prev'));
        }
        if (activityNextBtn) {
            activityNextBtn.addEventListener('click', () => this.scrollActivityCarousel('next'));
        }

        this.setupModalHandlers();

        window.addAccount = () => this.addAccount();
        window.addContact = () => this.addContact();
        window.bulkImport = () => this.bulkImport();
        window.closeModal = (modalId) => this.closeModal(modalId);
    },

    // Setup modal event handlers
    setupModalHandlers() {
        const addAccountForm = document.getElementById('add-account-form');
        if (addAccountForm) {
            addAccountForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleAddAccount(e);
            });
        }

        const addContactForm = document.getElementById('add-contact-form');
        if (addContactForm) {
            addContactForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleAddContact(e);
            });
        }

        const bulkImportForm = document.getElementById('bulk-import-form');
        if (bulkImportForm) {
            bulkImportForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleBulkImport(e);
            });
        }
    },

    // Update notification badges - hide if count is zero
    updateBadge(badgeId, count) {
        const badge = document.getElementById(badgeId);
        if (badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.style.display = 'inline-flex';
            } else {
                badge.style.display = 'none';
            }
        }
    },

    // Update all navigation badges
    updateAllBadges() {
        // Update sidebar badges
        this.updateBadge('contacts-badge', this.contacts ? this.contacts.length : 0);
        this.updateBadge('accounts-badge', this.accounts ? this.accounts.length : 0);
        this.updateBadge('emails-badge', 0); // No email count logic yet
        this.updateBadge('tasks-badge', this.tasks ? this.tasks.filter(t => !t.completed).length : 0);
        
        // Update header notification badge
        this.updateBadge('notification-badge', 0); // No notification logic yet
    },

    // Show/hide views in the single-page application
    showView(viewName) {
        console.log(`Switching to view: ${viewName}`);
        this.currentView = viewName;
        
        // Hide all main content views with explicit display none
        document.querySelectorAll('.page-view').forEach(view => {
            view.style.display = 'none';
            view.style.visibility = 'hidden';
            view.style.position = 'absolute';
            view.style.left = '-9999px';
        });

        // Hide all widget containers
        const crmWidgetsContainer = document.getElementById('crm-widgets-container');
        const coldCallingWidgetsContainer = document.getElementById('cold-calling-widgets-container');
        
        if (crmWidgetsContainer) {
            crmWidgetsContainer.style.display = 'none';
        }
        if (coldCallingWidgetsContainer) {
            coldCallingWidgetsContainer.style.display = 'none';
        }

        // Show the selected view with animation
        const targetView = document.getElementById(viewName);
        if (targetView) {
            // Remove page-loaded class to trigger entrance animation
            targetView.classList.remove('page-loaded');
            
            targetView.style.display = 'flex';
            targetView.style.visibility = 'visible';
            targetView.style.position = 'static';
            targetView.style.left = 'auto';
            
            // Scroll content container to top so new view is not offset
            const contentContainer = document.querySelector('.app-content-container');
            if (contentContainer) {
                contentContainer.scrollTop = 0;
            }
            const mainContent = document.getElementById('main-content-wrapper');
            if (mainContent) {
                mainContent.scrollTop = 0;
            }
            // Reset window scroll position as fallback
            window.scrollTo(0, 0);
            
            // Add page-loaded class after animation completes
            setTimeout(() => {
                targetView.classList.add('page-loaded');
            }, 500);
        }

        // Handle special view logic
        switch (viewName) {
            case 'dashboard-view':
                this.renderDashboard();
                if (crmWidgetsContainer) {
                    crmWidgetsContainer.style.display = 'flex';
                }
                break;
            case 'contacts-view':
                this.renderContactsPage();
                if (crmWidgetsContainer) {
                    crmWidgetsContainer.style.display = 'flex';
                }
                break;
            case 'accounts-view':
                this.renderAccountsPage();
                if (crmWidgetsContainer) {
                    crmWidgetsContainer.style.display = 'flex';
                }
                break;
            case 'emails-view':
                this.renderEmailsPage();
                if (crmWidgetsContainer) {
                    crmWidgetsContainer.style.display = 'flex';
                }
                break;
            case 'tasks-view':
                this.renderTasksPage();
                if (crmWidgetsContainer) {
                    crmWidgetsContainer.style.display = 'flex';
                }
                break;
            case 'sequences-view':
                // Use the new sequences module
                if (window.SequencesModule) {
                    window.SequencesModule.renderSequencesPage();
                } else {
                    console.error('SequencesModule not available');
                }
                if (crmWidgetsContainer) {
                    crmWidgetsContainer.style.display = 'flex';
                }
                break;
            case 'calls-view':
                console.log('Attempting to render calls page in showView. renderCallsPage defined:', !!this.renderCallsPage);
                if (this.renderCallsPage) {
                    this.renderCallsPage();
                } else {
                    console.error('renderCallsPage not available');
                }
                if (coldCallingWidgetsContainer) {
                    coldCallingWidgetsContainer.style.display = 'flex';
                }
                break;
            case 'sequence-builder-view':
                // Ensure right widget panel content is visible on builder
                if (crmWidgetsContainer) {
                    crmWidgetsContainer.style.display = 'flex';
                }
                break;
        }
    },

    // Update the active state of navigation buttons
    updateActiveNavButton(activeNav) {
        document.querySelectorAll('.nav-item').forEach(nav => {
            nav.classList.remove('active');
        });
        if (activeNav) {
            activeNav.classList.add('active');
        }
    },

    // Show notification to user
    showNotification(message, type = 'info') {
        const notification = {
            id: Date.now(),
            message: message,
            type: type,
            timestamp: new Date()
        };
        
        this.notifications.unshift(notification);
        this.updateNotifications();
        
        // Auto-remove after 5 seconds for non-error notifications
        if (type !== 'error') {
            setTimeout(() => {
                this.notifications = this.notifications.filter(n => n.id !== notification.id);
                this.updateNotifications();
            }, 5000);
        }
    },

    // Update notifications display
    updateNotifications() {
        const notificationCount = document.getElementById('notification-count');
        const notificationList = document.getElementById('notification-list');
        
        if (notificationCount) {
            notificationCount.textContent = this.notifications.length;
            notificationCount.style.display = this.notifications.length > 0 ? 'block' : 'none';
        }
        
        if (notificationList) {
            notificationList.innerHTML = this.notifications.length === 0 
                ? '<div class="notification-item">No new notifications</div>'
                : this.notifications.map(notification => `
                    <div class="notification-item ${notification.type}">
                        <div class="notification-message">${notification.message}</div>
                        <div class="notification-time">${this.formatTime(notification.timestamp)}</div>
                    </div>
                `).join('');
        }
    },

    // Handle search functionality
    handleSearch(query) {
        if (!query.trim()) {
            console.log('Empty search query');
            return;
        }
        
        console.log(`Searching for: ${query}`);
        
        const results = [];
        
        // Search contacts
        this.contacts.forEach(contact => {
            const searchableText = `${contact.firstName} ${contact.lastName} ${contact.email} ${contact.title} ${contact.accountName}`.toLowerCase();
            if (searchableText.includes(query.toLowerCase())) {
                results.push({
                    type: 'contact',
                    item: contact,
                    title: `${contact.firstName} ${contact.lastName}`,
                    subtitle: contact.title + (contact.accountName ? ` at ${contact.accountName}` : '')
                });
            }
        });
        
        // Search accounts
        this.accounts.forEach(account => {
            const searchableText = `${account.name} ${account.industry} ${account.city}`.toLowerCase();
            if (searchableText.includes(query.toLowerCase())) {
                results.push({
                    type: 'account',
                    item: account,
                    title: account.name,
                    subtitle: `${account.industry} • ${account.city}, ${account.state}`
                });
            }
        });
        
        console.log(`Found ${results.length} search results`);
        this.displaySearchResults(results);
    },

    // Display search results
    displaySearchResults(results) {
        // For now, just log the results. You could implement a dropdown or modal here
        console.log('Search results:', results);
        
        if (results.length > 0) {
            this.showNotification(`Found ${results.length} result(s)`, 'info');
        } else {
            this.showNotification('No results found', 'warning');
        }
    },

    // Format time for display
    formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    },

    // Copy text to clipboard
    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showNotification('Copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            this.showNotification('Failed to copy to clipboard', 'error');
        });
    },

    // Show toast notification
    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toast-container') || this.createToastContainer();
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-message">${message}</div>
            <button class="toast-close" onclick="this.parentElement.remove()">×</button>
        `;
        
        toastContainer.appendChild(toast);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    },

    // Create toast container if it doesn't exist
    createToastContainer() {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
        return container;
    }
});

// Utility functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// MD5 hash function for Gravatar
function md5(string) {
    function md5cycle(x, k) {
        var a = x[0], b = x[1], c = x[2], d = x[3];
        a = ff(a, b, c, d, k[0], 7, -680876936);
        d = ff(d, a, b, c, k[1], 12, -389564586);
        c = ff(c, d, a, b, k[2], 17, 606105819);
        b = ff(b, c, d, a, k[3], 22, -1044525330);
        a = ff(a, b, c, d, k[4], 7, -176418897);
        d = ff(d, a, b, c, k[5], 12, 1200080426);
        c = ff(c, d, a, b, k[6], 17, -1473231341);
        b = ff(b, c, d, a, k[7], 22, -45705983);
        a = ff(a, b, c, d, k[8], 7, 1770035416);
        d = ff(d, a, b, c, k[9], 12, -1958414417);
        c = ff(c, d, a, b, k[10], 17, -42063);
        b = ff(b, c, d, a, k[11], 22, -1990404162);
        a = ff(a, b, c, d, k[12], 7, 1804603682);
        d = ff(d, a, b, c, k[13], 12, -40341101);
        c = ff(c, d, a, b, k[14], 17, -1502002290);
        b = ff(b, c, d, a, k[15], 22, 1236535329);
        a = gg(a, b, c, d, k[1], 5, -165796510);
        d = gg(d, a, b, c, k[6], 9, -1069501632);
        c = gg(c, d, a, b, k[11], 14, 643717713);
        b = gg(b, c, d, a, k[0], 20, -373897302);
        a = gg(a, b, c, d, k[5], 5, -701558691);
        d = gg(d, a, b, c, k[10], 9, 38016083);
        c = gg(c, d, a, b, k[15], 14, -660478335);
        b = gg(b, c, d, a, k[4], 20, -405537848);
        a = gg(a, b, c, d, k[9], 5, 568446438);
        d = gg(d, a, b, c, k[14], 9, -1019803690);
        c = gg(c, d, a, b, k[3], 14, -187363961);
        b = gg(b, c, d, a, k[8], 20, 1163531501);
        a = gg(a, b, c, d, k[13], 5, -1444681467);
        d = gg(d, a, b, c, k[2], 9, -51403784);
        c = gg(c, d, a, b, k[7], 14, 1735328473);
        b = gg(b, c, d, a, k[12], 20, -1926607734);
        a = hh(a, b, c, d, k[5], 4, -378558);
        d = hh(d, a, b, c, k[8], 11, -2022574463);
        c = hh(c, d, a, b, k[11], 16, 1839030562);
        b = hh(b, c, d, a, k[14], 23, -35309556);
        a = hh(a, b, c, d, k[1], 4, -1530992060);
        d = hh(d, a, b, c, k[4], 11, 1272893353);
        c = hh(c, d, a, b, k[7], 16, -155497632);
        b = hh(b, c, d, a, k[10], 23, -1094730640);
        a = hh(a, b, c, d, k[13], 4, 681279174);
        d = hh(d, a, b, c, k[0], 11, -358537222);
        c = hh(c, d, a, b, k[3], 16, -722521979);
        b = hh(b, c, d, a, k[6], 23, 76029189);
        a = hh(a, b, c, d, k[9], 4, -640364487);
        d = hh(d, a, b, c, k[12], 11, -421815835);
        c = hh(c, d, a, b, k[15], 16, 530742520);
        b = hh(b, c, d, a, k[2], 23, -995338651);
        a = ii(a, b, c, d, k[0], 6, -198630844);
        d = ii(d, a, b, c, k[7], 10, 1126891415);
        c = ii(c, d, a, b, k[14], 15, -1416354905);
        b = ii(b, c, d, a, k[5], 21, -57434055);
        a = ii(a, b, c, d, k[12], 6, 1700485571);
        d = ii(d, a, b, c, k[3], 10, -1894986606);
        c = ii(c, d, a, b, k[10], 15, -1051523);
        b = ii(b, c, d, a, k[1], 21, -2054922799);
        a = ii(a, b, c, d, k[8], 6, 1873313359);
        d = ii(d, a, b, c, k[15], 10, -30611744);
        c = ii(c, d, a, b, k[6], 15, -1560198380);
        b = ii(b, c, d, a, k[13], 21, 1309151649);
        a = ii(a, b, c, d, k[4], 6, -145523070);
        d = ii(d, a, b, c, k[11], 10, -1120210379);
        c = ii(c, d, a, b, k[2], 15, 718787259);
        b = ii(b, c, d, a, k[9], 21, -343485551);
        x[0] = add32(a, x[0]);
        x[1] = add32(b, x[1]);
        x[2] = add32(c, x[2]);
        x[3] = add32(d, x[3]);
    }

    function cmn(q, a, b, x, s, t) {
        a = add32(add32(a, q), add32(x, t));
        return add32((a << s) | (a >>> (32 - s)), b);
    }

    function ff(a, b, c, d, x, s, t) {
        return cmn((b & c) | ((~b) & d), a, b, x, s, t);
    }

    function gg(a, b, c, d, x, s, t) {
        return cmn((b & d) | (c & (~d)), a, b, x, s, t);
    }

    function hh(a, b, c, d, x, s, t) {
        return cmn(b ^ c ^ d, a, b, x, s, t);
    }

    function ii(a, b, c, d, x, s, t) {
        return cmn(c ^ (b | (~d)), a, b, x, s, t);
    }

    function md51(s) {
        var n = s.length,
            state = [1732584193, -271733879, -1732584194, 271733878], i;
        for (i = 64; i <= s.length; i += 64) {
            md5cycle(state, md5blk(s.substring(i - 64, i)));
        }
        s = s.substring(i - 64);
        var tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (i = 0; i < s.length; i++)
            tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
        tail[i >> 2] |= 0x80 << ((i % 4) << 3);
        if (i > 55) {
            md5cycle(state, tail);
            for (i = 0; i < 16; i++) tail[i] = 0;
        }
        tail[14] = n * 8;
        md5cycle(state, tail);
        return state;
    }

    function md5blk(s) {
        var md5blks = [], i;
        for (i = 0; i < 64; i += 4) {
            md5blks[i >> 2] = s.charCodeAt(i)
                + (s.charCodeAt(i + 1) << 8)
                + (s.charCodeAt(i + 2) << 16)
                + (s.charCodeAt(i + 3) << 24);
        }
        return md5blks;
    }

    var hex_chr = '0123456789abcdef'.split('');

    function rhex(n) {
        var s = '', j = 0;
        for (; j < 4; j++)
            s += hex_chr[(n >> (j * 8 + 4)) & 0x0F]
                + hex_chr[(n >> (j * 8)) & 0x0F];
        return s;
    }

    function hex(x) {
        for (var i = 0; i < x.length; i++)
            x[i] = rhex(x[i]);
        return x.join('');
    }

    function add32(a, b) {
        return (a + b) & 0xFFFFFFFF;
    }

    return hex(md51(string));
}

// Make utility functions globally available
window.debounce = debounce;
window.md5 = md5;
