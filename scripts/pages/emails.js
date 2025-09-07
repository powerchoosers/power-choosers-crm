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
        this.SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';
        
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
        
        this.init();
    }

    renderAIBar(aiBar) {
        if (!aiBar) return;
        const suggestions = [
            'Warm intro after a call',
            'Follow-up with tailored value props',
            'Schedule a quick demo',
            'Proposal delivery with next steps',
            'Cold email to a lead I could not reach by phone'
        ];
        aiBar.innerHTML = `
            <div class="ai-inner">
                <div class="ai-row">
                    <textarea class="ai-prompt input-dark" rows="3" placeholder="Describe the email you want... (tone, goal, offer, CTA)"></textarea>
                </div>
                <div class="ai-row suggestions" role="list">
                    ${suggestions.map(s => `<button class="ai-suggestion" type="button">${s}</button>`).join('')}
                </div>
                <div class="ai-row actions">
                    <button class="fmt-btn ai-generate" data-mode="standard">Generate Standard</button>
                    <button class="fmt-btn ai-generate" data-mode="html">Generate HTML</button>
                    <button class="fmt-btn ai-close" type="button">Close</button>
                    <div class="ai-status" aria-live="polite"></div>
                </div>
            </div>
        `;
        // Wire events
        aiBar.querySelectorAll('.ai-suggestion').forEach(btn => {
            btn.addEventListener('click', () => {
                const ta = aiBar.querySelector('.ai-prompt');
                ta.value = btn.textContent;
                ta.focus();
            });
        });
        aiBar.querySelector('.ai-close')?.addEventListener('click', () => {
            aiBar.classList.remove('open');
            aiBar.setAttribute('aria-hidden', 'true');
        });
        aiBar.querySelectorAll('.ai-generate').forEach(btn => {
            btn.addEventListener('click', async () => {
                const mode = btn.getAttribute('data-mode') || 'standard';
                await this.generateWithAI(aiBar, mode);
            });
        });
    }

    async generateWithAI(aiBar, mode = 'standard') {
        const compose = document.getElementById('compose-window');
        const editor = compose?.querySelector('.body-input');
        const status = aiBar?.querySelector('.ai-status');
        const prompt = aiBar?.querySelector('.ai-prompt')?.value?.trim() || '';
        const toInput = compose?.querySelector('#compose-to');
        const recipient = this._selectedRecipient || null;
        if (!editor) return;
        status.textContent = 'Generating...';
        try {
            const localUrl = '/api/gemini-email';
            const prodUrl = 'https://power-choosers-crm.vercel.app/api/gemini-email';
            const payload = { prompt, mode, recipient, to: toInput?.value || '' };
            let res;
            try {
                res = await fetch(localUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } catch (netErr) {
                console.warn('[AI] Local request failed, falling back to production endpoint', netErr);
                res = await fetch(prodUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }
            let data = null;
            try { data = await res.json(); } catch (_) { data = null; }
            if (!res.ok) {
                // If local returned 404, retry against production once
                if (res.status === 404) {
                    console.warn('[AI] Local /api/gemini-email 404, retrying against production');
                    const res2 = await fetch(prodUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    let data2 = null; try { data2 = await res2.json(); } catch (_) {}
                    if (!res2.ok) {
                        const msg2 = (data2 && (data2.error || data2.message)) || `HTTP ${res2.status}`;
                        console.error('[AI] Production generation failed', { status: res2.status, data: data2 });
                        status.textContent = `Generation failed: ${msg2}`;
                        return;
                    }
                    const output2 = data2?.output || '';
                    if (mode === 'html') {
                        if (!this._isHtmlMode) this.toggleHtmlMode(compose);
                        editor.textContent = output2;
                        status.textContent = 'Inserted HTML into editor (prod).';
                    } else {
                        if (this._isHtmlMode) this.toggleHtmlMode(compose);
                        editor.innerHTML = output2;
                        this.normalizeVariablesInEditor(editor);
                        status.textContent = 'Draft inserted (prod).';
                    }
                    return;
                }
                const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
                console.error('[AI] Generation failed', { status: res.status, data });
                status.textContent = `Generation failed: ${msg}`;
                return;
            }
            const output = data?.output || '';
            if (mode === 'html') {
                // Switch to HTML mode and set raw HTML
                if (!this._isHtmlMode) this.toggleHtmlMode(compose);
                editor.textContent = output;
                status.textContent = 'Inserted HTML into editor.';
            } else {
                // Insert styled HTML into rich editor
                if (this._isHtmlMode) this.toggleHtmlMode(compose);
                editor.innerHTML = output;
                this.normalizeVariablesInEditor(editor);
                status.textContent = 'Draft inserted.';
            }
        } catch (e) {
            console.error('AI generation failed', e);
            status.textContent = `Generation failed: ${e?.message || e}`;
        }
    }

    // Recipient autocomplete for #compose-to
    initRecipientAutocomplete(composeWindow) {
        const input = composeWindow.querySelector('#compose-to');
        const panel = composeWindow.querySelector('#compose-to-suggestions');
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
        const openPanel = () => { panel.hidden = false; input.setAttribute('aria-expanded', 'true'); };
        const render = (items=[]) => {
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
        document.addEventListener('click', (evt) => { if (!panel.contains(evt.target) && evt.target !== input) { console.log('[ComposeAutocomplete] doc click closing panel'); closePanel(); } });
        panel.addEventListener('click', (evt) => {
            const row = evt.target.closest('.suggestion-item');
            if (!row) return;
            const name = row.getAttribute('data-name') || '';
            const email = row.getAttribute('data-email') || '';
            const id = row.getAttribute('data-id') || '';
            // Populate with email only as requested
            input.value = email || name;
            this._selectedRecipient = { id, name, email };
            console.log('[ComposeAutocomplete] selected', this._selectedRecipient);
            closePanel();
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
        // Force show auth prompt on initial load
        this.showAuthPrompt();
    }

    async loadGIS() {
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
        // With GIS, we do not have persistent auth state; check for a token
        if (!this.accessToken) {
            this.isAuthenticated = false;
            this.showAuthPrompt();
            return;
        }
        this.isAuthenticated = true;
    }

    showAuthPrompt() {
        const emailList = document.getElementById('email-list');
        if (!emailList) return;

        // Check if we're on a secure context (HTTPS or localhost)
        const isSecure = window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost';
        
        emailList.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px 20px; min-height: 400px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 48 48" style="margin-bottom: 8px;">
                    <path fill="#4caf50" d="M45,16.2l-5,2.75l-5,4.75L35,40h7c1.657,0,3-1.343,3-3V16.2z"></path>
                    <path fill="#1e88e5" d="M3,16.2l3.614,1.71L13,23.7V40H6c-1.657,0-3-1.343-3-3V16.2z"></path>
                    <polygon fill="#e53935" points="35,11.2 24,19.45 13,11.2 12,17 13,23.7 24,31.95 35,23.7 36,17"></polygon>
                    <path fill="#c62828" d="M3,12.298V16.2l10,7.5V11.2L9.876,8.859C9.132,8.301,8.228,8,7.298,8h0C4.924,8,3,9.924,3,12.298z"></path>
                    <path fill="#fbc02d" d="M45,12.298V16.2l-10,7.5V11.2l3.124-2.341C38.868,8.301,39.772,8,40.702,8h0 C43.076,8,45,9.924,45,12.298z"></path>
                </svg>
                <h3 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 600; color: var(--text-primary);">Connect Gmail</h3>
                <p style="margin: 0 0 20px 0; font-size: 14px; color: var(--text-secondary); line-height: 1.5; max-width: 400px;">Sign in with Google to pull your inbox into Power Choosers.</p>
                <div style="display:flex; gap:12px; margin-top: 8px;">
                    <button class="gmail-signin-btn" onclick="window.emailManager?.authenticate()">
                      Sign In
                    </button>
                </div>
            </div>
        `;
    }

    async authenticate() {
        if (!this.tokenClient) {
            window.crm?.showToast('Google Identity Services not loaded. Please refresh.');
            return;
        }
        try {
            console.log('Starting Google authentication (GIS)...');
            await new Promise((resolve) => {
                // Prompt the user only if we do not yet have a token
                this.tokenClient.callback = (resp) => {
                    if (resp && resp.access_token) {
                        this.accessToken = resp.access_token;
                        this.isAuthenticated = true;
                        resolve();
                    } else {
                        resolve();
                    }
                };
                this.tokenClient.requestAccessToken({ prompt: this.accessToken ? '' : 'consent' });
            });
            if (this.isAuthenticated) {
            await this.loadEmails();
            window.crm?.showToast('Successfully connected to Gmail!');
            } else {
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
        if (!this.isAuthenticated || !this.accessToken) {
            this.showAuthPrompt();
            return;
        }

        this.showLoading();

        try {
            const query = this.buildQuery();
            const base = 'https://gmail.googleapis.com/gmail/v1/users/me';
            const listUrl = `${base}/messages?maxResults=50&q=${encodeURIComponent(query)}`;
            const headers = { Authorization: `Bearer ${this.accessToken}` };

            const listResp = await fetch(listUrl, { headers });
            if (!listResp.ok) throw new Error(`Gmail list failed: ${listResp.status}`);
            const listJson = await listResp.json();

            if (Array.isArray(listJson.messages) && listJson.messages.length) {
                const emailPromises = listJson.messages.map(async (msg) => {
                    const url = `${base}/messages/${encodeURIComponent(msg.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`;
                    const r = await fetch(url, { headers });
                    if (!r.ok) return null;
                    return r.json();
                });
                const emailResults = (await Promise.all(emailPromises)).filter(Boolean);
                this.emails = emailResults.map(result => this.parseEmailData(result));
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
        this.openComposeWindow();
    }

    openComposeWindow() {
        const composeWindow = document.getElementById('compose-window');
        if (!composeWindow) return;

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

    closeComposeWindow() {
        const composeWindow = document.getElementById('compose-window');
        if (!composeWindow) return;

        composeWindow.classList.remove('open');
        setTimeout(() => {
            composeWindow.style.display = 'none';
            composeWindow.classList.remove('minimized', 'maximized');
        }, 300);
    }

    initializeComposeWindow() {
        const composeWindow = document.getElementById('compose-window');
        if (!composeWindow) return;
        

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

        // Send button
        const sendBtn = document.getElementById('compose-send');
        sendBtn?.addEventListener('click', () => {
            this.sendEmail();
        });

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

    // Toolbar actions for the compose editor (top bar with icons)
    handleToolbarAction(action, btn, editor, formattingBar, linkBar) {
        try {
            const composeWindow = editor?.closest?.('#compose-window') || document.getElementById('compose-window');
            const variablesBar = composeWindow?.querySelector('.variables-bar');
            const aiBar = composeWindow?.querySelector('.ai-bar');
            console.log('[Toolbar] handleToolbarAction:', action, { editor, formattingBar, linkBar, variablesBar });
            switch (action) {
                case 'formatting': {
                    const isOpen = formattingBar?.classList.toggle('open');
                    formattingBar?.setAttribute('aria-hidden', String(!isOpen));
                    linkBar?.classList.remove('open');
                    linkBar?.setAttribute('aria-hidden', 'true');
                    variablesBar?.classList.remove('open');
                    variablesBar?.setAttribute('aria-hidden', 'true');
                    aiBar?.classList.remove('open');
                    aiBar?.setAttribute('aria-hidden', 'true');
                    break;
                }
                case 'link': {
                    const isOpen = linkBar?.classList.toggle('open');
                    linkBar?.setAttribute('aria-hidden', String(!isOpen));
                    formattingBar?.classList.remove('open');
                    formattingBar?.setAttribute('aria-hidden', 'true');
                    variablesBar?.classList.remove('open');
                    variablesBar?.setAttribute('aria-hidden', 'true');
                    aiBar?.classList.remove('open');
                    aiBar?.setAttribute('aria-hidden', 'true');
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
                    if (variablesBar && !variablesBar.classList.contains('open')) this.renderVariablesBar(variablesBar);
                    const isOpen = variablesBar?.classList.toggle('open');
                    variablesBar?.setAttribute('aria-hidden', String(!isOpen));
                    formattingBar?.querySelectorAll?.('.format-popover')?.forEach(p => p.classList.remove('open'));
                    aiBar?.classList.remove('open');
                    aiBar?.setAttribute('aria-hidden', 'true');
                    break;
                }
                case 'ai': {
                    if (aiBar && !aiBar.classList.contains('open')) this.renderAIBar(aiBar);
                    const isOpen = aiBar?.classList.toggle('open');
                    aiBar?.setAttribute('aria-hidden', String(!isOpen));
                    // close others
                    formattingBar?.classList.remove('open');
                    formattingBar?.setAttribute('aria-hidden', 'true');
                    linkBar?.classList.remove('open');
                    linkBar?.setAttribute('aria-hidden', 'true');
                    variablesBar?.classList.remove('open');
                    variablesBar?.setAttribute('aria-hidden', 'true');
                    break;
                }
                case 'preview': {
                    this.togglePreview(composeWindow);
                    break;
                }
                case 'ai': {
                    // handled above
                    break;
                }
                case 'image': {
                    window.crm?.showToast('Image upload coming soon');
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

    sendEmail() {
        const toInput = document.getElementById('compose-to');
        const subjectInput = document.getElementById('compose-subject');
        const bodyInput = document.querySelector('.body-input');
        
        const to = toInput?.value?.trim() || '';
        const subject = subjectInput?.value?.trim() || '';
        const body = bodyInput?.innerHTML || '';
        
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

        // Here you would integrate with your email sending service
        window.crm?.showToast('Email sent successfully!');
        this.closeComposeWindow();
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
