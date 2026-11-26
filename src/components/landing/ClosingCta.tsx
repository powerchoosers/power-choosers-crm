import type { ReactNode } from 'react'
import { OutlineLink, PrimaryLink } from '@/components/landing/ui'
import { Reveal } from '@/components/landing/Reveal'

/**
 * Dark closing section that runs into the footer. Every public page ends with it.
 * Pass `title` / `body` only when the page needs different words from the default.
 */
export function ClosingCta({
  title = <>Send us one bill. We&apos;ll show you the gaps.</>,
  body = <>Upload a bill or a supplier offer and we&apos;ll tell you what we see and what to do next.</>,
}: {
  title?: ReactNode
  body?: ReactNode
}) {
  return (
    <section data-header-tone="dark" className="relative isolate overflow-hidden bg-zinc-950 px-6 py-20 text-white lg:px-10 lg:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-64 left-1/3 -z-10 h-[30rem] w-[44rem] rounded-full bg-[#002FA7]/35 blur-[150px]"
      />
      <Reveal className="mx-auto max-w-7xl">
        <h2 className="np-display max-w-3xl text-4xl sm:text-5xl lg:text-[4.25rem]">{title}</h2>
        <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-300">{body}</p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <PrimaryLink href="/bill-debugger" surface="dark">
            Review my bill
          </PrimaryLink>
          <OutlineLink href="/book" surface="dark">
            Book a call
          </OutlineLink>
        </div>
      </Reveal>
    </section>
  )
}
