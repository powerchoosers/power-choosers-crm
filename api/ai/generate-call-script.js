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

        const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
        const hasCompany = !!(company && company !== 'your company');

        let research = null;
        let researchSummary = '';
        let researchItems = [];

        if (perplexityApiKey && hasCompany) {
            const researchContextStr = JSON.stringify({ company, industry, location });
            const researchCacheKey = `company-research-${crypto.createHash('sha256').update(researchContextStr).digest('hex')}`;
            const RESEARCH_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

            const readCache = async () => {
                if (!db) return null;
                try {
                    const doc = await db.collection('aiCache').doc(researchCacheKey).get();
                    if (!doc.exists) return null;
                    const data = doc.data() || {};
                    if (!data.cachedAt || (Date.now() - data.cachedAt) > RESEARCH_CACHE_MS) return null;
                    return data.research || null;
                } catch (e) {
                    logger.warn('[AI Script] Research cache read error:', e.message);
                    return null;
                }
            };

            const writeCache = async (value) => {
                if (!db) return;
                try {
                    await db.collection('aiCache').doc(researchCacheKey).set({
                        cachedAt: Date.now(),
                        research: value,
                        context: { company, industry, location }
                    });
                } catch (e) {
                    logger.warn('[AI Script] Research cache write error:', e.message);
                }
            };

            research = await readCache();
            if (!research) {
                const userPrompt = `Research ${company}${location ? ` (${location})` : ''}${industry ? ` in ${industry}` : ''}.

Return ONLY valid JSON with this schema:
{
  "facts": [ { "fact": string, "source": string } ],
  "people": [ { "name": string, "title": string, "department": string, "source": string } ],
  "news": [ { "headline": string, "date": string, "source": string } ],
  "hiringSignals": [ { "signal": string, "source": string } ],
  "notes": string
}

Focus on: latest news (past 12 months), leadership (CEO/CFO/Controller), operations/facilities decision-makers, ownership changes, and any hiring/expansion signals. If unknown, omit items; do not guess.`;

                const perplexityResp = await fetch('https://api.perplexity.ai/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${perplexityApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'sonar',
                        messages: [
                            { role: 'system', content: 'You are a research assistant. Only output valid JSON. Do not include markdown.' },
                            { role: 'user', content: userPrompt }
                        ],
                        max_tokens: 1200,
                        temperature: 0.2
                    })
                });

                if (perplexityResp.ok) {
                    const pJson = await perplexityResp.json().catch(() => null);
                    const raw = pJson?.choices?.[0]?.message?.content || '';
                    const cleaned = String(raw).replace(/```json\s*|```\s*/g, '').trim();
                    try {
                        research = JSON.parse(cleaned);
                        await writeCache(research);
                    } catch (e) {
                        research = null;
                    }
                } else {
                    const errText = await perplexityResp.text().catch(() => '');
                    logger.warn('[AI Script] Perplexity research failed:', `${perplexityResp.status} ${errText}`.slice(0, 300));
                }
            }

            if (research) {
                const facts = Array.isArray(research.facts) ? research.facts : [];
                const people = Array.isArray(research.people) ? research.people : [];
                const news = Array.isArray(research.news) ? research.news : [];
                const hiring = Array.isArray(research.hiringSignals) ? research.hiringSignals : [];

                const pick = (arr, n) => arr.filter(Boolean).slice(0, n);
                researchItems = [
                    ...pick(facts, 5).map(x => ({ label: x.fact, source: x.source })),
                    ...pick(people, 5).map(x => ({ label: `${x.name} — ${x.title}${x.department ? ` (${x.department})` : ''}`, source: x.source })),
                    ...pick(news, 5).map(x => ({ label: `${x.headline}${x.date ? ` (${x.date})` : ''}`, source: x.source })),
                    ...pick(hiring, 5).map(x => ({ label: x.signal, source: x.source }))
                ].filter(x => x && x.label);

                researchSummary = researchItems.slice(0, 8).map(x => `- ${x.label}${x.source ? ` [${x.source}]` : ''}`).join('\n');
            }
        }

        // Create a cache key based on the context to avoid redundant API calls
        const contextStr = JSON.stringify({ name, company, industry, contractEnd, currentSupplier, researchSummary });
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

WEB RESEARCH (only use if present; do not invent facts):
${researchSummary || '- (no external research found)'}

PEACE FRAMEWORK INSTRUCTIONS:
1. **Pre-call**: Briefly state the specific angle/leverage for this call (e.g., industry-specific trend, local TDU rate hike, or upcoming contract expiry).
2. **Opener**: A strong hook. Mention their company and a specific reason for calling today. Avoid generic "how are you" openings.
3. **Situation**: 
   - **IF TEXAS (ERCOT)**: Assume they shop for their own rate (deregulation is mandatory). If supplier/contract info is missing, ask how they manage their renewal cycles or who they're currently trusting with their procurement.
   - **IF OTHER DEREGULATED STATES (e.g., PA, OH, IL, NY, NJ, MD, MA, CT, DE, NH, RI)**: Acknowledge they have the choice between the utility's "default rate" (Price to Compare) and shopping. If info is missing, ask if they are currently riding the utility default or if they've explored the market recently.
   - **IF DATA IS MISSING**: NEVER use words like "unknown," "unaware," or "visibility." Instead, use a **Discovery Hook**:
     - *Industry Pivot*: "Usually, companies in ${industry} are either locked into a long-term fixed rate to handle high demand, or they're just riding the utility's default. Where do you guys currently stand?"
     - *Market Volatility*: "With the recent volatility in ${location}, many facilities are trying to figure out if their current setup is actually protecting them from peak-hour spikes. How have you been handling those delivery charge increases lately?"
4. **Problem**: Highlight a specific risk or missed opportunity (e.g., "Most companies in ${industry} are seeing 20% spikes in demand charges right now"). CRITICAL: Immediately follow the problem with a fluid, open-ended question that flows naturally from the statement to invite the client to share their experience (e.g., "How has that been impacting your operational budget over the last few months?").
5. **Solution**: Provide the low-friction next step (The "Broker Audit") and how it solves the problem.
6. **Close**: A clear call to action to move to the next step.
7. **Settle**: A brief wrap-up line to confirm the next action and end the call on a high note.

FORMATTING:
- Use <span class="tone-marker">tags</span> to indicate the recommended tone for specific lines.
- Use <span class="pause-indicator"></span> for natural pauses.
- Keep it concise, conversational, and direct.
- Return ONLY the script text, organized by the labels: Pre-call, Opener, Situation, Problem, Solution, Close, Settle.

RULES:
- If WEB RESEARCH is empty, do not reference news/people/hires.
- If WEB RESEARCH has items, weave 1–2 highly relevant specifics into the Opener and Situation.
- When referencing research, cite it softly as "I saw" / "I noticed" and mention the source type in parentheses if provided.
- **NEVER** state that you don't know something. Frame lack of data as a diagnostic question.
- In Texas, assume they are under contract with a 3rd party provider.
- In other states, assume they might be on the utility's default "Price to Compare" rate unless a supplier is listed.
- Ensure the Problem section always ends with a conversation-opening question.

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
