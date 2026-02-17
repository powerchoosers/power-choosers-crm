import { cors } from '../../_cors.js';
import { supabaseAdmin, requireUser } from '@/lib/supabase';
import logger from '../../_logger.js';

// Normalize phone number to last 10 digits
function normalizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '').slice(-10);
}

const ADMIN_EMAIL = 'l.patterson@nodalpoint.io';

// Derive outcome from call status and duration
function deriveOutcome(call) {
  const status = (call.status || '').toLowerCase();
  const duration = call.duration || 0;
  const answeredBy = (call.metadata?.answeredBy || '').toLowerCase();

  // If we have an explicit outcome, use it
  if (call.metadata?.outcome) return call.metadata.outcome;

  // Derive from status
  if (status === 'completed') {
    if (answeredBy.includes('machine')) return 'Voicemail';
    return duration > 0 ? 'Connected' : 'No Answer';
  }

  if (status === 'no-answer' || status === 'no_answer') return 'No Answer';
  if (status === 'busy') return 'Busy';
  if (status === 'failed') return 'Failed';
  if (status === 'canceled' || status === 'cancelled') return 'Canceled';

  return status ? status.charAt(0).toUpperCase() + status.slice(1) : '';
}

function normalizeCallForResponse(call) {
  // Normalize to the shape expected by front-end pages
  return {
    id: call.id || call.callSid || '',
    callSid: call.callSid || call.id || '',
    twilioSid: call.callSid || call.id || '',
    to: call.to || '',
    from: call.from || '',
    status: call.status || '',
    duration: call.duration || 0,
    timestamp: call.timestamp || call.createdAt || new Date().toISOString(),
    callTime: call.timestamp || call.createdAt || new Date().toISOString(),
    durationSec: call.duration || 0,
    outcome: deriveOutcome(call),
    transcript: call.transcript || '',
    formattedTranscript: call.metadata?.formatted_transcript || '',
    aiSummary: call.summary || '',
    aiInsights: call.aiInsights || null,
    audioUrl: call.recordingUrl || '',
    conversationalIntelligence: call.aiInsights?.conversationalIntelligence || null,
    recordingSid: call.metadata?.recordingSid || '',
    targetPhone: call.metadata?.targetPhone || '',
    businessPhone: call.metadata?.businessPhone || '',
    recordingChannels: call.metadata?.recordingChannels || '',
    recordingTrack: call.metadata?.recordingTrack || '',
    recordingSource: call.metadata?.recordingSource || '',
    accountId: call.accountId || '',
    accountName: call.metadata?.accountName || '',
    contactId: call.contactId || '',
    contactName: call.metadata?.contactName || ''
  };
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // AuthN: require a valid session via Supabase
    const { email: userEmail, user } = await requireUser(req);
    if (!userEmail) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const isAdmin = userEmail === ADMIN_EMAIL;

    const { accountId } = req.query;
    if (!accountId) {
      res.status(400).json({ error: 'Account ID is required' });
      return;
    }

    const limit = parseInt(req.query.limit) || 50;

    // 1. Get account data (phones)
    const { data: account, error: accountError } = await supabaseAdmin
      .from('accounts')
      .select('phone, metadata')
      .eq('id', accountId)
      .single();

    if (accountError || !account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const companyPhone = normalizePhone(account.phone);

    // 2. Get related contacts for this account
    const { data: contacts, error: contactsError } = await supabaseAdmin
      .from('contacts')
      .select('id, mobile, workPhone, otherPhone')
      .eq('accountId', accountId);

    const contactIds = contacts?.map(c => c.id) || [];
    const contactPhones = new Set();
    if (companyPhone) contactPhones.add(companyPhone);

    contacts?.forEach(c => {
      if (c.mobile) contactPhones.add(normalizePhone(c.mobile));
      if (c.workPhone) contactPhones.add(normalizePhone(c.workPhone));
      if (c.otherPhone) contactPhones.add(normalizePhone(c.otherPhone));
    });

    // 3. Query calls from Supabase
    // We want calls where:
    // - accountId matches
    // - OR contactId is in contactIds
    // - OR from/to matches any contactPhones (or company phone)

    let callsQuery = supabaseAdmin
      .from('calls')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);

    // Build the OR filter
    const orConditions = [`accountId.eq.${accountId}`];
    if (contactIds.length > 0) {
      orConditions.push(`contactId.in.(${contactIds.join(',')})`);
    }

    if (contactPhones.size > 0) {
      const phones = Array.from(contactPhones);
      phones.forEach(p => {
        orConditions.push(`from.ilike.%${p}`);
        orConditions.push(`to.ilike.%${p}`);
      });
    }

    // Supabase .or() can be tricky with many conditions, we'll limit the phone filters if they are too many
    // or just rely on IDs if possible. But for accuracy we need both.
    const finalOr = orConditions.slice(0, 50).join(','); // Limit to 50 filters to avoid URL length issues
    callsQuery = callsQuery.or(finalOr);

    const { data: calls, error: callsError } = await callsQuery;

    if (callsError) {
      logger.error('[Account Calls API] Supabase error:', callsError);
      throw callsError;
    }

    let filteredCalls = calls || [];

    // 4. Enforce ownership on server side for non-admins
    if (!isAdmin) {
      const ui = user.id; // Supabase UUID
      filteredCalls = filteredCalls.filter(c => {
        const o = c.ownerId || '';
        const a = c.assignedTo || '';
        const cr = c.createdBy || '';
        const mOwner = c.metadata?.ownerId || '';
        return o === ui || a === ui || cr === ui || mOwner === ui;
      });
    }

    const finalCalls = filteredCalls.map(normalizeCallForResponse);

    res.status(200).json({
      ok: true,
      calls: finalCalls,
      total: finalCalls.length,
      accountId: accountId
    });

  } catch (error) {
    logger.error('[Account Calls API] Error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

