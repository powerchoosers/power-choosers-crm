import Image from 'next/image'
import Link from 'next/link'

const NAV_GROUPS = [
  {
    label: 'Platform',
    links: [
      { label: 'Bill Debugger', href: '/bill-debugger' },
      { label: 'Book a Consultation', href: '/book' },
      { label: 'Sign In', href: '/network' },
    ],
  },
  {
    label: 'Company',
    links: [
      { label: 'The Philosophy', href: '/philosophy' },
      { label: 'The Methodology', href: '/technical-docs' },
      { label: 'Market Data', href: '/market-data' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    label: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
    ],
  },
] as const

export function LandingFooter() {
  return (
    <footer className="bg-zinc-900 text-zinc-400 pt-16 pb-10 px-6 border-t border-zinc-800">
      <div className="max-w-7xl mx-auto">

        {/* Main grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-12">

          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <div className="bg-white p-2.5 rounded-2xl w-fit mb-5">
              <Image
                src="/images/nodalpoint.png"
                alt="Nodal Point Logo"
                width={100}
                height={40}
                className="h-10 w-auto"
              />
            </div>
            <p className="text-sm text-zinc-500 leading-relaxed mb-6 max-w-[200px]">
              Forensic energy audit platform for commercial businesses in the ERCOT market.
            </p>
            {/* LinkedIn */}
            <a
              href="https://www.linkedin.com/company/nodal-point"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Nodal Point on LinkedIn"
              className="inline-flex items-center justify-center w-9 h-9 bg-zinc-800 hover:bg-[#002FA7] rounded-lg transition-colors duration-200"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
          </div>

          {/* Nav columns */}
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <h4 className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-5">
                {group.label}
              </h4>
              <ul className="space-y-3">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-zinc-400 hover:text-white transition-colors duration-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Contact column */}
          <div>
            <h4 className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-5">
              Contact
            </h4>
            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href="mailto:signal@nodalpoint.io"
                  className="text-zinc-400 hover:text-white transition-colors duration-200"
                >
                  signal@nodalpoint.io
                </a>
              </li>
              <li>
                <a
                  href="tel:+18178093367"
                  className="text-zinc-400 hover:text-white transition-colors duration-200"
                >
                  +1 (817) 809-3367
                </a>
              </li>
              <li className="text-zinc-600 text-xs font-mono pt-2 leading-relaxed">
                ERCOT Region<br />
                North Texas Operations
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom bar */}
        <div className="border-t border-zinc-800 pt-8">
          <p className="font-mono text-xs tracking-widest opacity-50 text-center">
            &copy; 2026 Nodal Point. All Systems Nominal.
          </p>
        </div>

      </div>
    </footer>
  )
}
