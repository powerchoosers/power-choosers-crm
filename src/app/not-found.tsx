import type { Metadata } from 'next'
import { PublicShell } from '@/components/landing/PublicShell'
import { OutlineLink, PrimaryLink } from '@/components/landing/ui'

export const metadata: Metadata = {
  title: 'Nodal Point | Page Not Found',
  description: 'The page you requested could not be found.',
}

export default function NotFound() {
  return (
    <PublicShell>
      <section
        data-header-tone="dark"
        className="relative isolate flex min-h-[80svh] items-center overflow-hidden bg-zinc-950 px-6 pb-20 pt-32 text-white lg:px-10"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-48 -top-56 -z-10 h-[36rem] w-[36rem] rounded-full bg-[#002FA7]/45 blur-[150px]"
        />
        <div className="mx-auto w-full max-w-7xl">
          <p className="np-enter text-sm font-medium text-zinc-400">Error 404</p>
          <h1 className="np-display np-enter mt-4 max-w-3xl text-[2.75rem] sm:text-6xl lg:text-7xl" style={{ animationDelay: '60ms' }}>
            We can&apos;t find that page.
          </h1>
          <p className="np-enter mt-6 max-w-xl text-lg leading-8 text-zinc-300" style={{ animationDelay: '120ms' }}>
            It may have moved, or the link may be out of date. Start again from the home page, or
            go straight to a bill review.
          </p>
          <div className="np-enter mt-9 flex flex-col gap-3 sm:flex-row" style={{ animationDelay: '180ms' }}>
            <PrimaryLink href="/" surface="dark">
              Go to the home page
            </PrimaryLink>
            <OutlineLink href="/bill-debugger" surface="dark">
              Review my bill
            </OutlineLink>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
