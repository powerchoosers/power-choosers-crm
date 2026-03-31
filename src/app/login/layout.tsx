import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Nodal Point | Client Portal',
  description: 'Sign in to the Nodal Point client portal.',
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
