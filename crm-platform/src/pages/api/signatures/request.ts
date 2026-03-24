import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase';
import crypto from 'crypto';
import { ZohoMailService } from '../email/zoho-service';
import {
  getSignatureRequestKindConfig,
  inferSignatureRequestKindFromDocument,
  normalizeSignatureRequestKind,
} from '@/lib/signature-request'

const SIGNATURE_EXPIRY_TIME_ZONE = 'America/Chicago';
const SIGNATURE_EXPIRY_HOUR = 16;

function getChicagoDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SIGNATURE_EXPIRY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || '0');

  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
    hour: getPart('hour')
  };
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const timeZoneName = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date).find((part) => part.type === 'timeZoneName')?.value || 'GMT+0';

  const match = timeZoneName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
  if (!match) return 0;

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] || '0');
  return sign * (hours * 60 + minutes);
}

function getNextFourPmChicagoIso(referenceDate = new Date()) {
  const chicago = getChicagoDateParts(referenceDate);
  const shouldUseTomorrow = chicago.hour >= SIGNATURE_EXPIRY_HOUR;
  const targetDateUtc = new Date(Date.UTC(
    chicago.year,
    chicago.month - 1,
    chicago.day + (shouldUseTomorrow ? 1 : 0)
  ));

  const targetLocalAsUtc = Date.UTC(
    targetDateUtc.getUTCFullYear(),
    targetDateUtc.getUTCMonth(),
    targetDateUtc.getUTCDate(),
    SIGNATURE_EXPIRY_HOUR,
    0,
    0,
    0
  );

  // Resolve zone offset at the target wall-clock time (handles DST shifts).
  let utcMillis = targetLocalAsUtc;
  for (let i = 0; i < 2; i += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcMillis), SIGNATURE_EXPIRY_TIME_ZONE);
    utcMillis = targetLocalAsUtc - offsetMinutes * 60 * 1000;
  }

  return new Date(utcMillis).toISOString();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { documentId, contactId, accountId, dealId, userEmail, message, signatureFields, documentKind } = req.body;

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

    const inferredKind = inferSignatureRequestKindFromDocument(
      document.document_type,
      document?.metadata?.ai_extraction?.type
    )
    const requestKind = normalizeSignatureRequestKind(documentKind ?? inferredKind)
    const kindConfig = getSignatureRequestKindConfig(requestKind)

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

    const expiresAt = getNextFourPmChicagoIso();
    const expiresAtDisplay = new Date(expiresAt).toLocaleString('en-US', {
      timeZone: SIGNATURE_EXPIRY_TIME_ZONE,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    });

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
        metadata: { agentEmail: userEmail, ownerId: userEmail, documentKind: requestKind },
        status: 'pending',
        expires_at: expiresAt
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
    const emailSubject = `Action Required: Your ${kindConfig.documentLabel} is Ready to Sign`;
    const emailMessage = message || `Please review and sign the following ${kindConfig.documentLabel.toLowerCase()} at your earliest convenience.`;
    const buttonLabel = `Review & Sign ${kindConfig.documentLabel}`;

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
          ${emailMessage}
        </p>

        <p style="font-family:sans-serif; font-size:13px; line-height:1.6; margin-bottom:24px; color:#a1a1aa;">
          This secure link expires at ${expiresAtDisplay} if not signed.
        </p>

        <div style="text-align:center; margin-bottom:32px;">
          <a href="${appBaseUrl}/api/signatures/telemetry?token=${token}&action=clicked&redirect=/secure-portal/sign/${token}"
            style="display:inline-block; background-color:#002fa7; color:white; padding:14px 32px; text-decoration:none; font-weight:bold; border-radius:4px; text-transform:uppercase; letter-spacing:0.08em; font-size:13px; font-family:monospace;">
            ${buttonLabel}
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
    const sentAt = new Date().toISOString();
    await supabaseAdmin.from('emails').insert({
      id: trackingId,
      contactId: contactId,
      accountId: accountId || null,
      ownerId: userEmail,
      from: userEmail,
      to: [contactEmail],
      subject: emailSubject,
      html: emailHtml,
      text: `Please review and sign the ${kindConfig.documentLabel.toLowerCase()} here: ${signingUrl}`,
      status: 'sent',
      type: 'sent',
      timestamp: sentAt,
      sentAt,
      createdAt: sentAt,
      updatedAt: sentAt,
      metadata: { isSignatureRequest: true, documentId, dealId, documentKind: requestKind }
    });

    // 7. Send via Zoho
    // authEmail: the account with stored Zoho OAuth tokens (always l.patterson).
    // fromEmail: display address shown to recipients.
    const authEmail = 'l.patterson@nodalpoint.io';
    const fromEmail = 'signal@nodalpoint.io';

    const zohoService = new ZohoMailService();
    await zohoService.initialize(authEmail);

    await zohoService.sendEmail({
      to: [contactEmail],
      subject: emailSubject,
      html: emailHtml,
      text: `Please review and sign the ${kindConfig.documentLabel.toLowerCase()} here: ${signingUrl}`,
      userEmail: authEmail,
      from: fromEmail,
      fromName: 'Nodal Point Secure Vault'
    });

    return res.status(200).json({ success: true, request: requestRecord });
  } catch (error: any) {
    console.error('[Signature Request API] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
