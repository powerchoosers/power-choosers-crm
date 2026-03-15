import type { Viewport } from 'next'

// Allow pinch-to-zoom on the secure portal so users can read contract text
export const viewport: Viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

export default function SecurePortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
