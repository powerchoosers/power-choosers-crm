import twilio from 'twilio';
import logger from '../_logger.js';
import { upsertCallInSupabase } from '../calls.js';
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
        const src = req.method === 'POST' ? (req.body || {}) : (req.query || {});

        // LOOP DETECTION: Check if this request is a fallback from a previous error
        // If "ErrorCode" or "ErrorUrl" is present, it means Twilio hit an error and is falling back to this URL
        // We must STOP the loop by hanging up, otherwise it creates an infinite call cycle
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

        const To = src.To || src.to; // For inbound, this is typically your Twilio number
        const From = src.From || src.from; // For inbound, this is the caller's number; for outbound, this is the selected caller ID
        const CallSid = src.CallSid || src.callSid;

        const inboundPhoneNumbers = await resolveInboundPhoneNumbers();
        const primaryBusinessNumber = inboundPhoneNumbers[0] || DEFAULT_TWILIO_BUSINESS_NUMBER;
        const toDigits = digitsOnly(To);
        const matchedInboundNumber = toDigits
            ? inboundPhoneNumbers.find((num) => digitsOnly(num) === toDigits)
            : null;
        const isInboundToBusiness = Boolean(matchedInboundNumber);
        const businessNumber = matchedInboundNumber || primaryBusinessNumber;

        // For outbound calls, use From as callerId (this is the selected Twilio number from settings)
        // For inbound calls, use businessNumber as callerId when dialing to browser client
        const sanitizedFrom = normalizePhoneNumber(From);
        const callerIdForDial = isInboundToBusiness ? businessNumber : (sanitizedFrom || businessNumber);

        // Ensure absolute base URL for Twilio callbacks (prefer PUBLIC_BASE_URL for stability)
        const envBase = process.env.PUBLIC_BASE_URL || '';
        const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http') || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host || '';
        const base = envBase ? envBase.replace(/\/$/, '') : (host ? `${proto}://${host}` : 'https://nodal-point-network.vercel.app');

        // Extract metadata and create initial call record to ensure it appears in CRM immediately
        let contactId = '';
        let accountId = '';
        if (CallSid && src.metadata) {
            try {
                const meta = typeof src.metadata === 'string' ? JSON.parse(src.metadata) : src.metadata;

                // Extract IDs for propagation to dial status callbacks
                contactId = meta.contactId || '';
                accountId = meta.accountId || '';

                // Create initial call record as 'initiated'
                // This ensures the transmission log shows "active call" even before completion
                if (meta.contactId || meta.accountId) {
                    try {
                        const callRecord = {
                            callSid: CallSid,
                            twilioSid: CallSid,
                            status: 'initiated',
                            direction: isInboundToBusiness ? 'inbound' : 'outbound',
                            from: From,
                            to: To,
                            contactId: meta.contactId,
                            accountId: meta.accountId,
                            metadata: meta,
                            agentId: meta.agentId,
                            agentEmail: meta.agentEmail,
                            timestamp: new Date().toISOString()
                        };
                        logger.log(`[Voice] Creating initial call record for ${CallSid}`, callRecord);
                        // Do NOT await here to avoid blocking TwiML generation response latency
                        upsertCallInSupabase(callRecord).catch(err => {
                            logger.warn('[Voice] Failed creating initial call record:', err?.message);
                        });
                    } catch (e) {
                        logger.warn('[Voice] Error preparing initial call upsert:', e);
                    }
                }
            } catch (e) {
                logger.warn('[Voice] Failed to process call metadata:', e);
            }
        }

        // Build callback URLs with CRM context if available
        const callbackParams = new URLSearchParams();
        if (contactId) callbackParams.append('contactId', contactId);
        if (accountId) callbackParams.append('accountId', accountId);
        const callbackQuery = callbackParams.toString() ? `?${callbackParams.toString()}` : '';

        logger.log(`[Voice Webhook] From: ${From || 'N/A'} To: ${To || 'N/A'} CallSid: ${CallSid || 'N/A'} inbound=${isInboundToBusiness} callerId=${callerIdForDial}`);

        // Create TwiML response
        const twiml = new VoiceResponse();

        if (isInboundToBusiness) {
            // INBOUND CALL: Ring the browser client (identity: agent)
            // Enable dual-channel dial recording so Twilio produces 2-channel recordings directly
            const dial = twiml.dial({
                callerId: From || businessNumber, // Use caller's number, fallback to business number
                timeout: 30,
                answerOnBridge: true,
                hangupOnStar: false,
                timeLimit: 14400,
                // action must return TwiML; use dial-complete endpoint
                action: `${base}/api/twilio/dial-complete${callbackQuery}`,
                // Dual-channel from answer
                record: 'record-from-answer-dual',
                recordingStatusCallback: `${base}/api/twilio/recording${callbackQuery}`,
                recordingStatusCallbackMethod: 'POST'
            });
            // Small prompt to keep caller informed
            twiml.say({ voice: 'alice' }, 'Please hold while we try to connect you.');

            // Pass the original caller's number as a custom parameter
            const client = dial.client({
                statusCallback: `${base}/api/twilio/dial-status${callbackQuery}`,
                statusCallbackEvent: 'initiated ringing answered completed'
            }, 'agent');

            if (From && From !== businessNumber) {
                client.parameter({
                    name: 'originalCaller',
                    value: From
                });
            }

            logger.log(`[Voice] Generated TwiML to dial <Client>agent</Client> with callerId: ${From || businessNumber}, originalCaller: ${From}`);
        } else if (To) {
            // OUTBOUND CALLBACK SCENARIO: Dial specific number provided
            // Use dynamic caller ID from From parameter (selected Twilio number from settings)
            const dial = twiml.dial({
                callerId: callerIdForDial, // Use selected number from settings, fallback to businessNumber
                timeout: 30,
                answerOnBridge: true,
                hangupOnStar: false,
                timeLimit: 14400,
                action: `${base}/api/twilio/dial-complete${callbackQuery}`,
                // Dual-channel from answer
                record: 'record-from-answer-dual',
                recordingStatusCallback: `${base}/api/twilio/recording${callbackQuery}`,
                recordingStatusCallbackMethod: 'POST'
            });

            dial.number({
                statusCallback: `${base}/api/twilio/dial-status${callbackQuery}`,
                statusCallbackEvent: 'initiated ringing answered completed'
            }, To);

            logger.log(`[Voice] Generated TwiML to dial number: ${To} with callerId: ${callerIdForDial}`);
        } else {
            // Fallback: no specific target
            twiml.say('Please hold while we try to connect you.');
            const dial = twiml.dial({
                callerId: callerIdForDial, // Use selected number from settings, fallback to businessNumber
                timeout: 30,
                answerOnBridge: true,
                hangupOnStar: false,
                timeLimit: 14400,
                // action must return TwiML; use dial-complete endpoint
                action: `${base}/api/twilio/dial-complete${callbackQuery}`,
                // Dual-channel from answer
                record: 'record-from-answer-dual',
                recordingStatusCallback: `${base}/api/twilio/recording${callbackQuery}`,
                recordingStatusCallbackMethod: 'POST'
            });

            dial.client({
                statusCallback: `${base}/api/twilio/dial-status${callbackQuery}`,
                statusCallbackEvent: 'initiated ringing answered completed'
            }, 'agent');
        }

        // Send TwiML response
        const xml = twiml.toString();
        try { logger.log('[Voice TwiML]', xml); } catch (_) { }
        res.setHeader('Content-Type', 'text/xml');
        res.writeHead(200);
        res.end(xml);
        return;

    } catch (error) {
        logger.error('Voice webhook error:', error);

        // Return error TwiML
        const twiml = new VoiceResponse();
        twiml.say('Sorry, there was an error processing your call.');

        res.setHeader('Content-Type', 'text/xml');
        res.writeHead(500);
        res.end(twiml.toString());
        return;
    }
}
