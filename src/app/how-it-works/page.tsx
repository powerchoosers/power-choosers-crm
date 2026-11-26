import type { Metadata } from 'next'
import { ClosingCta } from '@/components/landing/ClosingCta'
import { PageHero } from '@/components/landing/PageHero'
import { PublicShell } from '@/components/landing/PublicShell'
import { Reveal } from '@/components/landing/Reveal'
import { OutlineLink, PrimaryLink } from '@/components/landing/ui'
import { HOW_IT_WORKS_STEPS } from '@/components/landing/content'

export const metadata: Metadata = {
  title: 'How It Works | Nodal Point',
  description:
    'What happens after you send Nodal Point an electricity bill: what we look at, how suppliers compete for your account, and what you get back.',
  alternates: { canonical: 'https://nodalpoint.io/how-it-works' },
}

/** Extra detail for each of the four shared steps, in the same order. */
const STEP_DETAIL = [
  [
    'One recent bill is enough to start.',
    'Your bill stays private. We use it to prepare your review and do not share it with suppliers unless you ask us to.',
  ],
  [
    'We separate supply, delivery, and demand charges so the bill is easier to read.',
    'We compare those charges against the contract terms that created them.',
    'We check the market so you know whether the bill is normal, high, or worth a closer look.',
  ],
  [
    'Offers are compared on the whole bill, not only the rate per kWh.',
    'The goal is the right plan, not a switch. A bad offer gets turned down before it becomes your problem.',
  ],
  [
    'We prepare the agreement and walk you through what you are signing.',
    'After you sign, we keep an eye on the market so the next renewal is not a surprise.',
  ],
] as const

const READOUT = [
  { title: 'What changed on the bill', body: 'The main cost driver first, not buried on page three.' },
  { title: 'Why it matters to the business', body: 'What that charge is costing you, in plain English.' },
  { title: 'What to do next', body: 'One clear recommendation: a closer review, a call, or leave it alone.' },
] as const

const PRINCIPLES = [
  {
    title: 'Built for Texas',
    body: 'Our review is built around how Texas power is actually billed: delivery charges from your local utility, summer peak charges, and price spikes when the grid is tight.',
  },
  {
    title: 'Supplier neutral',
    body: 'We compare across our supplier partners and recommend what fits. If an offer is not good for you, we say so.',
  },
  {
    title: 'Private by design',
    body: 'Your bill is used to find your cost drivers and prepare your review. No public sharing, and no supplier referrals without your consent.',
  },
  {
    title: 'Plain language',
    body: 'We show the biggest number first and explain it the way one business owner would explain it to another.',
  },
] as const

export default function HowItWorksPage() {
  return (
    <PublicShell>
      <PageHero
        title="From one bill to a better plan."
        lead="Here is exactly what happens after you send us a bill: what we look at, how suppliers compete for your account, and what you get back."
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
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <h2 className="np-display max-w-2xl text-4xl text-zinc-950 md:text-[3.25rem]">Four steps, start to finish</h2>
          </Reveal>
          <ol className="mt-12 border-t border-zinc-200">
            {HOW_IT_WORKS_STEPS.map((step, index) => (
              <li key={step.title} className="border-b border-zinc-200">
                <Reveal className="grid gap-6 py-10 lg:grid-cols-[6rem_minmax(0,5fr)_minmax(0,6fr)] lg:gap-12">
                  <span className="np-display text-6xl text-[#002FA7] [font-variant-numeric:lining-nums]" aria-hidden>
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-2xl font-semibold tracking-[-0.02em] text-zinc-950">
                      <span className="sr-only">Step {index + 1}: </span>
                      {step.title}
                    </h3>
                    <p className="mt-3 max-w-md text-lg leading-8 text-zinc-600">{step.body}</p>
                  </div>
                  <ul className="space-y-3 lg:pt-1">
                    {STEP_DETAIL[index].map((line) => (
                      <li key={line} className="flex gap-3 text-base leading-7 text-zinc-600">
                        <span aria-hidden className="mt-3 h-px w-4 shrink-0 bg-[#002FA7]" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-zinc-100 px-6 py-20 lg:px-10 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20">
          <Reveal>
            <h2 className="np-display text-4xl text-zinc-950 md:text-[3.25rem]">What you get back</h2>
            <p className="mt-5 max-w-lg text-lg leading-8 text-zinc-600">
              A short readout a business leader can use. We find the largest cost driver first and
              tell you what to do about it, without making you decode a page of jargon.
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
              <p className="text-sm font-medium text-zinc-950">Your bill review</p>
              <p className="mt-1 text-sm text-zinc-500">Three things, in this order</p>
              <ol className="mt-6 border-t border-zinc-200">
                {READOUT.map((item, index) => (
                  <li key={item.title} className="flex gap-5 border-b border-zinc-200 py-5 last:border-b-0 last:pb-0">
                    <span className="text-sm font-semibold tabular-nums text-[#002FA7]">{index + 1}</span>
                    <div>
                      <h3 className="text-lg font-semibold tracking-[-0.01em] text-zinc-950">{item.title}</h3>
                      <p className="mt-1 text-base leading-7 text-zinc-600">{item.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-white px-6 py-20 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <h2 className="np-display max-w-2xl text-4xl text-zinc-950 md:text-[3.25rem]">How we work</h2>
          </Reveal>
          <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {PRINCIPLES.map((item, index) => (
              <Reveal key={item.title} delay={index * 0.07} className="border-t-2 border-zinc-950 pt-5">
                <h3 className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">{item.title}</h3>
                <p className="mt-2 text-base leading-7 text-zinc-600">{item.body}</p>
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-20 grid gap-8 border-t border-zinc-200 pt-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20">
            <p className="np-display text-3xl text-zinc-950 md:text-4xl">
              We started Nodal Point after seeing too many businesses pay more than they needed to
              because the bill was hard to read.
            </p>
            <div className="space-y-5 text-lg leading-8 text-zinc-600">
              <p>
                The problem is usually not a single mistake. It is a stack of small charges,
                contract terms, and timing issues that are easy to miss when the bill is crowded.
              </p>
              <p>
                Our job is to pull those pieces apart, explain them in plain English, and show you
                what matters next.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <ClosingCta />
    </PublicShell>
  )
}
