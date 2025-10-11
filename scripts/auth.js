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
            
            // Check domain restriction
            if (!user.email.endsWith('@powerchoosers.com')) {
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
            
            // Run migration if admin and not done (temporarily disabled for debugging)
            // if (window.DataManager) {
            //     await window.DataManager.checkAndRunMigration();
            // }
            
            console.log('[Auth] ✓ Auth flow complete');
        } else {
            console.log('[Auth] No user - showing login');
            this.showLogin();
        }
    }

    async ensureUserProfile(user) {
        const db = firebase.firestore();
        const userRef = db.collection('users').doc(user.email);
        
        try {
            const userDoc = await userRef.get();
            
            if (!userDoc.exists) {
                // First time login - create profile
                const isAdmin = (user.email === 'l.patterson@powerchoosers.com');
                const role = isAdmin ? 'admin' : 'employee';
                
                await userRef.set({
                    email: user.email,
                    name: user.displayName || user.email.split('@')[0],
                    role: role,
                    photoURL: user.photoURL || null,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                console.log(`[Auth] Created ${role} profile for ${user.email}`);
            } else {
                // Update last login
                await userRef.update({
                    lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            
            // Get and store role globally
            const profile = await userRef.get();
            const userData = profile.data();
            window.currentUserRole = userData.role;
            window.currentUserEmail = user.email;
            
            console.log(`[Auth] User role: ${userData.role}`);
        } catch (error) {
            console.error('[Auth] Error ensuring user profile:', error);
            // Fallback to determining role from email
            window.currentUserEmail = user.email;
            window.currentUserRole = (user.email === 'l.patterson@powerchoosers.com') ? 'admin' : 'employee';
        }
    }

    async signInWithGoogle() {
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({
                prompt: 'select_account'
            });

            const result = await this.auth.signInWithPopup(provider);
            console.log('[Auth] Sign-in successful:', result.user.email);
            
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

        if (user.photoURL) {
            // Show Google profile picture, hide fallback
            if (profilePic) {
                profilePic.src = user.photoURL;
                profilePic.alt = user.displayName || user.email;
                profilePic.style.display = 'block';
            }
            if (profilePicLarge) {
                profilePicLarge.src = user.photoURL;
                profilePicLarge.alt = user.displayName || user.email;
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

