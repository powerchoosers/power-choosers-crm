import { useState, useCallback } from 'react';
import { auth } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';
import { GoogleAuthProvider, signInWithPopup, User } from 'firebase/auth';
import { toast } from 'sonner';

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
  };
  parts?: GmailMessagePart[];
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

  const reauthenticateWithGmailScope = useCallback(async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
      // Force account selection to ensure we get the right user
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      
      if (token) {
        sessionStorage.setItem('gmail_oauth_token', token);
      }
      
      return token;
    } catch (error) {
      console.error('Re-auth failed:', error);
      toast.error('Failed to connect to Gmail. Please try again.');
      return null;
    }
  }, []);

  // Get Access Token
  const getAccessToken = useCallback(async () => {
    // Check session storage first
    const cachedToken = sessionStorage.getItem('gmail_oauth_token');
    if (cachedToken) return cachedToken;
    
    // Fallback: Re-auth to get new token
    return await reauthenticateWithGmailScope();
  }, [reauthenticateWithGmailScope]);

  // Parse Gmail Message (Ported from legacy script)
  const parseGmailMessage = useCallback((message: GmailMessage, userEmail: string) => {
    const headers = message.payload?.headers ?? [];
    const getHeader = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

    // Extract body parts (simplified logic from legacy)
    let htmlBody = '';
    let textBody = '';
    
    const extractParts = (part?: GmailMessagePart) => {
      if (!part) return;
      if (part.mimeType === 'text/html' && part.body?.data) {
        htmlBody = decodeBase64Url(part.body.data);
      } else if (part.mimeType === 'text/plain' && part.body?.data) {
        textBody = decodeBase64Url(part.body.data);
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
      metadata: {
        ownerId: userEmail.toLowerCase(),
        gmailThreadId: message.threadId
      }
    };
  }, []);

  const syncGmail = useCallback(async (user: User) => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncStatus('Starting sync...');

    try {
      let accessToken = await getAccessToken();
      if (!accessToken) {
        accessToken = await reauthenticateWithGmailScope();
        if (!accessToken) throw new Error('Could not get access token');
      }

      // Fetch messages list
      setSyncStatus('Fetching messages...');
      const listRes = await fetch(`${GMAIL_API_BASE}/messages?q=in:inbox&maxResults=${MAX_MESSAGES_PER_SYNC}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!listRes.ok) {
        if (listRes.status === 401) {
             // Token expired, try once more
             accessToken = await reauthenticateWithGmailScope();
             if (!accessToken) throw new Error('Re-auth failed');
        } else {
            throw new Error(`Gmail API error: ${listRes.status}`);
        }
      }

      const listData = await listRes.json();
      const messages = listData.messages || [];

      setSyncStatus(`Processing ${messages.length} messages...`);
      let syncedCount = 0;

      for (const msg of messages) {
        // Check duplication in Supabase
        const { data: existing, error: checkError } = await supabase
          .from('emails')
          .select('id')
          .eq('gmailMessageId', msg.id)
          .maybeSingle();
        
        if (checkError) {
          console.error('Error checking existing email:', checkError);
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
        
        // Save to Supabase
        const { error: insertError } = await supabase
          .from('emails')
          .insert({
            subject: emailData.subject,
            from: emailData.from,
            to: emailData.to,
            html: emailData.html,
            text: emailData.text,
            type: emailData.type,
            status: emailData.status,
            gmailMessageId: emailData.gmailMessageId,
            timestamp: emailData.timestamp,
            is_read: emailData.is_read,
            metadata: emailData.metadata,
            created_at: emailData.createdAt,
            updated_at: emailData.updatedAt
          });

        if (insertError) {
          console.error('Error inserting email into Supabase:', insertError);
          continue;
        }

        syncedCount++;
      }

      setSyncStatus(`Synced ${syncedCount} new emails`);
      if (syncedCount > 0) {
        toast.success(`Synced ${syncedCount} new emails`);
      }
    } catch (error) {
      console.error('Sync failed:', error);
      setSyncStatus('Sync failed');
      toast.error('Gmail sync failed');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncStatus(''), 3000);
    }
  }, [isSyncing, getAccessToken, reauthenticateWithGmailScope, parseGmailMessage]);

  return { syncGmail, isSyncing, syncStatus };
}
