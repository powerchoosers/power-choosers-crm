import { db } from '../_firebase.js';
import { createPublicKey, verify as cryptoVerify } from 'crypto';

// Simple logging function for Cloud Run cost optimization
const logLevels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLogLevel = logLevels[process.env.LOG_LEVEL || 'info'];

const logger = {
  info: (message, context, data) => {
    if (currentLogLevel >= logLevels.info && process.env.VERBOSE_LOGS === 'true') {
      console.log(`[${context}] ${message}`, data || '');
    }
  },
  error: (message, context, data) => {
    console.error(`[${context}] ${message}`, data || '');
  },
  debug: (message, context, data) => {
    if (currentLogLevel >= logLevels.debug && process.env.VERBOSE_LOGS === 'true') {
      console.log(`[${context}] ${message}`, data || '');
    }
  },
  warn: (message, context, data) => {
    if (currentLogLevel >= logLevels.warn) {
      console.warn(`[${context}] ${message}`, data || '');
    }
  }
};

// Build KeyObject from SendGrid Signed Events public key stored in Cloud Run env
// Env contains base64-encoded Ed25519 public key (SPKI/DER as shown in SendGrid UI)
function getSendGridPublicKey() {
  const keyB64 = process.env.SENDGRID_WEBHOOK_SECRET || '';
  if (!keyB64) throw new Error('SENDGRID_WEBHOOK_SECRET env is missing');
  return createPublicKey({ key: Buffer.from(keyB64, 'base64'), format: 'der', type: 'spki' });
}

export default async function handler(req, res) {

  // Handle GET requests for webhook testing
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'SendGrid Webhook Endpoint Active',
      timestamp: new Date().toISOString(),
      url: req.url
    }));
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    // Require JSON payload
    const contentType = (req.headers['content-type'] || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      res.writeHead(415, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unsupported Media Type: expected application/json' }));
      return;
    }

    // Verify SendGrid Signed Event Webhook (Ed25519)
    const sig = req.headers['x-twilio-email-event-webhook-signature'];
    const ts = req.headers['x-twilio-email-event-webhook-timestamp'];
    const raw = typeof req.rawBody === 'string' ? req.rawBody : '';

    if (!sig || !ts || !raw) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing signature headers or raw body' }));
      return;
    }

    let verified = false;
    try {
      const msg = Buffer.from(ts + raw, 'utf8');
      const key = getSendGridPublicKey();
      // For Ed25519, pass algorithm null
      verified = cryptoVerify(null, msg, key, Buffer.from(sig, 'base64'));
    } catch (e) {
      console.error('[SendGrid Webhook] Signature verification error:', e);
      verified = false;
    }

    if (!verified) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Signature verification failed' }));
      return;
    }

    // Use verified raw body for parsing
    let events;
    try {
      events = JSON.parse(raw);
    } catch (_) {
      events = req.body;
    }

    // SendGrid sends an array of events
    if (!Array.isArray(events)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid webhook payload' }));
      return;
    }

    logger.debug('Processing SendGrid events', 'SendGridWebhook', { eventCount: events.length });

    for (const event of events) {
      await processSendGridEvent(event);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, processed: events.length }));
    return;

  } catch (error) {
    console.error('[SendGrid Webhook] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to process webhook' }));
    return;
  }
}

async function processSendGridEvent(event) {
  const { event: eventType, email, sg_message_id, timestamp, reason, category, url } = event;
  const trackingId = (event.custom_args && (event.custom_args.trackingId || event.custom_args.trackingID)) || null;

  logger.debug('Processing SendGrid event', 'SendGridWebhook', {
    eventType,
    email,
    sgMessageId: sg_message_id,
    timestamp,
    hasUrl: !!url,
    trackingId
  });

  try {
    switch (eventType) {
      case 'delivered':
        await handleDelivered(email, sg_message_id, timestamp, trackingId);
        break;

      case 'open':
        await handleOpen(email, sg_message_id, timestamp, trackingId);
        break;

      case 'click':
        await handleClick(email, sg_message_id, timestamp, event.url, trackingId);
        break;

      case 'bounce':
        await handleBounce(email, sg_message_id, timestamp, reason, category);
        break;

      case 'blocked':
        await handleBlocked(email, sg_message_id, timestamp, reason);
        break;

      case 'spam_report':
        await handleSpamReport(email, sg_message_id, timestamp);
        break;

      case 'unsubscribe':
        await handleUnsubscribe(email, sg_message_id, timestamp);
        break;

      case 'group_unsubscribe':
        await handleGroupUnsubscribe(email, sg_message_id, timestamp);
        break;

      default:
        console.log(`[SendGrid Webhook] Unhandled event type: ${eventType}`);
    }
  } catch (error) {
    console.error(`[SendGrid Webhook] Error processing ${eventType}:`, error);
  }
}

async function handleDelivered(email, sgMessageId, timestamp, trackingId) {
  // Update email record with delivery confirmation
  const deliveredAtIso = new Date(timestamp * 1000).toISOString();

  // Prefer direct ID mapping via custom_args.trackingId
  if (trackingId) {
    try {
      const ref = db.collection('emails').doc(trackingId);
      const snap = await ref.get();
      if (snap.exists) {
        await ref.update({
          status: 'delivered',
          deliveredAt: deliveredAtIso,
          sgMessageId: sgMessageId,
          updatedAt: new Date().toISOString()
        });
        console.log(`[SendGrid Webhook] Marked email as delivered by trackingId: ${trackingId}`);
        return;
      }
    } catch (_) { /* continue to fallbacks */ }
  }

  // Try finding by string 'to' (sequence emails)
  let emailQuery = await db.collection('emails')
    .where('to', '==', email)
    .where('status', '==', 'sent')
    .orderBy('sentAt', 'desc')
    .limit(1)
    .get();

  // If not found, try finding by array 'to' (manual emails)
  if (emailQuery.empty) {
    emailQuery = await db.collection('emails')
      .where('to', 'array-contains', email)
      .where('status', '==', 'sent')
      .orderBy('sentAt', 'desc')
      .limit(1)
      .get();
  }

  if (!emailQuery.empty) {
    const emailDoc = emailQuery.docs[0];
    await emailDoc.ref.update({
      status: 'delivered',
      deliveredAt: deliveredAtIso,
      sgMessageId: sgMessageId,
      updatedAt: new Date().toISOString()
    });
    console.log(`[SendGrid Webhook] Marked email as delivered (fallback): ${email}`);
  }
}

async function handleOpen(email, sgMessageId, timestamp, trackingId) {
  // Find and update the email record by messageId first, then by email
  // Prefer direct ID mapping via custom_args.trackingId
  if (trackingId) {
    try {
      const ref = db.collection('emails').doc(trackingId);
      const snap = await ref.get();
      if (snap.exists) {
        const emailData = snap.data();
        const openData = {
          openedAt: new Date(timestamp * 1000).toISOString(),
          sgMessageId: sgMessageId,
          userAgent: 'SendGrid Webhook',
          ip: 'SendGrid Server'
        };
        await ref.update({
          opens: [...(emailData.opens || []), openData],
          openCount: (emailData.openCount || 0) + 1,
          lastOpened: openData.openedAt,
          updatedAt: new Date().toISOString()
        });
        console.log(`[SendGrid Webhook] Recorded open by trackingId: ${trackingId}`);
        return;
      }
    } catch (_) { /* continue to fallbacks */ }
  }

  let emailQuery = await db.collection('emails')
    .where('messageId', '==', sgMessageId)
    .limit(1)
    .get();

  // Fallback: find by email if messageId not found
  if (emailQuery.empty) {
    // Try finding by string 'to' (sequence emails)
    const stringQuery = await db.collection('emails')
      .where('to', '==', email)
      .where('type', '==', 'sent')
      .orderBy('sentAt', 'desc')
      .limit(1)
      .get();

    // Try finding by array 'to' (manual emails)
    const arrayQuery = await db.collection('emails')
      .where('to', 'array-contains', email)
      .where('type', '==', 'sent')
      .orderBy('sentAt', 'desc')
      .limit(1)
      .get();

    // Use the most recent one
    if (!stringQuery.empty && !arrayQuery.empty) {
      const sDate = new Date(stringQuery.docs[0].data().sentAt || 0);
      const aDate = new Date(arrayQuery.docs[0].data().sentAt || 0);
      emailQuery = (sDate > aDate) ? stringQuery : arrayQuery;
    } else if (!stringQuery.empty) {
      emailQuery = stringQuery;
    } else {
      emailQuery = arrayQuery;
    }
  }

  if (!emailQuery.empty) {
    const emailDoc = emailQuery.docs[0];
    const emailData = emailDoc.data();

    const openData = {
      openedAt: new Date(timestamp * 1000).toISOString(),
      sgMessageId: sgMessageId,
      userAgent: 'SendGrid Webhook',
      ip: 'SendGrid Server'
    };

    await emailDoc.ref.update({
      opens: [...(emailData.opens || []), openData],
      openCount: (emailData.openCount || 0) + 1,
      lastOpened: openData.openedAt,
      updatedAt: new Date().toISOString()
    });

    console.log(`[SendGrid Webhook] Recorded open for ${email} (${emailDoc.id})`);
  } else {
    console.log(`[SendGrid Webhook] Email not found for open event: ${email} (${sgMessageId})`);
  }
}

async function handleClick(email, sgMessageId, timestamp, url, trackingId) {
  // Find and update the email record by messageId first, then by email
  // Prefer direct ID mapping via custom_args.trackingId
  if (trackingId) {
    try {
      const ref = db.collection('emails').doc(trackingId);
      const snap = await ref.get();
      if (snap.exists) {
        const emailData = snap.data();
        const clickData = {
          clickedAt: new Date(timestamp * 1000).toISOString(),
          sgMessageId: sgMessageId,
          url: url,
          userAgent: 'SendGrid Webhook',
          ip: 'SendGrid Server'
        };
        await ref.update({
          clicks: [...(emailData.clicks || []), clickData],
          clickCount: (emailData.clickCount || 0) + 1,
          lastClicked: clickData.clickedAt,
          updatedAt: new Date().toISOString()
        });
        console.log(`[SendGrid Webhook] Recorded click by trackingId: ${trackingId}`);
        return;
      }
    } catch (_) { /* continue to fallbacks */ }
  }

  let emailQuery = await db.collection('emails')
    .where('messageId', '==', sgMessageId)
    .limit(1)
    .get();

  // Fallback: find by email if messageId not found
  if (emailQuery.empty) {
    // Try finding by string 'to' (sequence emails)
    const stringQuery = await db.collection('emails')
      .where('to', '==', email)
      .where('type', '==', 'sent')
      .orderBy('sentAt', 'desc')
      .limit(1)
      .get();

    // Try finding by array 'to' (manual emails)
    const arrayQuery = await db.collection('emails')
      .where('to', 'array-contains', email)
      .where('type', '==', 'sent')
      .orderBy('sentAt', 'desc')
      .limit(1)
      .get();

    // Use the most recent one
    if (!stringQuery.empty && !arrayQuery.empty) {
      const sDate = new Date(stringQuery.docs[0].data().sentAt || 0);
      const aDate = new Date(arrayQuery.docs[0].data().sentAt || 0);
      emailQuery = (sDate > aDate) ? stringQuery : arrayQuery;
    } else if (!stringQuery.empty) {
      emailQuery = stringQuery;
    } else {
      emailQuery = arrayQuery;
    }
  }

  if (!emailQuery.empty) {
    const emailDoc = emailQuery.docs[0];
    const emailData = emailDoc.data();

    const clickData = {
      clickedAt: new Date(timestamp * 1000).toISOString(),
      sgMessageId: sgMessageId,
      url: url,
      userAgent: 'SendGrid Webhook',
      ip: 'SendGrid Server'
    };

    await emailDoc.ref.update({
      clicks: [...(emailData.clicks || []), clickData],
      clickCount: (emailData.clickCount || 0) + 1,
      lastClicked: clickData.clickedAt,
      updatedAt: new Date().toISOString()
    });

    console.log(`[SendGrid Webhook] Recorded click for ${email} (${emailDoc.id}): ${url}`);
  } else {
    console.log(`[SendGrid Webhook] Email not found for click event: ${email} (${sgMessageId})`);
  }
}

async function handleBounce(email, sgMessageId, timestamp, reason, category) {
  // Mark contact as bounced and suppress from future sends
  await suppressContact(email, 'bounced', reason);

  // Update email record
  const emailQuery = await db.collection('emails')
    .where('to', 'array-contains', email)
    .limit(1)
    .get();

  if (!emailQuery.empty) {
    const emailDoc = emailQuery.docs[0];
    await emailDoc.ref.update({
      status: 'bounced',
      bounceReason: reason,
      bounceCategory: category,
      bouncedAt: new Date(timestamp * 1000).toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  console.log(`[SendGrid Webhook] Contact bounced: ${email} - ${reason}`);
}

async function handleBlocked(email, sgMessageId, timestamp, reason) {
  await suppressContact(email, 'blocked', reason);
  console.log(`[SendGrid Webhook] Contact blocked: ${email} - ${reason}`);
}

async function handleSpamReport(email, sgMessageId, timestamp) {
  await suppressContact(email, 'spam_reported', 'User marked as spam');
  console.log(`[SendGrid Webhook] Spam report: ${email}`);
}

async function handleUnsubscribe(email, sgMessageId, timestamp) {
  await suppressContact(email, 'unsubscribed', 'User unsubscribed');
  console.log(`[SendGrid Webhook] Unsubscribe: ${email}`);
}

async function handleGroupUnsubscribe(email, sgMessageId, timestamp) {
  await suppressContact(email, 'group_unsubscribed', 'User unsubscribed from group');
  console.log(`[SendGrid Webhook] Group unsubscribe: ${email}`);
}

async function suppressContact(email, reason, details) {
  try {
    // Add to suppression list
    await db.collection('suppressions').doc(email).set({
      email: email,
      reason: reason,
      details: details,
      suppressedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    });

    // Update contact status in people collection
    const peopleQuery = await db.collection('people')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (!peopleQuery.empty) {
      const contactDoc = peopleQuery.docs[0];
      await contactDoc.ref.update({
        emailStatus: reason,
        emailSuppressed: true,
        suppressionReason: details,
        suppressedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    // Pause any active sequences for this contact
    const sequencesQuery = await db.collection('sequenceExecutions')
      .where('contact.email', '==', email)
      .where('status', '==', 'active')
      .get();

    for (const sequenceDoc of sequencesQuery.docs) {
      await sequenceDoc.ref.update({
        status: 'paused',
        pauseReason: reason,
        pausedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error(`[SendGrid Webhook] Error suppressing contact ${email}:`, error);
  }
}
