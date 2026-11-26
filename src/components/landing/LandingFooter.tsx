import Image from 'next/image'
import Link from 'next/link'

const NAV_GROUPS = [
  {
    label: 'Get started',
    links: [
      { label: 'Review my bill', href: '/bill-debugger' },
      { label: 'Book a call', href: '/book' },
      { label: 'Client sign in', href: '/portal' },
    ],
  },
  {
    label: 'Company',
    links: [
      { label: 'How it works', href: '/how-it-works' },
      { label: 'Who we serve', href: '/who-we-serve' },
      { label: 'Market data', href: '/market-data' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    label: 'Legal',
    links: [
      { label: 'Privacy policy', href: '/privacy' },
      { label: 'Terms of service', href: '/terms' },
    ],
  },
] as const

const linkClass =
  'np-link rounded-sm text-sm text-zinc-400 transition-colors duration-200 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'

export function LandingFooter() {
  return (
    <footer data-header-tone="dark" className="bg-zinc-950 px-6 pb-10 pt-16 text-zinc-400 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-2 gap-x-8 gap-y-12 border-t border-white/10 pt-14 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex w-fit items-center gap-2.5 rounded-md text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              <Image src="/images/nodalpoint.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg bg-white p-0.5" />
              <span className="text-lg font-semibold tracking-[-0.02em]">Nodal Point</span>
            </Link>
            <p className="mt-5 max-w-xs text-sm leading-6">
              Energy broker for Texas businesses. We find the gaps in your electricity plan and
              negotiate a better one.
            </p>
            <ul className="mt-6 space-y-2">
              <li>
                <a href="mailto:signal@nodalpoint.io" className={linkClass}>
                  signal@nodalpoint.io
                </a>
              </li>
              <li>
                <a href="tel:+18178093367" className={linkClass}>
                  (817) 809-3367
                </a>
              </li>
              <li>
                <a
                  href="https://www.linkedin.com/company/nodal-point"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  LinkedIn
                </a>
              </li>
            </ul>
          </div>

          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <h2 className="text-sm font-medium text-white">{group.label}</h2>
              <ul className="mt-4 space-y-3">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={linkClass}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-14 text-sm text-zinc-500">&copy; 2026 Nodal Point. North Texas.</p>
      </div>
    </footer>
  )
}
