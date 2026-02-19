import twilio from 'twilio';
import logger from '../_logger.js';
const VoiceResponse = twilio.twiml.VoiceResponse;

const DEFAULT_TWILIO_BUSINESS_NUMBER = '+18176630380';
const INCOMING_NUMBERS_CACHE_TTL = 5 * 60 * 1000;
let inboundNumbersCache = [];
let inboundNumbersCacheUpdatedAt = 0;

function normalizePhoneNumber(value) {
    if (!value) return null;
    const str = String(value).trim();
    if (!str) return null;
    const cleaned = str.replace(/\D/g, '');
    if (cleaned.length === 10) return `+1${cleaned}`;
    if (cleaned.length === 11 && cleaned.startsWith('1')) return `+${cleaned}`;
    if (str.startsWith('+')) return str.replace(/\s+/g, '');
    return null;
}

function digitsOnly(value) {
    return (value || '').toString().replace(/\D/g, '');
}

function parseNumberList(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value.map(normalizePhoneNumber).filter(Boolean);
    }
    return value
        .toString()
        .split(/[\s,;|]+/)
        .map(normalizePhoneNumber)
        .filter(Boolean);
}

async function getTwilioIncomingNumbersList() {
    const now = Date.now();
    if (inboundNumbersCacheUpdatedAt && now - inboundNumbersCacheUpdatedAt < INCOMING_NUMBERS_CACHE_TTL && inboundNumbersCache.length) {
        return inboundNumbersCache;
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
        return inboundNumbersCache;
    }

    try {
        const client = twilio(accountSid, authToken);
        const list = await client.incomingPhoneNumbers.list({ limit: 1000 });
        inboundNumbersCache = list
            .map((num) => normalizePhoneNumber(num.phoneNumber))
            .filter(Boolean);
        inboundNumbersCacheUpdatedAt = now;
    } catch (error) {
        logger.error('[Voice] Unable to refresh incoming numbers list:', error?.message || error);
    }

    return inboundNumbersCache;
}

async function resolveInboundPhoneNumbers() {
    const fetched = await getTwilioIncomingNumbersList();
    const candidates = [
        ...fetched,
        ...parseNumberList(process.env.TWILIO_PHONE_NUMBERS),
        ...parseNumberList(process.env.TWILIO_INBOUND_NUMBERS),
        ...parseNumberList(process.env.TWILIO_INBOUND_PHONE_NUMBERS),
        ...parseNumberList(process.env.TWILIO_NUMBERS),
        normalizePhoneNumber(process.env.TWILIO_PHONE_NUMBER),
        normalizePhoneNumber(process.env.TWILIO_BUSINESS_NUMBER),
        DEFAULT_TWILIO_BUSINESS_NUMBER
    ].filter(Boolean);

    const unique = [];
    const seen = new Set();
    candidates.forEach((candidate) => {
        if (!seen.has(candidate)) {
            seen.add(candidate);
            unique.push(candidate);
        }
    });
    return unique;
}

export default async function handler(req, res) {
    // Allow GET or POST (Twilio Console may be configured for either)
    if (req.method !== 'POST' && req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }

    try {
        // Read params from body (POST) or query (GET)
        const body = req.body || {};
        const query = req.query || {};
        const src = { ...query, ...body };

        logger.log('[Voice Webhook] RAW SRC:', JSON.stringify(src));

        // LOOP DETECTION: Check if this request is a fallback from a previous error
        if (src.ErrorCode || src.ErrorUrl) {
            logger.warn(`[Voice] Fallback loop detected! ErrorCode: ${src.ErrorCode}, ErrorUrl: ${src.ErrorUrl}`);
            const twiml = new VoiceResponse();
            twiml.say('An application error occurred. Goodbye.');
            twiml.hangup();
            res.setHeader('Content-Type', 'text/xml');
            res.writeHead(200);
            res.end(twiml.toString());
            return;
        }

        const CallSid = src.CallSid || '';
        const RawFrom = src.From || '';
        const RawTo = src.To || '';
        // Authoritative call direction from Twilio (per Twilio Support):
        //   'inbound'      → PSTN caller dialing our Twilio number
        //   'outbound-api' → Twilio JS SDK browser-originated call
        const Direction = (src.Direction || src.direction || '').toLowerCase();

        // ---- CRITICAL: Destination resolution ----
        // For browser-originated calls (Direction: outbound-api):
        //   - 'To' = the TwiML App SID (APxxxxxx) — NOT the dialed number
        //   - The actual destination is in our custom param: 'targetNumber'
        // For inbound PSTN calls (Direction: inbound):
        //   - 'To' = our Twilio phone number
        //   - 'From' = the caller's PSTN number
        const isBrowserCall = Direction === 'outbound-api' || (src.Caller || RawFrom || '').startsWith('client:');
        const isInboundPstn = Direction === 'inbound';

        // Resolve the actual destination to dial
        const To = src.targetNumber || src.target || (RawTo.startsWith('AP') ? '' : RawTo) || '';
        // Resolve the caller ID (our Twilio number for outbound, or PSTN caller for inbound)
        const From = src.callerId || RawFrom || '';

        let meta = {};
        try {
            if (src.metadata) {
                meta = typeof src.metadata === 'string' ? JSON.parse(src.metadata) : src.metadata;
            }
        } catch (e) {
            logger.warn('[Voice Webhook] Failed to parse metadata:', e.message);
        }

        logger.log(`[Voice Webhook] Processing ${Direction || 'unknown-direction'} call ${CallSid}:`, {
            rawFrom: RawFrom, rawTo: RawTo, resolvedTo: To, resolvedFrom: From,
            isBrowser: isBrowserCall, isInbound: isInboundPstn, meta: JSON.stringify(meta)
        });

        const contactId = meta.contactId || '';
        const accountId = meta.accountId || '';
        const agentId = meta.agentId || meta.userId || '';
        const agentEmail = meta.agentEmail || '';
        const targetPhone = To || meta.targetPhone || '';

        const inboundPhoneNumbers = await resolveInboundPhoneNumbers();
        const primaryBusinessNumber = inboundPhoneNumbers[0] || DEFAULT_TWILIO_BUSINESS_NUMBER;

        // Authoritative routing decision (per Twilio Support):
        //   - Use Direction field first — it's the definitive signal
        //   - Fall back to checking if RawTo matches our Twilio number
        //   - Never treat a browser-SDK call as inbound (even if numbers match)
        const isInboundToBusiness = isInboundPstn ||
            (!isBrowserCall && Boolean(inboundPhoneNumbers.find((num) => digitsOnly(num) === digitsOnly(RawTo))));
        const businessNumber = isInboundToBusiness
            ? (inboundPhoneNumbers.find((num) => digitsOnly(num) === digitsOnly(RawTo)) || primaryBusinessNumber)
            : primaryBusinessNumber;


        // For outbound calls, use From as callerId (this is the selected Twilio number from settings)
        // For inbound calls, use businessNumber as callerId when dialing to browser client
        const sanitizedFrom = normalizePhoneNumber(From);
        const callerIdForDial = isInboundToBusiness ? businessNumber : (sanitizedFrom || businessNumber);

        // Ensure absolute base URL
        const envBase = process.env.PUBLIC_BASE_URL || '';
        const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http') || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host || '';
        const base = envBase ? envBase.replace(/\/$/, '') : (host ? `${proto}://${host}` : 'https://nodal-point-network.vercel.app');

        const callbackParams = new URLSearchParams();
        if (contactId) callbackParams.append('contactId', contactId);
        if (accountId) callbackParams.append('accountId', accountId);
        if (agentId) callbackParams.append('agentId', agentId);
        if (agentEmail) callbackParams.append('agentEmail', agentEmail);
        if (targetPhone) callbackParams.append('targetPhone', targetPhone);
        const callbackQuery = callbackParams.toString() ? `?${callbackParams.toString()}` : '';

        logger.log(`[Voice Webhook] Summary: From=${From} To=${To} SID=${CallSid} inbound=${isInboundToBusiness} callerId=${callerIdForDial}`);

        // Create TwiML response
        const twiml = new VoiceResponse();

        if (isInboundToBusiness) {
            // INBOUND CALL: Ring the browser client (identity: agent)
            const dial = twiml.dial({
                callerId: From || businessNumber,
                timeout: 30,
                answerOnBridge: true,
                action: `${base}/api/twilio/dial-complete${callbackQuery}`,
                record: 'record-from-answer-dual',
                recordingStatusCallback: `${base}/api/twilio/recording${callbackQuery}`,
                recordingStatusCallbackMethod: 'POST'
            });
            twiml.say({ voice: 'alice' }, 'Please hold while we try to connect you.');

            const client = dial.client({
                statusCallback: `${base}/api/twilio/dial-status${callbackQuery}`,
                statusCallbackEvent: 'initiated ringing answered completed'
            }, 'agent');

            if (From && From !== businessNumber) {
                client.parameter({ name: 'originalCaller', value: From });
            }
        } else if (To) {
            // OUTBOUND CALLBACK SCENARIO
            const dial = twiml.dial({
                callerId: callerIdForDial,
                timeout: 30,
                answerOnBridge: true,
                action: `${base}/api/twilio/dial-complete${callbackQuery}`,
                record: 'record-from-answer-dual',
                recordingStatusCallback: `${base}/api/twilio/recording${callbackQuery}`,
                recordingStatusCallbackMethod: 'POST'
            });

            dial.number({
                statusCallback: `${base}/api/twilio/dial-status${callbackQuery}`,
                statusCallbackEvent: 'initiated ringing answered completed'
            }, To);
        } else {
            // Fallback
            twiml.say('Please hold while we try to connect you.');
            const dial = twiml.dial({
                callerId: callerIdForDial,
                action: `${base}/api/twilio/dial-complete${callbackQuery}`,
                record: 'record-from-answer-dual',
                recordingStatusCallback: `${base}/api/twilio/recording${callbackQuery}`,
                recordingStatusCallbackMethod: 'POST'
            });
            dial.client({
                statusCallback: `${base}/api/twilio/dial-status${callbackQuery}`,
                statusCallbackEvent: 'initiated ringing answered completed'
            }, 'agent');
        }

        const xml = twiml.toString();
        logger.log('[Voice TwiML]', xml);
        res.setHeader('Content-Type', 'text/xml');
        res.writeHead(200);
        res.end(xml);
        return;

    } catch (error) {
        logger.error('[Voice Webhook] ERROR:', error);
        const twiml = new VoiceResponse();
        twiml.say('Sorry, there was an error processing your call.');
        res.setHeader('Content-Type', 'text/xml');
        res.writeHead(500);
        res.end(twiml.toString());
        return;
    }
}
