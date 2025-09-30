const { db } = require('../_firebase');
const { cors } = require('../_cors');

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const events = req.body;
    
    // SendGrid sends an array of events
    if (!Array.isArray(events)) {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    console.log(`[SendGrid Webhook] Processing ${events.length} events`);

    for (const event of events) {
      await processSendGridEvent(event);
    }

    return res.status(200).json({ success: true, processed: events.length });

  } catch (error) {
    console.error('[SendGrid Webhook] Error:', error);
    return res.status(500).json({ error: 'Failed to process webhook' });
  }
}

async function processSendGridEvent(event) {
  const { event: eventType, email, sg_message_id, timestamp, reason, category } = event;
  
  console.log(`[SendGrid Webhook] Processing ${eventType} for ${email}`);

  try {
    switch (eventType) {
      case 'delivered':
        await handleDelivered(email, sg_message_id, timestamp);
        break;
        
      case 'open':
        await handleOpen(email, sg_message_id, timestamp);
        break;
        
      case 'click':
        await handleClick(email, sg_message_id, timestamp, event.url);
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

async function handleDelivered(email, sgMessageId, timestamp) {
  // Update email record with delivery confirmation
  const emailQuery = await db.collection('emails')
    .where('to', 'array-contains', email)
    .where('status', '==', 'sent')
    .limit(1)
    .get();

  if (!emailQuery.empty) {
    const emailDoc = emailQuery.docs[0];
    await emailDoc.ref.update({
      status: 'delivered',
      deliveredAt: new Date(timestamp * 1000).toISOString(),
      sgMessageId: sgMessageId,
      updatedAt: new Date().toISOString()
    });
    console.log(`[SendGrid Webhook] Marked email as delivered: ${email}`);
  }
}

async function handleOpen(email, sgMessageId, timestamp) {
  // Find and update the email record
  const emailQuery = await db.collection('emails')
    .where('to', 'array-contains', email)
    .limit(1)
    .get();

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
      updatedAt: new Date().toISOString()
    });
    
    console.log(`[SendGrid Webhook] Recorded open for ${email}`);
  }
}

async function handleClick(email, sgMessageId, timestamp, url) {
  // Find and update the email record
  const emailQuery = await db.collection('emails')
    .where('to', 'array-contains', email)
    .limit(1)
    .get();

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
      updatedAt: new Date().toISOString()
    });
    
    console.log(`[SendGrid Webhook] Recorded click for ${email}: ${url}`);
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
