/**
 * Power Choosers CRM - Email Module
 * Gmail-like interface with Google Gmail API integration
 */

class EmailManager {
    constructor() {
        this.currentFolder = 'inbox';
        this.emails = [];
        this.selectedEmails = new Set();
        this.sidebarCollapsed = false;
        this.isAuthenticated = false;
        this.gapi = null;
        
        // Google API configuration
        this.CLIENT_ID = '448802258090-re0u5rtja879t4tkej22rnedmo1jt3lp.apps.googleusercontent.com';
        this.API_KEY = 'AIzaSyBKg28LJZgyI3J--I8mnQXOLGN5351tfaE'; // From Firebase config
        this.DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest';
        this.SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';
        
        this.init();
    }

    async init() {
        try {
            console.log('EmailManager: Starting initialization...');
            await this.loadGoogleAPI();
            this.bindEvents();
            this.updateUI();
            console.log('EmailManager: Initialization complete');
        } catch (error) {
            console.error('Email manager initialization failed:', error);
            this.showAuthPrompt();
        }
    }

    updateUI() {
        // Force show auth prompt on initial load
        this.showAuthPrompt();
    }

    async loadGoogleAPI() {
        return new Promise((resolve, reject) => {
            if (window.gapi) {
                this.gapi = window.gapi;
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js';
            script.onload = async () => {
                this.gapi = window.gapi;
                await this.gapi.load('client:auth2', async () => {
                    try {
                        await this.gapi.client.init({
                            apiKey: this.API_KEY,
                            clientId: this.CLIENT_ID,
                            discoveryDocs: [this.DISCOVERY_DOC],
                            scope: this.SCOPES
                        });
                        
                        console.log('Google API client initialized successfully');
                        
                        const authInstance = this.gapi.auth2.getAuthInstance();
                        this.isAuthenticated = authInstance.isSignedIn.get();
                        
                        if (this.isAuthenticated) {
                            await this.loadEmails();
                        }
                        
                        resolve();
                    } catch (error) {
                        console.error('Error initializing Google API:', error);
                        reject(error);
                    }
                });
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    bindEvents() {
        // Sidebar toggle
        const toggleBtn = document.getElementById('toggle-sidebar-btn');
        toggleBtn?.addEventListener('click', () => this.toggleSidebar());

        // Folder navigation
        document.querySelectorAll('.folder-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const folder = e.currentTarget.dataset.folder;
                this.switchFolder(folder);
            });
        });

        // Email controls
        const selectAllCheckbox = document.getElementById('select-all-emails');
        selectAllCheckbox?.addEventListener('change', (e) => this.selectAllEmails(e.target.checked));

        const archiveBtn = document.getElementById('archive-btn');
        archiveBtn?.addEventListener('click', () => this.archiveSelected());

        const deleteBtn = document.getElementById('delete-btn');
        deleteBtn?.addEventListener('click', () => this.deleteSelected());

        const markReadBtn = document.getElementById('mark-read-btn');
        markReadBtn?.addEventListener('click', () => this.markSelectedAsRead());

        // Compose button
        const composeBtn = document.getElementById('compose-email-btn');
        composeBtn?.addEventListener('click', () => this.composeEmail());

        // Refresh button
        const refreshBtn = document.getElementById('refresh-emails-btn');
        refreshBtn?.addEventListener('click', () => this.refreshEmails());

        // Search
        const searchInput = document.getElementById('emails-search');
        searchInput?.addEventListener('input', (e) => this.searchEmails(e.target.value));

        // Authentication check on page focus
        window.addEventListener('focus', () => this.checkAuthentication());
    }

    async checkAuthentication() {
        if (!this.gapi || !this.gapi.auth2) {
            this.showAuthPrompt();
            return;
        }
        
        const authInstance = this.gapi.auth2.getAuthInstance();
        const wasAuthenticated = this.isAuthenticated;
        this.isAuthenticated = authInstance.isSignedIn.get();
        
        if (!wasAuthenticated && this.isAuthenticated) {
            await this.loadEmails();
        } else if (!this.isAuthenticated) {
            this.showAuthPrompt();
        }
    }

    showAuthPrompt() {
        const emailList = document.getElementById('email-list');
        if (!emailList) return;

        // Check if we're on a secure context (HTTPS or localhost)
        const isSecure = window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost';
        
        emailList.innerHTML = `
            <div class="email-auth-prompt">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M9 12l2 2 4-4"/>
                    <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c2.39 0 4.68.94 6.36 2.64"/>
                </svg>
                <h3>Gmail Integration Setup Required</h3>
                <p>To use Gmail with this CRM, you need to:</p>
                <ol style="text-align: left; margin: 16px 0; color: var(--text-secondary);">
                    <li><strong>Enable Gmail API</strong> in Google Cloud Console</li>
                    <li><strong>Add authorized origins:</strong> ${window.location.origin}</li>
                    <li><strong>Configure OAuth consent screen</strong></li>
                </ol>
                <p style="margin-top: 20px;">
                    <strong>Current status:</strong> ${isSecure ? 'Secure context ✓' : 'Requires HTTPS'}<br>
                    <strong>URL:</strong> ${window.location.href}
                </p>
                <div style="margin-top: 20px;">
                    <button class="btn-primary" onclick="window.emailManager?.authenticate()" style="margin-right: 10px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 12l2 2 4-4"/>
                            <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c2.39 0 4.68.94 6.36 2.64"/>
                        </svg>
                        Try Sign In
                    </button>
                    <button class="btn-secondary" onclick="window.emailManager?.showSetupInstructions()">
                        Setup Instructions
                    </button>
                </div>
            </div>
        `;
    }

    async authenticate() {
        if (!this.gapi || !this.gapi.auth2) {
            window.crm?.showToast('Google API not loaded. Please refresh the page.');
            return;
        }

        try {
            console.log('Starting Google authentication...');
            const authInstance = this.gapi.auth2.getAuthInstance();
            
            if (!authInstance) {
                throw new Error('Google Auth instance not available');
            }
            
            const user = await authInstance.signIn();
            console.log('Authentication successful:', user);
            
            this.isAuthenticated = true;
            await this.loadEmails();
            window.crm?.showToast('Successfully connected to Gmail!');
        } catch (error) {
            console.error('Authentication failed:', error);
            
            let errorMessage = 'Failed to authenticate with Google.';
            if (error.error === 'popup_blocked_by_browser') {
                errorMessage = 'Popup blocked. Please allow popups and try again.';
            } else if (error.error === 'access_denied') {
                errorMessage = 'Access denied. Please grant permissions to continue.';
            } else if (error.error === 'invalid_client') {
                errorMessage = 'Invalid client configuration. Check Google API setup.';
            }
            
            window.crm?.showToast(errorMessage);
            this.showSetupInstructions();
        }
    }

    showSetupInstructions() {
        const emailList = document.getElementById('email-list');
        if (!emailList) return;

        emailList.innerHTML = `
            <div class="email-auth-prompt">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
                <h3>Google API Setup Instructions</h3>
                <div style="text-align: left; max-width: 600px; margin: 0 auto;">
                    <h4>1. Google Cloud Console Setup</h4>
                    <ul style="color: var(--text-secondary); margin-bottom: 20px;">
                        <li>Go to <a href="https://console.cloud.google.com" target="_blank" style="color: var(--orange-subtle);">Google Cloud Console</a></li>
                        <li>Select project: <strong>power-choosers-crm-468420</strong></li>
                        <li>Enable <strong>Gmail API</strong> in APIs & Services</li>
                    </ul>
                    
                    <h4>2. OAuth Consent Screen</h4>
                    <ul style="color: var(--text-secondary); margin-bottom: 20px;">
                        <li>Configure OAuth consent screen</li>
                        <li>Add your email as a test user</li>
                        <li>Set application type to <strong>Web application</strong></li>
                    </ul>
                    
                    <h4>3. Authorized JavaScript Origins</h4>
                    <p style="color: var(--text-secondary);">Add these URLs to your OAuth client:</p>
                    <div style="background: var(--bg-item); padding: 10px; border-radius: 4px; font-family: monospace; margin: 10px 0;">
                        ${window.location.origin}<br>
                        http://localhost:3000<br>
                        https://powerchoosers.com
                    </div>
                    
                    <h4>4. Current Configuration</h4>
                    <div style="background: var(--bg-item); padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px;">
                        Client ID: ${this.CLIENT_ID}<br>
                        Current Origin: ${window.location.origin}
                    </div>
                </div>
                
                <div style="margin-top: 30px;">
                    <button class="btn-primary" onclick="window.emailManager?.showAuthPrompt()">
                        ← Back to Sign In
                    </button>
                </div>
            </div>
        `;
    }

    async loadEmails() {
        if (!this.isAuthenticated) {
            this.showAuthPrompt();
            return;
        }

        this.showLoading();

        try {
            const query = this.buildQuery();
            const response = await this.gapi.client.gmail.users.messages.list({
                userId: 'me',
                q: query,
                maxResults: 50
            });

            if (response.result.messages) {
                const emailPromises = response.result.messages.map(msg => 
                    this.gapi.client.gmail.users.messages.get({
                        userId: 'me',
                        id: msg.id,
                        format: 'metadata',
                        metadataHeaders: ['From', 'To', 'Subject', 'Date']
                    })
                );

                const emailResponses = await Promise.all(emailPromises);
                this.emails = emailResponses.map(resp => this.parseEmailData(resp.result));
                this.renderEmails();
                this.updateFolderCounts();
            } else {
                this.emails = [];
                this.showEmptyState();
            }
        } catch (error) {
            console.error('Error loading emails:', error);
            window.crm?.showToast('Failed to load emails. Please try again.');
            this.showEmptyState();
        }
    }

    buildQuery() {
        const queries = {
            inbox: 'in:inbox',
            sent: 'in:sent',
            drafts: 'in:drafts',
            starred: 'is:starred',
            important: 'is:important',
            spam: 'in:spam',
            trash: 'in:trash',
            scheduled: 'label:scheduled'
        };
        return queries[this.currentFolder] || 'in:inbox';
    }

    parseEmailData(emailData) {
        const headers = emailData.payload?.headers || [];
        const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

        return {
            id: emailData.id,
            threadId: emailData.threadId,
            from: getHeader('From'),
            to: getHeader('To'),
            subject: getHeader('Subject') || '(no subject)',
            date: new Date(getHeader('Date')),
            snippet: emailData.snippet || '',
            unread: emailData.labelIds?.includes('UNREAD') || false,
            starred: emailData.labelIds?.includes('STARRED') || false,
            important: emailData.labelIds?.includes('IMPORTANT') || false,
            labels: emailData.labelIds || []
        };
    }

    renderEmails() {
        const emailList = document.getElementById('email-list');
        const emailCount = document.getElementById('email-count');
        
        if (!emailList) return;

        emailCount.textContent = `${this.emails.length} email${this.emails.length !== 1 ? 's' : ''}`;

        if (this.emails.length === 0) {
            this.showEmptyState();
            return;
        }

        emailList.innerHTML = this.emails.map(email => `
            <div class="email-item ${email.unread ? 'unread' : ''}" data-email-id="${email.id}">
                <input type="checkbox" class="email-item-checkbox" data-email-id="${email.id}">
                <button class="email-item-star ${email.starred ? 'starred' : ''}" data-email-id="${email.id}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="${email.starred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26 12,2"/>
                    </svg>
                </button>
                <div class="email-item-sender">${this.extractName(email.from)}</div>
                <div class="email-item-content">
                    <div class="email-item-subject">${email.subject}</div>
                    <div class="email-item-preview">${email.snippet}</div>
                </div>
                <div class="email-item-meta">
                    <div class="email-item-time">${this.formatDate(email.date)}</div>
                    ${email.important ? '<div class="email-attachment-icon">!</div>' : ''}
                </div>
            </div>
        `).join('');

        this.bindEmailItemEvents();
    }

    bindEmailItemEvents() {
        // Email item clicks
        document.querySelectorAll('.email-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.type === 'checkbox' || e.target.closest('.email-item-star')) return;
                const emailId = item.dataset.emailId;
                this.openEmail(emailId);
            });
        });

        // Checkbox changes
        document.querySelectorAll('.email-item-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const emailId = e.target.dataset.emailId;
                if (e.target.checked) {
                    this.selectedEmails.add(emailId);
                } else {
                    this.selectedEmails.delete(emailId);
                }
                this.updateControlsState();
            });
        });

        // Star toggles
        document.querySelectorAll('.email-item-star').forEach(star => {
            star.addEventListener('click', (e) => {
                e.stopPropagation();
                const emailId = e.currentTarget.dataset.emailId;
                this.toggleStar(emailId);
            });
        });
    }

    extractName(fromHeader) {
        if (!fromHeader) return 'Unknown';
        const match = fromHeader.match(/^(.+?)\s*<.+>$/);
        return match ? match[1].replace(/"/g, '') : fromHeader.split('@')[0];
    }

    formatDate(date) {
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        
        if (days === 0) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (days < 7) {
            return date.toLocaleDateString([], { weekday: 'short' });
        } else {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    }

    showLoading() {
        const emailList = document.getElementById('email-list');
        const loading = document.getElementById('email-loading');
        const empty = document.getElementById('email-empty');
        
        if (loading) loading.style.display = 'flex';
        if (empty) empty.style.display = 'none';
        if (emailList) emailList.style.display = 'block';
    }

    showEmptyState() {
        const emailList = document.getElementById('email-list');
        const loading = document.getElementById('email-loading');
        const empty = document.getElementById('email-empty');
        
        if (loading) loading.style.display = 'none';
        if (empty) empty.style.display = 'flex';
        if (emailList) emailList.innerHTML = '';
    }

    toggleSidebar() {
        const sidebar = document.getElementById('email-sidebar');
        this.sidebarCollapsed = !this.sidebarCollapsed;
        sidebar?.classList.toggle('collapsed', this.sidebarCollapsed);
    }

    switchFolder(folder) {
        document.querySelectorAll('.folder-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const folderItem = document.querySelector(`[data-folder="${folder}"]`);
        folderItem?.classList.add('active');
        
        this.currentFolder = folder;
        this.selectedEmails.clear();
        this.updateControlsState();
        this.loadEmails();
    }

    selectAllEmails(checked) {
        this.selectedEmails.clear();
        
        if (checked) {
            this.emails.forEach(email => this.selectedEmails.add(email.id));
        }
        
        document.querySelectorAll('.email-item-checkbox').forEach(checkbox => {
            checkbox.checked = checked;
        });
        
        this.updateControlsState();
    }

    updateControlsState() {
        const hasSelection = this.selectedEmails.size > 0;
        
        document.getElementById('archive-btn')?.toggleAttribute('disabled', !hasSelection);
        document.getElementById('delete-btn')?.toggleAttribute('disabled', !hasSelection);
        document.getElementById('mark-read-btn')?.toggleAttribute('disabled', !hasSelection);
    }

    updateFolderCounts() {
        // This would typically come from the API, but for now we'll use placeholder logic
        const counts = {
            inbox: this.emails.filter(e => e.labels.includes('INBOX')).length,
            starred: this.emails.filter(e => e.starred).length,
            important: this.emails.filter(e => e.important).length,
            sent: 0, // Would need separate API call
            drafts: 0, // Would need separate API call
            scheduled: 0,
            spam: 0,
            trash: 0
        };

        Object.entries(counts).forEach(([folder, count]) => {
            const countElement = document.getElementById(`${folder}-count`);
            if (countElement) countElement.textContent = count;
        });
    }

    async toggleStar(emailId) {
        // Implementation for starring/unstarring emails
        window.crm?.showToast('Star toggle - coming soon');
    }

    async archiveSelected() {
        window.crm?.showToast(`Archiving ${this.selectedEmails.size} email(s) - coming soon`);
    }

    async deleteSelected() {
        window.crm?.showToast(`Deleting ${this.selectedEmails.size} email(s) - coming soon`);
    }

    async markSelectedAsRead() {
        window.crm?.showToast(`Marking ${this.selectedEmails.size} email(s) as read - coming soon`);
    }

    composeEmail() {
        window.crm?.showToast('Compose Email - coming soon');
    }

    async refreshEmails() {
        await this.loadEmails();
        window.crm?.showToast('Emails refreshed');
    }

    searchEmails(query) {
        // Simple client-side search for now
        const filteredEmails = this.emails.filter(email => 
            email.subject.toLowerCase().includes(query.toLowerCase()) ||
            email.from.toLowerCase().includes(query.toLowerCase()) ||
            email.snippet.toLowerCase().includes(query.toLowerCase())
        );
        
        // Re-render with filtered results
        const originalEmails = this.emails;
        this.emails = filteredEmails;
        this.renderEmails();
        this.emails = originalEmails;
    }

    openEmail(emailId) {
        window.crm?.showToast(`Opening email ${emailId} - coming soon`);
    }
}

// Initialize email manager
let emailManager;

function initEmailsPage() {
    const emailsPage = document.getElementById('emails-page');
    if (!emailsPage) {
        console.log('EmailManager: emails-page not found');
        return;
    }

    console.log('EmailManager: Initializing email page...');
    emailManager = new EmailManager();
    
    // Ensure emailManager is available globally
    window.emailManager = emailManager;
}

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEmailsPage);
} else {
    initEmailsPage();
}

// Export for global access
window.emailManager = emailManager;
