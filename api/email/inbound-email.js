/**
 * Power Choosers CRM - SendGrid Inbound Parse Webhook Handler
 * FIXED VERSION - Parses multipart data and saves to Firebase
 */

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import crypto from 'crypto';
const formidable = require('formidable');

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

    // Extract email data from SendGrid fields with validation
    const emailData = {
      from: fields.from || fields.sender || '',
      to: fields.to || fields.recipient || '',
      subject: fields.subject || '',
      text: fields.text || fields.text_plain || '',
      html: fields.html || fields.text_html || '',
      messageId: fields.message_id || fields['Message-ID'] || '',
      receivedAt: new Date().toISOString(),
      type: 'received',
      provider: 'sendgrid_inbound'
    };

    // Validate required fields
    if (!emailData.from || !emailData.to || !emailData.subject) {
      console.error('[InboundEmail] Missing required fields:', { from: emailData.from, to: emailData.to, subject: emailData.subject });
      return res.status(400).json({ error: 'Missing required email fields' });
    }

    console.log('[InboundEmail] Extracted email data:', emailData);

    // Save to Firebase with proper error handling
    try {
      const emailDoc = {
        ...emailData,
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