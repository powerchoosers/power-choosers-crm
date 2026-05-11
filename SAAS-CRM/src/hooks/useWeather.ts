'use client'

import { useQuery } from '@tanstack/react-query'

export type WeatherLocation = {
  latitude?: number | null
  longitude?: number | null
  address?: string
  city?: string
  state?: string
}

export type WeatherData = {
  temp: number | null
  unit: string
  feelsLike: number | null
  condition: string
  humidity: number | null
  windSpeed: number | null
  windSpeedUnit: string | null
  windDirection: number | null
  isDaytime?: boolean
  uvIndex: number | null
}

function hasLocation(loc: WeatherLocation | null | undefined): boolean {
  if (!loc) return false
  if (loc.latitude != null && loc.longitude != null && !Number.isNaN(loc.latitude) && !Number.isNaN(loc.longitude)) return true
  if (loc.address?.trim()) return true
  if (loc.city?.trim() && loc.state?.trim()) return true
  return false
}

function buildQuery(loc: WeatherLocation): string {
  const params = new URLSearchParams()
  if (loc.latitude != null && loc.longitude != null && !Number.isNaN(loc.latitude) && !Number.isNaN(loc.longitude)) {
    params.set('lat', String(loc.latitude))
    params.set('lng', String(loc.longitude))
  } else if (loc.address?.trim()) {
    params.set('address', loc.address.trim())
  } else if (loc.city?.trim() && loc.state?.trim()) {
    params.set('city', loc.city.trim())
    params.set('state', loc.state.trim())
  }
  params.set('units', 'IMPERIAL')
  return params.toString()
}

export function useWeather(location: WeatherLocation | null | undefined) {
  return useQuery({
    queryKey: ['weather', location?.latitude, location?.longitude, location?.address, location?.city, location?.state],
    queryFn: async (): Promise<WeatherData> => {
      const q = buildQuery(location!)
      const base = typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_API_URL || '')
      const res = await fetch(`${base}/api/weather?${q}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.message || err?.error || `Weather ${res.status}`)
      }
      return res.json()
    },
    enabled: hasLocation(location),
    staleTime: 1000 * 60 * 10, // 10 min
  })
}
