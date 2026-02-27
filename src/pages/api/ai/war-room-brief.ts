import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * POST /api/ai/war-room-brief
 * Generates a deep forensic tactical brief using OpenRouter (Gemini 2.5 Flash).
 * Fetches transcripts, emails, and stakeholder context for top priority accounts.
 */

interface AccountContext {
    id: string
    name: string
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
    signalHistory: any[]
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const apiKey = process.env.OPEN_ROUTER_API_KEY || process.env.FREE_GEMINI_KEY
    if (!apiKey) {
        return res.status(503).json({ error: 'No AI API key configured' })
    }

    const { topAccounts, grid, signalHistory } = req.body as BriefRequest

    if (!topAccounts?.length) {
        return res.status(400).json({ error: 'topAccounts required' })
    }

    const accountIds = topAccounts.slice(0, 5).map(a => a.id)

    try {
        // Parallel fetch of deep intelligence
        const [
            { data: fullAccounts },
            { data: contacts },
            { data: calls },
            { data: emails },
            { data: tasks },
            { data: docs }
        ] = await Promise.all([
            supabaseAdmin.from('accounts').select('*').in('id', accountIds),
            supabaseAdmin.from('contacts').select('*').in('accountId', accountIds),
            supabaseAdmin.from('calls').select('*').in('accountId', accountIds).order('timestamp', { ascending: false }).limit(20),
            supabaseAdmin.from('emails').select('*').in('accountId', accountIds).order('timestamp', { ascending: false }).limit(20),
            supabaseAdmin.from('tasks').select('*').in('accountId', accountIds).eq('status', 'overdue'),
            supabaseAdmin.from('documents').select('*').in('account_id', accountIds)
        ])

        // Build Intelligence Dossiers
        const dossiers = topAccounts.slice(0, 5).map(a => {
            const acc = fullAccounts?.find(f => f.id === a.id)
            const accContacts = contacts?.filter(c => c.accountId === a.id) || []
            const accCalls = calls?.filter(c => c.accountId === a.id).slice(0, 3) || []
            const accEmails = emails?.filter(c => c.accountId === a.id).slice(0, 3) || []
            const accTasks = tasks?.filter(t => t.accountId === a.id) || []
            const accDocs = docs?.filter(d => d.account_id === a.id) || []

            return `
[DOSSIER: ${a.name}]
Score: ${a.liabilityScore}
Industry: ${acc?.industry || 'Unknown'}
Liability Profile: ${a.liabilityReasons.join(' · ')}
Load Factor: ${acc?.load_factor || 'Unknown'}
Electricity Supplier: ${acc?.electricity_supplier || 'Unknown'}
Contract End: ${acc?.contract_end_date || 'Unknown'}

STAKEHOLDER MAP:
${accContacts.map(c => `- ${c.firstName} ${c.lastName} (${c.title || 'No Title'}): ${c.email || 'No Email'}`).join('\n') || 'No contacts found'}

RECENT CALL TRANSCRIPTS & SYNOPSIS:
${accCalls.map(c => `* ${new Date(c.timestamp).toLocaleDateString()}: ${c.summary || 'No summary'}
  TRANSCRIPT SNIPPET: ${c.transcript?.slice(0, 300) || 'None'}`).join('\n\n') || 'No recent call history'}

RECENT EMAIL COMMUNICATIONS:
${accEmails.map(e => `* ${new Date(e.timestamp).toLocaleDateString()}: Subject: ${e.subject}
  SNIPPET: ${e.text?.slice(0, 200)}`).join('\n\n') || 'No recent email communications'}

CRITICAL ACTION TRACE:
${accTasks.map(t => `- OVERDUE: ${t.title} (Priority: ${t.priority})`).join('\n') || 'No overdue tasks'}
DOCUMENTS ON FILE: ${accDocs.map(d => d.name).join(', ') || 'None'}
            `.trim()
        }).join('\n\n---\n\n')

        const signalLog = signalHistory?.length
            ? signalHistory.map(s => `[${new Date(s.time).toLocaleTimeString()}] ${s.type}: ${s.message}`).join('\n')
            : 'No live signals logged'

        const gridSummary = grid
            ? `Hub: $${grid.hubPrice?.toFixed(2)}/MWh | Reserves: ${grid.reserves?.toLocaleString()} MW | Scarcity Prob: ${grid.scarcityProb}%`
            : 'Grid data unavailable'

        const prompt = `You are a forensic energy advisor. Provide a 3-bullet TACTICAL STRIKE PLAN based on the Market Pulse and deep Intelligence Dossiers.

CURRENT MARKET PULSE:
${gridSummary}

LIVE SIGNAL FEED (Last 15m):
${signalLog}

CORE INTELLIGENCE DOSSIERS:
${dossiers}

INSTRUCTIONS:
1. Identify the 3 highest-risk opportunities where Market Tightness meets CRM Liability.
2. For each bullet:
   - Identify the SPECIFIC ACCOUNT and the PRIMARY STAKEHOLDER to reach out to.
   - Reference a SPECIFIC DETAIL from their transcript or email history (e.g., "they mentioned X in their last call").
   - Define the TACTICAL OPENING: How to pivot the current market volatility into their specific contract vulnerability.
3. Vocabulary: demand ratchet, 4CP peak exposure, scarcity adder, transmission liability.

Tone: Forensic, urgent but measured, professional. No conversational filler. Exactly 3 bullets.`

        const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://nodalpoint.io',
                'X-Title': 'Nodal Point Deep Brief',
            },
            body: JSON.stringify({
                model: 'google/gemini-2.5-flash',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 800,
                temperature: 0.2,
            }),
        })

        const orData = await orRes.json()
        const responseText = orData.choices?.[0]?.message?.content ?? ''

        if (!responseText) {
            return res.status(502).json({ error: 'AI returned empty response' })
        }

        return res.status(200).json({ brief: responseText.trim() })
    } catch (err: unknown) {
        console.error('AI Brief Error:', err)
        const msg = err instanceof Error ? err.message : String(err)
        return res.status(500).json({ error: 'AI brief generation failed', detail: msg })
    }
}

