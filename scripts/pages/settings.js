// Power Choosers CRM - Settings Page
// Handles settings management and configuration

class SettingsPage {
    constructor() {
        this.state = {
            settings: {
                emailSignature: {
                    text: '',
                    image: null
                },
                emailDeliverability: {
                    // SendGrid Settings
                    enableTracking: true,
                    enableClickTracking: true,
                    includeBulkHeaders: false,
                    includeListUnsubscribe: true,
                    includePriorityHeaders: false,
                    useBrandedHtmlTemplate: false,
                    signatureImageEnabled: true,
                    // SendGrid specific
                    sendgridEnabled: true,
                    bypassListManagement: false,
                    sandboxMode: false,
                    ipPoolName: '',
                    // Compliance
                    includePhysicalAddress: true,
                    gdprCompliant: true,
                    spamScoreCheck: false
                },
                geminiPrompts: {
                    greeting: '',
                    body: '',
                    subject: ''
                },
                twilioNumbers: [],
                general: {
                    // Google-synced profile (auto-filled)
                    firstName: '',
                    lastName: '',
                    email: '',              // Read-only from Google
                    photoURL: '',           // Google avatar URL
                    hostedPhotoURL: '',     // Re-hosted to Imgur
                    
                    // Editable professional info
                    jobTitle: 'Energy Strategist',
                    location: 'Fort Worth, TX',
                    phone: '',              // Personal/direct line
                    companyName: 'Power Choosers',
                    
                    // Existing fields
                    agentName: 'Power Choosers',
                    autoSaveNotes: true,
                    emailNotifications: true,
                    callRecordingNotifications: false,
                    itemsPerPage: 50,
                    defaultView: 'table'
                }
            },
            isDirty: false
        };
        
        this.init();
    }

    async init() {
        await this.loadSettings();
        this.setupEventListeners();
        injectModernStyles();
        this.renderSettings();
        setupCollapseFunctionality();
        
        // Convert existing data URL signatures to hosted URLs
        await this.convertDataUrlSignature();
    }

    setupEventListeners() {
        // Save settings button
        const saveBtn = document.getElementById('save-settings-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => await this.saveSettings());
        }

        // Email signature text
        const signatureText = document.getElementById('email-signature-text');
        if (signatureText) {
            signatureText.addEventListener('input', (e) => {
                // Persist text to state as the user types
                this.state.settings.emailSignature.text = e.target.value || '';
                this.markDirty();
                // Update preview to reflect latest text above image
                this.renderSignatureSection();
            });
        }

        // Email signature image upload
        const uploadBtn = document.getElementById('upload-signature-image');
        const imageInput = document.getElementById('email-signature-image');
        const convertBtn = document.getElementById('convert-signature-image');
        if (uploadBtn && imageInput) {
            uploadBtn.addEventListener('click', () => imageInput.click());
            imageInput.addEventListener('change', (e) => this.handleImageUpload(e));
        }
        if (convertBtn) {
            convertBtn.addEventListener('click', async () => await this.convertDataUrlSignature());
        }

        // Gemini prompts
        const promptFields = [
            'email-greeting-prompt',
            'email-body-prompt', 
            'email-subject-prompt'
        ];
        promptFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('input', () => this.markDirty());
            }
        });

        // Twilio phone numbers
        const addPhoneBtn = document.getElementById('add-phone-number');
        if (addPhoneBtn) {
            addPhoneBtn.addEventListener('click', () => this.showAddPhoneModal());
        }

        // Profile information fields
        const profileFields = [
            { id: 'user-first-name', key: 'firstName' },
            { id: 'user-last-name', key: 'lastName' },
            { id: 'user-job-title', key: 'jobTitle' },
            { id: 'user-location', key: 'location' },
            { id: 'user-phone', key: 'phone' },
            { id: 'company-name', key: 'companyName' }
        ];

        profileFields.forEach(({ id, key }) => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', (e) => {
                    this.state.settings.general[key] = e.target.value.trim();
                    this.markDirty();
                });
            }
        });

        // General settings checkboxes and selects
        const generalFields = [
            'auto-save-notes',
            'email-notifications', 
            'call-recording-notifications',
            'items-per-page',
            'default-view'
        ];
        generalFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('change', () => this.markDirty());
            }
        });

        // Deliverability & Tracking toggles (SendGrid optimized)
        const deliverabilityFields = [
            'email-trk-enabled',
            'email-click-trk-enabled',
            'email-bulk-headers',
            'email-list-unsub',
            'email-priority-headers',
            'email-branded-html',
            'email-sig-image-enabled',
            'sendgrid-enabled',
            'bypass-list-mgmt',
            'sandbox-mode',
            'ip-pool-name',
            'include-physical-address',
            'gdpr-compliant',
            'spam-score-check'
        ];
        deliverabilityFields.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('change', () => {
                const v = el.type === 'checkbox' ? !!el.checked : el.value;
                switch(id){
                    case 'email-trk-enabled': this.state.settings.emailDeliverability.enableTracking = v; break;
                    case 'email-click-trk-enabled': this.state.settings.emailDeliverability.enableClickTracking = v; break;
                    case 'email-bulk-headers': this.state.settings.emailDeliverability.includeBulkHeaders = v; break;
                    case 'email-list-unsub': this.state.settings.emailDeliverability.includeListUnsubscribe = v; break;
                    case 'email-priority-headers': this.state.settings.emailDeliverability.includePriorityHeaders = v; break;
                    case 'email-branded-html': this.state.settings.emailDeliverability.useBrandedHtmlTemplate = v; break;
                    case 'email-sig-image-enabled': this.state.settings.emailDeliverability.signatureImageEnabled = v; break;
                    case 'sendgrid-enabled': this.state.settings.emailDeliverability.sendgridEnabled = v; break;
                    case 'bypass-list-mgmt': this.state.settings.emailDeliverability.bypassListManagement = v; break;
                    case 'sandbox-mode': this.state.settings.emailDeliverability.sandboxMode = v; break;
                    case 'ip-pool-name': this.state.settings.emailDeliverability.ipPoolName = v; break;
                    case 'include-physical-address': this.state.settings.emailDeliverability.includePhysicalAddress = v; break;
                    case 'gdpr-compliant': this.state.settings.emailDeliverability.gdprCompliant = v; break;
                    case 'spam-score-check': this.state.settings.emailDeliverability.spamScoreCheck = v; break;
                }
                this.markDirty();
            });
        });

        // Phone number actions
        document.addEventListener('click', (e) => {
            if (e.target.matches('[data-action="edit"]')) {
                this.editPhoneNumber(e.target.closest('.phone-number-item'));
            } else if (e.target.matches('[data-action="remove"]')) {
                this.removePhoneNumber(e.target.closest('.phone-number-item'));
            }
        });
    }

    async loadSettings() {
        try {
            // First try to load from Firebase
            if (window.firebaseDB) {
                const settingsDoc = await window.firebaseDB.collection('settings').doc('user-settings').get();
                if (settingsDoc.exists) {
                    const firebaseSettings = settingsDoc.data();
                    this.state.settings = { ...this.state.settings, ...firebaseSettings };
                    console.log('[Settings] Loaded from Firebase');
                }
            }
            
            // Fallback to localStorage if Firebase not available or no data
            if (!this.state.settings.general.firstName) {
            const savedSettings = localStorage.getItem('crm-settings');
            if (savedSettings) {
                try {
                    this.state.settings = { ...this.state.settings, ...JSON.parse(savedSettings) };
                    console.log('[Settings] Loaded from localStorage');
                } catch (error) {
                    console.error('Error loading settings from localStorage:', error);
                    }
                }
            }
        } catch (error) {
            console.error('[Settings] Error loading settings:', error);
            // Fallback to localStorage on error
            const savedSettings = localStorage.getItem('crm-settings');
            if (savedSettings) {
                try {
                    this.state.settings = { ...this.state.settings, ...JSON.parse(savedSettings) };
                } catch (parseError) {
                    console.error('Error parsing localStorage settings:', parseError);
                }
            }
        }
        
        // Auto-populate from Google login
        const user = firebase.auth().currentUser;
        if (user) {
            const nameParts = (user.displayName || '').trim().split(' ');
            
            // Only set if not already customized
            if (!this.state.settings.general.firstName) {
                this.state.settings.general.firstName = nameParts[0] || '';
            }
            if (!this.state.settings.general.lastName) {
                this.state.settings.general.lastName = nameParts.slice(1).join(' ') || '';
            }
            if (!this.state.settings.general.email) {
                this.state.settings.general.email = user.email || '';
            }
            if (user.photoURL && !this.state.settings.general.photoURL) {
                this.state.settings.general.photoURL = user.photoURL;
                // Trigger re-hosting to Imgur
                await this.hostGoogleAvatar(user.photoURL);
            }
        }
    }

    async hostGoogleAvatar(googlePhotoURL) {
        if (!googlePhotoURL || this.state.settings.general.hostedPhotoURL) return;
        
        try {
            // Send Google URL to server to download and re-host
            const apiBase = 'https://power-choosers-crm.vercel.app';
            const uploadResponse = await fetch(`${apiBase}/api/upload/host-google-avatar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ googlePhotoURL })
            });

            if (uploadResponse.ok) {
                const { imageUrl } = await uploadResponse.json();
                if (imageUrl) {
                    this.state.settings.general.hostedPhotoURL = imageUrl;
                    this.markDirty();
                    console.log('[Settings] Google avatar hosted successfully:', imageUrl);
                }
            } else {
                console.warn('[Settings] Upload failed, using Google URL directly');
                this.state.settings.general.hostedPhotoURL = googlePhotoURL;
            }
        } catch (error) {
            console.error('[Settings] Error hosting Google avatar:', error);
            // Fallback to direct Google URL
            this.state.settings.general.hostedPhotoURL = googlePhotoURL;
        }
    }

    async saveSettings() {
        try {
            // Save to Firebase first
            if (window.firebaseDB) {
                await window.firebaseDB.collection('settings').doc('user-settings').set({
                    ...this.state.settings,
                    lastUpdated: new Date().toISOString(),
                    updatedBy: 'user'
                });
                console.log('[Settings] Saved to Firebase');
            }
            
            // Also save to localStorage as backup
            localStorage.setItem('crm-settings', JSON.stringify(this.state.settings));
            
            // Show success message
            if (window.showToast) {
                window.showToast('Settings saved successfully!', 'success');
            }
            
            this.state.isDirty = false;
            this.updateSaveButton();
            
            // Dispatch event for other modules to react to settings changes
            document.dispatchEvent(new CustomEvent('pc:settings-updated', {
                detail: { settings: this.state.settings }
            }));
            
        } catch (error) {
            console.error('[Settings] Error saving settings:', error);
            
            // Fallback to localStorage only if Firebase fails
            try {
                localStorage.setItem('crm-settings', JSON.stringify(this.state.settings));
                console.log('[Settings] Saved to localStorage as fallback');
                
                if (window.showToast) {
                    window.showToast('Settings saved locally (Firebase unavailable)', 'warning');
                }
            } catch (localError) {
                console.error('[Settings] Error saving to localStorage:', localError);
                if (window.showToast) {
                    window.showToast('Error saving settings. Please try again.', 'error');
                }
            }
        }
    }

    markDirty() {
        this.state.isDirty = true;
        this.updateSaveButton();
    }

    // Static method to get current settings (for use by other modules)
    static getSettings() {
        if (window.SettingsPage && window.SettingsPage.instance) {
            return window.SettingsPage.instance.state.settings;
        }
        
        // Fallback to localStorage if SettingsPage not available
        const savedSettings = localStorage.getItem('crm-settings');
        if (savedSettings) {
            try {
                return JSON.parse(savedSettings);
            } catch (error) {
                console.error('Error parsing settings:', error);
            }
        }
        
        return null;
    }

    // Static method to get specific setting value
    static getSetting(path) {
        const settings = this.getSettings();
        if (!settings) return null;
        
        return path.split('.').reduce((obj, key) => obj?.[key], settings);
    }

    updateSaveButton() {
        const saveBtn = document.getElementById('save-settings-btn');
        if (saveBtn) {
            saveBtn.disabled = !this.state.isDirty;
            saveBtn.textContent = this.state.isDirty ? 'Save Changes' : 'All Changes Saved';
        }
    }

    renderSettings() {
        // Render email signature section (text + image preview + controls)
        this.renderSignatureSection();

        // Render Gemini prompts
        const greetingPrompt = document.getElementById('email-greeting-prompt');
        if (greetingPrompt) {
            greetingPrompt.value = this.state.settings.geminiPrompts.greeting || '';
        }

        const bodyPrompt = document.getElementById('email-body-prompt');
        if (bodyPrompt) {
            bodyPrompt.value = this.state.settings.geminiPrompts.body || '';
        }

        const subjectPrompt = document.getElementById('email-subject-prompt');
        if (subjectPrompt) {
            subjectPrompt.value = this.state.settings.geminiPrompts.subject || '';
        }

        // Render Twilio phone numbers
        this.renderPhoneNumbers();

        // Render profile information fields (Google login + editable)
        const g = this.state.settings.general || {};
        
        const userFirstName = document.getElementById('user-first-name');
        if (userFirstName) {
            userFirstName.value = g.firstName || '';
        }
        
        const userLastName = document.getElementById('user-last-name');
        if (userLastName) {
            userLastName.value = g.lastName || '';
        }
        
        const userEmail = document.getElementById('user-email');
        if (userEmail) {
            userEmail.value = g.email || '';
        }
        
        const userJobTitle = document.getElementById('user-job-title');
        if (userJobTitle) {
            userJobTitle.value = g.jobTitle || 'Energy Strategist';
        }
        
        const userLocation = document.getElementById('user-location');
        if (userLocation) {
            userLocation.value = g.location || 'Fort Worth, TX';
        }
        
        const userPhone = document.getElementById('user-phone');
        if (userPhone) {
            userPhone.value = g.phone || '';
        }
        
        const companyName = document.getElementById('company-name');
        if (companyName) {
            companyName.value = g.companyName || 'Power Choosers';
        }
        
        // Render avatar preview if available
        const avatarPreview = document.getElementById('user-avatar-preview');
        if (avatarPreview && (g.hostedPhotoURL || g.photoURL)) {
            const avatarUrl = g.hostedPhotoURL || g.photoURL;
            avatarPreview.innerHTML = `
                <img src="${avatarUrl}" alt="Profile" 
                     style="width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 3px solid var(--orange-primary);">
            `;
        } else if (avatarPreview) {
            avatarPreview.innerHTML = `
                <div style="width: 64px; height: 64px; border-radius: 50%; background: var(--grey-600); display: flex; align-items: center; justify-content: center; color: white; font-size: 24px; font-weight: 600;">
                    ${(g.firstName || 'U').charAt(0).toUpperCase()}
                </div>
            `;
        }

        // Render general settings
        const agentName = document.getElementById('agent-name');
        if (agentName) {
            agentName.value = g.agentName || 'Power Choosers';
        }

        const autoSaveNotes = document.getElementById('auto-save-notes');
        if (autoSaveNotes) {
            autoSaveNotes.checked = this.state.settings.general.autoSaveNotes;
        }

        const emailNotifications = document.getElementById('email-notifications');
        if (emailNotifications) {
            emailNotifications.checked = this.state.settings.general.emailNotifications;
        }

        const callRecordingNotifications = document.getElementById('call-recording-notifications');
        if (callRecordingNotifications) {
            callRecordingNotifications.checked = this.state.settings.general.callRecordingNotifications;
        }

        const itemsPerPage = document.getElementById('items-per-page');
        if (itemsPerPage) {
            itemsPerPage.value = this.state.settings.general.itemsPerPage;
        }

        const defaultView = document.getElementById('default-view');
        if (defaultView) {
            defaultView.value = this.state.settings.general.defaultView;
        }

        // Render deliverability settings (SendGrid optimized)
        const d = this.state.settings.emailDeliverability || {};
        
        // Tracking
        const trk = document.getElementById('email-trk-enabled');
        if (trk) trk.checked = !!d.enableTracking;
        const clickTrk = document.getElementById('email-click-trk-enabled');
        if (clickTrk) clickTrk.checked = !!d.enableClickTracking;
        
        // Headers
        const bulk = document.getElementById('email-bulk-headers');
        if (bulk) bulk.checked = !!d.includeBulkHeaders;
        const unsub = document.getElementById('email-list-unsub');
        if (unsub) unsub.checked = !!d.includeListUnsubscribe;
        const pri = document.getElementById('email-priority-headers');
        if (pri) pri.checked = !!d.includePriorityHeaders;
        
        // Content
        const html = document.getElementById('email-branded-html');
        if (html) html.checked = !!d.useBrandedHtmlTemplate;
        const sigimg = document.getElementById('email-sig-image-enabled');
        if (sigimg) sigimg.checked = !!d.signatureImageEnabled;
        
        // SendGrid specific
        const sgEnabled = document.getElementById('sendgrid-enabled');
        if (sgEnabled) sgEnabled.checked = !!d.sendgridEnabled;
        const bypassList = document.getElementById('bypass-list-mgmt');
        if (bypassList) bypassList.checked = !!d.bypassListManagement;
        const sandbox = document.getElementById('sandbox-mode');
        if (sandbox) sandbox.checked = !!d.sandboxMode;
        const ipPool = document.getElementById('ip-pool-name');
        if (ipPool) ipPool.value = d.ipPoolName || '';
        
        // Compliance
        const physAddr = document.getElementById('include-physical-address');
        if (physAddr) physAddr.checked = !!d.includePhysicalAddress;
        const gdpr = document.getElementById('gdpr-compliant');
        if (gdpr) gdpr.checked = !!d.gdprCompliant;
        const spam = document.getElementById('spam-score-check');
        if (spam) spam.checked = !!d.spamScoreCheck;

        this.updateSaveButton();
    }

    // Render the email signature UI (text field value, image preview, button label, remove action)
    renderSignatureSection() {
        const signature = this.state.settings.emailSignature || {};

        // Sync textarea value from state
        const signatureTextArea = document.getElementById('email-signature-text');
        if (signatureTextArea && signatureTextArea.value !== (signature.text || '')) {
            signatureTextArea.value = signature.text || '';
        }

        // Elements
        const uploadBtn = document.getElementById('upload-signature-image');
        const preview = document.getElementById('signature-image-preview');

        if (!preview) return;

        // Build preview HTML: text (if any) above image (if any)
        let html = '';
        if (signature.text) {
            const textHtml = (signature.text || '').replace(/\n/g, '<br>');
            html += `<div class="signature-text-preview" style="font-family: inherit; font-size: 14px; color: var(--text-primary); line-height: 1.4; margin-bottom: ${signature.image ? '10px' : '0'};">${textHtml}</div>`;
        }
        if (signature.image) {
            html += `
                <div class="signature-image-wrap" style="display:flex; align-items:center; gap:12px;">
                    <img src="${signature.image}" alt="Signature preview" style="max-width: 200px; max-height: 100px; border-radius: 4px;">
                    <button type="button" class="btn-small btn-danger" id="remove-signature-image" title="Remove image">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                            <polyline points="3,6 5,6 21,6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>`;
        }

        // Apply preview state
        if (html) {
            preview.hidden = false;
            preview.innerHTML = html;
        } else {
            preview.hidden = true;
            preview.innerHTML = '';
        }

        // Toggle upload button label between Upload vs Edit
        if (uploadBtn) {
            if (signature.image) {
                uploadBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path>
                        <circle cx="12" cy="13" r="3"></circle>
                    </svg>
                    Edit Image`;
            } else {
                uploadBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path>
                        <circle cx="12" cy="13" r="3"></circle>
                    </svg>
                    Upload Image`;
            }
        }

        // Wire remove button if present
        const removeBtn = document.getElementById('remove-signature-image');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => this.removeSignatureImage());
        }
    }

    renderPhoneNumbers() {
        const phoneList = document.getElementById('twilio-numbers-list');
        if (!phoneList) return;

        if (this.state.settings.twilioNumbers.length === 0) {
            phoneList.innerHTML = `
                <div class="phone-number-item empty-state">
                    <div class="phone-info">
                        <span class="phone-number">No phone numbers configured</span>
                        <span class="phone-label">Add your first business phone number</span>
                    </div>
                </div>
            `;
            return;
        }

        phoneList.innerHTML = this.state.settings.twilioNumbers.map((phone, index) => `
            <div class="phone-number-item" data-index="${index}">
                <div class="phone-info">
                    <span class="phone-number">${phone.number}</span>
                    <span class="phone-label">${phone.label}</span>
                </div>
                <div class="phone-actions">
                    <button class="btn-small btn-secondary" data-action="edit">Edit</button>
                    <button class="btn-small btn-danger" data-action="remove">Remove</button>
                </div>
            </div>
        `).join('');
    }

    async handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            if (window.showToast) {
                window.showToast('Please select a valid image file.', 'error');
            }
            return;
        }

        // Validate file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            if (window.showToast) {
                window.showToast('Image file must be smaller than 2MB.', 'error');
            }
            return;
        }

        try {
            // Show uploading state
            if (window.showToast) {
                window.showToast('Uploading signature image...', 'info');
            }

            // Convert file to base64 and upload as JSON
            const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            // Always use Vercel endpoint (works locally and deployed)
            const apiBase = 'https://power-choosers-crm.vercel.app';
            const response = await fetch(`${apiBase}/api/upload/signature-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64, type: 'signature' })
            });

            if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
            const { imageUrl } = await response.json();
            
            if (imageUrl) {
                // Store the hosted image URL
                this.state.settings.emailSignature.image = imageUrl;
            this.markDirty();
            this.renderSignatureSection();
                
                if (window.showToast) {
                    window.showToast('Signature image uploaded successfully!', 'success');
                }
            } else {
                throw new Error('Failed to upload image');
            }
        } catch (error) {
            console.error('[Signature] Upload error:', error);
            if (window.showToast) {
                window.showToast('Failed to upload signature image. Please try again.', 'error');
            }
        }
    }

    async uploadSignatureImage(file) {
        try {
            // Always use Vercel endpoint for uploads (works locally and deployed)
            const apiBase = 'https://power-choosers-crm.vercel.app';
            
            // Convert file to base64
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const response = await fetch(`${apiBase}/api/upload/signature-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64, type: 'signature' })
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status}`);
            }

            const result = await response.json();
            return result.imageUrl;

        } catch (error) {
            console.error('[Signature] Upload failed (server endpoint):', error);
            throw error;
        }
    }

    async uploadToImgur(file) {
        try {
            // Convert to base64 for Imgur API
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
        reader.readAsDataURL(file);
            });

            const response = await fetch('https://api.imgur.com/3/image', {
                method: 'POST',
                headers: {
                    'Authorization': 'Client-ID 546c25a59c58ad7', // Public Imgur client ID
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    image: base64,
                    type: 'base64'
                })
            });

            if (!response.ok) {
                throw new Error('Imgur upload failed');
            }

            const result = await response.json();
            return result.data.link;

        } catch (error) {
            console.error('[Signature] Imgur upload failed:', error);
            throw error;
        }
    }

    removeSignatureImage() {
        this.state.settings.emailSignature.image = null;
        const imageInput = document.getElementById('email-signature-image');
        if (imageInput) {
            imageInput.value = '';
        }
        this.markDirty();
        this.renderSignatureSection();
    }

    // Convert existing data URL signatures to hosted URLs
    async convertDataUrlSignature() {
        const signature = this.state.settings.emailSignature;
        if (!signature.image || !signature.image.startsWith('data:')) {
            return; // Not a data URL, no conversion needed
        }

        try {
            console.log('[Signature] Converting data URL to hosted URL...');
            
            // Convert data URL to file
            const base64Data = signature.image.split(',')[1];
            const mimeType = signature.image.split(',')[0].split(':')[1].split(';')[0];
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            
            const byteArray = new Uint8Array(byteNumbers);
            const file = new File([byteArray], 'signature.png', { type: mimeType });
            
            // Upload the converted file
            const hostedUrl = await this.uploadSignatureImage(file);
            
            if (hostedUrl) {
                this.state.settings.emailSignature.image = hostedUrl;
                this.markDirty();
                this.renderSignatureSection();
                console.log('[Signature] Successfully converted to hosted URL:', hostedUrl);
            }
            
        } catch (error) {
            console.error('[Signature] Failed to convert data URL:', error);
        }
    }

    showAddPhoneModal() {
        // Check if form already exists
        if (document.getElementById('add-phone-inline-form')) {
            return;
        }

        // Get the button container
        const addBtn = document.getElementById('add-phone-number');
        if (!addBtn) return;

        // Create inline form
        const formHTML = `
            <div id="add-phone-inline-form" class="add-phone-inline-form" style="opacity: 0; transform: translateX(-20px);">
                <div class="inline-form-field">
                    <label for="new-phone-number">Phone Number</label>
                    <input 
                        type="tel" 
                        id="new-phone-number" 
                        class="settings-input" 
                        placeholder="+1 (555) 123-4567"
                        autocomplete="off"
                    >
                </div>
                <div class="inline-form-field">
                    <label for="new-phone-label">Label</label>
                    <input 
                        type="text" 
                        id="new-phone-label" 
                        class="settings-input" 
                        placeholder="Primary Business Line"
                        autocomplete="off"
                    >
                </div>
                <div class="inline-form-actions">
                    <button class="btn-small btn-secondary" id="cancel-add-phone">Cancel</button>
                    <button class="btn-small btn-primary" id="save-add-phone">Save</button>
                </div>
            </div>
        `;

        // Insert form after the "Add Phone Number" button
        addBtn.insertAdjacentHTML('afterend', formHTML);

        // Get form element
        const form = document.getElementById('add-phone-inline-form');

        // Animate in
        requestAnimationFrame(() => {
            form.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            form.style.opacity = '1';
            form.style.transform = 'translateX(0)';
        });

        // Focus first input
        setTimeout(() => {
            document.getElementById('new-phone-number')?.focus();
        }, 100);

        // Cancel button
        document.getElementById('cancel-add-phone')?.addEventListener('click', () => {
            this.hideAddPhoneForm();
        });

        // Save button
        document.getElementById('save-add-phone')?.addEventListener('click', () => {
            this.saveNewPhone();
        });

        // Enter key to save
        form.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.saveNewPhone();
            }
        });

        // Escape key to cancel
        form.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideAddPhoneForm();
            }
        });
    }

    hideAddPhoneForm() {
        const form = document.getElementById('add-phone-inline-form');
        if (!form) return;

        // Animate out
        form.style.opacity = '0';
        form.style.transform = 'translateX(-20px)';

        // Remove after animation
        setTimeout(() => {
            form.remove();
        }, 300);
    }

    saveNewPhone() {
        const phoneNumber = document.getElementById('new-phone-number')?.value.trim();
        const label = document.getElementById('new-phone-label')?.value.trim();

        // Validate
        if (!phoneNumber) {
            if (window.showToast) {
                window.showToast('Please enter a phone number', 'error');
            }
            document.getElementById('new-phone-number')?.focus();
            return;
        }

        if (!label) {
            if (window.showToast) {
                window.showToast('Please enter a label', 'error');
            }
            document.getElementById('new-phone-label')?.focus();
            return;
        }

        // Add to settings
        this.state.settings.twilioNumbers.push({
            number: phoneNumber,
            label: label
        });

        // Update UI
        this.renderPhoneNumbers();
        this.markDirty();

        // Show success toast
        if (window.showToast) {
            window.showToast('Phone number added successfully', 'success');
        }

        // Hide form
        this.hideAddPhoneForm();
    }

    editPhoneNumber(phoneItem) {
        const index = parseInt(phoneItem.dataset.index);
        const phone = this.state.settings.twilioNumbers[index];
        
        const newNumber = prompt('Enter new phone number:', phone.number);
        if (!newNumber) return;

        const newLabel = prompt('Enter new label:', phone.label);
        if (!newLabel) return;

        this.state.settings.twilioNumbers[index] = {
            number: newNumber,
            label: newLabel
        };

        this.renderPhoneNumbers();
        this.markDirty();
    }

    removePhoneNumber(phoneItem) {
        const index = parseInt(phoneItem.dataset.index);
        const phone = this.state.settings.twilioNumbers[index];
        
        if (confirm(`Are you sure you want to remove ${phone.label} (${phone.number})?`)) {
            this.state.settings.twilioNumbers.splice(index, 1);
            this.renderPhoneNumbers();
            this.markDirty();
        }
    }

    // Public method to get current settings
    getSettings() {
        return this.state.settings;
    }

    // Public method to update specific setting
    updateSetting(category, key, value) {
        if (this.state.settings[category]) {
            this.state.settings[category][key] = value;
            this.markDirty();
        }
    }

    // Public method to get formatted email signature
    getEmailSignature() {
        const signature = this.state.settings.emailSignature;
        let signatureHtml = '';

        if (signature.text || signature.image) {
            signatureHtml += '<div contenteditable="false" data-signature="true" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">';
            
            if (signature.text) {
                // Convert line breaks to HTML
                const textHtml = signature.text.replace(/\n/g, '<br>');
                signatureHtml += `<div style="font-family: inherit; font-size: 14px; color: #333; line-height: 1.4;">${textHtml}</div>`;
            }
            
            if (signature.image) {
                signatureHtml += `<div style="margin-top: 10px;"><img src="${signature.image}" alt="Signature" style="max-width: 200px; max-height: 100px; border-radius: 4px;" /></div>`;
            }
            
            signatureHtml += '</div>';
        }

        return signatureHtml;
    }

    // Public method to get signature text only (for plain text emails)
    getEmailSignatureText() {
        const signature = this.state.settings.emailSignature;
        if (signature.text) {
            return '\n\n' + signature.text;
        }
        return '';
    }
}

// Inject modern styles for settings page only
function injectModernStyles() {
    // Only inject if we're on the settings page
    if (!document.getElementById('settings-page')) return;
    
    // Create style element with scoped styles
    const style = document.createElement('style');
    style.textContent = `
        /* Modern Settings Page Styles - Scoped to #settings-page */
        #settings-page .settings-sections {
			display: grid;
			grid-template-columns: 1fr;
            gap: 24px;
            margin-bottom: 32px;
        }
        
        #settings-page .settings-section {
            background: var(--bg-container);
            border: 1px solid var(--border-light);
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            transition: all 0.2s ease;
            position: relative;
        }
        
        #settings-page .settings-section:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        }
        
        #settings-page .settings-section::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: var(--border-light);
        }
        
        #settings-page .settings-section-title {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 20px 24px;
            margin: 0;
            background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-container) 100%);
            border-bottom: 1px solid var(--border-light);
            font-size: 18px;
            font-weight: 600;
            color: var(--text-primary);
            cursor: pointer;
            user-select: none;
            transition: all 0.2s ease;
        }
        
        #settings-page .settings-section-title:hover {
            background: linear-gradient(135deg, var(--bg-container) 0%, var(--bg-secondary) 100%);
        }
        
        #settings-page .settings-section-title .collapse-btn {
            width: 24px;
            height: 24px;
            border: 1px solid var(--border-light);
            background: var(--bg-primary);
            color: var(--text-primary);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: all 0.2s ease;
            margin-right: 8px;
        }
        
        #settings-page .settings-section-title .collapse-btn:hover {
            background: var(--bg-primary);
            color: #ffffff;
            border-color: #ffffff;
        }
        
        #settings-page .settings-section-title .collapse-btn svg {
            width: 16px;
            height: 16px;
            transition: transform 0.2s ease;
        }
        
        #settings-page .settings-section.collapsed .settings-section-title .collapse-btn svg {
            transform: rotate(-90deg);
        }
        
        #settings-page .settings-section.collapsed .settings-content {
            display: none;
        }
        
        #settings-page .settings-section-title svg {
            color: #ffffff;
            filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
        }
        
        #settings-page .settings-content {
            padding: 24px;
        }
        
        #settings-page .section-desc {
            margin: -8px 24px 16px 24px;
            color: var(--text-secondary);
            font-size: 14px;
            line-height: 1.5;
            background: var(--orange-muted);
            padding: 12px 16px;
            border-radius: 8px;
            border-left: 4px solid var(--orange-primary);
        }
        
        #settings-page .settings-hint {
            margin-top: 8px;
            color: var(--text-muted);
            font-size: 13px;
            line-height: 1.4;
            padding: 8px 12px;
            background: var(--bg-secondary);
            border-radius: 6px;
            border-left: 3px solid var(--border-light);
        }
        
        #settings-page .settings-group {
            margin-bottom: 24px;
            padding: 16px;
            background: var(--bg-secondary);
            border-radius: 8px;
            border: 1px solid var(--border-light);
        }
        
        #settings-page .settings-group:last-child {
            margin-bottom: 0;
        }
        
        #settings-page .settings-group-title {
            margin: 0 0 16px 0;
            font-size: 16px;
            font-weight: 600;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 8px;
            padding-bottom: 8px;
            border-bottom: 2px solid var(--border-light);
            position: relative;
        }
        
        #settings-page .settings-group-title::after {
            content: '';
            position: absolute;
            bottom: -2px;
            left: 0;
            width: 30px;
            height: 2px;
            background: var(--border-light);
        }
        
        #settings-page .settings-field {
            margin-bottom: 20px;
            position: relative;
        }
        
        #settings-page .settings-field:last-child {
            margin-bottom: 0;
        }
        
        #settings-page .settings-field label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: var(--text-primary);
            font-size: 14px;
            line-height: 1.4;
        }
        
        #settings-page .settings-textarea {
            width: 100%;
            min-height: 100px;
            padding: 12px 16px;
            border: 2px solid var(--border-light);
            border-radius: 8px;
            background: var(--bg-primary);
            color: var(--text-primary);
            font-family: inherit;
            font-size: 14px;
            resize: vertical;
            transition: all 0.2s ease;
            box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        #settings-page .settings-textarea:focus {
            outline: none;
            border-color: #ffffff;
            box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.1), inset 0 1px 3px rgba(0, 0, 0, 0.1);
            transform: translateY(-1px);
        }
        
        #settings-page .settings-select {
            width: 100%;
            padding: 12px 16px;
            border: 2px solid var(--border-light);
            border-radius: 8px;
            background: var(--bg-primary);
            color: var(--text-primary);
            font-size: 14px;
            transition: all 0.2s ease;
            box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
            cursor: pointer;
        }
        
        #settings-page .settings-select:focus {
            outline: none;
            border-color: #ffffff;
            box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.1), inset 0 1px 3px rgba(0, 0, 0, 0.1);
            transform: translateY(-1px);
        }
        
        #settings-page .checkbox-label {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            cursor: pointer;
            font-weight: 500;
            color: var(--text-primary);
            padding: 12px 16px;
            border-radius: 8px;
            transition: all 0.2s ease;
            position: relative;
            background: var(--bg-primary);
            border: 2px solid var(--border-light);
        }
        
        #settings-page .checkbox-label:hover {
            background: var(--bg-secondary);
            border-color: #ffffff;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(255, 255, 255, 0.1);
        }
        
        #settings-page .checkmark {
            position: relative;
            display: inline-block;
            width: 20px;
            height: 20px;
            background: var(--grey-700);
            border: 2px solid var(--grey-700);
            border-radius: 6px;
            box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
            transition: all 0.2s ease;
            flex-shrink: 0;
            margin-top: 2px;
        }
        
        #settings-page .checkbox-label input[type="checkbox"]:checked + .checkmark {
            background: var(--orange-primary);
            border-color: var(--orange-primary);
            box-shadow: 0 2px 8px rgba(255, 140, 0, 0.3);
            transform: scale(1.05);
        }
        
        #settings-page .checkbox-label input[type="checkbox"]:checked + .checkmark::after {
            content: '';
            position: absolute;
            left: 6px;
            top: 2px;
            width: 5px;
            height: 10px;
            border: solid #fff;
            border-width: 0 3px 3px 0;
            transform: rotate(45deg);
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
        }
        
        #settings-page .btn-small {
            padding: 8px 12px;
            font-size: 12px;
            height: auto;
            min-height: 32px;
            border-radius: 6px;
            transition: all 0.2s ease;
        }
        
        #settings-page .btn-danger {
            background: var(--red-subtle);
            border-color: var(--red-subtle);
            color: white;
        }
        
        #settings-page .btn-danger:hover {
            background: #dc2626;
            transform: translateY(-1px);
        }
        
        #settings-page #save-settings-btn {
            background: linear-gradient(135deg, var(--orange-primary) 0%, #ff8c42 100%);
            border: none;
            border-radius: 8px;
            padding: 12px 24px;
            font-size: 14px;
            font-weight: 600;
            color: white;
            box-shadow: 0 2px 8px rgba(255, 140, 0, 0.3);
            transition: all 0.2s ease;
        }
        
        #settings-page #save-settings-btn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(255, 140, 0, 0.4);
        }
        
        #settings-page #save-settings-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
            box-shadow: 0 2px 8px rgba(255, 140, 0, 0.2);
        }
        
        /* Voicemail Styles */
        #settings-page .voicemail-container {
            background: var(--bg-secondary);
            border: 1px solid var(--border-light);
            border-radius: 8px;
            padding: 16px;
            margin-top: 16px;
        }
        
        #settings-page .settings-input {
            width: 100%;
            padding: 12px 16px;
            border: 2px solid var(--border-light);
            border-radius: 8px;
            background: var(--bg-primary);
            color: var(--text-primary);
            font-size: 14px;
            transition: all 0.2s ease;
            box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        #settings-page .settings-input:focus {
            outline: none;
            border-color: #ffffff;
            box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.1), inset 0 1px 3px rgba(0, 0, 0, 0.1);
            transform: translateY(-1px);
        }
        
        #settings-page .voicemail-recorder {
            background: var(--bg-secondary);
            border: 1px solid var(--border-light);
            border-radius: 8px;
            padding: 16px;
            margin-top: 16px;
        }
        
        #settings-page .recorder-controls {
            display: flex;
            align-items: center;
            gap: 12px;
            width: 100%;
            min-width: 0;
        }
        
        #settings-page .record-button {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: 2px solid #ffffff;
            background: transparent;
            color: #ffffff;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            flex-shrink: 0;
        }

        #settings-page .play-button {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: 2px solid #ffffff;
            background: transparent;
            color: #ffffff;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            flex-shrink: 0;
        }

        #settings-page .record-button:hover {
            background: #ffffff;
            color: var(--orange-primary);
            transform: translateY(-1px);
        }

        #settings-page .play-button:hover {
            background: #ffffff;
            color: var(--orange-primary);
            transform: translateY(-1px);
        }
        
        #settings-page .record-button.recording {
            background: var(--red-subtle);
            border-color: var(--red-subtle);
            color: white;
            animation: pulse 1.5s infinite;
        }
        
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
        }
        
        #settings-page .waveform-container {
            flex: 1;
            height: 40px;
            background: var(--bg-primary);
            border: 1px solid var(--border-light);
            border-radius: 6px;
            display: flex;
            align-items: center;
            padding: 0 12px;
            min-width: 0;
            overflow: hidden;
        }
        
        #settings-page .waveform {
            display: flex;
            align-items: center;
            gap: 2px;
            height: 100%;
            width: 100%;
        }
        
        #settings-page .waveform-bar {
            background: var(--orange-primary);
            width: 3px;
            border-radius: 1px;
            transition: height 0.1s ease;
        }
        
        #settings-page .recording-time {
            color: var(--text-primary);
            font-weight: 600;
            font-size: 14px;
            min-width: 50px;
            text-align: center;
            background: var(--bg-secondary);
            padding: 8px 12px;
            border-radius: 6px;
            border: 1px solid var(--border-light);
        }
        
        #settings-page .delete-button {
            width: 40px;
            height: 40px;
            border-radius: 8px;
            border: none;
            background: var(--red-subtle);
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            flex-shrink: 0;
        }
        
        #settings-page .delete-button:hover {
            background: #dc2626;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(220, 38, 38, 0.3);
        }

        /* Ensure icons keep aspect and aren't squashed */
        #settings-page .record-button svg,
        #settings-page .play-button svg {
            width: 18px;
            height: 18px;
            display: block;
            flex-shrink: 0;
        }
        
        #settings-page .delete-button svg {
            width: 16px;
            height: 16px;
            display: block;
            flex-shrink: 0;
        }
        
        /* Responsive adjustments */
        @media (max-width: 768px) {
            #settings-page .settings-sections {
                grid-template-columns: 1fr;
                gap: 16px;
            }
            
            #settings-page .settings-content {
                padding: 16px;
            }
            
            #settings-page .phone-number-item {
                flex-direction: column;
                align-items: flex-start;
                gap: 12px;
            }
            
            #settings-page .phone-actions {
                align-self: flex-end;
            }
        }
        
        /* Inline Add Phone Form */
        #settings-page .add-phone-inline-form {
            margin-top: 16px;
            padding: 20px;
            background: var(--bg-secondary);
            border: 2px solid var(--border-light);
            border-radius: 8px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        #settings-page .inline-form-field {
            margin-bottom: 16px;
        }
        
        #settings-page .inline-form-field:last-of-type {
            margin-bottom: 20px;
        }
        
        #settings-page .inline-form-field label {
            display: block;
            margin-bottom: 6px;
            font-size: 13px;
            font-weight: 600;
            color: var(--text-primary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        #settings-page .inline-form-actions {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
        }
        
        #settings-page .btn-small {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        #settings-page .btn-primary {
            background: var(--orange-primary);
            color: white;
        }
        
        #settings-page .btn-primary:hover {
            background: #e55a2b;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);
        }
        
        #settings-page .btn-secondary {
            background: var(--grey-600);
            color: var(--text-primary);
        }
        
        #settings-page .btn-secondary:hover {
            background: var(--grey-500);
            transform: translateY(-1px);
        }
        
        #settings-page .btn-danger {
            background: #dc2626;
            color: white;
        }
        
        #settings-page .btn-danger:hover {
            background: #b91c1c;
            transform: translateY(-1px);
        }
    `;
    
    // Inject the styles into the head
    document.head.appendChild(style);
    
    // Update section titles and add voicemail section
    updateSectionTitles();
    addVoicemailSection();
    addCollapseButtons();
}

function updateSectionTitles() {
    // Change "Twilio Phone Numbers" to "Phone Settings"
    const twilioSection = document.querySelector('#settings-page .settings-section-title');
    if (twilioSection && twilioSection.textContent.includes('Twilio Phone Numbers')) {
        twilioSection.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
            Phone Settings
        `;
    }
}

function addVoicemailSection() {
    // Find the correct Phone Settings card (by heading text)
    const sections = Array.from(document.querySelectorAll('#settings-page .settings-section'));
    const phoneSection = sections.find(sec => {
        const titleEl = sec.querySelector('.settings-section-title');
        if (!titleEl) return false;
        const txt = (titleEl.textContent || '').toLowerCase();
        return txt.includes('phone settings') || txt.includes('business phone numbers') || txt.includes('twilio');
    });
    if (!phoneSection) return;
    
    // Target its content wrapper so our block sits under Business Phone Numbers
    const phoneContent = phoneSection.querySelector('.settings-content');
    if (!phoneContent) return;
    
    // Add voicemail section after existing phone content
    const voicemailHTML = `
        <div class="settings-group">
            <h4 class="settings-group-title">My Voicemail</h4>
            <div class="voicemail-container">
                <div class="settings-field">
                    <label for="voicemail-name">Voicemail name *</label>
                    <input type="text" id="voicemail-name" class="settings-input" placeholder="Voicemail Recording">
                </div>
                <div class="voicemail-recorder">
                    <div class="recorder-controls">
                        <button id="record-btn" class="record-button">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="12" cy="12" r="8"></circle>
                            </svg>
                        </button>
                        <button id="play-btn" class="play-button" style="display: none;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="5,3 19,12 5,21"></polygon>
                            </svg>
                        </button>
                        <div class="waveform-container">
                            <div id="waveform" class="waveform"></div>
                        </div>
                        <div id="recording-time" class="recording-time">00:00</div>
                        <button id="delete-recording" class="delete-button">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3,6 5,6 21,6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    // Append to the end of the phone content so it appears beneath Business Phone Numbers
    phoneContent.insertAdjacentHTML('beforeend', voicemailHTML);
    
    // Initialize voicemail functionality
    initVoicemailRecording();
}

function addCollapseButtons() {
    // Add collapse buttons to all section titles
    const sectionTitles = document.querySelectorAll('#settings-page .settings-section-title');
    sectionTitles.forEach(title => {
        // Check if collapse button already exists
        if (title.querySelector('.collapse-btn')) return;
        
        // Create collapse button
        const collapseBtn = document.createElement('button');
        collapseBtn.className = 'collapse-btn';
        collapseBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
        `;
        collapseBtn.setAttribute('aria-label', 'Collapse section');
        
        // Insert at the beginning of the title
        title.insertBefore(collapseBtn, title.firstChild);
    });
}

function setupCollapseFunctionality() {
    // Add collapse/expand functionality to all sections
    const sections = document.querySelectorAll('#settings-page .settings-section');
    sections.forEach(section => {
        const title = section.querySelector('.settings-section-title');
        const collapseBtn = section.querySelector('.collapse-btn');
        
        if (title && collapseBtn) {
            // Make the entire title clickable
            title.addEventListener('click', () => {
                toggleSectionCollapse(section);
            });
            
            // Prevent button click from bubbling to title
            collapseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleSectionCollapse(section);
            });
        }
    });
}

function toggleSectionCollapse(section) {
    const isCollapsed = section.classList.contains('collapsed');
    
    if (isCollapsed) {
        // Expand
        section.classList.remove('collapsed');
        const collapseBtn = section.querySelector('.collapse-btn');
        if (collapseBtn) {
            collapseBtn.setAttribute('aria-label', 'Collapse section');
        }
    } else {
        // Collapse
        section.classList.add('collapsed');
        const collapseBtn = section.querySelector('.collapse-btn');
        if (collapseBtn) {
            collapseBtn.setAttribute('aria-label', 'Expand section');
        }
    }
}

function initVoicemailRecording() {
    const recordBtn = document.getElementById('record-btn');
    const playBtn = document.getElementById('play-btn');
    const deleteBtn = document.getElementById('delete-recording');
    const timeDisplay = document.getElementById('recording-time');
    const waveform = document.getElementById('waveform');
    
    if (!recordBtn || !playBtn || !deleteBtn || !timeDisplay || !waveform) return;
    
    let mediaRecorder = null;
    let audioChunks = [];
    let recordingStartTime = null;
    let recordingInterval = null;
    let isRecording = false;
    let hasRecording = false;
    let audioBlob = null;
    let audioElement = null;
    
    // Initialize waveform with static bars
    initWaveform(waveform);
    
    recordBtn.addEventListener('click', () => {
        if (!isRecording) {
            startRecording();
        } else {
            stopRecording();
        }
    });
    
    playBtn.addEventListener('click', () => {
        if (hasRecording && audioBlob) {
            playRecording();
        }
    });
    
    deleteBtn.addEventListener('click', () => {
        deleteRecording();
    });
    
    function startRecording() {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];
                
                mediaRecorder.ondataavailable = event => {
                    audioChunks.push(event.data);
                };
                
                mediaRecorder.onstop = () => {
                    audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                    saveRecording(audioBlob);
                    stream.getTracks().forEach(track => track.stop());
                };
                
                mediaRecorder.start();
                isRecording = true;
                recordingStartTime = Date.now();
                
                // Update UI for recording state - show stop icon
                recordBtn.classList.add('recording');
                recordBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>';
                playBtn.style.display = 'none';
                
                // Start timer
                recordingInterval = setInterval(() => {
                    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
                    const minutes = Math.floor(elapsed / 60);
                    const seconds = elapsed % 60;
                    timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    
                    // Animate waveform during recording
                    animateWaveform(waveform);
                }, 100);
            })
            .catch(err => {
                console.error('Error accessing microphone:', err);
                alert('Could not access microphone. Please check permissions.');
            });
    }
    
    function stopRecording() {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            isRecording = false;
            hasRecording = true;
            
            // Update UI for stopped recording state - show circle icon again
            recordBtn.classList.remove('recording');
            recordBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"></circle></svg>';
            playBtn.style.display = 'flex';
            
            if (recordingInterval) {
                clearInterval(recordingInterval);
                recordingInterval = null;
            }
        }
    }
    
    function playRecording() {
        if (audioBlob && !audioElement) {
            const audioUrl = URL.createObjectURL(audioBlob);
            audioElement = new Audio(audioUrl);
            
            audioElement.onended = () => {
                playBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"></polygon></svg>';
            };
            
            audioElement.onplay = () => {
                playBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><line x1="6" y1="4" x2="6" y2="20"></line><line x1="18" y1="4" x2="18" y2="20"></line></svg>';
            };
            
            audioElement.onpause = () => {
                playBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"></polygon></svg>';
            };
        }
        
        if (audioElement) {
            if (audioElement.paused) {
                audioElement.play();
            } else {
                audioElement.pause();
            }
        }
    }
    
    function deleteRecording() {
        if (confirm('Delete this recording?')) {
            timeDisplay.textContent = '00:00';
            initWaveform(waveform);
            recordBtn.classList.remove('recording');
            recordBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"></circle></svg>';
            playBtn.style.display = 'none';
            isRecording = false;
            hasRecording = false;
            audioBlob = null;
            if (audioElement) {
                audioElement.pause();
                audioElement = null;
            }
        }
    }
    
    function saveRecording(audioBlob) {
        // Store in localStorage for now (you can implement server storage later)
        const reader = new FileReader();
        reader.onload = () => {
            const audioData = reader.result;
            localStorage.setItem('voicemail-recording', audioData);
            console.log('Recording saved to localStorage');
        };
        reader.readAsDataURL(audioBlob);
    }
    
    function initWaveform(waveform) {
        waveform.innerHTML = '';
        for (let i = 0; i < 50; i++) {
            const bar = document.createElement('div');
            bar.className = 'waveform-bar';
            bar.style.height = '4px';
            waveform.appendChild(bar);
        }
    }
    
    function animateWaveform(waveform) {
        const bars = waveform.querySelectorAll('.waveform-bar');
        bars.forEach(bar => {
            const height = Math.random() * 20 + 4;
            bar.style.height = `${height}px`;
        });
    }
}

// Initialize settings page when DOM is ready
async function initSettings() {
    // Only initialize if we're on the settings page
    if (document.getElementById('settings-page')) {
        window.SettingsPage = new SettingsPage();
        window.SettingsPage.instance = window.SettingsPage;
    }
}

// Initialize immediately if DOM already loaded, otherwise wait
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettings);
} else {
    initSettings();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SettingsPage;
}