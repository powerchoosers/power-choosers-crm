import { useQuery } from '@tanstack/react-query'

export type FourCPRiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | 'BATTLE_STATIONS' | 'OFF_SEASON'

export interface FourCPForecast {
    probability: number
    riskLevel: FourCPRiskLevel
    isPeakSeason: boolean
    isTimeWindow: boolean
    peaksRecorded: number
    peaksRemaining: number
    alertMessage: string | null
    signals: string[]
    gridSnapshot?: {
        actualLoad: number
        reserves: number
        hubPrice: number
        loadPct: number
    }
    month: number
    centralHour: number
}

async function fetchFourCPForecast(): Promise<FourCPForecast> {
    const res = await fetch('/api/market/4cp-forecast')
    if (!res.ok) throw new Error(`4CP forecast fetch failed: ${res.status}`)
    return res.json()
}

export function useFourCPForecast() {
    return useQuery<FourCPForecast>({
        queryKey: ['4cp-forecast'],
        queryFn: fetchFourCPForecast,
        refetchInterval: 5 * 60 * 1000, // Poll every 5 minutes
        staleTime: 4 * 60 * 1000,
        retry: 2,
        retryDelay: 3000,
    })
}
