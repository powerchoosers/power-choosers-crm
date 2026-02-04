import './globals.css'
import Providers from './providers'
import { Toaster } from 'sonner'
import { Inter } from 'next/font/google'
import type { Metadata, Viewport } from 'next'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const viewport: Viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: 'Nodal Point | Commercial Energy Forensics & Audit',
  description: 'We do not guess; we measure. Nodal Point reverse-engineers supplier tariffs to eliminate hidden cost leakage and structural waste in your energy contract.',
  icons: {
    icon: '/images/nodalpoint-webicon.png',
    apple: '/images/nodalpoint-webicon.png',
    shortcut: '/images/nodalpoint-webicon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body className="bg-zinc-950 text-zinc-100 font-sans selection:bg-[#002FA7]">
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
