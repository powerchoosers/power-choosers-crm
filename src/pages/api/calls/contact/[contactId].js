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

    const { contactId } = req.query;
    if (!contactId) {
      res.status(400).json({ error: 'Contact ID is required' });
      return;
    }

    const limit = parseInt(req.query.limit) || 50;

    // 1. Get contact data (phones)
    const { data: contact, error: contactError } = await supabaseAdmin
      .from('contacts')
      .select('id, mobile, workPhone, otherPhone, accountId')
      .eq('id', contactId)
      .single();

    if (contactError || !contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    const contactPhones = new Set();
    if (contact.mobile) contactPhones.add(normalizePhone(contact.mobile));
    if (contact.workPhone) contactPhones.add(normalizePhone(contact.workPhone));
    if (contact.otherPhone) contactPhones.add(normalizePhone(contact.otherPhone));

    // 2. Query calls from Supabase
    let callsQuery = supabaseAdmin
      .from('calls')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);

    const orConditions = [`contactId.eq.${contactId}`];

    if (contactPhones.size > 0) {
      const phones = Array.from(contactPhones);
      phones.forEach(p => {
        orConditions.push(`from.ilike.%${p}`);
        orConditions.push(`to.ilike.%${p}`);
      });
    }

    callsQuery = callsQuery.or(orConditions.join(','));

    const { data: calls, error: callsError } = await callsQuery;

    if (callsError) {
      logger.error('[Contact Calls API] Supabase error:', callsError);
      throw callsError;
    }

    let filteredCalls = calls || [];

    // 3. Enforce ownership on server side for non-admins
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
      contactId: contactId
    });

  } catch (error) {
    logger.error('[Contact Calls API] Error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

