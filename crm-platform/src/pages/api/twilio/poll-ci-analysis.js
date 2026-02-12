import twilio from 'twilio';
import { corsMiddleware } from '../_cors.js';
import logger from '../_logger.js';

export default async function handler(req, res) {
    // Handle CORS preflight
    if (corsMiddleware(req, res)) return;

    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }

    try {
        const _start = Date.now();
        const { transcriptSid, callSid: callSidInput } = req.body;
        try { logger.log('[Poll CI Analysis] Start', { transcriptSid, callSid: callSidInput, ts: new Date().toISOString() }); } catch (_) { }

        if (!transcriptSid) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'transcriptSid is required' }));
            return;
        }

        logger.log('[Poll CI Analysis] Checking analysis status for:', { transcriptSid, callSid: callSidInput });

        // Create Twilio client
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

        // Get transcript details
        const transcript = await client.intelligence.v2.transcripts(transcriptSid).fetch();

        // Resolve a reliable Call SID using multiple fallbacks
        let resolvedCallSid = (callSidInput && /^CA[0-9a-zA-Z]+$/.test(String(callSidInput))) ? callSidInput : '';
        try {
            if (!resolvedCallSid) {
                const fromCustomerKey = (transcript && transcript.customerKey) ? String(transcript.customerKey) : '';
                if (fromCustomerKey && /^CA[0-9a-zA-Z]+$/.test(fromCustomerKey)) {
                    resolvedCallSid = fromCustomerKey;
                }
            }
            if (!resolvedCallSid) {
                const sourceSid = transcript && (transcript.sourceSid || transcript.source_sid || transcript.media_properties?.source_sid) || '';
                if (sourceSid && /^RE[0-9a-zA-Z]+$/.test(String(sourceSid))) {
                    try {
                        const rec = await client.recordings(sourceSid).fetch();
                        const recCallSid = rec && (rec.callSid || rec.call_sid);
                        if (recCallSid && /^CA[0-9a-zA-Z]+$/.test(String(recCallSid))) {
                            resolvedCallSid = String(recCallSid);
                        }
                    } catch (e) {
                        try { logger.warn('[Poll CI Analysis] Failed to fetch recording to resolve Call SID:', e?.message); } catch (_) { }
                    }
                }
            }
        } catch (_) { }

        logger.log('[Poll CI Analysis] Transcript status:', {
            sid: transcript.sid,
            status: transcript.status,
            analysisStatus: transcript.analysisStatus,
            ciStatus: transcript.ciStatus,
            processingStatus: transcript.processingStatus
        });

        // Try to get recording info to verify dual-channel
        try {
            const sourceSid = transcript.sourceSid || transcript.source_sid || transcript.mediaProperties?.source_sid;
            if (sourceSid && /^RE[0-9a-zA-Z]+$/.test(String(sourceSid))) {
                const recording = await client.recordings(sourceSid).fetch();
                logger.log('[Poll CI Analysis] Recording info (dual-channel check):', {
                    recordingSid: sourceSid,
                    channels: recording.channels,
                    source: recording.source,
                    duration: recording.duration,
                    status: recording.status
                });

                if (recording.channels !== 2) {
                    logger.warn('[Poll CI Analysis] Recording is NOT dual-channel:', {
                        channels: recording.channels,
                        message: 'Speaker separation may not work correctly'
                    });
                }
            }
        } catch (recError) {
            logger.warn('[Poll CI Analysis] Could not verify recording channels:', recError?.message);
        }

        // CRITICAL FIX: Check if sentences are available - that's the real indicator of completion
        // Twilio sometimes returns status='completed' but analysisStatus fields are undefined
        // If sentences exist, analysis is done regardless of status fields
        let sentencesAvailable = false;
        let sentencesCheck = [];
        try {
            sentencesCheck = await client.intelligence.v2
                .transcripts(transcriptSid)
                .sentences.list();
            sentencesAvailable = Array.isArray(sentencesCheck) && sentencesCheck.length > 0;
            logger.log('[Poll CI Analysis] Sentences check:', {
                available: sentencesAvailable,
                count: sentencesCheck.length
            });
        } catch (e) {
            logger.warn('[Poll CI Analysis] Could not check sentences yet:', e?.message);
        }

        // Check if analysis is complete or failed
        const isAnalysisComplete = sentencesAvailable || // If sentences exist, it's done
            transcript.analysisStatus === 'completed' ||
            transcript.ciStatus === 'completed' ||
            transcript.processingStatus === 'completed';

        const isAnalysisFailed = transcript.analysisStatus === 'failed' ||
            transcript.ciStatus === 'failed' ||
            transcript.processingStatus === 'failed';

        if (isAnalysisFailed) {
            logger.error('[Poll CI Analysis] CI analysis failed:', {
                transcriptStatus: transcript.status,
                analysisStatus: transcript.analysisStatus,
                ciStatus: transcript.ciStatus,
                processingStatus: transcript.processingStatus
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                analysisComplete: false,
                analysisFailed: true,
                status: {
                    transcriptStatus: transcript.status,
                    analysisStatus: transcript.analysisStatus,
                    ciStatus: transcript.ciStatus,
                    processingStatus: transcript.processingStatus
                },
                message: 'CI analysis failed - manual review needed'
            }));
            return;
        }

        if (!isAnalysisComplete) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                analysisComplete: false,
                status: {
                    transcriptStatus: transcript.status,
                    analysisStatus: transcript.analysisStatus,
                    ciStatus: transcript.ciStatus,
                    processingStatus: transcript.processingStatus
                },
                message: 'Analysis still in progress - sentences not available yet'
            }));
            return;
        }

        // Compute agent/customer channel mapping (align with webhook)
        let channelRoleMap = { agentChannel: '1', customerChannel: '2' };
        try {
            let callResource = null;
            try { callResource = resolvedCallSid ? await client.calls(resolvedCallSid).fetch() : null; } catch (_) { }
            const fromStr = callResource?.from || '';
            const toStr = callResource?.to || '';
            const norm = (s) => (s == null ? '' : String(s)).replace(/\D/g, '').slice(-10);
            const envBiz = String(process.env.BUSINESS_NUMBERS || process.env.TWILIO_BUSINESS_NUMBERS || '')
                .split(',').map(norm).filter(Boolean);
            const from10 = norm(fromStr);
            const to10 = norm(toStr);
            const isBiz = (p) => !!p && envBiz.includes(p);
            const fromIsClient = /^client:/i.test(fromStr);
            const fromIsAgent = fromIsClient || isBiz(from10) || (!isBiz(to10) && fromStr && fromStr !== toStr);
            channelRoleMap.agentChannel = fromIsAgent ? '1' : '2';
            channelRoleMap.customerChannel = fromIsAgent ? '2' : '1';
            logger.log('[Poll CI Analysis] Channel-role mapping', channelRoleMap, { from: fromStr, to: toStr, callSid: resolvedCallSid });
        } catch (e) {
            logger.warn('[Poll CI Analysis] Failed to compute channel-role mapping, defaulting:', e?.message);
        }

        // Fetch OperatorResults to get the actual Twilio-generated summary
        let twilioSummary = '';
        let operatorResults = [];
        let operatorResultsData = {
            allOperators: [],
            sentiment: null,
            callTransfer: null,
            voicemail: null,
            disposition: null,
            doNotContact: null
        };
        try {
            const opResults = await client.intelligence.v2
                .transcripts(transcriptSid)
                .operatorResults.list();

            operatorResults = opResults;
            logger.log('[Poll CI Analysis] OperatorResults:', {
                count: opResults.length,
                operators: opResults.map(op => ({
                    name: op.name,
                    type: op.operatorType,
                    hasTextGeneration: !!op.textGenerationResults
                }))
            });

            // Extract summary from operator results per Twilio guidance:
            // Look for operatorType === 'summarization' OR name includes 'summary'/'summarize'
            // Read from: textGenerationResults.summary (or array), result.summary, result (if string), summary
            for (const op of opResults) {
                const opNameLower = (op.name || op.friendlyName || '').toLowerCase();
                const opTypeLower = (op.operatorType || '').toLowerCase();

                // Check for summarization operator type OR name includes summary/summarize
                if (opTypeLower === 'summarization' ||
                    opTypeLower === 'text_generation' ||
                    opNameLower.includes('summary') ||
                    opNameLower.includes('summarize')) {

                    let summary = null;

                    // Primary: textGenerationResults.summary
                    if (op.textGenerationResults?.summary) {
                        summary = op.textGenerationResults.summary;
                    } else if (Array.isArray(op.textGenerationResults) && op.textGenerationResults[0]?.summary) {
                        summary = op.textGenerationResults[0].summary;
                    } else if (typeof op.textGenerationResults === 'string') {
                        summary = op.textGenerationResults;
                    }
                    // Fallback: result.summary or result (if string)
                    else if (typeof op.result === 'string') {
                        summary = op.result;
                    } else if (op.result?.summary) {
                        summary = op.result.summary;
                    }
                    // Last resort: direct summary field
                    else if (op.summary) {
                        summary = op.summary;
                    }

                    if (summary) {
                        twilioSummary = String(summary).trim();
                        logger.log('[Poll CI Analysis] Found Twilio summary:', {
                            operatorName: op.name || op.friendlyName,
                            operatorType: op.operatorType,
                            summaryLength: twilioSummary.length,
                            preview: twilioSummary.substring(0, 100),
                            source: 'summarization_operator'
                        });
                        break;
                    }
                }

                // Also check extraction operators which may contain parsed JSON with summary
                if (opTypeLower === 'extraction' && op.extractionResults) {
                    try {
                        const extracted = typeof op.extractionResults === 'string'
                            ? JSON.parse(op.extractionResults)
                            : op.extractionResults;
                        if (extracted.summary) {
                            twilioSummary = String(extracted.summary).trim();
                            logger.log('[Poll CI Analysis] Found summary from extraction operator:', {
                                operatorName: op.name || op.friendlyName,
                                summaryLength: twilioSummary.length,
                                preview: twilioSummary.substring(0, 100),
                                source: 'extraction_operator'
                            });
                            break;
                        }
                    } catch (parseErr) {
                        logger.log('[Poll CI Analysis] Could not parse extraction results:', parseErr?.message);
                    }
                }
            }

            if (!twilioSummary) {
                logger.log('[Poll CI Analysis] No summary found in OperatorResults, operators checked:',
                    opResults.map(op => ({ name: op.name, type: op.operatorType })));
            }

            // Extract all operator results for storage in conversationalIntelligence
            // This includes: sentiment, call transfer, voicemail detection, disposition, etc.
            const extractedOperators = {
                sentiment: null,
                callTransfer: null,
                voicemail: null,
                disposition: null,
                doNotContact: null,
                allOperators: operatorResults.map(op => ({
                    name: op.name || op.friendlyName,
                    operatorType: op.operatorType,
                    result: op.result,
                    textGenerationResults: op.textGenerationResults,
                    extractionResults: op.extractionResults,
                    classificationResults: op.classificationResults,
                    phraseMatchResults: op.phraseMatchResults
                }))
            };

            // Extract sentiment from Sentiment Analysis operator
            for (const op of operatorResults) {
                const opNameLower = (op.name || op.friendlyName || '').toLowerCase();
                const opTypeLower = (op.operatorType || '').toLowerCase();

                if (opNameLower.includes('sentiment') &&
                    (opTypeLower === 'transcript_classification' || opTypeLower === 'classification')) {
                    const sentiment = op.classificationResults?.label ||
                        op.result?.label ||
                        op.result ||
                        (typeof op.result === 'string' ? op.result : null);
                    if (sentiment) {
                        extractedOperators.sentiment = String(sentiment).trim();
                        logger.log('[Poll CI Analysis] Extracted sentiment:', extractedOperators.sentiment);
                    }
                }

                // Extract call transfer
                if (opNameLower.includes('transfer') || opNameLower.includes('call transfer')) {
                    const transfer = op.classificationResults?.label ||
                        op.result?.label ||
                        op.result ||
                        (typeof op.result === 'string' ? op.result : null);
                    if (transfer) {
                        extractedOperators.callTransfer = String(transfer).trim();
                        logger.log('[Poll CI Analysis] Extracted call transfer:', extractedOperators.callTransfer);
                    }
                }

                // Extract voicemail detection
                if (opNameLower.includes('voicemail')) {
                    const voicemail = op.classificationResults?.label ||
                        op.result?.label ||
                        op.result ||
                        (typeof op.result === 'string' ? op.result : null);
                    if (voicemail) {
                        extractedOperators.voicemail = String(voicemail).trim();
                        logger.log('[Poll CI Analysis] Extracted voicemail:', extractedOperators.voicemail);
                    }
                }

                // Extract call disposition
                if (opNameLower.includes('disposition')) {
                    const disposition = op.classificationResults?.label ||
                        op.result?.label ||
                        op.result ||
                        (typeof op.result === 'string' ? op.result : null);
                    if (disposition) {
                        extractedOperators.disposition = String(disposition).trim();
                        logger.log('[Poll CI Analysis] Extracted disposition:', extractedOperators.disposition);
                    }
                }

                // Extract "Do Not Contact" flag
                if (opNameLower.includes('do not contact') || opNameLower.includes('dont contact')) {
                    const doNotContact = op.phraseMatchResults?.label ||
                        op.result?.label ||
                        op.result ||
                        (typeof op.result === 'string' ? op.result : null);
                    if (doNotContact) {
                        extractedOperators.doNotContact = String(doNotContact).trim();
                        logger.log('[Poll CI Analysis] Extracted do not contact:', extractedOperators.doNotContact);
                    }
                }
            }

            // Store extracted operators for use in conversationalIntelligence
            operatorResultsData = extractedOperators;
        } catch (opError) {
            logger.warn('[Poll CI Analysis] Error fetching OperatorResults:', opError?.message);
            operatorResultsData = { allOperators: [], sentiment: null, callTransfer: null, voicemail: null, disposition: null, doNotContact: null };
        }

        // Analysis is complete, fetch sentences (reuse if already fetched)
        let sentences = [];
        try {
            // Use sentences we already fetched if available, otherwise fetch fresh
            const sentencesResponse = sentencesCheck.length > 0
                ? sentencesCheck
                : await client.intelligence.v2
                    .transcripts(transcriptSid)
                    .sentences.list();

            // DEBUG: Log first sentence structure to see what fields Twilio returns
            if (sentencesResponse.length > 0) {
                const sample = sentencesResponse[0];
                logger.log('[Poll CI Analysis] Sample sentence structure:', {
                    keys: Object.keys(sample),
                    text: sample.text,
                    transcript: sample.transcript,
                    words: sample.words,
                    // CRITICAL: Log all channel-related fields to debug dual-channel issue
                    channel: sample.channel,
                    channelNumber: sample.channelNumber,
                    channel_id: sample.channel_id,
                    channelIndex: sample.channelIndex,
                    mediaChannel: sample.mediaChannel,
                    participantRole: sample.participantRole,
                    participant: sample.participant,
                    raw: JSON.stringify(sample).substring(0, 500)
                });
            }

            // Validate sentence segmentation quality
            if (sentencesResponse.length <= 2) {
                logger.warn('[Poll CI Analysis] Very few sentences detected - possible segmentation failure:', {
                    sentenceCount: sentencesResponse.length,
                    message: 'Expected 5-20+ sentences for typical 1-2 minute calls'
                });
            }

            sentences = sentencesResponse.map((s, idx) => {
                // Try multiple possible channel field names (Twilio API variations)
                let channel = s.channel ?? s.channelNumber ?? s.channel_id ?? s.channelIndex ?? s.mediaChannel;
                let channelNum = null;

                // Also check for participant role which may indicate speaker
                const participantRole = s.participantRole || s.participant?.role || s.role || '';

                if (channel === null || channel === undefined) {
                    // Try to infer from participant role if channel is missing
                    if (participantRole.toLowerCase() === 'agent') {
                        channelNum = Number(channelRoleMap.agentChannel || '1');
                    } else if (participantRole.toLowerCase() === 'customer') {
                        channelNum = Number(channelRoleMap.customerChannel || '2');
                    } else {
                        // Only log first few warnings to avoid spam
                        if (idx < 3) {
                            logger.warn('[Poll CI Analysis] Null/undefined channel detected:', {
                                sentenceIndex: idx,
                                participantRole,
                                availableFields: Object.keys(s).join(', ')
                            });
                        }
                        channelNum = 1; // Default fallback
                    }
                } else if (typeof channel === 'string') {
                    if (channel.toLowerCase() === 'a') channelNum = 1;
                    else if (channel.toLowerCase() === 'b') channelNum = 2;
                    else channelNum = Number(channel) || 1;
                } else {
                    channelNum = Number(channel) || 1;
                }

                // Extract text from multiple possible fields (Twilio API variations)
                // Try text first, then transcript, then words array
                let sentenceText = (s.text || s.transcript || '').toString().trim();

                // If still empty and words array exists, join words
                if (!sentenceText && s.words) {
                    if (Array.isArray(s.words)) {
                        sentenceText = s.words.map(w => (w.word || w.text || w || '')).filter(Boolean).join(' ').trim();
                    } else if (typeof s.words === 'string') {
                        sentenceText = s.words.trim();
                    }
                }

                // Determine speaker - use participant role if available, otherwise channel mapping
                let speaker = 'Agent';
                if (participantRole) {
                    speaker = participantRole.toLowerCase() === 'customer' ? 'Customer' : 'Agent';
                } else {
                    speaker = channelNum === Number(channelRoleMap.agentChannel || '1') ? 'Agent' : 'Customer';
                }

                return {
                    text: sentenceText.trim(),
                    confidence: s.confidence,
                    startTime: s.startTime,
                    endTime: s.endTime,
                    channel: channel,
                    channelNum: channelNum,
                    participantRole: participantRole,
                    speaker: speaker
                };
            });

            // Log channel distribution for debugging
            const channelDistribution = {
                channel1: sentences.filter(s => s.channelNum === 1).length,
                channel2: sentences.filter(s => s.channelNum === 2).length,
                agents: sentences.filter(s => s.speaker === 'Agent').length,
                customers: sentences.filter(s => s.speaker === 'Customer').length,
                withParticipantRole: sentences.filter(s => s.participantRole).length,
                totalSentences: sentences.length
            };
            logger.log('[Poll CI Analysis] Channel distribution:', channelDistribution);

            logger.log(`[Poll CI Analysis] Retrieved ${sentences.length} sentences`, {
                segmentationQuality: sentences.length >= 5 ? 'Good' : sentences.length >= 2 ? 'Poor' : 'Failed'
            });
        } catch (error) {
            logger.error('[Poll CI Analysis] Error fetching sentences:', error);
        }

        // Build transcript strings and proactively upsert to /api/calls (fallback if webhook races/fails)
        try {
            const transcriptText = sentences.map(s => (s.text || '').trim()).filter(Boolean).join(' ');
            const formattedTranscript = sentences
                .filter(s => s.text && s.text.trim())
                .map(s => `${s.speaker}: ${s.text.trim()}`)
                .join('\n\n');

            logger.log('[Poll CI Analysis] Built transcript:', {
                transcriptLength: transcriptText.length,
                sentenceCount: sentences.length,
                sentencesWithText: sentences.filter(s => s.text && s.text.trim()).length,
                firstSentenceText: sentences[0]?.text?.substring(0, 50) || 'EMPTY',
                formattedLength: formattedTranscript.length
            });

            if (transcriptText || sentences.length > 0) {
                const base = process.env.PUBLIC_BASE_URL || 'https://nodal-point-network.vercel.app';

                // Use Twilio-generated summary if available, otherwise create a basic one
                const wordCount = transcriptText.split(/\s+/).filter(Boolean).length;
                const summaryText = twilioSummary
                    ? twilioSummary
                    : `Analysis of ${wordCount}-word conversation.`;

                logger.log('[Poll CI Analysis] Using summary:', {
                    hasTwilioSummary: !!twilioSummary,
                    summaryLength: summaryText.length,
                    preview: summaryText.substring(0, 100)
                });

                const ai = {
                    summary: summaryText,
                    sentiment: operatorResultsData.sentiment || 'Neutral',
                    keyTopics: [],
                    nextSteps: ['Follow up'],
                    painPoints: [],
                    decisionMakers: [],
                    speakerTurns: sentences.map(x => ({ role: x.speaker.toLowerCase(), t: Math.max(0, Math.floor(x.startTime || 0)), text: x.text || '' })),
                    conversationalIntelligence: {
                        transcriptSid,
                        status: transcript.status,
                        sentenceCount: sentences.length,
                        channelRoleMap,
                        operatorResultsCount: operatorResults.length,
                        hasTwilioSummary: !!twilioSummary,
                        // All operator results from Twilio CI (sentiment, call transfer, voicemail, disposition, etc.)
                        operatorResults: operatorResultsData.allOperators,
                        extractedOperators: {
                            sentiment: operatorResultsData.sentiment,
                            callTransfer: operatorResultsData.callTransfer,
                            voicemail: operatorResultsData.voicemail,
                            disposition: operatorResultsData.disposition,
                            doNotContact: operatorResultsData.doNotContact
                        },
                        // CRITICAL: Include sentences with channel info for frontend speaker mapping
                        sentences: sentences.map(s => ({
                            text: s.text || '',
                            startTime: s.startTime,
                            endTime: s.endTime,
                            channel: s.channel,
                            channelNum: s.channelNum,
                            speaker: s.speaker,
                            participantRole: s.participantRole || '',
                            confidence: s.confidence
                        }))
                    },
                    source: 'twilio-conversational-intelligence'
                };
                const finalCallSid = resolvedCallSid || callSidInput || '';
                if (!finalCallSid) {
                    logger.warn('[Poll CI Analysis] Unable to upsert /api/calls due to missing Call SID', { transcriptSid });
                } else {
                    logger.log('[Poll CI Analysis] Saving to Supabase:', {
                        callSid: finalCallSid,
                        transcriptLength: transcriptText.length,
                        hasAIInsights: !!(ai && Object.keys(ai).length > 0),
                        sentenceCount: sentences.length
                    });

                    try {
                        const updateResp = await fetch(`${base}/api/calls`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                callSid: finalCallSid,
                                transcript: transcriptText,
                                formattedTranscript,
                                aiInsights: ai,
                                conversationalIntelligence: ai.conversationalIntelligence
                            })
                        });

                        if (!updateResp.ok) {
                            const errorText = await updateResp.text().catch(() => 'Unknown error');
                            logger.error('[Poll CI Analysis] Supabase update failed:', {
                                status: updateResp.status,
                                statusText: updateResp.statusText,
                                error: errorText
                            });
                        } else {
                            const updateData = await updateResp.json().catch(() => ({}));
                            logger.log('[Poll CI Analysis] Supabase update successful:', {
                                callSid: finalCallSid,
                                updated: updateData.updated || false
                            });
                        }
                    } catch (fetchError) {
                        logger.error('[Poll CI Analysis] Supabase update error:', fetchError.message);
                    }
                }
            }
        } catch (e) {
            logger.warn('[Poll CI Analysis] Fallback upsert failed:', e?.message || e);
        }

        const elapsed = Date.now() - _start;
        try { logger.log('[Poll CI Analysis] Done', { transcriptSid, callSid, elapsedMs: elapsed, sentenceCount: sentences.length }); } catch (_) { }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            analysisComplete: true,
            callSid: resolvedCallSid || callSidInput || '',
            status: {
                transcriptStatus: transcript.status,
                analysisStatus: transcript.analysisStatus,
                ciStatus: transcript.ciStatus,
                processingStatus: transcript.processingStatus
            },
            sentences: sentences,
            sentenceCount: sentences.length,
            updated: true,
            message: 'Analysis completed (background)'
        }));

    } catch (error) {
        logger.error('[Poll CI Analysis] Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: 'Failed to poll CI analysis',
            details: error.message
        }));
        return;
    }
}
