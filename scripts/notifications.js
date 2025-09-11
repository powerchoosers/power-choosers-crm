(function() {
    'use strict';

    // Notification System
    if (!window.Notifications) window.Notifications = {};

    // Notification storage
    let notifications = [];
    let notificationId = 1;

    // DOM elements
    let notificationBtn, notificationBadge, notificationDropdown, notificationList;

    // Initialize notification system
    function init() {
        notificationBtn = document.getElementById('notifications-btn');
        notificationBadge = document.getElementById('notification-badge');
        notificationDropdown = document.getElementById('notification-dropdown');
        notificationList = document.getElementById('notification-list');

        if (!notificationBtn || !notificationBadge || !notificationDropdown || !notificationList) {
            console.warn('[Notifications] Required elements not found');
            return;
        }

        // Event listeners
        notificationBtn.addEventListener('click', toggleDropdown);
        document.getElementById('mark-all-read').addEventListener('click', markAllAsRead);
        document.getElementById('view-all-notifications').addEventListener('click', viewAllNotifications);

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!notificationBtn.contains(e.target) && !notificationDropdown.contains(e.target)) {
                closeDropdown();
            }
        });

        // Load real notifications from storage
        loadRealNotifications();
        
        console.log('[Notifications] System initialized');
    }

    // Toggle dropdown visibility
    function toggleDropdown() {
        const isHidden = notificationDropdown.hasAttribute('hidden');
        if (isHidden) {
            openDropdown();
        } else {
            closeDropdown();
        }
    }

    function openDropdown() {
        notificationDropdown.removeAttribute('hidden');
        renderNotifications();
    }

    function closeDropdown() {
        notificationDropdown.setAttribute('hidden', '');
    }

    // Add notification
    function addNotification(type, title, message, data = {}) {
        const notification = {
            id: notificationId++,
            type: type,
            title: title,
            message: message,
            timestamp: new Date(),
            read: false,
            data: data
        };

        notifications.unshift(notification);
        updateBadge();
        saveNotifications(); // Persist to localStorage
        
        // Trigger browser notification if permission granted
        if (Notification.permission === 'granted') {
            new Notification(title, {
                body: message,
                icon: 'https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/68645bd391ea20fecb011c85_2656%20Webclip%20PChoosers.png'
            });
        }

        return notification;
    }

    // Mark notification as read
    function markAsRead(notificationId) {
        const notification = notifications.find(n => n.id === notificationId);
        if (notification) {
            notification.read = true;
            updateBadge();
            renderNotifications();
            saveNotifications(); // Persist changes
        }
    }

    // Mark all notifications as read
    function markAllAsRead() {
        notifications.forEach(n => n.read = true);
        updateBadge();
        renderNotifications();
        saveNotifications(); // Persist changes
    }

    // Update notification badge
    function updateBadge() {
        const unreadCount = notifications.filter(n => !n.read).length;
        notificationBadge.textContent = unreadCount;
        
        if (unreadCount > 0) {
            notificationBadge.classList.add('has-notifications');
        } else {
            notificationBadge.classList.remove('has-notifications');
        }
    }

    // Render notifications in dropdown
    function renderNotifications() {
        if (!notificationList) return;

        if (notifications.length === 0) {
            notificationList.innerHTML = `
                <div class="notification-empty">
                    <div class="notification-empty-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        </svg>
                    </div>
                    <div class="notification-empty-text">No notifications</div>
                    <div class="notification-empty-subtext">You're all caught up!</div>
                </div>
            `;
            return;
        }

        const recentNotifications = notifications.slice(0, 10); // Show last 10
        notificationList.innerHTML = recentNotifications.map(notification => {
            const timeAgo = getTimeAgo(notification.timestamp);
            const iconClass = getIconClass(notification.type);
            const icon = getIcon(notification.type);
            
            return `
                <div class="notification-item ${notification.read ? '' : 'unread'}" data-id="${notification.id}">
                    <div class="notification-icon ${iconClass}">
                        ${icon}
                    </div>
                    <div class="notification-content">
                        <div class="notification-title">${notification.title}</div>
                        <div class="notification-message">${notification.message}</div>
                        <div class="notification-time">${timeAgo}</div>
                    </div>
                </div>
            `;
        }).join('');

        // Add click handlers
        notificationList.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = parseInt(item.dataset.id);
                markAsRead(id);
                handleNotificationClick(id);
            });
        });
    }

    // Get icon class for notification type
    function getIconClass(type) {
        const classes = {
            'missed-call': 'missed-call',
            'call-completed': 'call-completed',
            'new-lead': 'new-lead',
            'system': 'system'
        };
        return classes[type] || 'system';
    }

    // Get icon for notification type
    function getIcon(type) {
        const icons = {
            'missed-call': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
            'call-completed': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>',
            'new-lead': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>',
            'system': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>'
        };
        return icons[type] || '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>';
    }

    // Handle notification click
    function handleNotificationClick(notificationId) {
        const notification = notifications.find(n => n.id === notificationId);
        if (!notification) return;

        closeDropdown();

        // Handle different notification types
        switch (notification.type) {
            case 'missed-call':
                // Navigate to calls page and highlight the missed call
                if (window.navigation && typeof window.navigation.showPage === 'function') {
                    window.navigation.showPage('calls');
                }
                break;
            case 'new-lead':
                // Navigate to people or accounts page
                if (window.navigation && typeof window.navigation.showPage === 'function') {
                    window.navigation.showPage('people');
                }
                break;
            case 'call-completed':
                // Navigate to calls page
                if (window.navigation && typeof window.navigation.showPage === 'function') {
                    window.navigation.showPage('calls');
                }
                break;
        }
    }

    // View all notifications (placeholder)
    function viewAllNotifications() {
        closeDropdown();
        // Could navigate to a dedicated notifications page
        console.log('[Notifications] View all notifications clicked');
    }

    // Get time ago string
    function getTimeAgo(timestamp) {
        const now = new Date();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return timestamp.toLocaleDateString();
    }

    // Load real CRM notifications from API or local storage
    async function loadRealNotifications() {
        try {
            // Try to load from localStorage first
            const stored = localStorage.getItem('crm_notifications');
            if (stored) {
                const parsed = JSON.parse(stored);
                notifications = parsed.map(n => ({
                    ...n,
                    timestamp: new Date(n.timestamp)
                }));
                updateBadge();
            }

            // TODO: Load from actual CRM API endpoints
            // const response = await fetch('/api/notifications');
            // const data = await response.json();
            // notifications = data.notifications || [];
            
        } catch (error) {
            console.warn('[Notifications] Failed to load stored notifications:', error);
        }
    }

    // Save notifications to localStorage
    function saveNotifications() {
        try {
            localStorage.setItem('crm_notifications', JSON.stringify(notifications));
        } catch (error) {
            console.warn('[Notifications] Failed to save notifications:', error);
        }
    }

    // Public API
    window.Notifications = {
        init: init,
        add: addNotification,
        markAsRead: markAsRead,
        markAllAsRead: markAllAsRead,
        
        // Specific notification types
        addMissedCall: function(phoneNumber, contactName = null, callTime = new Date()) {
            const title = 'Missed Call';
            const message = contactName ? 
                `Missed call from ${contactName} (${phoneNumber})` :
                `Missed call from ${phoneNumber}`;
            
            return addNotification('missed-call', title, message, {
                phoneNumber: phoneNumber,
                contactName: contactName,
                callTime: callTime
            });
        },

        addCallCompleted: function(phoneNumber, contactName = null, duration = 0) {
            const title = 'Call Completed';
            const durationText = duration > 0 ? ` (${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')})` : '';
            const message = contactName ?
                `Call with ${contactName}${durationText} completed` :
                `Call with ${phoneNumber}${durationText} completed`;
            
            return addNotification('call-completed', title, message, {
                phoneNumber: phoneNumber,
                contactName: contactName,
                duration: duration
            });
        },

        addNewLead: function(leadName, source = 'Unknown') {
            const title = 'New Lead';
            const message = `${leadName} has been added to your pipeline`;
            
            return addNotification('new-lead', title, message, {
                leadName: leadName,
                source: source
            });
        },

        addSystemNotification: function(title, message) {
            return addNotification('system', title, message);
        }
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

})();
