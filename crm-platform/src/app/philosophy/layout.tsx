import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Nodal Point | The Philosophy',
  description: 'We view complexity as a tax. The Texas grid is designed to confuse. Nodal Point was built to reverse-engineer it.',
  alternates: { canonical: 'https://nodalpoint.io/philosophy' },
}

export default function PhilosophyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
