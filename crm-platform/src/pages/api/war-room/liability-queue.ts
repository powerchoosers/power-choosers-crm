import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * GET /api/war-room/liability-queue
 * Returns top accounts pre-joined with their last call/email timestamp and overdue task count.
 * The client computes the final liability score and sorts.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        // Fetch accounts with basic fields
        const { data: accounts, error: accErr } = await supabaseAdmin
            .from('accounts')
            .select('id, name, domain, industry, city, state, logoUrl, logo_url, contract_end_date, metadata')
            .limit(60)
            .order('name', { ascending: true })

        if (accErr) throw accErr

        const accountIds = (accounts ?? []).map((a) => a.id)

        if (accountIds.length === 0) {
            return res.status(200).json({ accounts: [] })
        }

        // Last call per account
        const { data: callRows } = await supabaseAdmin
            .from('calls')
            .select('accountId, timestamp, outcome')
            .in('accountId', accountIds)
            .not('timestamp', 'is', null)
            .order('timestamp', { ascending: false })

        // Build last-call map
        const lastCallMap = new Map<string, { timestamp: string; outcome: string | null }>()
        for (const c of callRows ?? []) {
            if (!c.accountId || !c.timestamp) continue
            if (!lastCallMap.has(c.accountId)) {
                lastCallMap.set(c.accountId, { timestamp: c.timestamp, outcome: c.outcome })
            }
        }

        // Last email per account — via contacts at the account
        const { data: contactEmailRows } = await supabaseAdmin
            .from('contacts')
            .select('accountId, email')
            .in('accountId', accountIds)
            .not('email', 'is', null)

        const emailToAccountId = new Map<string, string>()
        for (const row of contactEmailRows ?? []) {
            if (row.email && row.accountId) {
                emailToAccountId.set(row.email.toLowerCase(), row.accountId)
            }
        }

        const lastEmailMap = new Map<string, string>()
        const contactEmails = [...emailToAccountId.keys()]
        if (contactEmails.length > 0) {
            const conditions = contactEmails
                .flatMap((e) => [`from.ilike.*${e}*`, `to.cs.["${e}"]`])
                .join(',')
            const { data: emailRows } = await supabaseAdmin
                .from('emails')
                .select('from, to, timestamp')
                .or(conditions)
                .not('timestamp', 'is', null)
                .order('timestamp', { ascending: false })

            for (const row of emailRows ?? []) {
                const ts = row.timestamp as string | null
                if (!ts) continue
                const fromEmail = ((row.from as string) || '').toLowerCase()
                const toArr: string[] = Array.isArray(row.to)
                    ? (row.to as string[])
                    : typeof row.to === 'string'
                        ? [row.to]
                        : []
                const candidates = [fromEmail, ...toArr.map((e) => e.toLowerCase())]
                for (const candidate of candidates) {
                    const acctId = emailToAccountId.get(candidate)
                    if (!acctId) continue
                    const existing = lastEmailMap.get(acctId)
                    if (!existing || ts > existing) lastEmailMap.set(acctId, ts)
                }
            }
        }

        // Overdue tasks per account
        const now = new Date().toISOString()
        const { data: taskRows } = await supabaseAdmin
            .from('tasks')
            .select('accountId, dueDate, status')
            .in('accountId', accountIds)
            .eq('status', 'pending')
            .lt('dueDate', now)

        const overdueTaskMap = new Map<string, number>()
        for (const t of taskRows ?? []) {
            if (!t.accountId) continue
            overdueTaskMap.set(t.accountId, (overdueTaskMap.get(t.accountId) ?? 0) + 1)
        }

        // Merge all data per account
        const enriched = (accounts ?? []).map((acct) => {
            const call = lastCallMap.get(acct.id)
            const emailTs = lastEmailMap.get(acct.id)
            const lastCallTs = call?.timestamp ?? null
            const lastCallOutcome = call?.outcome ?? null
            const lastTouchTs =
                lastCallTs && emailTs
                    ? lastCallTs > emailTs ? lastCallTs : emailTs
                    : lastCallTs ?? emailTs ?? null

            // Resolve contract_end_date from metadata fallback
            const meta = (acct.metadata as Record<string, unknown>) ?? {}
            const contractEndDate =
                (acct.contract_end_date as string | null) ??
                (meta.contract_end_date as string | null) ??
                (meta.contractEndDate as string | null) ??
                null

            return {
                id: acct.id,
                name: acct.name,
                domain: acct.domain,
                industry: acct.industry,
                city: acct.city,
                state: acct.state,
                logoUrl: (acct.logoUrl as string | null) ?? (acct.logo_url as string | null) ?? null,
                contractEndDate,
                lastTouchTs,
                lastCallTs,
                lastCallOutcome,
                overdueTaskCount: overdueTaskMap.get(acct.id) ?? 0,
            }
        })

        return res.status(200).json({ accounts: enriched })
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return res.status(500).json({ error: 'Failed to build liability queue', detail: msg })
    }
}
