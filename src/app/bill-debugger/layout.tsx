import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Nodal Point | Review My Bill',
  description: 'Upload your Texas energy bill or supplier offer and get a plain-English review of the main cost drivers in under 60 seconds.',
  alternates: { canonical: 'https://nodalpoint.io/bill-debugger' },
}

export default function BillDebuggerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
