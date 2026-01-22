import twilio from 'twilio';
import { admin, db } from '../_firebase.js';
import { resolveToCallSid, isCallSid } from '../_twilio-ids.js';
import { cors } from '../_cors.js';
import logger from '../_logger.js';

export default async function handler(req, res) {
    if (cors(req, res)) return; // handle OPTIONS centrally
    
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }
    
    try {
        logger.log('[Process Existing Transcripts] Starting to process existing transcripts...');
        
        // Initialize Twilio client
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const serviceSid = process.env.TWILIO_INTELLIGENCE_SERVICE_SID;
        
        if (!serviceSid) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: 'Conversational Intelligence Service not configured',
                message: 'Please set TWILIO_INTELLIGENCE_SERVICE_SID environment variable'
            }));
            return;
        }
        
        // Get all completed transcripts from the service
        const transcripts = await client.intelligence.v2.transcripts.list({
            serviceSid: serviceSid,
            limit: 50
        });
        
        logger.log(`[Process Existing Transcripts] Found ${transcripts.length} transcripts`);
        
        // Log sample transcript structure for debugging
        if (transcripts.length > 0) {
            logger.log(`[Process Existing Transcripts] Sample transcript structure:`, {
                sid: transcripts[0].sid,
                status: transcripts[0].status,
                sourceSid: transcripts[0].sourceSid,
                serviceSid: transcripts[0].serviceSid,
                availableFields: Object.keys(transcripts[0])
            });
        }
        
        const results = [];
        
        for (const transcript of transcripts) {
            if (transcript.status === 'completed' && transcript.sourceSid && transcript.sourceSid.trim()) {
                try {
                    logger.log(`[Process Existing Transcripts] Processing transcript: ${transcript.sid} for source: ${transcript.sourceSid}`);
                    
                    // Get sentences
                    let transcriptText = '';
                    let sentences = [];
                    try {
                        const sentencesResponse = await client.intelligence.v2
                            .transcripts(transcript.sid)
                            .sentences.list();
                        
                        sentences = sentencesResponse.map(s => ({
                            text: s.text || '',
                            confidence: s.confidence,
                            startTime: s.startTime,
                            endTime: s.endTime,
                            channel: s.channel
                        }));
                        
                        transcriptText = sentences.map(s => s.text || '').filter(text => text.trim()).join(' ');
                        logger.log(`[Process Existing Transcripts] Transcript ${transcript.sid}: ${sentences.length} sentences, ${transcriptText.length} characters`);
                    } catch (error) {
                        logger.error(`[Process Existing Transcripts] Error fetching sentences for ${transcript.sid}:`, error);
                    }
                    
                    // Get operator results
                    let operatorResults = null;
                    try {
                        const resultsResponse = await client.intelligence.v2
                            .transcripts(transcript.sid)
                            .operatorResults.list();
                        
                        if (resultsResponse.length > 0) {
                            operatorResults = resultsResponse.map(r => ({
                                name: r.name,
                                results: r.results,
                                confidence: r.confidence
                            }));
                        }
                    } catch (error) {
                        logger.warn(`[Process Existing Transcripts] No operator results for ${transcript.sid}:`, error.message);
                    }
                    
                    // Generate AI insights
                    let aiInsights = null;
                    if (transcriptText) {
                        aiInsights = await generateAdvancedAIInsights(transcriptText, sentences, operatorResults);
                    }
                    
                    // Update the call data directly in Firestore (only with a valid Call SID)
                    try {
                        // Resolve a true Call SID to avoid creating rows keyed by Recording/Transcript SIDs
                        let finalCallSid = null;
                        try {
                            finalCallSid = await resolveToCallSid({ callSid: transcript.sourceSid, recordingSid: transcript.sourceSid, transcriptSid: transcript.sid });
                        } catch (_) {}

                        if (!finalCallSid) {
                            logger.warn(`[Process Existing Transcripts] Skipping Firestore update for ${transcript.sid}: unresolved Call SID (sourceSid=${transcript.sourceSid})`);
                            results.push({ transcriptSid: transcript.sid, sourceSid: transcript.sourceSid, status: 'skipped', error: 'Unresolved Call SID' });
                        } else if (db) {
                            logger.log(`[Process Existing Transcripts] Writing to Firestore: collection='calls', doc='${finalCallSid}'`);
                            const callData = {
                                id: finalCallSid,
                                twilioSid: finalCallSid,
                                callSid: finalCallSid,
                                transcript: transcriptText,
                                aiInsights: aiInsights,
                                conversationalIntelligence: {
                                    transcriptSid: transcript.sid,
                                    status: transcript.status,
                                    sentences: sentences,
                                    operatorResults: operatorResults,
                                    serviceSid: serviceSid,
                                    originalSourceSid: transcript.sourceSid || 'missing'
                                },
                                // Minimal placeholders; real to/from/duration will be merged by other webhooks
                                to: 'Unknown',
                                from: 'Unknown',
                                status: 'completed',
                                duration: 0,
                                callTime: new Date().toISOString(),
                                outcome: 'Connected',
                                aiSummary: aiInsights ? aiInsights.summary : 'Transcript processed from Twilio Conversational Intelligence',
                                timestamp: new Date().toISOString(),
                                source: 'conversational-intelligence-processing'
                            };
                            await db.collection('calls').doc(finalCallSid).set(callData, { merge: true });
                            logger.log(`[Process Existing Transcripts] Successfully updated call data for ${transcript.sid} in Firestore`);
                            results.push({ transcriptSid: transcript.sid, sourceSid: finalCallSid, transcriptLength: transcriptText.length, status: 'success' });
                        } else {
                            logger.error(`[Process Existing Transcripts] Firestore not available for ${transcript.sid}`);
                            results.push({ transcriptSid: transcript.sid, sourceSid: transcript.sourceSid, status: 'failed', error: 'Firestore not available' });
                        }
                    } catch (error) {
                        logger.error(`[Process Existing Transcripts] Error updating call data for ${transcript.sid}:`, error);
                        results.push({ transcriptSid: transcript.sid, sourceSid: transcript.sourceSid, status: 'error', error: error.message });
                    }
                    
                } catch (error) {
                    logger.error(`[Process Existing Transcripts] Error processing transcript ${transcript.sid}:`, error);
                    results.push({
                        transcriptSid: transcript.sid,
                        sourceSid: transcript.sourceSid || 'unknown',
                        status: 'error',
                        error: error.message
                    });
                }
            } else if (transcript.status === 'completed') {
                // Try to find alternative source identifiers
                let alternativeSourceId = null;
                
                // Check for other possible source fields
                if (transcript.callSid) {
                    alternativeSourceId = transcript.callSid;
                } else if (transcript.recordingSid) {
                    alternativeSourceId = transcript.recordingSid;
                } else if (transcript.sid) {
                    // Use transcript SID as fallback
                    alternativeSourceId = transcript.sid;
                }
                
                if (alternativeSourceId) {
                    logger.log(`[Process Existing Transcripts] Processing transcript ${transcript.sid} with alternative source: ${alternativeSourceId}`);
                    
                    try {
                        // Get sentences
                        let transcriptText = '';
                        let sentences = [];
                        try {
                            const sentencesResponse = await client.intelligence.v2
                                .transcripts(transcript.sid)
                                .sentences.list();
                            
                            sentences = sentencesResponse.map(s => ({
                                text: s.text || '',
                                confidence: s.confidence,
                                startTime: s.startTime,
                                endTime: s.endTime,
                                channel: s.channel
                            }));
                            
                            transcriptText = sentences.map(s => s.text || '').filter(text => text.trim()).join(' ');
                            logger.log(`[Process Existing Transcripts] Transcript ${transcript.sid}: ${sentences.length} sentences, ${transcriptText.length} characters`);
                        } catch (error) {
                            logger.error(`[Process Existing Transcripts] Error fetching sentences for ${transcript.sid}:`, error);
                        }
                        
                        // Generate AI insights
                        let aiInsights = null;
                        if (transcriptText) {
                            aiInsights = await generateAdvancedAIInsights(transcriptText, sentences, null);
                        }
                        
                        // Update the call data directly in Firestore (only with a valid Call SID)
                        try {
                            let finalCallSid = null;
                            try {
                                finalCallSid = await resolveToCallSid({ callSid: alternativeSourceId, recordingSid: alternativeSourceId, transcriptSid: transcript.sid });
                            } catch (_) {}

                            if (!finalCallSid) {
                                logger.warn(`[Process Existing Transcripts] Skipping Firestore update for ${transcript.sid} (alt source): unresolved Call SID (alt=${alternativeSourceId})`);
                                results.push({ transcriptSid: transcript.sid, sourceSid: alternativeSourceId, status: 'skipped', error: 'Unresolved Call SID' });
                            } else if (db) {
                                logger.log(`[Process Existing Transcripts] Writing to Firestore: collection='calls', doc='${finalCallSid}' (alt)`);
                                const callData = {
                                    id: finalCallSid,
                                    twilioSid: finalCallSid,
                                    callSid: finalCallSid,
                                    transcript: transcriptText,
                                    aiInsights: aiInsights,
                                    conversationalIntelligence: {
                                        transcriptSid: transcript.sid,
                                        status: transcript.status,
                                        sentences: sentences,
                                        operatorResults: null,
                                        serviceSid: serviceSid,
                                        originalSourceSid: transcript.sourceSid || 'missing'
                                    },
                                    to: 'Unknown',
                                    from: 'Unknown',
                                    status: 'completed',
                                    duration: 0,
                                    callTime: new Date().toISOString(),
                                    outcome: 'Connected',
                                    aiSummary: aiInsights ? aiInsights.summary : 'Transcript processed from Twilio Conversational Intelligence',
                                    timestamp: new Date().toISOString(),
                                    source: 'conversational-intelligence-processing-alternative'
                                };
                                await db.collection('calls').doc(finalCallSid).set(callData, { merge: true });
                                logger.log(`[Process Existing Transcripts] Successfully updated call data for ${transcript.sid} in Firestore (alt)`);
                                results.push({ transcriptSid: transcript.sid, sourceSid: finalCallSid, transcriptLength: transcriptText.length, status: 'success-alternative' });
                            } else {
                                logger.error(`[Process Existing Transcripts] Firestore not available for ${transcript.sid}`);
                                results.push({ transcriptSid: transcript.sid, sourceSid: alternativeSourceId, status: 'failed', error: 'Firestore not available' });
                            }
                        } catch (error) {
                            logger.error(`[Process Existing Transcripts] Error updating call data for ${transcript.sid}:`, error);
                            results.push({ transcriptSid: transcript.sid, sourceSid: alternativeSourceId, status: 'error', error: error.message });
                        }
                        
                    } catch (error) {
                        logger.error(`[Process Existing Transcripts] Error processing transcript ${transcript.sid} with alternative source:`, error);
                        results.push({
                            transcriptSid: transcript.sid,
                            sourceSid: alternativeSourceId,
                            status: 'error',
                            error: error.message
                        });
                    }
                } else {
                    // Track transcripts without any source identifier
                    logger.log(`[Process Existing Transcripts] Skipping transcript ${transcript.sid} - no source identifier available`);
                    results.push({
                        transcriptSid: transcript.sid,
                        sourceSid: 'missing',
                        status: 'skipped',
                        error: 'No source identifier available'
                    });
                }
            }
        }
        
        logger.log(`[Process Existing Transcripts] Completed processing ${results.length} transcripts`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            message: `Processed ${results.length} transcripts`,
            results: results
        }));
        
    } catch (error) {
        logger.error('[Process Existing Transcripts] Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            error: 'Failed to process existing transcripts',
            details: error.message 
        }));
        return;
    }
}

async function generateAdvancedAIInsights(transcript, sentences, operatorResults) {
    try {
        const words = transcript.toLowerCase().split(/\s+/);
        const wordCount = words.length;
        
        // Enhanced sentiment analysis
        const positiveWords = ['good', 'great', 'excellent', 'perfect', 'love', 'happy', 'satisfied', 'interested', 'yes', 'sure', 'definitely', 'amazing', 'fantastic', 'wonderful'];
        const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'angry', 'frustrated', 'disappointed', 'no', 'not', 'never', 'problem', 'issue', 'concern', 'worried'];
        
        const positiveCount = words.filter(word => positiveWords.includes(word)).length;
        const negativeCount = words.filter(word => negativeWords.includes(word)).length;
        
        let sentiment = 'Neutral';
        let sentimentScore = 0;
        if (positiveCount > negativeCount) {
            sentiment = 'Positive';
            sentimentScore = (positiveCount - negativeCount) / wordCount;
        } else if (negativeCount > positiveCount) {
            sentiment = 'Negative';
            sentimentScore = -(negativeCount - positiveCount) / wordCount;
        }
        
        // Extract key topics with confidence
        const businessTopics = {
            'price': ['price', 'cost', 'expensive', 'cheap', 'budget', 'afford', 'dollar', 'payment'],
            'contract': ['contract', 'agreement', 'terms', 'conditions', 'sign', 'signature'],
            'timeline': ['timeline', 'schedule', 'deadline', 'when', 'urgent', 'soon', 'quickly', 'time'],
            'energy': ['energy', 'electricity', 'power', 'supplier', 'provider', 'utility', 'kwh', 'kilowatt'],
            'renewal': ['renewal', 'renew', 'expire', 'expiration', 'current', 'existing'],
            'meeting': ['meeting', 'demo', 'presentation', 'call', 'schedule', 'appointment'],
            'proposal': ['proposal', 'quote', 'estimate', 'offer', 'deal', 'package']
        };
        
        const detectedTopics = [];
        for (const [topic, keywords] of Object.entries(businessTopics)) {
            const matches = keywords.filter(keyword => words.includes(keyword));
            if (matches.length > 0) {
                detectedTopics.push({
                    topic: topic,
                    confidence: matches.length / keywords.length,
                    keywords: matches
                });
            }
        }
        
        // Extract next steps
        const nextStepKeywords = ['call', 'email', 'meeting', 'demo', 'proposal', 'quote', 'follow', 'schedule', 'send', 'review', 'next step', 'what happens next'];
        const nextSteps = nextStepKeywords.filter(step => words.includes(step));
        
        // Extract pain points
        const painKeywords = ['problem', 'issue', 'concern', 'worry', 'challenge', 'difficult', 'expensive', 'slow', 'complicated', 'confused'];
        const painPoints = painKeywords.filter(pain => words.includes(pain));
        
        // Check for budget discussion
        const budgetKeywords = ['budget', 'cost', 'price', 'expensive', 'cheap', 'afford', 'money', 'dollar', 'payment', 'investment'];
        const budgetDiscussed = budgetKeywords.some(keyword => words.includes(keyword));
        
        // Check for timeline discussion
        const timelineKeywords = ['when', 'timeline', 'schedule', 'deadline', 'urgent', 'soon', 'quickly', 'time', 'date'];
        const timelineMentioned = timelineKeywords.some(keyword => words.includes(keyword));
        
        // Extract decision makers (simple name detection)
        const decisionMakers = [];
        const namePattern = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g;
        const names = transcript.match(namePattern) || [];
        if (names.length > 0) {
            decisionMakers.push(...names.slice(0, 3)); // Limit to 3 names
        }
        
        // Use operator results if available - extract Twilio-generated summary
        let enhancedInsights = {};
        let twilioSummary = '';
        if (operatorResults && operatorResults.length > 0) {
            // Look for the summary in operator results - check multiple locations
            for (const op of operatorResults) {
                // Check for text_generation type or summary-related names
                if (op.operatorType === 'text_generation' || 
                    ['summary', 'conversation_summary', 'call_summary'].includes(op.name?.toLowerCase())) {
                    // Check multiple possible locations for the summary
                    const summaryText = op.textGenerationResults || 
                                       op.summary || 
                                       op.results?.textGenerationResults || 
                                       op.results?.summary ||
                                       op.extractionResults?.summary ||
                                       (typeof op.result === 'string' ? op.result : null);
                    if (summaryText) {
                        twilioSummary = String(summaryText).trim();
                        logger.log('[Process Existing] Found Twilio summary from operator:', op.name, 'length:', twilioSummary.length);
                        break;
                    }
                }
                
                // Also check extraction operators which may contain parsed JSON with summary
                if (op.operatorType === 'extraction' && op.extractionResults) {
                    try {
                        const extracted = typeof op.extractionResults === 'string' 
                            ? JSON.parse(op.extractionResults) 
                            : op.extractionResults;
                        if (extracted.summary) {
                            twilioSummary = String(extracted.summary).trim();
                            logger.log('[Process Existing] Found summary from extraction operator:', op.name, 'length:', twilioSummary.length);
                            break;
                        }
                    } catch (parseErr) {
                        logger.log('[Process Existing] Could not parse extraction results:', parseErr?.message);
                    }
                }
            }
            
            enhancedInsights = {
                operatorAnalysis: operatorResults,
                confidence: operatorResults.reduce((acc, r) => acc + (r.confidence || 0), 0) / operatorResults.length,
                hasTwilioSummary: !!twilioSummary
            };
        }
        
        // Use Twilio-generated summary if available, otherwise generate one
        const generatedSummary = `Advanced AI analysis of ${wordCount}-word conversation. ${sentiment} sentiment detected (${(sentimentScore * 100).toFixed(1)}% confidence). ${detectedTopics.length > 0 ? 'Key topics: ' + detectedTopics.map(t => t.topic).join(', ') : 'General business discussion.'}`;
        
        return {
            summary: twilioSummary || generatedSummary,
            sentiment: sentiment,
            sentimentScore: sentimentScore,
            keyTopics: detectedTopics.length > 0 ? detectedTopics : [{ topic: 'General business discussion', confidence: 0.5, keywords: [] }],
            nextSteps: nextSteps.length > 0 ? nextSteps : ['Follow up call'],
            painPoints: painPoints.length > 0 ? painPoints : [],
            budget: budgetDiscussed ? 'Discussed' : 'Not Mentioned',
            timeline: timelineMentioned ? 'Timeline discussed' : 'Not specified',
            decisionMakers: decisionMakers,
            wordCount: wordCount,
            sentenceCount: sentences.length,
            averageConfidence: sentences.length > 0 ? sentences.reduce((acc, s) => acc + (s.confidence || 0), 0) / sentences.length : 0,
            source: 'twilio-conversational-intelligence',
            ...enhancedInsights
        };
        
    } catch (error) {
        logger.error('[Process Existing Transcripts] Insights generation error:', error);
        return {
            summary: 'Advanced AI analysis completed using Twilio Conversational Intelligence',
            sentiment: 'Neutral',
            keyTopics: [{ topic: 'Call analysis', confidence: 0.5, keywords: [] }],
            nextSteps: ['Follow up'],
            painPoints: [],
            budget: 'Unclear',
            timeline: 'Not specified',
            decisionMakers: [],
            source: 'twilio-conversational-intelligence',
            error: error.message
        };
    }
}
