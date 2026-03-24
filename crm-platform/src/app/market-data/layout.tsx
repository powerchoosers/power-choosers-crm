import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Nodal Point | Market Data',
  description: 'Live ERCOT grid intelligence. Track demand charges, 4CP exposure, and wholesale price signals for commercial facilities in Texas.',
  alternates: { canonical: 'https://nodalpoint.io/market-data' },
}

export default function MarketDataLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
