'use client'

import { useState } from 'react'

type GapId = 'peak' | 'fees' | 'plan'

const GAPS: { id: GapId; title: string; body: string }[] = [
  {
    id: 'peak',
    title: 'Peak charges',
    body: 'One busy hour can set a charge you keep paying for months. We find the hour and what caused it.',
  },
  {
    id: 'fees',
    title: 'Fees passed through to you',
    body: 'A quote can show a low rate while delivery and admin fees land on the invoice. We read the contract to see what is really included.',
  },
  {
    id: 'plan',
    title: 'The wrong kind of plan',
    body: 'Fixed, indexed, or a mix: each one costs differently depending on when you use power. We match the plan to how your business runs.',
  },
]

/** Illustrative line items. The total, usage and "nearly half" split come from a real warehouse review. */
const BILL_LINES: { label: string; detail: string; amount: string; gap: GapId }[] = [
  { label: 'Energy charge', detail: '20,250 kWh', amount: '1,913.63', gap: 'plan' },
  { label: 'Delivery charges', detail: 'Utility', amount: '1,062.40', gap: 'fees' },
  { label: 'Demand charge', detail: 'Peak use', amount: '611.25', gap: 'peak' },
  { label: 'Taxes and fees', detail: 'Pass-through', amount: '148.16', gap: 'fees' },
]

export function BillGaps() {
  const [active, setActive] = useState<GapId>('peak')

  return (
    <section className="bg-white px-6 py-20 lg:px-10 lg:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20">
        <div>
          <h2 className="np-display text-4xl text-zinc-950 md:text-[3.25rem]">
            Most overpaying isn&apos;t in the rate.
          </h2>
          <p className="mt-5 max-w-lg text-lg leading-8 text-zinc-600">
            The price per kWh is the number everyone compares. The gaps are usually in the other
            lines. Pick one to see where it shows up on a bill.
          </p>

          <div className="mt-10 border-t border-zinc-200">
            {GAPS.map((gap) => {
              const selected = gap.id === active
              return (
                <button
                  key={gap.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setActive(gap.id)}
                  onMouseEnter={() => setActive(gap.id)}
                  onFocus={() => setActive(gap.id)}
                  className={`block w-full border-b border-l-2 border-b-zinc-200 py-5 pl-5 pr-2 text-left transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#002FA7] ${
                    selected ? 'border-l-[#002FA7]' : 'border-l-transparent'
                  }`}
                >
                  <span className={`block text-lg font-semibold tracking-[-0.01em] transition-colors duration-200 ${selected ? 'text-[#002FA7]' : 'text-zinc-950'}`}>
                    {gap.title}
                  </span>
                  <span className="mt-1.5 block max-w-md text-base leading-7 text-zinc-600">{gap.body}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="lg:pt-2">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 sm:p-8">
            <div className="flex items-start justify-between gap-6 border-b border-zinc-300 pb-5">
              <div>
                <p className="text-sm font-medium text-zinc-950">Sample electricity bill</p>
                <p className="mt-1 text-sm text-zinc-500">Warehouse, North Texas</p>
              </div>
              <p className="text-right text-sm text-zinc-500">One month</p>
            </div>

            <ul>
              {BILL_LINES.map((line) => {
                const lit = line.gap === active
                return (
                  <li
                    key={line.label}
                    className={`-mx-3 flex items-baseline justify-between gap-4 rounded-lg px-3 py-4 transition-[background-color,color,transform,box-shadow] duration-300 ease-out ${lit ? 'scale-[1.015] shadow-[0_12px_30px_-14px_rgba(0,47,167,0.7)]' : ''} ${
                      lit ? 'bg-[#002FA7] text-white' : 'text-zinc-400'
                    }`}
                  >
                    <span>
                      <span className={`block text-base font-medium ${lit ? 'text-white' : 'text-zinc-700'}`}>{line.label}</span>
                      <span className={`block text-sm ${lit ? 'text-white/70' : 'text-zinc-400'}`}>{line.detail}</span>
                    </span>
                    <span className={`text-base font-medium tabular-nums ${lit ? 'text-white' : 'text-zinc-700'}`}>
                      ${line.amount}
                    </span>
                  </li>
                )
              })}
            </ul>

            <div className="flex items-baseline justify-between gap-4 border-t border-zinc-300 pt-5">
              <span className="text-base font-semibold text-zinc-950">Total due</span>
              <span className="np-display text-4xl text-zinc-950 [font-variant-numeric:lining-nums_tabular-nums]">$3,735.44</span>
            </div>
          </div>

          <p className="mt-5 max-w-lg text-base leading-7 text-zinc-950">
            On this bill, delivery and demand charges were nearly half the total.
          </p>
          <p className="mt-1 text-sm leading-6 text-zinc-500">
            Based on a real Texas warehouse review. Line items are simplified for illustration.
          </p>
        </div>
      </div>
    </section>
  )
}
