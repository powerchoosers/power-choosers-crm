import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { Email } from './useEmails'
import { applyEmailOwnerScope, resolveEmailOwnerScope } from '@/lib/email-scope'

function stripHtml(html: string | undefined | null) {
    if (!html) return ''
    let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    text = text.replace(/<[^>]+>/g, ' ')
    const entities: Record<string, string> = {
        '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
        '&quot;': '"', '&#39;': "'", '&shy;': '', '&zwnj;': ''
    }
    text = text.replace(/&[a-z0-9#]+;/gi, m => entities[m.toLowerCase()] || ' ')
    return text.replace(/\s+/g, ' ').trim()
}

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
}

interface UseEntityEmailsParams {
    emailAddresses?: string[]
    contactId?: string | null
    accountId?: string | null
}

export function useEntityEmails({
    emailAddresses = [],
    contactId,
    accountId,
}: UseEntityEmailsParams) {
    const { user, role, loading } = useAuth()

    return useQuery({
        queryKey: ['entity-emails', emailAddresses, contactId ?? null, accountId ?? null, user?.email ?? 'guest', role],
        queryFn: async () => {
            const normalizedContactId = String(contactId || '').trim()
            const normalizedAccountId = String(accountId || '').trim()
            const validEmails = Array.from(new Set(
                (emailAddresses || [])
                    .map((value) => String(value || '').trim().toLowerCase())
                    .filter((value) => value.length > 0)
            ))

            if (validEmails.length === 0 && !normalizedContactId && !normalizedAccountId) return []
            if (loading) return []
            if (!user?.email && role !== 'admin') return []

            try {
                const scopedOwners = role !== 'admin' && user?.email
                    ? await resolveEmailOwnerScope(user)
                    : []

                const buildScopedQuery = () => {
                    let query = supabase
                        .from('emails')
                        .select('*')

                    if (role !== 'admin' && user?.email) {
                        query = applyEmailOwnerScope(query, scopedOwners.length > 0 ? scopedOwners : [user.email.toLowerCase()])
                    }

                    return query
                        .not('subject', 'ilike', '%mailwarming%')
                        .not('subject', 'ilike', '%mail warming%')
                        .not('subject', 'ilike', '%test email%')
                        .not('from', 'ilike', '%apollo.io%')
                        .not('from', 'ilike', '%mailwarm%')
                        .not('from', 'ilike', '%lemwarm%')
                        .not('from', 'ilike', '%warmup%')
                        .not('type', 'eq', 'tracking')
                }

                const collectRows = async (conditions: string[], limit: number) => {
                    if (conditions.length === 0) return []

                    const query = buildScopedQuery()
                    const { data, error } = await query
                        .or(conditions.join(','))
                        .order('timestamp', { ascending: false, nullsFirst: false })
                        .order('createdAt', { ascending: false, nullsFirst: false })
                        .limit(limit)

                    if (error) {
                        if (error.message === 'FetchUserError: Request was aborted' || error.message?.includes('abort')) {
                            return []
                        }
                        throw error
                    }

                    return data || []
                }

                const emailMap = new Map<string, any>()
                const directConditions = [
                    normalizedContactId ? `contactId.eq.${normalizedContactId}` : '',
                    normalizedAccountId ? `accountId.eq.${normalizedAccountId}` : '',
                ].filter(Boolean)

                const directRows = await collectRows(directConditions, normalizedAccountId ? 150 : 100)
                for (const item of directRows) {
                    emailMap.set(item.id, item)
                }

                const batches = chunk(validEmails, 25)
                for (const batch of batches) {
                    const addressConditions = batch.flatMap((email) => ([
                        `from.ilike.%${email}%`,
                        `to.cs.["${email}"]`,
                        `cc.cs.["${email}"]`,
                        `bcc.cs.["${email}"]`,
                        `metadata->>fromAddress.ilike.%${email}%`,
                        `metadata->>replyToAddress.ilike.%${email}%`,
                    ]))

                    const rows = await collectRows(addressConditions, 50)
                    for (const item of rows) {
                        emailMap.set(item.id, item)
                    }
                }

                const emails = Array.from(emailMap.values())
                    .sort((a, b) => {
                        const ta = new Date((a.sentAt || a.metadata?.sentAt || a.scheduledSendTime || a.timestamp || a.createdAt || a.created_at) || 0).getTime()
                        const tb = new Date((b.sentAt || b.metadata?.sentAt || b.scheduledSendTime || b.timestamp || b.createdAt || b.created_at) || 0).getTime()
                        return tb - ta
                    })
                    .slice(0, 50)
                    .map(item => {
                    let type: Email['type'] = 'received'
                    const rawType = String(item.type || '').toLowerCase()

                    if (rawType === 'sent' || rawType === 'uplink_out') {
                        type = 'sent'
                    } else if (rawType === 'scheduled') {
                        type = 'scheduled'
                    } else if (rawType === 'draft') {
                        type = 'draft'
                    }

                    const sentAt = item.sentAt || item.metadata?.sentAt || null
                    const date = sentAt || item.scheduledSendTime || item.timestamp || item.createdAt || item.created_at

                    return {
                        id: item.id,
                        subject: item.subject,
                        from: item.from,
                        to: item.to,
                        html: item.html,
                        text: item.text,
                        snippet: stripHtml(item.text || item.html || item.snippet).slice(0, 100),
                        date: date,
                        timestamp: date ? new Date(date).getTime() : Date.now(),
                        unread: !item.is_read,
                        type,
                        status: item.status,
                        ownerId: item.metadata?.ownerId || (user?.email ?? ''),
                        openCount: item.openCount,
                        clickCount: item.clickCount,
                        attachments: item.attachments || item.metadata?.attachments,
                        metadata: item.metadata || {},
                        sentAt,
                        scheduledSendTime: item.scheduledSendTime || null,
                        threadId: item.threadId || item.metadata?.threadId || null,
                        contactId: item.contactId || null,
                    }
                }) as Email[]

                return emails
            } catch (error: any) {
                if (error?.name === 'AbortError' || error?.message === 'Fetch is aborted' || error?.message?.includes('abort')) {
                    return []
                }
                console.error("Error fetching entity emails:", error.message || error)
                return []
            }
        },
        enabled: (!!contactId || !!accountId || emailAddresses.length > 0) && !loading && !!(user?.email || role === 'admin'),
        staleTime: 1000 * 15,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        placeholderData: (previousData) => previousData,
    })
}
