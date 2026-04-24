import type { Metadata } from 'next'
import { BriefingDeckClient } from './BriefingDeckClient'

export const metadata: Metadata = {
  title: 'East Coast Warehouse | Texas Energy Discovery',
  description:
    'A discovery meeting deck for Sean Bowe that compares Baytown, Texas energy with East Coast Warehouse operations in New Jersey.',
  alternates: {
    canonical: 'https://nodalpoint.io/briefings/east-coast-warehouse-ercot',
  },
}

export default function EastCoastWarehouseERCOTPage() {
  return <BriefingDeckClient />
}
