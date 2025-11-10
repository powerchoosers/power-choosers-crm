// Enhanced Toast Notification Manager
// Integrates with top bar and provides color-coded notifications with sounds

class ToastManager {
    constructor() {
        this.container = document.getElementById('toast-container');
        this.toasts = new Map();
        this.soundEnabled = true;
        this.init();
    }

    init() {
        // Create audio elements for different notification sounds
        // Using simple beep patterns for different notification types
        this.sounds = {
            call: this.createAudio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT'),
            email: this.createAudio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT'),
            save: this.createAudio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT'),
            error: this.createAudio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT'),
            warning: this.createAudio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT'),
            info: this.createAudio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT'),
            task: this.createAudio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT')
        };
        
        // For now, we'll use the browser's built-in notification sounds
        // In a production environment, you would replace these with actual audio files
        this.soundEnabled = true;
    }

    createAudio(dataUrl) {
        const audio = new Audio(dataUrl);
        audio.volume = 0.3;
        return audio;
    }

    // Main toast creation method
    showToast(options) {
        // Handle string arguments (legacy support)
        if (typeof options === 'string') {
            options = { message: options, type: 'info' };
        }
        
        // Ensure options is an object
        if (!options || typeof options !== 'object') {
            console.warn('[ToastManager] Invalid options provided to showToast:', options);
            options = { message: String(options || ''), type: 'info' };
        }
        
        const {
            type = 'info',
            title,
            message,
            details,
            duration = 5000,
            actions = [],
            icon,
            sound = true,
            persistent = false
        } = options;

        const toastId = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Play sound if enabled and not a save notification
        // Safely check if sound exists and has play method
        if (sound && this.soundEnabled && type !== 'save' && this.sounds && this.sounds[type] && typeof this.sounds[type].play === 'function') {
            this.sounds[type].play().catch(e => console.warn('Could not play notification sound:', e));
        }

        const toast = this.createToastElement(toastId, {
            type,
            title,
            message,
            details,
            actions,
            icon
        });

        this.container.appendChild(toast);
        this.toasts.set(toastId, toast);

        // Adjust existing toasts to match the width of the new toast
        this.adjustToastWidths();

        // Trigger animation with a small delay to ensure DOM is ready
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.classList.add('show');
            });
        });

        // Auto-remove if not persistent
        if (!persistent) {
            setTimeout(() => {
                this.removeToast(toastId);
            }, duration);
        }

        return toastId;
    }

    createToastElement(id, options) {
        const { type, title, message, details, actions, icon } = options;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.id = id;

        // Create icon
        const iconElement = this.createIcon(type, icon);
        
        // Create content
        const content = document.createElement('div');
        content.className = 'toast-content';
        
        if (title) {
            const titleElement = document.createElement('div');
            titleElement.className = 'toast-title';
            titleElement.textContent = title;
            content.appendChild(titleElement);
        }
        
        if (message) {
            const messageElement = document.createElement('div');
            messageElement.className = 'toast-message';
            messageElement.textContent = message;
            content.appendChild(messageElement);
        }
        
        if (details) {
            const detailsElement = document.createElement('div');
            detailsElement.className = 'toast-details';
            detailsElement.textContent = details;
            content.appendChild(detailsElement);
        }

        // Create actions
        if (actions && actions.length > 0) {
            const actionsElement = document.createElement('div');
            actionsElement.className = type === 'call' ? 'call-actions' : 'toast-actions';
            
            actions.forEach(action => {
                const button = document.createElement('button');
                button.className = `toast-btn ${action.class || ''}`;
                button.textContent = action.text;
                button.onclick = action.handler;
                actionsElement.appendChild(button);
            });
            
            content.appendChild(actionsElement);
        }

        // Create close button
        const closeButton = document.createElement('button');
        closeButton.className = 'toast-close';
        closeButton.innerHTML = '×';
        closeButton.onclick = () => this.removeToast(id);

        toast.appendChild(iconElement);
        toast.appendChild(content);
        toast.appendChild(closeButton);

        return toast;
    }

    createIcon(type, customIcon) {
        const iconElement = document.createElement('div');
        iconElement.className = 'toast-icon';

        if (customIcon) {
            if (typeof customIcon === 'string' && customIcon.startsWith('http')) {
                // Image URL
                const img = document.createElement('img');
                img.src = customIcon;
                img.alt = 'Icon';
                iconElement.appendChild(img);
            } else if (typeof customIcon === 'string' && customIcon.startsWith('<svg')) {
                // SVG string
                iconElement.innerHTML = customIcon;
            } else if (typeof customIcon === 'string') {
                // Text/initials
                iconElement.textContent = customIcon;
            }
        } else {
        // Default icons based on type - using SVG vector icons
        const defaultIcons = {
            call: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`,
            email: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`,
            save: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20,6 9,17 4,12"></polyline></svg>`,
            error: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
            warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
            info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
            task: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9,11 12,14 22,4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`
        };
            iconElement.innerHTML = defaultIcons[type] || defaultIcons.info;
        }

        return iconElement;
    }

    removeToast(id) {
        const toast = this.toasts.get(id);
        if (!toast) return;

        toast.classList.add('hide');
        toast.classList.remove('show');

        // Wait for animation to complete before removing
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            this.toasts.delete(id);
            
            // Adjust remaining toasts after removal
            this.adjustToastWidths();
        }, 400); // Match the CSS transition duration
    }

    // Adjust all toast widths to match the widest toast
    adjustToastWidths() {
        if (this.toasts.size === 0) return;

        // Get all visible toasts (not hiding)
        const visibleToasts = Array.from(this.toasts.values()).filter(toast => 
            !toast.classList.contains('hide')
        );

        if (visibleToasts.length === 0) return;

        // Find the widest toast
        let maxWidth = 0;
        visibleToasts.forEach(toast => {
            // Temporarily remove width constraints to measure natural width
            const originalMinWidth = toast.style.minWidth;
            const originalMaxWidth = toast.style.maxWidth;
            const originalWidth = toast.style.width;
            
            toast.style.minWidth = 'auto';
            toast.style.maxWidth = 'none';
            toast.style.width = 'auto';
            
            const rect = toast.getBoundingClientRect();
            maxWidth = Math.max(maxWidth, rect.width);
            
            // Restore original styles
            toast.style.minWidth = originalMinWidth;
            toast.style.maxWidth = originalMaxWidth;
            toast.style.width = originalWidth;
        });

        // Apply the max width to all toasts with smooth transition
        const targetWidth = Math.min(Math.max(maxWidth, 320), 400); // Clamp between min and max
        
        visibleToasts.forEach(toast => {
            toast.style.width = `${targetWidth}px`;
        });
    }

    // Convenience methods for different notification types
    showCallNotification(callData) {
        const { callerName, callerNumber, company, title, city, state, callerIdImage, carrierName, carrierType, nationalFormat } = callData;
        
        let titleText = 'Incoming Call';
        let messageText = nationalFormat || callerNumber;
        let detailsText = '';
        let icon = null;

        if (callerName) {
            titleText = callerName;
            messageText = nationalFormat || callerNumber;
            if (title) detailsText += title;
            if (company) detailsText += (detailsText ? ' at ' : '') + company;
            if (city && state) detailsText += (detailsText ? ', ' : '') + `${city}, ${state}`;
            
            // Create initials from name
            const initials = callerName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            icon = initials;
        } else if (callerIdImage) {
            icon = callerIdImage;
        } else if (carrierName) {
            // Show carrier information for unknown callers
            titleText = 'Unknown Caller';
            messageText = nationalFormat || callerNumber;
            detailsText = `${carrierName} (${carrierType || 'Mobile'})`;
            
            // Use carrier type for icon - vector icons instead of emojis
            if (carrierType === 'mobile') {
                icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>`;
            } else if (carrierType === 'landline') {
                icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`;
            } else if (carrierType === 'voip') {
                icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;
            } else {
                icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`;
            }
        } else {
            // Completely unknown caller
            titleText = 'Unknown Caller';
            messageText = nationalFormat || callerNumber;
            detailsText = 'Unknown number';
            icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
        }

        return this.showToast({
            type: 'call',
            title: titleText,
            message: messageText,
            details: detailsText,
            icon: icon,
            duration: 0, // Persistent until answered/declined
            persistent: true,
            actions: [
                {
                    text: 'Answer',
                    class: 'answer',
                    handler: () => this.answerCall(callData)
                },
                {
                    text: 'Decline',
                    class: 'decline',
                    handler: () => this.declineCall(callData)
                }
            ]
        });
    }

    showEmailNotification(emailData) {
        const { to, subject, type = 'opened' } = emailData;
        
        const typeMessages = {
            opened: 'Email Opened',
            replied: 'Email Replied',
            sent: 'Email Sent'
        };

        return this.showToast({
            type: 'email',
            title: typeMessages[type] || 'Email Notification',
            message: `${to} - ${subject}`,
            duration: 4000
        });
    }

    showSaveNotification(message) {
        return this.showToast({
            type: 'save',
            title: 'Saved',
            message: message,
            duration: 2000,
            sound: false // No sound for saves as requested
        });
    }

    showErrorNotification(title, message) {
        return this.showToast({
            type: 'error',
            title: title,
            message: message,
            duration: 6000
        });
    }

    showWarningNotification(title, message) {
        return this.showToast({
            type: 'warning',
            title: title,
            message: message,
            duration: 5000
        });
    }

    showInfoNotification(title, message) {
        return this.showToast({
            type: 'info',
            title: title,
            message: message,
            duration: 4000
        });
    }

    // Call handling methods
    answerCall(callData) {
        // Handle call acceptance
        if (window.TwilioRTC && window.TwilioRTC.acceptCall) {
            window.TwilioRTC.acceptCall();
        }
        
        // Remove the toast
        if (callData.toastId) {
            this.removeToast(callData.toastId);
        }
        
        // Show call accepted notification
        this.showInfoNotification('Call Accepted', `Connected to ${callData.callerName || callData.callerNumber}`);
    }

    declineCall(callData) {
        // Handle call rejection
        if (window.TwilioRTC && window.TwilioRTC.declineCall) {
            window.TwilioRTC.declineCall();
        }
        
        // Remove the toast
        if (callData.toastId) {
            this.removeToast(callData.toastId);
        }
        
        // Show call declined notification
        this.showInfoNotification('Call Declined', `Declined call from ${callData.callerName || callData.callerNumber}`);
    }

    // Utility methods
    clearAll() {
        this.toasts.forEach((toast, id) => {
            this.removeToast(id);
        });
    }

    setSoundEnabled(enabled) {
        this.soundEnabled = enabled;
    }
}

// Initialize global toast manager
window.ToastManager = new ToastManager();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ToastManager;
}
