import type { ReactNode } from 'react'

/**
 * Dark opening band for every public page except the home page (which has its own hero).
 * `children` is for buttons or a short extra line under the lead. `aside` is an optional
 * visual shown to the right at lg and up, and under the text below that.
 */
export function PageHero({
  title,
  lead,
  children,
  aside,
}: {
  title: ReactNode
  lead?: ReactNode
  children?: ReactNode
  aside?: ReactNode
}) {
  return (
    <section
      data-header-tone="dark"
      className="relative isolate overflow-hidden bg-zinc-950 px-6 pb-16 pt-32 text-white lg:px-10 lg:pb-24 lg:pt-44"
    >
      {/* Soft blue light, top right. Decorative only. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-48 -top-56 -z-10 h-[36rem] w-[36rem] rounded-full bg-[#002FA7]/45 blur-[150px]"
      />
      <div className={`mx-auto max-w-7xl ${aside ? 'grid items-center gap-12 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-16' : ''}`}>
        <div className="max-w-3xl">
          <h1 className="np-display np-enter text-[2.75rem] sm:text-6xl lg:text-7xl">{title}</h1>
          {lead ? (
            <p className="np-enter mt-6 max-w-xl text-lg leading-8 text-zinc-300" style={{ animationDelay: '80ms' }}>
              {lead}
            </p>
          ) : null}
          {children ? (
            <div className="np-enter mt-9" style={{ animationDelay: '160ms' }}>
              {children}
            </div>
          ) : null}
        </div>
        {aside ? (
          <div className="np-enter" style={{ animationDelay: '200ms' }}>
            {aside}
          </div>
        ) : null}
      </div>
    </section>
  )
}
