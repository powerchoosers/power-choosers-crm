/**
 * Power Choosers CRM - SendGrid Inbound Parse Webhook Handler
 * MINIMAL VERSION FOR DEBUGGING
 */

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  console.log('[InboundEmail] === WEBHOOK CALLED ===');
  console.log('[InboundEmail] Timestamp:', new Date().toISOString());
  console.log('[InboundEmail] Method:', req.method);
  console.log('[InboundEmail] Headers:', JSON.stringify(req.headers, null, 2));
  console.log('[InboundEmail] User-Agent:', req.headers['user-agent']);
  console.log('[InboundEmail] Content-Type:', req.headers['content-type']);
  console.log('[InboundEmail] Body:', req.body);
  console.log('[InboundEmail] Body type:', typeof req.body);
  console.log('[InboundEmail] Body length:', req.body ? req.body.length : 0);
  
  // Check if this is from SendGrid
  const userAgent = req.headers['user-agent'] || '';
  const isFromSendGrid = userAgent.includes('SendGrid');
  console.log('[InboundEmail] Is from SendGrid:', isFromSendGrid);
  
  // Minimal response - just return 200 OK
  res.status(200).send('OK');
}