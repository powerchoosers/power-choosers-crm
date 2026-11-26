import type { Metadata } from 'next'
import { HeroSection } from '@/components/landing/HeroSection'
import { LandingSections } from '@/components/landing/LandingSections'
import { PublicShell } from '@/components/landing/PublicShell'

export const metadata: Metadata = {
  title: 'Nodal Point | Energy Broker for Texas Businesses',
  description:
    'Nodal Point is an energy broker for Texas businesses. We read your electricity bill, show you where you are overpaying, and negotiate a better plan with suppliers.',
  alternates: { canonical: 'https://nodalpoint.io' },
}

/** Public home page. Dark server-rendered hero (fast LCP), light body, dark close. */
export default function LandingPage() {
  return (
    <PublicShell>
      <HeroSection />
      <LandingSections />
    </PublicShell>
  )
}
