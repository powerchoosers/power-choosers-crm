import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Nodal Point | Philosophy',
  description: 'Why Nodal Point keeps the language simple, the review clear, and the next step obvious.',
  alternates: { canonical: 'https://nodalpoint.io/philosophy' },
}

export default function PhilosophyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
