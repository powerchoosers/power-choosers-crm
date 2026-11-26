'use client'

import { useId, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'
import { ClosingCta } from '@/components/landing/ClosingCta'
import { PageHero } from '@/components/landing/PageHero'
import { PublicShell } from '@/components/landing/PublicShell'
import { Reveal } from '@/components/landing/Reveal'
import { TextLink, buttonPrimary, focusOnLight } from '@/components/landing/ui'

const EASE = [0.23, 1, 0.32, 1] as const

const labelClass = 'block text-sm font-medium text-zinc-950'
const inputClass =
  'mt-2 block w-full rounded-[10px] border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-950 placeholder:text-zinc-400 transition-[border-color,box-shadow] duration-200 focus:border-[#002FA7] focus:outline-none focus:ring-4 focus:ring-[#002FA7]/15'
const contactLinkClass = `np-link rounded-sm text-xl font-semibold tracking-[-0.02em] text-zinc-950 tabular-nums hover:text-[#002FA7] ${focusOnLight}`

export default function Contact() {
  const [formState, setFormState] = useState({ name: '', company: '', email: '', message: '' })
  const [formStatus, setFormStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const reduceMotion = useReducedMotion()
  const fieldId = useId()

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormStatus('sending')

    try {
      const res = await fetch('/api/contact-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formState),
      })

      if (!res.ok) throw new Error('Failed to send message')
      setFormStatus('sent')
    } catch {
      setFormStatus('error')
    }
  }

  const swap = reduceMotion
    ? { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
        transition: { duration: 0.35, ease: EASE },
      }

  return (
    <PublicShell>
      <PageHero
        title="Contact us"
        lead="Reach out if you want the bill reviewed, need help understanding a contract, or just want a straight answer."
      >
        <p className="text-sm text-zinc-400">We respond within 24 hours, Monday to Friday.</p>
      </PageHero>

      <section id="contact-form" className="scroll-mt-16 bg-white px-6 py-16 lg:px-10 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-20">
          <Reveal>
            <h2 className="np-display text-4xl text-zinc-950 md:text-[3.25rem]">Send a message</h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-zinc-600">
              Tell us what you need help with and we&apos;ll reply by email.
            </p>

            <div className="mt-10 max-w-xl">
              <AnimatePresence mode="wait" initial={false}>
                {formStatus === 'sent' ? (
                  <motion.div
                    key="sent"
                    {...swap}
                    role="status"
                    className="rounded-2xl border border-zinc-200 bg-zinc-50 p-8"
                  >
                    <motion.span
                      aria-hidden
                      initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.4, delay: 0.1, ease: EASE }}
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-[#002FA7] text-white"
                    >
                      <Check className="h-5 w-5" strokeWidth={2.5} />
                    </motion.span>
                    <h3 className="mt-5 text-xl font-semibold tracking-[-0.02em] text-zinc-950">Message received</h3>
                    <p className="mt-2 text-base leading-7 text-zinc-600">
                      We&apos;ll reply within 24 hours, Monday to Friday.
                    </p>
                  </motion.div>
                ) : (
                  <motion.form key="form" {...swap} onSubmit={handleFormSubmit} className="space-y-6">
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div>
                        <label htmlFor={`${fieldId}-name`} className={labelClass}>
                          Your name
                        </label>
                        <input
                          id={`${fieldId}-name`}
                          type="text"
                          autoComplete="name"
                          required
                          value={formState.name}
                          onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label htmlFor={`${fieldId}-company`} className={labelClass}>
                          Company <span className="font-normal text-zinc-500">(optional)</span>
                        </label>
                        <input
                          id={`${fieldId}-company`}
                          type="text"
                          autoComplete="organization"
                          value={formState.company}
                          onChange={(e) => setFormState((s) => ({ ...s, company: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor={`${fieldId}-email`} className={labelClass}>
                        Work email
                      </label>
                      <input
                        id={`${fieldId}-email`}
                        type="email"
                        autoComplete="email"
                        placeholder="you@company.com"
                        required
                        value={formState.email}
                        onChange={(e) => setFormState((s) => ({ ...s, email: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor={`${fieldId}-message`} className={labelClass}>
                        What do you need help with?
                      </label>
                      <textarea
                        id={`${fieldId}-message`}
                        required
                        rows={5}
                        value={formState.message}
                        onChange={(e) => setFormState((s) => ({ ...s, message: e.target.value }))}
                        className={`${inputClass} resize-none`}
                      />
                    </div>

                    <div>
                      <button
                        type="submit"
                        disabled={formStatus === 'sending'}
                        className={`${buttonPrimary} ${focusOnLight} w-full sm:w-auto`}
                      >
                        {formStatus === 'sending' ? 'Sending...' : 'Send message'}
                      </button>
                      {formStatus === 'error' ? (
                        <p role="alert" className="mt-3 text-sm text-red-600">
                          Your message did not send. Try again, or email us at{' '}
                          <a href="mailto:signal@nodalpoint.io" className="font-medium underline underline-offset-2">
                            signal@nodalpoint.io
                          </a>
                          .
                        </p>
                      ) : null}
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </Reveal>

          <Reveal delay={0.07}>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 sm:p-8">
              <h3 className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">Reach us directly</h3>
              <dl className="mt-6 space-y-6">
                <div>
                  <dt className="text-sm text-zinc-500">Phone</dt>
                  <dd className="mt-1">
                    <a href="tel:+18178093367" className={contactLinkClass}>
                      +1 (817) 809-3367
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-zinc-500">Email</dt>
                  <dd className="mt-1">
                    <a href="mailto:signal@nodalpoint.io" className={`${contactLinkClass} break-all`}>
                      signal@nodalpoint.io
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-zinc-500">Location</dt>
                  <dd className="mt-1 text-xl font-semibold tracking-[-0.02em] text-zinc-950">North Texas</dd>
                  <dd className="mt-1 text-sm text-zinc-500">ERCOT region</dd>
                </div>
              </dl>

              <div className="mt-8 border-t border-zinc-200 pt-6">
                <p className="text-base leading-7 text-zinc-600">Want to move faster?</p>
                <div className="mt-3 flex flex-col items-start gap-3">
                  <TextLink href="/bill-debugger">Review my bill</TextLink>
                  <TextLink href="/book">Book a call</TextLink>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <ClosingCta />
    </PublicShell>
  )
}
