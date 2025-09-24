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
                    enableTracking: false,
                    includeBulkHeaders: false,
                    includeListUnsubscribe: false,
                    includePriorityHeaders: false,
                    forceGmailOnly: true,
                    useBrandedHtmlTemplate: false,
                    signatureImageEnabled: false
                },
                geminiPrompts: {
                    greeting: '',
                    body: '',
                    subject: ''
                },
                twilioNumbers: [],
                general: {
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

    init() {
        this.loadSettings();
        this.setupEventListeners();
        injectModernStyles();
        this.renderSettings();
    }

    setupEventListeners() {
        // Save settings button
        const saveBtn = document.getElementById('save-settings-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveSettings());
        }

        // Email signature text
        const signatureText = document.getElementById('email-signature-text');
        if (signatureText) {
            signatureText.addEventListener('input', () => this.markDirty());
        }

        // Email signature image upload
        const uploadBtn = document.getElementById('upload-signature-image');
        const imageInput = document.getElementById('email-signature-image');
        if (uploadBtn && imageInput) {
            uploadBtn.addEventListener('click', () => imageInput.click());
            imageInput.addEventListener('change', (e) => this.handleImageUpload(e));
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

        // Deliverability & Tracking toggles
        const deliverabilityFields = [
            'email-trk-enabled',
            'email-bulk-headers',
            'email-list-unsub',
            'email-priority-headers',
            'email-force-gmail',
            'email-branded-html',
            'email-sig-image-enabled'
        ];
        deliverabilityFields.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('change', () => {
                const v = el.type === 'checkbox' ? !!el.checked : el.value;
                switch(id){
                    case 'email-trk-enabled': this.state.settings.emailDeliverability.enableTracking = v; break;
                    case 'email-bulk-headers': this.state.settings.emailDeliverability.includeBulkHeaders = v; break;
                    case 'email-list-unsub': this.state.settings.emailDeliverability.includeListUnsubscribe = v; break;
                    case 'email-priority-headers': this.state.settings.emailDeliverability.includePriorityHeaders = v; break;
                    case 'email-force-gmail': this.state.settings.emailDeliverability.forceGmailOnly = v; break;
                    case 'email-branded-html': this.state.settings.emailDeliverability.useBrandedHtmlTemplate = v; break;
                    case 'email-sig-image-enabled': this.state.settings.emailDeliverability.signatureImageEnabled = v; break;
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

    loadSettings() {
        // Load settings from localStorage or API
        const savedSettings = localStorage.getItem('crm-settings');
        if (savedSettings) {
            try {
                this.state.settings = { ...this.state.settings, ...JSON.parse(savedSettings) };
            } catch (error) {
                console.error('Error loading settings:', error);
            }
        }
    }

    saveSettings() {
        try {
            // Save to localStorage (placeholder - will be replaced with API call)
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
            console.error('Error saving settings:', error);
            if (window.showToast) {
                window.showToast('Error saving settings. Please try again.', 'error');
            }
        }
    }

    markDirty() {
        this.state.isDirty = true;
        this.updateSaveButton();
    }

    updateSaveButton() {
        const saveBtn = document.getElementById('save-settings-btn');
        if (saveBtn) {
            saveBtn.disabled = !this.state.isDirty;
            saveBtn.textContent = this.state.isDirty ? 'Save Changes' : 'All Changes Saved';
        }
    }

    renderSettings() {
        // Render email signature text
        const signatureText = document.getElementById('email-signature-text');
        if (signatureText) {
            signatureText.value = this.state.settings.emailSignature.text || '';
        }

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

        // Render general settings
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

        // Render deliverability settings
        const d = this.state.settings.emailDeliverability || {};
        const trk = document.getElementById('email-trk-enabled');
        if (trk) trk.checked = !!d.enableTracking;
        const bulk = document.getElementById('email-bulk-headers');
        if (bulk) bulk.checked = !!d.includeBulkHeaders;
        const unsub = document.getElementById('email-list-unsub');
        if (unsub) unsub.checked = !!d.includeListUnsubscribe;
        const pri = document.getElementById('email-priority-headers');
        if (pri) pri.checked = !!d.includePriorityHeaders;
        const gm = document.getElementById('email-force-gmail');
        if (gm) gm.checked = !!d.forceGmailOnly;
        const html = document.getElementById('email-branded-html');
        if (html) html.checked = !!d.useBrandedHtmlTemplate;
        const sigimg = document.getElementById('email-sig-image-enabled');
        if (sigimg) sigimg.checked = !!d.signatureImageEnabled;

        this.updateSaveButton();
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

    handleImageUpload(event) {
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

        // Create preview
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('signature-image-preview');
            if (preview) {
                preview.innerHTML = `
                    <img src="${e.target.result}" alt="Signature preview" style="max-width: 200px; max-height: 100px; border-radius: 4px;">
                    <button type="button" class="btn-small btn-danger" id="remove-signature-image">Remove</button>
                `;
                preview.hidden = false;

                // Add remove button listener
                const removeBtn = preview.querySelector('#remove-signature-image');
                if (removeBtn) {
                    removeBtn.addEventListener('click', () => this.removeSignatureImage());
                }
            }

            // Store the image data
            this.state.settings.emailSignature.image = e.target.result;
            this.markDirty();
        };
        reader.readAsDataURL(file);
    }

    removeSignatureImage() {
        this.state.settings.emailSignature.image = null;
        const preview = document.getElementById('signature-image-preview');
        if (preview) {
            preview.hidden = true;
            preview.innerHTML = '';
        }
        const imageInput = document.getElementById('email-signature-image');
        if (imageInput) {
            imageInput.value = '';
        }
        this.markDirty();
    }

    showAddPhoneModal() {
        // Placeholder for add phone modal
        const phoneNumber = prompt('Enter phone number (e.g., +1 (555) 123-4567):');
        if (!phoneNumber) return;

        const label = prompt('Enter label for this number (e.g., Primary Business Line):');
        if (!label) return;

        this.state.settings.twilioNumbers.push({
            number: phoneNumber,
            label: label
        });

        this.renderPhoneNumbers();
        this.markDirty();
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
            signatureHtml += '<div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">';
            
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

// Initialize settings page when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if we're on the settings page
    if (document.getElementById('settings-page')) {
        window.SettingsPage = new SettingsPage();
    }
});

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
                grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
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
                background: linear-gradient(90deg, var(--orange-primary) 0%, #ff8c42 100%);
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
            }
            
            #settings-page .settings-section-title svg {
                color: var(--orange-primary);
                filter: drop-shadow(0 1px 2px rgba(255, 140, 0, 0.3));
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
                border-bottom: 2px solid var(--orange-primary);
                position: relative;
            }
            
            #settings-page .settings-group-title::after {
                content: '';
                position: absolute;
                bottom: -2px;
                left: 0;
                width: 30px;
                height: 2px;
                background: var(--orange-primary);
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
                border-color: var(--orange-primary);
                box-shadow: 0 0 0 3px rgba(255, 140, 0, 0.1), inset 0 1px 3px rgba(0, 0, 0, 0.1);
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
                border-color: var(--orange-primary);
                box-shadow: 0 0 0 3px rgba(255, 140, 0, 0.1), inset 0 1px 3px rgba(0, 0, 0, 0.1);
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
                border-color: var(--orange-primary);
                transform: translateY(-1px);
                box-shadow: 0 2px 8px rgba(255, 140, 0, 0.1);
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
                background: #c82333;
                border-color: #bd2130;
                color: white;
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
        `;
        
        // Inject the styles into the head
        document.head.appendChild(style);
    }

    // Export for use in other modules
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SettingsPage;
    }
