import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * POST /api/ai/war-room-brief
 * Generates a 3-bullet forensic tactical brief using OpenRouter (Gemini 2.5 Flash).
 * GATED — only fires on explicit user button press, never on page load.
 */

interface AccountContext {
    name: string
    contractEndDate: string | null
    lastTouchTs: string | null
    lastCallOutcome: string | null
    industry: string | null
    overdueTaskCount: number
    liabilityScore: number
    liabilityReasons: string[]
}

interface GridContext {
    hubPrice: number | null
    reserves: number | null
    frequency: number | null
    scarcityProb: string | null
}

interface BriefRequest {
    topAccounts: AccountContext[]
    grid: GridContext
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const apiKey = process.env.OPENROUTER_API_KEY || process.env.FREE_GEMINI_KEY
    if (!apiKey) {
        return res.status(503).json({ error: 'No AI API key configured (OPENROUTER_API_KEY or FREE_GEMINI_KEY)' })
    }

    const useOpenRouter = !!process.env.OPENROUTER_API_KEY

    const { topAccounts, grid } = req.body as BriefRequest

    if (!topAccounts?.length) {
        return res.status(400).json({ error: 'topAccounts required' })
    }

    const accountSummary = topAccounts
        .slice(0, 5)
        .map((a, i) => {
            const days = a.contractEndDate
                ? Math.round((new Date(a.contractEndDate).getTime() - Date.now()) / 86400000)
                : null
            const touchDays = a.lastTouchTs
                ? Math.round((Date.now() - new Date(a.lastTouchTs).getTime()) / 86400000)
                : null
            return [
                `${i + 1}. ${a.name} (Score: ${a.liabilityScore})`,
                days !== null ? `   Contract: ${days > 0 ? `expires in ${days}d` : `EXPIRED ${Math.abs(days)}d ago`}` : '   Contract: Unknown',
                touchDays !== null ? `   Last touch: ${touchDays}d ago` : '   Last touch: Never',
                a.lastCallOutcome ? `   Last call outcome: ${a.lastCallOutcome}` : '',
                a.overdueTaskCount ? `   Overdue tasks: ${a.overdueTaskCount}` : '',
                `   Reasons: ${a.liabilityReasons.join(' · ')}`,
            ].filter(Boolean).join('\n')
        })
        .join('\n\n')

    const gridSummary = grid
        ? [
            grid.hubPrice !== null ? `Hub Price: $${grid.hubPrice.toFixed(2)}/MWh` : null,
            grid.reserves !== null ? `Reserves: ${grid.reserves.toLocaleString()} MW${grid.reserves < 3000 ? ' ⚠ TIGHT' : ''}` : null,
            grid.frequency !== null ? `Frequency: ${grid.frequency} Hz` : null,
            grid.scarcityProb ? `Scarcity Probability: ${grid.scarcityProb}%` : null,
        ]
            .filter(Boolean)
            .join(' | ')
        : 'Grid data unavailable'

    const prompt = `You are a forensic energy market advisor specializing in the Texas ERCOT market. Your clients are Fortune 500 procurement officers managing multi-million dollar energy liability.

CURRENT ERCOT GRID STATE:
${gridSummary}

TOP PRIORITY ACCOUNTS (ranked by liability score):
${accountSummary}

INSTRUCTIONS:
Write exactly 3 tactical bullets. Each bullet must:
1. Name WHO to call (account name + why they rank)
2. State WHY NOW — combine one market signal (from grid state) with one CRM signal (from account data)
3. Provide the FIRST SENTENCE the advisor should say (forensic/direct, never "save money")

Use vocabulary: demand ratchet, 4CP coincident peak exposure, scarcity adder, below-scarcity pricing window, transmission liability, contract window closing.

Be terse. No preamble, no sign-off, no fluff. Just the 3 bullets in plain text.`

    try {
        let responseText = ''

        if (useOpenRouter) {
            const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://nodalpoint.io',
                    'X-Title': 'Nodal Point War Room',
                },
                body: JSON.stringify({
                    model: 'google/gemini-2.5-flash',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 600,
                    temperature: 0.3,
                }),
            })
            const orData = await orRes.json()
            responseText = orData.choices?.[0]?.message?.content ?? ''
        } else {
            // Fallback: Google AI directly via Gemini REST
            const geminiRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.FREE_GEMINI_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { maxOutputTokens: 600, temperature: 0.3 },
                    }),
                }
            )
            const geminiData = await geminiRes.json()
            responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
        }

        if (!responseText) {
            return res.status(502).json({ error: 'AI returned empty response' })
        }

        return res.status(200).json({ brief: responseText.trim() })
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return res.status(500).json({ error: 'AI brief generation failed', detail: msg })
    }
}
