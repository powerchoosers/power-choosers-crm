/**
 * Power Choosers CRM - SendGrid Inbound Parse Webhook Handler
 * MINIMAL VERSION FOR DEBUGGING
 */

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  console.log('[InboundEmail] Received webhook from SendGrid');
  console.log('[InboundEmail] Headers:', req.headers);
  console.log('[InboundEmail] Method:', req.method);
  console.log('[InboundEmail] Body:', req.body);
  
  // Minimal response - just return 200 OK
  res.status(200).send('OK');
}