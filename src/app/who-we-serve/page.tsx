import type { Metadata } from 'next'
import Image from 'next/image'
import { ClosingCta } from '@/components/landing/ClosingCta'
import { PageHero } from '@/components/landing/PageHero'
import { PublicShell } from '@/components/landing/PublicShell'
import { Reveal } from '@/components/landing/Reveal'
import { OutlineLink, PrimaryLink } from '@/components/landing/ui'
import { INDUSTRIES } from '@/components/landing/content'

export const metadata: Metadata = {
  title: 'Who We Serve | Nodal Point',
  description:
    'Manufacturing, logistics, commercial real estate, hospitality, office, and restaurants. Nodal Point compares supplier offers, negotiates rates, and handles the paperwork for Texas businesses.',
  alternates: {
    canonical: 'https://nodalpoint.io/who-we-serve',
  },
}

const PATTERNS = [
  {
    title: 'Peak use is usually the first leak.',
    body: 'Production lines, loading docks, kitchens, and air conditioning can set a charge that outlasts the busy hour that caused it.',
    look: 'Demand charges and summer peak hours',
  },
  {
    title: 'The contract can hide the real rate.',
    body: 'Pass-through language, delivery charges, and admin fees can make a quote look competitive while the invoice says something else.',
    look: 'Pass-through terms, delivery, and admin fees',
  },
  {
    title: 'The right plan depends on how the business runs.',
    body: 'Fixed, indexed, and mixed plans behave differently once your real schedule, peak use, and seasonal swings are applied.',
    look: 'Fixed, indexed, or a mix',
  },
] as const

/** Real, anonymized reviews. Do not change these numbers without a source. */
const CASES = [
  {
    title: 'Logistics warehouse',
    region: 'Oncor area, Texas',
    bill: '$3,735.44',
    usage: '20,250 kWh',
    issue: 'Delivery and demand charges were nearly half the bill.',
    action: 'Capacitor bank review plus a look at which hours set the demand charge.',
  },
  {
    title: 'Manufacturing facility',
    region: 'CenterPoint area, Texas',
    bill: '$18,442.17',
    usage: '112,600 kWh',
    issue: 'A past usage spike was still adding 85 kW worth of charges.',
    action: 'Summer peak-hour review and an equipment timing check.',
  },
  {
    title: 'Commercial office building',
    region: 'Oncor area, Texas',
    bill: '$8,917.63',
    usage: '54,300 kWh',
    issue: 'Pass-through fees and delivery charges were hiding more than half the invoice.',
    action: 'Audit of the contract language and the delivery schedule.',
  },
] as const

export default function WhoWeServePage() {
  return (
    <PublicShell>
      <PageHero
        title="Texas businesses that use real power."
        lead="We work with manufacturing, logistics, commercial real estate, hospitality, office, and restaurants. Each one uses electricity differently, so the contract and the plan have to fit the business."
        aside={
          <figure>
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
              <Image
                src="/images/texas-tdsp-map.png"
                alt="Map of the Texas areas where businesses can choose their electricity supplier"
                fill
                sizes="(min-width: 1024px) 40vw, 100vw"
                className="object-cover"
                priority
              />
            </div>
            <figcaption className="mt-3 text-sm leading-6 text-zinc-400">
              The parts of Texas where a business can choose its electricity supplier.
            </figcaption>
          </figure>
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <PrimaryLink href="/bill-debugger" surface="dark">
            Review my bill
          </PrimaryLink>
          <OutlineLink href="/book" surface="dark">
            Book a call
          </OutlineLink>
        </div>
      </PageHero>

      <section className="bg-white px-6 py-20 lg:px-10 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20">
          <Reveal>
            <h2 className="np-display text-4xl text-zinc-950 md:text-[3.25rem]">Industries we cover</h2>
            <p className="mt-5 max-w-lg text-lg leading-8 text-zinc-600">
              These are the kinds of accounts where the way you use power, the contract wording,
              and the choice of supplier really change the answer.
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <dl className="border-t border-zinc-200">
              {INDUSTRIES.map((item) => (
                <div
                  key={item.title}
                  className="border-b border-zinc-200 py-6 transition-[padding] duration-300 ease-out hover:pl-2"
                >
                  <dt className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">{item.title}</dt>
                  <dd className="mt-2 text-base leading-7 text-zinc-600">{item.summary}</dd>
                  <dd className="mt-1 text-sm leading-6 text-zinc-500">
                    <span className="font-medium text-zinc-700">What we watch:</span> {item.watch}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      <section className="bg-zinc-100 px-6 py-20 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <h2 className="np-display max-w-3xl text-4xl text-zinc-950 md:text-[3.25rem]">
              Different businesses leak in different places.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-600">
              We usually start with three things: when your use peaks, what the contract is really
              passing through to you, and whether the plan matches how you operate.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-x-10 gap-y-10 lg:grid-cols-3">
            {PATTERNS.map((pattern, index) => (
              <Reveal key={pattern.title} delay={index * 0.07} className="border-t-2 border-zinc-950 pt-5">
                <h3 className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">{pattern.title}</h3>
                <p className="mt-2 text-base leading-7 text-zinc-600">{pattern.body}</p>
                <p className="mt-4 text-sm leading-6 text-zinc-500">
                  <span className="font-medium text-zinc-700">Where we look:</span> {pattern.look}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-20 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <h2 className="np-display max-w-3xl text-4xl text-zinc-950 md:text-[3.25rem]">
              Three real bills, names removed.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-600">
              Company names are hidden. The numbers, the charges, and the recommended actions are
              real.
            </p>
          </Reveal>
          <div className="mt-12 border-t border-zinc-200">
            {CASES.map((item) => (
              <Reveal
                key={item.title}
                className="grid gap-6 border-b border-zinc-200 py-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,5fr)_minmax(0,2fr)] lg:gap-12"
              >
                <div>
                  <h3 className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">{item.title}</h3>
                  <p className="mt-1 text-sm text-zinc-500">{item.region}</p>
                </div>
                <div>
                  <p className="text-lg font-medium leading-7 tracking-[-0.01em] text-zinc-950">{item.issue}</p>
                  <p className="mt-2 text-base leading-7 text-zinc-600">
                    <span className="font-medium text-zinc-700">What we recommended:</span> {item.action}
                  </p>
                </div>
                <div className="lg:text-right">
                  <p className="np-display text-4xl text-zinc-950 [font-variant-numeric:lining-nums_tabular-nums]">
                    {item.bill}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    <span className="tabular-nums">{item.usage}</span> in the month
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <ClosingCta />
    </PublicShell>
  )
}
