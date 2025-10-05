/**
 * Power Choosers CRM - SendGrid Inbound Parse Webhook Handler
 * FIXED VERSION - Parses multipart data and saves to Firebase
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';
import formidable from 'formidable';

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

    // Extract email data from SendGrid fields
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

    console.log('[InboundEmail] Extracted email data:', emailData);

    // Save to Firebase
    const emailDoc = {
      ...emailData,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const docRef = await addDoc(collection(db, 'emails'), emailDoc);
    console.log('[InboundEmail] Email saved to Firebase with ID:', docRef.id);

    // Return success response
    return res.status(200).json({ 
      success: true, 
      emailId: docRef.id,
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