import type { Metadata } from 'next'
import { LandingHeader } from '@/components/landing/LandingHeader'
import { HeroSection } from '@/components/landing/HeroSection'
import { LandingSections } from '@/components/landing/LandingSections'

export const metadata: Metadata = {
  alternates: { canonical: 'https://nodalpoint.io' },
}

/**
 * Landing page: server-rendered hero for fast LCP; header and sections are client for interactivity.
 */
export default function LandingPage() {
  return (
    <div className="bg-zinc-50 text-zinc-600 min-h-screen font-sans antialiased selection:bg-[#002FA7] selection:text-white overflow-x-hidden">
      <LandingHeader />
      <HeroSection />
      <LandingSections />
    </div>
  )
}
