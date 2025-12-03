// Track email performance metrics for AI optimization
// Expects POST { emailId, recipientEmail, subjectStyle, ctaType, openingStyle, timestamp, event }
import logger from './_logger.js';

function cors(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://powerchoosers.com',
    'https://www.powerchoosers.com',
    'https://power-choosers-crm-792458658491.us-south1.run.app'
  ];
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
res.writeHead(200);
res.writeHead(200);
res.writeHead(200);
res.writeHead(200);
res.writeHead(200);
res.writeHead(200);
res.writeHead(200);
res.end();
return;
return;
return;
return;
return;
return;
return;
return;
    return true;
  }
  return false;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.writeHead(405, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Method not allowed' }));
return;
  
  try {
    const { 
      emailId,
      recipientEmail,
      subjectStyle,
      ctaType,
      openingStyle,
      timestamp,
      event // 'sent', 'opened', 'replied', 'bounced'
    } = req.body;
    
    // Store tracking data (can be enhanced to store in Firebase or analytics service)
    
    // TODO: Store in Firebase Firestore for future analysis
    // Example structure:
    // collection: 'email_performance'
    // document: emailId
    // fields: { subject_style, cta_type, opening_style, events: [{ event, timestamp }] }
    
    // Return success
    return res.writeHead(200, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ ok: true, tracked: true }));
return;
  } catch (e) {
    logger.error('[Tracking Error]', e);
    return res.writeHead(500, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Failed to track event' }));
return;
  }
}


