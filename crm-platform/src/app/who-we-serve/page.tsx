import type { Metadata } from 'next'
import { LandingHeader } from '@/components/landing/LandingHeader'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { WhoWeServeSection } from '@/components/landing/WhoWeServeSection'

export const metadata: Metadata = {
  title: 'Who We Serve | Nodal Point',
  description:
    'Manufacturing, logistics, commercial real estate, hospitality, office, and restaurants. Nodal Point compares supplier offers, negotiates rates, and handles the paperwork for Texas businesses.',
  alternates: {
    canonical: 'https://nodalpoint.io/who-we-serve',
  },
}

export default function WhoWeServePage() {
  return (
    <div className="bg-[#F5F5F7] min-h-screen relative overflow-hidden font-sans selection:bg-[#002FA7] selection:text-white">
      <LandingHeader />
      <div className="fixed inset-0 bg-[radial-gradient(#002FA7_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.08] pointer-events-none" />

      <main className="relative z-10">
        <WhoWeServeSection />
      </main>

      <LandingFooter />
    </div>
  )
}
