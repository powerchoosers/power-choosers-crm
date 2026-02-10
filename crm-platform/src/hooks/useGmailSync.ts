import { useState, useCallback } from 'react';
import { auth } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, User } from 'firebase/auth';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useSyncStore } from '@/store/syncStore';

const GMAIL_TOKEN_KEY = 'gmail_oauth_token';
const GMAIL_TOKEN_LEGACY_KEY = 'pc:googleAccessToken';

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return (
    sessionStorage.getItem(GMAIL_TOKEN_KEY) ||
    localStorage.getItem(GMAIL_TOKEN_KEY) ||
    localStorage.getItem(GMAIL_TOKEN_LEGACY_KEY)
  ) || null;
}

function setStoredToken(token: string) {
  sessionStorage.setItem(GMAIL_TOKEN_KEY, token);
  try {
    localStorage.setItem(GMAIL_TOKEN_KEY, token);
  } catch {
    // ignore quota or private mode
  }
}

// Gmail API Types
interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  mimeType?: string;
  headers?: GmailHeader[];
  body?: {
    data?: string;
    attachmentId?: string;
    size?: number;
  };
  parts?: GmailMessagePart[];
  filename?: string;
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload?: GmailMessagePart;
  internalDate: string;
}

const MAX_MESSAGES_PER_SYNC = 50;
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

const decodeBase64Url = (data: string) => {
  try {
    return atob(data.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return '';
  }
};

export function useGmailSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>('');
  const queryClient = useQueryClient();
  const { setIsSyncing: setGlobalSyncing, setLastSyncTime, incrementSyncCount } = useSyncStore();

  const reauthenticateWithGmailScope = useCallback(async (silent = false) => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/gmail.readonly');

      if (!silent) {
        provider.setCustomParameters({ prompt: 'select_account' });
      }

      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken ?? null;

      if (token) {
        setStoredToken(token);
        return token;
      }
      return null;
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      const isPopupBlocked =
        err?.code === 'auth/popup-blocked' ||
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request' ||
        (err?.message && /popup|Cross-Origin-Opener-Policy/i.test(err.message));

      if (isPopupBlocked && !silent) {
        toast.info('Opening Gmail connection in a new tab…');
        try {
          const provider = new GoogleAuthProvider();
          provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
          provider.setCustomParameters({ prompt: 'select_account' });
          await signInWithRedirect(auth, provider);
          return null;
        } catch (redirectErr) {
          console.error('Redirect failed:', redirectErr);
          toast.error('Gmail connection failed. Please allow popups or try again.');
        }
        return null;
      }

      if (!silent) {
        console.error('Re-auth failed:', error);
        toast.error('Failed to connect to Gmail. Please try again.');
      }
      return null;
    }
  }, []);

  /** Call once on emails page mount to capture token after redirect from Gmail connect. */
  const processRedirectResult = useCallback(async (): Promise<string | null> => {
    try {
      const result = await getRedirectResult(auth);
      if (!result) return null;
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken ?? null;
      if (token) {
        setStoredToken(token);
        return token;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  // Get Access Token
  const getAccessToken = useCallback(async () => {
    const cached = getStoredToken();
    if (cached) return cached;
    return await reauthenticateWithGmailScope(true);
  }, [reauthenticateWithGmailScope]);

  // Parse Gmail Message (Ported from legacy script)
  const parseGmailMessage = useCallback((message: GmailMessage, userEmail: string) => {
    const headers = message.payload?.headers ?? [];
    const getHeader = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

    // Extract body parts (simplified logic from legacy)
    let htmlBody = '';
    let textBody = '';
    const attachments: Array<{ 
      filename: string; 
      mimeType: string; 
      attachmentId: string; 
      size: number;
      messageId: string;
    }> = [];
    
    const extractParts = (part?: GmailMessagePart) => {
      if (!part) return;
      
      // Check if this is an attachment (narrow so filename/attachmentId are string for strictNullChecks)
      const filename = part.filename;
      const attachmentId = part.body?.attachmentId;
      if (filename !== undefined && filename !== '' && attachmentId) {
        attachments.push({
          filename,
          mimeType: part.mimeType || 'application/octet-stream',
          attachmentId,
          size: part.body?.size ?? 0,
          messageId: message.id
        });
      } else {
        // Extract body content
        if (part.mimeType === 'text/html' && part.body?.data) {
          htmlBody = decodeBase64Url(part.body.data);
        } else if (part.mimeType === 'text/plain' && part.body?.data) {
          textBody = decodeBase64Url(part.body.data);
        }
      }
      
      if (part.parts) part.parts.forEach(extractParts);
    };
    
    extractParts(message.payload);
    
    // If body is directly in payload
    if (!htmlBody && !textBody && message.payload?.body?.data) {
        const decoded = decodeBase64Url(message.payload.body.data);
        if (message.payload.mimeType?.includes('html')) htmlBody = decoded;
        else textBody = decoded;
    }

    const from = getHeader('From');
    const subject = getHeader('Subject') || '(No Subject)';
    const receivedDate = new Date(parseInt(message.internalDate));
    
    // Determine type based on labels and sender
    let type = 'received';
    const labelIds = message.labelIds || [];
    if (labelIds.includes('SENT') || from.toLowerCase().includes(userEmail.toLowerCase())) {
        type = 'sent';
    }

    return {
      gmailMessageId: message.id,
      gmailThreadId: message.threadId,
      messageId: getHeader('Message-ID') || message.id,
      from,
      to: getHeader('To'),
      subject,
      html: htmlBody || `<div style="white-space: pre-wrap;">${textBody}</div>`,
      text: textBody,
      snippet: message.snippet,
      type, // Dynamic type
      emailType: type,
      status: type,
      provider: 'gmail_api',
      unread: labelIds.includes('UNREAD') || false,
      ownerId: userEmail.toLowerCase(),
      assignedTo: userEmail.toLowerCase(),
      createdBy: userEmail.toLowerCase(),
      date: receivedDate.toISOString(),
      timestamp: receivedDate.toISOString(), // Use ISO string for Supabase
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      is_read: !labelIds.includes('UNREAD'),
      attachments: attachments.length > 0 ? attachments : undefined,
      metadata: {
        ownerId: userEmail.toLowerCase(),
        gmailThreadId: message.threadId,
        gmailMessageId: message.id,
        attachments: attachments.length > 0 ? attachments : undefined
      }
    };
  }, []);

  const syncGmail = useCallback(async (user: User, options: { silent?: boolean } = {}) => {
    if (isSyncing) {
      return;
    }
    
    // For background/silent sync, only proceed if we already have a token
    if (options.silent) {
        const cachedToken = getStoredToken();
        if (!cachedToken) {
          return; // Skip background sync if no token
        }
    }

    // Throttle syncs: don't sync if we synced less than 1 minute ago
    const lastSyncTime = sessionStorage.getItem('gmail_last_sync_time')
    if (lastSyncTime && options.silent) {
      const timeSinceLastSync = Date.now() - parseInt(lastSyncTime, 10)
      if (timeSinceLastSync < 60 * 1000) { // 1 minute
        return
      }
    }

    setIsSyncing(true);
    setGlobalSyncing(true);
    if (!options.silent) setSyncStatus('Starting sync...');

    try {
      let accessToken = await getAccessToken();
      if (!accessToken) {
        if (options.silent) return; // Don't trigger popup in silent mode
        accessToken = await reauthenticateWithGmailScope();
        if (!accessToken) throw new Error('Could not get access token');
      }

      // Fetch messages list
      if (!options.silent) setSyncStatus('Fetching messages...');
      // Sync both inbox and sent messages, excluding mailwarming and spam
      // Note: Gmail search doesn't support label negation for custom labels, so we filter after fetch
      const query = '(in:inbox OR in:sent) -label:spam';
      const listRes = await fetch(`${GMAIL_API_BASE}/messages?q=${encodeURIComponent(query)}&maxResults=${MAX_MESSAGES_PER_SYNC}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!listRes.ok) {
        if (listRes.status === 401) {
             // Token expired – clear so next manual sync can re-auth
             if (typeof window !== 'undefined') {
               sessionStorage.removeItem(GMAIL_TOKEN_KEY);
               localStorage.removeItem(GMAIL_TOKEN_KEY);
             }
             if (options.silent) return;
             // Token expired, try once more (non-silent)
             accessToken = await reauthenticateWithGmailScope(false);
             if (!accessToken) throw new Error('Re-auth failed');
        } else {
            throw new Error(`Gmail API error: ${listRes.status}`);
        }
      }

      const listData = await listRes.json();
      const messages = listData.messages || [];

      if (!options.silent) setSyncStatus(`Processing ${messages.length} messages...`);
      let syncedCount = 0;

      for (const msg of messages) {
        // Check duplication in Supabase using the Gmail ID as the primary key
        const { data: existing, error: checkError } = await supabase
          .from('emails')
          .select('id')
          .eq('id', msg.id)
          .maybeSingle();
        
        if (checkError) {
          if (!options.silent) console.error('Error checking existing email:', checkError);
          continue;
        }
        
        if (existing) continue;

        // Fetch full message
        const msgRes = await fetch(`${GMAIL_API_BASE}/messages/${msg.id}?format=full`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        if (!msgRes.ok) continue;
        
        const msgData = await msgRes.json();
        
        const emailData = parseGmailMessage(msgData, user.email || '');
        
        // Filter out mailwarming and automated emails
        const isMailwarming = 
          emailData.subject.toLowerCase().includes('mailwarming') ||
          emailData.subject.toLowerCase().includes('mail warming') ||
          emailData.from.toLowerCase().includes('apollo.io') ||
          emailData.from.toLowerCase().includes('mailwarm') ||
          emailData.from.toLowerCase().includes('lemwarm') ||
          emailData.from.toLowerCase().includes('warmup') ||
          emailData.subject.toLowerCase().includes('test email') ||
          (msgData.labelIds && msgData.labelIds.some((label: string) => 
            label.toLowerCase().includes('mailwarm') || 
            label.toLowerCase().includes('apollo')
          ));
        
        if (isMailwarming) {
          continue;
        }
        
        // 1. Ensure the thread exists first to satisfy Foreign Key constraint
        if (emailData.gmailThreadId) {
            const { error: threadError } = await supabase
                .from('threads')
                .upsert({
                    id: emailData.gmailThreadId,
                    "subjectNormalized": emailData.subject,
                    "lastSnippet": emailData.snippet,
                    "lastFrom": emailData.from,
                    "lastMessageAt": emailData.timestamp,
                    "updatedAt": new Date().toISOString(),
                    metadata: {
                        ownerId: user.email?.toLowerCase()
                    }
                }, { onConflict: 'id' });

            if (threadError) {
                console.error('THREAD_UPSERT_FAILURE:', threadError);
                // We continue anyway, but the email insert will likely fail if FK is enforced
            }
        }
        
        // 2. Save to Supabase using upsert to handle potential duplicates safely
        const { error: insertError } = await supabase
          .from('emails')
          .upsert({
            id: emailData.gmailMessageId,
            subject: emailData.subject,
            from: emailData.from,
            to: [emailData.to],
            "threadId": emailData.gmailThreadId,
            html: emailData.html,
            text: emailData.text,
            type: emailData.type,
            status: emailData.status,
            timestamp: emailData.timestamp,
            is_read: emailData.is_read,
            attachments: emailData.attachments,
            metadata: emailData.metadata
          }, { 
            onConflict: 'id' 
          });

        if (insertError) {
          console.error('SUPABASE_UPSERT_FAILURE:', insertError);
          console.error('ERROR_CODE:', insertError.code);
          console.error('ERROR_MESSAGE:', insertError.message);
          continue;
        }

        syncedCount++;
      }

      if (!options.silent) setSyncStatus(`Synced ${syncedCount} new emails`);
      if (syncedCount > 0) {
        if (!options.silent) toast.success(`Synced ${syncedCount} new emails`);
        // Invalidate emails query to refresh the list
        queryClient.invalidateQueries({ queryKey: ['emails'] });
      }
      
      // Store last successful sync time
      const now = Date.now()
      sessionStorage.setItem('gmail_last_sync_time', now.toString())
      setLastSyncTime(now)
      incrementSyncCount()
      
    } catch (error: any) {
      // Ignore abort errors
      if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
        setIsSyncing(false);
        setGlobalSyncing(false);
        return;
      }
      
      // Only log errors for non-silent syncs (user-triggered)
      if (!options.silent) {
        console.error('[Gmail Sync] Error:', error.message || error);
        setSyncStatus('Sync failed');
        toast.error('Gmail sync failed');
      }
    } finally {
      setIsSyncing(false);
      setGlobalSyncing(false);
      if (!options.silent) setTimeout(() => setSyncStatus(''), 3000);
    }
  }, [isSyncing, getAccessToken, reauthenticateWithGmailScope, parseGmailMessage, queryClient]);

  return { syncGmail, isSyncing, syncStatus, processRedirectResult };
}
