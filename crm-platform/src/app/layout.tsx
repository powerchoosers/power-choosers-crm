import './globals.css'
import Providers from './providers'
import { Toaster } from 'sonner'

export const metadata = {
  title: 'Nodal Point | Signal Over Noise in the Texas Energy Market',
  description: 'The Texas grid is designed to confuse. We view complexity as a design flaw. Nodal Point is the forensic engine that decodes volatility, eliminates demand ratchets, and reveals the true cost of power.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-zinc-950 text-zinc-50">
        <Providers>
          {children}
          <Toaster position="top-right" theme="dark" />
        </Providers>
      </body>
    </html>
  )
}
