// Track email performance metrics for AI optimization
// Expects POST { emailId, recipientEmail, subjectStyle, ctaType, openingStyle, timestamp, event }

function cors(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://powerchoosers.com',
    'https://www.powerchoosers.com',
    'https://power-choosers-crm.vercel.app'
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
    res.status(204).end();
    return true;
  }
  return false;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
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
    return res.status(200).json({ ok: true, tracked: true });
  } catch (e) {
    console.error('[Tracking Error]', e);
    return res.status(500).json({ error: 'Failed to track event' });
  }
}


