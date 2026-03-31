import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Nodal Point | How It Works',
  description: 'Review the bill in three steps and see the next step.',
}

export default function TechnicalDocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
