// Task Notification System
// Monitors tasks and sends notifications 1 hour, 30 minutes, and 5 minutes before due time

class TaskNotificationManager {
    constructor() {
        this.checkInterval = null;
        this.notificationTimers = new Map(); // Track scheduled notifications
        this.sentNotifications = new Set(); // Track already sent notifications
        this.init();
    }

    init() {
        // Start monitoring tasks
        this.startMonitoring();
        
        // Listen for task updates
        window.addEventListener('tasksUpdated', () => {
            this.rescheduleNotifications();
        });
        
        // Listen for page visibility changes to catch up on missed notifications
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.checkImmediateNotifications();
            }
        });
    }

    startMonitoring() {
        // Check for notifications every minute
        this.checkInterval = setInterval(() => {
            this.checkNotifications();
        }, 60000); // 1 minute
        
        // Initial check
        this.checkNotifications();
    }

    stopMonitoring() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        
        // Clear all scheduled notifications
        this.notificationTimers.forEach(timer => clearTimeout(timer));
        this.notificationTimers.clear();
    }

    checkNotifications() {
        const tasks = this.getUpcomingTasks();
        const now = new Date();
        
        tasks.forEach(task => {
            const dueTime = this.parseTaskDueTime(task);
            if (!dueTime) return;
            
            const timeUntilDue = dueTime.getTime() - now.getTime();
            
            // Check for 1 hour notification (60 minutes)
            this.scheduleNotification(task, timeUntilDue - (60 * 60 * 1000), '1 hour');
            
            // Check for 30 minutes notification
            this.scheduleNotification(task, timeUntilDue - (30 * 60 * 1000), '30 minutes');
            
            // Check for 5 minutes notification
            this.scheduleNotification(task, timeUntilDue - (5 * 60 * 1000), '5 minutes');
        });
    }

    checkImmediateNotifications() {
        const tasks = this.getUpcomingTasks();
        const now = new Date();
        
        tasks.forEach(task => {
            const dueTime = this.parseTaskDueTime(task);
            if (!dueTime) return;
            
            const timeUntilDue = dueTime.getTime() - now.getTime();
            const timeUntilDueMinutes = timeUntilDue / (60 * 1000);
            
            // Check if we should have sent notifications already
            if (timeUntilDueMinutes <= 60 && timeUntilDueMinutes > 0) {
                this.checkAndSendNotification(task, timeUntilDueMinutes);
            }
        });
    }

    checkAndSendNotification(task, timeUntilDueMinutes) {
        const notificationKey = `${task.id}_${this.getNotificationType(timeUntilDueMinutes)}`;
        
        if (this.sentNotifications.has(notificationKey)) {
            return; // Already sent
        }
        
        let shouldSend = false;
        let timeText = '';
        
        if (timeUntilDueMinutes <= 5 && timeUntilDueMinutes > 0) {
            shouldSend = true;
            timeText = '5 minutes';
        } else if (timeUntilDueMinutes <= 30 && timeUntilDueMinutes > 5) {
            shouldSend = true;
            timeText = '30 minutes';
        } else if (timeUntilDueMinutes <= 60 && timeUntilDueMinutes > 30) {
            shouldSend = true;
            timeText = '1 hour';
        }
        
        if (shouldSend) {
            this.sendTaskNotification(task, timeText);
            this.sentNotifications.add(notificationKey);
        }
    }

    getNotificationType(timeUntilDueMinutes) {
        if (timeUntilDueMinutes <= 5) return '5min';
        if (timeUntilDueMinutes <= 30) return '30min';
        if (timeUntilDueMinutes <= 60) return '1hour';
        return null;
    }

    scheduleNotification(task, timeUntilNotification, timeText) {
        const notificationKey = `${task.id}_${timeText.replace(' ', '')}`;
        
        // Don't schedule if already sent or if time has passed
        if (this.sentNotifications.has(notificationKey) || timeUntilNotification <= 0) {
            return;
        }
        
        // Clear existing timer for this notification
        if (this.notificationTimers.has(notificationKey)) {
            clearTimeout(this.notificationTimers.get(notificationKey));
        }
        
        // Schedule new notification
        const timer = setTimeout(() => {
            this.sendTaskNotification(task, timeText);
            this.sentNotifications.add(notificationKey);
            this.notificationTimers.delete(notificationKey);
        }, timeUntilNotification);
        
        this.notificationTimers.set(notificationKey, timer);
    }

    sendTaskNotification(task, timeText) {
        if (!window.ToastManager) {
            console.warn('ToastManager not available for task notifications');
            return;
        }

        // Get contact/account information
        const contactInfo = this.getContactInfo(task);
        
        // Create notification data
        const notificationData = {
            title: `Task Due in ${timeText}`,
            message: task.title,
            details: this.formatTaskDetails(task, contactInfo),
            icon: contactInfo.icon,
            type: 'warning',
            duration: 8000, // Show for 8 seconds
            sound: true
        };

        // Show the notification
        window.ToastManager.showToast(notificationData);
        
        // Also show browser notification if permission granted
        if (Notification.permission === 'granted') {
            new Notification(notificationData.title, {
                body: `${notificationData.message}\n${notificationData.details}`,
                icon: '/favicon.ico'
            });
        }
    }

    getContactInfo(task) {
        // Try to get contact information from the task
        let contactName = task.contact || '';
        let accountName = task.account || '';
        let title = '';
        let city = '';
        let state = '';
        let domain = '';
        let icon = null;

        // If we have contact name, create initials
        if (contactName) {
            const initials = contactName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            icon = initials;
        } else if (accountName) {
            // For account-only tasks, try to get favicon
            const account = this.findAccountByName(accountName);
            if (account && account.domain) {
                domain = account.domain;
                icon = this.makeFavicon(domain);
            } else {
                // Use account initials as fallback
                const initials = accountName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                icon = initials;
            }
        } else {
            // Default task icon
            icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9,11 12,14 22,4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`;
        }

        return {
            contactName,
            accountName,
            title,
            city,
            state,
            domain,
            icon
        };
    }

    formatTaskDetails(task, contactInfo) {
        const parts = [];
        
        if (contactInfo.contactName) {
            parts.push(contactInfo.contactName);
        }
        
        if (contactInfo.title) {
            parts.push(contactInfo.title);
        }
        
        if (contactInfo.accountName) {
            parts.push(contactInfo.accountName);
        }
        
        if (contactInfo.city && contactInfo.state) {
            parts.push(`${contactInfo.city}, ${contactInfo.state}`);
        }
        
        // Add task type and priority
        if (task.type) {
            parts.push(`Type: ${task.type}`);
        }
        
        if (task.priority) {
            parts.push(`Priority: ${task.priority}`);
        }
        
        return parts.join(' • ');
    }

    getUpcomingTasks() {
        const tasks = [];
        
        // Get user tasks from localStorage
        try {
            const userTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
            tasks.push(...userTasks.filter(task => task.status !== 'completed'));
        } catch (e) {
            console.warn('Could not load user tasks:', e);
        }
        
        // Get LinkedIn tasks from sequences
        const linkedInTasks = this.getLinkedInTasksFromSequences();
        tasks.push(...linkedInTasks.filter(task => task.status !== 'completed'));
        
        // Filter to only upcoming tasks (within next 2 hours)
        const now = new Date();
        const twoHoursFromNow = new Date(now.getTime() + (2 * 60 * 60 * 1000));
        
        return tasks.filter(task => {
            const dueTime = this.parseTaskDueTime(task);
            return dueTime && dueTime > now && dueTime <= twoHoursFromNow;
        });
    }

    parseTaskDueTime(task) {
        try {
            // Parse due date and time
            const dueDate = task.dueDate;
            const dueTime = task.dueTime;
            
            if (!dueDate || !dueTime) return null;
            
            // Handle different date formats
            let date;
            if (dueDate.includes('/')) {
                // MM/DD/YYYY format
                const [month, day, year] = dueDate.split('/');
                date = new Date(year, month - 1, day);
            } else {
                // YYYY-MM-DD format
                date = new Date(dueDate);
            }
            
            // Parse time
            const timeMatch = dueTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
            if (!timeMatch) return null;
            
            let hours = parseInt(timeMatch[1], 10);
            const minutes = parseInt(timeMatch[2], 10);
            const ampm = timeMatch[3] ? timeMatch[3].toUpperCase() : '';
            
            // Convert to 24-hour format if needed
            if (ampm === 'PM' && hours !== 12) {
                hours += 12;
            } else if (ampm === 'AM' && hours === 12) {
                hours = 0;
            }
            
            date.setHours(hours, minutes, 0, 0);
            
            return date;
        } catch (e) {
            console.warn('Could not parse task due time:', e);
            return null;
        }
    }

    getLinkedInTasksFromSequences() {
        // This would integrate with the existing LinkedIn sequence system
        // For now, return empty array - this can be expanded later
        return [];
    }

    findAccountByName(accountName) {
        // This would integrate with the existing account system
        // For now, return null - this can be expanded later
        return null;
    }

    makeFavicon(domain) {
        if (!domain) return '';
        const d = domain.replace(/^https?:\/\//, '');
        // Use the new favicon helper system if available
        if (window.__pcFaviconHelper) {
            return window.__pcFaviconHelper.generateFaviconHTML(d, 64);
        }
        // Fallback to old system
        return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent('https://' + d)}`;
    }

    rescheduleNotifications() {
        // Clear existing timers
        this.notificationTimers.forEach(timer => clearTimeout(timer));
        this.notificationTimers.clear();
        
        // Clear sent notifications for tasks that might have changed
        this.sentNotifications.clear();
        
        // Reschedule all notifications
        this.checkNotifications();
    }
}

// Initialize the task notification manager
window.TaskNotificationManager = new TaskNotificationManager();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TaskNotificationManager;
}
