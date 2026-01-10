import { cors } from '../_cors.js';
import logger from '../_logger.js';
import crypto from 'crypto';
import { db } from '../_firebase.js';

export default async function handler(req, res) {
    if (cors(req, res)) return;

    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
        return;
    }

    try {
        const { contact, account, context } = req.body;

        if (!contact && !account) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Contact or Account context is required' }));
            return;
        }

        const name = contact?.name || contact?.firstName || 'there';
        const company = account?.name || account?.companyName || context?.company || 'your company';
        const industry = account?.industry || 'your industry';
        const location = account?.city ? `${account.city}, ${account.state || ''}` : '';
        const contractEnd = account?.contract_end || account?.contractEnd || 'unknown';
        const currentSupplier = account?.supplier || 'unknown';

        // Create a cache key based on the context to avoid redundant API calls
        const contextStr = JSON.stringify({ name, company, industry, contractEnd, currentSupplier });
        const cacheKey = `ai-script-${crypto.createHash('sha256').update(contextStr).digest('hex')}`;
        const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

        // Check Firestore cache
        if (db) {
            try {
                const cacheDoc = await db.collection('aiCache').doc(cacheKey).get();
                if (cacheDoc.exists) {
                    const cacheData = cacheDoc.data();
                    if (Date.now() - (cacheData.cachedAt || 0) < CACHE_DURATION_MS) {
                        logger.log('[AI Script] Using cached script');
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, script: cacheData.script, cached: true }));
                        return;
                    }
                }
            } catch (e) {
                logger.warn('[AI Script] Cache read error:', e.message);
            }
        }

        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const apiKey = process.env.GEMINI_API_KEY || process.env.FREE_GEMINI_KEY;

        if (!apiKey) {
            throw new Error('Missing GEMINI_API_KEY or FREE_GEMINI_KEY');
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const preferredModel = (process.env.GEMINI_MODEL || '').trim();
        const modelCandidates = [
            preferredModel,
            'gemini-2.0-flash',
            'gemini-2.0-flash-exp',
            'gemini-flash-latest',
            'gemini-pro-latest'
        ].filter(Boolean);

        const prompt = `
You are Lewis Patterson, Lead Energy Strategist at Power Choosers. You are preparing for a cold call to a potential commercial energy client.
Generate a tailored, professional, and high-leverage call script using the PEACE framework.

CLIENT CONTEXT:
- Name: ${name}
- Company: ${company}
- Industry: ${industry}
- Location: ${location}
- Current Supplier: ${currentSupplier}
- Contract End Date: ${contractEnd}

PEACE FRAMEWORK INSTRUCTIONS:
1. **P**re-call: Briefly state the specific angle/leverage for this call (e.g., industry-specific trend, local TDU rate hike, or upcoming contract expiry).
2. **O**pening: A strong hook. Mention their company and a specific reason for calling today. Avoid generic "how are you" openings.
3. **S**ituation: Acknowledge their current situation (e.g., "I see you're with ${currentSupplier} and might be coming up on a renewal").
4. **P**roblem: Highlight a specific risk or missed opportunity (e.g., "Most companies in ${industry} are seeing 20% spikes in demand charges right now").
5. **C**onsequence: Explain what happens if they ignore this (e.g., "Missing this window could lock you into a 24-month peak-rate contract").
6. **S**olution: Provide the low-friction next step (The "Broker Audit").

FORMATTING:
- Use <span class="tone-marker">tags</span> to indicate the recommended tone for specific lines.
- Use <span class="pause-indicator"></span> for natural pauses.
- Keep it concise, conversational, and direct.
- Return ONLY the script text, organized by the PEACE phases.

Generate the script now:
`;

        let script = '';
        let lastErr = null;
        for (const modelName of modelCandidates) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(prompt);
                const response = await result.response;
                script = response.text();
                lastErr = null;
                break;
            } catch (e) {
                lastErr = e;
                const msg = (e && (e.message || String(e))) || '';
                const modelNotFound = msg.includes('not found for API version') || msg.includes('models/') || msg.includes('404');
                if (!modelNotFound) break;
            }
        }

        if (lastErr) throw lastErr;

        // Cache the result
        if (db) {
            try {
                await db.collection('aiCache').doc(cacheKey).set({
                    script,
                    cachedAt: Date.now(),
                    context: { name, company, industry, contractEnd, currentSupplier }
                });
            } catch (e) {
                logger.warn('[AI Script] Cache write error:', e.message);
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, script, cached: false }));

    } catch (error) {
        logger.error('[AI Script] Generation error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Failed to generate AI script', details: error.message }));
    }
}
