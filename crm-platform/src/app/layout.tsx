import './globals.css'
import Providers from './providers'
import { Toaster } from 'sonner'

export const metadata = {
  title: 'Nodal Point',
  description: 'Smart Energy Choices. Real Savings.',
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
