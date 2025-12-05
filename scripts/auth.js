// Firebase Authentication Module
// Handles Google Sign-In and profile management

class AuthManager {
    constructor() {
        this.user = null;
        this.auth = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        try {
            // Firebase is already initialized by firebase.js
            // Just get the auth instance
            if (!firebase || !firebase.apps || !firebase.apps.length) {
                throw new Error('Firebase not initialized. Ensure firebase.js loads before auth.js');
            }

            this.auth = firebase.auth();
            this.initialized = true;
            
            console.log('[Auth] Firebase Auth initialized');

            // Listen for auth state changes
            this.auth.onAuthStateChanged((user) => {
                this.handleAuthStateChange(user);
            });

        } catch (error) {
            console.error('[Auth] Initialization error:', error);
            this.showError('Failed to initialize authentication. Please refresh the page.');
        }
    }

    async handleAuthStateChange(user) {
      console.log('[Auth] ==> handleAuthStateChange triggered, user:', user ? user.email : 'null');
      this.user = user;

      if (user) {
        console.log('[Auth] User object:', {email: user.email, uid: user.uid});
        const emailLower = user.email ? user.email.toLowerCase() : '';
        try {
          const prev = localStorage.getItem('pc:lastUserEmail') || '';
          if (prev && prev !== emailLower) {
            console.log('[Auth] Detected account switch. Invalidating all caches...');
            if (window.CacheManager && typeof window.CacheManager.invalidateAll === 'function') {
              await window.CacheManager.invalidateAll();
            }
          }
          localStorage.setItem('pc:lastUserEmail', emailLower);
        } catch(_) {}
            
            // Check domain restriction (case-insensitive)
            if (!emailLower.endsWith('@powerchoosers.com')) {
                console.warn('[Auth] ✗ Unauthorized domain:', user.email);
                this.showError('Access restricted to Power Choosers employees (@powerchoosers.com)');
                await this.signOut();
                return;
            }
            
            console.log('[Auth] ✓ Domain authorized:', user.email);
            
            // Ensure user profile exists and get role
            console.log('[Auth] Creating/fetching user profile...');
            try {
                await this.ensureUserProfile(user);
                console.log('[Auth] ✓ User profile ready');
            } catch (error) {
                console.error('[Auth] ✗ Error with user profile:', error);
            }
            
            console.log('[Auth] Calling showCRM()...');
            await this.showCRM();
            
            console.log('[Auth] Updating user profile UI...');
            this.updateUserProfile(user);
            
            // Update admin-only elements visibility
            this.updateAdminOnlyElements();
            
            console.log('[Auth] ✓ Auth flow complete');
        } else {
        console.log('[Auth] No user - showing login');
        try {
          if (window.CacheManager && typeof window.CacheManager.invalidateAll === 'function') {
            await window.CacheManager.invalidateAll();
          }
        } catch(_) {}
        this.showLogin();
      }
    }

    async ensureUserProfile(user) {
        const db = firebase.firestore();
        const emailLower = user.email.toLowerCase();
        const userRef = db.collection('users').doc(emailLower);
        
        try {
            const userDoc = await userRef.get();
            
            if (!userDoc.exists) {
                // First time login - create profile
                const isAdmin = (emailLower === 'l.patterson@powerchoosers.com');
                const role = isAdmin ? 'admin' : 'employee';
                
                await userRef.set({
                    email: emailLower,
                    name: user.displayName || emailLower.split('@')[0],
                    role: role,
                    photoURL: user.photoURL || null,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                console.log(`[Auth] Created ${role} profile for ${emailLower}`);
                
                // Auto-create agent record for PowerChoosers users
                await this.ensureAgentRecord(user, emailLower);
            } else {
                // Update last login
                await userRef.update({
                    lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Ensure agent record exists (in case it was deleted or never created)
                await this.ensureAgentRecord(user, emailLower);
            }
            
            // Get and store role globally
            const profile = await userRef.get();
            const userData = profile.data();
            window.currentUserRole = userData.role;
            window.currentUserEmail = emailLower;
            
            console.log(`[Auth] User role: ${userData.role}`);
        } catch (error) {
            console.error('[Auth] Error ensuring user profile:', error);
            // Fallback to determining role from email
            const emailLower = user.email.toLowerCase();
            window.currentUserEmail = emailLower;
            window.currentUserRole = (emailLower === 'l.patterson@powerchoosers.com') ? 'admin' : 'employee';
        }
    }
    
    async ensureAgentRecord(user, emailLower) {
        // Only create agent records for PowerChoosers domain users
        if (!emailLower.endsWith('@powerchoosers.com')) {
            return;
        }
        
        try {
            const db = firebase.firestore();
            const agentRef = db.collection('agents').doc(emailLower);
            const agentDoc = await agentRef.get();
            
            if (!agentDoc.exists) {
                // Auto-create agent record with defaults
                const userName = user.displayName || emailLower.split('@')[0];
                const agentData = {
                    name: userName,
                    email: emailLower,
                    territory: '', // Admin can assign later
                    skills: [], // Admin can add later
                    status: 'offline',
                    role: 'sales_agent',
                    goals: {
                        callsPerDay: 50,
                        emailsPerDay: 20,
                        dealsPerMonth: 5
                    },
                    performance: {
                        totalCalls: 0,
                        totalEmails: 0,
                        dealsClosed: 0,
                        conversionRate: 0
                    },
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastActive: firebase.firestore.FieldValue.serverTimestamp(),
                    autoCreated: true // Flag to indicate auto-creation
                };
                
                await agentRef.set(agentData);
                console.log(`[Auth] Auto-created agent record for ${emailLower}`);
            } else {
                // Agent exists - just update lastActive timestamp if needed
                const agentData = agentDoc.data();
                if (!agentData.name || agentData.name === emailLower.split('@')[0]) {
                    // Update name if it's missing or just the email prefix
                    const userName = user.displayName || emailLower.split('@')[0];
                    if (userName && userName !== emailLower.split('@')[0]) {
                        await agentRef.update({
                            name: userName,
                            lastActive: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }
                }
            }
        } catch (error) {
            // Log error but don't block login if agent creation fails
            console.warn('[Auth] Could not ensure agent record (this is okay for first-time setup):', error);
        }
    }

    async signInWithGoogle() {
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({
                prompt: 'select_account'
            });
            // Add Gmail readonly scope for inbox sync (client-side, FREE)
            provider.addScope('https://www.googleapis.com/auth/gmail.readonly');

            const result = await this.auth.signInWithPopup(provider);
            console.log('[Auth] Sign-in successful:', result.user.email);
            
            // Store Google access token for Gmail API access (client-side sync)
            if (result.credential && result.credential.accessToken) {
                window._googleAccessToken = result.credential.accessToken;
                console.log('[Auth] Stored Google access token for Gmail sync');
            }
            
            // Show success message
            this.showSuccess('Welcome back!');

        } catch (error) {
            console.error('[Auth] Sign-in error:', error);
            
            if (error.code === 'auth/popup-closed-by-user') {
                this.showError('Sign-in cancelled. Please try again.');
            } else if (error.code === 'auth/popup-blocked') {
                this.showError('Popup blocked. Please allow popups for this site.');
            } else {
                this.showError('Failed to sign in. Please try again.');
            }
        }
    }

    async signOut() {
      try {
        await this.auth.signOut();
        console.log('[Auth] Sign-out successful');
        try {
          if (window.CacheManager && typeof window.CacheManager.invalidateAll === 'function') {
            await window.CacheManager.invalidateAll();
          }
        } catch(_) {}
        this.showSuccess('Signed out successfully');
      } catch (error) {
        console.error('[Auth] Sign-out error:', error);
        this.showError('Failed to sign out. Please try again.');
      }
  }

    showLogin() {
        const loginOverlay = document.getElementById('login-overlay');
        const crmContent = document.getElementById('crm-content');
        
        if (loginOverlay) loginOverlay.style.display = 'flex';
        if (crmContent) crmContent.style.display = 'none';
    }

    async showCRM() {
        console.log('[Auth] showCRM() called');
        const loginOverlay = document.getElementById('login-overlay');
        const crmContent = document.getElementById('crm-content');
        
        // Hide login overlay immediately
        if (loginOverlay) {
            loginOverlay.style.display = 'none';
            console.log('[Auth] Login overlay hidden');
        }
        
        // Show CRM content
        if (crmContent) {
            crmContent.style.display = 'block';
            console.log('[Auth] CRM content shown');
        }
        
        // Load CRM scripts lazily (only once)
        if (typeof window.loadCRMScripts === 'function') {
            console.log('[Auth] Loading CRM scripts...');
            try {
                await window.loadCRMScripts();
                console.log('[Auth] ✓ CRM scripts loaded and ready');
            } catch (error) {
                console.error('[Auth] ✗ Failed to load CRM scripts:', error);
                alert('Error loading CRM scripts. Please refresh the page.');
            }
        } else {
            console.error('[Auth] ✗ loadCRMScripts function not found!');
            alert('CRM loader not found. Please refresh the page.');
        }
    }

    updateUserProfile(user) {
        // Update profile picture in header button
        const profilePic = document.getElementById('user-profile-pic');
        const profilePicLarge = document.getElementById('user-profile-pic-large');
        const profileFallback = document.getElementById('profile-avatar-fallback');
        const profileName = document.getElementById('user-profile-name');
        const profileEmail = document.getElementById('user-profile-email');

        // Get hosted photo URL from settings if available, otherwise use Google photoURL
        let avatarUrl = null;
        try {
            const settings = window.SettingsPage?.getSettings?.() || {};
            avatarUrl = settings?.general?.hostedPhotoURL || null;
        } catch (e) {
            console.warn('[Auth] Could not get hosted photo from settings:', e);
        }
        // Fallback to locally cached settings (persists across sessions)
        if (!avatarUrl) {
            try {
                const savedSettings = JSON.parse(localStorage.getItem('crm-settings') || '{}');
                avatarUrl = savedSettings?.general?.hostedPhotoURL || savedSettings?.general?.photoURL || null;
            } catch (_) {}
        }
        
        // Fallback to Google photoURL if no hosted version
        if (!avatarUrl && user.photoURL) {
            avatarUrl = user.photoURL;
        }

        if (avatarUrl) {
            // Show profile picture (prefer hosted version), hide fallback
            if (profilePic) {
                profilePic.src = avatarUrl;
                profilePic.alt = user.displayName || user.email;
                profilePic.style.display = 'block';
                // Add cache busting if using Google URL directly (helps with updates)
                if (avatarUrl === user.photoURL && avatarUrl.includes('googleusercontent.com')) {
                    profilePic.src = avatarUrl + '?t=' + Date.now();
                }
                // Wrap in editable container if not already wrapped (delay to ensure DOM is ready)
                // Use multiple attempts to ensure image is loaded and visible
                const setupPic = (attempt = 0) => {
                    if (profilePic && profilePic.parentNode && !profilePic.closest('.editable-profile-pic-container')) {
                        // Check if image is loaded or has src
                        if (profilePic.complete || profilePic.src) {
                            this.setupEditableProfilePic(profilePic, avatarUrl, user);
                        } else if (attempt < 5) {
                            // Retry if image not loaded yet (max 5 attempts = 500ms)
                            setTimeout(() => setupPic(attempt + 1), 100);
                        }
                    }
                };
                setTimeout(() => setupPic(), 50);
            }
            if (profilePicLarge) {
                profilePicLarge.src = avatarUrl;
                profilePicLarge.alt = user.displayName || user.email;
                // Add cache busting if using Google URL directly
                if (avatarUrl === user.photoURL && avatarUrl.includes('googleusercontent.com')) {
                    profilePicLarge.src = avatarUrl + '?t=' + Date.now();
                }
                // Wrap in editable container if not already wrapped (delay to ensure DOM is ready)
                // Use multiple attempts to ensure image is loaded and visible
                const setupPicLarge = (attempt = 0) => {
                    if (profilePicLarge && profilePicLarge.parentNode && !profilePicLarge.closest('.editable-profile-pic-container')) {
                        // Check if image is loaded or has src
                        if (profilePicLarge.complete || profilePicLarge.src) {
                            this.setupEditableProfilePic(profilePicLarge, avatarUrl, user);
                        } else if (attempt < 5) {
                            // Retry if image not loaded yet (max 5 attempts = 500ms)
                            setTimeout(() => setupPicLarge(attempt + 1), 100);
                        }
                    }
                };
                setTimeout(() => setupPicLarge(), 50);
            }
            if (profileFallback) {
                profileFallback.style.display = 'none';
            }
        } else {
            // No photo URL, keep fallback avatar
            if (profilePic) {
                profilePic.style.display = 'none';
            }
            if (profileFallback) {
                profileFallback.style.display = 'flex';
                // Update initials from name
                const initials = (user.displayName || user.email)
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .toUpperCase()
                    .substring(0, 2);
                profileFallback.textContent = initials;
            }
        }

        if (profileName) {
            profileName.textContent = user.displayName || user.email.split('@')[0];
        }

        if (profileEmail) {
            profileEmail.textContent = user.email;
        }
    }

    // Setup editable profile picture with hover effect
    setupEditableProfilePic(imgElement, currentAvatarUrl, user) {
        // Skip if already wrapped
        if (imgElement.closest('.editable-profile-pic-container')) {
            return;
        }

        // Check if image is visible (has src and is displayed)
        if (!imgElement.src || imgElement.style.display === 'none') {
            return;
        }

        // Get the size from the image (for proper overlay sizing)
        const imgWidth = imgElement.offsetWidth || parseInt(window.getComputedStyle(imgElement).width) || 40;
        const imgHeight = imgElement.offsetHeight || parseInt(window.getComputedStyle(imgElement).height) || 40;
        const size = Math.max(imgWidth, imgHeight);

        // Create wrapper container
        const container = document.createElement('div');
        container.className = 'editable-profile-pic-container';
        container.style.cssText = `position: relative; display: inline-block; cursor: pointer; width: ${size}px; height: ${size}px; flex-shrink: 0;`;

        // Wrap the image
        imgElement.parentNode.insertBefore(container, imgElement);
        container.appendChild(imgElement);

        // Ensure image maintains its size
        imgElement.style.width = '100%';
        imgElement.style.height = '100%';
        imgElement.style.objectFit = 'cover';

        // Create overlay for hover effect
        const overlay = document.createElement('div');
        overlay.className = 'profile-pic-overlay';
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s ease, opacity 0.2s ease;
            opacity: 0;
            pointer-events: none;
            z-index: 10;
        `;

        // Create pencil icon
        const pencilIcon = document.createElement('div');
        pencilIcon.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
        `;
        pencilIcon.style.cssText = 'opacity: 0; transition: opacity 0.2s ease;';
        overlay.appendChild(pencilIcon);
        container.appendChild(overlay);

        // Add hover effect
        container.addEventListener('mouseenter', () => {
            overlay.style.background = 'rgba(0, 0, 0, 0.5)';
            overlay.style.opacity = '1';
            overlay.style.pointerEvents = 'auto'; // Allow clicks on hover
            pencilIcon.style.opacity = '1';
        });

        container.addEventListener('mouseleave', () => {
            overlay.style.background = 'rgba(0, 0, 0, 0)';
            overlay.style.opacity = '0';
            overlay.style.pointerEvents = 'none'; // Block clicks when not hovering
            pencilIcon.style.opacity = '0';
        });

        // Add click handler to upload new image (on container, overlay passes through)
        container.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.uploadProfilePicture(currentAvatarUrl, user);
        });
    }

    // Upload profile picture (shared function)
    async uploadProfilePicture(currentAvatarUrl, user) {
        // Create file input
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Validate file type
            if (!file.type.startsWith('image/')) {
                if (window.showToast) {
                    window.showToast('Please select a valid image file.', 'error');
                }
                return;
            }

            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                if (window.showToast) {
                    window.showToast('Image file must be smaller than 5MB.', 'error');
                }
                return;
            }

            try {
                if (window.showToast) {
                    window.showToast('Uploading profile picture...', 'info');
                }

                // Convert to base64
                const base64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const result = reader.result;
                        const base64Data = result.split(',')[1];
                        resolve(base64Data);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });

                // Upload to server
                const apiBase = 'https://power-choosers-crm-792458658491.us-south1.run.app';
                const uploadResponse = await fetch(`${apiBase}/api/upload/signature-image`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: base64, type: 'profile' })
                });

                if (!uploadResponse.ok) {
                    throw new Error(`Upload failed: ${uploadResponse.status}`);
                }

                const result = await uploadResponse.json();
                const imageUrl = result.imageUrl || (result.success && result.data?.link);

                if (!imageUrl) {
                    throw new Error('Server did not return image URL');
                }

                // Update settings with new hosted photo URL
                if (window.SettingsPage && window.SettingsPage.instance) {
                    const settingsPage = window.SettingsPage.instance;
                    if (!settingsPage.state.settings.general) {
                        settingsPage.state.settings.general = {};
                    }
                    // CRITICAL: Save the uploaded photo URL (this takes priority over Google photoURL)
                    settingsPage.state.settings.general.hostedPhotoURL = imageUrl;
                    // Also update photoURL to prevent Google from overwriting it
                    if (user && user.photoURL) {
                        settingsPage.state.settings.general.photoURL = user.photoURL;
                    }
                    settingsPage.markDirty();
                    // Save immediately to Firestore
                    await settingsPage.saveSettings();
                    
                    // Refresh avatar preview (only the avatar section)
                    const avatarPreview = document.getElementById('user-avatar-preview');
                    if (avatarPreview && window.SettingsPage && window.SettingsPage.instance) {
                        window.SettingsPage.instance.renderSettings();
                    }
                } else {
                    // Fallback: try to update settings directly
                    try {
                        const settings = window.SettingsPage?.getSettings?.() || {};
                        if (!settings.general) settings.general = {};
                        settings.general.hostedPhotoURL = imageUrl;
                        // Also update photoURL to prevent Google from overwriting it
                        if (user && user.photoURL) {
                            settings.general.photoURL = user.photoURL;
                        }
                        localStorage.setItem('crm-settings', JSON.stringify(settings));
                        
                        // Try to save to Firebase
                        if (window.firebaseDB) {
                            const userEmail = (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function')
                                ? window.DataManager.getCurrentUserEmail()
                                : ((window.currentUserEmail || '').toLowerCase());
                            const isAdmin = (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function')
                                ? window.DataManager.isCurrentUserAdmin()
                                : (window.currentUserRole === 'admin');
                            const docId = isAdmin ? 'user-settings' : `user-settings-${userEmail}`;
                            await window.firebaseDB.collection('settings').doc(docId).set({
                                ...settings,
                                ownerId: userEmail || '',
                                lastUpdated: new Date().toISOString()
                            }, { merge: true });
                        }
                    } catch (err) {
                        console.error('[Auth] Error saving profile picture to settings:', err);
                    }
                }

                // Refresh profile photo display
                this.refreshProfilePhoto();

                if (window.showToast) {
                    window.showToast('Profile picture updated successfully! Click "Save Changes" in Settings to persist.', 'success');
                }

            } catch (error) {
                console.error('[Auth] Error uploading profile picture:', error);
                if (window.showToast) {
                    window.showToast('Failed to upload profile picture. Please try again.', 'error');
                }
            }
        });

        // Trigger file selection
        document.body.appendChild(fileInput);
        fileInput.click();
        document.body.removeChild(fileInput);
    }

    // Refresh profile photo (called when settings updates hostedPhotoURL)
    refreshProfilePhoto() {
        if (this.user) {
            console.log('[Auth] Refreshing profile photo from settings...');
            this.updateUserProfile(this.user);
            // Re-setup editable containers after refresh
            setTimeout(() => {
                const profilePic = document.getElementById('user-profile-pic');
                const profilePicLarge = document.getElementById('user-profile-pic-large');
                if (profilePic && profilePic.src) {
                    this.setupEditableProfilePic(profilePic, profilePic.src, this.user);
                }
                if (profilePicLarge && profilePicLarge.src) {
                    this.setupEditableProfilePic(profilePicLarge, profilePicLarge.src, this.user);
                }
            }, 100);
        } else {
            console.warn('[Auth] Cannot refresh profile photo - no user logged in');
        }
    }

    showError(message) {
        const errorEl = document.getElementById('login-error');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
            setTimeout(() => {
                errorEl.style.display = 'none';
            }, 5000);
        }
    }

    showSuccess(message) {
        // Use existing toast system if available
        if (window.crm && typeof window.crm.showToast === 'function') {
            window.crm.showToast(message, 'success');
        }
    }

    getCurrentUser() {
        return this.user;
    }

    isAuthenticated() {
        return this.user !== null;
    }

    updateAdminOnlyElements() {
        const isAdmin = window.currentUserRole === 'admin';
        const adminOnlyElements = document.querySelectorAll('.admin-only');
        
        adminOnlyElements.forEach(element => {
            element.style.display = isAdmin ? 'flex' : 'none';
        });
        
        console.log(`[Auth] Updated admin-only elements visibility: ${isAdmin ? 'visible' : 'hidden'}`);
    }
}

// Global utility functions for checking user role and email
function isAdmin() {
    return window.currentUserRole === 'admin';
}

function getUserEmail() {
    return window.currentUserEmail || '';
}

// Initialize auth manager
window.authManager = new AuthManager();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.authManager.init();
        setupEventListeners();
    });
} else {
    window.authManager.init();
    setupEventListeners();
}

// Set up event listeners
function setupEventListeners() {
    // Login button
    const loginBtn = document.getElementById('google-signin-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            window.authManager.signInWithGoogle();
        });
    }

    // Profile button - toggle dropdown
    const profileBtn = document.getElementById('profile-btn');
    const profileDropdown = document.getElementById('profile-dropdown');
    if (profileBtn && profileDropdown) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = profileDropdown.hasAttribute('hidden');
            if (isHidden) {
                // When opening dropdown, ensure profile picture is wrapped
                setTimeout(() => {
                    const profilePicLarge = document.getElementById('user-profile-pic-large');
                    if (profilePicLarge && profilePicLarge.src && !profilePicLarge.closest('.editable-profile-pic-container')) {
                        const user = this.user || firebase.auth().currentUser;
                        if (user) {
                            const avatarUrl = profilePicLarge.src;
                            this.setupEditableProfilePic(profilePicLarge, avatarUrl, user);
                        }
                    }
                }, 100);
                profileDropdown.removeAttribute('hidden');
            } else {
                profileDropdown.setAttribute('hidden', '');
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!profileBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
                profileDropdown.setAttribute('hidden', '');
            }
        });
    }

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            window.authManager.signOut();
        });
    }
}

