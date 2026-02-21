import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { Email } from './useEmails'

export function useEntityEmails(emailAddresses: string[]) {
    const { user, role, loading } = useAuth()

    return useQuery({
        queryKey: ['entity-emails', emailAddresses, user?.email ?? 'guest', role],
        queryFn: async () => {
            // Filter out empty or invalid emails
            const validEmails = (emailAddresses || []).filter(e => e && e.trim().length > 0)
            if (validEmails.length === 0) return []
            if (loading) return []
            // We still want to let users load things if they are valid
            if (!user?.email && role !== 'admin') return []

            try {
                let query = supabase
                    .from('emails')
                    .select('*')

                // Default security check based on how `useEmails` works
                if (role !== 'admin' && user?.email) {
                    query = query.eq('metadata->>ownerId', user.email.toLowerCase())
                }

                // Filter out noise
                query = query
                    .not('subject', 'ilike', '%mailwarming%')
                    .not('subject', 'ilike', '%mail warming%')
                    .not('subject', 'ilike', '%test email%')
                    .not('from', 'ilike', '%apollo.io%')
                    .not('from', 'ilike', '%mailwarm%')
                    .not('from', 'ilike', '%lemwarm%')
                    .not('from', 'ilike', '%warmup%')

                // Build OR condition for all provided email addresses
                // Using ilike.%email% for substring match in `to` and `from`
                // Supabase `or` structure requires a comma-separated list of conditions
                const orConditions = validEmails.map(email =>
                    `from.ilike.%${email}%,to.ilike.%${email}%`
                ).join(',')

                query = query.or(orConditions)

                const { data, error } = await query
                    .order('timestamp', { ascending: false, nullsFirst: false })
                    .order('createdAt', { ascending: false, nullsFirst: false })
                    .limit(50)

                if (error) {
                    if (error.message === 'FetchUserError: Request was aborted' || error.message?.includes('abort')) {
                        return []
                    }
                    throw error
                }

                const emails = data.map(item => {
                    let type: Email['type'] = 'received'
                    const rawType = String(item.type || '').toLowerCase()

                    if (rawType === 'sent' || rawType === 'uplink_out') {
                        type = 'sent'
                    } else if (rawType === 'scheduled') {
                        type = 'scheduled'
                    } else if (rawType === 'draft') {
                        type = 'draft'
                    }

                    const date = item.timestamp || item.createdAt || item.created_at

                    return {
                        id: item.id,
                        subject: item.subject,
                        from: item.from,
                        to: item.to,
                        html: item.html,
                        text: item.text,
                        snippet: item.text?.slice(0, 100) || item.snippet,
                        date: date,
                        timestamp: date ? new Date(date).getTime() : Date.now(),
                        unread: !item.is_read,
                        type,
                        status: item.status,
                        ownerId: item.metadata?.ownerId || (user?.email ?? ''),
                        openCount: item.openCount,
                        clickCount: item.clickCount,
                        attachments: item.attachments || item.metadata?.attachments
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
        enabled: emailAddresses && emailAddresses.length > 0 && !loading && !!(user?.email || role === 'admin'),
        staleTime: 1000 * 60 * 2, // 2 minutes
    })
}
