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

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SettingsPage;
}
