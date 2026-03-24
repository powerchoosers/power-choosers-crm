import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Nodal Point | Contact',
  description: 'Reach Nodal Point directly. We do not have a sales team — when you call, you speak to the engineers who build the strategy.',
  alternates: { canonical: 'https://nodalpoint.io/contact' },
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
