import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useMarketPulse } from './useMarketPulse'
import { useEffect } from 'react'

export interface DashboardMetrics {
  liabilityKWh: number // Annual volume protected (sum of annualUsage in kWh)
  openPositions: number // Contracts expiring in 90 days
  operationalVelocity: number // Calls + emails in last 24h
  gridVolatilityIndex: number // 0-100 market stress (from ERCOT scarcity_prob)
}

/**
 * Fetches real-time dashboard KPI metrics:
 * - Liability under management (sum of annual usage from accounts)
 * - Open positions (accounts expiring in 90 days)
 * - Operational velocity (calls + emails in last 24h)
 * - Grid volatility index (ERCOT scarcity probability 0-100)
 */
export function useDashboardMetrics() {
  const { user, role, loading } = useAuth()
  const { data: marketPulse } = useMarketPulse()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!user) return

    const channel = supabase.channel('dashboard-metrics-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emails' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, queryClient])

  return useQuery<DashboardMetrics>({
    queryKey: ['dashboard-metrics', user?.email, role],
    queryFn: async () => {
      if (loading || !user) {
        return {
          liabilityKWh: 0,
          openPositions: 0,
          operationalVelocity: 0,
          gridVolatilityIndex: 0,
        }
      }

      try {
        // 1. LIABILITY_UNDER_MGMT: Sum annualUsage from current customers only (in kWh)
        // Only count accounts with status 'CUSTOMER' (actual customers, not just active load)
        let liabilityQuery = supabase
          .from('accounts')
          .select('annual_usage')
          .in('status', ['CUSTOMER'])

        if (role !== 'admin' && user?.email) {
          liabilityQuery = liabilityQuery.eq('ownerId', user.email)
        }

        const { data: accountsData, error: accountsError } = await liabilityQuery

        let liabilityKWh = 0
        if (!accountsError && accountsData) {
          const totalKWh = accountsData.reduce((sum, acc) => {
            const usage = acc.annual_usage
            if (usage && typeof usage === 'string') {
              // Handle string values like "1,234,567" or "1234567"
              const num = parseFloat(usage.replace(/,/g, ''))
              return sum + (isNaN(num) ? 0 : num)
            } else if (typeof usage === 'number') {
              return sum + usage
            }
            return sum
          }, 0)
          liabilityKWh = totalKWh
        }

        // 2. OPEN_POSITIONS: Count accounts with contract_end_date within 90 days
        const now = new Date()
        const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
        const nowISO = now.toISOString().split('T')[0]
        const futureISO = ninetyDaysFromNow.toISOString().split('T')[0]

        let positionsQuery = supabase
          .from('accounts')
          .select('id', { count: 'exact', head: true })
          .gte('contract_end_date', nowISO)
          .lte('contract_end_date', futureISO)
          .not('contract_end_date', 'is', null)

        if (role !== 'admin' && user?.email) {
          positionsQuery = positionsQuery.eq('ownerId', user.email)
        }

        const { count: openPositions = 0, error: positionsError } = await positionsQuery
        if (positionsError) {
          console.error('Error fetching open positions:', positionsError)
        }

        // 3. OPERATIONAL_VELOCITY: Count calls + emails for the day between 8 AM and 5 PM
        const startOfWorkDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0)
        const endOfWorkDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0, 0)
        const startTimeISO = startOfWorkDay.toISOString()
        const endTimeISO = endOfWorkDay.toISOString()

        // Count calls (inbound and outbound) between 8 AM and 5 PM
        const { count: callsCount = 0, error: callsError } = await supabase
          .from('calls')
          .select('id', { count: 'exact', head: true })
          .gte('timestamp', startTimeISO)
          .lte('timestamp', endTimeISO)
        if (callsError) {
          console.error('Error fetching calls count:', callsError)
        }

        // Count outbound emails between 8 AM and 5 PM
        let emailsQuery = supabase
          .from('emails')
          .select('id', { count: 'exact', head: true })
          .gte('createdAt', startTimeISO)
          .lte('createdAt', endTimeISO)
          .in('type', ['sent', 'uplink_out'])
          .not('subject', 'ilike', '%mailwarming%')
          .not('subject', 'ilike', '%mail warming%')
          .not('subject', 'ilike', '%test email%')
          .not('from', 'ilike', '%apollo.io%')
          .not('from', 'ilike', '%mailwarm%')
          .not('from', 'ilike', '%lemwarm%')
          .not('from', 'ilike', '%warmup%')

        if (role !== 'admin' && user?.email) {
          emailsQuery = emailsQuery.eq('metadata->>ownerId', user.email.toLowerCase())
        }

        const { count: emailsCount = 0, error: emailsError } = await emailsQuery
        if (emailsError) {
          console.error('Error fetching emails count:', {
            message: emailsError.message,
            details: emailsError.details,
            hint: emailsError.hint,
            code: emailsError.code,
          })
        }

        const operationalVelocity = (callsCount || 0) + (emailsCount || 0)

        // 4. GRID_VOLATILITY_INDEX: Use ERCOT scarcity_prob (0-100)
        const gridVolatilityIndex = marketPulse?.grid?.scarcity_prob ?? 0

        return {
          liabilityKWh: Math.round(liabilityKWh), // Round to nearest kWh
          openPositions: openPositions || 0,
          operationalVelocity: operationalVelocity,
          gridVolatilityIndex: Math.round(gridVolatilityIndex),
        }
      } catch (error: any) {
        console.error('Error fetching dashboard metrics:', error)
        return {
          liabilityKWh: 0,
          openPositions: 0,
          operationalVelocity: 0,
          gridVolatilityIndex: marketPulse?.grid?.scarcity_prob ?? 0,
        }
      }
    },
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  })
}
