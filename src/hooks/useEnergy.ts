import { useQuery } from '@tanstack/react-query'

export interface EnergyPlan {
  id: string
  provider: string
  planName: string
  rate: number // cents per kWh
  term: number // months
  type: 'Fixed' | 'Variable' | 'Indexed'
  cancellationFee: string
  renewable: number // percentage
}

export function useEnergyPlans() {
  return useQuery({
    queryKey: ['energy-plans'],
    queryFn: async () => {
      // Mock Data Fallback
      return [
        { 
          id: '1', 
          provider: 'Reliant', 
          planName: 'Basic Power 12', 
          rate: 12.5, 
          term: 12, 
          type: 'Fixed', 
          cancellationFee: '$150',
          renewable: 20
        },
        { 
          id: '2', 
          provider: 'TXU Energy', 
          planName: 'Free Nights & Solar Days', 
          rate: 14.2, 
          term: 24, 
          type: 'Fixed', 
          cancellationFee: '$295',
          renewable: 100
        },
        { 
          id: '3', 
          provider: 'Green Mountain', 
          planName: 'Pollution Free e-Plus', 
          rate: 13.8, 
          term: 12, 
          type: 'Fixed', 
          cancellationFee: '$150',
          renewable: 100
        },
        { 
          id: '4', 
          provider: 'Gexa Energy', 
          planName: 'Gexa Eco Saver Plus 12', 
          rate: 9.9, 
          term: 12, 
          type: 'Fixed', 
          cancellationFee: '$150',
          renewable: 100
        },
        { 
          id: '5', 
          provider: 'Cirro Energy', 
          planName: 'Smart Lock 24', 
          rate: 11.5, 
          term: 24, 
          type: 'Fixed', 
          cancellationFee: '$200',
          renewable: 15
        },
      ] as EnergyPlan[]
    }
  })
}
