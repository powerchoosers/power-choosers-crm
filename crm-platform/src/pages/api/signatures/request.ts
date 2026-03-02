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
    // 1. Fetch contact and document info to customize the email
    const [{ data: contact, error: contactError }, { data: document, error: docError }] = await Promise.all([
      supabaseAdmin.from('contacts').select('*').eq('id', contactId).single(),
      supabaseAdmin.from('documents').select('*').eq('id', documentId).single()
    ]);

    if (contactError || !contact) throw new Error(`Contact not found: ${contactError?.message}`);
    if (docError || !document) throw new Error(`Document not found: ${docError?.message}`);

    const contactEmail = contact.email;
    if (!contactEmail) throw new Error('Contact has no email address');

    // 2. Idempotency — reject if an active request already exists for this doc + contact
    const { data: existingRequest } = await supabaseAdmin
      .from('signature_requests')
      .select('id')
      .eq('document_id', documentId)
      .eq('contact_id', contactId)
      .not('status', 'in', '(completed,declined)')
      .maybeSingle();

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
        // Signing links expire after 30 days
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      })
      .select()
      .single();

    if (insertError) throw new Error(`Failed to create signature request: ${insertError.message}`);

    // Update the deal stage to OUT_FOR_SIGNATURE if a deal is attached
    if (dealId) {
      await supabaseAdmin.from('deals').update({ stage: 'OUT_FOR_SIGNATURE' }).eq('id', dealId);
    }

    // 4. Construct the signing URL
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nodalpoint.io';
    const signingUrl = `${appBaseUrl}/secure-portal/sign/${token}`;

    // 5. Build the email template (dark mode/forensic aesthetic)
    const trackingId = `sig_${Date.now()}_${token.substring(0, 8)}`;
    const emailHtml = `
      <div style="font-family: monospace; background-color: #09090b; color: #f4f4f5; padding: 40px; border: 1px solid #27272a; max-width: 600px; margin: 0 auto;">
        <h2 style="text-transform: uppercase; letter-spacing: 0.1em; color: #a1a1aa; font-size: 14px; margin-bottom: 24px; border-bottom: 1px solid #27272a; padding-bottom: 12px;">
          Nodal Point Digital Signature Request
        </h2>
        
        <p style="font-family: sans-serif; font-size: 15px; margin-bottom: 20px;">
          Hello ${contact.firstName || contact.name || ''},
        </p>
        
        <p style="font-family: sans-serif; font-size: 15px; margin-bottom: 24px;">
          ${message || 'Please review and execute the following document.'}
        </p>
        
        <div style="background-color: #18181b; padding: 16px; border: 1px solid #27272a; border-radius: 4px; margin-bottom: 32px;">
          <div style="font-size: 12px; color: #a1a1aa; text-transform: uppercase; tracking: 0.1em; margin-bottom: 4px;">Document</div>
          <div style="font-size: 16px;">${document.name}</div>
        </div>
        
        <a href="${appBaseUrl}/api/signatures/telemetry?token=${token}&action=opened&redirect=/secure-portal/sign/${token}" style="display: inline-block; background-color: #002fa7; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.05em; font-size: 14px;">
          Review & Execute Document
        </a>

        <div style="margin-top: 40px; font-size: 11px; color: #52525b; border-top: 1px solid #27272a; padding-top: 16px;">
          This is a secure, tamper-evident signing link. Your IP address and network telemetry will be recorded upon access for audit trail purposes. Do not forward this email.
        </div>
        <img src="${appBaseUrl}/api/signatures/telemetry?token=${token}&action=opened" width="1" height="1" alt="" style="display:none;" />
      </div>
    `;

    // 6. Record the email in the Supabase 'emails' table for CRM visibility
    const emailRecord = {
      id: trackingId,
      contactId: contactId,
      accountId: accountId || null,
      ownerId: userEmail,
      from: userEmail,
      to: [contactEmail],
      subject: `Signature Request: ${document.name}`,
      html: emailHtml,
      text: `Please review and sign the document here: ${signingUrl}`,
      status: 'sent',
      type: 'sent',
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        isSignatureRequest: true,
        documentId,
        dealId
      }
    };

    await supabaseAdmin.from('emails').insert(emailRecord);

    // 7. Send the email via Zoho
    const zohoService = new ZohoMailService();
    // Assuming Zoho is configured and ready. We use userEmail as the "from" or owner depending on what zoho expects
    await zohoService.initialize(userEmail);

    await zohoService.sendEmail({
      to: [contactEmail],
      subject: `Signature Request: ${document.name}`,
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
