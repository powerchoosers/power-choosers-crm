import { supabaseAdmin } from '@/lib/supabase';
import { cors } from '../_cors.js';
import logger from '../_logger.js';
import { ZohoMailService } from './zoho-service.js';
import { resolveUserRole } from '@/lib/auth/roles';

// preference type → suppression reason label
const REASON_MAP = {
  permanent: 'unsubscribed',
  pause_90:  'paused_90_days',
  spike_only: 'spike_only',
};

const ALERT_AUTH_EMAIL = 'l.patterson@nodalpoint.io';
const ALERT_FROM_EMAIL = 'signal@nodalpoint.io';

function normalizeToPrimaryLoginEmail(email) {
  const normalized = String(email || '').toLowerCase().trim();
  if (!normalized) return '';
  if (normalized.endsWith('@getnodalpoint.com')) {
    return normalized.replace('@getnodalpoint.com', '@nodalpoint.io');
  }
  return normalized;
}

async function resolveAlertRecipientsForUnsubscribe(targetEmail) {
  const recipients = new Set([ALERT_AUTH_EMAIL]);
  const normalizedTarget = String(targetEmail || '').toLowerCase().trim();

  // 1) Include known admins (today backed by isUserAdmin; easy to extend later).
  try {
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('email, settings');

    (users || []).forEach((u) => {
      const email = normalizeToPrimaryLoginEmail(u?.email);
      if (email && resolveUserRole(u?.settings, email) === 'admin') recipients.add(email);
    });
  } catch (error) {
    logger.warn('[Unsubscribe] Failed to resolve admin recipients:', error?.message || error);
  }

  // 2) Include owning agents for matching contact(s), mapped to their login domain.
  try {
    const { data: contacts } = await supabaseAdmin
      .from('contacts')
      .select('id, ownerId')
      .ilike('email', normalizedTarget);

    const ownerIds = Array.from(new Set((contacts || []).map((c) => c?.ownerId).filter(Boolean)));
    if (ownerIds.length > 0) {
      const { data: owners } = await supabaseAdmin
        .from('users')
        .select('id, email')
        .in('id', ownerIds);

      (owners || []).forEach((owner) => {
        const ownerEmail = normalizeToPrimaryLoginEmail(owner?.email);
        if (ownerEmail) recipients.add(ownerEmail);
      });
    }
  } catch (error) {
    logger.warn('[Unsubscribe] Failed to resolve agent recipients:', error?.message || error);
  }

  return Array.from(recipients);
}

async function sendUnsubscribeAlert({ email, preferenceType, pauseUntil, updatedContactsCount, pausedSequences, now }) {
  try {
    const zohoService = new ZohoMailService();
    const initialized = await zohoService.initialize(ALERT_AUTH_EMAIL);
    if (!initialized) {
      logger.warn('[Unsubscribe] Alert email skipped: Zoho init failed');
      return false;
    }

    const recipients = await resolveAlertRecipientsForUnsubscribe(email);
    if (recipients.length === 0) {
      logger.warn('[Unsubscribe] Alert email skipped: no recipients resolved');
      return false;
    }

    const subject = `Unsubscribe preference: ${preferenceType} (${email})`;
    const html = `
      <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827;">
        <p><strong>Unsubscribe preference submitted</strong></p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Preference:</strong> ${preferenceType}</p>
        ${pauseUntil ? `<p><strong>Pause Until:</strong> ${pauseUntil}</p>` : ''}
        <p><strong>Contacts Updated:</strong> ${updatedContactsCount}</p>
        <p><strong>Sequence Members Updated:</strong> ${pausedSequences}</p>
        <p><strong>Alert Recipients:</strong> ${recipients.join(', ')}</p>
        <p><strong>Timestamp (UTC):</strong> ${now}</p>
      </div>
    `;

    await zohoService.sendEmail({
      to: recipients,
      subject,
      html,
      userEmail: ALERT_AUTH_EMAIL,
      from: ALERT_FROM_EMAIL,
      fromName: 'Nodal Point Signal'
    });

    logger.log(`[Unsubscribe] Alert email sent for ${email} to: ${recipients.join(', ')}`);
    return true;
  } catch (error) {
    logger.error('[Unsubscribe] Failed to send alert email:', error);
    return false;
  }
}

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const { email, type = 'permanent' } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();

    if (!normalizedEmail) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Email address is required' }));
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid email address' }));
      return;
    }

    const validTypes = ['permanent', 'pause_90', 'spike_only'];
    const preferenceType = validTypes.includes(type) ? type : 'permanent';

    logger.log(`[Unsubscribe] Processing "${preferenceType}" preference for: ${normalizedEmail}`);

    if (!supabaseAdmin) {
      logger.error('[Unsubscribe] Supabase client not initialized');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
      return;
    }

    const now = new Date().toISOString();
    const pauseUntil = preferenceType === 'pause_90'
      ? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // 1. Suppressions table
    //    permanent + spike_only → add suppression record
    //    pause_90 → add with expiry metadata; we use reason='paused_90_days' so the suppression
    //    check in the sequence edge function can distinguish it from permanent removes.
    if (preferenceType !== 'spike_only') {
      const { error: suppressionError } = await supabaseAdmin
        .from('suppressions')
        .upsert({
          id: normalizedEmail,
          reason: REASON_MAP[preferenceType],
          details: preferenceType === 'pause_90'
            ? `Pause requested via unsubscribe page. Resume after ${pauseUntil}`
            : 'User removed via unsubscribe page',
          source: 'web_form',
          suppressedAt: now,
          createdAt: now,
        });

      if (suppressionError) {
        logger.error('[Unsubscribe] Error writing suppression:', suppressionError);
      }
    }

    // 2. Update contact metadata
    let updatedContactsCount = 0;
    try {
      const { data: contacts, error: fetchError } = await supabaseAdmin
        .from('contacts')
        .select('id, metadata')
        .ilike('email', normalizedEmail);

      if (fetchError) throw fetchError;

      if (contacts && contacts.length > 0) {
        for (const contact of contacts) {
          const currentMeta = contact.metadata || {};
          const metaPatch = preferenceType === 'permanent'
            ? { emailStatus: 'unsubscribed', emailSuppressed: true, suppressionReason: 'unsubscribed', suppressedAt: now }
            : preferenceType === 'pause_90'
            ? { emailStatus: 'paused', emailPausedUntil: pauseUntil, suppressionReason: 'pause_90', suppressedAt: now }
            : { emailStatus: 'spike_only', emailPreference: 'spike_only', preferenceSetAt: now };

          const { error: updateError } = await supabaseAdmin
            .from('contacts')
            .update({ metadata: { ...currentMeta, ...metaPatch, updatedAt: now }, updatedAt: now })
            .eq('id', contact.id);

          if (!updateError) updatedContactsCount++;
          else logger.error(`[Unsubscribe] Failed to update contact ${contact.id}:`, updateError);
        }
        logger.log(`[Unsubscribe] Updated ${updatedContactsCount} contact(s) for ${normalizedEmail}`);
      }
    } catch (err) {
      logger.error('[Unsubscribe] Error updating contacts:', err);
    }

    // 3. Sequence members — always skip email steps regardless of preference type.
    //    For pause_90, the sequence engine will re-evaluate when the suppression expires.
    //    For spike_only, the engine should skip standard cadence but can still send spike alerts.
    let pausedSequences = 0;
    try {
      const { data: matchingContacts } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .ilike('email', normalizedEmail);

      if (matchingContacts && matchingContacts.length > 0) {
        const contactIds = matchingContacts.map(c => c.id);
        const { error: seqError } = await supabaseAdmin
          .from('sequence_members')
          .update({ skipEmailSteps: true, updatedAt: now })
          .in('targetId', contactIds);

        if (seqError) {
          logger.error('[Unsubscribe] Error pausing sequences:', seqError);
        } else {
          pausedSequences = contactIds.length;
          logger.log(`[Unsubscribe] Paused sequences for ${contactIds.length} contact(s)`);
        }
      }
    } catch (seqErr) {
      logger.error('[Unsubscribe] Error during sequence pausing:', seqErr);
    }

    const alertSent = await sendUnsubscribeAlert({
      email: normalizedEmail,
      preferenceType,
      pauseUntil,
      updatedContactsCount,
      pausedSequences,
      now
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      type: preferenceType,
      email: normalizedEmail,
      pausedSequences,
      alertSent,
    }));

  } catch (error) {
    logger.error('[Unsubscribe] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to process preference', message: error.message }));
  }
}
