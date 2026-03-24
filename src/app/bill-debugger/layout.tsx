import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Nodal Point | Bill Debugger',
  description: 'Upload your Texas energy bill. Get a forensic breakdown of demand charges, delivery costs, and hidden cost leakage in under 60 seconds.',
  alternates: { canonical: 'https://nodalpoint.io/bill-debugger' },
}

export default function BillDebuggerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
