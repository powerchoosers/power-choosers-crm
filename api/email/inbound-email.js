/**
 * Power Choosers CRM - SendGrid Inbound Parse Webhook Handler
 * FIXED VERSION - Parses multipart data and saves to Firebase
 */

import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  serverTimestamp,
  query,
  where,
  getDocs,
  limit,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  increment
} from 'firebase/firestore';
import crypto from 'crypto';
const formidable = require('formidable');
import { simpleParser } from 'mailparser';
import sanitizeHtml from 'sanitize-html';

// Firebase configuration - using your existing variables
const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID
};

// Initialize Firebase (only if not already initialized)
const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(firebaseApp);

// SendGrid signature verification
function verifySendGridSignature(payload, signature, timestamp, publicKey) {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', publicKey)
      .update(timestamp + payload)
      .digest('base64');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'base64'),
      Buffer.from(expectedSignature, 'base64')
    );
  } catch (error) {
    console.error('[InboundEmail] Signature verification error:', error);
    return false;
  }
}

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  console.log('[InboundEmail] === WEBHOOK CALLED ===');
  console.log('[InboundEmail] Timestamp:', new Date().toISOString());
  console.log('[InboundEmail] Method:', req.method);
  console.log('[InboundEmail] User-Agent:', req.headers['user-agent']);
  console.log('[InboundEmail] Content-Type:', req.headers['content-type']);
  
  // Check if this is from SendGrid
  const userAgent = req.headers['user-agent'] || '';
  const isFromSendGrid = userAgent.includes('Sendlib') || userAgent.includes('SendGrid');
  console.log('[InboundEmail] Is from SendGrid:', isFromSendGrid);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Enhanced security checks
  if (!isFromSendGrid) {
    console.log('[InboundEmail] Rejecting request - not from SendGrid');
    return res.status(403).json({ error: 'Forbidden - not from SendGrid' });
  }

  // SendGrid signature verification (if webhook secret is configured)
  if (process.env.SENDGRID_WEBHOOK_SECRET) {
    const signature = req.headers['x-sendgrid-signature'];
    const timestamp = req.headers['x-sendgrid-timestamp'];
    
    if (!signature || !timestamp) {
      console.log('[InboundEmail] Missing signature or timestamp headers');
      return res.status(403).json({ error: 'Missing signature headers' });
    }
    
    // Note: For signature verification, we need the raw body
    // This is a simplified check - in production, you'd need to capture raw body
    console.log('[InboundEmail] Signature verification would be performed here');
    console.log('[InboundEmail] Signature:', signature);
    console.log('[InboundEmail] Timestamp:', timestamp);
  }

  try {
    // Parse multipart/form-data using formidable
    const form = new formidable.IncomingForm();
    
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error('[InboundEmail] Form parse error:', err);
          reject(err);
        } else {
          resolve([fields, files]);
        }
      });
    });

    console.log('[InboundEmail] Parsed fields:', fields);
    console.log('[InboundEmail] Parsed files:', files);

    // Helper: coerce first value of possibly-array field
    const first = (v) => Array.isArray(v) ? v[0] : v;

    // Start with field-level basics (fallbacks if raw parsing fails)
    let emailData = {
      from: first(fields.from) || first(fields.sender) || '',
      to: first(fields.to) || first(fields.recipient) || '',
      subject: first(fields.subject) || '',
      text: first(fields.text) || first(fields.text_plain) || '',
      html: first(fields.html) || first(fields.text_html) || '',
      messageId: first(fields.message_id) || first(fields['Message-ID']) || '',
      receivedAt: new Date().toISOString(),
      type: 'received',
      provider: 'sendgrid_inbound',
      inReplyTo: '',
      references: [],
      headers: {}
    };

    // Prefer parsing the raw RFC822 when provided by SendGrid
    const rawMime = first(fields.email);
    if (rawMime) {
      console.log('[InboundEmail] Parsing raw MIME with mailparser');
      const parsed = await simpleParser(rawMime);

      // Addresses and subject
      emailData.subject = parsed.subject || emailData.subject || '';
      emailData.from = (parsed.from && parsed.from.text) || emailData.from || '';
      emailData.to = (parsed.to && parsed.to.text) || emailData.to || '';
      if (parsed.cc && parsed.cc.text) emailData.cc = parsed.cc.text;

      // Body selection: prefer HTML, else text
      let html = parsed.html || '';
      let text = parsed.text || '';

      // Inline images: replace cid: with data URLs from attachments (safe fallback)
      if (html && parsed.attachments && parsed.attachments.length) {
        for (const att of parsed.attachments) {
          if (att.contentId && att.content) {
            const dataUrl = `data:${att.contentType};base64,${att.content.toString('base64')}`;
            const cidPatterns = [
              new RegExp(`cid:${att.contentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'),
            ];
            for (const rx of cidPatterns) html = html.replace(rx, dataUrl);
          }
        }
      }

      // Sanitize HTML with data/image support
      const sanitizedHtml = html ? sanitizeHtml(html, {
        allowedSchemes: ['http', 'https', 'mailto', 'data'],
        allowedAttributes: {
          '*': ['style', 'class', 'id', 'dir', 'align'],
          'a': ['href', 'name', 'target', 'rel'],
          'img': ['src', 'alt', 'width', 'height', 'style']
        }
      }) : '';

      emailData.html = sanitizedHtml || emailData.html || '';
      emailData.text = text || emailData.text || '';

      // Threading headers
      emailData.messageId = parsed.messageId || emailData.messageId || '';
      emailData.inReplyTo = parsed.inReplyTo || '';
      emailData.references = Array.isArray(parsed.references) ? parsed.references : (parsed.references ? [parsed.references] : []);
      emailData.date = parsed.date ? new Date(parsed.date).toISOString() : emailData.receivedAt;
      emailData.headers = Object.fromEntries(parsed.headerLines?.map(h => [h.key, h.line]) || []);
    } else {
      // If no raw MIME, sanitize any provided HTML and decode text where possible
      if (emailData.html) {
        emailData.html = sanitizeHtml(emailData.html, {
          allowedSchemes: ['http','https','mailto','data'],
          allowedAttributes: { '*': ['style','class','id'], 'a': ['href','target','rel'], 'img': ['src','alt','width','height','style'] }
        });
      }
    }

    console.log('[InboundEmail] Headers (subset):', {
      messageId: emailData.messageId,
      inReplyTo: emailData.inReplyTo,
      referencesCount: emailData.references?.length || 0
    });

    // Idempotency: dedupe on Message-ID when available
    if (emailData.messageId) {
      const q = query(collection(db, 'emails'), where('messageId', '==', emailData.messageId), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        console.log('[InboundEmail] Duplicate messageId detected, skipping save:', emailData.messageId);
        return res.status(200).json({ success: true, deduped: true, message: 'Duplicate Message-ID ignored' });
      }
    }

    // Compute threadId
    function normalizeSubject(subj = '') {
      try {
        let s = String(subj || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
        s = s.replace(/^\s*(re|fw|fwd)\s*:\s*/i, '');
        return s.toLowerCase();
      } catch(_) { return ''; }
    }

    function extractEmails(addrText = '') {
      const s = String(addrText || '');
      const matches = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
      return Array.from(new Set(matches.map(e => e.toLowerCase()))).sort();
    }

    function stripHtml(html = '') {
      return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    const subjectNorm = normalizeSubject(emailData.subject);
    const participants = Array.from(new Set([
      ...extractEmails(emailData.from),
      ...extractEmails(emailData.to || ''),
      ...extractEmails(emailData.cc || '')
    ])).sort();

    let threadId = '';
    if (emailData.references && emailData.references.length) {
      threadId = emailData.references[0]; // root of chain
    } else if (emailData.inReplyTo) {
      threadId = emailData.inReplyTo;
    } else if (emailData.messageId) {
      // first message in chain uses its own messageId
      threadId = emailData.messageId;
    } else {
      // Fallback: subject+participants hash
      const hash = crypto.createHash('sha1').update(subjectNorm + '|' + participants.join(','), 'utf8').digest('hex');
      threadId = `thr_${hash}`;
    }

    // Prepare snippet
    const snippetSource = emailData.text || stripHtml(emailData.html || '');
    const snippet = snippetSource ? (snippetSource.length > 140 ? snippetSource.slice(0, 140) + '…' : snippetSource) : '';

    // Upsert thread doc
    try {
      const tRef = doc(db, 'threads', threadId);
      const existing = await getDoc(tRef);
      if (existing.exists()) {
        await updateDoc(tRef, {
          subjectNormalized: existing.data().subjectNormalized || subjectNorm,
          participants: Array.from(new Set([...(existing.data().participants || []), ...participants])),
          lastMessageAt: serverTimestamp(),
          lastSnippet: snippet || existing.data().lastSnippet || '',
          lastFrom: emailData.from || existing.data().lastFrom || '',
          messageCount: increment(1)
        });
      } else {
        await setDoc(tRef, {
          id: threadId,
          subjectNormalized: subjectNorm,
          participants,
          lastMessageAt: serverTimestamp(),
          lastSnippet: snippet,
          lastFrom: emailData.from || '',
          messageCount: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    } catch (threadErr) {
      console.warn('[InboundEmail] Thread upsert warning:', threadErr?.message || threadErr);
    }

    // Validate required fields (relax subject requirement if missing but body present)
    if (!emailData.from || !emailData.to || (!emailData.subject && !emailData.text && !emailData.html)) {
      console.error('[InboundEmail] Missing required fields:', { from: emailData.from, to: emailData.to, subject: emailData.subject });
      return res.status(400).json({ error: 'Missing required email fields' });
    }

    console.log('[InboundEmail] Extracted email data:', emailData);

    // Save to Firebase with proper error handling
    try {
      const emailDoc = {
        ...emailData,
        threadId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(db, 'emails'), emailDoc);
      console.log('[InboundEmail] Email saved to Firebase with ID:', docRef.id);

    // Return success response
    return res.status(200).json({ 
      success: true, 
        emailId: docRef.id,
      message: 'Email processed successfully' 
    });
    } catch (firebaseError) {
      console.error('[InboundEmail] Error saving to Firestore:', firebaseError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to save email to database',
        message: firebaseError.message 
      });
    }

  } catch (error) {
    console.error('[InboundEmail] Error processing webhook:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
