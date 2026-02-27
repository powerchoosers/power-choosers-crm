import { cors } from '../_cors.js';
import { supabaseAdmin } from '../../../lib/supabase';

export default async function handler(req, res) {
    if (cors(req, res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.ASSEMBLY_AI_API_KEY;
    if (!apiKey) {
        return res.status(503).json({ error: 'No AssemblyAI API key configured' });
    }

    const { transcript, accountId } = req.body;

    if (!transcript || transcript.length < 20) {
        return res.status(200).json({ insight: null });
    }

    try {
        let accountContext = 'Unknown prospect';
        let industry = 'your industry';
        
        if (accountId) {
            const { data: account } = await supabaseAdmin
                .from('accounts')
                .select('name, industry, location')
                .eq('id', accountId)
                .single();
                
            if (account) {
                industry = account.industry || 'your industry';
                accountContext = `Account: ${account.name} | Industry: ${industry} | Location: ${account.location || 'Unknown'}`;
                
                // Try grabbing the most recent call summary to add context
                const { data: lastCall } = await supabaseAdmin
                    .from('calls')
                    .select('summary')
                    .eq('accountId', accountId)
                    .order('timestamp', { ascending: false })
                    .limit(1)
                    .single();
                    
                if (lastCall?.summary) {
                    accountContext += ` | Previous Call Context: ${lastCall.summary}`;
                }
            }
        }

        const systemPrompt = `You are a Forensic Energy Advisor executing the Nodal Point NEPQ playbook. You feed the live sales agent exactly what to say next based on the prospect's real-time words.

ACCOUNT CONTEXT (Use this to customize the script):
${accountContext}

NEPQ PLAYBOOK RULES & PSYCHOLOGY:
1. GATEKEEPERS & OPENERS:
   - Gatekeeper: Assumptive tone. "I'm calling for [Name] about the energy structural audit, are they around?" Or "Can you pass me to who handles operations/energy?"
   - Decision Maker Opener: "Hey, I'm calling about the ${industry} side of your business. When ${industry} teams renew contracts, they often see hidden demand ratchet liabilities. Is this something you guys are currently experiencing?"
2. SELL THE INEFFICIENCY: Never say "save money". Use forensic terms: "structural inefficiency", "demand ratchet liability", "4CP peak exposure".
3. DISARM OBJECTIONS: 
   - "Not interested": "When you say not interested, is it that you're locked in, or just not looking at energy spend right now?"
   - "Locked in": "Perfect. When you do renew, will you have a benchmark to know if you're getting a fair deal, or just go back to your current provider?"
   - "We use a broker": "Got it. Did they do a structural analysis of your demand profile, or just get you pricing?"
   - "Plenty of time": "That's great timing. But what happens if you wait until month 11 to start? You'll have no baseline."
   - "Send an email": "I can do that, but in 3 weeks you won't remember this. What if we just grab a 12-min audit next week so you get specific data?"
4. TONE & CURIOSITY: Calm, diagnostic. Always end with a question (e.g. "Does that make sense?", "Fair?").

INSTRUCTIONS:
1. Analyze the transcript snippet.
2. Provide the EXACT, conversational sentences the advisor should read NOW to diffuse objections and advance the diagnosis.
3. Max 45 words. Make it punchy and instantly readable.
4. If the transcript is idle or nonsense, return "Monitoring signal..."`;

        // The AssemblyAI LLM Gateway gives you access to top tier models with very low latency
        const response = await fetch('https://api.assemblyai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `LIVE TRANSCRIPT SNIPPET:\n\n"${transcript}"` }
                ],
                max_tokens: 100,
                temperature: 0.3,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[LLM Gateway] AssemblyAI API Error:', data);

            // Fallback for models without native 'system' role or if the specific sonnet model name differs
            // Try with standard haiku model if sonnet fails
            if (data.error && data.error.message && data.error.message.includes("model")) {
                const fallbackRes = await fetch('https://api.assemblyai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'claude-3-haiku',
                        messages: [
                            { role: 'user', content: `SYSTEM: ${systemPrompt}\n\nLIVE TRANSCRIPT SNIPPET:\n\n"${transcript}"` }
                        ],
                        max_tokens: 100,
                        temperature: 0.3,
                    }),
                });
                const fallbackData = await fallbackRes.json();
                const insightFallback = fallbackData.choices?.[0]?.message?.content ?? null;
                return res.status(200).json({ insight: insightFallback?.trim() });
            }

            throw new Error(data.error?.message || 'Gateway Error');
        }

        const insight = data.choices?.[0]?.message?.content ?? null;

        return res.status(200).json({ insight: insight?.trim() });
    } catch (err) {
        console.error('Live Intelligence Error:', err);
        return res.status(500).json({ error: 'Failed to generate live insight' });
    }
}
