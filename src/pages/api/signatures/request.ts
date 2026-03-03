import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase';
import crypto from 'crypto';
import { ZohoMailService } from '../email/zoho-service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { documentId, contactId, accountId, dealId, userEmail, message, signatureFields } = req.body;

  if (!documentId || !contactId || !userEmail) {
    return res.status(400).json({ error: 'Missing required parameters: documentId, contactId, userEmail' });
  }

  try {
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nodalpoint.io';
    const logoUrl = `${appBaseUrl}/images/nodalpoint-webicon.png`;

    // 1. Fetch contact, document, and sending agent in parallel
    const [
      { data: contact, error: contactError },
      { data: document, error: docError },
      { data: agentUser }
    ] = await Promise.all([
      supabaseAdmin.from('contacts').select('*').eq('id', contactId).single(),
      supabaseAdmin.from('documents').select('*').eq('id', documentId).single(),
      supabaseAdmin.from('users').select('first_name, last_name').eq('email', userEmail).maybeSingle()
    ]);

    if (contactError || !contact) throw new Error(`Contact not found: ${contactError?.message}`);
    if (docError || !document) throw new Error(`Document not found: ${docError?.message}`);

    const contactEmail = contact.email;
    if (!contactEmail) throw new Error('Contact has no email address');

    const agentFirstName = agentUser?.first_name || 'your advisor';

    // 2. Idempotency — reject if an active, non-expired request already exists.
    const now = new Date().toISOString();
    let idempotencyQuery = supabaseAdmin
      .from('signature_requests')
      .select('id')
      .eq('document_id', documentId)
      .eq('contact_id', contactId)
      .not('status', 'in', '(completed,declined,signed)')
      .or(`expires_at.is.null,expires_at.gt.${now}`);

    if (dealId) {
      idempotencyQuery = idempotencyQuery.eq('deal_id', dealId);
    }

    const { data: existingRequest } = await idempotencyQuery.maybeSingle();

    if (existingRequest) {
      return res.status(409).json({ error: 'An active signature request already exists for this document and contact.' });
    }

    // 3. Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex');

    // 4. Create the signature request record
    const { data: requestRecord, error: insertError } = await supabaseAdmin
      .from('signature_requests')
      .insert({
        document_id: documentId,
        contact_id: contactId,
        account_id: accountId || null,
        deal_id: dealId || null,
        access_token: token,
        signature_fields: signatureFields || [],
        metadata: { agentEmail: userEmail },
        status: 'pending',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      })
      .select()
      .single();

    if (insertError) throw new Error(`Failed to create signature request: ${insertError.message}`);

    if (dealId) {
      await supabaseAdmin.from('deals').update({ stage: 'OUT_FOR_SIGNATURE' }).eq('id', dealId);
    }

    // 5. Construct signing URL + email
    const signingUrl = `${appBaseUrl}/secure-portal/sign/${token}`;
    const trackingId = `sig_${Date.now()}_${token.substring(0, 8)}`;
    const emailSubject = `Action Required: Your Energy Agreement is Ready to Sign`;

    const emailHeader = `
      <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px; padding-bottom:20px; border-bottom:1px solid #27272a; width:100%;">
        <tr>
          <td style="width:44px; vertical-align:middle; padding-right:12px;">
            <img src="${logoUrl}" alt="Nodal Point" width="36" height="36" style="display:block; border-radius:6px;" />
          </td>
          <td style="vertical-align:middle;">
            <span style="font-family:monospace; font-size:12px; letter-spacing:0.15em; color:#a1a1aa; text-transform:uppercase;">Nodal Point</span>
          </td>
        </tr>
      </table>
    `;

    const emailHtml = `
      <div style="font-family:monospace; background-color:#09090b; color:#f4f4f5; padding:40px; border:1px solid #27272a; max-width:600px; margin:0 auto;">
        ${emailHeader}

        <p style="font-family:sans-serif; font-size:15px; line-height:1.6; margin-bottom:16px; margin-top:0; color:#f4f4f5;">
          Hello ${contact.firstName || contact.name || ''},
        </p>

        <p style="font-family:sans-serif; font-size:15px; line-height:1.6; margin-bottom:32px; color:#f4f4f5;">
          ${message || 'Please review and sign the following document at your earliest convenience.'}
        </p>

        <div style="text-align:center; margin-bottom:32px;">
          <a href="${appBaseUrl}/api/signatures/telemetry?token=${token}&action=opened&redirect=/secure-portal/sign/${token}"
            style="display:inline-block; background-color:#002fa7; color:white; padding:14px 32px; text-decoration:none; font-weight:bold; border-radius:4px; text-transform:uppercase; letter-spacing:0.08em; font-size:13px; font-family:monospace;">
            Review &amp; Sign Document
          </a>
        </div>

        <p style="font-family:sans-serif; font-size:14px; line-height:1.6; color:#a1a1aa; margin-bottom:0;">
          Your advisor, ${agentFirstName}
        </p>

        <div style="margin-top:40px; font-size:11px; color:#52525b; border-top:1px solid #27272a; padding-top:16px; font-family:monospace;">
          This is a secure, tamper-evident signing link. For security purposes, do not forward this email.
        </div>
        <img src="${appBaseUrl}/api/signatures/telemetry?token=${token}&action=opened" width="1" height="1" alt="" style="display:none;" />
      </div>
    `;

    // 6. Log email to CRM
    await supabaseAdmin.from('emails').insert({
      id: trackingId,
      contactId: contactId,
      accountId: accountId || null,
      ownerId: userEmail,
      from: userEmail,
      to: [contactEmail],
      subject: emailSubject,
      html: emailHtml,
      text: `Please review and sign the document here: ${signingUrl}`,
      status: 'sent',
      type: 'sent',
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { isSignatureRequest: true, documentId, dealId }
    });

    // 7. Send via Zoho
    const zohoService = new ZohoMailService();
    await zohoService.initialize(userEmail);

    await zohoService.sendEmail({
      to: [contactEmail],
      subject: emailSubject,
      html: emailHtml,
      text: `Please review and sign the document here: ${signingUrl}`,
      userEmail: userEmail,
      fromName: 'Nodal Point Secure Vault'
    });

    return res.status(200).json({ success: true, request: requestRecord });
  } catch (error: any) {
    console.error('[Signature Request API] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
