/**
 * Power Choosers CRM - SendGrid Inbound Parse Webhook Handler
 * FIXED VERSION - Parses multipart data and saves to Firebase
 */

import { admin, db } from '../_firebase.js';
import crypto from 'crypto';
import formidable from 'formidable';
import { simpleParser } from 'mailparser';
import sanitizeHtml from 'sanitize-html';
import logger from '../_logger.js';
import fs from 'fs';

// Optional Basic Auth for Inbound Parse (no-cost hardening)
function checkBasicAuth(req) {
  const u = process.env.INBOUND_AUTH_USERNAME || '';
  const p = process.env.INBOUND_AUTH_PASSWORD || '';
  if (!u || !p) return true; // auth disabled
  const hdr = req.headers['authorization'] || '';
  const expected = 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
  return hdr === expected;
}

// Quoted-printable decoder reused across parsing branches
function decodeQuotedPrintable(html) {
  if (!html) return '';
  try {
    let decoded = html
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-F]{2})/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/=20/g, ' ')
      .replace(/=3D/g, '=')
      .replace(/=22/g, '"')
      .replace(/=27/g, "'")
      .replace(/=0A/g, '\n')
      .replace(/=0D/g, '\r');
    return decoded
      .replace(/href=3D"/gi, 'href="')
      .replace(/src=3D"/gi, 'src="')
      .replace(/href="3D/gi, 'href="')
      .replace(/src="3D/gi, 'src="')
      .replace(/href=3D%22/gi, 'href="')
      .replace(/src=3D%22/gi, 'src="')
      .replace(/href="3D%22/gi, 'href="')
      .replace(/src="3D%22/gi, 'src="');
  } catch (error) {
    logger.warn('[InboundEmail] Failed to decode quoted-printable:', error);
    return html
      .replace(/href=3D"/gi, 'href="')
      .replace(/src=3D"/gi, 'src="')
      .replace(/href="3D/gi, 'href="')
      .replace(/src="3D/gi, 'src="')
      .replace(/=3D/gi, '=')
      .replace(/=22/gi, '"')
      .replace(/=27/gi, "'");
  }
}

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // Enhanced security checks (no extra paid infra)
  // Enforce content type
  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (!ct.includes('multipart/form-data')) {
    res.writeHead(415, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unsupported Media Type: expected multipart/form-data' }));
    return;
  }

  // Optional Basic Auth via env
  if (!checkBasicAuth(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="SendGrid Inbound"', 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  // Note: Inbound Parse does not provide a first-party signed payload like Event Webhooks.
  // We rely on Basic Auth + content-type checks. Avoid IP allowlists without LB due to spoofing risk.

  try {
    // Parse multipart/form-data using formidable (v3+)
    const form = formidable({ multiples: true });
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          logger.error('[InboundEmail] Form parse error:', err);
          reject(err);
        } else {
          resolve([fields, files]);
        }
      });
    });

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
      emailType: 'received',     // For consistency with filtering logic
      provider: 'sendgrid_inbound',
      inReplyTo: '',
      references: [],
      headers: {}
    };

    // Prefer parsing the raw RFC822 when provided by SendGrid
    let rawMime = first(fields.email);
    // Some SendGrid configurations may send the raw MIME as a file part named 'email'
    if (!rawMime && files && files.email) {
      const emailFile = Array.isArray(files.email) ? files.email[0] : files.email;
      try {
        if (emailFile && emailFile.filepath) {
          const buf = await fs.promises.readFile(emailFile.filepath);
          rawMime = buf.toString('utf8');
        }
      } catch (fileErr) {
        logger.warn('[InboundEmail] Failed to read raw MIME file:', fileErr?.message || fileErr);
      }
    }

    if (rawMime) {
      let parsed;
      try {
        parsed = await simpleParser(rawMime);
      } catch (parseErr) {
        logger.warn('[InboundEmail] simpleParser failed, falling back to field-level values:', parseErr?.message || parseErr);
        parsed = null;
      }

      if (parsed) {
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

        // decodeQuotedPrintable is now a shared helper (see top)

        // Sanitize HTML with data/image support and entity decoding
        const sanitizedHtml = html ? sanitizeHtml(decodeQuotedPrintable(html), {
          allowedSchemes: ['http', 'https', 'mailto', 'data'],
          allowedAttributes: {
            '*': ['style', 'class', 'id', 'dir', 'align'],
            'a': ['href', 'name', 'target', 'rel'],
            'img': ['src', 'alt', 'width', 'height', 'style']
          },
          transformTags: {
            'a': (tagName, attribs) => {
              // Ensure href doesn't start with malformed encoding
              if (attribs.href && attribs.href.startsWith('3D')) {
                attribs.href = attribs.href.replace(/^3D"?/, '');
              }
              return { tagName, attribs };
            },
            'img': (tagName, attribs) => {
              // Ensure src doesn't start with malformed encoding
              if (attribs.src && attribs.src.startsWith('3D')) {
                attribs.src = attribs.src.replace(/^3D"?/, '');
              }
              return { tagName, attribs };
            }
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
      }
    } else {
      // If no raw MIME, sanitize any provided HTML and decode text where possible
      if (emailData.html) {
        emailData.html = sanitizeHtml(decodeQuotedPrintable(emailData.html), {
          allowedSchemes: ['http','https','mailto','data'],
          allowedAttributes: { '*': ['style','class','id'], 'a': ['href','target','rel'], 'img': ['src','alt','width','height','style'] },
          transformTags: {
            'a': (tagName, attribs) => {
              if (attribs.href && attribs.href.startsWith('3D')) {
                attribs.href = attribs.href.replace(/^3D"?/, '');
              }
              return { tagName, attribs };
            },
            'img': (tagName, attribs) => {
              if (attribs.src && attribs.src.startsWith('3D')) {
                attribs.src = attribs.src.replace(/^3D"?/, '');
              }
              return { tagName, attribs };
            }
          }
        });
      }
    }

    // Idempotency: dedupe on Message-ID when available
    if (emailData.messageId) {
      const snap = await db.collection('emails')
        .where('messageId', '==', emailData.messageId)
        .limit(1)
        .get();
      if (!snap.empty) {
        logger.log('[InboundEmail] Duplicate messageId detected, skipping save:', emailData.messageId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, deduped: true, message: 'Duplicate Message-ID ignored' }));
        return;
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
      const tRef = db.collection('threads').doc(threadId);
      const existing = await tRef.get();
      if (existing.exists) {
        await tRef.update({
          subjectNormalized: existing.data().subjectNormalized || subjectNorm,
          participants: Array.from(new Set([...(existing.data().participants || []), ...participants])),
          lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
          lastSnippet: snippet || existing.data().lastSnippet || '',
          lastFrom: emailData.from || existing.data().lastFrom || '',
          messageCount: admin.firestore.FieldValue.increment(1)
        });
      } else {
        await tRef.set({
          id: threadId,
          subjectNormalized: subjectNorm,
          participants,
          lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
          lastSnippet: snippet,
          lastFrom: emailData.from || '',
          messageCount: 1,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (threadErr) {
      logger.warn('[InboundEmail] Thread upsert warning:', threadErr?.message || threadErr);
    }

    // Validate required fields (relax subject requirement if missing but body present)
    if (!emailData.from || !emailData.to || (!emailData.subject && !emailData.text && !emailData.html)) {
      logger.error('[InboundEmail] Missing required fields:', { from: emailData.from, to: emailData.to, subject: emailData.subject });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required email fields' }));
      return;
    }

    // Extract recipient email for ownership assignment
    // Inbound emails are assigned to the recipient user
    function extractEmailAddress(emailString) {
      if (!emailString) return '';
      // Handle formats: "Name" <email@domain.com> or email@domain.com
      const match = emailString.match(/<([^>]+)>/) || emailString.match(/([^\s<>]+@[^\s<>]+)/);
      return match ? match[1].toLowerCase().trim() : emailString.toLowerCase().trim();
    }
    
    const recipientEmail = extractEmailAddress(emailData.to || '');

    // Validate recipient email (required for Firestore rules compliance)
    // If no valid recipient email found, assign to admin as fallback
    const ownerEmail = (recipientEmail && recipientEmail.includes('@')) 
      ? recipientEmail 
      : 'l.patterson@powerchoosers.com'; // Admin fallback for invalid emails

    // Save to Firebase with proper error handling
    try {
      const emailDoc = {
        ...emailData,
        threadId,
        // CRITICAL: Set ownership fields for Firestore rules compliance
        // ownerId must match authenticated user's email for non-admin access
        ownerId: ownerEmail,
        assignedTo: ownerEmail,
        createdBy: ownerEmail,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      const docRef = await db.collection('emails').add(emailDoc);
      logger.log('[InboundEmail] Email saved to Firebase with ID:', docRef.id);

      // Log any suspicious URLs for debugging
      const urlPattern = /(href|src)=["']([^"']*?)["']/gi;
      const matches = [...(emailData.html || '').matchAll(urlPattern)];
      const suspiciousUrls = matches.filter(m => 
        m[2].includes('3D') || (m[2].includes('=') && !m[2].startsWith('data:'))
      );
      if (suspiciousUrls.length > 0) {
        logger.warn('[InboundEmail] Detected potentially malformed URLs:', 
          suspiciousUrls.map(m => m[2]).slice(0, 5)
        );
      }

    // Return success response
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
        emailId: docRef.id,
      message: 'Email processed successfully' 
    }));
    return;
    } catch (firebaseError) {
      logger.error('[InboundEmail] Error saving to Firestore:', firebaseError);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false, 
        error: 'Failed to save email to database',
        message: firebaseError.message 
      }));
      return;
    }

  } catch (error) {
    logger.error('[InboundEmail] Error processing webhook:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message 
    }));
    return;
  }
}
