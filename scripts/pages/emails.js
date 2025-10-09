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
        this.gapi = null; // legacy gapi auth2 (unused with GIS)
        this.tokenClient = null; // Google Identity Services token client
        this.accessToken = null; // OAuth access token
        
        // Google API configuration
        this.CLIENT_ID = '448802258090-re0u5rtja879t4tkej22rnedmo1jt3lp.apps.googleusercontent.com';
        this.API_KEY = 'AIzaSyDwrD5n-_1jNzw6Qsj2q8xFUWT3gaMs4Xk'; // Updated to match Google Cloud Console key used for Gmail
        this.DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest';
        this.SCOPES = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly';
        
        // Formatting state tracking
        this._currentFormatting = {
            color: null,
            backgroundColor: null,
            fontSize: null,
            bold: false,
            italic: false,
            underline: false
        };
        // Editor state
        this._isHtmlMode = false;
        // Compose autocomplete cache
        this._composePeopleById = new Map();
        
        this.init();
        this.setupEmailTrackingListeners();
        this.setupEventListeners();
    }

    // Setup event listeners for the emails page
    setupEventListeners() {
        // Compose button
        const composeBtn = document.getElementById('compose-email-btn');
        if (composeBtn) {
            composeBtn.addEventListener('click', () => {
                this.openComposeWindow();
            });
        }

        // Send button
        const sendBtn = document.getElementById('compose-send');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => {
                this.sendEmail();
            });
        }

        // Enter key handler for email composition
        this.setupComposeEnterKeyHandler();
    }

    // Setup enter key handler for email composition
    setupComposeEnterKeyHandler() {
        // Use event delegation to handle dynamically created compose windows
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const editor = document.querySelector('.body-input');
                if (editor && editor.contains(e.target)) {
                    console.log('[Enter] Enter key pressed in email editor');
                    e.preventDefault();
                    
                    // Check if cursor is at or near signature boundary
                    const selection = window.getSelection();
                    if (selection && selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        
                        // Find if we're near the signature
                        const isNearSignature = this.isCursorNearSignature(editor, range);
                        if (isNearSignature) {
                            // Don't allow editing into signature area
                            console.log('[Enter] Cursor near signature - preventing edit');
                            return;
                        }
                    }
                    
                    // Simple approach: just insert a line break
                    try {
                        document.execCommand('insertHTML', false, '<br>');
                        console.log('[Enter] Line break inserted via execCommand');
                    } catch (error) {
                        console.error('[Enter] execCommand failed:', error);
                        // Try alternative approach
                        try {
                            const br = document.createElement('br');
                            const range = selection.getRangeAt(0);
                            range.insertNode(br);
                            range.setStartAfter(br);
                            range.collapse(true);
                            selection.removeAllRanges();
                            selection.addRange(range);
                            console.log('[Enter] Line break inserted via DOM manipulation');
                        } catch (fallbackError) {
                            console.error('[Enter] DOM manipulation also failed:', fallbackError);
                        }
                    }
                }
            }
        });
    }

    // Update authentication UI
    updateAuthenticationUI() {
        const emailLoading = document.getElementById('email-loading');
        const emailEmpty = document.getElementById('email-empty');
        const emailList = document.getElementById('email-list');

        if (emailLoading) {
            // Always show loading state initially - emails will load from tracking system
            emailLoading.innerHTML = `
                <div class="loading-spinner"></div>
                <h3>Loading emails...</h3>
                <p>Fetching your emails from the tracking system.</p>
            `;
        }
    }

    // Load emails (both sent and received)
    async loadEmails() {
        console.log('[EmailManager] Loading emails from tracking system...');
        try {
            // Load emails from the tracking system (both sent and received)
            if (window.emailTrackingManager) {
                if (this.currentFolder === 'sent') {
                    const emails = await window.emailTrackingManager.getSentEmails();
                    this.renderEmails(emails);
                } else if (this.currentFolder === 'inbox') {
                    // For inbox, get all emails and filter for received ones
                    const allEmails = await window.emailTrackingManager.getAllEmails();
                    const receivedEmails = allEmails.filter(email => 
                        email.emailType === 'received' || email.provider === 'sendgrid_inbound'
                    );
                    this.renderEmails(receivedEmails);
                } else {
                    // For all emails, get conversation threads
                    const threads = await window.emailTrackingManager.getConversationThreads();
                    this.renderConversationThreads(threads);
                }
            } else {
                console.warn('[EmailManager] Email tracking manager not available');
                // Retry with backoff up to ~2s to allow initialization
                const start = Date.now();
                await new Promise((resolve) => {
                    const tick = () => {
                        if (window.emailTrackingManager) return resolve();
                        if (Date.now() - start > 2000) return resolve();
                        setTimeout(tick, 160);
                    };
                    tick();
                });
                if (window.emailTrackingManager) {
                    return this.loadEmails();
                }
                this.showEmptyState();
            }
        } catch (error) {
            console.error('[EmailManager] Error loading emails:', error);
            this.showEmptyState();
        }
    }

    // Refresh emails
    async refreshEmails() {
        console.log('[EmailManager] Refreshing emails...');
        this.loadEmails();
    }

    // Render conversation threads
    renderConversationThreads(threads) {
        const container = document.getElementById('email-list');
        const emailCount = document.getElementById('email-count');
        if (!container) return;

        if (threads.length === 0) {
            this.showEmptyState();
            return;
        }

        console.log('[EmailManager] Rendering conversation threads:', threads.length);

        if (emailCount) {
            emailCount.textContent = `${threads.length} email${threads.length !== 1 ? 's' : ''}`;
        }

        container.innerHTML = threads.map(thread => {
            const latestEmail = thread.emails[thread.emails.length - 1];
            const participants = thread.participants.join(', ');
            const lastActivity = this.formatDate(thread.lastActivity);
            
            return `
                <div class="email-item conversation-thread" data-thread-id="${thread.threadId}">
                    <div class="email-item-header">
                        <div class="email-item-participants">${participants}</div>
                        <div class="email-item-time">${lastActivity}</div>
                    </div>
                    <div class="email-item-subject">${latestEmail.subject || 'No Subject'}</div>
                    <div class="email-item-preview">${this.getEmailPreview(latestEmail)}</div>
                    <div class="email-item-meta">
                        <span class="email-count">${thread.emailCount} message${thread.emailCount !== 1 ? 's' : ''}</span>
                        <span class="email-type ${latestEmail.emailType}">${latestEmail.emailType}</span>
                    </div>
                </div>
            `;
        }).join('');

        // Add click handlers for conversation threads
        this.attachConversationEvents();
    }

    // Attach events to conversation threads
    attachConversationEvents() {
        const threads = document.querySelectorAll('.conversation-thread');
        threads.forEach(thread => {
            thread.addEventListener('click', () => {
                const threadId = thread.dataset.threadId;
                this.openConversationThread(threadId);
            });
        });
    }

    // Open conversation thread
    async openConversationThread(threadId) {
        try {
            const emails = await window.emailTrackingManager.getEmailsByThread(threadId);
            this.renderConversationEmails(emails);
        } catch (error) {
            console.error('[EmailManager] Error opening conversation thread:', error);
            window.crm?.showToast('Error loading conversation', 'error');
        }
    }

    // Render emails within a conversation thread
    renderConversationEmails(emails) {
        const container = document.getElementById('email-list');
        const emailCount = document.getElementById('email-count');
        if (!container) return;

        console.log('[EmailManager] Rendering conversation emails:', emails.length);

        if (emailCount) {
            emailCount.textContent = `${emails.length} email${emails.length !== 1 ? 's' : ''}`;
        }

        // Stack messages (oldest → newest), with a compact header and content preview
        container.innerHTML = emails.map(email => {
            const isReceived = email.emailType === 'received';
            const time = this.formatDate(email.timestamp);
            
            return `
                <div class="email-item conversation-email ${isReceived ? 'received' : 'sent'}" data-email-id="${email.id}">
                    <div class="email-item-header">
                        <div class="email-item-from">${isReceived ? email.from : 'You'}</div>
                        <div class="email-item-time">${time}</div>
                    </div>
                    <div class="email-item-subject">${email.subject || 'No Subject'}</div>
                    <div class="email-item-preview">${this.getEmailPreview(email)}</div>
                    <div class="email-item-meta">
                        <span class="email-type ${email.emailType}">${email.emailType}</span>
                        ${isReceived ? '<span class="new-badge">New</span>' : ''}
                    </div>
                </div>
            `;
        }).join('');

        // Add click handlers for individual emails
        this.attachEmailEvents();
    }

    // Get email preview text
    getEmailPreview(email) {
        const text = email.text || email.html || email.content || '';
        // Strip HTML tags and get first 100 characters
        const plainText = text.replace(/<[^>]*>/g, '').trim();
        return plainText.length > 100 ? plainText.substring(0, 100) + '...' : plainText;
    }

    // Open compose window
    openComposeWindow() {
        const composeWindow = document.getElementById('compose-window');
        if (composeWindow) {
            composeWindow.style.display = 'flex';
            composeWindow.classList.add('open');
            // Ensure it's positioned correctly
            composeWindow.style.position = 'fixed';
            composeWindow.style.bottom = '0';
            composeWindow.style.right = '20px';
            composeWindow.style.top = 'auto';
            composeWindow.style.left = 'auto';
        }
    }

    // Close compose window
    closeComposeWindow() {
        const composeWindow = document.getElementById('compose-window');
        if (composeWindow) {
            composeWindow.classList.remove('open');
            // Hide the window
            setTimeout(() => {
                composeWindow.style.display = 'none';
            }, 300); // Wait for animation to complete
        }
    }

    // Authenticate with Gmail
    async authenticateGmail() {
        try {
            console.log('[EmailManager] Starting Gmail authentication...');

            // Show loading state
            const emailLoading = document.getElementById('email-loading');
            if (emailLoading) {
                emailLoading.innerHTML = `
                    <div class="loading-spinner" style="display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 16px;">
                        <div style="width: 40px; height: 40px; border: 3px solid var(--border-light); border-top: 3px solid var(--orange-primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
                        <span>Connecting to Gmail...</span>
                    </div>
                `;
            }

            // Simulate authentication delay
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Mark as authenticated
            localStorage.setItem('gmail-authenticated', 'true');
            this.isAuthenticated = true;

            // Update UI
            this.updateAuthenticationUI();

            // Show success message
            if (window.crm && window.crm.showToast) {
                window.crm.showToast('Successfully connected to Gmail!', 'success');
            }

            console.log('[EmailManager] Gmail authentication successful');

        } catch (error) {
            console.error('[EmailManager] Gmail authentication failed:', error);

            // Show error state
            const emailLoading = document.getElementById('email-loading');
            if (emailLoading) {
                emailLoading.innerHTML = `
                    <div class="email-auth-error">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="15" y1="9" x2="9" y2="15"></line>
                            <line x1="9" y1="9" x2="15" y2="15"></line>
                        </svg>
                        <h3>Connection Failed</h3>
                        <p>Unable to connect to Gmail. Please try again.</p>
                        <button class="btn-primary" onclick="window.emailManager?.authenticateGmail()">Try Again</button>
                    </div>
                `;
            }

            if (window.crm && window.crm.showToast) {
                window.crm.showToast('Failed to connect to Gmail. Please try again.', 'error');
            }
        }
    }

    // Setup test button
    setupTestButton() {
        const testBtn = document.getElementById('test-email-tracking-btn');
        if (testBtn) {
            testBtn.addEventListener('click', () => {
                this.testEmailTracking();
            });
        }
    }

    // Test email tracking
    testEmailTracking() {
        if (window.crm && window.crm.showToast) {
            window.crm.showToast('Email tracking test initiated. Check console for details.', 'info');
        }
        console.log('[EmailManager] Email tracking test - this is a placeholder for testing email tracking functionality');
    }

    renderAIBar(aiBar) {
        if (!aiBar) return;
        
        // Check if already rendered to avoid re-rendering
        if (aiBar.dataset.rendered === 'true') {
            console.log('[AI] Bar already rendered, skipping re-render');
            return;
        }
        
        console.log('[AI] Rendering AI bar...');
        const suggestions = [
            { text: 'Warm intro after a call', prompt: 'Warm intro after a call' },
            { text: 'Follow-up with tailored value props', prompt: 'Follow-up with tailored value props' },
            { text: 'Schedule an Energy Health Check', prompt: 'Schedule an Energy Health Check' },
            { text: 'Proposal delivery with next steps', prompt: 'Proposal delivery with next steps' },
            { text: 'Cold email to a lead I could not reach by phone', prompt: 'Cold email to a lead I could not reach by phone' },
            { text: 'Standard Invoice Request', prompt: 'Standard Invoice Request' }
        ];
        aiBar.innerHTML = `
            <div class="ai-inner">
                <div class="ai-row">
                    <textarea class="ai-prompt input-dark" rows="3" placeholder="Describe the email you want... (tone, goal, offer, CTA)"></textarea>
                </div>
                <div class="ai-row suggestions" role="list">
                    ${suggestions.map(s => `<button class="ai-suggestion" type="button" data-prompt="${s.prompt}">${s.text}</button>`).join('')}
                </div>
                <div class="ai-row actions">
                    <button class="fmt-btn ai-generate" data-mode="standard">Generate Standard</button>
                    <button class="fmt-btn ai-generate" data-mode="html">Generate HTML</button>
                    <button class="fmt-btn ai-log-all" type="button" title="Log outputs for all suggestions">Log All (6)</button>
                    <div class="ai-status" aria-live="polite"></div>
                </div>
            </div>
        `;
        // Wire events
        console.log('[AI] Wiring suggestion button events...');
        const suggestionButtons = aiBar.querySelectorAll('.ai-suggestion');
        console.log('[AI] Found suggestion buttons:', suggestionButtons.length);
        
        suggestionButtons.forEach((btn, index) => {
            console.log(`[AI] Adding click listener to suggestion ${index}:`, btn.textContent);
            console.log('[AI] Button element:', btn);
            console.log('[AI] Button computed style:', window.getComputedStyle(btn));
            
            // Add both click and mousedown events as backup
            const handleSuggestionClick = (e) => {
                console.log('[AI] Suggestion click event triggered for:', btn.textContent);
                console.log('[AI] Event details:', {
                    type: e.type,
                    target: e.target,
                    currentTarget: e.currentTarget,
                    bubbles: e.bubbles,
                    cancelable: e.cancelable
                });
                
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                // Mark the event as handled by AI
                e.aiHandled = true;
                
                // Prevent variables toolbar from opening
                const variablesBar = document.querySelector('.variables-bar');
                if (variablesBar) {
                    variablesBar.classList.remove('open');
                    variablesBar.setAttribute('aria-hidden', 'true');
                }
                
                console.log('[AI] Suggestion clicked:', btn.textContent);
                const ta = aiBar.querySelector('.ai-prompt');
                if (ta) {
                    const prompt = btn.getAttribute('data-prompt') || btn.textContent;
                    ta.value = prompt;
                    ta.focus();
                    console.log('[AI] Updated textarea value:', ta.value);
                } else {
                    console.error('[AI] Could not find textarea');
                }
                return false;
            };
            
            btn.addEventListener('click', handleSuggestionClick, true); // Use capture phase
            btn.addEventListener('mousedown', handleSuggestionClick, true); // Use capture phase
        });

        // Safety net: delegated handler so any future dynamically-added suggestion works
        aiBar.addEventListener('click', (e) => {
            const btn = e.target.closest('.ai-suggestion');
            if (!btn) return;
            console.log('[AI] Delegated suggestion click for:', btn.textContent);
            const ta = aiBar.querySelector('.ai-prompt');
            if (ta) {
                const prompt = btn.getAttribute('data-prompt') || btn.textContent;
                ta.value = (prompt || '').trim();
                ta.focus();
                console.log('[AI] Delegated: textarea updated to:', ta.value);
            }
        });
        
        console.log('[AI] Wiring generate button events...');
        aiBar.querySelectorAll('.ai-generate').forEach((btn, index) => {
            console.log(`[AI] Adding click listener to generate button ${index}:`, btn.textContent);
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[AI] Generate button clicked:', btn.textContent);
                const mode = btn.getAttribute('data-mode') || 'standard';
                await this.generateWithAI(aiBar, mode);
            });
        });

        // Log All (6) button
        const logAllBtn = aiBar.querySelector('.ai-log-all');
        if (logAllBtn) {
            logAllBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                    logAllBtn.disabled = true;
                    logAllBtn.textContent = 'Logging...';
                    await this.logAllAIPrompts(aiBar);
                } catch (err) {
                    console.error('[AI] Log All failed', err);
                } finally {
                    logAllBtn.disabled = false;
                    logAllBtn.textContent = 'Log All (6)';
                }
            });
        }
        
        // Ensure textarea is editable
        const textarea = aiBar.querySelector('.ai-prompt');
        if (textarea) {
            console.log('[AI] Textarea found, ensuring it\'s editable');
            // Remove contenteditable as it conflicts with textarea
            textarea.removeAttribute('contenteditable');
            textarea.removeAttribute('readonly');
            textarea.removeAttribute('disabled');
            
            // Add click debugging and prevent variable toolbar interference
            textarea.addEventListener('click', (e) => {
                console.log('[AI] Textarea clicked at position:', e.offsetX, e.offsetY);
                console.log('[AI] Textarea click event:', e);
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                // Prevent variables toolbar from opening
                const variablesBar = document.querySelector('.variables-bar');
                if (variablesBar) {
                    variablesBar.classList.remove('open');
                    variablesBar.setAttribute('aria-hidden', 'true');
                }
            }, true);
            
            textarea.addEventListener('mousedown', (e) => {
                console.log('[AI] Textarea mousedown at position:', e.offsetX, e.offsetY);
                e.stopPropagation();
                e.stopImmediatePropagation();
            }, true);
            
            textarea.addEventListener('focus', (e) => {
                console.log('[AI] Textarea focused');
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                // Prevent variables toolbar from opening
                const variablesBar = document.querySelector('.variables-bar');
                if (variablesBar) {
                    variablesBar.classList.remove('open');
                    variablesBar.setAttribute('aria-hidden', 'true');
                }
            }, true);
        } else {
            console.error('[AI] Could not find textarea');
        }
        
        // Mark as rendered
        aiBar.dataset.rendered = 'true';
        console.log('[AI] AI bar rendering complete');
        
        // Add global mouse debugging for AI bar
        const debugMouseEvents = (e) => {
            const aiBar = document.querySelector('.ai-bar');
            if (aiBar && aiBar.contains(e.target)) {
                console.log('[AI] Mouse event on AI bar:', {
                    type: e.type,
                    target: e.target,
                    targetClass: e.target.className,
                    targetTag: e.target.tagName,
                    offsetX: e.offsetX,
                    offsetY: e.offsetY,
                    clientX: e.clientX,
                    clientY: e.clientY
                });
            }
        };
        
        // Add mouse event listeners for debugging
        document.addEventListener('mousedown', debugMouseEvents, true);
        document.addEventListener('click', debugMouseEvents, true);
        
        // Prevent AI bar interactions from bubbling into handlers that open other toolbars,
        // but DO allow clicks on AI suggestions, prompt, and generate buttons to proceed.
        const preventVariablesOnAI = (e) => {
            const aiBar = document.querySelector('.ai-bar');
            if (aiBar && aiBar.contains(e.target)) {
                const allowed = e.target.closest('.ai-suggestion, .ai-generate, .ai-prompt');
                if (allowed) {
                    // Let AI controls handle the event normally
                    return;
                }
                console.log('[AI] Preventing variables toolbar trigger from AI bar (non-AI control)');
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                // Ensure variables toolbar stays closed
                const variablesBar = document.querySelector('.variables-bar');
                if (variablesBar) {
                    variablesBar.classList.remove('open');
                    variablesBar.setAttribute('aria-hidden', 'true');
                }
            }
        };
        
        // Add event listeners to prevent variables toolbar from opening
        document.addEventListener('click', preventVariablesOnAI, true);
        document.addEventListener('mousedown', preventVariablesOnAI, true);
        document.addEventListener('focus', preventVariablesOnAI, true);
    }

    async generateWithAI(aiBar, mode = 'standard') {
        const compose = document.getElementById('compose-window');
        const editor = compose?.querySelector('.body-input');
        const status = aiBar?.querySelector('.ai-status');
        const prompt = aiBar?.querySelector('.ai-prompt')?.value?.trim() || '';
        const toInput = compose?.querySelector('#compose-to');
        const subjectInput = compose?.querySelector('#compose-subject');
        let recipient = this._selectedRecipient || null;
        if (!editor) return;

        // Close AI bar immediately
        if (aiBar) {
            aiBar.classList.remove('open');
            aiBar.setAttribute('aria-hidden', 'true');
        }

        // Start generating animation on editor + subject
        this.startGeneratingAnimation(compose);
        if (status) status.textContent = 'Generating...';
        try {
            const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
            const genUrl = `${base}/api/perplexity-email`;
            
            console.log('[AI] Calling Perplexity Sonar...');

            // Resolve recipient by email if not selected or missing core fields
            try {
                const toVal = toInput?.value || '';
                if ((!recipient || !recipient.name || !recipient.company) && toVal) {
                    const resolved = await this.lookupPersonByEmail(toVal);
                    if (resolved) recipient = resolved;
                }
            } catch (_) { /* noop */ }

            // Enrich recipient with account energy details when available (ensures Gemini sees known values)
            let enrichedRecipient = recipient ? JSON.parse(JSON.stringify(recipient)) : null;
            try {
                if (enrichedRecipient && (enrichedRecipient.company || enrichedRecipient.email)) {
                    const accounts = (typeof window.getAccountsData === 'function') ? (window.getAccountsData() || []) : [];
                    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\b(llc|inc|inc\.|co|co\.|corp|corp\.|ltd|ltd\.)\b/g,' ').replace(/\s+/g,' ').trim();
                    const comp = norm(enrichedRecipient.company || '');
                    const domain = (enrichedRecipient.email || '').split('@')[1]?.toLowerCase() || '';
                    let acct = null;
                    if (comp) {
                        acct = accounts.find(a => {
                            const an = norm(a.accountName || a.name || a.companyName || '');
                            return an === comp || an.includes(comp) || comp.includes(an);
                        }) || null;
                    }
                    if (!acct && domain) {
                        acct = accounts.find(a => {
                            const d = String(a.domain || a.website || '').toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
                            return d && domain.endsWith(d);
                        }) || null;
                    }
                    if (acct) {
                        const acctEnergy = {
                            supplier: acct.electricitySupplier || '',
                            currentRate: acct.currentRate || '',
                            usage: acct.annualUsage || '',
                            contractEnd: acct.contractEndDate || ''
                        };
                        enrichedRecipient.account = enrichedRecipient.account || {
                            id: acct.id,
                            name: acct.accountName || acct.name || acct.companyName || '',
                            industry: acct.industry || '',
                            domain: acct.domain || acct.website || '',
                            city: acct.city || acct.billingCity || acct.locationCity || '',
                            state: acct.state || acct.billingState || acct.region || ''
                        };
                        let rate = String(acctEnergy.currentRate || '').trim();
                        if (/^\.\d+$/.test(rate)) rate = '0' + rate;
                        enrichedRecipient.energy = { ...acctEnergy, currentRate: rate };
                    }
                }
            } catch (e) { console.warn('[AI] Could not enrich recipient energy from accounts', e); }

            // Pull recent call transcript for this recipient if available
            try {
                const recentCall = (typeof window.getRecentCallForEmail === 'function') ? (window.getRecentCallForEmail(enrichedRecipient) || null) : null;
                if (recentCall && recentCall.transcript) {
                    enrichedRecipient.transcript = String(recentCall.transcript || '').slice(0, 2000);
                }
            } catch(_) { /* noop */ }

            // Validate context data before generation
            const contextValidation = this.validateContextData(enrichedRecipient, prompt);
            if (!contextValidation.isValid) {
                console.warn('[AI] Context validation failed:', contextValidation.issues);
                // Continue with generation but log the issues
            }

            // Detect if this is a manual prompt for more freedom
            const isManual = this.isManualPrompt(prompt);
            console.log(`[AI] Prompt type: ${isManual ? 'Manual' : 'AI-generated'}`);

            // Add style randomization hints for variation
            const styleOptions = ['hook_question','value_bullets','proof_point','risk_focus','timeline_focus'];
            const randomStyle = styleOptions[Math.floor(Math.random() * styleOptions.length)];
            const subjStyles = ['question','curiosity','metric','time_sensitive','pain_point','proof_point'];
            const randomSubj = subjStyles[Math.floor(Math.random() * subjStyles.length)];
            const subjectSeed = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

            // Get sender name and email from settings
            const settings = (window.SettingsPage?.getSettings?.()) || {};
            const senderName = settings?.general?.agentName || 'Lewis Patterson';
            const fromEmail = settings?.emailDeliverability?.fromEmail || 'l.patterson@powerchoosers.com';
            
            const payload = { 
                prompt, 
                mode, 
                recipient: enrichedRecipient, 
                to: toInput?.value || '', 
                style: randomStyle, 
                subjectStyle: randomSubj, 
                subjectSeed,
                isManualPrompt: isManual,
                contextCompleteness: contextValidation.completeness,
                senderName: senderName,
                fromEmail: fromEmail
            };
            let res;
            try {
                res = await fetch(genUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } catch (netErr) {
                console.warn('[AI] Primary endpoint failed, trying Vercel fallback', netErr);
                const prodUrl = 'https://power-choosers-crm.vercel.app/api/perplexity-email';
                res = await fetch(prodUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }
            let data = null;
            try { data = await res.json(); } catch (_) { data = null; }
            if (!res.ok) {
                // Retry once directly against Vercel if not already
                const prodUrl = 'https://power-choosers-crm.vercel.app/api/perplexity-email';
                if (!genUrl.startsWith(prodUrl)) {
                    const res2 = await fetch(prodUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    let data2 = null; try { data2 = await res2.json(); } catch (_) {}
                    if (!res2.ok) {
                        const msg2 = (data2 && (data2.error || data2.message)) || `HTTP ${res2.status}`;
                        console.error('[AI] Production generation failed', { status: res2.status, data: data2 });
                        if (status) status.textContent = `Generation failed: ${msg2}`;
                        return;
                    }
                    const output2 = data2?.output || '';
                    let { subject: subject2, html: html2 } = this.formatGeneratedEmail(output2, enrichedRecipient, mode);
                    // Warm intro adjustment
                    if ((prompt || '').toLowerCase().includes('warm intro')) {
                        html2 = this.adjustWarmIntroHtml(html2);
                    }
                    // Replace variables with actual values before inserting
                    html2 = this.replaceVariablesInHtml(html2, enrichedRecipient);
                    if (subjectInput) {
                        subjectInput.classList.remove('fade-in');
                        try {
                            const improved2 = this.improveSubject(subject2, enrichedRecipient);
                            subjectInput.value = improved2 || subject2 || '';
                        } catch (_) {
                            subjectInput.value = subject2 || '';
                        }
                        requestAnimationFrame(() => subjectInput.classList.add('fade-in'));
                    }
                    if (mode === 'html') {
                        // Render the generated HTML (not raw source)
                        if (this._isHtmlMode) this.toggleHtmlMode(compose);
                        editor.innerHTML = html2;
                        // Post-insert sanitation and signature handling
                        this.sanitizeGeneratedEditor(editor, enrichedRecipient);
                        this.moveSignatureToEnd(editor);
                        if (status) status.textContent = 'Inserted HTML into editor (prod).';
                    } else {
                        if (this._isHtmlMode) this.toggleHtmlMode(compose);
                        
                        // Preserve signature when inserting AI content (production fallback) using DOM parser
                        const currentContent = editor.innerHTML;
                        const signature = this.extractSignature(currentContent);
                        
                        // Remove any existing signature from AI content using DOM parser
                        let cleanHtml2 = html2;
                        const aiSig2 = this.extractSignature(html2);
                        if (aiSig2) {
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(html2, 'text/html');
                            const sigDiv = doc.querySelector('[data-signature="true"]') || 
                                          Array.from(doc.querySelectorAll('div')).find(div => 
                                            div.style.marginTop === '20px' && 
                                            div.style.paddingTop === '20px'
                                          );
                            if (sigDiv) {
                                sigDiv.remove();
                                cleanHtml2 = doc.body.innerHTML;
                            }
                        }
                        
                        // Place signature after the AI content's closing
                        let finalContent2 = cleanHtml2;
                        if (signature) {
                            // Always place signature at the very end, after any existing content
                            // sanitizeGeneratedEditor already adds "Best regards," with spacing
                            finalContent2 = cleanHtml2 + signature;
                        }
                        
                        editor.innerHTML = finalContent2;
                        this.sanitizeGeneratedEditor(editor, enrichedRecipient);
                        // Ensure signature is positioned after the standardized closing
                        this.moveSignatureToEnd(editor);
                        if (status) status.textContent = 'Draft inserted (prod).';
                    }
                    editor.classList.remove('fade-in');
                    requestAnimationFrame(() => editor.classList.add('fade-in'));
                    return;
                }
                const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
                console.error('[AI] Generation failed', { status: res.status, data });
                if (status) status.textContent = `Generation failed: ${msg}`;
                return;
            }
            const output = data?.output || '';
            const templateType = data?.templateType || null;
            
            // Store citations if available (for future enhancement)
            if (data?.citations && data.citations.length > 0) {
                console.log('[AI] Web sources used:', data.citations.slice(0, 5));
                // Future: Display citations in UI to show research sources
            }
            
            try {
                console.debug('[AI][generate] mode:', mode, 'templateType:', templateType, 'recipient.firstName:', recipient?.firstName, 'company:', recipient?.company);
                console.debug('[AI][generate] raw output (first 600 chars):', JSON.stringify(output).slice(0, 600));
            } catch (_) {}

            // Build clean subject + body layout
            let { subject, html } = templateType 
                ? this.formatTemplatedEmail(output, enrichedRecipient, templateType, payload.fromEmail)
                : this.formatGeneratedEmail(output, enrichedRecipient, mode);
            try {
                console.debug('[AI][generate] formatted subject:', subject);
            } catch (_) {}

            // Subject
            if (subjectInput) {
                subjectInput.classList.remove('fade-in'); subjectInput.classList.add('is-loading');
                try {
                    const improved = this.improveSubject(subject, enrichedRecipient);
                    subjectInput.value = improved || subject || '';
                } catch (_) {
                    subjectInput.value = subject || '';
                }
                // Trigger fade-in
                requestAnimationFrame(() => { subjectInput.classList.add('fade-in'); subjectInput.classList.remove('is-loading'); });
            }

            // Body
            if (mode === 'html') {
                // Respect settings: allow branded HTML only if enabled
                try {
                    const s = (window.SettingsPage && window.SettingsPage.getSettings) ? window.SettingsPage.getSettings() : (JSON.parse(localStorage.getItem('crm-settings')||'{}'));
                    const allowHtml = s?.emailDeliverability?.useBrandedHtmlTemplate === true;
                    if (!allowHtml) {
                        // Fall back to standard mode insertion
                        mode = 'standard';
                    }
                } catch(_) {}
            if (mode === 'html') {
                // Ensure we're in rendered mode (not raw HTML code view)
                if (this._isHtmlMode) this.toggleHtmlMode(compose);
                }
                // Warm intro adjustment
                if ((prompt || '').toLowerCase().includes('warm intro')) {
                    html = this.adjustWarmIntroHtml(html);
                }
                // Replace variables with actual values before inserting
                html = this.replaceVariablesInHtml(html, enrichedRecipient);
                if (mode === 'html') {
                editor.innerHTML = html; // render HTML in editor
                // Post-insert sanitation and signature handling
                this.sanitizeGeneratedEditor(editor, enrichedRecipient);
                this.moveSignatureToEnd(editor);
                if (status) status.textContent = 'Inserted HTML into editor.';
                }
            } else {
                // Insert styled HTML into rich editor
                if (this._isHtmlMode) this.toggleHtmlMode(compose);
                // Warm intro adjustment
                if ((prompt || '').toLowerCase().includes('warm intro')) {
                    html = this.adjustWarmIntroHtml(html);
                }
                // Replace variables with actual values before inserting
                html = this.replaceVariablesInHtml(html, enrichedRecipient);
                
                // Preserve signature when inserting AI content using DOM parser
                const currentContent = editor.innerHTML;
                const signature = this.extractSignature(currentContent);
                
                // Remove any existing signature from AI content using DOM parser
                let cleanHtml = html;
                const aiSig = this.extractSignature(html);
                if (aiSig) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');
                    const sigDiv = doc.querySelector('[data-signature="true"]') || 
                                  Array.from(doc.querySelectorAll('div')).find(div => 
                                    div.style.marginTop === '20px' && 
                                    div.style.paddingTop === '20px'
                                  );
                    if (sigDiv) {
                        sigDiv.remove();
                        cleanHtml = doc.body.innerHTML;
                    }
                }
                
                // Place signature after the AI content's closing
                let finalContent = cleanHtml;
                if (signature) {
                    // Always place signature at the very end, after any existing content
                    // sanitizeGeneratedEditor already adds "Best regards," with spacing
                    finalContent = cleanHtml + signature;
                }
                
                editor.innerHTML = finalContent;
                
                // Extra safety: sanitize DOM for duplicate greetings/closings
                this.sanitizeGeneratedEditor(editor, enrichedRecipient);
                // Ensure signature is positioned after the standardized closing
                this.moveSignatureToEnd(editor);
                if (status) status.textContent = 'Draft inserted.';
            }

            // Fade-in effect for body
            editor.classList.remove('fade-in');
            requestAnimationFrame(() => editor.classList.add('fade-in'));
        } catch (e) {
            console.error('AI generation failed', e);
            if (status) status.textContent = `Generation failed: ${e?.message || e}`;
        } finally {
            // Stop the loading shimmer
            this.stopGeneratingAnimation(compose);
        }
    }

    // Format templated email from JSON response with preset HTML template
    formatTemplatedEmail(jsonData, recipient, templateType, fromEmail) {
        try {
            console.log('[AI] Formatting templated email, type:', templateType);
            
            // Extract data from JSON response
            const subject = jsonData.subject || 'Energy Solutions';
            const greeting = jsonData.greeting || 'Hello,';
            
            // Build template HTML using the appropriate builder
            const templateHtml = this.buildTemplateHtml(templateType, jsonData, recipient, fromEmail);
            
            // Wrap with branding (header + footer) and add greeting at top
            const fullHtml = this.wrapSonarHtmlWithBranding(
                `<p style="color:#1f2937; font-size:15px; line-height:1.6; margin:0 0 20px 0;">${this.escapeHtml(greeting)}</p>\n${templateHtml}`,
                recipient,
                subject
            );
            
            console.log('[AI] Template email built successfully');
            
            return {
                subject: subject,
                html: fullHtml
            };
        } catch (error) {
            console.error('[AI] Error formatting templated email:', error);
            // Fallback to basic formatting
            return {
                subject: 'Energy Solutions',
                html: '<p>Error generating email. Please try again.</p>'
            };
        }
    }

    // Convert model output into a clean subject + body with greeting, paragraphs, and closing
    formatGeneratedEmail(output, recipient, mode = 'standard') {
        const raw = String(output || '').trim();
        let subject = '';
        let body = raw;

        // If the model returned HTML, convert to plain text before analysis
        const looksLikeHtml = /<\w+[^>]*>/.test(raw);
        const toPlain = (html) => {
            if (!html) return '';
            return String(html)
                .replace(/<\s*br\s*\/?\s*>/gi, '\n')
                .replace(/<\s*\/p\s*>/gi, '\n\n')
                .replace(/<\s*\/div\s*>/gi, '\n\n')
                .replace(/<\s*\/li\s*>/gi, '\n')
                .replace(/<\s*(p|div|li|ul|ol|h[1-6])\b[^>]*>/gi, '')
                .replace(/<[^>]+>/g, '')
                .replace(/&nbsp;/gi, ' ')
                .replace(/&amp;/gi, '&')
                .replace(/&lt;/gi, '<')
                .replace(/&gt;/gi, '>')
                .replace(/&#39;/g, "'")
                .replace(/&quot;/g, '"');
        };

        // Extract explicit Subject: line if present
        const subjMatch = raw.match(/^\s*Subject\s*:\s*(.+)$/im);
        if (subjMatch) {
            subject = (subjMatch[1] || '').trim();
            body = raw.replace(subjMatch[0], '').trim();
        } else {
            // Fallback: use first non-empty line as subject (<= 120 chars) if it looks like a title
            const firstLine = (raw.split(/\r?\n/).find(l => l.trim().length) || '').trim();
            if (firstLine && firstLine.length <= 120) {
                subject = firstLine.replace(/^[ -•\s]+/, '');
                const idx = raw.indexOf(firstLine);
                body = idx >= 0 ? raw.slice(idx + firstLine.length).trim() : raw;
            }
        }

        // Redact exact day in subject to "Month YYYY"
        try {
            const datePattern = /\b(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4}|[A-Za-z]+\s+\d{1,2},\s*\d{4})\b/g;
            subject = subject.replace(datePattern, (m) => toMonthYear(m));
        } catch (_) { /* noop */ }

        // Normalize newlines and strip HTML to plain text if needed
        body = (looksLikeHtml ? toPlain(body) : body).replace(/\r\n/g, '\n');

        // Prepare greeting (no template tokens fallback)
        const nameSource = (recipient?.fullName || recipient?.name || '').trim();
        const firstName = (nameSource.split(' ')[0] || '').trim();
        const companyName = (recipient?.company || recipient?.account?.name || '').trim();
        const greeting = firstName ? `Hi ${firstName},` : (companyName ? `Hi ${companyName} team,` : 'Hi,');

        // Remove greeting lines anywhere and cut from the first closing onward
        const lines = body.split('\n');
        const greetAnyRegex = /^\s*(hi|hello|hey)\b.*?[,!-]?\s*$/i;
        const closingTerms = [
            'best regards','regards','kind regards','warm regards','sincerely','thanks','thank you','cheers'
        ];
        const isClosingLine = (text) => {
            const t = String(text || '').toLowerCase().replace(/\s+/g,' ').trim();
            // strip trailing punctuation
            const t2 = t.replace(/[.,!;:]+$/,'');
            return closingTerms.some(term => t2.startsWith(term));
        };
        const placeholderRegex = /\[\s*(your\s+name|your\s+title|your\s+contact\s*information)\s*\]/i;

        const kept = [];
        let cut = false;
        for (const ln of lines) {
            if (cut) break;
            const t = ln.trim();
            if (!t) { kept.push(''); continue; }
            if (isClosingLine(t) || placeholderRegex.test(t)) { cut = true; continue; }
            if (greetAnyRegex.test(t)) { continue; } // drop all greetings from model
            // Also drop a greeting directly addressing firstName (case-insensitive)
            const nameEsc = firstName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const greetNameRegex = new RegExp(`^\\s*(hi|hello|hey)\\s+${nameEsc}\\s*[,!-]?\\s*$`, 'i');
            if (greetNameRegex.test(t)) { continue; }
            kept.push(ln);
        }
        // Trim leading/trailing empties and compress multiple blanks
        while (kept.length && !kept[0].trim()) kept.shift();
        while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
        const compact = [];
        let lastBlank = false;
        for (const ln of kept) {
            const blank = !ln.trim();
            if (blank && lastBlank) continue;
            compact.push(ln);
            lastBlank = blank;
        }

        // Rebuild body and normalize paragraphs: ensure blank line between paragraphs
        body = compact.join('\n').trim();
        // Convert single newlines inside paragraphs to spaces if they are likely wrapped lines
        // but keep double newlines as paragraph breaks
        body = body
            .split(/\n{2,}/)
            .map(p => {
                // Preserve bullet lists within a paragraph (lines starting with - or •)
                if (/^(\s*[•\-]\s+)/m.test(p)) {
                    return String(p).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
                }
                return p.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
            })
            .filter(Boolean)
            .join('\n\n');

        // Redact exact day from any dates in the body: convert to "Month YYYY"
        try {
            const datePattern = /\b(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4}|[A-Za-z]+\s+\d{1,2},\s*\d{4})\b/g;
            body = body.replace(datePattern, (m) => toMonthYear(m));
        } catch (_) { /* noop */ }

        // Build HTML paragraphs from body
        let paras = body.split(/\n\n/).map(p => p.trim()).filter(Boolean);

        // Remove duplicate name at start of first content paragraph (fixes "Hi Patrick, Patrick, I hope..." bug)
        if (paras.length > 0 && firstName) {
            const firstPara = paras[0];
            const namePattern = new RegExp(`^${firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},?\\s+`, 'i');
            if (namePattern.test(firstPara)) {
                paras[0] = firstPara.replace(namePattern, '');
            }
        }

        // Force-insert a standardized Energy line and (optional) pain point right after the greeting
        try {
            const e = recipient?.energy || {};
            const supplier = String(e.supplier || '').trim();
            const rate = String(e.currentRate || '').trim();
            const end = String(e.contractEnd || '').trim();
            const endLabel = toMonthYear(end);
            const aiPP = recipient?.aiInsights && Array.isArray(recipient.aiInsights.painPoints) ? recipient.aiInsights.painPoints[0] : '';
            const notesPP = String(recipient?.notes || recipient?.account?.notes || '').match(/pain\s*point\s*:\s*([^\n]+)/i)?.[1] || '';
            const painPoint = String(aiPP || notesPP || '').trim();
            const parts = [];
            if (supplier) parts.push(`Supplier ${supplier}`);
            if (rate) parts.push(`Current rate ${rate.startsWith('$') ? rate : `$${rate}`}/kWh`);
            if (endLabel) parts.push(`Contract end ${endLabel}`);
            const energyLine = parts.length ? `Per your account: ${parts.join(' | ')}.` : '';
            const painLine = painPoint ? `Noted focus: ${painPoint}.` : '';
            if (energyLine || painLine) {
                // Place these as the first content paragraph
                paras.unshift([energyLine, painLine].filter(Boolean).join(' '));
            }
        } catch (_) { /* noop */ }

        // Expand inline bullet text into proper bullet lines for Invoice Requests
        try {
            const looksInvoice = /standard\s*invoice\s*request|invoice\s+request|\binvoice\b/i.test(body);
            const expandInlineBullets = (p) => {
                // If paragraph contains bullet separators inline (e.g., "We use your invoice to: • A • B • C")
                // convert to header + newline-delimited bullet lines starting with "• ".
                if (!/•/.test(p)) return p;
                // If it already has line-start bullets, leave as-is
                if (/^(\s*[•\-]\s+)/m.test(p)) return p;
                const parts = p.split('•').map(s => s.trim()).filter(Boolean);
                if (parts.length <= 1) return p;
                const header = parts[0].endsWith(':') ? parts[0] : (parts[0] + ':');
                const bullets = parts.slice(1).map(item => '• ' + item.replace(/^[-•]\s+/, ''));
                return [header, ...bullets].join('\n');
            };
            if (looksInvoice) {
                paras = paras.map(expandInlineBullets);
                // Deduplicate repeated header line "We use your invoice to:" if it appears multiple times
                const headerRegex = /^\s*we\s+use\s+your\s+invoice\s+to\s*:\s*$/i;
                const newParas = [];
                let headerSeen = false;
                for (const p of paras) {
                    if (headerRegex.test(p)) {
                        if (headerSeen) continue;
                        headerSeen = true;
                    }
                    newParas.push(p);
                }
                paras = newParas;
            }
        } catch (_) { /* noop */ }

        // Enforce brevity: 2 short paragraphs (1–2 sentences each) + single-line CTA
        try {
            const splitSentences = (txt) => String(txt || '')
                .split(/(?<=[.!?])\s+/)
                .map(s => s.trim())
                .filter(Boolean);

            // Helpers for CTA detection and normalization
            const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim().replace(/[\s.,;:]+$/,'').toLowerCase();
            const isColleagueLine = (s) => /recently\s+spoke\s+with/i.test(s) || /colleague/i.test(s);
            const ctaMatchers = /(call|chat|schedule|meet|demo|health\s*check|time|tomorrow|next\s+week|15\s*min|10\s*min|10-?minute|15-?minute)/i; // intentionally excludes "connect" and overly broad terms like "available"
            const timeSignals = /(mon|tue|wed|thu|fri|monday|tuesday|wednesday|thursday|friday|\b\d{1,2}\s*(am|pm)\b|\b\d{1,2}\s*[–-]\s*\d{1,2}\b)/i;
            const isExplanationSentence = (s) => /energy\s*health\s*check/i.test(s) && /(\bis\b|provides|helps|why|matters)/i.test(s);

            const allSentences = splitSentences(body);
            console.debug('[AI][format] sentences (pre-CTA-scan):', allSentences);

            // Strengthened CTA detection - must be actionable question with time or action words
            const isRealCTA = (text) => {
                const hasQuestion = text.trim().endsWith('?');
                const hasActionWords = /\b(would you|can you|could you|are you|does|available|work for you|schedule|call|meet|discuss|interested|open to)\b/i.test(text);
                const hasTimeReference = /\b(today|tomorrow|this week|next week|tue|wed|thu|fri|monday|tuesday|wednesday|thursday|friday|\d{1,2}\s*(am|pm)|eod|end of day)\b/i.test(text);
                
                // Real CTA must have question mark AND (action words OR time reference)
                return hasQuestion && (hasActionWords || hasTimeReference);
            };
            
            // Detect CTA from original body (prefer scheduling/time or explicit CTA keywords; exclude explanation-like questions)
            let detectedCTA = null;
            for (const s of allSentences) {
                if (isRealCTA(s) && !isColleagueLine(s) && !isExplanationSentence(s)) {
                    detectedCTA = s; 
                    break;
                }
            }

            // While trimming paragraphs, remove the CTA sentence if it appears inside to avoid duplication later
            const trimmedParas = [];
            const isBulletPara = (txt) => /^(\s*[•\-]\s+)/m.test(String(txt || ''));

            for (const p of paras) {
                let sentences = splitSentences(p);
                // Keep bullet paragraphs intact (no sentence trimming and no CTA removal inside)
                if (isBulletPara(p)) {
                    trimmedParas.push(p);
                    if (trimmedParas.length === 2) break;
                    continue;
                }
                if (detectedCTA) {
                    const target = normalize(detectedCTA);
                    sentences = sentences.filter(s => normalize(s) !== target);
                }
                sentences = sentences.slice(0, 2);
                if (!sentences.length) continue;
                trimmedParas.push(sentences.join(' '));
                if (trimmedParas.length === 2) break;
            }
            paras = trimmedParas.length ? trimmedParas : paras.slice(0, 2);
            console.debug('[AI][format] paras after trim/no-dup-CTA:', paras);

            // Move "following up" or call reference to beginning (fixes out-of-order content)
            const followUpIdx = paras.findIndex(p => 
                /following up|as we discussed|per our (call|conversation)|it was (great|a pleasure) speaking/i.test(p)
            );
            if (followUpIdx > 0) {
                const followUpPara = paras.splice(followUpIdx, 1)[0];
                paras.unshift(followUpPara);
                console.debug('[AI][format] Reordered "following up" paragraph to beginning');
            }

            // For Energy Health Check, ensure ordering: explanation first, coverage second
            try {
                const looksEHC = /energy\s*health\s*check/i.test(body);
                if (looksEHC && paras.length >= 1) {
                    const isExplanationPara = (p) => /energy\s*health\s*check/i.test(p) && /(\bis\b|provides|helps|why|matters)/i.test(p);
                    const isCoveragePara = (p) => /(bill|supplier|rate|contract\s*end|usage|health\s*score|bbb|recommend)/i.test(p);
                    if (paras.length >= 2) {
                        const p1 = paras[0] || '';
                        const p2 = paras[1] || '';
                        if (isCoveragePara(p1) && isExplanationPara(p2)) {
                            [paras[0], paras[1]] = [paras[1], paras[0]];
                            console.debug('[AI][format][EHC] Reordered paragraphs to put explanation first');
                        }
                    }
                }
            } catch (_) { /* noop */ }

            // For Standard Invoice Request, ensure ordering: reminder first, bullet list second
            try {
                const looksInvoice = /standard\s*invoice\s*request|invoice\s+request|invoice\b/i.test(body);
                if (looksInvoice && paras.length) {
                    const isBulletPara = (txt) => /^(\s*[•\-]\s+)/m.test(String(txt || ''));
                    const bulletIdx = paras.findIndex(p => isBulletPara(p));
                    if (bulletIdx !== -1) {
                        // Ensure bullet paragraph is at index 1 (second paragraph)
                        if (bulletIdx !== 1 && paras.length >= 2) {
                            const bullet = paras.splice(bulletIdx, 1)[0];
                            // If first paragraph is also bullet, try to find a non-bullet explanation to place first
                            if (paras[0] && isBulletPara(paras[0])) {
                                const explIdx = paras.findIndex(p => !isBulletPara(p));
                                if (explIdx > -1) {
                                    const expl = paras.splice(explIdx, 1)[0];
                                    paras.unshift(expl);
                                }
                            }
                            paras.splice(1, 0, bullet);
                            // Keep only the first two content paragraphs (explanation + bullets)
                            paras = paras.slice(0, 2);
                            console.debug('[AI][format][INVOICE] Reordered to ensure bullets as second paragraph');
                        } else if (bulletIdx === 0 && paras.length >= 2) {
                            // If bullets are first, try swapping with next non-bullet
                            if (!isBulletPara(paras[1])) {
                                [paras[0], paras[1]] = [paras[1], paras[0]];
                                console.debug('[AI][format][INVOICE] Swapped to ensure reminder first, bullets second');
                            }
                            paras = paras.slice(0, 2);
                        } else {
                            // Ensure we don't exceed two content paragraphs
                            paras = paras.slice(0, 2);
                        }
                    }
                }
            } catch (_) { /* noop */ }

            // Choose final CTA text
            const looksEHC2 = /energy\s*health\s*check/i.test(body);
            const looksInvoice2 = /standard\s*invoice\s*request|invoice\s+request|invoice\b/i.test(body);
            let cta = detectedCTA
                || (looksEHC2 ? 'Does Tuesday 10am-12pm or Thursday 2-4pm work for a brief review?'
                : looksInvoice2 ? 'Could you send a copy of your latest invoice today by EOD so my team can get started right away?'
                : 'Does Tuesday 2-3pm or Thursday 10-11am work for a 15-minute call?');
            // Keep CTA very short
            const ctaWords = cta.split(/\s+/).filter(Boolean);
            if (ctaWords.length > 16) cta = ctaWords.slice(0, 16).join(' ').replace(/[,;:]$/, '') + (cta.endsWith('?') ? '' : '?');
            console.debug('[AI][format] chosen CTA:', cta);

            // Global word cap (~130). If exceeded, drop last sentences first, then shorten CTA
            const countWords = (txt) => String(txt || '').trim().split(/\s+/).filter(Boolean).length;
            const totalWords = () => countWords(paras.join(' ')) + countWords(cta);
            while (totalWords() > 130 && paras.length) {
                // Remove last sentence from last paragraph
                const parts = splitSentences(paras[paras.length - 1]);
                if (parts.length > 1) {
                    // Safety check: Don't trim if it would cut an incomplete sentence
                    const lastSentence = parts[parts.length - 1];
                    if (lastSentence.trim().match(/[.!?]$/)) {
                        parts.pop();
                        paras[paras.length - 1] = parts.join(' ');
                    } else {
                        // Don't cut incomplete sentences
                        break;
                    }
                } else {
                    paras.pop();
                }
            }
            if (totalWords() > 130) {
                // Shorten CTA further
                const words = cta.split(/\s+/).filter(Boolean).slice(0, 10);
                cta = (words.join(' ').replace(/[,;:]$/, '')) + '?';
            }

            // Ensure CTA is appended as its own short paragraph
            if (cta) {
                const lastPara = paras[paras.length - 1] || '';
                const existsAlready = normalize(lastPara) === normalize(cta) || paras.some(p => normalize(p) === normalize(cta));
                if (!existsAlready) {
                    paras.push(cta);
                } else {
                    console.debug('[AI][format] skipping CTA append; already present at end');
                }
            }
            console.debug('[AI][format] final paras with CTA placement:', paras);
        } catch (_) { /* noop */ }

        // If recipient has energy details, add a short mention when missing
        try {
            const energy = recipient?.energy || {};
            const supplier = String(energy.supplier || '').trim();
            const currentRate = String(energy.currentRate || '').trim();
            const contractEnd = String(energy.contractEnd || '').trim();
            const contractEndLabel = toMonthYear(contractEnd);
            const usage = String(energy.usage || '').trim();
            const bodyLower = body.toLowerCase();
            let needsSupplier = supplier && !bodyLower.includes(supplier.toLowerCase());
            let needsRate = currentRate && !/\brate\b/i.test(body) && !/\$/i.test(body);
            let needsEnd = contractEnd && !/contract|renewal|expires|end\s*date/i.test(body);
            let needsUsage = usage && !/usage|load|consumption/i.test(bodyLower);
            if (needsSupplier || needsRate || needsEnd || needsUsage) {
                const bits = [];
                if (needsSupplier) bits.push(`you're with ${supplier}`);
                if (needsRate) bits.push(`at ${currentRate} $/kWh`);
                if (needsEnd) bits.push(`with a contract ending around ${contractEndLabel || 'your renewal window'}`);
                let line = '';
                if (bits.length) line = `I kept in mind that ${bits.join(', ')}.`;
                if (needsUsage) {
                    line += (line ? ' ' : '') + `I also considered your annual usage profile.`;
                }
                // Brevity guard and blend into an existing content paragraph (not CTA)
                if (line) {
                    const countWords = (txt) => String(txt || '').trim().split(/\s+/).filter(Boolean).length;
                    const isCTA = (p) => /\?$/.test(String(p || '').trim()) || /(call|chat|schedule|meet|demo|health\s*check|time|tomorrow|next\s+week|15\s*min|10\s*min|10-?minute|15-?minute)/i.test(p || '');
                    const splitSentencesLocal = (txt) => String(txt || '').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
                    const currentWordCount = countWords(paras.join(' '));
                    const projected = currentWordCount + countWords(line);
                    if (projected <= 110) {
                        // Choose target paragraph index: prefer last non-CTA; otherwise first paragraph
                        let targetIdx = paras.length - 1;
                        if (targetIdx >= 0 && isCTA(paras[targetIdx]) && targetIdx - 1 >= 0) targetIdx = targetIdx - 1;
                        if (targetIdx < 0) targetIdx = 0;
                        const sentences = splitSentencesLocal(paras[targetIdx]);
                        if (sentences.length <= 1) {
                            paras[targetIdx] = [paras[targetIdx], line].filter(Boolean).join(' ');
                        } // else skip to preserve two-sentence maximum
                    }
                }
            }
        } catch (_) { /* noop */ }

        const isBulletPara = (txt) => /^(\s*[•\-]\s+)/m.test(String(txt || ''));
        const paraHtml = paras.map(p => {
            if (!isBulletPara(p)) {
                return `<p style="margin: 0 0 16px 0;">${this.escapeHtml(p)}</p>`;
            }
            // Build a list: optional header + bullet items
            const lines = String(p).replace(/\r/g, '').split(/\n+/).map(l => l.trim()).filter(Boolean);
            const items = [];
            const nonBullets = [];
            for (const l of lines) {
                if (/^(\s*[•\-]\s+)/.test(l)) {
                    items.push(l.replace(/^(\s*[•\-]\s+)/, ''));
                } else {
                    nonBullets.push(l);
                }
            }
            const header = nonBullets.length ? `<p style="margin: 0 0 8px 0;">${this.escapeHtml(nonBullets.join(' '))}</p>` : '';
            const list = items.length
                ? `<ul style="margin: 0 0 16px 18px; padding: 0;">${items.map(i => `<li>${this.escapeHtml(i)}</li>`).join('')}</ul>`
                : '';
            return `${header}${list}`;
        }).join('');

        // Add a single standardized closing (first name only)
        const agentName = (window.SettingsPage?.getSettings?.()?.general?.agentName) || 'Power Choosers';
        const senderFirst = (mode === 'html') ? agentName : agentName;
        const closingHtml = `<p style="margin: 0 0 16px 0;">Best regards,</p><p style="margin: 0 0 16px 0;">${senderFirst}</p>`;

        const contentHtml = [`<p style="margin: 0 0 16px 0;">${this.escapeHtml(greeting)}</p>`, paraHtml, closingHtml]
            .filter(Boolean)
            .join('');

        if (mode === 'html') {
            // Check if Sonar generated rich HTML (tables, structured content)
            const hasStructuredHtml = /<table[^>]*>/i.test(raw) || /<div[^>]*style=/i.test(raw);
            
            if (hasStructuredHtml) {
                // Sonar generated full HTML - use raw body without additional greeting parsing
                console.log('[AI] Detected Sonar-generated HTML, wrapping with branding');
                // Use body directly, which already contains the greeting from Sonar
                return {
                    subject,
                    html: this.wrapSonarHtmlWithBranding(body.trim(), recipient, subject)
                };
            }
            
            // Check if this is a rich HTML email with structured content (fallback to old system)
            const richHtml = this.buildRichHtmlEmail(contentHtml, subject, recipient, body);
            if (richHtml) {
                return { subject, html: richHtml };
            }
            
            // Build a fully branded HTML email with inline styles and logo
            const logoUrl = 'https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/687d6d9c6ea5d6db744563ee_clear%20logo.png';
            const safeSubject = this.escapeHtml(subject || 'Power Choosers — Energy Options');
            
            // Get signature for HTML emails
            const signature = window.getEmailSignature ? window.getEmailSignature() : '';
            const signatureHtml = signature ? `
              <tr>
                <td style="padding:16px 24px; border-top:1px solid rgba(255,255,255,0.2); text-align:left;">
                  ${signature}
                </td>
              </tr>` : '';
            
            const htmlDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeSubject}</title>
  <meta http-equiv="x-ua-compatible" content="ie=edge" />
</head>
<body style="margin:0; padding:0; background-color:#f8fafc; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
  <center role="presentation" style="width:100%; background-color:#f8fafc; padding:20px 0;">
    <div style="max-width:600px; margin:0 auto; background-color:#ffffff; border-radius:12px; box-shadow:0 4px 20px rgba(0,0,0,0.08); overflow:hidden;">
      <!-- Header -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); text-align:center;">
        <tr>
          <td style="padding:28px 24px;">
            <img src="${logoUrl}" alt="Power Choosers Logo" width="450" style="max-width:100%; height:auto; display:block; margin:0 auto 8px;" />
            <div style="font-size:14px; font-weight:500; color:#ffffff; opacity:0.9;">Your Energy Partner</div>
          </td>
        </tr>
      </table>

      <!-- Body Container -->
      <div style="background-color:#ffffff; padding:32px 24px;">
        <!-- Subject Ribbon -->
        <div style="background-color:#eff6ff; padding:12px 14px; border-radius:6px; margin-bottom:24px; border-left:3px solid #1e3a8a;">
          <strong style="color:#1e3a8a; font-size:15px;">Subject:</strong>
          <span style="color:#1f2937; font-size:15px;"> ${safeSubject}</span>
        </div>
        <!-- Message Content -->
        <div style="color:#374151; font-size:15px; line-height:1.7; text-align:left;">${contentHtml}</div>
      </div>

      <!-- Footer -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); color:#ffffff; text-align:center;">
        <tr>
          <td style="padding:20px 24px;">
            <p style="margin:0; font-size:13px; opacity:0.9;">Power Choosers • Your Energy Partner</p>
          </td>
        </tr>
        ${signatureHtml}
      </table>
    </div>
  </center>
  <!-- Preheader spacing for mobile clients -->
  <div style="display:none; max-height:0; overflow:hidden;">&nbsp;</div>
 </body>
</html>`;
            return { subject, html: htmlDoc };
        }

        // Standard mode (rich text editor fragment)
        // Improve generic subjects with name/company and energy data
        try {
            subject = this.improveSubject(subject, recipient) || subject;
        } catch(_) { /* noop */ }
        return { subject, html: contentHtml };
    }

    // Build rich HTML email with cards, buttons, icons, and structured layout
    buildRichHtmlEmail(contentHtml, subject, recipient, bodyText) {
        try {
            // Detect email type from subject and body
            const combined = (subject + ' ' + bodyText).toLowerCase();
            const isEnergyHealthCheck = /energy.*health.*check/i.test(combined);
            const isInvoiceRequest = /invoice.*request|send.*invoice/i.test(combined);
            const isColdEmail = /cold.*email|could.*not.*reach/i.test(combined);
            const isProposal = /proposal/i.test(combined);
            
            // Extract sections from contentHtml
            const parser = new DOMParser();
            const doc = parser.parseFromString(contentHtml, 'text/html');
            const paragraphs = Array.from(doc.querySelectorAll('p'));
            
            if (paragraphs.length < 2) return null; // Not enough content for rich layout
            
            const logoUrl = 'https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/687d6d9c6ea5d6db744563ee_clear%20logo.png';
            const safeSubject = this.escapeHtml(subject || 'Power Choosers — Energy Options');
            
            // Get signature for HTML emails
            const signature = window.getEmailSignature ? window.getEmailSignature() : '';
            const signatureHtml = signature ? `
              <tr>
                <td style="padding:16px 24px; border-top:1px solid rgba(255,255,255,0.2); text-align:left;">
                  ${signature}
                </td>
              </tr>` : '';
            
            // Determine hero icon
            let heroIcon = '⚡';
            let heroColor = '#f59e0b';
            if (isEnergyHealthCheck) {
                heroIcon = '📊';
                heroColor = '#3b82f6';
            } else if (isInvoiceRequest) {
                heroIcon = '📋';
                heroColor = '#10b981';
            } else if (isColdEmail) {
                heroIcon = '👋';
                heroColor = '#8b5cf6';
            } else if (isProposal) {
                heroIcon = '📄';
                heroColor = '#ec4899';
            }
            
            // Build sections
            let sections = '';
            let greeting = '';
            let contentSections = [];
            let cta = '';
            
            for (let i = 0; i < paragraphs.length; i++) {
                const text = paragraphs[i].textContent.trim();
                const html = paragraphs[i].innerHTML;
                
                // Skip empty paragraphs
                if (!text) continue;
                
                // Greeting (first paragraph starting with Hi/Hello)
                if (i === 0 && /^(hi|hello|hey)/i.test(text)) {
                    greeting = text;
                    continue;
                }
                
                // Closing (Best regards)
                if (/best regards|regards|sincerely/i.test(text)) {
                    break;
                }
                
                // CTA (ends with ?)
                if (text.endsWith('?') && (i === paragraphs.length - 1 || i === paragraphs.length - 2)) {
                    cta = text;
                    continue;
                }
                
                // Regular content
                contentSections.push(html);
            }
            
            // Build greeting section
            if (greeting) {
                const firstName = greeting.match(/hi\s+([^,]+)/i)?.[1] || '';
                sections += `
                <div style="margin-bottom:24px;">
                  <div style="display:inline-block; font-size:48px; margin-bottom:12px;">${heroIcon}</div>
                  <h2 style="margin:0 0 8px 0; font-size:20px; font-weight:600; color:#1f2937;">${greeting}</h2>
                </div>`;
            }
            
            // Build content cards
            if (contentSections.length > 0) {
                // First section as intro
                sections += `
                <div style="margin-bottom:20px; color:#374151; font-size:15px; line-height:1.7;">
                  ${contentSections[0]}
                </div>`;
                
                // Additional sections as feature cards
                if (contentSections.length > 1) {
                    for (let i = 1; i < contentSections.length; i++) {
                        const content = contentSections[i];
                        
                        // Check if content has bullet points or lists
                        const hasList = content.includes('<ul') || content.includes('<li');
                        
                        if (hasList) {
                            // Render as checklist card
                            sections += `
                            <div style="background:#f8fafc; border-left:3px solid ${heroColor}; padding:16px; margin:20px 0; border-radius:6px;">
                              <div style="color:#374151; font-size:14px; line-height:1.6;">
                                ${content}
                              </div>
                            </div>`;
                        } else {
                            // Regular content card
                            sections += `
                            <div style="background:#eff6ff; padding:16px; margin:20px 0; border-radius:8px; border-left:3px solid #1e3a8a;">
                              <div style="color:#1f2937; font-size:15px; line-height:1.6;">
                                ${content}
                              </div>
                            </div>`;
                        }
                    }
                }
            }
            
            // Add energy data card if available
            const energy = recipient?.energy || {};
            if (energy.supplier || energy.currentRate || energy.contractEnd) {
                sections += `
                <div style="background:linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); padding:20px; margin:24px 0; border-radius:8px; border:1px solid #bfdbfe;">
                  <div style="font-size:14px; font-weight:600; color:#1e3a8a; margin-bottom:12px; display:flex; align-items:center;">
                    <span style="font-size:20px; margin-right:8px;">📌</span>
                    Your Energy Profile
                  </div>
                  <table style="width:100%; border-collapse:collapse;">
                    ${energy.supplier ? `<tr><td style="padding:6px 0; color:#1f2937; font-size:14px;"><strong>Supplier:</strong></td><td style="padding:6px 0; color:#374151; text-align:right;">${energy.supplier}</td></tr>` : ''}
                    ${energy.currentRate ? `<tr><td style="padding:6px 0; color:#1f2937; font-size:14px;"><strong>Current Rate:</strong></td><td style="padding:6px 0; color:#374151; text-align:right;">${energy.currentRate}/kWh</td></tr>` : ''}
                    ${energy.contractEnd ? `<tr><td style="padding:6px 0; color:#1f2937; font-size:14px;"><strong>Contract Ends:</strong></td><td style="padding:6px 0; color:#374151; text-align:right;">${energy.contractEnd}</td></tr>` : ''}
                  </table>
                </div>`;
            }
            
            // Build CTA button
            let ctaHtml = '';
            if (cta) {
                ctaHtml = `
                <div style="text-align:center; margin:32px 0 24px 0;">
                  <div style="background:linear-gradient(135deg, ${heroColor} 0%, ${this.adjustColorBrightness(heroColor, -20)} 100%); color:#ffffff; padding:14px 28px; border-radius:8px; display:inline-block; font-weight:600; font-size:15px; box-shadow:0 4px 12px rgba(0,0,0,0.15); text-decoration:none;">
                    ${this.escapeHtml(cta)}
                  </div>
                </div>`;
            }
            
            // Build closing
            const closingHtml = `
            <div style="margin-top:32px; padding-top:20px; border-top:1px solid #e5e7eb; color:#6b7280; font-size:14px;">
              <p style="margin:0;">Best regards,</p>
              <p style="margin:4px 0 0 0; font-weight:500; color:#1f2937;">Power Choosers</p>
            </div>`;
            
            // Assemble full HTML
            const htmlDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeSubject}</title>
  <meta http-equiv="x-ua-compatible" content="ie=edge" />
</head>
<body style="margin:0; padding:0; background-color:#f8fafc; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
  <center role="presentation" style="width:100%; background-color:#f8fafc; padding:20px 0;">
    <div style="max-width:600px; margin:0 auto; background-color:#ffffff; border-radius:12px; box-shadow:0 4px 20px rgba(0,0,0,0.08); overflow:hidden;">
      <!-- Header -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); text-align:center;">
        <tr>
          <td style="padding:28px 24px;">
            <img src="${logoUrl}" alt="Power Choosers Logo" width="450" style="max-width:100%; height:auto; display:block; margin:0 auto 8px;" />
            <div style="font-size:14px; font-weight:500; color:#ffffff; opacity:0.9;">Your Energy Partner</div>
          </td>
        </tr>
      </table>

      <!-- Body Container -->
      <div style="background-color:#ffffff; padding:32px 24px;">
        <!-- Subject Ribbon -->
        <div style="background-color:#eff6ff; padding:12px 14px; border-radius:6px; margin-bottom:24px; border-left:3px solid #1e3a8a;">
          <strong style="color:#1e3a8a; font-size:15px;">Subject:</strong>
          <span style="color:#1f2937; font-size:15px;"> ${safeSubject}</span>
        </div>
        
        <!-- Message Content -->
        <div style="text-align:left;">
          ${sections}
          ${ctaHtml}
          ${closingHtml}
        </div>
      </div>

      <!-- Footer -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); color:#ffffff; text-align:center;">
        <tr>
          <td style="padding:20px 24px;">
            <p style="margin:0; font-size:13px; opacity:0.9;">Power Choosers • Your Energy Partner</p>
          </td>
        </tr>
        ${signatureHtml}
      </table>
    </div>
  </center>
  <div style="display:none; max-height:0; overflow:hidden;">&nbsp;</div>
</body>
</html>`;
            
            return htmlDoc;
        } catch (e) {
            console.warn('[RichHTML] Failed to build rich HTML email:', e);
            return null; // Fall back to standard template
        }
    }
    
    // Helper to adjust color brightness
    adjustColorBrightness(hex, percent) {
        // Remove # if present
        hex = hex.replace(/^#/, '');
        
        // Convert to RGB
        let r = parseInt(hex.substring(0, 2), 16);
        let g = parseInt(hex.substring(2, 4), 16);
        let b = parseInt(hex.substring(4, 6), 16);
        
        // Adjust brightness
        r = Math.max(0, Math.min(255, r + (r * percent / 100)));
        g = Math.max(0, Math.min(255, g + (g * percent / 100)));
        b = Math.max(0, Math.min(255, b + (b * percent / 100)));
        
        // Convert back to hex
        return '#' + [r, g, b].map(x => {
            const hex = Math.round(x).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }

    // ========== 7 PRESET HTML TEMPLATE BUILDERS ==========
    
    // Template 1: Warm Intro (Blue gradient theme)
    buildWarmIntroHtml(data, recipient, fromEmail) {
        const mail = fromEmail || 'l.patterson@powerchoosers.com';
        return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr>
        <td style="background:linear-gradient(135deg, #3498db, #2980b9); padding:25px; border-radius:8px; color:#ffffff;">
            <h2 style="margin:0 0 15px 0; font-size:22px; font-weight:600;">🤝 ${this.escapeHtml(data.call_reference || 'Great speaking with you')}</h2>
        </td>
    </tr>
</table>

<div style="background:#ffffff; padding:20px; border-radius:6px; margin:15px 0; border-left:4px solid #3498db;">
    <p style="color:#1f2937; font-size:15px; line-height:1.6; margin:0;">
        ${this.escapeHtml(data.main_message || 'Looking forward to our next conversation.')}
    </p>
</div>

<table border="0" cellspacing="0" cellpadding="0" style="margin:25px 0;">
    <tr>
        <td style="background:#e67e22; border-radius:28px; padding:14px 28px;">
            <a href="mailto:${mail}?subject=Re: ${encodeURIComponent(data.subject || 'Follow up')}" style="color:#ffffff; text-decoration:none; font-weight:700; font-size:16px;">
                ${this.escapeHtml(data.cta_text || 'Schedule a Follow-Up Call')}
            </a>
        </td>
    </tr>
</table>`;
    }

    // Template 2: Follow-Up (Purple accent theme)
    buildFollowUpHtml(data, recipient, fromEmail) {
        const mail = fromEmail || 'l.patterson@powerchoosers.com';
        const valueProps = Array.isArray(data.value_props) ? data.value_props : [data.value_props || ''];
        
        return `
<div style="background:#f8f9fa; padding:20px; border-radius:6px; margin:15px 0;">
    <h3 style="color:#8e44ad; font-size:18px; margin:0 0 10px 0;">📊 Progress Update</h3>
    <p style="color:#1f2937; font-size:15px; line-height:1.6; margin:0;">
        ${this.escapeHtml(data.progress_update || 'Here\'s where we are...')}
    </p>
</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr>
        <td width="50%" style="padding-right:10px; vertical-align:top;">
            <div style="background:#ffffff; padding:20px; border-radius:6px; border:2px solid #8e44ad; height:100%;">
                <h4 style="color:#8e44ad; font-size:16px; margin:0 0 15px 0;">✓ Key Benefits</h4>
                ${valueProps.slice(0, Math.ceil(valueProps.length / 2)).map(prop => 
                    `<p style="color:#555; font-size:14px; line-height:1.5; margin:0 0 10px 0;">• ${this.escapeHtml(prop)}</p>`
                ).join('')}
            </div>
        </td>
        <td width="50%" style="padding-left:10px; vertical-align:top;">
            <div style="background:#ffffff; padding:20px; border-radius:6px; border:2px solid #8e44ad; height:100%;">
                <h4 style="color:#8e44ad; font-size:16px; margin:0 0 15px 0;">✓ Why Act Now</h4>
                ${valueProps.slice(Math.ceil(valueProps.length / 2)).map(prop => 
                    `<p style="color:#555; font-size:14px; line-height:1.5; margin:0 0 10px 0;">• ${this.escapeHtml(prop)}</p>`
                ).join('')}
            </div>
        </td>
    </tr>
</table>

<div style="background:#fff3cd; border-left:4px solid #f39c12; padding:15px; border-radius:4px; margin:15px 0;">
    <p style="color:#856404; font-size:14px; line-height:1.5; margin:0; font-weight:600;">
        ⚠️ Market Update: ${this.escapeHtml(data.urgency_message || 'Time-sensitive opportunity')}
    </p>
</div>

<table border="0" cellspacing="0" cellpadding="0" style="margin:25px 0;">
    <tr>
        <td style="background:#27ae60; border-radius:28px; padding:14px 28px;">
            <a href="mailto:${mail}" style="color:#ffffff; text-decoration:none; font-weight:700; font-size:16px;">
                ${this.escapeHtml(data.cta_text || 'Let\'s Continue the Conversation')}
            </a>
        </td>
    </tr>
</table>`;
    }

    // Template 3: Energy Health Check (Teal/medical theme)
    buildEnergyHealthHtml(data, recipient, fromEmail) {
        const mail = fromEmail || 'l.patterson@powerchoosers.com';
        const assessmentItems = Array.isArray(data.assessment_items) ? data.assessment_items : [data.assessment_items || ''];
        
        return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr>
        <td style="background:linear-gradient(135deg, #16a085, #1abc9c); padding:25px; border-radius:8px; text-align:center;">
            <h2 style="color:#ffffff; font-size:24px; margin:0; font-weight:600;">⚡ Free Energy Health Check</h2>
            <p style="color:#ffffff; font-size:14px; margin:10px 0 0 0; opacity:0.95;">Comprehensive Assessment • No Obligation</p>
        </td>
    </tr>
</table>

<div style="background:#e8f8f5; padding:20px; border-radius:6px; margin:15px 0;">
    <h3 style="color:#16a085; font-size:18px; margin:0 0 15px 0;">📋 What We'll Review</h3>
    ${assessmentItems.map(item => 
        `<div style="background:#ffffff; padding:12px; margin:8px 0; border-radius:4px; border-left:3px solid #1abc9c;">
            <p style="color:#1f2937; font-size:14px; margin:0;">✓ ${this.escapeHtml(item)}</p>
        </div>`
    ).join('')}
</div>

<table width="100%" cellpadding="15" cellspacing="0" border="0" style="background:#d1f2eb; border-radius:6px; margin:15px 0;">
    <tr>
        <td>
            <p style="color:#0e6655; font-size:15px; line-height:1.5; margin:0;">
                <strong>Your Contract:</strong> ${this.escapeHtml(data.contract_info || 'Review current terms and expiration')}
            </p>
        </td>
    </tr>
</table>

<div style="background:#ffffff; padding:20px; border-radius:6px; margin:15px 0; border:2px solid #16a085;">
    <p style="color:#1f2937; font-size:15px; line-height:1.6; margin:0;">
        ${this.escapeHtml(data.benefits || 'Get insights into potential savings and optimization opportunities.')}
    </p>
</div>

<table border="0" cellspacing="0" cellpadding="0" style="margin:25px 0;">
    <tr>
        <td style="background:#16a085; border-radius:28px; padding:14px 28px;">
            <a href="mailto:${mail}" style="color:#ffffff; text-decoration:none; font-weight:700; font-size:16px;">
                ${this.escapeHtml(data.cta_text || 'Schedule Your Free Assessment')}
            </a>
        </td>
    </tr>
</table>`;
    }

    // Template 4: Proposal Delivery (Gold/premium theme)
    buildProposalHtml(data, recipient, fromEmail) {
        const mail = fromEmail || 'l.patterson@powerchoosers.com';
        const timeline = Array.isArray(data.timeline) ? data.timeline : [data.timeline || ''];
        
        return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0; position:relative;">
    <tr>
        <td style="background:linear-gradient(135deg, #f39c12, #e67e22); padding:30px; border-radius:8px; text-align:center; position:relative;">
            <div style="position:absolute; top:10px; right:10px; background:#ffffff; color:#f39c12; padding:5px 15px; border-radius:20px; font-size:12px; font-weight:700;">
                EXCLUSIVE OFFER
            </div>
            <h2 style="color:#ffffff; font-size:24px; margin:0; font-weight:600;">📄 Your Custom Proposal</h2>
        </td>
    </tr>
</table>

<div style="background:#fff8e1; border:3px solid #f39c12; padding:20px; border-radius:8px; margin:15px 0;">
    <h3 style="color:#f57c00; font-size:18px; margin:0 0 10px 0;">Proposal Summary</h3>
    <p style="color:#1f2937; font-size:15px; line-height:1.6; margin:0;">
        ${this.escapeHtml(data.proposal_summary || 'Tailored energy solution designed for your needs.')}
    </p>
</div>

<table width="100%" cellpadding="20" cellspacing="0" border="0" style="background:linear-gradient(135deg, #ffd700, #ffa500); border-radius:8px; margin:15px 0;">
    <tr>
        <td style="text-align:center;">
            <h3 style="color:#ffffff; font-size:20px; margin:0 0 10px 0; text-shadow:0 2px 4px rgba(0,0,0,0.2);">💰 Pricing Highlight</h3>
            <p style="color:#ffffff; font-size:16px; line-height:1.5; margin:0; font-weight:600;">
                ${this.escapeHtml(data.pricing_highlight || 'Competitive rates with significant savings potential')}
            </p>
        </td>
    </tr>
</table>

<div style="background:#ffffff; padding:20px; border-radius:6px; margin:15px 0; border:2px solid #f39c12;">
    <h3 style="color:#f57c00; font-size:18px; margin:0 0 15px 0;">📅 Implementation Timeline</h3>
    ${timeline.map((step, idx) => 
        `<div style="padding:10px; margin:8px 0; background:#fff8e1; border-radius:4px; border-left:4px solid #f39c12;">
            <p style="color:#1f2937; font-size:14px; margin:0;"><strong>Step ${idx + 1}:</strong> ${this.escapeHtml(step)}</p>
        </div>`
    ).join('')}
</div>

<table border="0" cellspacing="0" cellpadding="0" style="margin:25px 0;">
    <tr>
        <td style="background:#f39c12; border-radius:28px; padding:14px 28px;">
            <a href="mailto:${mail}" style="color:#ffffff; text-decoration:none; font-weight:700; font-size:16px;">
                ${this.escapeHtml(data.cta_text || 'Let\'s Discuss Your Proposal')}
            </a>
        </td>
    </tr>
</table>`;
    }

    // Template 5: Cold Email (Red urgency theme)
    buildColdEmailHtml(data, recipient, fromEmail) {
        const mail = fromEmail || 'l.patterson@powerchoosers.com';
        const painPoints = Array.isArray(data.pain_points) ? data.pain_points : [data.pain_points || ''];
        
        return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr>
        <td style="background:linear-gradient(135deg, #e74c3c, #c0392b); padding:25px; border-radius:8px; text-align:center;">
            <h2 style="color:#ffffff; font-size:22px; margin:0; font-weight:600;">⚠️ Energy Costs Rising Fast</h2>
        </td>
    </tr>
</table>

<div style="background:#fff5f5; padding:20px; border-radius:6px; margin:15px 0; border-left:4px solid #e74c3c;">
    <h3 style="color:#c0392b; font-size:18px; margin:0 0 15px 0;">Common Challenges We're Seeing</h3>
    ${painPoints.map(point => 
        `<div style="background:#ffffff; padding:12px; margin:8px 0; border-radius:4px;">
            <p style="color:#555; font-size:14px; margin:0;">❌ ${this.escapeHtml(point)}</p>
        </div>`
    ).join('')}
</div>

<div style="background:#d1f2eb; border:2px solid #16a085; padding:20px; border-radius:8px; margin:15px 0;">
    <h3 style="color:#16a085; font-size:18px; margin:0 0 10px 0;">✓ How Power Choosers Helps</h3>
    <p style="color:#1f2937; font-size:15px; line-height:1.6; margin:0;">
        ${this.escapeHtml(data.solution_intro || 'We help businesses reduce energy costs through competitive procurement and efficiency solutions.')}
    </p>
</div>

<div style="background:#e8f8f5; padding:15px; border-radius:6px; margin:15px 0;">
    <p style="color:#16a085; font-size:14px; line-height:1.5; margin:0; font-style:italic;">
        ${this.escapeHtml(data.social_proof || 'Companies like yours are saving 20-30% on energy costs.')}
    </p>
</div>

<table border="0" cellspacing="0" cellpadding="0" style="margin:25px 0;">
    <tr>
        <td style="background:#e74c3c; border-radius:28px; padding:14px 28px;">
            <a href="mailto:${mail}" style="color:#ffffff; text-decoration:none; font-weight:700; font-size:16px;">
                ${this.escapeHtml(data.cta_text || 'Explore Your Savings Potential')}
            </a>
        </td>
    </tr>
</table>`;
    }

    // Template 6: Invoice Request (Simple/clean theme)
    buildInvoiceHtml(data, recipient, fromEmail) {
        const mail = fromEmail || 'l.patterson@powerchoosers.com';
        const checklist = Array.isArray(data.checklist_items) ? data.checklist_items : [data.checklist_items || ''];
        
        return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr>
        <td style="background:#3498db; padding:20px; border-radius:6px; text-align:center;">
            <h2 style="color:#ffffff; font-size:20px; margin:0; font-weight:600;">📎 Invoice Request</h2>
        </td>
    </tr>
</table>

<div style="background:#fff8e1; border-left:4px solid #f39c12; padding:15px; border-radius:4px; margin:15px 0;">
    <p style="color:#1f2937; font-size:15px; line-height:1.6; margin:0;">
        ${this.escapeHtml(data.reminder_text || 'We need your latest invoice to complete your energy analysis.')}
    </p>
</div>

<div style="background:#f8f9fa; padding:20px; border-radius:6px; margin:15px 0;">
    <h3 style="color:#2c3e50; font-size:18px; margin:0 0 15px 0;">✓ What We'll Review</h3>
    ${checklist.map(item => 
        `<div style="padding:10px; margin:8px 0; background:#ffffff; border-radius:4px; border:2px solid #ecf0f1;">
            <p style="color:#1f2937; font-size:14px; margin:0;">☐ ${this.escapeHtml(item)}</p>
        </div>`
    ).join('')}
</div>

<table width="100%" cellpadding="15" cellspacing="0" border="0" style="background:#ffe5e5; border-radius:6px; margin:15px 0;">
    <tr>
        <td style="text-align:center;">
            <p style="color:#c0392b; font-size:16px; margin:0; font-weight:600;">
                ⏰ Needed: ${this.escapeHtml(data.deadline || 'As soon as possible')}
            </p>
        </td>
    </tr>
</table>

<table border="0" cellspacing="0" cellpadding="0" style="margin:25px 0;">
    <tr>
        <td style="background:#3498db; border-radius:28px; padding:14px 28px;">
            <a href="mailto:${mail}?subject=Invoice for Energy Review" style="color:#ffffff; text-decoration:none; font-weight:700; font-size:16px;">
                ${this.escapeHtml(data.cta_text || 'Send Invoice Now')}
            </a>
        </td>
    </tr>
</table>`;
    }

    // Template 7: General/Manual (Flexible theme)
    buildGeneralHtml(data, recipient, fromEmail) {
        const mail = fromEmail || 'l.patterson@powerchoosers.com';
        const sections = Array.isArray(data.sections) ? data.sections : [data.sections || ''];
        
        return `
${sections.map((section, idx) => {
    const bgColor = idx % 2 === 0 ? '#ffffff' : '#f8f9fa';
    const borderColor = '#3498db';
    
    return `<div style="background:${bgColor}; padding:20px; margin:15px 0; border-radius:6px; border-left:4px solid ${borderColor};">
    <p style="color:#1f2937; font-size:15px; line-height:1.6; margin:0;">
        ${this.escapeHtml(section)}
    </p>
</div>`;
}).join('')}

<table border="0" cellspacing="0" cellpadding="0" style="margin:25px 0;">
    <tr>
        <td style="background:#e67e22; border-radius:28px; padding:14px 28px;">
            <a href="mailto:${mail}" style="color:#ffffff; text-decoration:none; font-weight:700; font-size:16px;">
                ${this.escapeHtml(data.cta_text || 'Let\'s Connect')}
            </a>
        </td>
    </tr>
</table>`;
    }

    // Main template builder dispatcher
    buildTemplateHtml(templateType, data, recipient, fromEmail) {
        console.log('[AI] Building template:', templateType);
        
        switch (templateType) {
            case 'warm_intro':
                return this.buildWarmIntroHtml(data, recipient, fromEmail);
            case 'follow_up':
                return this.buildFollowUpHtml(data, recipient, fromEmail);
            case 'energy_health':
                return this.buildEnergyHealthHtml(data, recipient, fromEmail);
            case 'proposal':
                return this.buildProposalHtml(data, recipient, fromEmail);
            case 'cold_email':
                return this.buildColdEmailHtml(data, recipient, fromEmail);
            case 'invoice':
                return this.buildInvoiceHtml(data, recipient, fromEmail);
            case 'general':
            default:
                return this.buildGeneralHtml(data, recipient, fromEmail);
        }
    }

    // Wrap Sonar-generated HTML with Power Choosers branding (header/footer)
    wrapSonarHtmlWithBranding(sonarGeneratedHtml, recipient, subject) {
        const company = recipient?.company || recipient?.accountName || 'Your Company';
        const logoUrl = 'https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/687d6d9c6ea5d6db744563ee_clear%20logo.png';
        const safeSubject = this.escapeHtml(subject || 'Energy Solutions');
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeSubject}</title>
  <meta http-equiv="x-ua-compatible" content="ie=edge" />
</head>
<body style="margin:0; padding:0; background-color:#f8fafc; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
  <center role="presentation" style="width:100%; background-color:#f8fafc; padding:20px 0;">
    <div style="max-width:600px; margin:0 auto; background-color:#ffffff; border-radius:12px; box-shadow:0 4px 20px rgba(0,0,0,0.08); overflow:hidden;">
      
      <!-- Power Choosers Header -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); text-align:center;">
        <tr>
          <td style="padding:28px 24px;">
            <img src="${logoUrl}" alt="Power Choosers" width="450" style="max-width:100%; height:auto; display:block; margin:0 auto 8px;">
            <div style="font-size:14px; font-weight:500; color:#ffffff; opacity:0.9;">Your Energy Partner</div>
          </td>
        </tr>
      </table>

      <!-- Sonar-Generated Content -->
      <div style="padding:32px 24px; color:#1f2937; font-size:15px; line-height:1.6;">
        ${sonarGeneratedHtml}
      </div>

      <!-- Power Choosers Footer with Signature -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); color:#ffffff;">
        <tr>
          <td style="padding:20px 24px; text-align:center;">
            <p style="margin:0; font-size:13px; opacity:0.9;">Power Choosers • Your Energy Partner</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px; border-top:1px solid rgba(255,255,255,0.2);">
            <div style="color:#ffffff; font-size:14px; line-height:1.4;">
              <strong>Lewis Patterson</strong><br>
              Energy Strategist<br>
              817-663-0380<br>
              Fort Worth, Texas
            </div>
          </td>
        </tr>
      </table>
      
    </div>
  </center>
  <div style="display:none; max-height:0; overflow:hidden;">&nbsp;</div>
</body>
</html>`;
    }

    // Strengthen generic subjects with name/company and energy details; vary patterns slightly
    improveSubject(subject, recipient) {
        try {
            const sub = String(subject || '').trim();
            const r = recipient || {};
            const name = (r.fullName || r.name || '').split(' ')[0] || '';
            const company = r.company || r.account?.name || '';
            const energy = r.energy || r.account?.energy || {};
            const supplier = energy.supplier || '';
            const rate = energy.currentRate ? String(energy.currentRate).replace(/^\./, '0.') : '';
            const end = energy.contractEnd || '';
            const toMonthYear = (val) => {
                const s = String(val || '').trim();
                if (!s) return '';
                const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                const d = new Date(s);
                if (!isNaN(d.getTime())) return `${months[d.getMonth()]} ${d.getFullYear()}`;
                const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
                if (m1) { const m = Math.max(1, Math.min(12, parseInt(m1[1], 10))); return `${months[m - 1]} ${m1[3]}`; }
                const m2 = s.match(/^(\d{4})[\-](\d{1,2})[\-](\d{1,2})$/);
                if (m2) { const m = Math.max(1, Math.min(12, parseInt(m2[2], 10))); return `${months[m - 1]} ${m2[1]}`; }
                const m3 = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
                if (m3) { const m = Math.max(1, Math.min(12, parseInt(m3[1], 10))); return `${months[m - 1]} ${m3[2]}`; }
                const m4 = s.match(/([A-Za-z]+)\s+(\d{4})/);
                if (m4) return `${m4[1]} ${m4[2]}`;
                const y = s.match(/(19\d{2}|20\d{2})/);
                if (y) return y[1];
                return '';
            };
            const endLabel = toMonthYear(end);
            const looksGeneric = /^(subject\s*:\s*)?(re:|fwd:)?\s*(hi|hello|catching up|follow\s*up|quick note|unknown)\b/i.test(sub) || sub.length < 8;
            if (!looksGeneric) return sub;
            const variants = [];
            if (name && company && supplier && endLabel) variants.push(`${name} — ${company}: ${supplier} until ${endLabel}`);
            if (company && endLabel) variants.push(`${company} — plan before ${endLabel}`);
            if (name && rate) variants.push(`${name} — options vs ${rate} $/kWh`);
            if (company) variants.push(`${company} — energy options`);
            if (name) variants.push(`${name} — quick energy check`);
            variants.push('Energy options and next steps');
            return variants[Math.floor(Math.random() * variants.length)];
        } catch(_) { return subject; }
    }

    // Replace any {{contact./account./sender.}} tokens and .var-chip spans with real values
    replaceVariablesInHtml(html, recipient) {
        try {
            const r = recipient || {};
            const contact = r;
            const account = r.account || {};
            const sender = (window.currentUser && window.currentUser.profile) || {};

            const get = (obj, key) => {
                const k = String(key || '').trim();
                const map = {
                    first_name: (obj.firstName || (obj.name||'').split(' ')[0] || ''),
                    last_name: (obj.lastName || (obj.name||'').split(' ').slice(1).join(' ') || ''),
                    full_name: (obj.fullName || obj.name || [obj.firstName, obj.lastName].filter(Boolean).join(' ') || ''),
                    title: (obj.title || obj.job || obj.role || obj.jobTitle || ''),
                    email: (obj.email || ''),
                    phone: (obj.phone || obj.mobile || ''),
                    website: (obj.website || obj.domain || ''),
                    name: (obj.name || obj.accountName || ''),
                    industry: (obj.industry || ''),
                    city: (obj.city || obj.billingCity || obj.locationCity || ''),
                    state: (obj.state || obj.region || obj.billingState || ''),
                    country: (obj.country || '')
                };
                return map.hasOwnProperty(k) ? (map[k] || '') : (obj[k] || '');
            };

            // Replace raw tokens first
            let out = String(html || '')
                .replace(/\{\{\s*contact\.([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => this.escapeHtml(get(contact, k)))
                .replace(/\{\{\s*account\.([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => this.escapeHtml(get(account, k)))
                .replace(/\{\{\s*sender\.([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => this.escapeHtml(get(sender, k)));

            // Replace .var-chip elements if present
            const tmp = document.createElement('div');
            tmp.innerHTML = out;
            tmp.querySelectorAll('.var-chip').forEach(chip => {
                const dataVar = chip.getAttribute('data-var') || '';
                const m = dataVar.match(/^([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)$/);
                if (!m) { chip.replaceWith(document.createTextNode(chip.textContent||'')); return; }
                const scope = m[1];
                const key = m[2];
                let val = '';
                if (scope === 'contact') val = get(contact, key);
                else if (scope === 'account') val = get(account, key);
                else if (scope === 'sender') val = get(sender, key);
                chip.replaceWith(document.createTextNode(val || ''));
            });
            out = tmp.innerHTML;
            return out;
        } catch (e) {
            console.warn('[AI] replaceVariablesInHtml failed', e);
            return html;
        }
    }

    // Ensure warm-intro layout: greeting line, personal line on its own paragraph, then the rest
    adjustWarmIntroHtml(html) {
        try {
            let body = String(html || '');
            // Normalize to paragraphs for manipulation
            const toPlain = (h) => String(h).replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n\n').replace(/<[^>]+>/g,'');
            const toHtmlPara = (p) => `<p style="margin: 0 0 16px 0;">${this.escapeHtml(p)}</p>`;
            const plain = toPlain(body).replace(/\r\n/g,'\n');
            const lines = plain.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
            if (!lines.length) return html;

            // Find personal line candidates
            const isPersonal = (t) => /productive week|great start to the week|great friday|wonderful holiday season|great start to the new year|hope you're having|hope you are having/i.test(t);
            const greetIdx = lines.findIndex(l => /^\s*(hi|hello|hey)\b/i.test(l));
            let personalIdx = lines.findIndex(isPersonal);

            if (personalIdx === -1) {
                // Sometimes Gemini puts "As promised..." early; keep it below the personal line if present later
                // If we detect a sentence starting with "As promised," ensure it is NOT above the personal line
                // We'll attempt to split first paragraph and move clauses
            }

            // If "As promised," exists before personal line, move it after personal line
            const asPromisedIdx = lines.findIndex(l => /^as promised[,\s]/i.test(l));
            if (asPromisedIdx !== -1) {
                // Ensure personal line exists; if not, try to synthesize a generic one
                if (personalIdx === -1) {
                    const today = new Date();
                    const day = today.getDay();
                    const personal = (day === 1) ? "I hope you're having a great start to the week." : (day === 5) ? "I hope you're having a great Friday." : "I hope you're having a productive week.";
                    lines.splice( (greetIdx !== -1 ? greetIdx + 1 : 0), 0, personal);
                    personalIdx = (greetIdx !== -1 ? greetIdx + 1 : 0);
                }
                if (asPromisedIdx < personalIdx) {
                    const [moved] = lines.splice(asPromisedIdx, 1);
                    // Place right after personal line
                    lines.splice(personalIdx + 1, 0, moved);
                }
            }

            // Ensure personal line is its own paragraph directly after greeting if present
            if (personalIdx !== -1 && greetIdx !== -1 && personalIdx !== greetIdx + 1) {
                const [p] = lines.splice(personalIdx, 1);
                lines.splice(greetIdx + 1, 0, p);
            }

            // Ensure any CTA-like time windows sit below the context lines
            try {
                // Detect scheduling CTA lines (Tuesday/Thursday windows etc.)
                const isTimeCta = (t) => /(mon|tue|wed|thu|fri|monday|tuesday|wednesday|thursday|friday|\b\d{1,2}\s*(am|pm)\b|\b\d{1,2}\s*[–-]\s*\d{1,2}\b|work for you\?)/i.test(String(t||''));
                const ctaIdx = lines.findIndex(isTimeCta);
                // If we have both an "As promised" line and a CTA, ensure order: greeting → personal → As promised → CTA
                const asPromisedIdx2 = lines.findIndex(l => /^as promised[, \s]/i.test(l));
                if (ctaIdx !== -1 && asPromisedIdx2 !== -1) {
                    // Determine insertion anchor (after personal if present, else after greeting)
                    const anchor = (personalIdx !== -1) ? personalIdx : greetIdx;
                    if (asPromisedIdx2 > anchor && ctaIdx < asPromisedIdx2) {
                        const [cta] = lines.splice(ctaIdx, 1);
                        // Recompute personal index if it moved earlier
                        const insertPos = (personalIdx !== -1 ? personalIdx + 1 : (greetIdx !== -1 ? greetIdx + 1 : 0)) + 1; // after As promised
                        // Ensure As promised is just after personal/greeting
                        if (asPromisedIdx2 !== (personalIdx !== -1 ? personalIdx + 1 : (greetIdx !== -1 ? greetIdx + 1 : 0))) {
                            const [ap] = lines.splice(asPromisedIdx2, 1);
                            lines.splice((personalIdx !== -1 ? personalIdx + 1 : (greetIdx !== -1 ? greetIdx + 1 : 0)), 0, ap);
                        }
                        // Place CTA after As promised
                        const newApIdx = lines.findIndex(l => /^as promised[, \s]/i.test(l));
                        lines.splice(newApIdx + 1, 0, cta);
                    }
                }
            } catch (_) { /* noop */ }

            // Rebuild
            const rebuilt = lines.map(toHtmlPara).join('');
            return rebuilt;
        } catch (e) {
            console.warn('[AI] adjustWarmIntroHtml failed', e);
            return html;
        }
    }

    // Fetch and log all six predefined prompts for debugging
    async logAllAIPrompts(aiBar) {
        try {
            const compose = document.getElementById('compose-window');
            const toInput = compose?.querySelector('#compose-to');
            const recipient = this._selectedRecipient || null;
            const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
            const genUrl = `${base}/api/perplexity-email`;
            const prompts = [
                'Warm intro after a call',
                'Follow-up with tailored value props',
                'Schedule an Energy Health Check',
                'Proposal delivery with next steps',
                'Cold email to a lead I could not reach by phone',
                'Standard Invoice Request'
            ];
            const mode = 'standard';

            // Enrich recipient same as generate path
            let enrichedRecipient = recipient ? JSON.parse(JSON.stringify(recipient)) : null;
            try {
                if (enrichedRecipient && (enrichedRecipient.company || enrichedRecipient.email)) {
                    const accounts = (typeof window.getAccountsData === 'function') ? (window.getAccountsData() || []) : [];
                    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\b(llc|inc|inc\.|co|co\.|corp|corp\.|ltd|ltd\.)\b/g,' ').replace(/\s+/g,' ').trim();
                    const comp = norm(enrichedRecipient.company || '');
                    const domain = (enrichedRecipient.email || '').split('@')[1]?.toLowerCase() || '';
                    let acct = null;
                    if (comp) {
                        acct = accounts.find(a => {
                            const an = norm(a.accountName || a.name || a.companyName || '');
                            return an === comp || an.includes(comp) || comp.includes(an);
                        }) || null;
                    }
                    if (!acct && domain) {
                        acct = accounts.find(a => {
                            const d = String(a.domain || a.website || '').toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
                            return d && domain.endsWith(d);
                        }) || null;
                    }
                    if (acct) {
                        const acctEnergy = {
                            supplier: acct.electricitySupplier || acct.supplier || '',
                            currentRate: acct.currentRate || acct.rate || '',
                            usage: acct.annual_kwh || acct.kwh || '',
                            contractEnd: acct.contractEndDate || acct.contractEnd || acct.contract_end_date || ''
                        };
                        enrichedRecipient.account = enrichedRecipient.account || {
                            id: acct.id,
                            name: acct.accountName || acct.name || acct.companyName || '',
                            industry: acct.industry || '',
                            domain: acct.domain || acct.website || ''
                        };
                        const rE = enrichedRecipient.energy || {};
                        const merged = {
                            supplier: rE.supplier || acctEnergy.supplier || '',
                            currentRate: rE.currentRate || acctEnergy.currentRate || '',
                            usage: rE.usage || acctEnergy.usage || '',
                            contractEnd: rE.contractEnd || acctEnergy.contractEnd || ''
                        };
                        if (/^\.\d+$/.test(String(merged.currentRate))) merged.currentRate = '0' + merged.currentRate;
                        enrichedRecipient.energy = merged;
                    }
                }
            } catch (e) { console.warn('[AI] Could not enrich recipient energy from accounts (logAll)', e); }

            console.group('[AI][LogAll] Starting batch');
            for (const p of prompts) {
                // Include transcript and randomized styles for logging as well
                const styleOptions2 = ['hook_question','value_bullets','proof_point','risk_focus','timeline_focus'];
                const subjStyles2 = ['question','curiosity','metric','time_sensitive','pain_point','proof_point'];
                const payload = { prompt: p, mode, recipient: enrichedRecipient, to: toInput?.value || '', style: styleOptions2[Math.floor(Math.random() * styleOptions2.length)], subjectStyle: subjStyles2[Math.floor(Math.random() * subjStyles2.length)], subjectSeed: `${Date.now()}_${Math.random().toString(36).slice(2,8)}` };
                try {
                    const res = await fetch(genUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                    const data = await res.json().catch(() => null);
                    const output = data?.output || '';
                    const formatted = this.formatGeneratedEmail(output, recipient, mode);
                    let html = formatted.html;
                    if (p.toLowerCase().includes('warm intro')) {
                        html = this.adjustWarmIntroHtml(html);
                    }
                    html = this.replaceVariablesInHtml(html, enrichedRecipient);
                    const subjectImproved = (this.improveSubject(formatted.subject, enrichedRecipient) || formatted.subject || '').trim();
                    const energy = enrichedRecipient?.energy || {};
                    const log = {
                        prompt: p,
                        style: payload.style,
                        subjectStyle: payload.subjectStyle,
                        subject: subjectImproved,
                        energy: { supplier: energy.supplier || '', currentRate: energy.currentRate || '', contractEnd: energy.contractEnd || '' },
                        preview: String(output).slice(0, 300),
                        date: new Date().toISOString()
                    };
                    console.log('[AI][BatchLog]', log);
                } catch (err) {
                    console.warn('[AI][LogAll] Failed for prompt:', p, err);
                }
            }
            console.groupEnd();
        } catch (e) {
            console.error('[AI][LogAll] Unexpected error', e);
        }
    }

    escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    // Clean up incomplete sentences and HTML entities in the editor
    cleanupIncompleteSentences(editor) {
        try {
            if (!editor) return;
            
            // Fix HTML entities
            const htmlContent = editor.innerHTML;
            const cleaned = htmlContent
                .replace(/&#39;/g, "'")
                .replace(/&apos;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>');
            
            if (cleaned !== htmlContent) {
                editor.innerHTML = cleaned;
            }
            
            // Fix incomplete sentences ending with "your?" or similar
            const paragraphs = editor.querySelectorAll('p');
            paragraphs.forEach(p => {
                const text = p.textContent || '';
                if (text.trim().endsWith('your?') || text.trim().endsWith('your')) {
                    // Try to complete the sentence based on context
                    if (text.includes('improving your')) {
                        p.textContent = text.replace(/improving your\??$/, 'improving your energy procurement process.');
                    } else if (text.includes('discuss your')) {
                        p.textContent = text.replace(/discuss your\??$/, 'discuss your specific energy needs.');
                    } else {
                        p.textContent = text.replace(/your\??$/, 'your situation.');
                    }
                }
            });
        } catch (e) {
            console.warn('[AI] cleanupIncompleteSentences failed', e);
        }
    }

    // Post-insert DOM sanitizer: remove duplicate greetings/closings and placeholders
    sanitizeGeneratedEditor(editor, recipient) {
        try {
            if (!editor) return;
            
            // CRITICAL: Extract and preserve signature BEFORE any modifications
            const signatureDiv = editor.querySelector('[data-signature="true"]') || 
                                 Array.from(editor.querySelectorAll('div')).find(div => 
                                   div.style.marginTop === '20px' && 
                                   div.style.paddingTop === '20px' &&
                                   (div.style.borderTop && div.style.borderTop.includes('1px solid'))
                                 );
            const savedSignature = signatureDiv ? signatureDiv.cloneNode(true) : null;
            
            const nameSource = (recipient?.fullName || recipient?.name || '').trim();
            const firstName = (nameSource.split(' ')[0] || '').trim() || 'there';
            
            // Clean up incomplete sentences and HTML entities
            this.cleanupIncompleteSentences(editor);
            const nameEsc = firstName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const isGreeting = (t) => {
                const s = String(t || '').trim();
                return new RegExp(`^\\s*(hi|hello|hey)(?:\\s+${nameEsc})?\\s*[,!-]?\\s*$`, 'i').test(s);
            };
            const normalizeGreeting = () => `Hi ${firstName},`;
            const isClosing = (t) => {
                const s = String(t || '').toLowerCase().replace(/\s+/g,' ').trim().replace(/[.,!;:]+$/,'');
                return s.startsWith('best regards') || s === 'regards' || s.startsWith('kind regards') || s.startsWith('warm regards') || s === 'sincerely' || s === 'thanks' || s === 'thank you' || s === 'cheers';
            };
            const isPlaceholder = (t) => /\[\s*(your\s+name|your\s+title|your\s+contact\s*information)\s*\]/i.test(String(t || ''));
            const isSignature = (el) => {
                return el.hasAttribute('data-signature') || 
                       (el.tagName === 'DIV' && 
                        el.style.marginTop === '20px' && 
                        el.style.paddingTop === '20px' &&
                        (el.style.borderTop && el.style.borderTop.includes('1px solid')));
            };

            const ps = Array.from(editor.querySelectorAll('p'));
            if (!ps.length) return;

            // Ensure first paragraph is a single normalized greeting
            let greetingPlaced = false;
            for (let i = 0; i < ps.length; i++) {
                const t = ps[i].textContent || '';
                if (isGreeting(t)) {
                    if (!greetingPlaced) {
                        // Move/normalize the first greeting to be the first paragraph
                        ps[i].textContent = normalizeGreeting();
                        if (i !== 0) editor.insertBefore(ps[i], editor.firstChild);
                        greetingPlaced = true;
                    } else {
                        ps[i].remove();
                    }
                }
            }
            // If no greeting at all, prepend one
            if (!greetingPlaced) {
                const p = document.createElement('p');
                p.textContent = normalizeGreeting();
                editor.insertBefore(p, editor.firstChild);
            }

            // Recompute paragraphs
            let paras = Array.from(editor.querySelectorAll('p'));

            // Remove placeholder lines
            paras.forEach(p => {
                const t = p.textContent || '';
                if (isPlaceholder(t)) p.remove();
            });

            // Remove any standalone sender chips above the closing (lines that contain only sender name chips)
            Array.from(editor.querySelectorAll('p')).forEach(p => {
                const chips = Array.from(p.querySelectorAll('.var-chip[data-var^="sender."]'));
                if (chips.length) {
                    const clone = p.cloneNode(true);
                    clone.querySelectorAll('.var-chip').forEach(c => c.remove());
                    const residual = clone.textContent.trim();
                    if (!residual) p.remove();
                }
            });

            // Remove all closings and placeholders anywhere
            Array.from(editor.querySelectorAll('p')).forEach(p => {
                const t = p.textContent || '';
                if (isClosing(t) || isPlaceholder(t)) p.remove();
            });

            // Remove any sender.name chips entirely; we'll use sender.first_name
            editor.querySelectorAll('.var-chip[data-var="sender.name"]').forEach(el => el.remove());

            // Determine sender first name chip (if exists) to reuse; otherwise create one
            let senderChip = editor.querySelector('.var-chip[data-var="sender.first_name"]');
            if (senderChip) {
                senderChip = senderChip.cloneNode(true);
            } else {
                senderChip = document.createElement('span');
                senderChip.className = 'var-chip';
                senderChip.setAttribute('data-var', 'sender.first_name');
                senderChip.setAttribute('data-token', '{{sender.first_name}}');
                senderChip.setAttribute('contenteditable', 'false');
                senderChip.textContent = 'sender first name';
            }

            // Trim trailing blank paragraphs before appending closing (SKIP signature div)
            let last = editor.lastElementChild;
            while (last) {
                // SKIP if this is the signature div - don't remove it!
                if (isSignature(last)) {
                    break;
                }
                
                if (last.tagName === 'P') {
                    const txt = (last.textContent || '').replace(/\u00A0/g, ' ').trim();
                    const onlyBr = !txt && last.querySelectorAll('br').length > 0;
                    if (!txt || onlyBr) {
                        const toRemove = last;
                        last = last.previousElementSibling;
                        toRemove.remove();
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }

            // Append a clean closing block at the end on a tight stack: closing + name
            const pCloseName = document.createElement('p');
            pCloseName.appendChild(document.createTextNode('Best regards,'));
            pCloseName.appendChild(document.createElement('br'));
            pCloseName.appendChild(senderChip);
            editor.appendChild(pCloseName);

            // Remove empty paragraphs and collapse extra blanks (leave natural spacing to CSS)
            Array.from(editor.querySelectorAll('p')).forEach((p, idx, arr) => {
                const txt = (p.textContent || '').replace(/\u00A0/g, ' ').trim();
                if (!txt) p.remove();
            });
            
            // CRITICAL: Re-append the saved signature at the very end if it existed
            if (savedSignature) {
                // Remove any signature that might have been accidentally kept during processing
                const existingSig = editor.querySelector('[data-signature="true"]') || 
                                   Array.from(editor.querySelectorAll('div')).find(div => 
                                     div.style.marginTop === '20px' && 
                                     div.style.paddingTop === '20px' &&
                                     (div.style.borderTop && div.style.borderTop.includes('1px solid'))
                                   );
                if (existingSig) {
                    existingSig.remove();
                }
                editor.appendChild(savedSignature);
                console.log('[Signature] Preserved signature during AI generation');
            }
        } catch (e) {
            console.warn('sanitizeGeneratedEditor failed', e);
        }
    }

    // Extract signature from HTML using DOM parser (more reliable than regex)
    extractSignature(html) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            // Look for signature div by data attribute or style pattern
            const sigDiv = doc.querySelector('[data-signature="true"]') || 
                          Array.from(doc.querySelectorAll('div')).find(div => 
                            div.style.marginTop === '20px' && 
                            div.style.paddingTop === '20px' && 
                            (div.style.borderTop && div.style.borderTop.includes('1px solid'))
                          );
            return sigDiv ? sigDiv.outerHTML : null;
        } catch (e) {
            console.warn('[Email] extractSignature failed:', e);
            return null;
        }
    }

    // Ensure signature block is after the standardized closing lines
    moveSignatureToEnd(editor) {
        try {
            if (!editor) return;
            
            // Extract signature using DOM parser
            const signature = this.extractSignature(editor.innerHTML);
            if (!signature) {
                console.log('[Signature] No signature found to move');
                return; // no signature present - don't do anything
            }
            
            // Create a temporary div to work with
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = editor.innerHTML;
            
            // Remove signature from temp div
            const sigDiv = tempDiv.querySelector('[data-signature="true"]') || 
                          Array.from(tempDiv.querySelectorAll('div')).find(div => 
                            div.style.marginTop === '20px' && 
                            div.style.paddingTop === '20px' &&
                            (div.style.borderTop && div.style.borderTop.includes('1px solid'))
                          );
            if (sigDiv) {
                sigDiv.remove();
            }
            
            // Remove empty paragraphs from temp div (but not signature)
            Array.from(tempDiv.querySelectorAll('p')).forEach(p => {
                const t = (p.textContent || '').replace(/\u00A0/g, ' ').trim();
                if (!t) p.remove();
            });
            
            // Reconstruct: content + signature
            editor.innerHTML = tempDiv.innerHTML + signature;
            console.log('[Signature] Moved signature to end');
            
        } catch (e) {
            console.warn('[Email] moveSignatureToEnd failed', e);
        }
    }

    startGeneratingAnimation(composeWindow) {
        if (!composeWindow) return;
        const editor = composeWindow.querySelector('.body-input');
        const subject = composeWindow.querySelector('#compose-subject');
        editor?.classList.add('is-loading');
        subject?.classList.add('is-loading');
    }

    stopGeneratingAnimation(composeWindow) {
        if (!composeWindow) return;
        const editor = composeWindow.querySelector('.body-input');
        const subject = composeWindow.querySelector('#compose-subject');
        editor?.classList.remove('is-loading');
        subject?.classList.remove('is-loading');
    }

    // Recipient autocomplete for #compose-to
    initRecipientAutocomplete(composeWindow) {
        const input = composeWindow.querySelector('#compose-to');
        const panel = composeWindow.querySelector('#compose-to-suggestions') || composeWindow.querySelector('.recipient-suggestions');
        console.log('[ComposeAutocomplete] initRecipientAutocomplete start', { composeWindow: !!composeWindow, input: !!input, panel: !!panel });
        if (!input || !panel) {
            console.warn('[ComposeAutocomplete] Missing input or panel');
            return;
        }
        let timer = null;
        const waitForFirebase = async (maxMs = 4000) => {
            const t0 = Date.now();
            while (!window.firebaseDB && (Date.now() - t0) < maxMs) {
                await new Promise(r => setTimeout(r, 100));
            }
            const ready = !!window.firebaseDB;
            console.log('[ComposeAutocomplete] Firebase ready?', ready, 'after', Date.now() - t0, 'ms');
            return ready;
        };
        const closePanel = () => { panel.hidden = true; input.setAttribute('aria-expanded', 'false'); };
        const openPanel = () => { 
            panel.hidden = false; 
            input.setAttribute('aria-expanded', 'true');
        };
        const render = (items=[]) => {
            // refresh index for quick lookup on selection
            this._composePeopleById = new Map();
            items.forEach(p => { if (p && (p.id || p.data?.id)) this._composePeopleById.set(p.id || p.data?.id, p); });
            if (!items.length) { panel.innerHTML = '<div class="suggestion-empty">No matches</div>'; return; }
            panel.innerHTML = items.map(p => {
                const name = p.full_name || p.fullName || p.name || `${p.first_name || p.firstName || ''} ${p.last_name || p.lastName || ''}`.trim();
                const email = p.email || p.primaryEmail || '';
                const company = (p.company || p.accountName || '')
                return `<div class="suggestion-item" role="option" data-id="${p.id || p.data?.id || ''}" data-email="${email}" data-name="${name}">
                    <div class="sugg-main">${name ? name : email}</div>
                    <div class="sugg-sub">${email}${company ? ' • ' + company : ''}</div>
                </div>`;
            }).join('');
            console.log('[ComposeAutocomplete] render count:', items.length);
        };
        const searchRun = async (q) => {
            console.log('[ComposeAutocomplete] searchRun query:', q);
            await waitForFirebase();
            const list = await this.fetchContactsForCompose(q);
            console.log('[ComposeAutocomplete] results length:', list.length);
            render(list.slice(0, 8));
            openPanel();
        };
        const debounce = (fn, ms=200) => { return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); }; };
        const onInput = debounce((val) => { console.log('[ComposeAutocomplete] input event val:', val); searchRun(String(val || '').trim()); }, 180);
        input.addEventListener('input', (e) => { onInput(e.target.value); });
        input.addEventListener('focus', () => { console.log('[ComposeAutocomplete] focus event'); searchRun(input.value || ''); });
        
        // Close when clicking anywhere outside the input or panel
        const onDocPointerDown = (evt) => {
            if (!panel.contains(evt.target) && evt.target !== input) {
                console.log('[ComposeAutocomplete] pointerdown outside - closing panel');
                closePanel();
            }
        };
        document.addEventListener('pointerdown', onDocPointerDown, true);
        document.addEventListener('click', (evt) => {
            if (!panel.contains(evt.target) && evt.target !== input) {
                console.log('[ComposeAutocomplete] doc click closing panel');
                closePanel();
            }
        }, true);
        
        // Close on blur (allow click on a suggestion first)
        input.addEventListener('blur', () => {
            setTimeout(() => {
                const active = document.activeElement;
                if (!panel.contains(active)) {
                    console.log('[ComposeAutocomplete] input blur - closing panel');
                    closePanel();
                }
            }, 100);
        });
        
        // Close on Escape
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                closePanel();
            }
        });
        
        const selectRow = (row) => {
            if (!row) return;
            const emailFromText = (() => {
                const sub = row.querySelector('.sugg-sub')?.textContent || '';
                const main = row.querySelector('.sugg-main')?.textContent || '';
                const match = (sub + ' ' + main).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
                return match ? match[0] : '';
            })();
            const nameFromText = (row.querySelector('.sugg-main')?.textContent || '').trim();
            const name = row.getAttribute('data-name') || nameFromText || '';
            const email = row.getAttribute('data-email') || emailFromText || '';
            const id = row.getAttribute('data-id') || '';
            // Populate with email only as requested
            input.value = email || name;
            const person = this._composePeopleById.get(id) || {};
            // Try to find associated account by explicit id or name/domain match
            const accounts = (typeof window.getAccountsData === 'function') ? (window.getAccountsData() || []) : [];
            const personAccountId = person.accountId || person.account_id || person.companyId || person.company_id || '';
            const personCompany = person.company || person.companyName || person.accountName || (name?.split(' at ')[1]) || '';
            const personDomain = (email || '').split('@')[1]?.toLowerCase() || '';
            let account = null;
            if (personAccountId) {
                account = accounts.find(a => String(a.id || '') === String(personAccountId)) || null;
            }
            if (!account && personCompany) {
                const cmp = String(personCompany).toLowerCase().trim();
                account = accounts.find(a => String(a.accountName || a.name || a.companyName || '').toLowerCase().trim() === cmp) || null;
            }
            if (!account && personDomain) {
                account = accounts.find(a => {
                    const d = String(a.domain || a.website || '').toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
                    return d && personDomain.endsWith(d);
                }) || null;
            }
            // Build a rich recipient context object
            this._selectedRecipient = {
                id,
                name,
                email,
                firstName: person.firstName || person.first_name || (name?.split(' ')[0]) || '',
                lastName: person.lastName || person.last_name || '',
                fullName: person.fullName || person.full_name || name || '',
                company: person.company || person.companyName || person.accountName || (account?.accountName || account?.name || account?.companyName) || '',
                title: person.title || person.jobTitle || person.role || '',
                industry: person.industry || person.sector || account?.industry || '',
                // Use non-specific facility size; exact sqft will not be echoed by AI
                squareFootage: person.squareFootage || person.square_footage || person.buildingSize || person.sqft || account?.squareFootage || account?.sqft || account?.square_feet || '',
                energy: {
                    usage: person.energyUsage || person.annualUsage || person.annual_kwh || person.kwh || account?.annualUsage || account?.annual_kwh || account?.kwh || '',
                    supplier: person.energySupplier || person.supplier || person.contractSupplier || account?.electricitySupplier || account?.supplier || '',
                    currentRate: person.currentRate || person.rate || account?.currentRate || account?.rate || '',
                    contractEnd: person.contractEnd || person.contract_end || person.contractEndDate || account?.contractEndDate || account?.contractEnd || account?.contract_end_date || ''
                },
                notes: person.notes || person.note || '',
                account: account ? {
                    id: account.id,
                    name: account.accountName || account.name || account.companyName || '',
                    industry: account.industry || '',
                    domain: account.domain || account.website || '',
                    notes: account.notes || account.note || '',
                    energy: {
                        supplier: account.electricitySupplier || account.supplier || '',
                        currentRate: account.currentRate || account.rate || '',
                        usage: account.annual_kwh || account.kwh || '',
                        contractEnd: account.contractEndDate || account.contractEnd || account.contract_end_date || ''
                    }
                } : null,
                linkedin: person.linkedin || person.linkedinUrl || person.linkedin_url || person.linkedIn || ''
            };
            console.log('[ComposeAutocomplete] selected', this._selectedRecipient);
            // Notify listeners that the input changed
            input.dispatchEvent(new Event('input', { bubbles: true }));
            // Keep focus on input for continued typing
            setTimeout(() => input.focus(), 0);
            closePanel();
        };

        // Use pointerdown/mousedown (capture) to select before input blur closes panel
        panel.addEventListener('pointerdown', (evt) => {
            const row = evt.target.closest('.suggestion-item');
            if (!row) return;
            evt.preventDefault();
            evt.stopPropagation();
            selectRow(row);
        }, true);

        // Mouse fallback
        panel.addEventListener('mousedown', (evt) => {
            const row = evt.target.closest('.suggestion-item');
            if (!row) return;
            evt.preventDefault(); // prevent focus shift until we've handled selection
            selectRow(row);
        }, true);

        // Fallback on click as well
        panel.addEventListener('click', (evt) => {
            const row = evt.target.closest('.suggestion-item');
            if (!row) return;
            selectRow(row);
        });
    }

    async fetchContactsForCompose(query) {
        try {
            if (!window.firebaseDB) return [];
            const q = String(query || '').toLowerCase().trim();
            // Prefer 'contacts' to mirror global-search, fallback to 'people'
            let snap;
            let usedCollection = 'contacts';
            try { snap = await window.firebaseDB.collection('contacts').get(); }
            catch { usedCollection = 'people'; snap = await window.firebaseDB.collection('people').get(); }

            console.log('[ComposeAutocomplete] querying collection:', usedCollection, 'size:', snap?.size);
            const results = [];
            snap.forEach(doc => {
                const person = { id: doc.id, ...(doc.data ? doc.data() : {}) };
                const nameFields = [
                    person.firstName || person.first_name || '',
                    person.lastName || person.last_name || '',
                    person.fullName || person.full_name || '',
                    person.name || ''
                ];
                const titleFields = [person.title || person.jobTitle || ''];
                const companyFields = [person.company || person.companyName || person.accountName || ''];
                const extraFields = [person.email || '', person.city || '', person.state || ''];
                const searchableText = [...nameFields, ...titleFields, ...companyFields, ...extraFields]
                    .join(' ').toLowerCase();

                // Match strategy mirrors global-search
                let match = false;
                if (!q) match = true; // allow empty to show top suggestions
                else if (searchableText.includes(q)) match = true;
                else if (person.fullName) {
                    const parts = String(person.fullName).toLowerCase().split(' ');
                    if (parts.some(p => p && q.includes(p))) match = true;
                }
                if (match) results.push(person);
            });
            console.log('[ComposeAutocomplete] matched results:', results.length);

            // Basic sort: prioritize items whose name/email starts with query
            const startsWith = (s, q) => (s || '').toLowerCase().startsWith(q);
            results.sort((a, b) => {
                if (!q) return ((a.fullName || a.name || '').localeCompare(b.fullName || b.name || ''));
                const aScore = (startsWith(a.fullName || a.name || '', q) ? -2 : 0) + (startsWith(a.email || '', q) ? -1 : 0);
                const bScore = (startsWith(b.fullName || b.name || '', q) ? -2 : 0) + (startsWith(b.email || '', q) ? -1 : 0);
                if (aScore !== bScore) return aScore - bScore;
                return (a.fullName || a.name || '').localeCompare(b.fullName || b.name || '');
            });

            return results;
        } catch (e) {
            console.warn('[ComposeAutocomplete] fetchContactsForCompose failed; returning []', e);
            return [];
        }
    }

    // Lookup contact by email and enrich with account details
    async lookupPersonByEmail(email) {
        try {
            const e = String(email || '').trim().toLowerCase();
            if (!e || !window.firebaseDB) return null;
            let snap;
            try {
                snap = await window.firebaseDB.collection('contacts').where('email', '==', e).limit(1).get();
            } catch (_) {
                snap = null;
            }
            if (!snap || snap.empty) {
                try {
                    snap = await window.firebaseDB.collection('people').where('email', '==', e).limit(1).get();
                } catch (_) {
                    snap = null;
                }
            }
            if (!snap || snap.empty) return null;
            const doc = snap.docs[0];
            const person = { id: doc.id, ...(doc.data ? doc.data() : {}) };
            // Attempt to match an account
            const accounts = (typeof window.getAccountsData === 'function') ? (window.getAccountsData() || []) : [];
            let account = null;
            const personAccountId = person.accountId || person.account_id || person.companyId || person.company_id || '';
            const personCompany = person.company || person.companyName || person.accountName || '';
            const personDomain = e.split('@')[1] || '';
            if (personAccountId) {
                account = accounts.find(a => String(a.id || '') === String(personAccountId)) || null;
            }
            if (!account && personCompany) {
                const cmp = String(personCompany).toLowerCase().trim();
                account = accounts.find(a => String(a.accountName || a.name || a.companyName || '').toLowerCase().trim() === cmp) || null;
            }
            if (!account && personDomain) {
                account = accounts.find(a => {
                    const d = String(a.domain || a.website || '').toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
                    return d && personDomain.endsWith(d);
                }) || null;
            }
            return {
                id: person.id,
                name: person.fullName || person.name || `${person.firstName || person.first_name || ''} ${person.lastName || person.last_name || ''}`.trim(),
                fullName: person.fullName || person.full_name || '',
                firstName: person.firstName || person.first_name || '',
                lastName: person.lastName || person.last_name || '',
                email: e,
                company: person.company || person.companyName || person.accountName || (account?.accountName || account?.name || account?.companyName) || '',
                title: person.title || person.jobTitle || person.role || '',
                industry: person.industry || person.sector || account?.industry || '',
                energy: {
                    usage: person.energyUsage || person.annual_kwh || person.kwh || account?.annual_kwh || account?.kwh || '',
                    supplier: person.energySupplier || person.supplier || person.contractSupplier || account?.electricitySupplier || account?.supplier || '',
                    currentRate: person.currentRate || person.rate || account?.currentRate || account?.rate || '',
                    contractEnd: person.contractEnd || person.contract_end || person.contractEndDate || account?.contractEndDate || account?.contractEnd || account?.contract_end_date || ''
                },
                account: account ? {
                    id: account.id,
                    name: account.accountName || account.name || account.companyName || '',
                    industry: account.industry || '',
                    domain: account.domain || account.website || '',
                    city: account.city || account.billingCity || account.locationCity || '',
                    state: account.state || account.billingState || account.region || ''
                } : null
            };
        } catch (e) {
            console.warn('[Compose] lookupPersonByEmail failed', e);
            return null;
        }
    }

    setPreviewButtonIcon(btn, mode) {
        if (!btn) return;
        const eye = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
        const pencil = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>';
        btn.innerHTML = mode === 'editor' ? pencil : eye;
    }

    getHtmlSource(editor) {
        const clone = editor.cloneNode(true);
        // Replace chips with their tokens so raw HTML is meaningful
        clone.querySelectorAll('.var-chip').forEach(chip => {
            const token = chip.getAttribute('data-token') || chip.getAttribute('data-var') || '';
            const text = document.createTextNode(token);
            chip.parentNode.replaceChild(text, chip);
        });
        return clone.innerHTML;
    }

    toggleHtmlMode(composeWindow) {
        if (!composeWindow) return;
        const editor = composeWindow.querySelector('.body-input');
        const codeBtn = composeWindow.querySelector('.editor-toolbar [data-action="code"]');
        if (!editor || !codeBtn) return;
        this._isHtmlMode = !this._isHtmlMode;
        if (this._isHtmlMode) {
            // Enter HTML mode: show raw HTML
            const html = this.getHtmlSource(editor);
            editor.setAttribute('data-mode', 'html');
            editor.textContent = html;
            codeBtn.classList.add('is-active');
            codeBtn.setAttribute('aria-pressed', 'true');
            codeBtn.setAttribute('title', 'Exit HTML mode');
        } else {
            // Exit HTML mode: render HTML
            const raw = editor.textContent || '';
            editor.removeAttribute('data-mode');
            editor.innerHTML = raw;
            // Convert tokens back into chips
            this.normalizeVariablesInEditor(editor);
            codeBtn.classList.remove('is-active');
            codeBtn.setAttribute('aria-pressed', 'false');
            codeBtn.setAttribute('title', 'Edit raw HTML');
        }
    }

    // Insert a neutral, transparent span at the caret to ensure future typing has no carry-over styles
    ensurePlainTypingContext(editor, reason = 'neutral') {
        try {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) {
                console.log(`[DBG] ensurePlainTypingContext(${reason}): no selection`);
                return;
            }
            const range = sel.getRangeAt(0);
            if (!range.collapsed) {
                console.log(`[DBG] ensurePlainTypingContext(${reason}): collapsing selection to end`);
                range.collapse(false);
            }
            const span = document.createElement('span');
            span.setAttribute('data-format-breaker', reason);
            span.setAttribute('style', 'background-color: transparent; color: var(--text-primary);');
            span.appendChild(document.createTextNode('\u200C'));
            range.insertNode(span);
            // Move caret inside after the ZWNJ so typing begins plain
            const newRange = document.createRange();
            newRange.setStart(span.firstChild, 1);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
            console.log(`[DBG] ensurePlainTypingContext(${reason}): inserted breaker span and moved caret`);
        } catch (e) {
            console.warn('ensurePlainTypingContext failed', e);
        }
    }

    async init() {
        try {
            console.log('EmailManager: Starting initialization...');
            await this.loadGIS();
            this.bindEvents();
            this.updateUI();
            console.log('EmailManager: Initialization complete');
        } catch (error) {
            console.error('Email manager initialization failed:', error);
            this.showAuthPrompt();
        }
    }

    updateUI() {
        // Always load emails - no need for auth prompt since we use tracking system
        this.loadEmails();
        // Update folder counts after a brief delay to let data load
        setTimeout(() => this.updateFolderCounts(), 1000);
    }

    saveAuthState() {
        try {
            const authState = {
                accessToken: this.accessToken,
                isAuthenticated: this.isAuthenticated,
                timestamp: Date.now()
            };
            localStorage.setItem('gmail_auth_state', JSON.stringify(authState));
            console.log('[Auth] Auth state saved to localStorage');
        } catch (error) {
            console.warn('[Auth] Failed to save auth state:', error);
        }
    }

    restoreAuthState() {
        try {
            const savedState = localStorage.getItem('gmail_auth_state');
            if (savedState) {
                const authState = JSON.parse(savedState);
                const now = Date.now();
                const tokenAge = now - authState.timestamp;
                
                // Check if token is less than 1 hour old (Gmail tokens typically last 1 hour)
                if (tokenAge < 3600000 && authState.accessToken) {
                    this.accessToken = authState.accessToken;
                    this.isAuthenticated = authState.isAuthenticated;
                    console.log('[Auth] Auth state restored from localStorage');
                    return true;
                } else {
                    console.log('[Auth] Token expired, clearing saved state');
                    localStorage.removeItem('gmail_auth_state');
                }
            }
        } catch (error) {
            console.warn('[Auth] Failed to restore auth state:', error);
            localStorage.removeItem('gmail_auth_state');
        }
        return false;
    }

    logout() {
        this.accessToken = null;
        this.isAuthenticated = false;
        localStorage.removeItem('gmail_auth_state');
        console.log('[Auth] Logged out and cleared auth state');
        this.showAuthPrompt();
    }

    async loadGIS() {
        // Check for existing token first
        this.restoreAuthState();
        
        // Load Google Identity Services script and initialize token client
        return new Promise((resolve, reject) => {
            if (window.google && window.google.accounts && window.google.accounts.oauth2) {
                this.tokenClient = window.google.accounts.oauth2.initTokenClient({
                    client_id: this.CLIENT_ID,
                    scope: this.SCOPES,
                    callback: (tokenResponse) => {
                        if (tokenResponse && tokenResponse.access_token) {
                            this.accessToken = tokenResponse.access_token;
                            this.isAuthenticated = true;
                            this.saveAuthState();
                        }
                    },
                });
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            script.onload = () => {
                try {
                    this.tokenClient = window.google.accounts.oauth2.initTokenClient({
                        client_id: this.CLIENT_ID,
                        scope: this.SCOPES,
                        callback: (tokenResponse) => {
                            if (tokenResponse && tokenResponse.access_token) {
                                this.accessToken = tokenResponse.access_token;
                                this.isAuthenticated = true;
                                this.saveAuthState();
                            }
                        },
                    });
                        resolve();
                } catch (e) { reject(e); }
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
        // SendGrid doesn't require client-side authentication
        // The API key is handled server-side
        this.isAuthenticated = true;
        return true;
    }

    showAuthPrompt() {
        // Don't show the "Email Ready" screen - just load emails automatically
        this.loadEmails();
    }

    async authenticate() {
        if (!this.tokenClient) {
            window.crm?.showToast('Google Identity Services not loaded. Please refresh.');
            return;
        }
        try {
            console.log('Starting Google authentication (GIS)...');
            console.log('[Auth] Current auth state:', { 
                isAuthenticated: this.isAuthenticated, 
                hasAccessToken: !!this.accessToken 
            });
            
            await new Promise((resolve) => {
                // Store the original callback
                const originalCallback = this.tokenClient.callback;
                
                // Set a temporary callback for this authentication attempt
                this.tokenClient.callback = (resp) => {
                    console.log('[Auth] Token response received:', { 
                        hasToken: !!resp?.access_token,
                        tokenLength: resp?.access_token?.length 
                    });
                    
                    if (resp && resp.access_token) {
                        this.accessToken = resp.access_token;
                        this.isAuthenticated = true;
                        this.saveAuthState();
                        console.log('[Auth] Authentication successful');
                        resolve();
                    } else {
                        console.log('[Auth] No access token received');
                        resolve();
                    }
                };
                
                this.tokenClient.requestAccessToken({ prompt: this.accessToken ? '' : 'consent' });
            });
            
            if (this.isAuthenticated) {
                console.log('[Auth] Loading emails after successful authentication');
            await this.loadEmails();
            window.crm?.showToast('Successfully connected to Gmail!');
            } else {
                console.log('[Auth] Authentication was cancelled or failed');
                window.crm?.showToast('Google authentication was cancelled.');
            }
        } catch (error) {
            console.error('Authentication failed:', error);
            window.crm?.showToast('Failed to authenticate with Google.');
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
        // Handle sent folder - load from Firebase tracking data
        if (this.currentFolder === 'sent') {
            await this.loadSentEmails();
            return;
        }

        // For inbox and other folders, use SendGrid data from Firebase
        this.showLoading();

        try {
            if (window.emailTrackingManager) {
                console.log('[EmailManager] Loading emails from SendGrid data...');
                
                if (this.currentFolder === 'threads') {
                    // Clear previous emails to prevent showing stale data
                    this.emails = [];
                    const emailList = document.getElementById('email-list');
                    if (emailList) emailList.innerHTML = '';
                    
                    // Load conversation threads and render thread list
                    const threads = await window.emailTrackingManager.getConversationThreads();
                    console.log('[EmailManager] Retrieved threads:', threads.length);
                    this.renderConversationThreads(threads);
                    const countEl = document.getElementById('threads-count');
                    if (countEl) countEl.textContent = String(threads.length);
                    this.hideLoading();
                } else {
                    // Load all emails then filter
                    const allEmails = await window.emailTrackingManager.getAllEmails();
                    console.log('[EmailManager] Retrieved all emails:', allEmails.length);
                    
                    // Filter by folder
                    let filteredEmails = allEmails;
                    if (this.currentFolder === 'inbox') {
                        // Show only received emails
                        filteredEmails = allEmails.filter(email => {
                            if (email.emailType === 'sent' || email.isSentEmail || email.type === 'sent') {
                                return false;
                            }
                            return true;
                        });
                    } else if (this.currentFolder === 'starred') {
                        // Show only starred emails
                        filteredEmails = allEmails.filter(email => email.starred === true);
                    } else if (this.currentFolder === 'important') {
                        // Show only important emails
                        filteredEmails = allEmails.filter(email => email.important === true);
                    } else if (this.currentFolder === 'drafts') {
                        // Show only draft emails
                        filteredEmails = allEmails.filter(email => email.status === 'draft');
                    } else if (this.currentFolder === 'spam') {
                        // Show only spam emails
                        filteredEmails = allEmails.filter(email => 
                            (email.labels && email.labels.includes('SPAM')) || email.isSpam === true
                        );
                    } else if (this.currentFolder === 'trash') {
                        // Show only trashed emails
                        filteredEmails = allEmails.filter(email => 
                            (email.labels && email.labels.includes('TRASH')) || email.isDeleted === true
                        );
                    } else if (this.currentFolder === 'scheduled') {
                        // Show only scheduled emails
                        filteredEmails = allEmails.filter(email => 
                            (email.labels && email.labels.includes('SCHEDULED')) || email.scheduledAt
                        );
                    } else if (this.currentFolder === 'sent') {
                        // This is handled separately in loadEmails, but add fallback
                        filteredEmails = allEmails.filter(email => 
                            email.emailType === 'sent' || email.isSentEmail || email.type === 'sent'
                        );
                    }
                    
                    this.emails = filteredEmails.map(email => this.parseSentEmailData(email));
                    console.log('[EmailManager] Parsed emails for', this.currentFolder, ':', this.emails.length);
                    this.renderEmails();
                    this.updateFolderCounts();
                    this.hideLoading();
                }
            } else {
                console.warn('[EmailManager] Email tracking manager not available');
                // Retry with exponential backoff up to ~2s
                const start = Date.now();
                const tryLater = async () => {
                    if (window.emailTrackingManager || Date.now() - start > 2000) {
                        if (window.emailTrackingManager) {
                            return this.loadEmails();
                        }
                        this.emails = [];
                        this.showEmptyState();
                        return;
                    }
                    setTimeout(tryLater, 160);
                };
                await tryLater();
            }
        } catch (error) {
            console.error('Error loading emails:', error);
            window.crm?.showToast('Failed to load emails. Please try again.');
            this.showEmptyState();
        }
    }

    async loadSentEmails() {
        this.showLoading();

        try {
            if (window.emailTrackingManager) {
                console.log('[EmailManager] Loading sent emails...');
                
                // Set up real-time listener for sent emails
                if (!this.sentEmailsListener) {
                    this.sentEmailsListener = await window.emailTrackingManager.getSentEmails((sentEmails) => {
                        try {
                            console.log('[EmailManager] Real-time update - Retrieved sent emails:', sentEmails.length);
                            this.emails = sentEmails.map(email => this.parseSentEmailData(email));
                            console.log('[EmailManager] Real-time update - Parsed emails:', this.emails.length);
                            this.renderEmails();
                            this.updateFolderCounts();
                            this.hideLoading();
                        } catch (error) {
                            console.error('[EmailManager] Real-time update error:', error);
                        }
                    });
                } else {
                    // Fallback to one-time fetch if listener already exists
                    const sentEmails = await window.emailTrackingManager.getSentEmails();
                    console.log('[EmailManager] Retrieved sent emails:', sentEmails.length);
                    this.emails = sentEmails.map(email => this.parseSentEmailData(email));
                    console.log('[EmailManager] Parsed emails:', this.emails.length);
                    this.renderEmails();
                    this.updateFolderCounts();
                }
            } else {
                console.warn('[EmailManager] Email tracking manager not available');
                this.emails = [];
                this.showEmptyState();
            }
        } catch (error) {
            console.error('Error loading sent emails:', error);
            window.crm?.showToast('Failed to load sent emails. Please try again.');
            this.showEmptyState();
        }
    }

    parseSentEmailData(emailData) {
        // Fix date formatting issue - handle both sent and received emails
        let dateObj = null;
        try {
            // Try multiple date fields (sentAt for sent, receivedAt for received, createdAt as fallback)
            const dateSource = emailData.sentAt || emailData.receivedAt || emailData.createdAt || emailData.timestamp;
            dateObj = new Date(dateSource);
            if (isNaN(dateObj.getTime())) {
                dateObj = new Date(); // Fallback to current time
            }
        } catch (error) {
            console.warn('[EmailManager] Date parsing error:', error);
            dateObj = new Date(); // Fallback to current time
        }

        // Determine if this is a sent or received email
        const inferredIsSent = (
            emailData.emailType === 'sent' ||
            emailData.type === 'sent' ||
            emailData.isSentEmail === true ||
            (typeof emailData.from === 'string' && emailData.from.includes('noreply@powerchoosers.com')) ||
            emailData.provider === 'sendgrid_outbound'
        );

        const computedEmailType = inferredIsSent ? 'sent' : (emailData.emailType || 'received');
        const computedStatus = inferredIsSent ? 'sent' : (emailData.status || 'received');

        return {
            id: emailData.id,
            from: emailData.from,
            to: Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to,
            subject: emailData.subject,
            snippet: this.stripHtml(emailData.originalContent || emailData.content || ''),
            // PRESERVE CONTENT FIELDS for SendGrid inbound emails
            text: emailData.text,
            html: emailData.html,
            content: emailData.content,
            originalContent: emailData.originalContent,
            date: dateObj, // Pass Date object instead of string
            timestamp: dateObj.getTime(),
            // Tracking data
            openCount: emailData.openCount || 0,
            replyCount: emailData.replyCount || 0,
            lastOpened: emailData.lastOpened,
            lastReplied: emailData.lastReplied,
            status: computedStatus,
            // Sent vs received computed for UI rendering
            isSentEmail: inferredIsSent,
            // Provider and type information
            provider: emailData.provider,
            type: emailData.type,
            emailType: computedEmailType,
            // Gmail API specific data
            sentVia: emailData.sentVia || 'simulation',
            gmailMessageId: emailData.gmailMessageId
        };
    }

    stripHtml(html) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }

    getEmailPreview(email) {
        // Try to get preview from various content fields
        let preview = '';
        
        // Priority order: snippet, text, html (stripped), content
        if (email.snippet && email.snippet.trim()) {
            preview = email.snippet;
        } else if (email.text && email.text.trim()) {
            preview = email.text;
        } else if (email.html && email.html.trim()) {
            preview = this.stripHtml(email.html);
        } else if (email.content && email.content.trim()) {
            preview = this.stripHtml(email.content);
        } else if (email.originalContent && email.originalContent.trim()) {
            preview = this.stripHtml(email.originalContent);
        }
        
        // Clean up the preview
        if (preview) {
            // Remove extra whitespace and newlines
            preview = preview.replace(/\s+/g, ' ').trim();
            // Limit length to reasonable preview size
            if (preview.length > 100) {
                preview = preview.substring(0, 100) + '...';
            }
        }
        
        return preview || 'No preview available';
    }

    renderTrackingIcons(email) {
        // Only show tracking icons for sent emails
        if (!email.isSentEmail) {
            return '';
        }

        const openCount = email.openCount || 0;
        const replyCount = email.replyCount || 0;
        const hasOpened = openCount > 0;
        const hasReplied = replyCount > 0;

        const gmailBadge = email.sentVia === 'gmail_api' ? 
            '<div class="gmail-badge" title="Sent via Gmail API">Gmail</div>' : '';

        return `
            <div class="email-tracking-icons">
                <div class="tracking-icon ${hasOpened ? 'opened' : 'not-opened'}" title="${hasOpened ? `Opened ${openCount} time${openCount !== 1 ? 's' : ''}` : 'Not opened'}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                    ${hasOpened ? `<span class="tracking-badge">${openCount}</span>` : ''}
                </div>
                <div class="tracking-icon ${hasReplied ? 'replied' : 'not-replied'}" title="${hasReplied ? `Replied ${replyCount} time${replyCount !== 1 ? 's' : ''}` : 'No reply'}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        <path d="M13 8H7"/>
                        <path d="M17 12H7"/>
                    </svg>
                    ${hasReplied ? `<span class="tracking-badge">${replyCount}</span>` : ''}
                </div>
                ${gmailBadge}
            </div>
        `;
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
        const loading = document.getElementById('email-loading');
        const empty = document.getElementById('email-empty');
        
        if (!emailList) return;

        emailCount.textContent = `${this.emails.length} email${this.emails.length !== 1 ? 's' : ''}`;

        if (this.emails.length === 0) {
            this.showEmptyState();
            return;
        }

        // Hide loading and empty states, show email list
        if (loading) loading.style.display = 'none';
        if (empty) empty.style.display = 'none';
        emailList.style.display = 'block';
        emailList.style.flexDirection = 'initial';

        emailList.innerHTML = this.emails.map(email => {
            try {
                return `
            <div class="email-item ${email.unread ? 'unread' : ''}" data-email-id="${email.id}">
                <input type="checkbox" class="email-item-checkbox" data-email-id="${email.id}">
                <button class="email-item-star ${email.starred ? 'starred' : ''}" data-email-id="${email.id}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="${email.starred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26 12,2"/>
                    </svg>
                </button>
                        <div class="email-item-sender">${this.extractName(email.from || 'Unknown')}</div>
                <div class="email-item-content">
                            <div class="email-item-subject">${Array.isArray(email.subject) ? email.subject[0] : (email.subject || 'No Subject')}</div>
                            <div class="email-item-preview">${this.getEmailPreview(email)}</div>
                </div>
                <div class="email-item-meta">
                    <div class="email-item-time">${this.formatDate(email.date)}</div>
                    ${email.important ? '<div class="email-attachment-icon">!</div>' : ''}
                            ${this.renderTrackingIcons(email)}
                </div>
            </div>
                `;
            } catch (error) {
                console.error('[EmailManager] Error rendering email:', email, error);
                return `<div class="email-item error" data-email-id="${email.id}">
                    <div class="email-item-content">
                        <div class="email-item-subject">Error loading email</div>
                        <div class="email-item-preview">Failed to render email data</div>
                    </div>
                </div>`;
            }
        }).join('');

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
        
        // Handle arrays (from SendGrid inbound emails)
        if (Array.isArray(fromHeader)) {
            fromHeader = fromHeader[0] || 'Unknown';
        }
        
        // Ensure it's a string
        if (typeof fromHeader !== 'string') {
            return 'Unknown';
        }
        
        const match = fromHeader.match(/^(.+?)\s*<.+>$/);
        return match ? match[1].replace(/"/g, '') : fromHeader.split('@')[0];
    }

    formatDate(date) {
        try {
            // Handle both Date objects and date strings
            const dateObj = date instanceof Date ? date : new Date(date);
            
            // Check if date is valid
            if (isNaN(dateObj.getTime())) {
                return 'Invalid date';
            }
            
        const now = new Date();
            const diff = now - dateObj;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        
        if (days === 0) {
                return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (days < 7) {
                return dateObj.toLocaleDateString([], { weekday: 'short' });
        } else {
                return dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
            }
        } catch (error) {
            console.warn('[EmailManager] Date formatting error:', error);
            return 'Unknown date';
        }
    }

    showLoading() {
        const emailList = document.getElementById('email-list');
        const loading = document.getElementById('email-loading');
        const empty = document.getElementById('email-empty');
        
        if (loading) loading.style.display = 'flex';
        if (empty) empty.style.display = 'none';
        if (emailList) {
            emailList.style.display = 'flex';
            emailList.style.flexDirection = 'column';
        }
    }

    hideLoading() {
        const loading = document.getElementById('email-loading');
        if (loading) loading.style.display = 'none';
    }

    showEmptyState() {
        const emailList = document.getElementById('email-list');
        const loading = document.getElementById('email-loading');
        const empty = document.getElementById('email-empty');
        
        if (loading) loading.style.display = 'none';
        if (empty) empty.style.display = 'flex';
        if (emailList) {
            emailList.style.display = 'flex';
            emailList.style.flexDirection = 'column';
            emailList.innerHTML = '';
        }
    }

    toggleSidebar() {
        const sidebar = document.getElementById('email-sidebar');
        this.sidebarCollapsed = !this.sidebarCollapsed;
        sidebar?.classList.toggle('collapsed', this.sidebarCollapsed);
    }

    switchFolder(folder) {
        // Clean up real-time listener if switching away from sent folder
        if (this.currentFolder === 'sent' && folder !== 'sent' && this.sentEmailsListener) {
            console.log('[EmailManager] Cleaning up sent emails listener');
            this.sentEmailsListener();
            this.sentEmailsListener = null;
        }
        
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

    async updateFolderCounts() {
        try {
            if (!window.emailTrackingManager) return;
            
            // Load ALL emails to get accurate counts
            const allEmails = await window.emailTrackingManager.getAllEmails();
            
            const counts = {
                inbox: allEmails.filter(e => {
                    if (e.emailType === 'sent' || e.isSentEmail || e.type === 'sent') return false;
                    return true;
                }).length,
                starred: allEmails.filter(e => e.starred === true).length,
                important: allEmails.filter(e => e.important === true).length,
                sent: allEmails.filter(e => e.emailType === 'sent' || e.isSentEmail || e.type === 'sent').length,
                drafts: allEmails.filter(e => e.status === 'draft').length,
                scheduled: allEmails.filter(e => (e.labels && e.labels.includes('SCHEDULED')) || e.scheduledAt).length,
                spam: allEmails.filter(e => (e.labels && e.labels.includes('SPAM')) || e.isSpam === true).length,
                trash: allEmails.filter(e => (e.labels && e.labels.includes('TRASH')) || e.isDeleted === true).length
            };

            Object.entries(counts).forEach(([folder, count]) => {
                const countElement = document.getElementById(`${folder}-count`);
                if (countElement) countElement.textContent = count;
            });
            
            console.log('[EmailManager] Folder counts updated:', counts);
        } catch (error) {
            console.error('[EmailManager] Error updating folder counts:', error);
        }
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
        this.openComposeWindow();
    }

    openComposeWindow() {
        const composeWindow = document.getElementById('compose-window');
        if (!composeWindow) return;

        // Always start fresh on open
        this.resetComposeWindow();

        // Show the window and add open class for animation
        composeWindow.style.display = 'flex';
        setTimeout(() => {
            composeWindow.classList.add('open');
        }, 10);

        // Focus on the To field
        const toInput = document.getElementById('compose-to');
        if (toInput) {
            setTimeout(() => toInput.focus(), 300);
        }

        // Initialize compose window functionality
        this.initializeComposeWindow();
    }

    // Reset all compose UI state to a clean slate
    resetComposeWindow() {
        const composeWindow = document.getElementById('compose-window');
        if (!composeWindow) return;

        // CRITICAL: Clear selected recipient to prevent context bleeding between emails
        this._selectedRecipient = null;

        // Inputs
        const toInput = composeWindow.querySelector('#compose-to');
        const subjectInput = composeWindow.querySelector('#compose-subject');
        const ccInput = composeWindow.querySelector('#compose-cc');
        const bccInput = composeWindow.querySelector('#compose-bcc');
        const body = composeWindow.querySelector('.body-input');
        const preview = composeWindow.querySelector('.compose-preview');
        const suggestionsPanel = composeWindow.querySelector('#compose-to-suggestions') || composeWindow.querySelector('.recipient-suggestions');
        
        if (toInput) { toInput.value = ''; toInput.setAttribute('aria-expanded', 'false'); }
        if (subjectInput) subjectInput.value = '';
        if (ccInput) ccInput.value = '';
        if (bccInput) bccInput.value = '';
        if (body) { body.removeAttribute('data-mode'); body.innerHTML = ''; }
        if (preview) { preview.setAttribute('hidden', ''); preview.innerHTML = ''; }
        if (suggestionsPanel) { suggestionsPanel.hidden = true; suggestionsPanel.innerHTML = ''; }

        // Toolbars
        const formattingBar = composeWindow.querySelector('.formatting-bar');
        const linkBar = composeWindow.querySelector('.link-bar');
        const variablesBar = composeWindow.querySelector('.variables-bar');
        const aiBar = composeWindow.querySelector('.ai-bar');
        
        formattingBar?.classList.remove('open');
        formattingBar?.setAttribute('aria-hidden', 'true');
        linkBar?.classList.remove('open');
        linkBar?.setAttribute('aria-hidden', 'true');
        variablesBar?.classList.remove('open');
        variablesBar?.setAttribute('aria-hidden', 'true');
        aiBar?.classList.remove('open');
        aiBar?.setAttribute('aria-hidden', 'true');
        
        // Clear link inputs
        linkBar?.querySelector('[data-link-text]') && (linkBar.querySelector('[data-link-text]').value = '');
        linkBar?.querySelector('[data-link-url]') && (linkBar.querySelector('[data-link-url]').value = '');

        // Force AI bar to re-render next time it's opened so event wiring is fresh
        if (aiBar) {
            aiBar.dataset.rendered = 'false';
            aiBar.innerHTML = '';
        }

        // Reset toolbar button expanded states
        composeWindow.querySelectorAll('.toolbar-btn[aria-expanded="true"]').forEach(btn => {
            btn.setAttribute('aria-expanded', 'false');
        });

        // Reset internal editor state
        this._isHtmlMode = false;
        this._editorSelection = null;
        this._currentFormatting = { color: null, backgroundColor: null, fontSize: null, bold: false, italic: false, underline: false };
    }

    closeComposeWindow() {
        const composeWindow = document.getElementById('compose-window');
        if (!composeWindow) return;

        composeWindow.classList.remove('open');
        setTimeout(() => {
            composeWindow.style.display = 'none';
            composeWindow.classList.remove('minimized', 'maximized');
            // After the close animation completes, reset for a fresh next open
            this.resetComposeWindow();
        }, 300);
    }

    initializeComposeWindow() {
        const composeWindow = document.getElementById('compose-window');
        if (!composeWindow) return;
        // Avoid rebinding events multiple times across opens
        if (composeWindow.dataset.initialized === 'true') {
            return;
        }

        // Window controls
        const minimizeBtn = document.getElementById('compose-minimize');
        const maximizeBtn = document.getElementById('compose-maximize');
        const closeBtn = document.getElementById('compose-close');

        minimizeBtn?.addEventListener('click', () => {
            console.log('🔽 Minimize button clicked');
            const wasMinimized = composeWindow.classList.contains('minimized');
            console.log('🔽 Was minimized:', wasMinimized);
            
            // Animate slide down by translating, then toggle class when finished
            if (!composeWindow.classList.contains('minimized')) {
                console.log('🔽 Going to minimized state');
                // going to minimized - use CSS transition, don't override
                composeWindow.classList.add('minimized');
                console.log('🔽 Added minimized class');
            } else {
                console.log('🔽 Restoring from minimized state');
                // restoring - use CSS transition, don't override
                composeWindow.classList.remove('minimized');
                console.log('🔽 Removed minimized class');
            }
            
            // Debug CSS classes and computed styles
            setTimeout(() => {
                console.log('🔽 Compose window classes:', composeWindow.className);
                const computedStyle = window.getComputedStyle(composeWindow);
                console.log('🔽 Transform:', computedStyle.transform);
                console.log('🔽 Transition:', computedStyle.transition);
                console.log('🔽 Height:', computedStyle.height);
                console.log('🔽 Will-change:', computedStyle.willChange);
                console.log('🔽 Position:', computedStyle.position);
                console.log('🔽 Bottom:', computedStyle.bottom);
            }, 10);
        });

        maximizeBtn?.addEventListener('click', () => {
            composeWindow.classList.toggle('maximized');
        });

        closeBtn?.addEventListener('click', () => {
            this.closeComposeWindow();
        });

        // Cc/Bcc toggle
        const ccBccToggle = document.getElementById('toggle-cc-bcc');
        const ccBccRow = document.getElementById('cc-bcc-row');
        const bccRow = document.getElementById('bcc-row');

        ccBccToggle?.addEventListener('click', () => {
            const isVisible = ccBccRow.style.display !== 'none';
            ccBccRow.style.display = isVisible ? 'none' : 'flex';
            bccRow.style.display = isVisible ? 'none' : 'flex';
        });

        // Send button event listener is already set up in setupEventListeners()

        // Initialize editor functionality
        this.initializeComposeEditor();
        
        // Remove previous behavior that forced caret to start; keep user's position
        const bodyInput = composeWindow.querySelector('.body-input');

        // Close popovers when clicking outside
        document.addEventListener('click', (e) => {
            if (!composeWindow.contains(e.target)) {
                // Clicked outside compose window, close all popovers
                const openPopovers = composeWindow.querySelectorAll('.format-popover.open');
                openPopovers.forEach(popover => {
                    popover.classList.remove('open');
                });
                const expandedButtons = composeWindow.querySelectorAll('.fmt-btn[aria-expanded="true"]');
                expandedButtons.forEach(btn => {
                    btn.setAttribute('aria-expanded', 'false');
                });
            }
        });
        
        // Mark as initialized so we don't attach handlers repeatedly
        composeWindow.dataset.initialized = 'true';
    }

    initializeComposeEditor() {
        const composeWindow = document.getElementById('compose-window');
        if (!composeWindow) return;

        const editor = composeWindow.querySelector('.body-input');
        // Track selection so toolbar actions work when popovers are clicked
        this._editorSelection = null;
        const saveSelection = () => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            this._editorSelection = sel.getRangeAt(0).cloneRange();
        };
        const restoreSelection = () => {
            if (!this._editorSelection) return;
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(this._editorSelection);
        };
        const ensureSelection = () => {
            // Ensure editor is focused and a range exists at caret/end
            if (!editor) return;
            editor.focus();
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) {
                const range = document.createRange();
                range.selectNodeContents(editor);
                range.collapse(false); // to end
                sel.removeAllRanges();
                sel.addRange(range);
                this._editorSelection = range.cloneRange();
                return;
            }
            if (!this._editorSelection) {
                this._editorSelection = sel.getRangeAt(0).cloneRange();
            }
        };
        // Prefer inline CSS for execCommand operations
        try { document.execCommand('styleWithCSS', true); } catch (_) {}
        editor?.addEventListener('keyup', saveSelection);
        editor?.addEventListener('mouseup', saveSelection);
        editor?.addEventListener('blur', saveSelection);

        // Initial cleanup of any stray zero-width spans from earlier edits
        this.cleanZeroWidthSpans(editor);

        // Keep DOM clean as user types instead of injecting formatting spans
        editor?.addEventListener('input', (e) => {
            console.log('[DBG] input event:', e.inputType, 'data:', e.data);
            this.logCaretContext(editor, 'after-input');
            console.log('[DBG] editor HTML after input:', editor.innerHTML);
            // Convert any typed/pasted {{scope.key}} tokens to themed chips
            if (!this._isHtmlMode) {
                this.normalizeVariablesInEditor(editor);
            }
            this.cleanZeroWidthSpans(editor);
        });
        // Also clean up after key operations
        editor?.addEventListener('keyup', () => this.cleanZeroWidthSpans(editor));
        editor?.addEventListener('beforeinput', (e) => {
            if (e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward') {
                // Allow the browser to handle deletion first, then clean up artifacts
                setTimeout(() => this.cleanZeroWidthSpans(editor), 0);
            }
        });

        // Fix enter key double spacing issue and signature boundary
        editor?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                console.log('[Enter] Enter key pressed');
                e.preventDefault();
                
                // Check if cursor is at or near signature boundary
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    
                    // Find if we're near the signature
                    const isNearSignature = this.isCursorNearSignature(editor, range);
                    if (isNearSignature) {
                        // Don't allow editing into signature area
                        console.log('[Enter] Cursor near signature - preventing edit');
                        return;
                    }
                }
                
                // Simple approach: just insert a line break
                try {
                    document.execCommand('insertHTML', false, '<br>');
                    console.log('[Enter] Line break inserted via execCommand');
                } catch (error) {
                    console.error('[Enter] execCommand failed:', error);
                    // Try alternative approach
                    try {
                        const br = document.createElement('br');
                        const range = selection.getRangeAt(0);
                        range.insertNode(br);
                        range.setStartAfter(br);
                        range.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(range);
                        console.log('[Enter] Line break inserted via DOM manipulation');
                    } catch (fallbackError) {
                        console.error('[Enter] DOM manipulation also failed:', fallbackError);
                    }
                }
            }
        });
        const toolbar = composeWindow.querySelector('.editor-toolbar');
        const formattingBar = composeWindow.querySelector('.formatting-bar');
        const linkBar = composeWindow.querySelector('.link-bar');
        const variablesBar = composeWindow.querySelector('.variables-bar');
        const aiBar = composeWindow.querySelector('.ai-bar');
        const previewEl = composeWindow.querySelector('.compose-preview');
        
        console.log('🔧 Initializing compose editor elements:');
        console.log('🔧 Compose window:', composeWindow);
        console.log('🔧 Editor:', editor);
        console.log('🔧 Toolbar:', toolbar);
        console.log('🔧 Formatting bar:', formattingBar);
        console.log('🔧 Link bar:', linkBar);

        // Ensure recipient autocomplete is wired
        try {
            this.initRecipientAutocomplete(composeWindow);
            console.log('[ComposeAutocomplete] init called from initializeComposeEditor');
        } catch (e) {
            console.warn('[ComposeAutocomplete] init failed:', e);
        }

        // Toolbar actions
        toolbar?.addEventListener('click', (e) => {
            console.log('🔧 Toolbar click event:', e.target);
            const btn = e.target.closest('.toolbar-btn');
            console.log('🔧 Toolbar button found:', btn);
            if (!btn) {
                console.log('🔧 No toolbar button found, returning');
                return;
            }

            const action = btn.getAttribute('data-action');
            console.log('🔧 Toolbar action:', action);
            try {
                if (typeof this.handleToolbarAction === 'function') {
                    this.handleToolbarAction(action, btn, editor, formattingBar, linkBar);
                } else {
                    console.warn(' handleToolbarAction is not a function; using fallback');
                    if (action === 'formatting') {
                        const isOpen = formattingBar.classList.toggle('open');
                        formattingBar.setAttribute('aria-hidden', String(!isOpen));
                    } else if (action === 'link') {
                        const isOpen = linkBar.classList.toggle('open');
                        linkBar.setAttribute('aria-hidden', String(!isOpen));
                    } else if (action === 'variables') {
                        // Render on open
                        if (variablesBar && !variablesBar.classList.contains('open')) {
                            this.renderVariablesBar(variablesBar);
                        }
                        const isOpen = variablesBar.classList.toggle('open');
                        variablesBar.setAttribute('aria-hidden', String(!isOpen));
                        // Close others
                        formattingBar?.classList.remove('open');
                        formattingBar?.setAttribute('aria-hidden', 'true');
                        linkBar?.classList.remove('open');
                        linkBar?.setAttribute('aria-hidden', 'true');
                    } else if (action === 'ai') {
                        if (aiBar && !aiBar.classList.contains('open')) {
                            this.renderAIBar(aiBar);
                        }
                        const isOpen = aiBar.classList.toggle('open');
                        aiBar.setAttribute('aria-hidden', String(!isOpen));
                        // Close others
                        formattingBar?.classList.remove('open');
                        formattingBar?.setAttribute('aria-hidden', 'true');
                        linkBar?.classList.remove('open');
                        linkBar?.setAttribute('aria-hidden', 'true');
                        variablesBar?.classList.remove('open');
                        variablesBar?.setAttribute('aria-hidden', 'true');
                    } else if (action === 'preview') {
                        this.togglePreview(composeWindow);
                    }
                }
            } catch (err) {
                console.error(' handleToolbarAction threw an error; using fallback', err);
                if (action === 'formatting') {
                    const isOpen = formattingBar.classList.toggle('open');
                    formattingBar.setAttribute('aria-hidden', String(!isOpen));
                } else if (action === 'link') {
                    const isOpen = linkBar.classList.toggle('open');
                    linkBar.setAttribute('aria-hidden', String(!isOpen));
                } else if (action === 'variables') {
                    if (variablesBar && !variablesBar.classList.contains('open')) {
                        this.renderVariablesBar(variablesBar);
                    }
                    const isOpen = variablesBar.classList.toggle('open');
                    variablesBar.setAttribute('aria-hidden', String(!isOpen));
                } else if (action === 'ai') {
                    if (aiBar && !aiBar.classList.contains('open')) this.renderAIBar(aiBar);
                    const isOpen = aiBar.classList.toggle('open');
                    aiBar.setAttribute('aria-hidden', String(!isOpen));
                } else if (action === 'preview') {
                    this.togglePreview(composeWindow);
                }
            }
        });

        // Formatting bar interactions
        formattingBar?.addEventListener('click', (e) => {
            console.log('🎨 Formatting bar click event:', e.target);
            const btn = e.target.closest('.fmt-btn');
            console.log('🎨 Formatting button found:', btn);
            if (!btn) {
                console.log('🎨 No formatting button found, returning');
                return;
            }

            const format = btn.getAttribute('data-fmt');
            console.log('🎨 Formatting format:', format);
            saveSelection();
            ensureSelection();
            this.handleFormatting(format, btn, editor, formattingBar, restoreSelection);
        });

        // Popover item interactions
        formattingBar?.addEventListener('click', (e) => {
            console.log('🎯 Formatting bar click event:', e.target);
            const popoverItem = e.target.closest('.popover-item');
            const colorSwatch = e.target.closest('.color-swatch');
            console.log('🎯 Popover item found:', popoverItem);
            console.log('🎯 Color swatch found:', colorSwatch);
            if (!popoverItem && !colorSwatch) {
                console.log('🎯 No popover item or color swatch, returning');
                return;
            }

            e.stopPropagation();
            restoreSelection();
            
            // Handle font selection
            if (popoverItem && popoverItem.classList.contains('font-item')) {
                const fontFamily = popoverItem.getAttribute('data-font');
                const fontLabel = popoverItem.textContent;
                
                // Update the font button label
                const fontBtn = formattingBar.querySelector('[data-fmt="font"]');
                if (fontBtn) {
                    const label = fontBtn.querySelector('[data-current-font]');
                    if (label) label.textContent = fontLabel;
                }
                
                // Apply font to editor
                document.execCommand('fontName', false, fontFamily);
                
                // Close popover
                const popover = popoverItem.closest('.format-popover');
                if (popover) {
                    popover.classList.remove('open');
                    const btn = formattingBar.querySelector('[data-fmt="font"]');
                    if (btn) btn.setAttribute('aria-expanded', 'false');
                }
            }
            
            // Handle size selection
            if (popoverItem && popoverItem.classList.contains('size-item')) {
                console.log('📏 Size item clicked');
                const fontSize = popoverItem.getAttribute('data-size');
                console.log('📏 Font size:', fontSize);
                
                // Update the size button label
                const sizeBtn = formattingBar.querySelector('[data-fmt="size"]');
                if (sizeBtn) {
                    const label = sizeBtn.querySelector('[data-current-size]');
                    if (label) label.textContent = fontSize;
                }
                
                ensureSelection();
                console.log('📏 Selection ensured');
                
                // Apply size using direct CSS styling (execCommand fontSize uses 1-7 scale, not pixels)
                console.log('📏 Applying font size directly with CSS');
                this.applyStyleToSelection(editor, `font-size:${fontSize}px;`);
                
                // Close popover
                const popover = popoverItem.closest('.format-popover');
                if (popover) {
                    popover.classList.remove('open');
                    const btn = formattingBar.querySelector('[data-fmt="size"]');
                    if (btn) btn.setAttribute('aria-expanded', 'false');
                }
            }

            // Handle text color
            if (colorSwatch && colorSwatch.closest('.color-popover')) {
                console.log('🎨 Color swatch clicked');
                const color = colorSwatch.getAttribute('data-color');
                console.log('🎨 Color value:', color);
                console.log('🎨 Color swatch element:', colorSwatch);
                console.log('🎨 Color popover element:', colorSwatch.closest('.color-popover'));
                
                ensureSelection();
                console.log('🎨 Selection ensured');
                
                // Use the new simple color application method
                this.applyColorToSelection(color === 'transparent' ? null : color);
                
                const pop = colorSwatch.closest('.format-popover');
                console.log('🎨 Popover element:', pop);
                pop?.classList.remove('open');
                console.log('🎨 Popover closed');
                
                const colorBtn = formattingBar.querySelector('[data-fmt="color"]');
                console.log('🎨 Color button:', colorBtn);
                colorBtn?.setAttribute('aria-expanded','false');
                console.log('🎨 Color button aria-expanded set to false');
            }

            // Handle highlight color - REBUILT
            if (colorSwatch && colorSwatch.closest('.highlight-popover')) {
                const color = colorSwatch.getAttribute('data-color');
                console.log('🖍️ [NEW] Highlight swatch clicked');
                console.log('🖍️ [NEW] Highlight color value:', color);
                
                ensureSelection();
                
                // Use the new simple highlight application method
                this.applyHighlightToSelection(color === 'transparent' ? null : color);
                
                const pop = colorSwatch.closest('.format-popover');
                pop?.classList.remove('open');
                
                const highlightBtn = formattingBar.querySelector('[data-fmt="highlight"]');
                highlightBtn?.setAttribute('aria-expanded','false');
                
                console.log('🖍️ [NEW] Highlight application complete');
            }
        });

        // Link bar interactions
        linkBar?.addEventListener('click', (e) => {
            if (e.target.matches('[data-link-insert]')) {
                this.insertLink(editor, linkBar);
            } else if (e.target.matches('[data-link-cancel]')) {
                linkBar.classList.remove('open');
                linkBar.setAttribute('aria-hidden', 'true');
            }
        });

        // Variables bar interactions
        variablesBar?.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('.vars-tab');
            if (tabBtn) {
                const target = tabBtn.getAttribute('data-tab');
                variablesBar.querySelectorAll('.vars-tab').forEach(t => {
                    t.classList.toggle('active', t === tabBtn);
                    t.setAttribute('aria-selected', String(t === tabBtn));
                });
                variablesBar.querySelectorAll('.vars-panel').forEach(p => {
                    const on = p.getAttribute('data-tab') === target;
                    p.classList.toggle('hidden', !on);
                    p.setAttribute('aria-hidden', String(!on));
                });
                return;
            }
            const varItem = e.target.closest('.var-item');
            if (varItem) {
                const scope = varItem.getAttribute('data-scope');
                const key = varItem.getAttribute('data-key');
                const label = varItem.querySelector('.var-item-label')?.textContent?.trim() || key;
                this.insertVariableChip(editor, scope, key, label);
                return;
            }
            if (e.target.matches('[data-vars-close]')) {
                variablesBar.classList.remove('open');
                variablesBar.setAttribute('aria-hidden', 'true');
                return;
            }
        });

    }

    ensureSelection() {
        console.log('🎯 ensureSelection called');
        const editor = document.getElementById('compose-body-input');
        console.log('🎯 Editor element:', editor);
        
        if (!editor) {
            console.log('🎯 No editor found, trying alternative selector');
            // Try alternative selector
            const altEditor = document.querySelector('.body-input[contenteditable="true"]');
            console.log('🎯 Alternative editor element:', altEditor);
            if (!altEditor) {
                console.log('🎯 No editor found with any selector, returning');
                return;
            }
            // Use the alternative editor
            altEditor.focus();
            console.log('🎯 Alternative editor focused');
        } else {
            // Focus the editor
            editor.focus();
            console.log('🎯 Editor focused');
        }
        
        // Check if there's a current selection
        const selection = window.getSelection();
        console.log('🎯 Current selection:', selection);
        console.log('🎯 Range count:', selection?.rangeCount);
        console.log('🎯 Is collapsed:', selection?.isCollapsed);
        
        if (!selection || selection.rangeCount === 0) {
            console.log('🎯 No selection, creating one at end');
            // No selection, create one at the end
            const range = document.createRange();
            const targetEditor = editor || document.querySelector('.body-input[contenteditable="true"]');
            if (targetEditor) {
                range.selectNodeContents(targetEditor);
                range.collapse(false); // collapse to end
                selection.removeAllRanges();
                selection.addRange(range);
                this._editorSelection = range.cloneRange();
                console.log('🎯 New selection created at end');
            }
        } else {
            console.log('🎯 Valid selection exists');
        }
    }

    // Formatting state management methods
    setFormattingState(property, value) {
        console.log('🎨 Setting formatting state:', property, '=', value);
        this._currentFormatting[property] = value;
        console.log('🎨 Current formatting state:', this._currentFormatting);
    }

    getFormattingState(property) {
        return this._currentFormatting[property];
    }

    // Debug helper: log caret container, nearest span styles, and computed styles
    logCaretContext(editor, label = 'caret') {
        try {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) {
                console.log(`[DBG] ${label}: no selection`);
                return;
            }
            const range = sel.getRangeAt(0);
            const node = range.startContainer;
            const span = this.findCurrentSpan(node);
            const ctx = {
                nodeType: node.nodeType,
                nodeName: node.nodeName,
                offset: range.startOffset,
                spanFound: !!span,
                spanStyle: span?.style?.cssText || '',
            };
            // Computed where caret resides
            const el = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) || editor;
            const comp = window.getComputedStyle(el);
            console.log(`[DBG] ${label}:`, ctx, 'computed:', {
                color: comp.color,
                backgroundColor: comp.backgroundColor,
            });
        } catch (e) {
            console.warn('[DBG] logCaretContext failed', e);
        }
    }

    // Remove artifact spans that contain only zero-width characters or have no styling
    cleanZeroWidthSpans(editor) {
        if (!editor) return;
        const spans = editor.querySelectorAll('span');
        spans.forEach(span => {
            // Never unwrap variable chips or any non-editable spans
            if (span.classList?.contains('var-chip') || span.hasAttribute('data-var') || span.getAttribute('contenteditable') === 'false') {
                return;
            }
            const text = span.textContent || '';
            const onlyZWNJ = text.replace(/\u200C/g, '') === '';
            const styleAttr = span.getAttribute('style');
            const hasNoStyle = !styleAttr || styleAttr.trim() === '';
            const trivialStyle = styleAttr && /^(?:\s*(background-color:\s*transparent;)?\s*(color:\s*var\(--text-primary\);)?\s*)$/i.test(styleAttr.trim());
            
            // Unwrap spans that are empty or style-less to prevent caret/backspace issues
            if ((onlyZWNJ && span.childNodes.length <= 1) || hasNoStyle || trivialStyle) {
                const parent = span.parentNode;
                if (!parent) return;
                while (span.firstChild) parent.insertBefore(span.firstChild, span);
                parent.removeChild(span);
            }
        });
    }

    moveCursorOutsideHighlightedSpans(editor) {
        console.log('🖍️ Moving cursor outside highlighted spans');
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            console.log('🖍️ No selection found');
            return;
        }

        const range = selection.getRangeAt(0);
        if (!range.collapsed) {
            console.log('🖍️ Range is not collapsed, skipping');
            return; // Only work with collapsed ranges (cursor position)
        }

        console.log('🖍️ Current range:', range);
        console.log('🖍️ Range start container:', range.startContainer);
        console.log('🖍️ Range start offset:', range.startOffset);

        // Find the current node
        let node = range.startContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;

        // Identify the highest ancestor span that still has a highlight
        let highlightedAncestor = null;
        let walker = node;
        while (walker && walker !== editor) {
            if (walker.tagName === 'SPAN' && walker.style && walker.style.backgroundColor &&
                walker.style.backgroundColor !== 'transparent' && walker.style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                highlightedAncestor = walker; // keep walking to find the highest one
            }
            walker = walker.parentNode;
        }

        if (highlightedAncestor) {
            const newRange = document.createRange();
            newRange.setStartAfter(highlightedAncestor);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
            console.log('🖍️ Moved cursor after highest highlighted span');
            return;
        }
        
        console.log('🖍️ No highlighted span found, cursor position unchanged');
    }

    moveCursorOutsideColoredSpans(editor) {
        console.log('🎨 Moving cursor outside colored spans');
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            console.log('🎨 No selection found');
            return;
        }

        const range = selection.getRangeAt(0);
        if (!range.collapsed) {
            console.log('🎨 Range is not collapsed, skipping');
            return; // Only work with collapsed ranges (cursor position)
        }

        console.log('🎨 Current range:', range);
        console.log('🎨 Range start container:', range.startContainer);
        console.log('🎨 Range start offset:', range.startOffset);

        // Find the current node
        let node = range.startContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;

        // Identify the highest ancestor span that still has a text color
        let coloredAncestor = null;
        let walker = node;
        while (walker && walker !== editor) {
            if (walker.tagName === 'SPAN' && walker.style && walker.style.color &&
                walker.style.color !== '' && walker.style.color !== 'var(--text-primary)' && walker.style.color !== 'rgb(0, 0, 0)' && walker.style.color !== 'black') {
                coloredAncestor = walker; // keep walking to find the highest one
            }
            walker = walker.parentNode;
        }

        if (coloredAncestor) {
            const newRange = document.createRange();
            newRange.setStartAfter(coloredAncestor);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
            console.log('🎨 Moved cursor after highest colored span');
            return;
        }
        
        console.log('🎨 No colored span found, cursor position unchanged');
    }

    // NEW: Simple color application method like Google Docs
    applyColorToSelection(color) {
        console.log('🎨 [NEW] applyColorToSelection called with:', color);
        
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            console.log('🎨 [NEW] No selection found');
            return;
        }
        
        const range = selection.getRangeAt(0);
        console.log('🎨 [NEW] Range collapsed:', range.collapsed);
        console.log('🎨 [NEW] Selected text:', range.toString());
        
        if (color === 'transparent' || color === null) {
            // Only affect future typing; preserve existing content.
            if (!range.collapsed) {
                console.log('🎨 [NEW] Collapsing selection to end without altering existing color');
                range.collapse(false); // move caret to end of selection
                selection.removeAllRanges();
                selection.addRange(range);
            } else {
                console.log('🎨 [NEW] Collapsed caret - will only affect future typing');
            }
        } else {
            // Apply color
            console.log('🎨 [NEW] Applying color:', color);
            const success = document.execCommand('foreColor', false, color);
            console.log('🎨 [NEW] foreColor success:', success);
        }
        
        // Update formatting state
        this.setFormattingState('color', color);
        console.log('🎨 [NEW] Updated formatting state');

        // If turning off color, ensure caret is not inside a colored span
        if (color === null) {
            const ed = document.querySelector('.body-input[contenteditable="true"]');
            if (ed) {
                // Move caret out of any colored span so new typing uses default
                this.moveCursorOutsideColoredSpans(ed);
                // Create a neutral span at caret to guarantee future typing is plain
                this.ensurePlainTypingContext(ed, 'color');
                this.cleanZeroWidthSpans(ed);
            }
        }
    }

    // NEW: Simple highlight application method like Google Docs
    applyHighlightToSelection(color) {
        console.log('🖍️ [NEW] applyHighlightToSelection called with:', color);
        
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            console.log('🖍️ [NEW] No selection found');
            return;
        }
        
        const range = selection.getRangeAt(0);
        console.log('🖍️ [NEW] Range collapsed:', range.collapsed);
        console.log('🖍️ [NEW] Selected text:', range.toString());
        
        if (color === 'transparent' || color === null) {
            // Only affect future typing; preserve existing content.
            if (!range.collapsed) {
                console.log('🖍️ [NEW] Collapsing selection to end without altering existing highlight');
                range.collapse(false); // move caret to end of selection
                selection.removeAllRanges();
                selection.addRange(range);
            } else {
                console.log('🖍️ [NEW] Collapsed caret - will only affect future typing');
            }
        } else {
            // Apply highlight
            console.log('🖍️ [NEW] Applying highlight:', color);
            const success = document.execCommand('hiliteColor', false, color);
            console.log('🖍️ [NEW] hiliteColor success:', success);
        }
        
        // Update formatting state
        this.setFormattingState('backgroundColor', color);
        console.log('🖍️ [NEW] Updated formatting state');

        // If turning off highlight, ensure caret is not inside a highlighted span
        if (color === null) {
            const ed = document.querySelector('.body-input[contenteditable="true"]');
            if (ed) {
                this.logCaretContext(ed, 'before-no-highlight-caret-move');
                // Move caret out of any highlighted span so new typing uses default
                this.moveCursorOutsideHighlightedSpans(ed);
                // Explicitly clear the pending highlight typing style at the caret
                try { document.execCommand('styleWithCSS', true); } catch (_) {}
                const r1 = document.execCommand('hiliteColor', false, 'transparent');
                const r2 = document.execCommand('backColor', false, 'transparent');
                console.log('🖍️ Cleared caret typing style: hiliteColor ->', r1, ' backColor ->', r2);
                // Create a neutral span at caret to guarantee future typing is plain
                this.ensurePlainTypingContext(ed, 'highlight');
                this.cleanZeroWidthSpans(ed);
                this.logCaretContext(ed, 'after-no-highlight-caret-move');
            }
        }
    }

    applyCurrentFormattingToNewText(editor) {
        console.log('🎨 Applying current formatting to new text');
        console.log('🎨 Current formatting state:', this._currentFormatting);
        
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            console.log('🎨 No selection found, returning');
            return;
        }

        const range = selection.getRangeAt(0);
        if (!range.collapsed) {
            console.log('🎨 Range is not collapsed, returning');
            return; // Only apply to collapsed ranges (cursor position)
        }

        console.log('🎨 Range:', range);
        console.log('🎨 Range start container:', range.startContainer);
        console.log('🎨 Range start offset:', range.startOffset);

        // Check if we're inside a formatted span
        let currentSpan = range.startContainer;
        if (currentSpan.nodeType === Node.TEXT_NODE) {
            currentSpan = currentSpan.parentNode;
        }

        console.log('🎨 Current span:', currentSpan);
        console.log('🎨 Current span tagName:', currentSpan?.tagName);
        console.log('🎨 Current span style:', currentSpan?.style?.cssText);

        // SIMPLIFIED - No complex cursor movement, just apply formatting
        console.log('🎨 [NEW] Applying formatting to new text - simplified approach');

        // Create a span with current formatting
        const span = document.createElement('span');
        let styleText = '';

        if (this._currentFormatting.color && this._currentFormatting.color !== null) {
            styleText += `color: ${this._currentFormatting.color};`;
            console.log('🎨 [NEW] Adding color to style:', this._currentFormatting.color);
        }
        if (this._currentFormatting.backgroundColor && this._currentFormatting.backgroundColor !== 'transparent') {
            styleText += `background-color: ${this._currentFormatting.backgroundColor};`;
            console.log('🎨 [NEW] Adding background-color to style:', this._currentFormatting.backgroundColor);
        }
        if (this._currentFormatting.fontSize) {
            styleText += `font-size: ${this._currentFormatting.fontSize}px;`;
            console.log('🎨 Adding font-size to style:', this._currentFormatting.fontSize);
        }
        if (this._currentFormatting.bold) {
            styleText += `font-weight: bold;`;
            console.log('🎨 Adding bold to style');
        }
        if (this._currentFormatting.italic) {
            styleText += `font-style: italic;`;
            console.log('🎨 Adding italic to style');
        }
        if (this._currentFormatting.underline) {
            styleText += `text-decoration: underline;`;
            console.log('🎨 Adding underline to style');
        }

        console.log('🎨 Final styleText:', styleText);

        if (styleText) {
            span.style.cssText = styleText;
            span.innerHTML = '\u200C'; // Zero-width non-joiner
            range.insertNode(span);
            range.setStartAfter(span);
            range.setEndAfter(span);
            selection.removeAllRanges();
            selection.addRange(range);
            console.log('🎨 Applied formatting span:', span.outerHTML);
        } else {
            console.log('🎨 No formatting to apply, skipping span creation');
        }
    }

    applyStyleToSelection(editor, cssText) {
        console.log('🔧 applyStyleToSelection called with:', cssText);
        console.log('🔧 Editor element:', editor);
        const selection = window.getSelection();
        console.log('🔧 Selection object:', selection);
        console.log('🔧 Range count:', selection?.rangeCount);
        
        if (!selection || selection.rangeCount === 0) {
            console.log('🔧 No selection, ensuring selection first');
            this.ensureSelection();
            const newSelection = window.getSelection();
            if (!newSelection || newSelection.rangeCount === 0) {
                console.log('🔧 Still no selection, returning');
                return;
            }
            const range = newSelection.getRangeAt(0);
            console.log('🔧 New range after ensureSelection:', range);
        } else {
            var range = selection.getRangeAt(0);
        }
        
        console.log('🔧 Range:', range);
        console.log('🔧 Range collapsed:', range.collapsed);
        console.log('🔧 Range start container:', range.startContainer);
        console.log('🔧 Range start offset:', range.startOffset);
        
        if (range.collapsed) {
            console.log('🔧 Inserting styled span at collapsed range');
            // Insert a styled span at caret so future typing inherits color
            const span = document.createElement('span');
            span.setAttribute('style', cssText);
            // use zero-width non-joiner to keep span
            span.appendChild(document.createTextNode('\u200C'));
            range.insertNode(span);
            console.log('🔧 Span inserted:', span);
            console.log('🔧 Span style:', span.style.cssText);
            
            // move caret inside span (after ZWNJ)
            const newRange = document.createRange();
            newRange.setStart(span.firstChild, 1);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
            this._editorSelection = newRange.cloneRange();
            console.log('🔧 Caret moved inside span');
            return;
        }
        
        console.log('🔧 Wrapping selection with styled span');
        const contents = range.extractContents();
        console.log('🔧 Extracted contents:', contents);
        console.log('🔧 Contents HTML:', contents.innerHTML || contents.textContent);
        
        const span = document.createElement('span');
        span.setAttribute('style', cssText);
        span.appendChild(contents);
        range.insertNode(span);
        console.log('🔧 Span with contents inserted:', span);
        console.log('🔧 Span style:', span.style.cssText);
        
        // place caret after the styled span
        const after = document.createRange();
        after.setStartAfter(span);
        after.collapse(true);
        selection.removeAllRanges();
        selection.addRange(after);
        this._editorSelection = after.cloneRange();
        console.log('🔧 Caret moved after span');
    }


    findCurrentSpan(node) {
        // Walk up the DOM tree to find a span element
        while (node && node !== document.body) {
            if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'SPAN') {
                return node;
            }
            node = node.parentNode;
        }
        return null;
    }

    removeColorFromCurrentPosition(editor, property) {
        console.log('🧹 removeColorFromCurrentPosition called with property:', property);
        const selection = window.getSelection();
        
        if (!selection || selection.rangeCount === 0) {
            console.log('🧹 No selection, ensuring selection first');
            this.ensureSelection();
            const newSelection = window.getSelection();
            if (!newSelection || newSelection.rangeCount === 0) {
                console.log('🧹 Still no selection, cannot proceed');
                return;
            }
        }
        
        const range = selection.getRangeAt(0);
        console.log('🧹 Current range:', range);
        console.log('🧹 Range collapsed:', range.collapsed);
        console.log('🧹 Range start container:', range.startContainer);
        console.log('🧹 Range start offset:', range.startOffset);
        
        if (range.collapsed) {
            console.log('🧹 Collapsed range - clearing styles on ancestor spans');
            // Walk up through ancestor spans and clear the style property
            let node = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentNode : range.startContainer;
            while (node && node !== editor) {
                if (node.tagName === 'SPAN' && node.style) {
                    if (property === 'color') node.style.setProperty('color', 'var(--text-primary)');
                    if (property === 'background-color') node.style.setProperty('background-color', 'transparent');
                }
                node = node.parentNode;
            }
        } else {
            console.log('🧹 Range selection - working with selected text');
            // For selected text, we need to be more careful
            const contents = range.extractContents();
            console.log('🧹 Extracted contents:', contents);
            
            // Only remove the property from spans within the selection
            this.removeColorFromElement(contents, property);
            console.log('🧹 Processed contents:', contents);
            
            range.insertNode(contents);
            console.log('🧹 Re-inserted contents');
        }
    }

    removeColorFromElement(element, property) {
        console.log('🧹 removeColorFromElement called on:', element);
        const spans = element.querySelectorAll('span');
        spans.forEach(span => this.removeColorFromSpan(span, property));
        
        // Also check if the element itself is a span
        if (element.tagName === 'SPAN') {
            this.removeColorFromSpan(element, property);
        }
    }

    removeColorFromSpan(span, property) {
        console.log('🧹 removeColorFromSpan called on:', span, 'property:', property);
        if (!span.style) {
            console.log('🧹 No style object, returning');
            return;
        }
        
        const currentStyle = span.style.cssText;
        console.log('🧹 Current style before:', currentStyle);
        console.log('🧹 Current property value:', span.style.getPropertyValue(property));

        // Normalize clearing for requested property
        if (property === 'color') {
            span.style.setProperty('color', 'var(--text-primary)');
        } else if (property === 'background-color') {
            span.style.setProperty('background-color', 'transparent');
            // also clear shorthand background if used by the browser
            span.style.setProperty('background', 'transparent');
        }

        const newStyle = span.style.cssText;
        console.log('🧹 Updated style after:', newStyle);
        console.log('🧹 New property value:', span.style.getPropertyValue(property));
    }

    // Handle image upload functionality
    handleImageUpload(editor) {
        try {
            if (!editor) {
                console.warn('[ImageUpload] No editor provided');
                return;
            }

            // Create file input
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.style.display = 'none';
            
            fileInput.addEventListener('change', (event) => {
                const file = event.target.files?.[0];
                if (!file) return;

                // Validate file type
                if (!file.type.startsWith('image/')) {
                    window.crm?.showToast('Please select an image file');
                    return;
                }

                // Validate file size (max 10MB)
                const maxSize = 10 * 1024 * 1024; // 10MB
                if (file.size > maxSize) {
                    window.crm?.showToast('Image file is too large. Maximum size is 10MB');
                    return;
                }

                // Read file as data URL
                const reader = new FileReader();
                reader.onload = (e) => {
                    this.insertImageAtCursor(editor, e.target.result, file.name);
                };
                reader.onerror = () => {
                    window.crm?.showToast('Error reading image file');
                };
                reader.readAsDataURL(file);
            });

            // Add to DOM temporarily and trigger click
            document.body.appendChild(fileInput);
            fileInput.click();
            document.body.removeChild(fileInput);

        } catch (error) {
            console.error('[ImageUpload] Error:', error);
            window.crm?.showToast('Error uploading image');
        }
    }

    // Insert image at current cursor position
    insertImageAtCursor(editor, imageDataUrl, fileName) {
        try {
            if (!editor) {
                console.warn('[ImageInsert] No editor provided');
                return;
            }

            // Ensure editor has focus
            editor.focus();

            // Create image element
            const img = document.createElement('img');
            img.src = imageDataUrl;
            img.alt = fileName || 'Uploaded image';
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            img.style.display = 'block';
            img.style.margin = '8px 0';
            img.style.borderRadius = '4px';
            img.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';

            // Insert at cursor position
            this.insertElementAtCursor(editor, img);

            // Show success message
            window.crm?.showToast('Image inserted successfully');

        } catch (error) {
            console.error('[ImageInsert] Error:', error);
            window.crm?.showToast('Error inserting image');
        }
    }

    // Insert element at current cursor position
    insertElementAtCursor(editor, element) {
        try {
            const selection = window.getSelection();
            
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                
                // If there's a selection, delete it first
                if (!range.collapsed) {
                    range.deleteContents();
                }
                
                // Insert the element
                range.insertNode(element);
                
                // Move cursor after the inserted element
                range.setStartAfter(element);
                range.setEndAfter(element);
                range.collapse(true);
                
                // Clear selection and set new range
                selection.removeAllRanges();
                selection.addRange(range);
                
            } else {
                // No selection, append to end of editor
                editor.appendChild(element);
                
                // Move cursor to end
                const range = document.createRange();
                range.selectNodeContents(editor);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            }

            // Ensure editor maintains focus
            editor.focus();

        } catch (error) {
            console.error('[InsertElement] Error:', error);
            // Fallback: append to end of editor
            editor.appendChild(element);
        }
    }

    // Toolbar actions for the compose editor (top bar with icons)
    handleToolbarAction(action, btn, editor, formattingBar, linkBar) {
        try {
            const composeWindow = editor?.closest?.('#compose-window') || document.getElementById('compose-window');
            const variablesBar = composeWindow?.querySelector('.variables-bar');
            const aiBar = composeWindow?.querySelector('.ai-bar');
            console.log('[Toolbar] handleToolbarAction:', action, { editor, formattingBar, linkBar, variablesBar });
            
            // Helper function to close all toolbars
            const closeAllToolbars = () => {
                formattingBar?.classList.remove('open');
                formattingBar?.setAttribute('aria-hidden', 'true');
                linkBar?.classList.remove('open');
                linkBar?.setAttribute('aria-hidden', 'true');
                variablesBar?.classList.remove('open');
                variablesBar?.setAttribute('aria-hidden', 'true');
                aiBar?.classList.remove('open');
                aiBar?.setAttribute('aria-hidden', 'true');
                
                // Also close any formatting popovers
                composeWindow?.querySelectorAll('.format-popover').forEach(p => p.classList.remove('open'));
                
                // Reset button states
                composeWindow?.querySelectorAll('.toolbar-btn[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
            };
            
            switch (action) {
                case 'formatting': {
                    // Close all other toolbars first
                    closeAllToolbars();
                    // Then open formatting bar
                    const isOpen = formattingBar?.classList.toggle('open');
                    formattingBar?.setAttribute('aria-hidden', String(!isOpen));
                    btn.setAttribute('aria-expanded', String(isOpen));
                    break;
                }
                case 'link': {
                    // Close all other toolbars first
                    closeAllToolbars();
                    // Then open link bar
                    const isOpen = linkBar?.classList.toggle('open');
                    linkBar?.setAttribute('aria-hidden', String(!isOpen));
                    btn.setAttribute('aria-expanded', String(isOpen));
                    // Prefill link text from selection
                    try {
                        const sel = window.getSelection();
                        const hasText = sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed && sel.toString();
                        const textInput = linkBar?.querySelector('[data-link-text]');
                        if (textInput && hasText) textInput.value = sel.toString();
                        (linkBar?.querySelector('[data-link-url]') || textInput)?.focus();
                    } catch (_) {}
                    break;
                }
                case 'variables': {
                    // Close all other toolbars first
                    closeAllToolbars();
                    // Render variables if not already rendered
                    if (variablesBar && !variablesBar.classList.contains('open')) {
                        this.renderVariablesBar(variablesBar);
                    }
                    // Then open variables bar
                    const isOpen = variablesBar?.classList.toggle('open');
                    variablesBar?.setAttribute('aria-hidden', String(!isOpen));
                    btn.setAttribute('aria-expanded', String(isOpen));
                    break;
                }
                case 'ai': {
                    // Check if AI bar is currently open
                    const isCurrentlyOpen = aiBar?.classList.contains('open');
                    
                    if (isCurrentlyOpen) {
                        // If open, close it
                        aiBar?.classList.remove('open');
                        aiBar?.setAttribute('aria-hidden', 'true');
                        btn.setAttribute('aria-expanded', 'false');
                    } else {
                        // If closed, close all other toolbars first, then open AI bar
                        closeAllToolbars();
                        // Render AI bar if not already rendered
                        if (aiBar && !aiBar.classList.contains('open')) {
                            this.renderAIBar(aiBar);
                        }
                        // Then open AI bar
                        aiBar?.classList.add('open');
                        aiBar?.setAttribute('aria-hidden', 'false');
                        btn.setAttribute('aria-expanded', 'true');
                    }
                    break;
                }
                case 'preview': {
                    this.togglePreview(composeWindow);
                    break;
                }
                case 'image': {
                    this.handleImageUpload(editor);
                    break;
                }
                case 'attach': {
                    window.crm?.showToast('File attachment coming soon');
                    break;
                }
                case 'code': {
                    this.toggleHtmlMode(composeWindow);
                    break;
                }
                case 'templates': {
                    window.crm?.showToast('Templates coming soon');
                    break;
                }
                default: {
                    console.log('[Toolbar] Unknown action:', action);
                }
            }
        } catch (e) {
            console.error('handleToolbarAction failed:', e);
        }
    }

    handleFormatting(format, btn, editor, formattingBar, restoreSelection) {
        if (!editor) return;

        console.log('handleFormatting called with format:', format);

        // Handle popover toggles
        if (format === 'font' || format === 'size' || format === 'color' || format === 'highlight') {
            const popover = btn.nextElementSibling;
            console.log('Popover found:', popover);
            
            if (popover) {
                const isOpen = popover.classList.toggle('open');
                console.log('Popover isOpen:', isOpen);
                btn.setAttribute('aria-expanded', String(isOpen));
                
                // Nothing else needed; popover is positioned with absolute relative to group
                
                // Close other popovers
                formattingBar.querySelectorAll('.format-popover').forEach(p => {
                    if (p !== popover) {
                        p.classList.remove('open');
                    }
                });
                formattingBar.querySelectorAll('.fmt-btn').forEach(b => {
                    if (b !== btn) {
                        b.setAttribute('aria-expanded', 'false');
                    }
                });
            }
            return;
        }

        // Handle text formatting
        if (format === 'bold' || format === 'italic' || format === 'underline') {
            console.log('🎨 Applying format:', format);
            console.log('🎨 Button element:', btn);
            console.log('🎨 Editor element:', editor);
            
            // Ensure we have a selection and focus
            this.ensureSelection();
            editor.focus();
            
            // Check current state using queryCommandState for accuracy
            const isCurrentlyActive = document.queryCommandState(format);
            console.log('🎨 Current state from queryCommandState:', isCurrentlyActive);
            console.log('🎨 Button aria-pressed:', btn.getAttribute('aria-pressed'));
            
            // Apply the formatting
            const result = document.execCommand(format, false, null);
            console.log('🎨 execCommand result:', result);
            
            // Update button state based on actual command state
            const newState = document.queryCommandState(format);
            console.log('🎨 New state after execCommand:', newState);
            btn.setAttribute('aria-pressed', String(newState));
            
            // Update persistent formatting state
            this.setFormattingState(format, newState);
            console.log('🎨 Updated persistent formatting state for:', format, '=', newState);
            
            // Ensure cursor is visible and positioned correctly
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                console.log('🎨 Selection range after formatting:', range);
                console.log('🎨 Range collapsed:', range.collapsed);
                console.log('🎨 Range start container:', range.startContainer);
            }
            
        } else if (format === 'link') {
            const linkBar = btn.closest('.compose-toolbar')?.querySelector('.link-bar') || document.querySelector('#compose-window .link-bar');
            if (linkBar) {
                const isOpen = linkBar.classList.toggle('open');
                linkBar.setAttribute('aria-hidden', String(!isOpen));
                // Prefill text with selection if any
                try {
                    const sel = window.getSelection();
                    const hasText = sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed && sel.toString();
                    const textInput = linkBar.querySelector('[data-link-text]');
                    if (textInput && hasText) textInput.value = sel.toString();
                    (linkBar.querySelector('[data-link-url]') || textInput)?.focus();
                } catch (_) {}
            }
        } else if (format === 'variables') {
            const variablesBar = btn.closest('.compose-toolbar')?.querySelector('.variables-bar') || document.querySelector('#compose-window .variables-bar');
            if (variablesBar) {
                if (!variablesBar.classList.contains('open')) this.renderVariablesBar(variablesBar);
                const isOpen = variablesBar.classList.toggle('open');
                variablesBar.setAttribute('aria-hidden', String(!isOpen));
                // Close formatting popovers when opening variables
                formattingBar?.querySelectorAll('.format-popover').forEach(p => p.classList.remove('open'));
                btn.setAttribute('aria-expanded', 'false');
            }
        } else if (format === 'preview') {
            this.togglePreview(btn.closest('#compose-window') || document.getElementById('compose-window'));
        } else if (format === 'insertOrderedList' || format === 'insertUnorderedList') {
            console.log('📝 Applying list format:', format);
            this.ensureSelection();
            editor.focus();
            const result = document.execCommand(format, false, null);
            console.log('📝 List execCommand result:', result);
        }
    }


    positionPopover() { /* no-op after CSS absolute positioning revert */ }

    insertLink(editor, linkBar) {
        const textInput = linkBar.querySelector('[data-link-text]');
        const urlInput = linkBar.querySelector('[data-link-url]');
        
        const text = textInput?.value?.trim() || '';
        const url = urlInput?.value?.trim() || '';
        
        if (!url) {
            window.crm?.showToast('Please enter a URL');
            return;
        }

        const linkText = text || url;
        const linkHtml = `<a href="${url}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
        
        // Restore saved selection at editor before inserting
        this.restoreSavedSelection();
        this.ensureSelection();
        document.execCommand('insertHTML', false, linkHtml);
        
        // Clear inputs and close bar
        textInput.value = '';
        urlInput.value = '';
        linkBar.classList.remove('open');
        linkBar.setAttribute('aria-hidden', 'true');
    }

    restoreSavedSelection() {
        try {
            const sel = window.getSelection();
            if (this._editorSelection && sel) {
                sel.removeAllRanges();
                sel.addRange(this._editorSelection);
            }
        } catch (_) {}
    }

    insertVariableChip(editor, scope, key, label) {
        if (!editor || !scope || !key) return;
        // Restore caret
        this.restoreSavedSelection();
        this.ensureSelection();
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        // Build token chip
        const token = `{{${scope}.${key}}}`;
        const span = document.createElement('span');
        span.className = 'var-chip';
        span.setAttribute('data-var', `${scope}.${key}`);
        span.setAttribute('data-token', token);
        const friendly = (label || key).replace(/_/g, ' ').toLowerCase();
        span.setAttribute('contenteditable', 'false');
        span.textContent = friendly;
        // Insert chip and a trailing space
        range.insertNode(document.createTextNode(' '));
        range.insertNode(span);
        // Move caret after the chip+space
        const after = document.createRange();
        after.setStartAfter(span.nextSibling || span);
        after.collapse(true);
        sel.removeAllRanges();
        sel.addRange(after);
    }

    renderVariablesBar(variablesBar) {
        if (!variablesBar) return;
        const people = [
            { key: 'first_name', label: 'First name' },
            { key: 'last_name', label: 'Last name' },
            { key: 'full_name', label: 'Full name' },
            { key: 'title', label: 'Title' },
            { key: 'email', label: 'Email' },
            { key: 'phone', label: 'Phone' }
        ];
        const account = [
            { key: 'name', label: 'Company name' },
            { key: 'website', label: 'Website' },
            { key: 'industry', label: 'Industry' },
            { key: 'size', label: 'Company size' },
            { key: 'city', label: 'City' },
            { key: 'state', label: 'State/Region' },
            { key: 'country', label: 'Country' }
        ];
        const sender = [
            { key: 'first_name', label: 'Sender first name' },
            { key: 'last_name', label: 'Sender last name' },
            { key: 'full_name', label: 'Sender full name' },
            { key: 'title', label: 'Sender title' },
            { key: 'email', label: 'Sender email' }
        ];
        const renderList = (items, scope) => items.map(i => `
            <button class="var-item" data-scope="${scope}" data-key="${i.key}" role="menuitem">
                <span class="var-item-label">${i.label}</span>
            </button>
        `).join('');
        variablesBar.innerHTML = `
            <div class="vars-tabs" role="tablist">
                <button class="vars-tab active" role="tab" aria-selected="true" data-tab="people">People</button>
                <button class="vars-tab" role="tab" aria-selected="false" data-tab="account">Account</button>
                <button class="vars-tab" role="tab" aria-selected="false" data-tab="sender">Sender</button>
                <span class="spacer"></span>
                <button class="fmt-btn" type="button" data-vars-close>Close</button>
            </div>
            <div class="vars-panels">
                <div class="vars-panel" data-tab="people" role="tabpanel">
                    <div class="var-list" role="menu">${renderList(people, 'contact')}</div>
                </div>
                <div class="vars-panel hidden" data-tab="account" role="tabpanel" aria-hidden="true">
                    <div class="var-list" role="menu">${renderList(account, 'account')}</div>
                </div>
                <div class="vars-panel hidden" data-tab="sender" role="tabpanel" aria-hidden="true">
                    <div class="var-list" role="menu">${renderList(sender, 'sender')}</div>
                </div>
            </div>`;
    }

    togglePreview(composeWindow) {
        if (!composeWindow) return;
        const editor = composeWindow.querySelector('.body-input');
        const preview = composeWindow.querySelector('.compose-preview');
        const previewBtn = composeWindow.querySelector('.editor-toolbar [data-action="preview"]');
        if (!editor || !preview || !previewBtn) return;
        const isShowing = !preview.hasAttribute('hidden');
        if (isShowing) {
            // Back to editor
            preview.setAttribute('hidden', '');
            editor.removeAttribute('hidden');
            this.setPreviewButtonIcon(previewBtn, 'preview');
            previewBtn.setAttribute('aria-label', 'Preview message');
            previewBtn.setAttribute('title', 'Preview');
        } else {
            // Build preview HTML from editor content
            const html = this.buildPreviewHTML(editor);
            preview.innerHTML = html;
            editor.setAttribute('hidden', '');
            preview.removeAttribute('hidden');
            this.setPreviewButtonIcon(previewBtn, 'editor');
            previewBtn.setAttribute('aria-label', 'Back to editor');
            previewBtn.setAttribute('title', 'Editor');
        }
    }

    buildPreviewHTML(editor) {
        // Clone current HTML. Keep chips styled but non-editable.
        try {
            if (this._isHtmlMode) {
                // In HTML mode, treat editor textContent as raw HTML source
                return editor.textContent || '';
            }
            const temp = editor.cloneNode(true);
            // Ensure chips appear as friendly labels
            temp.querySelectorAll('.var-chip').forEach(chip => {
                chip.removeAttribute('contenteditable');
            });
            return temp.innerHTML;
        } catch (e) {
            console.warn('buildPreviewHTML failed', e);
            return editor.innerHTML;
        }
    }

    normalizeVariablesInEditor(editor) {
        if (!editor) return;
        const regex = /\{\{(contact|account|sender)\.([a-zA-Z0-9_]+)\}\}/g;
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
        const toProcess = [];
        let node;
        while ((node = walker.nextNode())) {
            if (!node.nodeValue || !regex.test(node.nodeValue)) continue;
            toProcess.push(node);
        }
        toProcess.forEach(textNode => {
            const text = textNode.nodeValue;
            const parent = textNode.parentNode;
            if (!parent) return;
            const frag = document.createDocumentFragment();
            let lastIndex = 0;
            text.replace(regex, (match, scope, key, offset) => {
                // preceding text
                if (offset > lastIndex) {
                    frag.appendChild(document.createTextNode(text.slice(lastIndex, offset)));
                }
                // chip
                const span = document.createElement('span');
                span.className = 'var-chip';
                span.setAttribute('data-var', `${scope}.${key}`);
                span.setAttribute('data-token', `{{${scope}.${key}}}`);
                span.setAttribute('contenteditable', 'false');
                span.textContent = String(key).replace(/_/g, ' ').toLowerCase();
                frag.appendChild(span);
                frag.appendChild(document.createTextNode(' '));
                lastIndex = offset + match.length;
                return match;
            });
            if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
            parent.replaceChild(frag, textNode);
        });
    }

    async sendEmailViaSendGrid(emailData) {
        try {
            const { to, subject, content, _deliverability, threadId, inReplyTo, references } = emailData;
            
            // Generate unique tracking ID for this email
            const trackingId = `sendgrid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Prepare email data for SendGrid
            const emailPayload = {
                to: to,
                subject: subject,
                content: content,
                trackingId: trackingId,
                threadId: threadId,
                inReplyTo: inReplyTo,
                references: references,
                _deliverability: _deliverability
            };
            
            // Send via SendGrid API
            const response = await fetch(`${window.API_BASE_URL}/api/email/sendgrid-send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(emailPayload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to send email via SendGrid');
            }

            const result = await response.json();
            console.log('[SendGrid] Email sent successfully:', result);
            
            // Store email record for tracking
            if (window.emailTrackingManager && result.trackingId) {
                const trackingEmailData = {
                    id: result.trackingId,
                    to: emailData.to,
                    subject: emailData.subject,
                    content: content,
                    from: 'Lewis Patterson <noreply@powerchoosers.com>',
                    provider: 'sendgrid',
                    sentVia: 'sendgrid',
                    sendgridMessageId: result.messageId, // SendGrid's x-message-id
                    sentAt: new Date().toISOString(),
                    threadId: threadId || null,
                    inReplyTo: inReplyTo || null,
                    references: Array.isArray(references) ? references : (references ? [references] : [])
                };
                
                try {
                    await window.emailTrackingManager.saveEmailRecord(trackingEmailData);
                    console.log('[SendGrid] Email record saved to tracking system');
                } catch (trackingError) {
                    console.warn('[SendGrid] Failed to save email record:', trackingError);
                }
            }
            
            return {
                success: true,
                messageId: result.trackingId,
                message: 'Email sent successfully via SendGrid'
            };

        } catch (error) {
            console.error('[SendGrid] Send error:', error);
            throw error;
        }
    }

    async sendEmail() {
        const toInput = document.getElementById('compose-to');
        const subjectInput = document.getElementById('compose-subject');
        const bodyInput = document.querySelector('.body-input');
        
        const to = toInput?.value?.trim() || '';
        const subject = subjectInput?.value?.trim() || '';
        
        // Detect HTML mode and extract content appropriately
        const isHtmlMode = bodyInput?.getAttribute('data-mode') === 'html';
        const body = isHtmlMode ? 
            (bodyInput?.textContent || '') :  // HTML mode: get raw HTML code
            (bodyInput?.innerHTML || '');     // Text mode: get rendered HTML
        
        console.log('[EmailManager] Email mode:', isHtmlMode ? 'HTML' : 'Text');
        console.log('[EmailManager] Content preview:', body.substring(0, 100) + '...');
        
        if (!to) {
            window.crm?.showToast('Please enter recipients');
            toInput?.focus();
            return;
        }
        
        if (!subject) {
            window.crm?.showToast('Please enter a subject');
            subjectInput?.focus();
            return;
        }
        
        if (!body) {
            window.crm?.showToast('Please enter email content');
            bodyInput?.focus();
            return;
        }

        try {
            const settings = (window.SettingsPage && window.SettingsPage.getSettings) ? window.SettingsPage.getSettings() : (JSON.parse(localStorage.getItem('crm-settings')||'{}'));
            const deliver = settings?.emailDeliverability || {};
            // Show sending state
            const sendButton = document.querySelector('#compose-send');
            if (sendButton) {
                sendButton.disabled = true;
                sendButton.textContent = 'Sending...';
            }

            // Optionally remove signature image if disabled
            let preparedBody = body;
            if (deliver.signatureImageEnabled === false) {
                preparedBody = preparedBody.replace(/<img[^>]*alt=\"Signature\"[\s\S]*?>/gi, '');
            }

            // Check if signature is already in the body (prevent duplication)
            const signature = window.getEmailSignature ? window.getEmailSignature() : '';
            const hasSignature = preparedBody.includes('margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;');
            const contentWithSignature = hasSignature ? preparedBody : preparedBody + signature;

            const emailData = {
                to: to.split(',').map(email => email.trim()),
                subject,
                content: contentWithSignature
            };

            // Send via SendGrid
            let result;
            try {
                console.log('[EmailManager] Sending via SendGrid...');
                result = await this.sendEmailViaSendGrid({ ...emailData, _deliverability: deliver });
                console.log('[EmailManager] Email sent via SendGrid');
            } catch (sendGridError) {
                console.error('[EmailManager] SendGrid failed:', sendGridError);
                throw new Error(`Failed to send email: ${sendGridError.message}`);
            }
            
            // Close compose window on success
        this.closeComposeWindow();
            
            // Refresh sent emails if we're on the sent folder
            if (this.currentFolder === 'sent') {
                await this.loadEmails();
            }

            // Show success message
            window.crm?.showToast('Email sent successfully!');

        } catch (error) {
            console.error('[EmailManager] Send email error:', error);
            window.crm?.showToast('Failed to send email: ' + error.message);
        } finally {
            // Reset send button
            const sendButton = document.querySelector('#compose-send');
            if (sendButton) {
                sendButton.disabled = false;
                sendButton.textContent = 'Send';
            }
        }
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
        const email = this.emails.find(e => e.id === emailId);
        if (!email) {
            console.error('[EmailManager] Email not found:', emailId);
            return;
        }

        this.showEmailViewer(email);
    }

    showEmailViewer(email) {
        // Create email viewer modal
        const modal = document.createElement('div');
        modal.className = 'email-viewer-modal';
        modal.innerHTML = `
            <div class="email-viewer-content">
                <div class="email-viewer-header">
                    <div class="email-viewer-title">
                        <h2>${email.subject || 'No Subject'}</h2>
                        <div class="email-viewer-meta">
                            <span class="email-from">From: ${email.from || 'Unknown'}</span>
                            <span class="email-to">To: ${email.to || 'Unknown'}</span>
                            <span class="email-date">${this.formatDate(email.date)}</span>
                        </div>
                    </div>
                    <div class="email-viewer-actions">
                        <button class="email-action-btn" data-action="reply" title="Reply">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="9,10 4,15 9,20"/>
                                <path d="M20,4v7a4,4,0,0,1-4,4H4"/>
                            </svg>
                        </button>
                        <button class="email-action-btn" data-action="reply-all" title="Reply All">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="9,10 4,15 9,20"/>
                                <path d="M20,4v7a4,4,0,0,1-4,4H4"/>
                                <path d="M12,4v7a4,4,0,0,0,4,4h4"/>
                            </svg>
                        </button>
                        <button class="email-action-btn" data-action="forward" title="Forward">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="15,14 20,9 15,4"/>
                                <path d="M4,20v-7a4,4,0,0,1,4-4H20"/>
                            </svg>
                        </button>
                        <button class="email-action-btn ${email.starred ? 'starred' : ''}" data-action="star" title="Star">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="${email.starred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                                <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26 12,2"/>
                            </svg>
                        </button>
                        <button class="email-action-btn" data-action="close" title="Close">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="email-viewer-body">
                    <div class="email-content" id="email-content-${email.id}">
                        <!-- Content will be injected via JavaScript -->
                    </div>
                    ${this.renderTrackingIcons(email)}
                </div>
                <div class="email-viewer-compose" style="display: none;">
                    <div class="compose-header">
                        <h3>Compose Reply</h3>
                        <button class="email-action-btn" data-action="close-compose" title="Close Compose">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                    <div class="compose-form">
                        <div class="compose-field">
                            <label>To:</label>
                            <input type="text" id="modal-compose-to" class="compose-input" placeholder="Recipients">
                        </div>
                        <div class="compose-field">
                            <label>Subject:</label>
                            <input type="text" id="modal-compose-subject" class="compose-input" placeholder="Subject">
                        </div>
                        <div class="compose-editor">
                            <div class="editor-toolbar">
                                <button class="fmt-btn" data-format="bold" title="Bold">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
                                        <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
                                    </svg>
                                </button>
                                <button class="fmt-btn" data-format="italic" title="Italic">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="19" y1="4" x2="10" y2="4"/>
                                        <line x1="14" y1="20" x2="5" y2="20"/>
                                        <line x1="15" y1="4" x2="9" y2="20"/>
                                    </svg>
                                </button>
                                <button class="fmt-btn" data-format="underline" title="Underline">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/>
                                        <line x1="4" y1="21" x2="20" y2="21"/>
                                    </svg>
                                </button>
                                <div class="toolbar-separator"></div>
                                <button class="fmt-btn" data-format="insertUnorderedList" title="Bullet List">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="8" y1="6" x2="21" y2="6"/>
                                        <line x1="8" y1="12" x2="21" y2="12"/>
                                        <line x1="8" y1="18" x2="21" y2="18"/>
                                        <line x1="3" y1="6" x2="3.01" y2="6"/>
                                        <line x1="3" y1="12" x2="3.01" y2="12"/>
                                        <line x1="3" y1="18" x2="3.01" y2="18"/>
                                    </svg>
                                </button>
                                <button class="fmt-btn" data-format="insertOrderedList" title="Numbered List">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="10" y1="6" x2="21" y2="6"/>
                                        <line x1="10" y1="12" x2="21" y2="12"/>
                                        <line x1="10" y1="18" x2="21" y2="18"/>
                                        <path d="M4 6h1v4"/>
                                        <path d="M4 10h2"/>
                                        <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>
                                    </svg>
                                </button>
                                <div class="toolbar-separator"></div>
                                <button class="fmt-btn" data-format="createLink" title="Insert Link">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                                    </svg>
                                </button>
                                <button class="fmt-btn ai-generate" title="AI Generate">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                                        <path d="M2 17l10 5 10-5"/>
                                        <path d="M2 12l10 5 10-5"/>
                                    </svg>
                                </button>
                            </div>
                            <div class="editor-content" id="modal-compose-content" contenteditable="true" placeholder="Type your message here..."></div>
                        </div>
                        <div class="compose-actions">
                            <button class="btn btn-primary" data-action="send-reply">Send</button>
                            <button class="btn btn-secondary" data-action="save-draft">Save Draft</button>
                            <button class="btn btn-secondary" data-action="cancel-reply">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add modal to page
        document.body.appendChild(modal);

        // PROPERLY INJECT HTML CONTENT (Fix for HTML rendering)
        this.injectEmailContent(modal, email);

        // Bind events
        this.bindEmailViewerEvents(modal, email);

        // Show modal
        setTimeout(() => modal.classList.add('show'), 10);
    }

    injectEmailContent(modal, email) {
        // Get the email content container
        const contentContainer = modal.querySelector(`#email-content-${email.id}`);
        if (!contentContainer) return;

        // Get the best available content (handle arrays)
        const htmlContent = Array.isArray(email.html) ? email.html[0] : (email.html || email.bodyHtml || email.content);
        const textContent = Array.isArray(email.text) ? email.text[0] : (email.text || email.bodyText || email.snippet);

        // If we have HTML content, render it properly using innerHTML
        if (htmlContent && htmlContent.trim()) {
            // Decode quoted-printable artifacts and clean malformed attribute encodings
            let decodedHtml = this.decodeQuotedPrintable(htmlContent);
            // Fix common quoted-printable mis-encodings in attributes (href/src)
            decodedHtml = decodedHtml
                .replace(/href=3D"/gi, 'href="')
                .replace(/src=3D"/gi, 'src="')
                .replace(/\shref="3D/gi, ' href="')
                .replace(/\ssrc="3D/gi, ' src="')
                .replace(/=3D/gi, '=');

			// Sanitize: remove head/meta/script/link/base and upgrade insecure asset URLs
			decodedHtml = this.sanitizeEmailHtml(decodedHtml);
			contentContainer.innerHTML = decodedHtml;
        } else if (textContent && textContent.trim()) {
            // Fallback to text content with line breaks
            const decodedText = this.decodeQuotedPrintable(textContent);
            contentContainer.innerHTML = decodedText.replace(/\n/g, '<br>');
        } else {
            contentContainer.innerHTML = 'No content available';
        }
    }

    decodeQuotedPrintable(content) {
        if (!content) return '';
        
        // Decode quoted-printable encoding (fixes =20 artifacts)
        return content
            .replace(/=\r?\n/g, '') // Remove soft line breaks
            .replace(/=([0-9A-F]{2})/g, (match, hex) => {
                return String.fromCharCode(parseInt(hex, 16));
            })
            .replace(/=20/g, ' ') // Replace =20 with spaces
            .replace(/=3D/g, '=') // Replace =3D with equals
            .replace(/=0A/g, '\n') // Replace =0A with newlines
            .replace(/=0D/g, '\r') // Replace =0D with carriage returns
            .trim();
    }

	// Remove unsafe/invalid head markup and normalize asset URLs
	sanitizeEmailHtml(html) {
		try {
			// Drop head and its children to avoid meta parsing errors
			html = html.replace(/<head[\s\S]*?>[\s\S]*?<\/head>/gi, '');
			// Remove meta, script, link, base tags anywhere
			html = html.replace(/<\s*(meta|script|link|base)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, '');
			html = html.replace(/<\s*(meta|script|link|base)[^>]*>/gi, '');
			// Upgrade insecure src/href to https
			html = html.replace(/(\s(?:src|href)=")http:\/\//gi, '$1https://');
			// Prevent navigation JS URLs
			html = html.replace(/href="javascript:[^"]*"/gi, 'href="#"');
			return html;
		} catch (e) {
			console.warn('[EmailSanitize] Failed to sanitize HTML', e);
			return html;
		}
	}


    bindEmailViewerEvents(modal, email) {
        // Close button
        modal.querySelector('[data-action="close"]').addEventListener('click', () => {
            this.closeEmailViewer(modal);
        });

        // Reply button
        modal.querySelector('[data-action="reply"]').addEventListener('click', () => {
            this.showComposeInModal(modal, email, 'reply');
        });

        // Reply All button
        modal.querySelector('[data-action="reply-all"]').addEventListener('click', () => {
            this.showComposeInModal(modal, email, 'reply-all');
        });

        // Forward button
        modal.querySelector('[data-action="forward"]').addEventListener('click', () => {
            this.showComposeInModal(modal, email, 'forward');
        });

        // Star button
        modal.querySelector('[data-action="star"]').addEventListener('click', () => {
            this.toggleEmailStar(email);
        });

        // Compose actions
        modal.querySelector('[data-action="close-compose"]').addEventListener('click', () => {
            this.hideComposeInModal(modal);
        });

        modal.querySelector('[data-action="send-reply"]').addEventListener('click', () => {
            this.sendReplyFromModal(modal, email);
        });

        modal.querySelector('[data-action="save-draft"]').addEventListener('click', () => {
            this.saveDraftFromModal(modal);
        });

        modal.querySelector('[data-action="cancel-reply"]').addEventListener('click', () => {
            this.hideComposeInModal(modal);
        });

        // Initialize editor toolbar
        this.initializeModalEditorToolbar(modal);

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeEmailViewer(modal);
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('show')) {
                this.closeEmailViewer(modal);
            }
        });
    }

    closeEmailViewer(modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 300);
    }

    showComposeInModal(modal, email, type) {
        const composeSection = modal.querySelector('.email-viewer-compose');
        const bodySection = modal.querySelector('.email-viewer-body');
        
        // Hide body, show compose with proper styling
        bodySection.style.display = 'none';
        composeSection.style.display = 'block';
        composeSection.classList.add('show');
        
        // Ensure compose section has solid background
        composeSection.style.background = 'var(--bg-card)';
        composeSection.style.opacity = '1';
        composeSection.style.visibility = 'visible';
        
        // Set up compose data based on type
        const toInput = modal.querySelector('#modal-compose-to');
        const subjectInput = modal.querySelector('#modal-compose-subject');
        const contentEditor = modal.querySelector('#modal-compose-content');
        
        if (type === 'reply') {
            toInput.value = email.from || '';
            subjectInput.value = email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`;
            contentEditor.innerHTML = `<br><br>--- Original Message ---<br>From: ${email.from}<br>Date: ${this.formatDate(email.date)}<br>Subject: ${email.subject}<br><br>${email.content || email.snippet}`;
        } else if (type === 'reply-all') {
            toInput.value = `${email.from}, ${email.to}`;
            subjectInput.value = email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`;
            contentEditor.innerHTML = `<br><br>--- Original Message ---<br>From: ${email.from}<br>Date: ${this.formatDate(email.date)}<br>Subject: ${email.subject}<br><br>${email.content || email.snippet}`;
        } else if (type === 'forward') {
            toInput.value = '';
            subjectInput.value = email.subject.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject}`;
            contentEditor.innerHTML = `<br><br>--- Forwarded Message ---<br>From: ${email.from}<br>Date: ${this.formatDate(email.date)}<br>Subject: ${email.subject}<br><br>${email.content || email.snippet}`;
        }
        
        // Focus on content editor
        setTimeout(() => contentEditor.focus(), 100);
    }

    hideComposeInModal(modal) {
        const composeSection = modal.querySelector('.email-viewer-compose');
        const bodySection = modal.querySelector('.email-viewer-body');
        
        // Show body, hide compose
        bodySection.style.display = 'block';
        composeSection.style.display = 'none';
        composeSection.classList.remove('show');
    }

    initializeModalEditorToolbar(modal) {
        const toolbar = modal.querySelector('.editor-toolbar');
        const editor = modal.querySelector('#modal-compose-content');
        
        // Bind toolbar events (reuse existing toolbar functionality)
        toolbar.addEventListener('click', (e) => {
            const btn = e.target.closest('.fmt-btn');
            if (!btn) return;
            
            e.preventDefault();
            const format = btn.dataset.format;
            
            if (format === 'ai') {
                // Handle AI generation
                this.handleAIGeneration(editor);
            } else if (format === 'createLink') {
                // Handle link creation
                this.handleLinkCreation(editor);
            } else {
                // Handle standard formatting
                document.execCommand(format, false, null);
                editor.focus();
            }
        });
    }

    handleAIGeneration(editor) {
        // Reuse existing AI generation logic
        if (window.crm && window.crm.showToast) {
            window.crm.showToast('AI generation coming soon in modal!');
        }
    }

    handleLinkCreation(editor) {
        const url = prompt('Enter URL:');
        if (url) {
            document.execCommand('createLink', false, url);
            editor.focus();
        }
    }

    sendReplyFromModal(modal, originalEmail) {
        const toInput = modal.querySelector('#modal-compose-to');
        const subjectInput = modal.querySelector('#modal-compose-subject');
        const contentEditor = modal.querySelector('#modal-compose-content');
        
        // Threading metadata
        const threadId = originalEmail.threadId || originalEmail.messageId || null;
        const inReplyTo = originalEmail.messageId || null;
        const references = Array.isArray(originalEmail.references) ? originalEmail.references.concat(inReplyTo || []).filter(Boolean) : (inReplyTo ? [inReplyTo] : []);

        const emailData = {
            to: toInput.value,
            subject: subjectInput.value,
            content: contentEditor.innerHTML,
            threadId,
            inReplyTo,
            references
        };
        
        // Send email via SendGrid directly with threading
        this.sendEmailViaSendGrid({ ...emailData, _deliverability: (window.SettingsPage && window.SettingsPage.getSettings ? (window.SettingsPage.getSettings().emailDeliverability||{}) : {}) }).then(() => {
            window.crm?.showToast('Reply sent successfully!');
            this.hideComposeInModal(modal);
        }).catch(error => {
            console.error('Error sending reply:', error);
            window.crm?.showToast('Failed to send reply. Please try again.');
        });
    }

    saveDraftFromModal(modal) {
        // Save draft functionality
        window.crm?.showToast('Draft saved!');
    }

    replyToEmail(email, type) {
        this.closeEmailViewer(document.querySelector('.email-viewer-modal'));
        
        // Open compose with reply data
        const composeData = {
            to: type === 'reply' ? email.from : `${email.from}, ${email.to}`,
            subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
            content: `\n\n--- Original Message ---\nFrom: ${email.from}\nDate: ${this.formatDate(email.date)}\nSubject: ${email.subject}\n\n${email.content || email.snippet}`
        };
        
        this.openCompose(composeData);
    }

    forwardEmail(email) {
        this.closeEmailViewer(document.querySelector('.email-viewer-modal'));
        
        // Open compose with forward data
        const composeData = {
            to: '',
            subject: email.subject.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject}`,
            content: `\n\n--- Forwarded Message ---\nFrom: ${email.from}\nDate: ${this.formatDate(email.date)}\nSubject: ${email.subject}\n\n${email.content || email.snippet}`
        };
        
        this.openCompose(composeData);
    }

    toggleEmailStar(email) {
        email.starred = !email.starred;
        
        // Update UI
        const emailItem = document.querySelector(`[data-email-id="${email.id}"]`);
        if (emailItem) {
            const starBtn = emailItem.querySelector('.email-item-star');
            if (starBtn) {
                starBtn.classList.toggle('starred', email.starred);
                const svg = starBtn.querySelector('svg');
                if (svg) {
                    svg.setAttribute('fill', email.starred ? 'currentColor' : 'none');
                }
            }
        }

        // Update in viewer if open
        const viewer = document.querySelector('.email-viewer-modal');
        if (viewer) {
            const starBtn = viewer.querySelector('[data-action="star"]');
            if (starBtn) {
                starBtn.classList.toggle('starred', email.starred);
                const svg = starBtn.querySelector('svg');
                if (svg) {
                    svg.setAttribute('fill', email.starred ? 'currentColor' : 'none');
                }
            }
        }

        window.crm?.showToast(`Email ${email.starred ? 'starred' : 'unstarred'}`);
    }

    openCompose(composeData = {}) {
        // Switch to compose mode
        this.switchFolder('compose');
        
        // Fill in compose data
        setTimeout(() => {
            const toInput = document.getElementById('compose-to');
            const subjectInput = document.getElementById('compose-subject');
            const contentTextarea = document.getElementById('compose-content');
            
            if (toInput && composeData.to) toInput.value = composeData.to;
            if (subjectInput && composeData.subject) subjectInput.value = composeData.subject;
            if (contentTextarea && composeData.content) contentTextarea.value = composeData.content;
        }, 100);
    }

    setupEmailTrackingListeners() {
        // Listen for email tracking events
        document.addEventListener('email-opened', (event) => {
            console.log('[EmailManager] Email opened event:', event.detail);
            this.handleEmailOpened(event.detail);
        });

        document.addEventListener('email-replied', (event) => {
            console.log('[EmailManager] Email replied event:', event.detail);
            this.handleEmailReplied(event.detail);
        });
    }

    handleEmailOpened(notification) {
        // Show notification
        if (window.crm && typeof window.crm.showToast === 'function') {
            window.crm.showToast(`📧 ${notification.message}`, 'success');
        }

        // Real-time listener will automatically update the UI
        console.log('[EmailManager] Email opened notification received - UI will update via real-time listener');
    }

    handleEmailReplied(notification) {
        // Show notification
        if (window.crm && typeof window.crm.showToast === 'function') {
            window.crm.showToast(`💬 ${notification.message}`, 'success');
        }

        // Real-time listener will automatically update the UI
        console.log('[EmailManager] Email replied notification received - UI will update via real-time listener');
    }

    /**
     * Validate context data before AI generation
     * @param {Object} recipient - The recipient data
     * @param {string} prompt - The user prompt
     * @returns {Object} Validation result with isValid flag and issues array
     */
    validateContextData(recipient, prompt) {
        const issues = [];
        let score = 0;
        const maxScore = 10;

        // Check if recipient exists
        if (!recipient) {
            issues.push('No recipient data available');
            return { isValid: false, issues, score: 0, maxScore };
        }

        // Basic recipient info (2 points)
        if (recipient.name || recipient.fullName) {
            score += 1;
        } else {
            issues.push('Missing recipient name');
        }

        if (recipient.email) {
            score += 1;
        } else {
            issues.push('Missing recipient email');
        }

        // Company info (2 points)
        if (recipient.company || recipient.account?.name) {
            score += 1;
        } else {
            issues.push('Missing company information');
        }

        if (recipient.title || recipient.job) {
            score += 1;
        } else {
            issues.push('Missing job title');
        }

        // Energy contract details (3 points)
        if (recipient.energy) {
            if (recipient.energy.supplier) {
                score += 1;
            } else {
                issues.push('Missing energy supplier');
            }

            if (recipient.energy.contractEnd) {
                score += 1;
            } else {
                issues.push('Missing contract end date');
            }

            if (recipient.energy.currentRate) {
                score += 1;
            } else {
                issues.push('Missing current rate');
            }
        } else {
            issues.push('No energy contract data available');
        }

        // Notes and context (2 points)
        if (recipient.notes && recipient.notes.trim()) {
            score += 1;
        } else {
            issues.push('No notes available for personalization');
        }

        if (recipient.transcript && recipient.transcript.trim()) {
            score += 1;
        } else {
            issues.push('No call transcript available');
        }

        // Account context (1 point)
        if (recipient.account && (recipient.account.industry || recipient.account.city)) {
            score += 1;
        } else {
            issues.push('Limited account context available');
        }

        const isValid = score >= 5; // Require at least 50% context completeness

        console.log(`[ContextValidation] Score: ${score}/${maxScore}, Valid: ${isValid}`);
        if (issues.length > 0) {
            console.log('[ContextValidation] Issues:', issues);
        }

        return {
            isValid,
            issues,
            score,
            maxScore,
            completeness: Math.round((score / maxScore) * 100)
        };
    }

    /**
     * Detect if prompt is manual vs AI-generated
     * @param {string} prompt - The user prompt
     * @returns {boolean} True if manual prompt
     */
    isManualPrompt(prompt) {
        if (!prompt || prompt.length < 20) return false;
        
        // Manual prompts are typically longer and more conversational
        const manualIndicators = [
            prompt.length > 100,
            /^(hi|hello|hey)/i.test(prompt.trim()),
            /^(i want|i need|please)/i.test(prompt.trim()),
            /^(can you|could you|would you)/i.test(prompt.trim()),
            prompt.includes('?'),
            prompt.includes('!'),
            prompt.split(' ').length > 15
        ];
        
        return manualIndicators.filter(Boolean).length >= 2;
    }

    /**
     * Check if cursor is near the signature boundary
     * @param {HTMLElement} editor - The email editor element
     * @param {Range} range - The current selection range
     * @returns {boolean} True if cursor is near signature
     */
    isCursorNearSignature(editor, range) {
        try {
            // Look for signature boundary markers
            const signatureMarkers = [
                'margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;',
                'border-top: 1px solid #e0e0e0;',
                'alt="Signature"'
            ];
            
            // Get the HTML content and find signature position
            const html = editor.innerHTML;
            let signatureStart = -1;
            
            for (const marker of signatureMarkers) {
                const pos = html.indexOf(marker);
                if (pos !== -1) {
                    signatureStart = pos;
                    break;
                }
            }
            
            if (signatureStart === -1) {
                return false; // No signature found
            }
            
            // Get the current cursor position in the HTML
            const walker = document.createTreeWalker(
                editor,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            
            let currentPos = 0;
            let node;
            let cursorPos = 0;
            
            while (node = walker.nextNode()) {
                const nodeLength = node.textContent.length;
                if (range.startContainer === node) {
                    cursorPos = currentPos + range.startOffset;
                    break;
                }
                currentPos += nodeLength;
            }
            
            // Check if cursor is within 50 characters of signature start
            const distanceFromSignature = signatureStart - cursorPos;
            return distanceFromSignature < 50 && distanceFromSignature > -10;
            
        } catch (error) {
            console.warn('[Signature] Error checking cursor position:', error);
            return false;
        }
    }

    /**
     * Insert a single line break without double spacing
     * @param {HTMLElement} editor - The email editor element
     */
    insertSingleLineBreak(editor) {
        try {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
                console.warn('[Enter] No selection found');
                return;
            }
            
            const range = selection.getRangeAt(0);
            console.log('[Enter] Inserting line break at position:', range.startOffset);
            
            // Simple approach: just insert a line break
            const br = document.createElement('br');
            range.insertNode(br);
            
            // Move cursor after the line break
            const newRange = document.createRange();
            newRange.setStartAfter(br);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
            
            console.log('[Enter] Line break inserted successfully');
            
            // Clean up any extra spacing
            setTimeout(() => this.cleanZeroWidthSpans(editor), 0);
            
        } catch (error) {
            console.warn('[Enter] Error inserting line break:', error);
            // Fallback: try execCommand
            try {
                document.execCommand('insertHTML', false, '<br>');
                console.log('[Enter] Fallback line break inserted');
            } catch (fallbackError) {
                console.error('[Enter] Fallback also failed:', fallbackError);
            }
        }
    }

    /**
     * Check if cursor is at the end of a block element
     * @param {Node} container - The container node
     * @param {Range} range - The selection range
     * @returns {boolean} True if at end of block
     */
    isAtEndOfBlockElement(container, range) {
        try {
            // Check if we're in a text node at the end of a block element
            if (container.nodeType === Node.TEXT_NODE) {
                const textLength = container.textContent.length;
                const isAtEnd = range.startOffset === textLength;
                
                // Check if parent is a block element
                const parent = container.parentElement;
                if (parent && ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(parent.tagName)) {
                    return isAtEnd;
                }
            }
            
            // Check if we're at the end of a block element
            if (container.nodeType === Node.ELEMENT_NODE) {
                const element = container;
                if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(element.tagName)) {
                    const childCount = element.childNodes.length;
                    return range.startOffset === childCount;
                }
            }
            
            return false;
        } catch (error) {
            console.warn('[Enter] Error checking block element:', error);
            return false;
        }
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

    // Check authentication state from localStorage
    const isAuthenticated = localStorage.getItem('gmail-authenticated') === 'true';
    emailManager.isAuthenticated = isAuthenticated;

    // Update UI based on authentication state
    emailManager.updateAuthenticationUI();

    // Always load emails from tracking system (regardless of Gmail auth)
    // The tracking system handles both sent and received emails
    emailManager.loadEmails();

    // Debug helper: run search and force open suggestions under To field
    window.debugComposeAutocomplete = async function(query = '') {
        try {
            console.log('[DebugComposeAutocomplete] start with query:', query);
            const composeWindow = document.getElementById('compose-window');
            if (!composeWindow) { console.warn('[DebugComposeAutocomplete] compose-window not found'); return; }
            const input = composeWindow.querySelector('#compose-to');
            const panel = composeWindow.querySelector('#compose-to-suggestions');
            if (!input || !panel) { console.warn('[DebugComposeAutocomplete] input or panel missing'); return; }
            input.focus();
            await (async () => { const t0 = Date.now(); while(!window.firebaseDB && Date.now()-t0<3000) await new Promise(r=>setTimeout(r,100)); })();
            let snap, used = 'contacts';
            try { snap = await window.firebaseDB.collection('contacts').get(); } catch { used = 'people'; snap = await window.firebaseDB.collection('people').get(); }
            console.log('[DebugComposeAutocomplete] collection', used, 'size', snap?.size);
            const sample = [];
            let count = 0;
            snap.forEach(doc => { if (count < 3) { sample.push({ id: doc.id, ...((doc.data && doc.data()) || {}) }); count++; } });
            console.log('[DebugComposeAutocomplete] sample docs:', sample);
            const list = await window.emailManager.fetchContactsForCompose(query);
            console.log('[DebugComposeAutocomplete] matched', list.length, 'first 5:', list.slice(0,5));
            // Render in panel
            panel.hidden = false; input.setAttribute('aria-expanded','true');
            panel.innerHTML = list.slice(0,8).map(p => {
                const name = p.fullName || p.name || `${p.firstName||''} ${p.lastName||''}`.trim();
                const email = p.email || '';
                return `<div class="suggestion-item" data-id="${p.id}" data-email="${email}" data-name="${name}"><div class="sugg-main">${name||email}</div><div class="sugg-sub">${email}</div></div>`;
            }).join('') || '<div class="suggestion-empty">No matches</div>';
        } catch (e) {
            console.error('[DebugComposeAutocomplete] error', e);
        }
    };
}

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEmailsPage);
} else {
    initEmailsPage();
}

// Export for global access
window.emailManager = emailManager;

// Global enter key handler for email composition  
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        const editor = document.querySelector('.body-input');
        if (editor && editor.contains(e.target)) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            // Get selection
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return;
            
            const range = selection.getRangeAt(0);
            const container = range.startContainer;
            
            // Check if we're inside signature - if so, block
            let node = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
            while (node && node !== editor) {
                if (node.getAttribute && node.getAttribute('data-signature') === 'true') {
                    return; // Don't allow editing in signature
                }
                node = node.parentElement;
            }
            
            // Use a simple approach: just insert a single <br> tag
            const br = document.createElement('br');
            range.deleteContents();
            range.insertNode(br);
            range.setStartAfter(br);
            range.setEndAfter(br);
            range.collapse(true);
            
            selection.removeAllRanges();
            selection.addRange(range);
            
            // Prevent any additional browser processing
            return false;
        }
    }
}, true); // Use capture phase to intercept before other handlers


// Prevent cursor from moving into signature area on click
document.addEventListener('click', (e) => {
    const editor = document.querySelector('.body-input');
    if (editor && editor.contains(e.target)) {
        // Check if click was on or inside signature
        let node = e.target;
        while (node && node !== editor) {
            if (node.getAttribute && node.getAttribute('data-signature') === 'true') {
                console.log('[Click] Clicked inside signature - moving cursor before it');
                e.preventDefault();
                
                // Move cursor to just before the signature
                const range = document.createRange();
                const selection = window.getSelection();
                range.setStartBefore(node);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
                return;
            }
            node = node.parentElement;
        }
    }
});

// Global helper to open compose with a prefilled recipient (sitewide)
// Usage: window.EmailCompose.openTo('someone@company.com', 'Optional Name')
;(function(){
  if (!window.EmailCompose) window.EmailCompose = {};
  window.EmailCompose.openTo = function(toEmail, name = '') {
    try { toEmail = String(toEmail || '').trim(); } catch(_) { toEmail = ''; }
    if (!toEmail || !/@/.test(toEmail)) {
      window.crm?.showToast && window.crm.showToast('No valid email found');
      return;
    }
    // Open the compose modal in-place without navigating pages
    // Wait for emailManager to be available, then open compose
    const start = Date.now();
    const giveUpAt = start + 6000; // 6s safety
    (function attempt(){
      const mgr = window.emailManager;
      if (mgr) {
        try {
          // Ensure compose window opens
          if (typeof mgr.openComposeWindow === 'function') mgr.openComposeWindow();
          else if (typeof mgr.composeEmail === 'function') mgr.composeEmail();
          else document.getElementById('compose-email-btn')?.click();
          // Wait for the window to actually become visible, then fill
          let tries = 0;
          const fill = setInterval(()=>{
            tries++;
            const win = document.getElementById('compose-window');
            const toInput = document.getElementById('compose-to');
            const opened = !!win && win.classList.contains('open');
            if (toInput) toInput.value = toEmail;
            if (opened || tries > 15) {
              clearInterval(fill);
              setTimeout(()=>{ document.getElementById('compose-subject')?.focus(); }, 60);
            }
          }, 120);
        } catch (e) { console.warn('[EmailCompose] open failed', e); }
        return;
      }
      if (Date.now() < giveUpAt) { return setTimeout(attempt, 120); }
      // Last fallback: try to set field if exists
      try { document.getElementById('compose-to').value = toEmail; } catch(_) {}
    })();
  };
})();

