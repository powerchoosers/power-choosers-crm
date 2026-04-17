import twilio from 'twilio';
import logger from '../_logger.js';
import {
    DEFAULT_MACHINE_DETECTION_TIMEOUT,
    extractNormalizedUserNumbers,
    getMachineDetectionTimeout,
    normalizeMachineDetectionTimeout,
} from '../../../lib/voicemail.ts';
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
    if (str.startsWith('+')) return '+' + str.slice(1).replace(/\D/g, '');
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

function parsePowerDialTargets(value) {
    if (!value) return [];

    let parsed = value;
    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value);
        } catch (_) {
            return [];
        }
    }

    if (!Array.isArray(parsed)) return [];

    return parsed.map((target, index) => {
        if (!target || typeof target !== 'object') return null;
        const phoneNumber = normalizePhoneNumber(target.phoneNumber || target.phone || target.number || target.to || '');
        if (!phoneNumber) return null;

        return {
            index,
            phoneNumber,
            contactId: target.contactId || target.id || '',
            accountId: target.accountId || '',
            contactName: target.contactName || target.name || '',
            accountName: target.accountName || '',
            title: target.title || '',
            photoUrl: target.photoUrl || '',
            logoUrl: target.logoUrl || '',
            domain: target.domain || '',
        };
    }).filter(Boolean);
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
            .map((num) => ({
                sid: num.sid || null,
                number: normalizePhoneNumber(num.phoneNumber),
                name: num.friendlyName || null,
            }))
            .filter((num) => Boolean(num.number));
        inboundNumbersCacheUpdatedAt = now;
    } catch (error) {
        logger.error('[Voice] Unable to refresh incoming numbers list:', error?.message || error);
    }

    return inboundNumbersCache;
}

async function resolveInboundPhoneNumbers() {
    const fetched = await getTwilioIncomingNumbersList();
    const candidates = [
        ...fetched.map((item) => item.number).filter(Boolean),
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

async function resolveInboundPhoneDetails(businessNumber) {
    const normalizedBusiness = normalizePhoneNumber(businessNumber);
    const digitsBusiness = digitsOnly(businessNumber);
    if (!normalizedBusiness && !digitsBusiness) {
        return null;
    }

    const fetched = await getTwilioIncomingNumbersList();
    return fetched.find((item) => {
        if (item.sid && businessNumber && item.sid === businessNumber) return true;

        const itemNumber = item.number || '';
        if (normalizedBusiness && normalizePhoneNumber(itemNumber) === normalizedBusiness) return true;
        if (digitsBusiness && digitsOnly(itemNumber) === digitsBusiness) return true;

        return false;
    }) || null;
}

function resolveFallbackAgentIdentity() {
    if (process.env.TWILIO_DEFAULT_AGENT_IDENTITY) {
        return process.env.TWILIO_DEFAULT_AGENT_IDENTITY;
    }

    if (process.env.TWILIO_DEFAULT_AGENT_USER_ID) {
        return `agent-${process.env.TWILIO_DEFAULT_AGENT_USER_ID}`;
    }

    return 'agent';
}

async function resolveInboundTargetIdentity(businessNumber) {
    const fallbackIdentity = resolveFallbackAgentIdentity();
    const normalizedBusiness = digitsOnly(businessNumber);

    if (!normalizedBusiness) {
        return fallbackIdentity;
    }

    try {
        const { supabaseAdmin } = await import('../../../lib/supabase.ts');

        const { data: users, error } = await supabaseAdmin
            .from('users')
            .select('id, settings')
            .limit(1000);

        if (error) {
            logger.warn('[Voice] Failed to load users for inbound routing:', error.message);
            return fallbackIdentity;
        }

        const matchedUser = (users || []).find((user) => {
            const userNumbers = extractNormalizedUserNumbers(user?.settings || {});
            return userNumbers.some((num) => num === normalizedBusiness);
        });

        if (matchedUser?.id) {
            return `agent-${matchedUser.id}`;
        }

        logger.warn(`[Voice] No user mapped to inbound number ${businessNumber}. Falling back to ${fallbackIdentity}`);
        return fallbackIdentity;
    } catch (err) {
        logger.warn('[Voice] Failed inbound identity resolution, using fallback identity:', err?.message || err);
        return fallbackIdentity;
    }
}

async function resolveMachineDetectionTimeout(agentId, agentEmail, requestedTimeout) {
    if (requestedTimeout !== undefined && requestedTimeout !== null && String(requestedTimeout).trim() !== '') {
        return normalizeMachineDetectionTimeout(requestedTimeout, DEFAULT_MACHINE_DETECTION_TIMEOUT);
    }

    try {
        const { supabaseAdmin } = await import('../../../lib/supabase.ts');
        const normalizedEmail = String(agentEmail || '').trim().toLowerCase();
        const normalizedAgentId = String(agentId || '').trim();

        let userRow = null;

        if (normalizedEmail) {
            const { data, error } = await supabaseAdmin
                .from('users')
                .select('settings')
                .eq('email', normalizedEmail)
                .maybeSingle();

            if (error) {
                logger.warn('[Voice] Failed to load user settings for AMD timeout:', error.message);
            } else if (data) {
                userRow = data;
            }
        }

        if (!userRow && normalizedAgentId) {
            const { data, error } = await supabaseAdmin
                .from('users')
                .select('settings')
                .eq('id', normalizedAgentId)
                .maybeSingle();

            if (error) {
                logger.warn('[Voice] Failed to resolve agent settings for AMD timeout:', error.message);
            } else if (data) {
                userRow = data;
            }
        }

        return getMachineDetectionTimeout(userRow?.settings || null);
    } catch (err) {
        logger.warn('[Voice] Falling back to default AMD timeout:', err?.message || err);
        return DEFAULT_MACHINE_DETECTION_TIMEOUT;
    }
}

export default async function handler(req, res) {
    // First thing: log that we were reached, before ANY processing
    logger.log('[Voice] ======== HANDLER HIT ========', req.method);

    if (req.method !== 'POST' && req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }

    try {
        // Merge query + body. Twilio JS SDK custom params (targetNumber, callerId,
        // metadata) arrive as top-level POST form-encoded params alongside Twilio's
        // own params (CallSid, From, To, Direction, etc.)
        const body = req.body || {};
        const query = req.query || {};
        const src = { ...query, ...body };

        // Dump everything so we can see exactly what Twilio sent
        logger.log('[Voice] RAW SRC keys:', Object.keys(src).join(', '));
        logger.log('[Voice] RAW SRC:', JSON.stringify(src));

        // LOOP DETECTION
        if (src.ErrorCode || src.ErrorUrl) {
            logger.warn(`[Voice] Fallback loop detected! ErrorCode: ${src.ErrorCode}`);
            const twiml = new VoiceResponse();
            twiml.say('An application error occurred. Goodbye.');
            twiml.hangup();
            res.setHeader('Content-Type', 'text/xml');
            res.writeHead(200);
            res.end(twiml.toString());
            return;
        }

        // ================================================================
        // RAW TWILIO FIELDS
        // ================================================================
        const CallSid = src.CallSid || '';
        const RawFrom = src.From || '';       // 'client:agent' for browser calls
        const RawTo = src.To || '';         // TwiML App SID (APxxxx) for browser calls
        const Direction = (src.Direction || '').toLowerCase(); // 'outbound-api' or 'inbound'
        const Caller = src.Caller || '';     // same as From typically

        // ================================================================
        // CUSTOM PARAMS FROM VoiceContext.tsx device.connect({ params: {...} })
        //   - targetNumber: the actual phone number to dial (E.164)
        //   - callerId:     the selected Twilio number to use as caller ID
        //   - metadata:     JSON string with contactId, accountId, agentId, etc.
        // ================================================================
        const customTargetNumber = src.targetNumber || src.target || '';
        const customCallerId = src.callerId || '';
        const rawMetadata = src.metadata || '';
        const powerDialSessionId = src.powerDialSessionId != null ? src.powerDialSessionId : '';
        const powerDialBatchId = src.powerDialBatchId != null ? src.powerDialBatchId : '';
        const powerDialBatchIndex = src.powerDialBatchIndex != null ? src.powerDialBatchIndex : '';
        const powerDialBatchSize = src.powerDialBatchSize != null ? src.powerDialBatchSize : '';
        const powerDialSourceLabel = src.powerDialSourceLabel != null ? src.powerDialSourceLabel : '';
        const powerDialSelectedCount = src.powerDialSelectedCount != null ? src.powerDialSelectedCount : '';
        const powerDialDialableCount = src.powerDialDialableCount != null ? src.powerDialDialableCount : '';
        const rawPowerDialTargets = src.powerDialTargets || '';

        logger.log('[Voice] Custom params:', {
            targetNumber: customTargetNumber,
            callerId: customCallerId,
            hasMetadata: !!rawMetadata,
            hasPowerDialTargets: !!rawPowerDialTargets
        });

        // ================================================================
        // RESOLVE CALL DIRECTION AND DESTINATION
        // ================================================================
        // Per Twilio Support:
        //   Direction: 'outbound-api' → browser SDK call (custom params present)
        //   Direction: 'inbound'      → PSTN caller dialing our Twilio number
        //
        // For browser calls:
        //   RawTo = TwiML App SID (APxxxx), NOT the dialed number
        //   The actual destination is in our custom param: targetNumber
        //
        // For inbound PSTN:
        //   RawTo = our Twilio number, RawFrom = caller's number
        const isBrowserCall = Direction === 'outbound-api'
            || Caller.startsWith('client:')
            || RawFrom.startsWith('client:')
            || !!customTargetNumber; // if targetNumber exists, it's always a browser call

        const isInboundPstn = Direction === 'inbound' && !isBrowserCall;

        // Resolve the actual destination to dial
        let To = '';
        if (customTargetNumber) {
            To = customTargetNumber;
        } else if (RawTo && !RawTo.startsWith('AP') && !RawTo.startsWith('client:')) {
            To = RawTo;
        }

        // Resolve caller ID
        const From = customCallerId || (isInboundPstn ? RawFrom : '') || '';

        // Parse metadata
        let meta = {};
        try {
            if (rawMetadata) {
                meta = typeof rawMetadata === 'string' ? JSON.parse(rawMetadata) : rawMetadata;
            }
        } catch (e) {
            logger.warn('[Voice] Failed to parse metadata:', e?.message);
        }

        const powerDialTargets = parsePowerDialTargets(rawPowerDialTargets);
        const isPowerDialBatch = powerDialTargets.length > 0;

        const contactId = meta.contactId || '';
        const accountId = meta.accountId || '';
        const agentId = meta.agentId || meta.userId || '';
        const agentEmail = meta.agentEmail || '';
        let machineDetectionTimeout = DEFAULT_MACHINE_DETECTION_TIMEOUT;
        if (isBrowserCall && To) {
            machineDetectionTimeout = await resolveMachineDetectionTimeout(
                agentId,
                agentEmail,
                meta.machineDetectionTimeout ?? src.machineDetectionTimeout
            );
        }
        const targetPhone = To || meta.targetPhone || '';

        logger.log('[Voice] Resolved:', {
            direction: Direction || 'unknown',
            isBrowser: isBrowserCall,
            isInbound: isInboundPstn,
            resolvedTo: To,
            resolvedFrom: From,
            targetPhone,
            agentEmail,
            contactId,
            accountId
        });

        // ================================================================
        // RESOLVE BUSINESS NUMBERS
        // ================================================================
        const inboundPhoneNumbers = await resolveInboundPhoneNumbers();
        const primaryBusinessNumber = inboundPhoneNumbers[0] || DEFAULT_TWILIO_BUSINESS_NUMBER;

        const isInboundToBusiness = isInboundPstn ||
            (!isBrowserCall && Boolean(inboundPhoneNumbers.find((num) => digitsOnly(num) === digitsOnly(RawTo))));

        const businessNumber = isInboundToBusiness
            ? (inboundPhoneNumbers.find((num) => digitsOnly(num) === digitsOnly(RawTo)) || primaryBusinessNumber)
            : primaryBusinessNumber;
        const businessPhoneDetails = businessNumber ? await resolveInboundPhoneDetails(businessNumber) : null;

        // For outbound browser calls: use custom callerId or business number
        // For inbound PSTN: use business number when connecting to browser
        const sanitizedFrom = normalizePhoneNumber(From);
        const callerIdForDial = isInboundToBusiness
            ? businessNumber
            : (sanitizedFrom || primaryBusinessNumber);

        // ================================================================
        // BUILD CALLBACK URLS
        // CRITICAL: Use the canonical www.nodalpoint.io domain directly.
        // nodalpoint.io → 307 redirect → www.nodalpoint.io, which causes
        // Twilio POST callbacks to lose their body during the redirect.
        // ================================================================
        let envBase = process.env.PUBLIC_BASE_URL || '';
        // Fix the redirect problem: always use the www canonical domain
        if (envBase === 'https://nodalpoint.io') {
            envBase = 'https://www.nodalpoint.io';
        }
        const proto = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host || '';
        const base = envBase
            ? envBase.replace(/\/$/, '')
            : (host ? `${proto}://${host}` : 'https://www.nodalpoint.io');

        const callbackParams = new URLSearchParams();
        if (isInboundPstn) callbackParams.append('callDirection', 'inbound');
        else callbackParams.append('callDirection', 'outbound');
        if (agentId) callbackParams.append('agentId', agentId);
        if (agentEmail) callbackParams.append('agentEmail', agentEmail);
        if (powerDialSessionId) callbackParams.append('powerDialSessionId', powerDialSessionId);
        if (powerDialBatchId) callbackParams.append('powerDialBatchId', powerDialBatchId);
        if (powerDialBatchIndex !== '') callbackParams.append('powerDialBatchIndex', String(powerDialBatchIndex));
        if (powerDialBatchSize !== '') callbackParams.append('powerDialBatchSize', String(powerDialBatchSize));
        if (powerDialSourceLabel) callbackParams.append('powerDialSourceLabel', powerDialSourceLabel);
        if (powerDialSelectedCount !== '') callbackParams.append('powerDialSelectedCount', String(powerDialSelectedCount));
        if (powerDialDialableCount !== '') callbackParams.append('powerDialDialableCount', String(powerDialDialableCount));
        if (businessNumber) callbackParams.append('businessPhone', businessNumber);
        if (businessPhoneDetails?.sid) callbackParams.append('businessPhoneSid', businessPhoneDetails.sid);
        if (businessPhoneDetails?.name) callbackParams.append('businessPhoneName', businessPhoneDetails.name);
        if (!isPowerDialBatch) {
            if (contactId) callbackParams.append('contactId', contactId);
            if (accountId) callbackParams.append('accountId', accountId);
            if (targetPhone) callbackParams.append('targetPhone', targetPhone);
        }
        const cbq = callbackParams.toString() ? `?${callbackParams.toString()}` : '';

        // ================================================================
        // BUILD TwiML RESPONSE
        // ================================================================
        const twiml = new VoiceResponse();

        if (isInboundToBusiness) {
            // ---- INBOUND PSTN → Ring browser client ----
            logger.log(`[Voice] INBOUND: Ringing browser client. Caller: ${RawFrom}, Business: ${businessNumber}`);

            const dial = twiml.dial({
                callerId: RawFrom || businessNumber,
                timeout: 30,
                answerOnBridge: true,
                action: `${base}/api/twilio/dial-complete${cbq}`,
                record: 'record-from-answer-dual',
                recordingStatusCallback: `${base}/api/twilio/recording${cbq}`,
                recordingStatusCallbackMethod: 'POST'
            });
            twiml.say({ voice: 'alice' }, 'Please hold while we try to connect you.');

            // Resolve which agent identity to ring based on the business number dialed.
            // We normalize user-stored settings numbers because settings may store
            // formatted values (e.g. "+1 (817)-...") while Twilio sends E.164.
            const targetIdentity = await resolveInboundTargetIdentity(businessNumber);
            logger.log(`[Voice] Resolved inbound target identity: ${targetIdentity} for number ${businessNumber}`);

            const client = dial.client({
                statusCallback: `${base}/api/twilio/dial-status${cbq}`,
                statusCallbackEvent: 'initiated ringing answered completed'
            }, targetIdentity);

            if (RawFrom && RawFrom !== businessNumber) {
                client.parameter({ name: 'originalCaller', value: RawFrom });
            }

        } else if (isPowerDialBatch && To) {
            // ---- OUTBOUND BROWSER → Power dial batch (simulring 3 numbers) ----
            logger.log(`[Voice] POWER DIAL: Dialing ${powerDialTargets.length} numbers for batch ${powerDialBatchId || 'unknown'} with callerId ${callerIdForDial}`);

            const dial = twiml.dial({
                callerId: callerIdForDial,
                timeout: 30,
                answerOnBridge: true,
                action: `${base}/api/twilio/dial-complete${cbq}`,
                record: 'record-from-answer-dual',
                recordingStatusCallback: `${base}/api/twilio/recording${cbq}`,
                recordingStatusCallbackMethod: 'POST'
            });

            powerDialTargets.forEach((target, index) => {
                const targetParams = new URLSearchParams(callbackParams);
                if (target.contactId) targetParams.append('contactId', target.contactId);
                if (target.accountId) targetParams.append('accountId', target.accountId);
                if (target.name) targetParams.append('contactName', target.name);
                if (target.accountName) targetParams.append('accountName', target.accountName);
                if (target.phoneNumber) targetParams.append('targetPhone', target.phoneNumber);
                if (target.title) targetParams.append('contactTitle', target.title);
                if (target.logoUrl) targetParams.append('logoUrl', target.logoUrl);
                if (target.domain) targetParams.append('domain', target.domain);
                targetParams.append('powerDialTargetIndex', String(index));
                targetParams.append('powerDialTargetCount', String(powerDialTargets.length));
                if (powerDialSessionId) targetParams.append('powerDialSessionId', powerDialSessionId);
                if (powerDialBatchId) targetParams.append('powerDialBatchId', powerDialBatchId);
                if (powerDialBatchIndex !== '') targetParams.append('powerDialBatchIndex', String(powerDialBatchIndex));
                if (powerDialBatchSize !== '') targetParams.append('powerDialBatchSize', String(powerDialBatchSize));
                if (powerDialSourceLabel) targetParams.append('powerDialSourceLabel', powerDialSourceLabel);
                if (powerDialSelectedCount !== '') targetParams.append('powerDialSelectedCount', String(powerDialSelectedCount));
                if (powerDialDialableCount !== '') targetParams.append('powerDialDialableCount', String(powerDialDialableCount));

                dial.number({
                    statusCallback: `${base}/api/twilio/dial-status?${targetParams.toString()}`,
                    statusCallbackEvent: 'initiated ringing answered completed',
                    machineDetection: 'DetectMessageEnd',
                    machineDetectionTimeout,
                }, target.phoneNumber);
            });

        } else if (To) {
            // ---- OUTBOUND BROWSER → Dial the target phone number ----
            logger.log(`[Voice] OUTBOUND: Dialing ${To} with callerId ${callerIdForDial}`);

            const dial = twiml.dial({
                callerId: callerIdForDial,
                timeout: 30,
                answerOnBridge: true,
                action: `${base}/api/twilio/dial-complete${cbq}`,
                record: 'record-from-answer-dual',
                recordingStatusCallback: `${base}/api/twilio/recording${cbq}`,
                recordingStatusCallbackMethod: 'POST'
            });

            dial.number({
                statusCallback: `${base}/api/twilio/dial-status${cbq}`,
                statusCallbackEvent: 'initiated ringing answered completed',
                machineDetection: 'DetectMessageEnd',
                machineDetectionTimeout,
            }, To);

        } else {
            // ---- NO DESTINATION → Hang up immediately ----
            // This is a safety net. If we have no number to dial, we must NOT
            // dial client:agent (which would ring the agent's own browser).
            logger.error('[Voice] ❌ NO DESTINATION! Cannot route call. targetNumber was empty.', {
                rawTo: RawTo, rawFrom: RawFrom, direction: Direction,
                customTarget: customTargetNumber, customCaller: customCallerId,
                allSrcKeys: Object.keys(src).join(', ')
            });

            twiml.say('Sorry, no destination number was provided. The call cannot be completed.');
            twiml.hangup();
        }

        // ================================================================
        // SEND RESPONSE
        // ================================================================
        const xml = twiml.toString();
        logger.log('[Voice] TwiML response:', xml);
        res.setHeader('Content-Type', 'text/xml');
        res.writeHead(200);
        res.end(xml);
        return;

    } catch (error) {
        logger.error('[Voice] UNHANDLED ERROR:', error?.message, error?.stack);

        const twiml = new VoiceResponse();
        twiml.say('Sorry, there was an error processing your call.');
        twiml.hangup();
        res.setHeader('Content-Type', 'text/xml');
        res.writeHead(500);
        res.end(twiml.toString());
        return;
    }
}
