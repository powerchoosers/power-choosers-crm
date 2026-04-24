import type { Metadata } from 'next'
import { BriefingDeckClient } from './BriefingDeckClient'

export const metadata: Metadata = {
  title: 'East Coast Warehouse | Texas ERCOT Briefing',
  description:
    'A presentation for Sean Bowe that compares Baytown, Texas energy with East Coast Warehouse operations in New Jersey.',
  alternates: {
    canonical: 'https://nodalpoint.io/briefings/east-coast-warehouse-ercot',
  },
}

export default function EastCoastWarehouseERCOTPage() {
  return <BriefingDeckClient />
}
