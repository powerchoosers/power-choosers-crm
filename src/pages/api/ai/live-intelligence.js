import { cors } from '../_cors.js';

export default async function handler(req, res) {
    if (cors(req, res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.ASSEMBLY_AI_API_KEY;
    if (!apiKey) {
        return res.status(503).json({ error: 'No AssemblyAI API key configured' });
    }

    const { transcript, accountContext } = req.body;

    if (!transcript || transcript.length < 20) {
        return res.status(200).json({ insight: null });
    }

    try {
        const systemPrompt = `You are a Forensic Energy Advisor. Translate technical complaints into business impact (e.g., operating margins, liability profile).

ACCOUNT CONTEXT:
${accountContext || 'Unknown prospect'}

INSTRUCTIONS:
1. Detect any mention of: high bills, demand ratchet, 4CP peaks, contract expiration, or supplier frustration.
2. Pivot to business value: How does this affect their P&L or risk exposure?
3. GO FOR THE CLOSE: Conclude every insight with the exact, jargon-free question the advisor should ask NOW to advance the deal or corner the objection.
4. Be forensic and highly consultative. Max 35 words.
5. If the transcript is idle or nonsense, return "Monitoring signal..."`;

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
