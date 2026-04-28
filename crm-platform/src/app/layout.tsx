import './globals.css'
import Providers from './providers'
import { Toaster } from 'sonner'
import { Inter } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import ApolloTracker from '@/components/apollo-tracker'
import LinkedInInsightTag from '@/components/linkedin-insight-tag'
import { CookieBanner } from '@/components/landing/CookieBanner'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const BASE_URL = 'https://nodalpoint.io'

export const viewport: Viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: 'Nodal Point | Commercial Energy Procurement',
  description: 'Review bills, compare supplier offers, negotiate rates, and handle paperwork for Texas businesses. Nodal Point shows the biggest cost drivers and the next step.',
  icons: {
    icon: '/images/nodalpoint-webicon.png',
    apple: '/images/nodalpoint-webicon.png',
    shortcut: '/images/nodalpoint-webicon.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'Nodal Point',
    title: 'Nodal Point | Commercial Energy Procurement',
    description: 'Review bills, compare supplier offers, negotiate rates, and handle paperwork for Texas businesses. No guesswork. No noise.',
    url: BASE_URL,
    images: [
      {
        url: '/images/og-card.jpg',
        width: 1200,
        height: 630,
        alt: 'Nodal Point — Commercial Energy Procurement',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nodal Point | Commercial Energy Procurement',
    description: 'Review bills, compare supplier offers, negotiate rates, and handle paperwork for Texas businesses. No guesswork. No noise.',
    images: ['/images/og-card.jpg'],
  },
  alternates: {},
}

const SCHEMA_ORG = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Nodal Point',
  url: BASE_URL,
  logo: `${BASE_URL}/images/nodalpoint.png`,
  description:
    'Commercial energy procurement, supplier negotiation, and bill analysis for businesses in the ERCOT market. We help Texas companies compare supplier offers, negotiate terms, and understand the main cost drivers.',
  sameAs: ['https://www.linkedin.com/company/nodal-point/'],
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: '+1-817-809-3367',
    contactType: 'customer service',
    email: 'signal@nodalpoint.io',
    areaServed: 'US-TX',
    availableLanguage: 'English',
  },
  address: {
    '@type': 'PostalAddress',
    addressRegion: 'TX',
    addressCountry: 'US',
  },
  knowsAbout: [
    'ERCOT',
    'Texas energy market',
    'commercial energy procurement',
    'commercial energy tariffs',
    'demand charges',
    '4CP peaks',
    'supplier negotiation',
    'contract management',
    'energy bill review',
    'scarcity adders',
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA_ORG) }}
        />
      </head>
      <body
        className="bg-zinc-950 text-zinc-100 font-sans selection:bg-[#002FA7]"
        suppressHydrationWarning
      >
        <ApolloTracker />
        <LinkedInInsightTag />
        <CookieBanner />
        <Providers>
          <>
            {children}
            <Toaster position="top-right" theme="dark" />
          </>
        </Providers>
      </body>
    </html>
  )
}
