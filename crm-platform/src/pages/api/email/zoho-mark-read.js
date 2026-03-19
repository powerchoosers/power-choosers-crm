// Mark email(s) as read in Zoho Mail
import { cors } from '../_cors.js';
import logger from '../_logger.js';
import { getValidAccessTokenForUser } from './zoho-token-manager.js';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { emailId } = req.body;

    if (!emailId) {
      return res.status(400).json({ error: 'emailId is required' });
    }

    // Look up the email to get ownerId (the email address used for Zoho auth)
    const { data: email, error: fetchError } = await supabaseAdmin
      .from('emails')
      .select('id, ownerId, metadata')
      .eq('id', emailId)
      .single();

    if (fetchError || !email) {
      logger.warn(`[Zoho Mark Read] Email not found: ${emailId}`, 'zoho-mark-read');
      return res.status(404).json({ error: 'Email not found' });
    }

    const ownerEmail = email.ownerId || email.metadata?.ownerId;
    if (!ownerEmail) {
      logger.warn(`[Zoho Mark Read] No ownerEmail for email: ${emailId}`, 'zoho-mark-read');
      return res.status(400).json({ error: 'No owner email found for this email' });
    }

    // Get Zoho access token and account ID
    const { accessToken, accountId } = await getValidAccessTokenForUser(ownerEmail);

    if (!accessToken || !accountId) {
      logger.warn(`[Zoho Mark Read] No Zoho credentials for ${ownerEmail}`, 'zoho-mark-read');
      return res.status(500).json({ error: 'Unable to get Zoho credentials' });
    }

    // Call Zoho API to mark as read
    // The email ID in our DB is the Zoho message ID
    const zohoUrl = `https://mail.zoho.com/api/accounts/${accountId}/updatemessage`;

    const zohoRes = await fetch(zohoUrl, {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
      },
      body: JSON.stringify({
        mode: 'markAsRead',
        messageId: [emailId],
      }),
    });

    if (!zohoRes.ok) {
      const errorText = await zohoRes.text();
      logger.error(`[Zoho Mark Read] Zoho API error: ${zohoRes.status} - ${errorText}`, 'zoho-mark-read');
      return res.status(502).json({ error: 'Zoho API error', detail: errorText });
    }

    const result = await zohoRes.json();
    logger.info(`[Zoho Mark Read] Marked ${emailId} as read in Zoho`, 'zoho-mark-read');

    return res.status(200).json({ success: true, zoho: result });
  } catch (err) {
    logger.error(`[Zoho Mark Read] Error:`, err, 'zoho-mark-read');
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
