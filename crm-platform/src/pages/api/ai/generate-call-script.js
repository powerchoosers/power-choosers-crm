import { cors } from '../_cors.js';
import logger from '../_logger.js';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';

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
                if (!supabaseAdmin) return null;
                try {
                    const { data, error } = await supabaseAdmin
                        .from('ai_cache')
                        .select('*')
                        .eq('key', researchCacheKey)
                        .maybeSingle();

                    if (error || !data) return null;
                    if (!data.cached_at || (Date.now() - Number(data.cached_at)) > RESEARCH_CACHE_MS) return null;
                    return data.insights || null;
                } catch (e) {
                    logger.warn('[AI Script] Research cache read error:', e.message);
                    return null;
                }
            };

            const writeCache = async (value) => {
                if (!supabaseAdmin) return;
                try {
                    await supabaseAdmin.from('ai_cache').upsert({
                        key: researchCacheKey,
                        cached_at: Date.now(),
                        insights: value,
                        source: 'perplexity-research'
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

        // Check Supabase cache
        if (supabaseAdmin) {
            try {
                const { data: cacheData, error: cacheError } = await supabaseAdmin
                    .from('ai_cache')
                    .select('*')
                    .eq('key', cacheKey)
                    .maybeSingle();

                if (!cacheError && cacheData) {
                    if (Date.now() - Number(cacheData.cached_at || 0) < CACHE_DURATION_MS) {
                        logger.log('[AI Script] Using cached script');
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, script: cacheData.insights?.script || cacheData.insights, cached: true }));
                        return;
                    }
                }
            } catch (e) {
                logger.warn('[AI Script] Cache read error:', e.message);
            }
        }

        const openRouterKey = process.env.OPEN_ROUTER_API_KEY;
        if (!openRouterKey) {
            throw new Error('Missing OPEN_ROUTER_API_KEY');
        }

        const prompt = `
You are Nodal Point's NEPQ Texas cold-call coach for commercial electricity outreach.

CLIENT CONTEXT:
- Name: ${name}
- Company: ${company}
- Industry: ${industry}
- Location: ${location || 'Texas'}
- Current Supplier: ${currentSupplier}
- Contract End Date: ${contractEnd}

WEB RESEARCH (only use if present; do not invent facts):
${researchSummary || '- (no external research found)'}

CORE RULES:
- Lead with curiosity, not claims.
- Use short, spoken-language lines.
- Use plain English and business impact.
- Do not promise savings or guarantee outcomes.
- Do not imply prior audits or flagged errors unless explicitly provided in context.
- Default to Texas/ERCOT framing.
- First-call objective order: (1) book meeting, (2) get bill, (3) permission to send a short note or get introduced to the right person.
- Preferred value phrase: "costs buried in the electricity bill most companies don't realize are there."
- Do not use phrases: "hidden electricity cost drivers", "hidden bill costs", "hidden energy costs".

OUTPUT FORMAT:
Return ONLY script text organized with these labels:
1) Best-fit opener
2) Softer alternate opener
3) Gatekeeper version (if relevant)
4) Direct-line version (if relevant)
5) Likely first objection + response
6) Clean next-step ask
7) Optional voicemail

SCRIPT REQUIREMENTS:
- Opener under 70 words unless context requires longer.
- Include company name in routing question: "who handles electricity agreements at ${company}?"
- Start with disarming language ("help me out for a moment", "not sure if you're the right person", "I know this is out of the blue").
- Objection handling order: Validate -> Clarify -> Problem-expand -> Low-pressure pivot.
- If research exists, weave in 1-2 relevant specifics naturally without overclaiming.

Generate the script now.
`;

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openRouterKey}`,
                'HTTP-Referer': 'https://nodalpoint.io',
                'X-Title': 'Nodal Point CRM',
            },
            body: JSON.stringify({
                model: 'google/gemini-2.5-flash',
                messages: [
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 2048,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`OpenRouter API Error: ${errText}`);
        }

        const data = await response.json();
        const script = data.choices[0].message.content.trim();

        // Cache the result in Supabase
        if (supabaseAdmin) {
            try {
                await supabaseAdmin.from('ai_cache').upsert({
                    key: cacheKey,
                    insights: { script },
                    cached_at: Date.now(),
                    source: 'gemini-script'
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
