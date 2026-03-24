import './globals.css'
import Providers from './providers'
import { Toaster } from 'sonner'
import { Inter } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import ApolloTracker from '@/components/apollo-tracker'
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
  title: 'Nodal Point | Commercial Energy Forensics & Audit',
  description: 'We do not guess; we measure. Nodal Point reverse-engineers supplier tariffs to eliminate hidden cost leakage and structural waste in your energy contract.',
  icons: {
    icon: '/images/nodalpoint-webicon.png',
    apple: '/images/nodalpoint-webicon.png',
    shortcut: '/images/nodalpoint-webicon.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'Nodal Point',
    title: 'Nodal Point | Commercial Energy Forensics & Audit',
    description: 'Reverse-engineer your supplier tariffs. Eliminate hidden cost leakage in your Texas energy contract. No guessing. No noise.',
    url: BASE_URL,
    images: [
      {
        url: '/images/og-card.jpg',
        width: 1200,
        height: 630,
        alt: 'Nodal Point — Commercial Energy Forensics',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nodal Point | Commercial Energy Forensics & Audit',
    description: 'Reverse-engineer your supplier tariffs. Eliminate hidden cost leakage. No noise.',
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
    'Commercial energy forensics and audit platform for businesses in the ERCOT market. We reverse-engineer supplier tariffs to expose hidden cost leakage.',
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
    'commercial energy tariffs',
    'demand charges',
    '4CP peaks',
    'energy forensics',
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
