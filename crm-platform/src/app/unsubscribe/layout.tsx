import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Nodal Point | Email Preferences',
  description: 'Manage how Nodal Point contacts you.',
}

export default function UnsubscribeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
