import { LoadSurface } from '@/components/landing/LoadSurface'
import { OutlineLink, PrimaryLink } from '@/components/landing/ui'

/**
 * Home page hero. Server-rendered so the headline is in the first HTML; the 3D visual
 * loads afterwards. Below lg the visual sits under the text and fills the rest of the
 * screen; at lg and up it runs behind the right side of the hero.
 */
export function HeroSection() {
  return (
    <section
      data-header-tone="dark"
      className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-zinc-950 text-white"
      aria-label="Introduction"
    >
      {/* Keeps the headline readable where the visual runs behind it (lg and up) */}
      <div className="pointer-events-none absolute inset-0 -z-10 hidden bg-gradient-to-r from-zinc-950 via-zinc-950/60 to-transparent lg:block" aria-hidden />

      <div className="mx-auto flex w-full max-w-7xl flex-col px-6 pt-28 lg:flex-1 lg:justify-center lg:px-10 lg:pb-24 lg:pt-24">
        <div className="max-w-3xl">
          <h1 className="np-display np-enter text-[2.9rem] sm:text-6xl lg:text-[5.25rem]">
            Find the gaps in your electricity plan.
          </h1>
          <p className="np-enter mt-6 max-w-xl text-lg leading-8 text-zinc-300" style={{ animationDelay: '80ms' }}>
            Nodal Point is an energy broker for Texas businesses. We read your bill, show you where
            you&apos;re overpaying, and negotiate a better plan with suppliers.
          </p>
          <div className="np-enter mt-9 flex flex-col gap-3 sm:flex-row" style={{ animationDelay: '160ms' }}>
            <PrimaryLink href="/bill-debugger" surface="dark">
              Review my bill
            </PrimaryLink>
            <OutlineLink href="/book" surface="dark" className="backdrop-blur-sm">
              Book a call
            </OutlineLink>
          </div>
        </div>
      </div>

      <div className="relative -z-10 min-h-64 flex-1 lg:absolute lg:inset-y-0 lg:left-[30%] lg:right-0 lg:min-h-0 lg:[mask-image:linear-gradient(to_right,transparent,black_30%)]">
        <LoadSurface />
      </div>

      <p className="mx-auto w-full max-w-7xl px-6 pb-8 text-sm leading-6 text-zinc-400 lg:px-10 lg:text-right">
        <span className="lg:ml-auto lg:block lg:max-w-xs">
          One building&apos;s electricity use across a year. The bright spikes are the few hours
          that push the bill up.
        </span>
      </p>
    </section>
  )
}
