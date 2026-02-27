import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabase'
import type { Signal } from '@/store/warRoomStore'

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
    signalHistory: Signal[]
}

// Row types for Supabase query results
interface AccountRow { id: string; industry?: string; load_factor?: string; electricity_supplier?: string; contract_end_date?: string }
interface ContactRow { accountId: string; firstName?: string; lastName?: string; title?: string; email?: string }
interface CallRow { accountId: string; timestamp: string; summary?: string; transcript?: string }
interface EmailRow { accountId: string; timestamp: string; subject?: string; text?: string }
interface TaskRow { accountId: string; title?: string; priority?: string }
interface DocRow { account_id: string; name?: string }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const apiKey = process.env.ASSEMBLY_AI_API_KEY
    if (!apiKey) {
        return res.status(503).json({ error: 'No AssemblyAI API key configured' })
    }

    const { topAccounts, grid, signalHistory } = req.body as BriefRequest

    if (!topAccounts?.length) {
        return res.status(400).json({ error: 'topAccounts required' })
    }

    const accountIds = topAccounts.slice(0, 5).map(a => a.id)

    try {
        // Parallel fetch of deep intelligence — documents fetch is best-effort
        const [
            { data: fullAccounts },
            { data: contacts },
            { data: calls },
            { data: emails },
            { data: tasks },
            docsResult
        ] = await Promise.all([
            supabaseAdmin.from('accounts').select('*').in('id', accountIds),
            supabaseAdmin.from('contacts').select('*').in('accountId', accountIds),
            supabaseAdmin.from('calls').select('*').in('accountId', accountIds).order('timestamp', { ascending: false }).limit(20),
            supabaseAdmin.from('emails').select('*').in('accountId', accountIds).order('timestamp', { ascending: false }).limit(20),
            supabaseAdmin.from('tasks').select('*').in('accountId', accountIds).eq('status', 'overdue'),
            // Best-effort: documents table may not exist in all environments
            Promise.resolve(supabaseAdmin.from('documents').select('*').in('account_id', accountIds)).catch(() => ({ data: null }))
        ])

        const docs = docsResult.data

        // Build Intelligence Dossiers
        const dossiers = topAccounts.slice(0, 5).map(a => {
            const acc = (fullAccounts as AccountRow[] | null)?.find((f: AccountRow) => f.id === a.id)
            const accContacts = (contacts as ContactRow[] | null)?.filter((c: ContactRow) => c.accountId === a.id) || []
            const accCalls = (calls as CallRow[] | null)?.filter((c: CallRow) => c.accountId === a.id).slice(0, 3) || []
            const accEmails = (emails as EmailRow[] | null)?.filter((c: EmailRow) => c.accountId === a.id).slice(0, 3) || []
            const accTasks = (tasks as TaskRow[] | null)?.filter((t: TaskRow) => t.accountId === a.id) || []
            const accDocs = (docs as DocRow[] | null)?.filter((d: DocRow) => d.account_id === a.id) || []

            return `
[DOSSIER: ${a.name}]
Score: ${a.liabilityScore}
Industry: ${acc?.industry || 'Unknown'}
Liability Profile: ${a.liabilityReasons.join(' · ')}
Load Factor: ${acc?.load_factor || 'Unknown'}
Electricity Supplier: ${acc?.electricity_supplier || 'Unknown'}
Contract End: ${acc?.contract_end_date || 'Unknown'}

STAKEHOLDER MAP:
${accContacts.map((c: ContactRow) => `- ${c.firstName} ${c.lastName} (${c.title || 'No Title'}): ${c.email || 'No Email'}`).join('\n') || 'No contacts found'}

RECENT CALL TRANSCRIPTS & SYNOPSIS:
${accCalls.map((c: CallRow) => `* ${new Date(c.timestamp).toLocaleDateString()}: ${c.summary || 'No summary'}
  TRANSCRIPT SNIPPET: ${c.transcript?.slice(0, 300) || 'None'}`).join('\n\n') || 'No recent call history'}

RECENT EMAIL COMMUNICATIONS:
${accEmails.map((e: EmailRow) => `* ${new Date(e.timestamp).toLocaleDateString()}: Subject: ${e.subject}
  SNIPPET: ${e.text?.slice(0, 200)}`).join('\n\n') || 'No recent email communications'}

CRITICAL ACTION TRACE:
${accTasks.map((t: TaskRow) => `- OVERDUE: ${t.title} (Priority: ${t.priority})`).join('\n') || 'No overdue tasks'}
DOCUMENTS ON FILE: ${accDocs.map((d: DocRow) => d.name).join(', ') || 'None'}
            `.trim()
        }).join('\n\n---\n\n')

        const signalLog = signalHistory?.length
            ? signalHistory.map(s => `[${new Date(s.time).toLocaleTimeString()}] ${s.type}: ${s.message}`).join('\n')
            : 'No live signals logged'

        const gridSummary = grid
            ? `Hub: $${grid.hubPrice?.toFixed(2)}/MWh | Reserves: ${grid.reserves?.toLocaleString()} MW | Scarcity Prob: ${grid.scarcityProb}%`
            : 'Grid data unavailable'

        const prompt = `You are a Forensic Energy Advisor executing the Nodal Point NEPQ (Neuro-Emotional Persuasion Questioning) playbook. Provide a 3-bullet TACTICAL STRIKE PLAN based on the Market Pulse and deep Intelligence Dossiers.

CURRENT MARKET PULSE:
${gridSummary}

LIVE SIGNAL FEED (Last 15m):
${signalLog}

CORE INTELLIGENCE DOSSIERS:
${dossiers}

INSTRUCTIONS:
1. Identify the 3 highest-risk opportunities where Market Tightness meets CRM Liability.
2. For each bullet:
   - Identify the SPECIFIC ACCOUNT and the PRIMARY STAKEHOLDER.
   - Reference a SPECIFIC DETAIL from their transcript/email (e.g., "they mentioned X locked contract").
   - Define the TACTICAL OPENING using the NEPQ framework: DO NOT "pitch savings." Diagnose a structural inefficiency. If they previously had an objection (e.g., "locked in", "broker"), script exactly how to diffuse it with a curiosity-driven consequence question (e.g. "When you renew, will you have a benchmark?"). Use a calm, unhurried tone with verbal pauses ("...").
3. Vocabulary: demand ratchet liability, 4CP peak exposure, scarcity adder, transmission liability, structural audit.

Tone: Forensic, unhurried, diagnostic. Exactly 3 bullets.`

        const orRes = await fetch('https://llm-gateway.assemblyai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gemini-2.5-flash',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 1400,
                temperature: 0.2,
            }),
        })

        const orData = await orRes.json()
        const responseText = orData.choices?.[0]?.message?.content ?? ''

        if (!responseText) {
            console.error('AI Brief: empty response from AssemblyAI LLM Gateway', orData)
            return res.status(502).json({ error: 'AI returned empty response' })
        }

        return res.status(200).json({ brief: responseText.trim() })
    } catch (err: unknown) {
        console.error('AI Brief Error:', err)
        const msg = err instanceof Error ? err.message : String(err)
        return res.status(500).json({ error: 'AI brief generation failed', detail: msg })
    }
}
