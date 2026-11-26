import { BillGaps } from '@/components/landing/BillGaps'
import { ClosingCta } from '@/components/landing/ClosingCta'
import { Reveal } from '@/components/landing/Reveal'
import { SupplierTicker, SUPPLIER_LOGOS } from '@/components/landing/SupplierTicker'
import { TextLink } from '@/components/landing/ui'
import { HOW_IT_WORKS_STEPS, INDUSTRIES } from '@/components/landing/content'

/** Everything on the home page below the hero. */
export function LandingSections() {
  return (
    <>
      <SupplierTicker label="Suppliers we compare for you" logos={SUPPLIER_LOGOS} />

      <BillGaps />

      <section id="how-it-works" className="scroll-mt-16 bg-zinc-100 px-6 py-20 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <Reveal className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="np-display max-w-2xl text-4xl text-zinc-950 md:text-[3.25rem]">How it works</h2>
            <TextLink href="/how-it-works">See the full process</TextLink>
          </Reveal>
          <ol className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS_STEPS.map((step, index) => (
              <li key={step.title}>
                <Reveal delay={index * 0.07} className="border-t-2 border-zinc-950 pt-5">
                  <span className="text-sm font-medium text-[#002FA7]">Step {index + 1}</span>
                  <h3 className="mt-3 text-xl font-semibold tracking-[-0.02em] text-zinc-950">{step.title}</h3>
                  <p className="mt-2 text-base leading-7 text-zinc-600">{step.body}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-white px-6 py-20 lg:px-10 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20">
          <Reveal>
            <h2 className="np-display text-4xl text-zinc-950 md:text-[3.25rem]">
              Built for Texas businesses that use real power.
            </h2>
            <p className="mt-5 max-w-lg text-lg leading-8 text-zinc-600">
              Every kind of business uses electricity differently, so the gaps show up in different
              places.
            </p>
            <TextLink href="/who-we-serve" className="mt-8">
              See who we work with
            </TextLink>
          </Reveal>
          <Reveal delay={0.08}>
            <dl className="border-t border-zinc-200">
              {INDUSTRIES.map((item) => (
                <div
                  key={item.title}
                  className="grid gap-1 border-b border-zinc-200 py-5 transition-[padding] duration-300 ease-out hover:pl-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-8"
                >
                  <dt className="text-lg font-semibold tracking-[-0.01em] text-zinc-950">{item.title}</dt>
                  <dd className="text-base leading-7 text-zinc-600">{item.summary}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      <ClosingCta />
    </>
  )
}
