/**
 * Client-Side Gmail Inbox Sync
 * 
 * Syncs Gmail inbox to Firestore using the user's existing Google OAuth token.
 * Runs in the browser - NO SERVER COSTS!
 * 
 * Features:
 * - Uses Firebase Auth Google token (already authenticated)
 * - Saves to Firestore with existing email field structure
 * - Deduplicates by gmailMessageId
 * - Runs when user opens the emails page
 * - Respects ownership (ownerId = user's email)
 */

(function() {
  'use strict';

  // Track sync state
  let _isSyncing = false;
  let _lastSyncTime = null;
  const SYNC_COOLDOWN_MS = 60 * 1000; // 1 minute between syncs
  const MAX_MESSAGES_PER_SYNC = 50;

  /**
   * Get Gmail API access token from Firebase Auth
   * The user already signed in with Google, so we can get their token
   */
  async function getGmailAccessToken() {
    const user = firebase.auth().currentUser;
    if (!user) {
      console.warn('[GmailSync] No user logged in');
      return null;
    }

    // Check if user signed in with Google
    const googleProvider = user.providerData.find(p => p.providerId === 'google.com');
    if (!googleProvider) {
      console.warn('[GmailSync] User did not sign in with Google');
      return null;
    }

    try {
      // Priority 1: Use stored access token from sign-in (auth.js stores this)
      if (window._googleAccessToken) {
        console.log('[GmailSync] Using stored Google access token');
        return window._googleAccessToken;
      }
      
      // Priority 2: Try to get from user object
      const accessToken = user.accessToken || user.stsTokenManager?.accessToken;
      if (accessToken) {
        return accessToken;
      }

      // Priority 3: Re-authenticate with Gmail scope
      console.log('[GmailSync] Need to re-authenticate for Gmail access');
      return await reauthenticateWithGmailScope();
    } catch (error) {
      console.error('[GmailSync] Failed to get access token:', error);
      return null;
    }
  }

  /**
   * Re-authenticate with Gmail scope if needed
   */
  async function reauthenticateWithGmailScope() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
      
      // Use popup to avoid losing app state
      const result = await firebase.auth().currentUser.reauthenticateWithPopup(provider);
      
      // Get the access token from the credential
      const credential = result.credential;
      if (credential && credential.accessToken) {
        // Store for future use
        window._googleAccessToken = credential.accessToken;
        console.log('[GmailSync] Got Gmail access token via reauthentication');
        return credential.accessToken;
      }
      
      return null;
    } catch (error) {
      console.error('[GmailSync] Reauthentication failed:', error);
      return null;
    }
  }

  /**
   * Fetch messages from Gmail API
   */
  async function fetchGmailMessages(accessToken, query = 'in:inbox', maxResults = MAX_MESSAGES_PER_SYNC) {
    try {
      const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
      url.searchParams.set('q', query);
      url.searchParams.set('maxResults', maxResults.toString());

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.warn('[GmailSync] Token expired, need to re-authenticate');
          return { messages: [], needsReauth: true };
        }
        throw new Error(`Gmail API error: ${response.status}`);
      }

      const data = await response.json();
      return { messages: data.messages || [], needsReauth: false };
    } catch (error) {
      console.error('[GmailSync] Failed to fetch messages:', error);
      return { messages: [], error };
    }
  }

  /**
   * Fetch full message details from Gmail API
   */
  async function fetchGmailMessage(accessToken, messageId) {
    try {
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Gmail API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[GmailSync] Failed to fetch message:', messageId, error);
      return null;
    }
  }

  /**
   * Parse Gmail message into our email format
   */
  function parseGmailMessage(message, userEmail) {
    const headers = message.payload?.headers || [];
    const getHeader = (name) => {
      const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
      return header ? header.value : '';
    };

    // Extract body parts
    let htmlBody = '';
    let textBody = '';

    const extractBody = (part) => {
      if (!part) return;

      if (part.mimeType === 'text/html' && part.body?.data) {
        htmlBody = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      } else if (part.mimeType === 'text/plain' && part.body?.data) {
        textBody = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      }

      // Recursively process multipart messages
      if (part.parts) {
        part.parts.forEach(extractBody);
      }
    };

    extractBody(message.payload);

    // If no parts, try direct body
    if (!htmlBody && !textBody && message.payload?.body?.data) {
      const bodyContent = atob(message.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      if (message.payload.mimeType === 'text/html') {
        htmlBody = bodyContent;
      } else {
        textBody = bodyContent;
      }
    }

    // Parse references header
    const referencesHeader = getHeader('References');
    const references = referencesHeader ? referencesHeader.split(/\s+/).filter(r => r) : [];

    // Compute threadId
    let threadId = '';
    const inReplyTo = getHeader('In-Reply-To');
    const msgId = getHeader('Message-ID') || message.id;
    
    if (references.length > 0) {
      threadId = references[0];
    } else if (inReplyTo) {
      threadId = inReplyTo;
    } else if (msgId) {
      threadId = msgId;
    } else {
      threadId = `gmail_thread_${message.threadId}`;
    }

    // Sanitize HTML (basic XSS protection)
    const sanitizeHtml = (html) => {
      if (!html) return '';
      // Remove script tags
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/on\w+="[^"]*"/gi, '')
        .replace(/on\w+='[^']*'/gi, '');
    };

    return {
      // Gmail-specific fields
      gmailMessageId: message.id,
      gmailThreadId: message.threadId,
      
      // Standard email fields
      messageId: getHeader('Message-ID') || message.id,
      from: getHeader('From'),
      to: getHeader('To'),
      cc: getHeader('Cc') || '',
      subject: getHeader('Subject') || '(No Subject)',
      html: sanitizeHtml(htmlBody),
      text: textBody,
      snippet: message.snippet || '',
      inReplyTo: inReplyTo,
      references: references,
      
      // Threading
      threadId: threadId,
      
      // Metadata - REUSE EXISTING FIELDS
      type: 'received',
      emailType: 'received',
      status: 'received',
      provider: 'gmail_api', // Matches existing provider pattern
      
      // CRITICAL: Set ownership fields for Firestore rules compliance
      // Fallback to admin if userEmail is empty
      ownerId: (userEmail && userEmail.trim()) ? userEmail.toLowerCase().trim() : 'l.patterson@powerchoosers.com',
      assignedTo: (userEmail && userEmail.trim()) ? userEmail.toLowerCase().trim() : 'l.patterson@powerchoosers.com',
      createdBy: (userEmail && userEmail.trim()) ? userEmail.toLowerCase().trim() : 'l.patterson@powerchoosers.com',
      
      // Timestamps
      date: getHeader('Date') ? new Date(getHeader('Date')).toISOString() : new Date(parseInt(message.internalDate)).toISOString(),
      receivedAt: new Date(parseInt(message.internalDate)).toISOString(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      
      // Labels
      labelIds: message.labelIds || []
    };
  }

  /**
   * Check if email already exists in Firestore (by gmailMessageId)
   */
  async function emailExists(gmailMessageId) {
    try {
      const db = firebase.firestore();
      const snap = await db.collection('emails')
        .where('gmailMessageId', '==', gmailMessageId)
        .limit(1)
        .get();
      return !snap.empty;
    } catch (error) {
      console.error('[GmailSync] Error checking email existence:', error);
      return false;
    }
  }

  /**
   * Save email to Firestore
   */
  async function saveEmailToFirestore(emailData) {
    try {
      const db = firebase.firestore();
      const docRef = await db.collection('emails').add(emailData);
      console.log('[GmailSync] Saved email:', docRef.id, '-', emailData.subject);
      return docRef.id;
    } catch (error) {
      console.error('[GmailSync] Failed to save email:', error);
      return null;
    }
  }

  /**
   * Main sync function - syncs Gmail inbox to Firestore
   */
  async function syncGmailInbox(options = {}) {
    const { force = false, maxMessages = MAX_MESSAGES_PER_SYNC } = options;

    // Check cooldown
    if (!force && _lastSyncTime && (Date.now() - _lastSyncTime) < SYNC_COOLDOWN_MS) {
      console.log('[GmailSync] Sync cooldown active, skipping');
      return { synced: 0, skipped: 0, status: 'cooldown' };
    }

    // Check if already syncing
    if (_isSyncing) {
      console.log('[GmailSync] Already syncing, skipping');
      return { synced: 0, skipped: 0, status: 'already_syncing' };
    }

    _isSyncing = true;
    const userEmail = (window.currentUserEmail || '').toLowerCase();

    if (!userEmail) {
      console.warn('[GmailSync] No user email available');
      _isSyncing = false;
      return { synced: 0, skipped: 0, status: 'no_user' };
    }

    console.log('[GmailSync] Starting sync for:', userEmail);

    try {
      // Get access token
      let accessToken = await getGmailAccessToken();
      
      if (!accessToken) {
        console.warn('[GmailSync] No access token available');
        _isSyncing = false;
        return { synced: 0, skipped: 0, status: 'no_token' };
      }

      // Fetch recent messages from inbox
      const { messages, needsReauth, error } = await fetchGmailMessages(accessToken, 'in:inbox', maxMessages);

      if (needsReauth) {
        console.log('[GmailSync] Token needs refresh, re-authenticating...');
        accessToken = await reauthenticateWithGmailScope();
        if (!accessToken) {
          _isSyncing = false;
          return { synced: 0, skipped: 0, status: 'reauth_failed' };
        }
        // Retry fetch
        const retryResult = await fetchGmailMessages(accessToken, 'in:inbox', maxMessages);
        if (retryResult.error) {
          _isSyncing = false;
          return { synced: 0, skipped: 0, status: 'fetch_failed' };
        }
        messages.push(...retryResult.messages);
      }

      if (error) {
        _isSyncing = false;
        return { synced: 0, skipped: 0, status: 'fetch_failed', error };
      }

      console.log('[GmailSync] Found', messages.length, 'messages to check');

      let synced = 0;
      let skipped = 0;

      // Process each message
      for (const msg of messages) {
        try {
          // Check if already exists
          const exists = await emailExists(msg.id);
          if (exists) {
            skipped++;
            continue;
          }

          // Fetch full message
          const fullMessage = await fetchGmailMessage(accessToken, msg.id);
          if (!fullMessage) {
            console.warn('[GmailSync] Could not fetch message:', msg.id);
            continue;
          }

          // Skip sent emails (they'll have SENT label)
          if (fullMessage.labelIds?.includes('SENT')) {
            skipped++;
            continue;
          }

          // Parse and save
          const emailData = parseGmailMessage(fullMessage, userEmail);
          const savedId = await saveEmailToFirestore(emailData);
          
          if (savedId) {
            synced++;
          }

          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (msgError) {
          console.error('[GmailSync] Error processing message:', msg.id, msgError);
        }
      }

      _lastSyncTime = Date.now();
      console.log('[GmailSync] Sync complete:', synced, 'synced,', skipped, 'skipped');

      // Notify BackgroundEmailsLoader to refresh
      if (synced > 0) {
        document.dispatchEvent(new CustomEvent('pc:emails-updated', { 
          detail: { source: 'gmail_sync', synced } 
        }));
        
        // Show toast notification
        if (window.crm?.showToast) {
          window.crm.showToast(`Synced ${synced} new email${synced !== 1 ? 's' : ''} from Gmail`);
        }
      }

      return { synced, skipped, status: 'success' };

    } catch (error) {
      console.error('[GmailSync] Sync failed:', error);
      return { synced: 0, skipped: 0, status: 'error', error };
    } finally {
      _isSyncing = false;
    }
  }

  /**
   * Check if Gmail sync is available for current user
   */
  function isGmailSyncAvailable() {
    const user = firebase.auth().currentUser;
    if (!user) return false;
    
    // Check if signed in with Google
    const googleProvider = user.providerData.find(p => p.providerId === 'google.com');
    return !!googleProvider;
  }

  /**
   * Get sync status
   */
  function getSyncStatus() {
    return {
      isSyncing: _isSyncing,
      lastSyncTime: _lastSyncTime,
      cooldownRemaining: _lastSyncTime ? Math.max(0, SYNC_COOLDOWN_MS - (Date.now() - _lastSyncTime)) : 0
    };
  }

  // Auto-sync when emails page is opened (with cooldown)
  document.addEventListener('pc:page-changed', async (e) => {
    if (e.detail?.page === 'emails' && isGmailSyncAvailable()) {
      console.log('[GmailSync] Emails page opened, starting sync...');
      await syncGmailInbox();
    }
  });

  // Also listen for emails page showing
  if (!document._gmailSyncBound) {
    const emailsPage = document.getElementById('emails-page');
    if (emailsPage) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.attributeName === 'style' || mutation.attributeName === 'class') {
            const isVisible = emailsPage.style.display !== 'none' && !emailsPage.classList.contains('hidden');
            if (isVisible && isGmailSyncAvailable()) {
              syncGmailInbox();
            }
          }
        });
      });
      observer.observe(emailsPage, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    document._gmailSyncBound = true;
  }

  // Export public API
  window.GmailInboxSync = {
    sync: syncGmailInbox,
    isAvailable: isGmailSyncAvailable,
    getStatus: getSyncStatus
  };

  console.log('[GmailSync] Client-side Gmail sync module initialized');
})();

