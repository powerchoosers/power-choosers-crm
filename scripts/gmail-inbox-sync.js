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
  let _isReauthenticating = false; // Prevent multiple simultaneous re-auth attempts
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
      // Priority 1: Use stored access token from memory (auth.js stores this)
      if (window._googleAccessToken) {
        console.log('[GmailSync] Using stored Google access token from memory');
        return window._googleAccessToken;
      }
      
      // Priority 2: Try to get from localStorage (persists across page refreshes)
      try {
        const persistedToken = localStorage.getItem('pc:googleAccessToken');
        if (persistedToken) {
          window._googleAccessToken = persistedToken; // Also restore to memory
          console.log('[GmailSync] Using persisted Google access token from localStorage');
          return persistedToken;
        }
      } catch (storageErr) {
        console.warn('[GmailSync] Could not read token from localStorage:', storageErr);
      }
      
      // Priority 3: Try to get from user object (usually not available)
      const accessToken = user.accessToken || user.stsTokenManager?.accessToken;
      if (accessToken) {
        return accessToken;
      }

      // Priority 4: Re-authenticate with Gmail scope (only if token is missing or expired)
      console.log('[GmailSync] Need to re-authenticate for Gmail access');
      return await reauthenticateWithGmailScope();
    } catch (error) {
      console.error('[GmailSync] Failed to get access token:', error);
      return null;
    }
  }

  /**
   * Re-authenticate with Gmail scope if needed
   * Uses popup to avoid redirect loops (user preference)
   */
  async function reauthenticateWithGmailScope() {
    // Prevent multiple simultaneous re-authentication attempts
    if (_isReauthenticating) {
      console.log('[GmailSync] Re-authentication already in progress, waiting...');
      // Wait for current re-auth to complete (max 30 seconds)
      let attempts = 0;
      while (_isReauthenticating && attempts < 300) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      // Return the token if it was set during the re-auth
      if (window._googleAccessToken) {
        return window._googleAccessToken;
      }
      return null;
    }

    _isReauthenticating = true;
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
      
      // Use popup instead of redirect to avoid redirect loops
      // User prefers popup for Gmail sync re-authentication
      console.log('[GmailSync] Requesting Gmail access via popup...');
      const result = await firebase.auth().currentUser.reauthenticateWithPopup(provider);
      
      const credential = result.credential;
      if (credential && credential.accessToken) {
        // Store in both memory and localStorage
        window._googleAccessToken = credential.accessToken;
        try {
          localStorage.setItem('pc:googleAccessToken', credential.accessToken);
          console.log('[GmailSync] Got Gmail access token via popup reauthentication (persisted)');
        } catch (storageErr) {
          console.warn('[GmailSync] Could not persist token:', storageErr);
        }
        _isReauthenticating = false;
        return credential.accessToken;
      }
      
      _isReauthenticating = false;
      return null;
    } catch (error) {
      _isReauthenticating = false;
      console.error('[GmailSync] Popup reauthentication failed:', error);
      
      // Provide user-friendly error messages
      if (error.code === 'auth/popup-closed-by-user') {
        console.warn('[GmailSync] User closed popup - Gmail sync will not work until authenticated');
      } else if (error.code === 'auth/popup-blocked') {
        console.warn('[GmailSync] Popup blocked - please allow popups for this site to enable Gmail sync');
      }
      
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
          // Clear expired token from storage
          try {
            localStorage.removeItem('pc:googleAccessToken');
            window._googleAccessToken = null;
            console.log('[GmailSync] Cleared expired token from storage');
          } catch (storageErr) {
            console.warn('[GmailSync] Could not clear expired token:', storageErr);
          }
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
   * Decode base64url to UTF-8 string (handles Gmail's URL-safe base64)
   */
  function decodeBase64Url(data) {
    if (!data) return '';
    try {
      // Convert URL-safe base64 to standard base64
      const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
      // Decode base64 to binary string
      const binaryString = atob(base64);
      // Convert binary string to UTF-8
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
      console.warn('[GmailSync] Base64 decode error:', e);
      return '';
    }
  }

  /**
   * Parse Gmail message into our email format
   * Handles complex MIME structures including multipart/related, multipart/mixed, etc.
   */
  function parseGmailMessage(message, userEmail) {
    const headers = message.payload?.headers || [];
    const getHeader = (name) => {
      const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
      return header ? header.value : '';
    };

    // Extract body parts and attachments
    let htmlBody = '';
    let textBody = '';
    const attachments = [];
    const inlineImages = {}; // Map CID -> data URL

    /**
     * Recursively extract content from MIME parts
     * Priority: HTML > Plain text
     * Also extracts attachments and inline images
     */
    const extractParts = (part, depth = 0) => {
      if (!part) return;

      const mimeType = (part.mimeType || '').toLowerCase();
      const partHeaders = part.headers || [];
      const getPartHeader = (name) => {
        const h = partHeaders.find(h => h.name.toLowerCase() === name.toLowerCase());
        return h ? h.value : '';
      };

      // Get Content-ID for inline images
      const contentId = getPartHeader('Content-ID')?.replace(/[<>]/g, '') || '';
      const contentDisposition = getPartHeader('Content-Disposition') || '';
      const isInline = contentDisposition.toLowerCase().includes('inline') || contentId;
      const isAttachment = contentDisposition.toLowerCase().includes('attachment');

      // Handle different MIME types
      if (mimeType === 'text/html' && part.body?.data) {
        // Prefer later HTML parts (they're usually the full version)
        const decoded = decodeBase64Url(part.body.data);
        if (decoded && (!htmlBody || decoded.length > htmlBody.length)) {
          htmlBody = decoded;
        }
      } else if (mimeType === 'text/plain' && part.body?.data) {
        const decoded = decodeBase64Url(part.body.data);
        if (decoded && !textBody) {
          textBody = decoded;
        }
      } else if (mimeType.startsWith('image/') && part.body) {
        // Handle inline images
        if (isInline && contentId && part.body.attachmentId) {
          // Store reference for later - we'd need another API call to get the actual data
          // For now, store metadata
          inlineImages[contentId] = {
            mimeType: mimeType,
            attachmentId: part.body.attachmentId,
            size: part.body.size || 0
          };
        } else if (isAttachment || part.body.attachmentId) {
          // Regular image attachment
          attachments.push({
            filename: part.filename || `image_${attachments.length}.${mimeType.split('/')[1] || 'png'}`,
            mimeType: mimeType,
            size: part.body.size || 0,
            attachmentId: part.body.attachmentId
          });
        }
      } else if (part.body?.attachmentId && part.filename) {
        // Other attachments (PDFs, docs, etc.)
        attachments.push({
          filename: part.filename,
          mimeType: mimeType,
          size: part.body.size || 0,
          attachmentId: part.body.attachmentId
        });
      }

      // Recursively process multipart messages
      if (part.parts && part.parts.length > 0) {
        // Process all subparts
        for (const subpart of part.parts) {
          extractParts(subpart, depth + 1);
        }
      }
    };

    // Start extraction from payload
    extractParts(message.payload);

    // If still no content, try direct body
    if (!htmlBody && !textBody && message.payload?.body?.data) {
      const decoded = decodeBase64Url(message.payload.body.data);
      if (decoded) {
        if ((message.payload.mimeType || '').includes('html')) {
          htmlBody = decoded;
        } else {
          textBody = decoded;
        }
      }
    }

    // If still no HTML but have text, convert text to basic HTML
    if (!htmlBody && textBody) {
      htmlBody = `<div style="white-space: pre-wrap; font-family: sans-serif;">${textBody.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>`;
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

    // Sanitize HTML (basic XSS protection - preserve images and styles)
    const sanitizeHtml = (html) => {
      if (!html) return '';
      // Remove only dangerous elements, preserve images and inline styles
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on(click|load|error|mouseover|mouseout|focus|blur|submit|change|input|keyup|keydown|keypress)=/gi, 'data-disabled-');
    };

    // Parse the actual received date from internalDate (milliseconds since epoch)
    const receivedDate = new Date(parseInt(message.internalDate));
    const headerDate = getHeader('Date');
    let emailDate = receivedDate;
    
    // Try to parse header date if available (more accurate)
    if (headerDate) {
      try {
        const parsed = new Date(headerDate);
        if (!isNaN(parsed.getTime())) {
          emailDate = parsed;
        }
      } catch (e) {
        // Use receivedDate
      }
    }

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
      
      // Attachments metadata (attachment data requires separate API call)
      attachments: attachments.length > 0 ? attachments : null,
      hasAttachments: attachments.length > 0,
      attachmentCount: attachments.length,
      
      // Threading
      threadId: threadId,
      
      // Metadata - REUSE EXISTING FIELDS
      type: 'received',
      emailType: 'received',
      status: 'received',
      provider: 'gmail_api', // Matches existing provider pattern
      unread: message.labelIds?.includes('UNREAD') || false,
      
      // CRITICAL: Set ownership fields for Firestore rules compliance
      // Fallback to admin if userEmail is empty
      ownerId: (userEmail && userEmail.trim()) ? userEmail.toLowerCase().trim() : 'l.patterson@powerchoosers.com',
      assignedTo: (userEmail && userEmail.trim()) ? userEmail.toLowerCase().trim() : 'l.patterson@powerchoosers.com',
      createdBy: (userEmail && userEmail.trim()) ? userEmail.toLowerCase().trim() : 'l.patterson@powerchoosers.com',
      
      // Timestamps - CRITICAL: Use actual email date for sorting
      // 'date' and 'receivedAt' should be the actual email timestamp for proper chronological sorting
      date: emailDate.toISOString(),
      receivedAt: receivedDate.toISOString(),
      timestamp: emailDate.getTime(), // Numeric timestamp for reliable sorting
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      
      // Labels
      labelIds: message.labelIds || []
    };
  }

  /**
   * Check if email already exists in Firestore (by gmailMessageId AND ownerId)
   * CRITICAL: Each agent has their own inbox - check by BOTH gmailMessageId AND owner
   * This ensures each agent gets their own copy of emails, not blocked by other agents' syncs
   */
  async function emailExists(gmailMessageId, userEmail) {
    try {
      const db = firebase.firestore();
      const ownerEmail = (userEmail || '').toLowerCase().trim();
      
      // Query by both gmailMessageId AND ownerId to ensure per-agent deduplication
      const snap = await db.collection('emails')
        .where('gmailMessageId', '==', gmailMessageId)
        .where('ownerId', '==', ownerEmail)
        .limit(1)
        .get();
      return !snap.empty;
    } catch (error) {
      console.error('[GmailSync] Error checking email existence:', error);
      return false;
    }
  }

  /**
   * Fetch attachment data from Gmail API
   * Returns base64 encoded attachment data
   */
  async function fetchGmailAttachment(accessToken, messageId, attachmentId) {
    try {
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Gmail API error: ${response.status}`);
      }

      const data = await response.json();
      return data.data; // base64url encoded
    } catch (error) {
      console.error('[GmailSync] Failed to fetch attachment:', attachmentId, error);
      return null;
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
          // Check if already exists FOR THIS USER (each agent has their own inbox)
          // This ensures Agent A's synced emails don't block Agent B from syncing the same email
          const exists = await emailExists(msg.id, userEmail);
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

          // Parse and save with ownership set to current user
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
        // CRITICAL: Invalidate email cache so background loader refetches fresh data
        // This ensures newly synced emails appear immediately with correct sorting
        if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
          await window.CacheManager.invalidate('emails');
          console.log('[GmailSync] Cache invalidated after sync');
        }
        
        // Invalidate folder count cache in background loader
        if (window.BackgroundEmailsLoader && typeof window.BackgroundEmailsLoader.invalidateFolderCountCache === 'function') {
          window.BackgroundEmailsLoader.invalidateFolderCountCache();
        }
        
        // Trigger reload of background emails loader for immediate UI update
        if (window.BackgroundEmailsLoader && typeof window.BackgroundEmailsLoader.reload === 'function') {
          // Don't await - let it run in background
          window.BackgroundEmailsLoader.reload();
        }
        
        // Dispatch event for any listeners
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

  /**
   * Fetch and decode an attachment for display
   * @param {string} emailId - The Firestore email document ID
   * @param {string} attachmentId - The Gmail attachment ID
   * @returns {Promise<{data: string, mimeType: string}|null>}
   */
  async function getAttachment(emailId, attachmentId) {
    try {
      // Get the email document to find the Gmail message ID
      const db = firebase.firestore();
      const emailDoc = await db.collection('emails').doc(emailId).get();
      
      if (!emailDoc.exists) {
        console.error('[GmailSync] Email not found:', emailId);
        return null;
      }
      
      const email = emailDoc.data();
      const gmailMessageId = email.gmailMessageId;
      
      if (!gmailMessageId) {
        console.error('[GmailSync] No Gmail message ID for email:', emailId);
        return null;
      }
      
      // Get access token
      const accessToken = await getGmailAccessToken();
      if (!accessToken) {
        console.error('[GmailSync] No access token available');
        return null;
      }
      
      // Fetch the attachment
      const attachmentData = await fetchGmailAttachment(accessToken, gmailMessageId, attachmentId);
      if (!attachmentData) {
        return null;
      }
      
      // Find the attachment metadata
      const attachmentMeta = (email.attachments || []).find(a => a.attachmentId === attachmentId);
      const mimeType = attachmentMeta?.mimeType || 'application/octet-stream';
      
      // Convert base64url to standard base64
      const base64 = attachmentData.replace(/-/g, '+').replace(/_/g, '/');
      
      return {
        data: base64,
        mimeType: mimeType,
        filename: attachmentMeta?.filename || 'attachment'
      };
    } catch (error) {
      console.error('[GmailSync] Failed to get attachment:', error);
      return null;
    }
  }

  /**
   * Force re-sync (ignores cooldown)
   */
  async function forceSync(maxMessages = MAX_MESSAGES_PER_SYNC) {
    return syncGmailInbox({ force: true, maxMessages });
  }

  // Export public API
  window.GmailInboxSync = {
    sync: syncGmailInbox,
    forceSync: forceSync,
    isAvailable: isGmailSyncAvailable,
    getStatus: getSyncStatus,
    getAttachment: getAttachment
  };

  console.log('[GmailSync] Client-side Gmail sync module initialized');
})();

