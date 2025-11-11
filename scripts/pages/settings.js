// Power Choosers CRM - Settings Page
// Handles settings management and configuration

class SettingsPage {
    constructor() {
        this.state = {
            settings: {
                emailSignature: {
                    text: '',
                    image: null,
                    imageSize: {
                        width: 200,
                        height: 100
                    }
                },
                aiTemplates: {
                    warm_intro: '',
                    follow_up: '',
                    energy_health: '',
                    proposal: '',
                    cold_email: '',
                    invoice: '',
                    who_we_are: '',
                    // NEW: Market Context Settings
                    marketContext: {
                        enabled: true,
                        rateIncrease: '15-25%',
                        renewalYears: '2025-2026',
                        earlyRenewalSavings: '20-30%',
                        typicalClientSavings: '10-20%',
                        marketInsights: 'due to data center demand'
                    },
                    // NEW: Meeting Preferences Settings
                    meetingPreferences: {
                        enabled: true,
                        useHardcodedTimes: false,
                        slot1Time: '2-3pm',
                        slot2Time: '10-11am',
                        callDuration: '15-minute',
                        timeZone: 'EST'
                    }
                },
                // NEW: A/B Testing Configuration
                abTesting: {
                    enabled: true,
                    minSampleSize: 100,
                    testVariables: [
                        'subject_line',
                        'opening_hook', 
                        'value_prop_format',
                        'cta_type'
                    ],
                    winnerThreshold: 0.05,
                    autoPromoteWinner: true
                },
                // NEW: Industry Segmentation Rules
                industrySegmentation: {
                    enabled: true,
                    rules: {
                        manufacturing: {
                            painPoints: ['production downtime', 'energy-intensive operations', 'equipment reliability'],
                            avgSavings: '15-25%',
                            keyBenefit: 'operational continuity',
                            urgencyDrivers: ['production schedules', 'equipment uptime']
                        },
                        healthcare: {
                            painPoints: ['budget constraints', 'regulatory compliance', 'patient care continuity'],
                            avgSavings: '10-18%',
                            keyBenefit: 'cost predictability',
                            urgencyDrivers: ['budget cycles', 'compliance deadlines']
                        },
                        retail: {
                            painPoints: ['multiple locations', 'unpredictable costs', 'seasonal demand'],
                            avgSavings: '12-20%',
                            keyBenefit: 'centralized management',
                            urgencyDrivers: ['lease renewals', 'expansion plans']
                        },
                        hospitality: {
                            painPoints: ['seasonal demand', 'guest comfort', 'operational costs'],
                            avgSavings: '12-18%',
                            keyBenefit: 'cost stability',
                            urgencyDrivers: ['seasonal planning', 'guest satisfaction']
                        },
                        education: {
                            painPoints: ['budget constraints', 'facility maintenance', 'student safety'],
                            avgSavings: '10-15%',
                            keyBenefit: 'budget optimization',
                            urgencyDrivers: ['academic year cycles', 'facility upgrades']
                        }
                    }
                },
                // NEW: Cold Email Configuration
                coldEmailSettings: {
                    useMarketContext: false,  // Turn OFF market context for cold emails (user preference)
                    useHardcodedMeetings: false,  // Turn OFF meeting requests for cold emails (user preference)
                    industrySegmentationEnabled: true,  // Use industry rules from industrySegmentation
                    requireObservationBased: true,  // Enforce observation-based opens
                    avoidAIPhrases: true,  // Remove ChatGPT patterns
                    varySubjectLineFormat: true,  // Multiple subject line options
                    maxEmailLength: 120,  // Keep emails short
                    requireLowCommitmentCTA: true  // Ask for chat, not meeting
                },
                emailDeliverability: {
                    // SendGrid Settings
                    enableTracking: true,        // SendGrid Open Tracking (tracks email opens)
                    enableClickTracking: true,   // SendGrid Click Tracking (tracks link clicks)
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
                    spamScoreCheck: true,
                    spamScoreThreshold: 5.0,
                    autoRejectAbove: 7.0
                },
                twilioNumbers: [],
                selectedPhoneNumber: null, // Currently selected phone number for calls
                bridgeToMobile: false, // Admin only: bridge calls to mobile phone (9728342317)
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
        // IMMEDIATE: Set up UI first (styles, collapse buttons, save button) - don't wait for settings
        injectModernStyles();
        setupCollapseFunctionality();
        this.setupEventListeners();
        
        // Initialize save button immediately (visible and styled, but disabled until changes)
        this.updateSaveButton();
        
        // Set up auth state listener
        this.setupAuthStateListener();
        
        // CRITICAL: Populate profile info IMMEDIATELY from Google Auth (don't wait for settings)
        // This ensures profile fields show right away for all users
        this.ensureGoogleUserData().then(() => {
            // Render settings UI immediately (even if data isn't loaded yet)
            this.renderSettings();
            
            // Force update profile fields right away
            this.forceUpdateProfileFields();
        });
        
        // Load settings in background (non-blocking) and update when ready
        this.loadSettings().then(() => {
            // After settings load, re-render to populate all other fields
            this.renderSettings();
            
            // Update profile fields one more time (in case settings had different values)
            this.forceUpdateProfileFields();
            
            // Convert data URL signatures (non-critical)
            this.convertDataUrlSignature();
        }).catch(error => {
            console.error('[Settings] Error during initialization:', error);
            // Still render with defaults even if load fails
            this.renderSettings();
        });
        
        // Force update profile fields after a delay (fallback to ensure they populate)
        setTimeout(() => {
            this.forceUpdateProfileFields();
        }, 500);
        
        // One more update after everything should be ready (1 second)
        setTimeout(() => {
            this.forceUpdateProfileFields();
        }, 1000);
    }
    
    setupAuthStateListener() {
        // Listen for Firebase Auth state changes - triggers immediately if user already logged in
        if (firebase && firebase.auth) {
            this.authStateListener = firebase.auth().onAuthStateChanged((user) => {
                if (user) {
                    // Update profile fields immediately when auth state changes
                    this.forceUpdateProfileFields();
                }
            });
        }
    }
    
    cleanup() {
        // Remove auth state listener when settings page is destroyed
        if (this.authStateListener && firebase && firebase.auth) {
            firebase.auth().onAuthStateChanged(this.authStateListener); // This actually removes it
            this.authStateListener = null;
        }
    }
    
    async forceUpdateProfileFields() {
        // Get user from multiple sources with fallback strategy
        let user = null;
        let firstName = '';
        let lastName = '';
        let email = '';
        
        // Strategy 1: Try authManager first (most reliable)
        if (window.authManager && window.authManager.getCurrentUser && typeof window.authManager.getCurrentUser === 'function') {
            user = window.authManager.getCurrentUser();
        }
        
        // Strategy 2: Fallback to Firebase auth currentUser
        if (!user) {
            user = firebase.auth().currentUser;
        }
        
        // Strategy 3: If still no user, wait and retry
        if (!user) {
            // Wait a bit for auth to initialize
            await new Promise(resolve => setTimeout(resolve, 200));
            if (window.authManager && window.authManager.getCurrentUser) {
                user = window.authManager.getCurrentUser();
            }
            if (!user) {
                user = firebase.auth().currentUser;
            }
        }
        
        if (user) {
            // Extract from user object
            email = (user.email || '').toLowerCase().trim();
            const displayName = user.displayName || '';
            
            // Parse displayName
            const nameParts = displayName.trim().split(' ').filter(p => p);
            firstName = nameParts[0] || '';
            lastName = nameParts.slice(1).join(' ') || '';
            
            // Strategy 4: If displayName is missing, try to get from users collection
            if (!firstName && email && window.firebaseDB) {
                try {
                    const userDoc = await window.firebaseDB.collection('users').doc(email).get();
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        const userName = userData.name || '';
                        if (userName) {
                            const namePartsFromDB = userName.trim().split(' ').filter(p => p);
                            firstName = namePartsFromDB[0] || firstName;
                            lastName = namePartsFromDB.slice(1).join(' ') || lastName;
                        }
                    }
                } catch (err) {
                    console.warn('[Settings] Could not fetch user profile from Firestore:', err);
                }
            }
            
            // Strategy 5: Last resort - parse from email
            if (!firstName && email) {
                const emailPrefix = email.split('@')[0];
                // Try common patterns: first.last or firstlast
                if (emailPrefix.includes('.')) {
                    const parts = emailPrefix.split('.');
                    firstName = parts[0] || '';
                    lastName = parts.slice(1).join(' ') || '';
                } else {
                    firstName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
                }
            }
        } else {
            console.warn('[Settings] forceUpdateProfileFields: No user found after all attempts');
            return;
        }
        
        // Update state
        if (firstName) {
            this.state.settings.general.firstName = firstName;
        }
        if (lastName) {
            this.state.settings.general.lastName = lastName;
        }
        if (email) {
            this.state.settings.general.email = email;
        }
        
        // Force update input fields directly (overrides placeholder)
        const firstNameEl = document.getElementById('user-first-name');
        if (firstNameEl && firstName) {
            firstNameEl.value = firstName;
            firstNameEl.classList.remove('placeholder');
            // Trigger input event to ensure UI updates
            firstNameEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        const lastNameEl = document.getElementById('user-last-name');
        if (lastNameEl && lastName) {
            lastNameEl.value = lastName;
            lastNameEl.classList.remove('placeholder');
            lastNameEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        const emailEl = document.getElementById('user-email');
        if (emailEl && email) {
            emailEl.value = email;
            emailEl.classList.remove('placeholder');
            emailEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
    
    async ensureGoogleUserData() {
        // Get user from multiple sources (auth manager or Firebase auth)
        let user = null;
        
        // Try auth manager first (most reliable)
        if (window.authManager && window.authManager.getCurrentUser && typeof window.authManager.getCurrentUser === 'function') {
            user = window.authManager.getCurrentUser();
        }
        
        // Fallback to Firebase auth currentUser
        if (!user) {
            user = firebase.auth().currentUser;
        }
        
        // If still no user, wait for auth state to change (up to 2 seconds)
        if (!user) {
            let attempts = 0;
            const maxAttempts = 20; // 2 seconds total (20 * 100ms)
            while (!user && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 100));
                if (window.authManager && window.authManager.getCurrentUser) {
                    user = window.authManager.getCurrentUser();
                }
                if (!user) {
                    user = firebase.auth().currentUser;
                }
                attempts++;
            }
        }
        
        if (user) {
            // Extract name and email from user object
            const displayName = user.displayName || '';
            const email = (user.email || '').toLowerCase().trim();
            const nameParts = displayName.trim().split(' ').filter(p => p);
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';
            
            // ALWAYS populate from Google if available (even if settings were loaded)
            // This ensures profile info is always fresh from Google
            if (firstName) {
                this.state.settings.general.firstName = firstName;
            }
            if (lastName) {
                this.state.settings.general.lastName = lastName;
            }
            if (email) {
                this.state.settings.general.email = email;
            }
            
        } else {
            console.warn('[Settings] No current user found for Google data population after waiting');
        }
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

        // Email signature image size inputs
        const widthInput = document.getElementById('signature-image-size-width');
        const heightInput = document.getElementById('signature-image-size-height');
        if (widthInput) {
            widthInput.addEventListener('input', (e) => {
                const width = parseInt(e.target.value, 10) || 200;
                if (!this.state.settings.emailSignature.imageSize) {
                    this.state.settings.emailSignature.imageSize = { width: 200, height: 100 };
                }
                this.state.settings.emailSignature.imageSize.width = width;
                this.markDirty();
                // Update preview to reflect new size
                this.renderSignatureSection();
            });
        }
        if (heightInput) {
            heightInput.addEventListener('input', (e) => {
                const height = parseInt(e.target.value, 10) || 100;
                if (!this.state.settings.emailSignature.imageSize) {
                    this.state.settings.emailSignature.imageSize = { width: 200, height: 100 };
                }
                this.state.settings.emailSignature.imageSize.height = height;
                this.markDirty();
                // Update preview to reflect new size
                this.renderSignatureSection();
            });
        }

        // AI Template fields
        const templateFields = [
            'template-warm-intro',
            'template-follow-up',
            'template-energy-health',
            'template-proposal',
            'template-cold-email',
            'template-invoice',
            'who-we-are'
        ];
        templateFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('input', () => this.markDirty());
            }
        });

        // Market Context Toggle
        const marketContextCheckbox = document.getElementById('market-context-enabled');
        const marketContextFields = document.getElementById('market-context-fields');

        if (marketContextCheckbox && marketContextFields) {
            marketContextCheckbox.addEventListener('change', function() {
                if (this.checked) {
                    marketContextFields.classList.remove('disabled');
                } else {
                    marketContextFields.classList.add('disabled');
                }
                this.markDirty();
            }.bind(this));
            
            // Add input listeners for market context fields
            ['market-rate-increase', 'market-renewal-years', 'market-early-renewal', 
             'market-client-savings', 'market-insights'].forEach(id => {
                const field = document.getElementById(id);
                if (field) {
                    field.addEventListener('input', () => this.markDirty());
                }
            });
        }

        // NEW: Meeting Preferences Event Listeners
        const meetingPreferencesCheckbox = document.getElementById('meeting-preferences-enabled');
        const meetingPreferencesFields = document.querySelector('.meeting-preferences-fields');

        if (meetingPreferencesCheckbox && meetingPreferencesFields) {
            meetingPreferencesCheckbox.addEventListener('change', function() {
                if (this.checked) {
                    meetingPreferencesFields.classList.remove('disabled');
                } else {
                    meetingPreferencesFields.classList.add('disabled');
                }
                this.markDirty();
            }.bind(this));
            
            // Add input listeners for meeting preferences fields
            ['meeting-use-hardcoded', 'meeting-slot1-time', 'meeting-slot2-time', 
             'meeting-call-duration', 'meeting-timezone'].forEach(id => {
                const field = document.getElementById(id);
                if (field) {
                    field.addEventListener('input', () => this.markDirty());
                    field.addEventListener('change', () => this.markDirty());
                }
            });
        }

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

        // Cold email settings event listeners
        const coldEmailFields = [
            'cold-email-industry-segment',
            'cold-email-observation',
            'cold-email-avoid-ai',
            'cold-email-vary-subject',
            'cold-email-low-commitment',
            'cold-email-max-length'
        ];
        coldEmailFields.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('change', () => {
                const v = el.type === 'checkbox' ? !!el.checked : el.value;
                // Initialize coldEmailSettings if it doesn't exist
                if (!this.state.settings.coldEmailSettings) {
                    this.state.settings.coldEmailSettings = {};
                }
                switch(id){
                    case 'cold-email-industry-segment': 
                        this.state.settings.coldEmailSettings.industrySegmentationEnabled = v; 
                        break;
                    case 'cold-email-observation': 
                        this.state.settings.coldEmailSettings.requireObservationBased = v; 
                        break;
                    case 'cold-email-avoid-ai': 
                        this.state.settings.coldEmailSettings.avoidAIPhrases = v; 
                        break;
                    case 'cold-email-vary-subject': 
                        this.state.settings.coldEmailSettings.varySubjectLineFormat = v; 
                        break;
                    case 'cold-email-low-commitment': 
                        this.state.settings.coldEmailSettings.requireLowCommitmentCTA = v; 
                        break;
                    case 'cold-email-max-length': 
                        this.state.settings.coldEmailSettings.maxEmailLength = parseInt(v) || 120; 
                        break;
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
            } else if (e.target.matches('[data-action="select"]')) {
                this.selectPhoneNumber(e.target.closest('.phone-number-item'));
            }
        });
        
        // Bridge to mobile toggle (admin only)
        document.addEventListener('change', (e) => {
            if (e.target && e.target.classList.contains('bridge-to-mobile-toggle')) {
                this.handleBridgeToMobileToggle(e.target);
            }
        });

        // Algolia reindex buttons (with duplicate listener guards)
        const reindexAccountsBtn = document.getElementById('algolia-reindex-accounts-btn');
        if (reindexAccountsBtn && !document._algoliaReindexAccountsBound) {
            reindexAccountsBtn.addEventListener('click', () => this.reindexAlgoliaAccounts());
            document._algoliaReindexAccountsBound = true;
        }

        const reindexContactsBtn = document.getElementById('algolia-reindex-contacts-btn');
        if (reindexContactsBtn && !document._algoliaReindexContactsBound) {
            reindexContactsBtn.addEventListener('click', () => this.reindexAlgoliaContacts());
            document._algoliaReindexContactsBound = true;
        }

        // Load saved Algolia credentials
        this.loadAlgoliaCredentials();
    }

    async loadSettings() {
        try {
            // Helper functions
            const getUserEmail = () => {
                try {
                    if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
                        return window.DataManager.getCurrentUserEmail();
                    }
                    return (window.currentUserEmail || '').toLowerCase();
                } catch(_) {
                    return (window.currentUserEmail || '').toLowerCase();
                }
            };
            const isAdmin = () => {
                try {
                    if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
                        return window.DataManager.isCurrentUserAdmin();
                    }
                    return window.currentUserRole === 'admin';
                } catch(_) {
                    return window.currentUserRole === 'admin';
                }
            };
            
            // First try to load from CacheManager (cache-first)
            if (window.CacheManager) {
                try {
                    const cachedSettings = await window.CacheManager.get('settings');
                    if (cachedSettings && cachedSettings.length > 0) {
                        const settingsData = cachedSettings[0];
                        // Check ownership for non-admin users
                        if (!isAdmin()) {
                            const email = getUserEmail();
                            const settingsOwnerId = (settingsData.ownerId || '').toLowerCase();
                            const settingsUserId = settingsData.userId;
                            const currentUserId = window.firebase && window.firebase.auth && window.firebase.auth().currentUser ? window.firebase.auth().currentUser.uid : null;
                            if (settingsOwnerId !== email && settingsUserId !== currentUserId) {
                                console.warn('[Settings] Cached settings not owned by current user, skipping cache');
                            } else {
                                // Merge settings, ensuring bridgeToMobile is preserved as boolean
                                this.state.settings = { 
                                    ...this.state.settings, 
                                    ...settingsData,
                                    bridgeToMobile: settingsData.bridgeToMobile === true // Ensure boolean
                                };
                                // Ensure imageSize is initialized if missing
                                if (!this.state.settings.emailSignature.imageSize) {
                                    this.state.settings.emailSignature.imageSize = { width: 200, height: 100 };
                                }
                                return;
                            }
                        } else {
                            // Merge settings, ensuring bridgeToMobile is preserved as boolean
                            this.state.settings = { 
                                ...this.state.settings, 
                                ...settingsData,
                                bridgeToMobile: settingsData.bridgeToMobile === true // Ensure boolean
                            };
                            // Ensure imageSize is initialized if missing
                            if (!this.state.settings.emailSignature.imageSize) {
                                this.state.settings.emailSignature.imageSize = { width: 200, height: 100 };
                            }
                            console.log('[Settings] Loaded from CacheManager cache', { bridgeToMobile: this.state.settings.bridgeToMobile });
                            return;
                        }
                    }
                } catch (error) {
                    console.warn('[Settings] CacheManager load failed:', error);
                }
            }
            
            // Fallback to Firebase if cache miss
            if (window.firebaseDB) {
                try {
                    // Try per-user settings first (for employees), then fallback to 'user-settings' (admin/legacy)
                    const getUserEmail = () => {
                        try {
                            if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
                                return window.DataManager.getCurrentUserEmail();
                            }
                            return (window.currentUserEmail || '').toLowerCase();
                        } catch(_) {
                            return (window.currentUserEmail || '').toLowerCase();
                        }
                    };
                    const isAdmin = () => {
                        try {
                            if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
                                return window.DataManager.isCurrentUserAdmin();
                            }
                            return window.currentUserRole === 'admin';
                        } catch(_) {
                            return window.currentUserRole === 'admin';
                        }
                    };
                    
                    const email = getUserEmail();
                    const isAdminUser = isAdmin();
                    
                    // Try per-user settings doc first (employees), then fallback to 'user-settings' (admin/legacy)
                    let settingsDoc = null;
                    let docId = null;
                    
                    if (!isAdminUser && email) {
                        docId = `user-settings-${email}`;
                        try {
                            settingsDoc = await window.firebaseDB.collection('settings').doc(docId).get();
                            // If document doesn't exist (for new employees), that's fine - we'll create it on save
                            if (!settingsDoc.exists) {
                                settingsDoc = null; // Clear so we skip to defaults + Google data
                            }
                        } catch (err) {
                            // Permission errors are expected if document doesn't exist or user doesn't own it
                            if (err.code === 'permission-denied') {
                            } else {
                                console.warn('[Settings] Error loading per-user settings, trying legacy:', err);
                            }
                            settingsDoc = null; // Clear so we skip to defaults
                        }
                    }
                    
                    // Fallback to legacy 'user-settings' if per-user doc doesn't exist or user is admin
                    if ((!settingsDoc || !settingsDoc.exists) && isAdminUser) {
                        docId = 'user-settings';
                        try {
                            settingsDoc = await window.firebaseDB.collection('settings').doc(docId).get();
                        } catch (err) {
                            console.warn('[Settings] Cannot load legacy settings doc:', err);
                            settingsDoc = null;
                        }
                    }
                    
                    if (settingsDoc && settingsDoc.exists) {
                        const firebaseSettings = settingsDoc.data();
                        
                        
                        // Check ownership for non-admin users (only for legacy 'user-settings' doc)
                        if (!isAdmin() && docId === 'user-settings') {
                            const email = getUserEmail();
                            const settingsOwnerId = (firebaseSettings.ownerId || '').toLowerCase();
                            const settingsUserId = firebaseSettings.userId;
                            const currentUserId = window.firebase && window.firebase.auth && window.firebase.auth().currentUser ? window.firebase.auth().currentUser.uid : null;
                            if (settingsOwnerId !== email && settingsUserId !== currentUserId) {
                                console.warn('[Settings] Firebase settings not owned by current user, using defaults');
                                // Continue to localStorage fallback
                            } else {
                                // Merge settings, ensuring bridgeToMobile is preserved as boolean
                                this.state.settings = { 
                                    ...this.state.settings, 
                                    ...firebaseSettings,
                                    bridgeToMobile: firebaseSettings.bridgeToMobile === true // Ensure boolean
                                };
                                // Ensure emailSignature exists and imageSize is initialized if missing
                                if (!this.state.settings.emailSignature) {
                                    this.state.settings.emailSignature = { text: '', image: null, imageSize: { width: 200, height: 100 } };
                                } else if (!this.state.settings.emailSignature.imageSize) {
                                    this.state.settings.emailSignature.imageSize = { width: 200, height: 100 };
                                }
                                
                                // Cache the settings for future use
                                if (window.CacheManager) {
                                    try {
                                        await window.CacheManager.set('settings', [{ id: 'user-settings', ...firebaseSettings }]);
                                    } catch (error) {
                                        console.warn('[Settings] Failed to cache settings:', error);
                                    }
                                }
                                return;
                            }
                        } else {
                            // Merge settings, ensuring bridgeToMobile is preserved as boolean
                            this.state.settings = { 
                                ...this.state.settings, 
                                ...firebaseSettings,
                                bridgeToMobile: firebaseSettings.bridgeToMobile === true // Ensure boolean
                            };
                            // Ensure emailSignature exists and imageSize is initialized if missing
                            if (!this.state.settings.emailSignature) {
                                this.state.settings.emailSignature = { text: '', image: null, imageSize: { width: 200, height: 100 } };
                            } else if (!this.state.settings.emailSignature.imageSize) {
                                this.state.settings.emailSignature.imageSize = { width: 200, height: 100 };
                            }
                            console.log('[Settings] Loaded from Firebase', { bridgeToMobile: this.state.settings.bridgeToMobile });
                            
                            // Cache the settings for future use
                            if (window.CacheManager) {
                                try {
                                    await window.CacheManager.set('settings', [{ id: 'user-settings', ...firebaseSettings }]);
                                    console.log('[Settings] Cached settings for future use');
                                } catch (error) {
                                    console.warn('[Settings] Failed to cache settings:', error);
                                }
                            }
                            return;
                        }
                    }
                } catch (error) {
                    // Permission errors are expected for non-admin users accessing settings they don't own
                    if (error.code === 'permission-denied' || error.message.includes('permission')) {
                        console.warn('[Settings] Permission denied loading from Firebase (user may not own settings doc), using defaults');
                    } else {
                        console.error('[Settings] Error loading from Firebase:', error);
                    }
                }
            }
            
            // Fallback to localStorage if Firebase not available or no data
            if (!this.state.settings.general.firstName) {
            const savedSettings = localStorage.getItem('crm-settings');
            if (savedSettings) {
                try {
                    const parsed = JSON.parse(savedSettings);
                    // Merge settings, ensuring bridgeToMobile is preserved as boolean
                    this.state.settings = { 
                        ...this.state.settings, 
                        ...parsed,
                        bridgeToMobile: parsed.bridgeToMobile === true // Ensure boolean
                    };
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
                    const parsed = JSON.parse(savedSettings);
                    // Merge settings, ensuring bridgeToMobile is preserved as boolean
                    this.state.settings = { 
                        ...this.state.settings, 
                        ...parsed,
                        bridgeToMobile: parsed.bridgeToMobile === true // Ensure boolean
                    };
                } catch (parseError) {
                    console.error('Error parsing localStorage settings:', parseError);
                }
            }
        }
        
        // Auto-populate from Google login (force populate if empty or only has placeholder)
        const user = firebase.auth().currentUser;
        if (user) {
            const nameParts = (user.displayName || '').trim().split(' ').filter(p => p);
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';
            const userEmail = (user.email || '').toLowerCase().trim();
            
            // Force populate if empty, whitespace-only, or placeholder text
            const currentFirstName = (this.state.settings.general.firstName || '').trim();
            const currentLastName = (this.state.settings.general.lastName || '').trim();
            const currentEmail = (this.state.settings.general.email || '').trim().toLowerCase();
            
            // Always populate from Google if field is empty or has placeholder
            // ALWAYS populate from Google if available (overrides any stored values)
            // This ensures profile info always matches Google login
            if (firstName) {
                this.state.settings.general.firstName = firstName;
            }
            if (lastName) {
                this.state.settings.general.lastName = lastName;
            }
            if (userEmail) {
                this.state.settings.general.email = userEmail;
            }
            if (user.photoURL && !this.state.settings.general.photoURL) {
                this.state.settings.general.photoURL = user.photoURL;
                // Trigger re-hosting to Imgur
                await this.hostGoogleAvatar(user.photoURL);
            }
        } else {
            console.warn('[Settings] No current user found, cannot auto-populate profile');
        }
    }

    async hostGoogleAvatar(googlePhotoURL) {
        if (!googlePhotoURL || this.state.settings.general.hostedPhotoURL) return;
        
        try {
            // Send Google URL to server to download and re-host
            const apiBase = 'https://power-choosers-crm-792458658491.us-south1.run.app';
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
                    
                    // Trigger profile photo refresh in auth system
                    if (window.authManager && typeof window.authManager.refreshProfilePhoto === 'function') {
                        window.authManager.refreshProfilePhoto();
                    }
                }
            } else {
                console.warn('[Settings] Upload failed, using Google URL directly');
                this.state.settings.general.hostedPhotoURL = googlePhotoURL;
                
                // Still trigger refresh even with fallback
                if (window.authManager && typeof window.authManager.refreshProfilePhoto === 'function') {
                    window.authManager.refreshProfilePhoto();
                }
            }
        } catch (error) {
            console.error('[Settings] Error hosting Google avatar:', error);
            // Fallback to direct Google URL
            this.state.settings.general.hostedPhotoURL = googlePhotoURL;
            
            // Still trigger refresh even with fallback
            if (window.authManager && typeof window.authManager.refreshProfilePhoto === 'function') {
                window.authManager.refreshProfilePhoto();
            }
        }
    }

    async saveSettings() {
        try {
            // Before saving, capture AI template values
            const aiTemplateFields = {
                warm_intro: document.getElementById('template-warm-intro')?.value || '',
                follow_up: document.getElementById('template-follow-up')?.value || '',
                energy_health: document.getElementById('template-energy-health')?.value || '',
                proposal: document.getElementById('template-proposal')?.value || '',
                cold_email: document.getElementById('template-cold-email')?.value || '',
                invoice: document.getElementById('template-invoice')?.value || '',
                who_we_are: document.getElementById('who-we-are')?.value || '',
                // NEW: Market Context
                marketContext: {
                    enabled: document.getElementById('market-context-enabled')?.checked ?? true,
                    rateIncrease: document.getElementById('market-rate-increase')?.value || '15-25%',
                    renewalYears: document.getElementById('market-renewal-years')?.value || '2025-2026',
                    earlyRenewalSavings: document.getElementById('market-early-renewal')?.value || '20-30%',
                    typicalClientSavings: document.getElementById('market-client-savings')?.value || '10-20%',
                    marketInsights: document.getElementById('market-insights')?.value || 'due to data center demand'
                },
                // NEW: Meeting Preferences
                meetingPreferences: {
                    enabled: document.getElementById('meeting-preferences-enabled')?.checked ?? true,
                    useHardcodedTimes: document.getElementById('meeting-use-hardcoded')?.checked ?? false,
                    slot1Time: document.getElementById('meeting-slot1-time')?.value || '2-3pm',
                    slot2Time: document.getElementById('meeting-slot2-time')?.value || '10-11am',
                    callDuration: document.getElementById('meeting-call-duration')?.value || '15-minute',
                    timeZone: document.getElementById('meeting-timezone')?.value || 'EST'
                }
            };
            this.state.settings.aiTemplates = aiTemplateFields;

            // Save to Firebase first
            if (window.firebaseDB) {
                // Get user email for ownership (required by Firestore rules)
                const userEmail = (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function')
                  ? window.DataManager.getCurrentUserEmail()
                  : ((window.currentUserEmail || '').toLowerCase());
                
                const user = firebase.auth().currentUser;
                const userId = user ? user.uid : null;
                
                // Use per-user doc ID so each employee has their own settings
                // Admin uses 'user-settings' (legacy), employees use 'user-settings-{email}'
                const isAdmin = (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function')
                  ? window.DataManager.isCurrentUserAdmin()
                  : (window.currentUserRole === 'admin');
                
                const docId = isAdmin ? 'user-settings' : `user-settings-${userEmail}`;
                
                // Check if document exists and if employee owns it (for update)
                let canUpdate = false;
                if (!isAdmin) {
                    try {
                        const existingDoc = await window.firebaseDB.collection('settings').doc(docId).get();
                        if (existingDoc.exists) {
                            const existingData = existingDoc.data();
                            const existingOwnerId = (existingData.ownerId || '').toLowerCase();
                            const existingUserId = existingData.userId;
                            if (existingOwnerId === userEmail || existingUserId === userId) {
                                canUpdate = true;
                            }
                        } else {
                            // Document doesn't exist, will create (allowed by create rule)
                            canUpdate = true;
                        }
                    } catch (error) {
                        console.warn('[Settings] Error checking existing document:', error);
                        // Try to create anyway
                    }
                }
                
                // Use set() which creates if doesn't exist, updates if it does
                // Firestore rules will allow this if ownerId/userId matches
                const settingsToSave = {
                    ...this.state.settings,
                    // Ownership fields (required by Firestore rules)
                    ownerId: userEmail || '',
                    userId: userId || null,
                    lastUpdated: new Date().toISOString(),
                    updatedBy: 'user'
                };
                
                // Ensure bridgeToMobile is explicitly saved (boolean, not undefined)
                settingsToSave.bridgeToMobile = this.state.settings.bridgeToMobile === true;
                
                await window.firebaseDB.collection('settings').doc(docId).set(settingsToSave, { merge: false });
                
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
            // Always show button - orange when there are changes, greyed when saved
            saveBtn.disabled = !this.state.isDirty;
            saveBtn.textContent = this.state.isDirty ? 'Save Changes' : 'All Changes Saved';
            
            // Ensure button is visible and styled correctly
            saveBtn.style.display = 'block';
            saveBtn.style.visibility = 'visible';
            
            // Apply orange styling (should already be in CSS, but ensure it's applied)
            if (this.state.isDirty) {
                saveBtn.classList.remove('disabled');
                saveBtn.style.opacity = '1';
                saveBtn.style.cursor = 'pointer';
            } else {
                saveBtn.style.opacity = '0.6';
                saveBtn.style.cursor = 'not-allowed';
            }
        }
    }

    renderSettings() {
        // Render email signature section (text + image preview + controls)
        this.renderSignatureSection();

        // Render AI Templates
        const aiTemplates = this.state.settings.aiTemplates || {};

        const warmIntro = document.getElementById('template-warm-intro');
        if (warmIntro) warmIntro.value = aiTemplates.warm_intro || '';

        const followUp = document.getElementById('template-follow-up');
        if (followUp) followUp.value = aiTemplates.follow_up || '';

        const energyHealth = document.getElementById('template-energy-health');
        if (energyHealth) energyHealth.value = aiTemplates.energy_health || '';

        const proposal = document.getElementById('template-proposal');
        if (proposal) proposal.value = aiTemplates.proposal || '';

        const coldEmail = document.getElementById('template-cold-email');
        if (coldEmail) coldEmail.value = aiTemplates.cold_email || '';

        const invoice = document.getElementById('template-invoice');
        if (invoice) invoice.value = aiTemplates.invoice || '';

        const whoWeAre = document.getElementById('who-we-are');
        if (whoWeAre) whoWeAre.value = aiTemplates.who_we_are || '';

        // NEW: Render Market Context
        const marketContext = aiTemplates.marketContext || {};

        const marketEnabled = document.getElementById('market-context-enabled');
        if (marketEnabled) marketEnabled.checked = marketContext.enabled !== false;

        const rateIncrease = document.getElementById('market-rate-increase');
        if (rateIncrease) rateIncrease.value = marketContext.rateIncrease || '15-25%';

        const renewalYears = document.getElementById('market-renewal-years');
        if (renewalYears) renewalYears.value = marketContext.renewalYears || '2025-2026';

        const earlyRenewal = document.getElementById('market-early-renewal');
        if (earlyRenewal) earlyRenewal.value = marketContext.earlyRenewalSavings || '20-30%';

        const clientSavings = document.getElementById('market-client-savings');
        if (clientSavings) clientSavings.value = marketContext.typicalClientSavings || '10-20%';

        const marketInsights = document.getElementById('market-insights');
        if (marketInsights) marketInsights.value = marketContext.marketInsights || 'due to data center demand';

        // NEW: Render Meeting Preferences
        const meetingPreferences = aiTemplates.meetingPreferences || {};

        const meetingEnabled = document.getElementById('meeting-preferences-enabled');
        if (meetingEnabled) meetingEnabled.checked = meetingPreferences.enabled !== false;

        const useHardcoded = document.getElementById('meeting-use-hardcoded');
        if (useHardcoded) useHardcoded.checked = meetingPreferences.useHardcodedTimes !== false;

        const slot1Time = document.getElementById('meeting-slot1-time');
        if (slot1Time) slot1Time.value = meetingPreferences.slot1Time || '2-3pm';

        const slot2Time = document.getElementById('meeting-slot2-time');
        if (slot2Time) slot2Time.value = meetingPreferences.slot2Time || '10-11am';

        const callDuration = document.getElementById('meeting-call-duration');
        if (callDuration) callDuration.value = meetingPreferences.callDuration || '15-minute';

        const timeZone = document.getElementById('meeting-timezone');
        if (timeZone) timeZone.value = meetingPreferences.timeZone || 'EST';

        // Render Twilio phone numbers
        this.renderPhoneNumbers();

        // Render profile information fields (Google login + editable)
        const g = this.state.settings.general || {};
        
        // ALWAYS populate from Google user during render (ensures fields show even if loadSettings failed)
        let user = null;
        
        // Try multiple sources for user object
        if (window.authManager && window.authManager.getCurrentUser && typeof window.authManager.getCurrentUser === 'function') {
            user = window.authManager.getCurrentUser();
        }
        if (!user) {
            user = firebase.auth().currentUser;
        }
        
        if (user) {
            // Extract from user object (try displayName first, then email)
            const displayName = user.displayName || '';
            const email = (user.email || '').toLowerCase().trim();
            const nameParts = displayName.trim().split(' ').filter(p => p);
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';
            
            // Force populate from Google (overrides any stored values and placeholders)
            if (firstName) {
                g.firstName = firstName;
                this.state.settings.general.firstName = firstName;
            }
            if (lastName) {
                g.lastName = lastName;
                this.state.settings.general.lastName = lastName;
            }
            if (email) {
                g.email = email;
                this.state.settings.general.email = email;
            }
        } else {
            console.warn('[Settings] No user available during render for profile population');
            // Try one more time with a delay
            setTimeout(() => {
                const retryUser = (window.authManager && window.authManager.getCurrentUser) 
                    ? window.authManager.getCurrentUser() 
                    : firebase.auth().currentUser;
                if (retryUser && (!g.firstName || !g.lastName || !g.email)) {
                    const nameParts = (retryUser.displayName || '').trim().split(' ').filter(p => p);
                    if (nameParts[0]) {
                        g.firstName = nameParts[0];
                        this.state.settings.general.firstName = nameParts[0];
                        const firstNameEl = document.getElementById('user-first-name');
                        if (firstNameEl) firstNameEl.value = nameParts[0];
                    }
                    if (nameParts.slice(1).join(' ')) {
                        g.lastName = nameParts.slice(1).join(' ');
                        this.state.settings.general.lastName = nameParts.slice(1).join(' ');
                        const lastNameEl = document.getElementById('user-last-name');
                        if (lastNameEl) lastNameEl.value = nameParts.slice(1).join(' ');
                    }
                    if (retryUser.email) {
                        g.email = retryUser.email.toLowerCase();
                        this.state.settings.general.email = retryUser.email.toLowerCase();
                        const emailEl = document.getElementById('user-email');
                        if (emailEl) emailEl.value = retryUser.email.toLowerCase();
                    }
                }
            }, 500);
        }
        
        const userFirstName = document.getElementById('user-first-name');
        if (userFirstName) {
            // Always set the actual value, never placeholder text
            const firstNameValue = g.firstName || '';
            userFirstName.value = firstNameValue;
            // Update state to match input
            if (firstNameValue && !this.state.settings.general.firstName) {
                this.state.settings.general.firstName = firstNameValue;
            }
        }
        
        const userLastName = document.getElementById('user-last-name');
        if (userLastName) {
            // Always set the actual value, never placeholder text
            const lastNameValue = g.lastName || '';
            userLastName.value = lastNameValue;
            // Update state to match input
            if (lastNameValue && !this.state.settings.general.lastName) {
                this.state.settings.general.lastName = lastNameValue;
            }
        }
        
        const userEmail = document.getElementById('user-email');
        if (userEmail) {
            // Always set the actual value, never placeholder text
            const emailValue = g.email || '';
            userEmail.value = emailValue;
            // Update state to match input
            if (emailValue && !this.state.settings.general.email) {
                this.state.settings.general.email = emailValue;
            }
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

        // Render cold email settings
        const cold = this.state.settings.coldEmailSettings || {};
        const industrySegment = document.getElementById('cold-email-industry-segment');
        if (industrySegment) industrySegment.checked = cold.industrySegmentationEnabled !== false; // Default true
        
        const observation = document.getElementById('cold-email-observation');
        if (observation) observation.checked = cold.requireObservationBased !== false; // Default true
        
        const avoidAI = document.getElementById('cold-email-avoid-ai');
        if (avoidAI) avoidAI.checked = cold.avoidAIPhrases !== false; // Default true
        
        const varySubject = document.getElementById('cold-email-vary-subject');
        if (varySubject) varySubject.checked = cold.varySubjectLineFormat !== false; // Default true
        
        const lowCommitment = document.getElementById('cold-email-low-commitment');
        if (lowCommitment) lowCommitment.checked = cold.requireLowCommitmentCTA !== false; // Default true
        
        const maxLength = document.getElementById('cold-email-max-length');
        if (maxLength) maxLength.value = cold.maxEmailLength || 120;

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

        if (!preview) {
            console.warn('[Signature] Preview element not found, cannot render signature');
            return;
        }

        // Build preview HTML: text (if any) above image (if any)
        let html = '';
        if (signature.text) {
            const textHtml = (signature.text || '').replace(/\n/g, '<br>');
            html += `<div class="signature-text-preview" style="font-family: inherit; font-size: 14px; color: var(--text-primary); line-height: 1.4; margin-bottom: ${signature.image ? '10px' : '0'};">${textHtml}</div>`;
        }
        if (signature.image) {
            // Use imageSize from settings, with defaults if not set
            const width = signature.imageSize?.width || 200;
            const height = signature.imageSize?.height || 100;
            // Escape the image URL to prevent XSS
            const imageUrl = String(signature.image).replace(/"/g, '&quot;');
            html += `
                <div class="signature-image-wrap" style="display:flex; align-items:center; gap:12px; margin-top: 8px;">
                    <img src="${imageUrl}" alt="Signature preview" 
                         style="max-width: ${width}px; max-height: ${height}px; border-radius: 4px; border: 1px solid var(--border-light);"
                         onerror="console.error('[Signature] Image failed to load:', this.src); this.style.display='none';">
                    <button type="button" class="btn-small btn-danger" id="remove-signature-image" title="Remove image">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                            <polyline points="3,6 5,6 21,6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>`;
        }
        
        // Update image size input fields
        const widthInput = document.getElementById('signature-image-size-width');
        const heightInput = document.getElementById('signature-image-size-height');
        if (widthInput) {
            widthInput.value = signature.imageSize?.width || 200;
        }
        if (heightInput) {
            heightInput.value = signature.imageSize?.height || 100;
        }

        // Apply preview state
        if (html) {
            // Remove hidden attribute and ensure it's visible
            preview.removeAttribute('hidden');
            preview.style.display = 'block';
            preview.style.visibility = 'visible';
            preview.style.opacity = '1';
            preview.innerHTML = html;
        } else {
            preview.setAttribute('hidden', '');
            preview.style.display = 'none';
            preview.style.visibility = 'hidden';
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

        // Wire remove button if present (remove old listeners first to prevent duplicates)
        const removeBtn = document.getElementById('remove-signature-image');
        if (removeBtn) {
            // Clone and replace to remove all event listeners
            const newRemoveBtn = removeBtn.cloneNode(true);
            removeBtn.parentNode.replaceChild(newRemoveBtn, removeBtn);
            newRemoveBtn.addEventListener('click', () => {
                this.removeSignatureImage();
            });
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

        const isAdmin = (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function')
            ? window.DataManager.isCurrentUserAdmin()
            : (window.currentUserRole === 'admin');
        
        phoneList.innerHTML = this.state.settings.twilioNumbers.map((phone, index) => {
            const isSelected = this.state.settings.selectedPhoneNumber === phone.number;
            // Ensure bridgeToMobile is boolean (not undefined/null)
            const bridgeToMobile = this.state.settings.bridgeToMobile === true;
            
            
            return `
                <div class="phone-number-item ${isSelected ? 'selected' : ''}" data-index="${index}">
                    <div class="phone-info">
                        <span class="phone-number">${phone.number}</span>
                        <span class="phone-label">${phone.label}${isSelected ? ' (Current)' : ''}</span>
                    </div>
                    <div class="phone-actions">
                        ${!isSelected ? `<button class="btn-small btn-primary" data-action="select">Set as Current</button>` : ''}
                        ${isSelected && isAdmin ? `
                            <label class="toggle-switch" title="Bridge to mobile phone (9728342317)">
                                <input type="checkbox" class="bridge-to-mobile-toggle" ${bridgeToMobile ? 'checked' : ''} aria-label="Bridge calls to mobile phone">
                                <span class="toggle-slider"></span>
                            </label>
                        ` : ''}
                        <button class="btn-small btn-secondary" data-action="edit" style="margin-left: ${isSelected && isAdmin ? '8px' : '0'};">Edit</button>
                        <button class="btn-small btn-danger" data-action="remove" style="margin-left: 8px;">Remove</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            if (window.showToast) {
                window.showToast('Please select a valid image file.', 'error');
            }
            // Reset input to allow selecting the same file again
            event.target.value = '';
            return;
        }

        // Validate file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            if (window.showToast) {
                window.showToast('Image file must be smaller than 2MB.', 'error');
            }
            // Reset input to allow selecting the same file again
            event.target.value = '';
            return;
        }

        // Store reference to file input for reset
        const fileInput = event.target;
        const uploadBtn = document.getElementById('upload-signature-image');

        try {
            // Show uploading state with visual indicator
            if (window.showToast) {
                window.showToast('Uploading signature image...', 'info');
            }
            
            // Disable upload button during upload
            if (uploadBtn) {
                uploadBtn.disabled = true;
                uploadBtn.style.opacity = '0.6';
                uploadBtn.textContent = 'Uploading...';
            }


            // Convert file to base64 and upload as JSON
            const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
                reader.onload = () => {
                    const result = reader.result;
                    const base64Data = result.split(',')[1];
                    resolve(base64Data);
                };
                reader.onerror = (err) => {
                    console.error('[Signature] FileReader error:', err);
                    reject(err);
                };
                reader.readAsDataURL(file);
            });

            // Always use Vercel endpoint (works locally and deployed)
            const apiBase = 'https://power-choosers-crm-792458658491.us-south1.run.app';
            const uploadUrl = `${apiBase}/api/upload/signature-image`;
            
            // Create AbortController for timeout (60 seconds to allow for large images and Imgur processing)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
            }, 60000); // 60 second timeout
            
            let response;
            try {
                response = await fetch(uploadUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: base64, type: 'signature' }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
            } catch (fetchError) {
                clearTimeout(timeoutId);
                console.error('[Signature] Fetch error caught:', fetchError);
                if (fetchError.name === 'AbortError') {
                    throw new Error('Upload timed out after 60 seconds. The server may be processing a large image. Please try again with a smaller image or check your connection.');
                }
                throw new Error(`Network error: ${fetchError.message}`);
            }


            if (!response.ok) {
                let errorText = '';
                try {
                    errorText = await response.text();
                    console.error('[Signature] Upload failed with status:', response.status, errorText);
                } catch (textError) {
                    console.error('[Signature] Could not read error response:', textError);
                    errorText = `HTTP ${response.status}`;
                }
                throw new Error(`Upload failed: ${response.status} - ${errorText}`);
            }

            let responseData;
            try {
                const responseText = await response.text();
                responseData = JSON.parse(responseText);
            } catch (parseError) {
                console.error('[Signature] Failed to parse response:', parseError);
                throw new Error('Invalid response from server');
            }

            // Handle both response formats: { imageUrl } or { success, imageUrl }
            const imageUrl = responseData.imageUrl || (responseData.success && responseData.data?.link);
            
            if (!imageUrl) {
                console.error('[Signature] No imageUrl in response:', responseData);
                throw new Error('Server did not return image URL');
            }


                // Store the hosted image URL
            if (!this.state.settings.emailSignature) {
                this.state.settings.emailSignature = { text: '', image: null, imageSize: { width: 200, height: 100 } };
            }
                this.state.settings.emailSignature.image = imageUrl;
            
            // Mark as dirty and update UI
            this.markDirty();
            this.renderSignatureSection();
            
            // Auto-save the settings immediately after successful upload
            await this.saveSettings();
            
            // Reset file input to allow selecting the same file again
            fileInput.value = '';
            
            // Re-enable upload button
            if (uploadBtn) {
                uploadBtn.disabled = false;
                uploadBtn.style.opacity = '1';
            }
                
                if (window.showToast) {
                window.showToast('Signature image uploaded and saved successfully!', 'success');
                }
            
        } catch (error) {
            console.error('[Signature] Upload error:', error);
            console.error('[Signature] Error stack:', error.stack);
            console.error('[Signature] Error details:', {
                name: error.name,
                message: error.message,
                cause: error.cause
            });
            
            // Reset file input on error
            fileInput.value = '';
            
            // Re-enable upload button
            if (uploadBtn) {
                uploadBtn.disabled = false;
                uploadBtn.style.opacity = '1';
                const uploadBtnEl = document.getElementById('upload-signature-image');
                if (uploadBtnEl) {
                    uploadBtnEl.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path>
                            <circle cx="12" cy="13" r="3"></circle>
                        </svg>
                        Upload Image`;
                }
            }
            
            const errorMessage = error.message || 'Failed to upload signature image. Please try again.';
            if (window.showToast) {
                window.showToast(errorMessage, 'error');
            }
        }
    }

    async uploadSignatureImage(file) {
        try {
            // Always use Vercel endpoint for uploads (works locally and deployed)
            const apiBase = 'https://power-choosers-crm-792458658491.us-south1.run.app';
            
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
        if (!this.state.settings.emailSignature) {
            this.state.settings.emailSignature = { text: '', image: null, imageSize: { width: 200, height: 100 } };
        }
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
            // If removing the selected number, clear the selection
            if (this.state.settings.selectedPhoneNumber === phone.number) {
                this.state.settings.selectedPhoneNumber = null;
            }
            
            this.state.settings.twilioNumbers.splice(index, 1);
            this.renderPhoneNumbers();
            this.markDirty();
        }
    }

    handleBridgeToMobileToggle(toggle) {
        // Admin only feature - bridge calls to mobile phone (9728342317)
        const isAdmin = (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function')
            ? window.DataManager.isCurrentUserAdmin()
            : (window.currentUserRole === 'admin');
        
        if (!isAdmin) {
            console.warn('[Settings] Bridge to mobile toggle is admin-only');
            toggle.checked = false;
            return;
        }
        
        const bridgeToMobile = toggle.checked;
        this.state.settings.bridgeToMobile = bridgeToMobile;
        this.markDirty();
        
        
        // Re-render phone numbers to update UI immediately
        this.renderPhoneNumbers();
        
        // Show success message
        if (window.showToast) {
            window.showToast(
                bridgeToMobile 
                    ? 'Calls will be bridged to mobile phone (9728342317)' 
                    : 'Calls will use browser/desktop',
                'success'
            );
        }
    }
    
    selectPhoneNumber(phoneItem) {
        const index = parseInt(phoneItem.dataset.index);
        const phone = this.state.settings.twilioNumbers[index];
        
        // Set this number as the selected one
        this.state.settings.selectedPhoneNumber = phone.number;
        this.renderPhoneNumbers();
        this.markDirty();
        
        // Show success message
        if (window.showToast) {
            window.showToast(`${phone.label} (${phone.number}) is now your current number`, 'success');
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
                // Use imageSize from settings, with defaults if not set
                const width = signature.imageSize?.width || 200;
                const height = signature.imageSize?.height || 100;
                signatureHtml += `<div style="margin-top: 10px;"><img src="${signature.image}" alt="Signature" style="max-width: ${width}px; max-height: ${height}px; border-radius: 4px;" /></div>`;
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

    // Algolia reindex methods
    showAlgoliaStatus(message, type = 'info') {
        const statusDiv = document.getElementById('algolia-status');
        if (!statusDiv) return;

        const colors = {
            info: { bg: '#d1ecf1', color: '#0c5460', border: '#bee5eb' },
            success: { bg: '#d4edda', color: '#155724', border: '#c3e6cb' },
            error: { bg: '#f8d7da', color: '#721c24', border: '#f5c6cb' }
        };

        const style = colors[type] || colors.info;
        statusDiv.style.display = 'block';
        statusDiv.style.background = style.bg;
        statusDiv.style.color = style.color;
        statusDiv.style.border = `1px solid ${style.border}`;
        statusDiv.textContent = message;
    }

    logAlgolia(message) {
        const logDiv = document.getElementById('algolia-log');
        if (!logDiv) return;

        const timestamp = new Date().toLocaleTimeString();
        logDiv.textContent += `[${timestamp}] ${message}\n`;
        logDiv.scrollTop = logDiv.scrollHeight;
    }

    clearAlgoliaLog() {
        const logDiv = document.getElementById('algolia-log');
        if (logDiv) logDiv.textContent = '';
    }

    loadAlgoliaCredentials() {
        try {
            const appId = localStorage.getItem('algolia-app-id');
            const apiKey = localStorage.getItem('algolia-api-key');
            
            const appIdInput = document.getElementById('algolia-app-id');
            const apiKeyInput = document.getElementById('algolia-api-key');
            
            if (appIdInput && appId) appIdInput.value = appId;
            if (apiKeyInput && apiKey) apiKeyInput.value = apiKey;
            
            // Set global variables for reindex functions
            if (appId) window.ALGOLIA_APP_ID = appId;
            if (apiKey) window.ALGOLIA_API_KEY = apiKey;
            
            // Add input listeners to save credentials
            if (appIdInput) {
                appIdInput.addEventListener('input', (e) => {
                    localStorage.setItem('algolia-app-id', e.target.value);
                    window.ALGOLIA_APP_ID = e.target.value;
                });
            }
            
            if (apiKeyInput) {
                apiKeyInput.addEventListener('input', (e) => {
                    localStorage.setItem('algolia-api-key', e.target.value);
                    window.ALGOLIA_API_KEY = e.target.value;
                });
            }
        } catch (error) {
            console.warn('Failed to load Algolia credentials:', error);
        }
    }

    async reindexAlgoliaAccounts() {
        this.showAlgoliaStatus('Starting accounts reindex...', 'info');
        this.logAlgolia('🔄 Starting server-side Algolia reindex for all accounts...');

        try {
            // Get Algolia credentials from localStorage or prompt user
            const appId = window.ALGOLIA_APP_ID || prompt('Enter your Algolia Application ID:');
            const apiKey = window.ALGOLIA_API_KEY || prompt('Enter your Algolia Admin API Key:');
            
            if (!appId || !apiKey) {
                throw new Error('Algolia credentials required. Please enter your Application ID and Admin API Key.');
            }

            this.logAlgolia('📡 Sending reindex request to server...');

            // Call server-side API
            const baseUrl = window.API_BASE_URL || window.location.origin || '';
            const response = await fetch(`${baseUrl}/api/algolia/reindex`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    appId: appId,
                    apiKey: apiKey,
                    type: 'accounts'
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `Server error: ${response.status}`);
            }

            if (result.success) {
                this.logAlgolia(`🎉 Reindex complete!`);
                this.logAlgolia(`✅ Successfully processed: ${result.processed} accounts`);
                if (result.errors > 0) {
                    this.logAlgolia(`❌ Errors: ${result.errors} accounts`);
                }
                if (result.verificationCount !== undefined) {
                    this.logAlgolia(`📊 Verification: ${result.verificationCount} total records now in Algolia index`);
                }
                this.logAlgolia(`📤 All accounts have been synced to Algolia via server!`);

                this.showAlgoliaStatus(`Reindex complete! Processed ${result.processed} accounts`, 'success');
            } else {
                throw new Error(result.error || 'Unknown server error');
            }

        } catch (error) {
            this.logAlgolia(`❌ Error during reindex: ${error.message}`);
            this.showAlgoliaStatus(`Error: ${error.message}`, 'error');
        }
    }

    async reindexAlgoliaContacts() {
        this.showAlgoliaStatus('Starting contacts reindex...', 'info');
        this.logAlgolia('🔄 Starting server-side Algolia reindex for all contacts...');

        try {
            // Get Algolia credentials from localStorage or prompt user
            const appId = window.ALGOLIA_APP_ID || prompt('Enter your Algolia Application ID:');
            const apiKey = window.ALGOLIA_API_KEY || prompt('Enter your Algolia Admin API Key:');
            
            if (!appId || !apiKey) {
                throw new Error('Algolia credentials required. Please enter your Application ID and Admin API Key.');
            }

            this.logAlgolia('📡 Sending reindex request to server...');

            // Call server-side API
            const baseUrl = window.API_BASE_URL || window.location.origin || '';
            const response = await fetch(`${baseUrl}/api/algolia/reindex`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    appId: appId,
                    apiKey: apiKey,
                    type: 'contacts'
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `Server error: ${response.status}`);
            }

            if (result.success) {
                this.logAlgolia(`🎉 Reindex complete!`);
                this.logAlgolia(`✅ Successfully processed: ${result.processed} contacts`);
                if (result.errors > 0) {
                    this.logAlgolia(`❌ Errors: ${result.errors} contacts`);
                }
                if (result.verificationCount !== undefined) {
                    this.logAlgolia(`📊 Verification: ${result.verificationCount} total records now in Algolia index`);
                }
                this.logAlgolia(`📤 All contacts have been synced to Algolia via server!`);

                this.showAlgoliaStatus(`Reindex complete! Processed ${result.processed} contacts`, 'success');
            } else {
                throw new Error(result.error || 'Unknown server error');
            }

        } catch (error) {
            this.logAlgolia(`❌ Error during reindex: ${error.message}`);
            this.showAlgoliaStatus(`Error: ${error.message}`, 'error');
        }
    }
}

// Inject modern styles for settings page only
function injectModernStyles() {
    // Only inject if we're on the settings page
    if (!document.getElementById('settings-page')) {
        // Retry if DOM not ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', injectModernStyles);
        }
        return;
    }
    
    // Check if styles already injected
    if (document.getElementById('settings-modern-styles')) return;
    
    // Create style element with scoped styles
    const style = document.createElement('style');
    style.id = 'settings-modern-styles';
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
        
        #settings-page .settings-content {
            overflow: hidden;
            transition: height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease, padding 0.4s ease;
        }
        
        #settings-page .settings-section.collapsed .settings-content {
            height: 0 !important;
            padding-top: 0 !important;
            padding-bottom: 0 !important;
            opacity: 0;
            overflow: hidden;
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
            background: linear-gradient(135deg, var(--orange-primary) 0%, #ff8c42 100%) !important;
            border: none !important;
            border-radius: 8px;
            padding: 12px 24px;
            font-size: 14px;
            font-weight: 600;
            color: white !important;
            box-shadow: 0 2px 8px rgba(255, 140, 0, 0.3);
            transition: all 0.2s ease;
            display: block !important;
            visibility: visible !important;
        }
        
        #settings-page #save-settings-btn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(255, 140, 0, 0.4);
            background: linear-gradient(135deg, #e55a2b 0%, #ff8c42 100%) !important;
        }
        
        #settings-page #save-settings-btn:disabled {
            opacity: 0.6 !important;
            cursor: not-allowed !important;
            transform: none;
            box-shadow: 0 2px 8px rgba(255, 140, 0, 0.2);
            background: linear-gradient(135deg, var(--orange-primary) 0%, #ff8c42 100%) !important;
        }
        
        #settings-page #save-settings-btn:not(:disabled) {
            opacity: 1 !important;
            cursor: pointer !important;
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
    
    // Update section titles and add voicemail section (run immediately)
    updateSectionTitles();
    addVoicemailSection();
    
    // Add collapse buttons immediately (with retry logic)
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
    // Add collapse buttons to all section titles - run immediately, retry if DOM not ready
    const tryAddButtons = () => {
        const sectionTitles = document.querySelectorAll('#settings-page .settings-section-title');
        if (sectionTitles.length === 0) {
            // DOM not ready yet, retry after a short delay
            setTimeout(tryAddButtons, 100);
            return;
        }
        
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
        
    };
    
    // Try immediately, and if DOM not ready, retry
    tryAddButtons();
}

function setupCollapseFunctionality() {
    // Add collapse/expand functionality - run immediately, retry if DOM not ready
    const trySetupCollapse = () => {
        const sections = document.querySelectorAll('#settings-page .settings-section');
        if (sections.length === 0) {
            // DOM not ready yet, retry after a short delay
            setTimeout(trySetupCollapse, 100);
            return;
        }
        
        sections.forEach(section => {
            // Skip if already set up
            if (section.dataset.collapseSetup === 'true') return;
            
            const title = section.querySelector('.settings-section-title');
            let collapseBtn = section.querySelector('.collapse-btn');
            
            // If collapse button doesn't exist yet, wait for it or create it
            if (!collapseBtn && title) {
                // Wait a bit for addCollapseButtons to run
                setTimeout(() => {
                    collapseBtn = section.querySelector('.collapse-btn');
                    if (collapseBtn) {
                        setupSectionCollapse(section, title, collapseBtn);
                        section.dataset.collapseSetup = 'true';
                    }
                }, 150);
            } else if (title && collapseBtn) {
                setupSectionCollapse(section, title, collapseBtn);
                section.dataset.collapseSetup = 'true';
            }
        });
        
    };
    
    const setupSectionCollapse = (section, title, collapseBtn) => {
        // Mark as initially rendered (no animation on first load)
        const content = section.querySelector('.settings-content');
        if (content) {
            content.dataset.initialRender = 'true';
        }
        
        // Start all sections collapsed by default
        section.classList.add('collapsed');
        if (collapseBtn) {
            collapseBtn.setAttribute('aria-label', 'Expand section');
        }
        
        // Make the entire title clickable
        title.addEventListener('click', () => {
            toggleSectionCollapse(section);
        });
        
        // Prevent button click from bubbling to title
        collapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSectionCollapse(section);
        });
    };
    
    // Try immediately, and if DOM not ready, retry
    trySetupCollapse();
}

function toggleSectionCollapse(section) {
    const content = section.querySelector('.settings-content');
    if (!content) return;
    
    const isCollapsed = section.classList.contains('collapsed');
    const collapseBtn = section.querySelector('.collapse-btn');
    
    // Skip animation on initial render
    const isInitialRender = content.dataset.initialRender === 'true';
    if (isInitialRender) {
        content.dataset.initialRender = 'false';
    }
    
    if (isCollapsed) {
        // Expand
        section.classList.remove('collapsed');
        
        if (isInitialRender) {
            // No animation on initial render
            if (collapseBtn) {
                collapseBtn.setAttribute('aria-label', 'Collapse section');
            }
            return;
        }
        
        // First, set height to 0 and remove collapsed class to get natural height
        content.style.height = '0';
        content.style.opacity = '0';
        
        // Get the natural height
        const naturalHeight = content.scrollHeight;
        const naturalPaddingTop = window.getComputedStyle(content).paddingTop;
        const naturalPaddingBottom = window.getComputedStyle(content).paddingBottom;
        
        // Force reflow
        void content.offsetHeight;
        
        // Animate to natural height
        requestAnimationFrame(() => {
            content.style.transition = 'height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease, padding 0.4s ease';
            content.style.height = naturalHeight + 'px';
            content.style.opacity = '1';
            content.style.paddingTop = naturalPaddingTop;
            content.style.paddingBottom = naturalPaddingBottom;
            
            // Clean up after animation
            setTimeout(() => {
                content.style.height = '';
                content.style.transition = '';
                content.style.paddingTop = '';
                content.style.paddingBottom = '';
            }, 400);
        });
        
        if (collapseBtn) {
            collapseBtn.setAttribute('aria-label', 'Collapse section');
        }
    } else {
        // Collapse
        if (isInitialRender) {
            // No animation on initial render
            section.classList.add('collapsed');
            if (collapseBtn) {
                collapseBtn.setAttribute('aria-label', 'Expand section');
            }
            return;
        }
        
        const currentHeight = content.scrollHeight;
        const currentPaddingTop = window.getComputedStyle(content).paddingTop;
        const currentPaddingBottom = window.getComputedStyle(content).paddingBottom;
        
        // Set explicit height before animating
        content.style.height = currentHeight + 'px';
        content.style.paddingTop = currentPaddingTop;
        content.style.paddingBottom = currentPaddingBottom;
        
        // Force reflow
        void content.offsetHeight;
        
        // Animate to 0
        requestAnimationFrame(() => {
            section.classList.add('collapsed');
            content.style.transition = 'height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease, padding 0.4s ease';
            content.style.height = '0';
            content.style.opacity = '0';
            content.style.paddingTop = '0';
            content.style.paddingBottom = '0';
        });
        
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
        // Wait for auth to be ready before initializing settings (if needed)
        let authReady = false;
        if (window.authManager && window.authManager.isAuthenticated && window.authManager.isAuthenticated()) {
            authReady = true;
        } else if (firebase && firebase.auth && firebase.auth().currentUser) {
            authReady = true;
        } else {
            // Wait a bit for auth to initialize (max 2 seconds)
            for (let i = 0; i < 20; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                if ((window.authManager && window.authManager.isAuthenticated && window.authManager.isAuthenticated()) ||
                    (firebase && firebase.auth && firebase.auth().currentUser)) {
                    authReady = true;
                    break;
                }
            }
        }
        
        window.SettingsPage = new SettingsPage();
        window.SettingsPage.instance = window.SettingsPage;
        
        // Force update profile fields after initialization completes
        if (window.SettingsPage && typeof window.SettingsPage.forceUpdateProfileFields === 'function') {
            setTimeout(() => {
                window.SettingsPage.forceUpdateProfileFields();
            }, 500);
        }
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