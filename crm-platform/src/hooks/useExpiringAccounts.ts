import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

export interface ExpiringAccount {
    id: string
    name: string
    domain: string | null
    industry: string | null
    logo_url: string | null
    contract_end_date: string
    daysLeft: number
}

export function useExpiringAccounts(enabled: boolean = true) {
    const { user, role, loading } = useAuth()

    return useQuery<ExpiringAccount[]>({
        queryKey: ['expiring-accounts-90d', user?.email, role],
        queryFn: async () => {
            if (loading || !user) return []

            const now = new Date()
            const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
            const nowISO = now.toISOString().split('T')[0]
            const futureISO = ninetyDaysFromNow.toISOString().split('T')[0]

            let query = supabase
                .from('accounts')
                .select('id, name, domain, industry, logo_url, contract_end_date')
                .gte('contract_end_date', nowISO)
                .lte('contract_end_date', futureISO)
                .not('contract_end_date', 'is', null)
                .order('contract_end_date', { ascending: true })

            if (role !== 'admin' && user?.email) {
                query = query.eq('ownerId', user.email)
            }

            const { data, error } = await query

            if (error) {
                console.error('useExpiringAccounts error:', error)
                return []
            }

            return (data ?? []).map((acct) => {
                const end = new Date(acct.contract_end_date)
                const daysLeft = Math.round((end.getTime() - now.getTime()) / 86400000)
                return {
                    id: acct.id,
                    name: acct.name,
                    domain: acct.domain ?? null,
                    industry: acct.industry ?? null,
                    logo_url: acct.logo_url ?? null,
                    contract_end_date: acct.contract_end_date,
                    daysLeft,
                }
            })
        },
        enabled: enabled && !loading && !!user,
        staleTime: 1000 * 60 * 5, // 5 minutes
        refetchInterval: 5 * 60 * 1000,
    })
}
