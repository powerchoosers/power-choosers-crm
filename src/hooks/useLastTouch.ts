'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useEffect } from 'react'
import { type ContactHealthScore } from '@/components/ui/ContactAvatar'

/**
 * Returns a Map<entityId, ISO timestamp> of the most recent REAL interaction
 * (call or email) for each entity in the given ID array.
 *
 * Uses two batch queries (calls + emails) regardless of page size,
 * and invalidates automatically when calls are added via Supabase realtime.
 */

// --- Contacts ---

export function useContactLastTouch(contactIds: string[]) {
    const queryClient = useQueryClient()
    const key = ['contact-last-touch', contactIds.slice().sort().join(',')]

    // Invalidate whenever a call is inserted (same channel as useCalls realtime)
    useEffect(() => {
        if (!contactIds.length) return

        const channel = supabase
            .channel('contact-last-touch-realtime')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'calls' },
                () => queryClient.invalidateQueries({ queryKey: ['contact-last-touch'] })
            )
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'emails' },
                () => queryClient.invalidateQueries({ queryKey: ['contact-last-touch'] })
            )
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [contactIds.length, queryClient])

    return useQuery<Map<string, string>>({
        queryKey: key,
        queryFn: async () => {
            if (!contactIds.length) return new Map()

            // 1) Most recent call per contactId
            const { data: callRows } = await supabase
                .from('calls')
                .select('contactId, timestamp')
                .in('contactId', contactIds)
                .not('timestamp', 'is', null)
                .order('timestamp', { ascending: false })

            // 2) Most recent email per contactId — emails have no contactId, match via email address
            //    so we get contact emails first, then join client-side
            const callMap = new Map<string, string>()
            for (const row of callRows ?? []) {
                if (!row.contactId || !row.timestamp) continue
                const existing = callMap.get(row.contactId)
                if (!existing || row.timestamp > existing) {
                    callMap.set(row.contactId, row.timestamp)
                }
            }

            // Fetch contact email addresses for the email match
            const { data: contactEmailRows } = await supabase
                .from('contacts')
                .select('id, email')
                .in('id', contactIds)
                .not('email', 'is', null)

            const emailToContactId = new Map<string, string>()
            for (const row of contactEmailRows ?? []) {
                if (row.email) emailToContactId.set(row.email.toLowerCase(), row.id)
            }

            const contactEmails = [...emailToContactId.keys()]
            const emailMap = new Map<string, string>()

            if (contactEmails.length > 0) {
                // Build OR conditions for `from` or elements in `to` array
                const conditions = contactEmails.flatMap(e => [
                    `from.ilike.*${e}*`,
                    `to.cs.["${e}"]`,
                ]).join(',')

                const { data: emailRows } = await supabase
                    .from('emails')
                    .select('from, to, timestamp')
                    .or(conditions)
                    .not('timestamp', 'is', null)

                for (const row of emailRows ?? []) {
                    const ts = row.timestamp as string | null
                    if (!ts) continue

                    // Determine which contact this email belongs to
                    const fromEmail = (row.from as string || '').toLowerCase()
                    const toArr: string[] = Array.isArray(row.to)
                        ? (row.to as string[])
                        : typeof row.to === 'string'
                            ? [row.to]
                            : []

                    const candidates = [fromEmail, ...toArr.map(e => e.toLowerCase())]
                    for (const candidate of candidates) {
                        const contactId = emailToContactId.get(candidate)
                        if (!contactId) continue
                        const existing = emailMap.get(contactId)
                        if (!existing || ts > existing) emailMap.set(contactId, ts)
                    }
                }
            }

            // Merge: take the most recent of call or email per contact
            const result = new Map<string, string>()
            for (const id of contactIds) {
                const call = callMap.get(id)
                const email = emailMap.get(id)
                if (call && email) result.set(id, call > email ? call : email)
                else if (call) result.set(id, call)
                else if (email) result.set(id, email)
                // If neither → contact never touched → not added to map → healthScore = 'cold'
            }

            return result
        },
        enabled: contactIds.length > 0,
        staleTime: 1000 * 60 * 2,  // 2 min — short because calls are logged live
    })
}

// --- Accounts ---

export function useAccountLastTouch(accountIds: string[]) {
    const queryClient = useQueryClient()
    const key = ['account-last-touch', accountIds.slice().sort().join(',')]

    useEffect(() => {
        if (!accountIds.length) return

        const channel = supabase
            .channel('account-last-touch-realtime')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'calls' },
                () => queryClient.invalidateQueries({ queryKey: ['account-last-touch'] })
            )
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'emails' },
                () => queryClient.invalidateQueries({ queryKey: ['account-last-touch'] })
            )
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [accountIds.length, queryClient])

    return useQuery<Map<string, string>>({
        queryKey: key,
        queryFn: async () => {
            if (!accountIds.length) return new Map()

            // 1) Most recent call per accountId
            const { data: callRows } = await supabase
                .from('calls')
                .select('accountId, timestamp')
                .in('accountId', accountIds)
                .not('timestamp', 'is', null)

            const result = new Map<string, string>()

            for (const row of callRows ?? []) {
                if (!row.accountId || !row.timestamp) continue
                const existing = result.get(row.accountId)
                if (!existing || row.timestamp > existing) {
                    result.set(row.accountId, row.timestamp)
                }
            }

            // 2) Most recent email per account — via contacts that belong to the account
            const { data: contactEmailRows } = await supabase
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

            const accountEmails = [...emailToAccountId.keys()]
            if (accountEmails.length > 0) {
                const conditions = accountEmails.flatMap(e => [
                    `from.ilike.*${e}*`,
                    `to.cs.["${e}"]`,
                ]).join(',')

                const { data: emailRows } = await supabase
                    .from('emails')
                    .select('from, to, timestamp')
                    .or(conditions)
                    .not('timestamp', 'is', null)

                for (const row of emailRows ?? []) {
                    const ts = row.timestamp as string | null
                    if (!ts) continue

                    const fromEmail = (row.from as string || '').toLowerCase()
                    const toArr: string[] = Array.isArray(row.to)
                        ? (row.to as string[])
                        : typeof row.to === 'string' ? [row.to] : []

                    const candidates = [fromEmail, ...toArr.map(e => e.toLowerCase())]
                    for (const candidate of candidates) {
                        const accountId = emailToAccountId.get(candidate)
                        if (!accountId) continue
                        const existing = result.get(accountId)
                        if (!existing || ts > existing) result.set(accountId, ts)
                    }
                }
            }

            return result
        },
        enabled: accountIds.length > 0,
        staleTime: 1000 * 60 * 2,
    })
}

/**
 * Pure utility — compute health tier from an ISO timestamp or undefined.
 * 'cold' when no record exists (never contacted).
 */
export function computeHealthScore(lastTouchIso: string | undefined): ContactHealthScore {
    if (!lastTouchIso) return 'cold'
    try {
        const diffMs = Date.now() - new Date(lastTouchIso).getTime()
        const diffDays = diffMs / (1000 * 60 * 60 * 24)
        if (diffDays <= 30) return 'active'
        if (diffDays <= 90) return 'warming'
        return 'cold'
    } catch {
        return 'cold'
    }
}
