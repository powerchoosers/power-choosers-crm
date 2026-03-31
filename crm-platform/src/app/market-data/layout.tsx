import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Nodal Point | Market Data',
  description: 'Live ERCOT market data and plain-English guidance for Texas business electricity costs.',
  alternates: { canonical: 'https://nodalpoint.io/market-data' },
}

export default function MarketDataLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
