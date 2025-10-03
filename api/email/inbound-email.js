/**
 * Power Choosers CRM - SendGrid Inbound Parse Webhook Handler
 * Handles incoming emails from SendGrid Inbound Parse Webhook
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, query, where, getDocs, orderBy, limit } from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true'
};

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  // Set basic CORS headers (not required for SendGrid, but harmless)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[InboundEmail] Received webhook from SendGrid');
    console.log('[InboundEmail] Headers:', req.headers);
    console.log('[InboundEmail] Body:', req.body);

    // Parse the incoming email data from SendGrid
    const emailData = parseSendGridWebhook(req.body);
    
    if (!emailData) {
      console.error('[InboundEmail] Failed to parse email data');
      return res.status(400).json({ error: 'Invalid email data' });
    }

    console.log('[InboundEmail] Parsed email data:', emailData);

    // Store the incoming email in Firebase
    const emailId = await storeIncomingEmail(emailData);
    
    console.log('[InboundEmail] Email stored with ID:', emailId);

    // Try to match with existing conversation
    const conversationId = await matchToConversation(emailData);
    
    if (conversationId) {
      console.log('[InboundEmail] Matched to conversation:', conversationId);
    }

    // Return success response
    return res.status(200).json({ 
      success: true, 
      emailId,
      conversationId,
      message: 'Email processed successfully' 
    });

  } catch (error) {
    console.error('[InboundEmail] Error processing webhook:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

/**
 * Parse SendGrid webhook payload into structured email data
 */
function parseSendGridWebhook(body) {
  try {
    // SendGrid sends data as form-encoded
    const emailData = {
      // Basic email info
      from: body.from || body.sender || '',
      to: body.to || body.recipient || '',
      subject: body.subject || '',
      text: body.text || body.text_plain || '',
      html: body.html || body.text_html || '',
      
      // Headers for conversation threading
      messageId: body.message_id || body['Message-ID'] || '',
      inReplyTo: body.in_reply_to || body['In-Reply-To'] || '',
      references: body.references || body['References'] || '',
      
      // SendGrid specific
      envelope: body.envelope || '',
      charsets: body.charsets || '',
      spamScore: body.spam_score || 0,
      spamReport: body.spam_report || '',
      
      // Timestamps
      receivedAt: new Date().toISOString(),
      sentAt: body.date || new Date().toISOString(),
      
      // Email type
      type: 'received',
      provider: 'sendgrid_inbound',
      
      // Threading info
      threadId: extractThreadId(body),
      conversationId: null // Will be set if matched
    };

    // Clean up email addresses
    emailData.from = cleanEmailAddress(emailData.from);
    emailData.to = cleanEmailAddress(emailData.to);

    return emailData;
  } catch (error) {
    console.error('[InboundEmail] Error parsing webhook data:', error);
    return null;
  }
}

/**
 * Extract thread ID from email headers
 */
function extractThreadId(body) {
  // Try to get thread ID from various sources
  const messageId = body.message_id || body['Message-ID'] || '';
  const inReplyTo = body.in_reply_to || body['In-Reply-To'] || '';
  const references = body.references || body['References'] || '';
  
  // Use In-Reply-To if available, otherwise use Message-ID
  if (inReplyTo) {
    return inReplyTo;
  }
  
  if (messageId) {
    return messageId;
  }
  
  // Generate a fallback thread ID
  return `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Clean email address string
 */
function cleanEmailAddress(email) {
  if (!email) return '';
  
  // Remove angle brackets and extra whitespace
  return email.replace(/[<>]/g, '').trim();
}

/**
 * Store incoming email in Firebase
 */
async function storeIncomingEmail(emailData) {
  try {
    const emailRecord = {
      ...emailData,
      id: `received_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'received',
      openCount: 0,
      replyCount: 0,
      opens: [],
      replies: []
    };

    // Store in Firebase
    const docRef = await addDoc(collection(db, 'emails'), emailRecord);
    console.log('[InboundEmail] Email stored in Firebase:', docRef.id);
    
    return docRef.id;
  } catch (error) {
    console.error('[InboundEmail] Error storing email in Firebase:', error);
    throw error;
  }
}

/**
 * Match incoming email to existing conversation
 */
async function matchToConversation(emailData) {
  try {
    // Look for existing emails with matching thread info
    const threadId = emailData.threadId;
    const inReplyTo = emailData.inReplyTo;
    const subject = emailData.subject;
    
    if (!threadId && !inReplyTo) {
      console.log('[InboundEmail] No thread info available for matching');
      return null;
    }

    // Search for existing emails in the same thread
    let queryConditions = [];
    
    if (threadId) {
      queryConditions.push(where('threadId', '==', threadId));
    }
    
    if (inReplyTo) {
      queryConditions.push(where('messageId', '==', inReplyTo));
    }
    
    // Also try matching by subject (for emails without proper threading)
    if (subject && subject.startsWith('Re:')) {
      const originalSubject = subject.replace(/^Re:\s*/i, '');
      queryConditions.push(where('subject', '==', originalSubject));
    }

    if (queryConditions.length === 0) {
      console.log('[InboundEmail] No query conditions available');
      return null;
    }

    // Build query (use the first condition for now, as Firestore doesn't support OR queries easily)
    const q = query(
      collection(db, 'emails'),
      queryConditions[0],
      orderBy('sentAt', 'desc'),
      limit(10)
    );

    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.log('[InboundEmail] No matching conversation found');
      return null;
    }

    // Find the most recent matching email
    let bestMatch = null;
    let bestScore = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      let score = 0;
      
      // Score based on thread matching
      if (threadId && data.threadId === threadId) score += 10;
      if (inReplyTo && data.messageId === inReplyTo) score += 10;
      if (data.inReplyTo === emailData.messageId) score += 10;
      
      // Score based on subject matching
      if (subject && data.subject) {
        const cleanSubject = subject.replace(/^Re:\s*/i, '');
        const cleanDataSubject = data.subject.replace(/^Re:\s*/i, '');
        if (cleanSubject === cleanDataSubject) score += 5;
      }
      
      // Score based on email address matching
      if (emailData.from && data.to && emailData.from === data.to) score += 3;
      if (emailData.to && data.from && emailData.to === data.from) score += 3;
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = data;
      }
    });

    if (bestMatch && bestScore >= 3) {
      console.log('[InboundEmail] Found conversation match:', bestMatch.id, 'Score:', bestScore);
      return bestMatch.id;
    }

    console.log('[InboundEmail] No suitable conversation match found');
    return null;

  } catch (error) {
    console.error('[InboundEmail] Error matching conversation:', error);
    return null;
  }
}
