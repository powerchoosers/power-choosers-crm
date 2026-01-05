// Firebase Authentication Module
// Handles Google Sign-In and profile management

class AuthManager {
    constructor() {
        this.user = null;
        this.auth = null;
        this.initialized = false;
        this.tokenRefreshTimer = null;
        
        // Keep header avatar synced whenever settings change anywhere
        document.addEventListener('pc:settings-updated', () => {
            this.refreshProfilePhoto();
        });
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
            try {
                await this.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
            } catch (persistErr) {
                console.warn('[Auth] Could not set LOCAL persistence, using default', persistErr);
            }
            this.initialized = true;
            
            // Check for redirect result (when returning from Google sign-in)
            // Only check once per page load to avoid loops
            if (!window._redirectResultChecked) {
                window._redirectResultChecked = true;
                try {
                    const result = await this.auth.getRedirectResult();
                    if (result.user) {
                        // Store Google access token for Gmail API access (client-side sync)
                        // Note: With redirect, the credential.accessToken might not be available
                        // We'll try to get it, but if not available, Gmail sync will use popup re-auth
                        if (result.credential && result.credential.accessToken) {
                            window._googleAccessToken = result.credential.accessToken;
                            // Persist to localStorage so it survives page refreshes
                            try {
                                localStorage.setItem('pc:googleAccessToken', result.credential.accessToken);
                            } catch (storageErr) {
                                console.warn('[Auth] Could not persist token to localStorage:', storageErr);
                            }
                        }
                    } else {
                        // Check if there's an error in the result
                        if (result.error) {
                            console.error('[Auth] Redirect result error:', result.error);
                        }
                    }
                } catch (redirectErr) {
                    // No redirect result or error - this is normal if user hasn't signed in yet
                    if (redirectErr.code !== 'auth/operation-not-allowed') {
                    }
                }
            }
            
            // Load persisted Google access token from localStorage if available
            try {
                const persistedToken = localStorage.getItem('pc:googleAccessToken');
                if (persistedToken && !window._googleAccessToken) {
                    window._googleAccessToken = persistedToken;
                }
            } catch (storageErr) {
                console.warn('[Auth] Could not load token from localStorage:', storageErr);
            }

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
      this.user = user;

      if (user) {
        this.startTokenRefreshLoop();
        const emailLower = user.email ? user.email.toLowerCase() : '';
        try {
          const prev = localStorage.getItem('pc:lastUserEmail') || '';
          if (prev && prev !== emailLower) {
            if (window.CacheManager && typeof window.CacheManager.invalidateAll === 'function') {
              await window.CacheManager.invalidateAll();
            }
          }
          localStorage.setItem('pc:lastUserEmail', emailLower);
        } catch(_) {}
            
            // Check domain restriction (case-insensitive)
            const domainCheck = emailLower.endsWith('@powerchoosers.com');
            if (!domainCheck) {
                console.warn('[Auth] ✗ Unauthorized domain:', user.email);
                this.showError('Access restricted to Power Choosers employees (@powerchoosers.com)');
                await this.signOut();
                return;
            }
            
            // Ensure user profile exists and get role
            try {
                await this.ensureUserProfile(user);
            } catch (error) {
                console.error('[Auth] ✗ Error with user profile:', error);
            }
            
            await this.showCRM();
            
            this.updateUserProfile(user);
            
            // Update admin-only elements visibility
            this.updateAdminOnlyElements();
            
        } else {
        try {
          if (window.CacheManager && typeof window.CacheManager.invalidateAll === 'function') {
            await window.CacheManager.invalidateAll();
          }
        } catch(_) {}
        this.stopTokenRefreshLoop();
        this.showLogin();
      }
    }

    startTokenRefreshLoop() {
        if (this.tokenRefreshTimer) {
            clearInterval(this.tokenRefreshTimer);
        }
        // Refresh shortly before the default 1h Firebase token expiry to avoid surprise sign-outs
        const REFRESH_INTERVAL = 45 * 60 * 1000;
        this.tokenRefreshTimer = setInterval(async () => {
            try {
                if (this.user) {
                    await this.user.getIdToken(true);
                }
            } catch (err) {
                console.warn('[Auth] Token refresh failed (will retry):', err);
            }
        }, REFRESH_INTERVAL);
    }

    stopTokenRefreshLoop() {
        if (this.tokenRefreshTimer) {
            clearInterval(this.tokenRefreshTimer);
            this.tokenRefreshTimer = null;
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

            // Use popup authentication - more reliable than redirect
            // Popup works better for both localhost and production without requiring redirect URL configuration
            const result = await this.auth.signInWithPopup(provider);
            
            // Store Google access token for Gmail API access (client-side sync)
            if (result.credential && result.credential.accessToken) {
                window._googleAccessToken = result.credential.accessToken;
                // Persist to localStorage so it survives page refreshes
                try {
                    localStorage.setItem('pc:googleAccessToken', result.credential.accessToken);
                } catch (storageErr) {
                    console.warn('[Auth] Could not persist token to localStorage:', storageErr);
                }
            }
            
            // Show success message
            this.showSuccess('Welcome back!');
            
            // Note: onAuthStateChanged will be triggered automatically, which will call handleAuthStateChange
            // and show the CRM, so we don't need to do anything else here

        } catch (error) {
            console.error('[Auth] Sign-in error:', error);
            console.error('[Auth] Error code:', error.code);
            console.error('[Auth] Error message:', error.message);
            
            if (error.code === 'auth/popup-closed-by-user') {
                this.showError('Sign-in cancelled. Please try again.');
            } else if (error.code === 'auth/popup-blocked') {
                // If popup is blocked, try redirect as fallback
                try {
                    await this.auth.signInWithRedirect(provider);
                    // Page will redirect, so code after this won't execute
                } catch (redirectErr) {
                    console.error('[Auth] Redirect fallback also failed:', redirectErr);
                    this.showError('Popup blocked and redirect failed. Please allow popups for this site or check your browser settings.');
                }
            } else {
                this.showError('Failed to sign in. Please try again.');
            }
        }
    }

    async signOut() {
      try {
        this.stopTokenRefreshLoop();
        await this.auth.signOut();
        
        // Clear Google access token from storage
        try {
          localStorage.removeItem('pc:googleAccessToken');
          window._googleAccessToken = null;
        } catch (storageErr) {
          console.warn('[Auth] Could not clear token from storage:', storageErr);
        }
        
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
        const topBar = document.querySelector('.top-bar');
        
        if (loginOverlay) loginOverlay.style.display = 'flex';
        if (crmContent) crmContent.style.display = 'none';
        
        // Hide top bar on login screen
        if (topBar) {
            topBar.classList.remove('visible');
        }
    }

    async showCRM() {
        const loginOverlay = document.getElementById('login-overlay');
        const crmContent = document.getElementById('crm-content');
        const topBar = document.querySelector('.top-bar');
        
        // Hide login overlay immediately
        if (loginOverlay) {
            loginOverlay.style.display = 'none';
        }
        
        // Show CRM content
        if (crmContent) {
            crmContent.style.display = 'block';
        }

        // Fade in top bar with the rest of the CRM
        if (topBar) {
            topBar.classList.add('visible');
        }
        
        // Load CRM scripts lazily (only once)
        if (typeof window.loadCRMScripts === 'function') {
            try {
                await window.loadCRMScripts();
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
        // Fallback to dedicated hosted photo cache key
        if (!avatarUrl) {
            try { avatarUrl = localStorage.getItem('pc-hosted-photo') || null; } catch(_) {}
        }
        
        // Fallback to Google photoURL if no hosted version
        if (!avatarUrl && user.photoURL) {
            avatarUrl = user.photoURL;
        }

        if (avatarUrl) {
            // Show profile picture (prefer hosted version), hide fallback
            // NOTE: Do NOT make the header profile pic editable - it blocks the dropdown button click
            if (profilePic) {
                // Remove any existing editable container wrapper (in case it was added before)
                const existingContainer = profilePic.closest('.editable-profile-pic-container');
                if (existingContainer) {
                    const parent = existingContainer.parentNode;
                    parent.insertBefore(profilePic, existingContainer);
                    parent.removeChild(existingContainer);
                }
                
                profilePic.src = avatarUrl;
                profilePic.alt = user.displayName || user.email;
                profilePic.style.display = 'block';
                // Add cache busting if using Google URL directly (helps with updates)
                if (avatarUrl === user.photoURL && avatarUrl.includes('googleusercontent.com')) {
                    profilePic.src = avatarUrl + '?t=' + Date.now();
                }
                // Do NOT wrap header pic in editable container - it prevents dropdown from opening
            }
            // Only make the dropdown profile pic editable (large one)
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
        // Safety check: Never make the header profile pic editable (it blocks dropdown)
        if (imgElement.id === 'user-profile-pic') {
            console.warn('[Auth] Skipping editable setup for header profile pic to preserve dropdown functionality');
            return;
        }
        
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
            this.updateUserProfile(this.user);
            // Re-setup editable container for dropdown pic only (not header pic)
            setTimeout(() => {
                const profilePicLarge = document.getElementById('user-profile-pic-large');
                if (profilePicLarge && profilePicLarge.src) {
                    this.setupEditableProfilePic(profilePicLarge, profilePicLarge.src, this.user);
                }
                // Do NOT make header pic editable - it blocks dropdown
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
        const isAdmin = (window.currentUserRole === 'admin');
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = isAdmin ? 'flex' : 'none';
        });
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

