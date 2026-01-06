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
      // Use stored token if available
      if (window._googleAccessToken) {
        return window._googleAccessToken;
      }
      
      // Priority 2: Try to get from localStorage (persists across page refreshes)
      try {
        const persistedToken = localStorage.getItem('pc:googleAccessToken');
        if (persistedToken) {
          window._googleAccessToken = persistedToken; // Also restore to memory
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
      // Trigger the standard Google login flow with the extra scope
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
      
      const result = await firebase.auth().signInWithPopup(provider);
      
      console.log('[GmailSync] Re-auth result received:', { 
        hasResult: !!result, 
        hasCredential: !!(result && result.credential),
        hasUser: !!(result && result.user)
      });
      
      if (!result || !result.credential) {
        console.warn('[GmailSync] Re-auth result or credential is null');
        _isReauthenticating = false;
        return null;
      }
      
      const accessToken = result.credential.accessToken;
      
      if (accessToken) {
        window._googleAccessToken = accessToken;
        try {
          localStorage.setItem('pc:googleAccessToken', accessToken);
        } catch (storageErr) {
          // Ignore storage errors
        }
        _isReauthenticating = false;
        return accessToken;
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
  async function fetchGmailMessagesPage(accessToken, query = 'in:inbox', maxResults = MAX_MESSAGES_PER_SYNC, pageToken = null) {
    try {
      const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
      url.searchParams.set('q', query);
      url.searchParams.set('maxResults', maxResults.toString());
      if (pageToken) url.searchParams.set('pageToken', pageToken);

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
          } catch (storageErr) {
            console.warn('[GmailSync] Could not clear expired token:', storageErr);
          }
          return { messages: [], needsReauth: true, nextPageToken: null, resultSizeEstimate: null };
        }
        throw new Error(`Gmail API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        messages: data.messages || [],
        needsReauth: false,
        nextPageToken: data.nextPageToken || null,
        resultSizeEstimate: typeof data.resultSizeEstimate === 'number' ? data.resultSizeEstimate : null
      };
    } catch (error) {
      console.error('[GmailSync] Failed to fetch messages:', error);
      return { messages: [], error, nextPageToken: null, resultSizeEstimate: null };
    }
  }

  async function fetchGmailMessages(accessToken, query = 'in:inbox', maxResults = MAX_MESSAGES_PER_SYNC) {
    return fetchGmailMessagesPage(accessToken, query, maxResults, null);
  }

  async function estimateQuery(accessToken, query = 'in:inbox') {
    const res = await fetchGmailMessagesPage(accessToken, query, 1, null);
    return {
      query,
      resultSizeEstimate: res.resultSizeEstimate,
      needsReauth: !!res.needsReauth
    };
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
      // Use current user email
      ownerId: userEmail.toLowerCase().trim(),
      assignedTo: userEmail.toLowerCase().trim(),
      createdBy: userEmail.toLowerCase().trim(),
      
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
    const { force = false, maxMessages = MAX_MESSAGES_PER_SYNC, maxPages = 1, query = 'in:inbox' } = options;

    // Check cooldown
    if (!force && _lastSyncTime && (Date.now() - _lastSyncTime) < SYNC_COOLDOWN_MS) {
      return { synced: 0, skipped: 0, status: 'cooldown' };
    }

    // Check if already syncing
    if (_isSyncing) {
      return { synced: 0, skipped: 0, status: 'already_syncing' };
    }

    _isSyncing = true;
    const userEmail = (window.currentUserEmail || '').toLowerCase();

    if (!userEmail) {
      console.warn('[GmailSync] No user email available');
      _isSyncing = false;
      return { synced: 0, skipped: 0, status: 'no_user' };
    }

    try {
      // Get access token
      let accessToken = await getGmailAccessToken();
      
      if (!accessToken) {
        console.warn('[GmailSync] No access token available');
        _isSyncing = false;
        return { synced: 0, skipped: 0, status: 'no_token' };
      }

      let collected = [];
      let pageToken = null;
      let pages = 0;
      let lastEstimate = null;
      let needsReauth = false;
      let error = null;

      while (pages < Math.max(1, maxPages) && collected.length < maxMessages) {
        pages++;
        const pageSize = Math.min(500, Math.max(1, maxMessages - collected.length));
        const pageRes = await fetchGmailMessagesPage(accessToken, query, pageSize, pageToken);
        needsReauth = !!pageRes.needsReauth;
        error = pageRes.error || null;
        if (typeof pageRes.resultSizeEstimate === 'number') lastEstimate = pageRes.resultSizeEstimate;
        if (needsReauth || error) break;
        const msgs = pageRes.messages || [];
        collected.push(...msgs);
        pageToken = pageRes.nextPageToken || null;
        if (!pageToken || msgs.length === 0) break;
      }

      const deduped = new Map();
      collected.forEach(m => {
        if (m && m.id && !deduped.has(m.id)) deduped.set(m.id, m);
      });

      const messages = Array.from(deduped.values());

      if (needsReauth) {
        accessToken = await reauthenticateWithGmailScope();
        if (!accessToken) {
          _isSyncing = false;
          return { synced: 0, skipped: 0, status: 'reauth_failed' };
        }
        // Retry a single page after reauth
        const retryResult = await fetchGmailMessagesPage(accessToken, query, Math.min(500, maxMessages), null);
        if (retryResult.error) {
          _isSyncing = false;
          return { synced: 0, skipped: 0, status: 'fetch_failed' };
        }
        messages.push(...(retryResult.messages || []));
      }

      if (error) {
        _isSyncing = false;
        return { synced: 0, skipped: 0, status: 'fetch_failed', error };
      }

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

          await new Promise(resolve => setTimeout(resolve, 25));
        } catch (msgError) {
          console.error('[GmailSync] Error processing message:', msg.id, msgError);
        }
      }

      _lastSyncTime = Date.now();

      // Notify BackgroundEmailsLoader to refresh
      if (synced > 0) {
        // CRITICAL: Invalidate email cache so background loader refetches fresh data
        // This ensures newly synced emails appear immediately with correct sorting
        if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
          await window.CacheManager.invalidate('emails');
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

      return { synced, skipped, status: 'success', query, resultSizeEstimate: lastEstimate };

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

  // Auto-sync: Trigger sync when user opens the emails page
  function initAutoSync() {
    console.log('[GmailSync] Initializing auto-sync check...');
    
    // Check if we're on a page that should trigger sync
    const path = window.location.pathname.toLowerCase();
    const isEmailsPage = path.includes('crm-dashboard') || 
                         path.includes('emails') ||
                         path === '/' ||
                         path === '/index.html';
    
    console.log('[GmailSync] Path check:', { path, isEmailsPage });
    
    if (isEmailsPage) {
      // Delay initial sync to let other modules load
      console.log('[GmailSync] Scheduling auto-sync in 5s...');
      setTimeout(async () => {
        const available = isGmailSyncAvailable();
        const user = firebase.auth().currentUser;
        
        console.log('[GmailSync] Auto-sync check:', { 
          available, 
          hasUser: !!user,
          userEmail: user?.email,
          providerData: user?.providerData?.map(p => p.providerId)
        });

        if (available) {
          console.log('[GmailSync] Auto-sync triggered on page load');
          const result = await syncGmailInbox({ maxMessages: 20 });
          console.log('[GmailSync] Auto-sync result:', result);
        } else {
          console.warn('[GmailSync] Auto-sync skipped: Gmail sync not available for this user session');
          
          // If user is logged in but doesn't have Google provider, maybe they need to link?
          if (user && !user.providerData.find(p => p.providerId === 'google.com')) {
            console.log('[GmailSync] User is logged in but not via Google provider. Provider data:', user.providerData);
          }
        }
      }, 5000);
    } else {
      console.log('[GmailSync] Not on a sync-triggering page');
    }
  }

  // Initialize auto-sync if not already syncing
  if (document.readyState === 'complete') {
    initAutoSync();
  } else {
    window.addEventListener('load', initAutoSync);
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
    return syncGmailInbox({ force: true, maxMessages, maxPages: 1, query: 'in:inbox' });
  }

  async function backfill(options = {}) {
    const { olderThanDays = 5, maxMessages = 300, maxPages = 6 } = options;
    const days = Math.max(1, parseInt(olderThanDays, 10) || 5);
    const q = `in:anywhere -in:sent older_than:${days}d`;
    return syncGmailInbox({ force: true, maxMessages, maxPages, query: q });
  }

  async function estimate(query = 'in:inbox') {
    let accessToken = await getGmailAccessToken();
    if (!accessToken) return { query, resultSizeEstimate: null, needsReauth: true };

    const est = await estimateQuery(accessToken, query);
    if (est.needsReauth) {
      accessToken = await reauthenticateWithGmailScope();
      if (!accessToken) return { query, resultSizeEstimate: null, needsReauth: true };
      return await estimateQuery(accessToken, query);
    }
    return est;
  }

  // Export public API
  window.GmailInboxSync = {
    isAvailable: isGmailSyncAvailable,
    getStatus: getSyncStatus,
    sync: syncGmailInbox,
    forceSync: forceSync,
    backfill: backfill,
    estimate: estimate,
    getAttachment: getAttachment
  };
})();

