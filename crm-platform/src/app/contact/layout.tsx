import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Nodal Point | Contact',
  description: 'Reach Nodal Point directly. Talk to the team that reviews bills and helps businesses understand the next step.',
  alternates: { canonical: 'https://nodalpoint.io/contact' },
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
