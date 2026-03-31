'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { CheckCircle, Zap, Clock, XCircle, Linkedin } from 'lucide-react'
import { motion } from 'framer-motion'

type UnsubscribeType = 'permanent' | 'pause_90' | 'spike_only'
type PageState = 'select' | 'submitting' | 'confirmed' | 'error'

const OPTIONS: { value: UnsubscribeType; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: 'permanent',
    label: 'Remove me permanently',
    description: "I'm not interested. Please don't contact me again.",
    icon: <XCircle className="w-5 h-5 text-zinc-400" />,
  },
  {
    value: 'pause_90',
    label: 'Pause for 90 days',
    description: "I'm busy right now. Reach back in three months.",
    icon: <Clock className="w-5 h-5 text-zinc-400" />,
  },
  {
    value: 'spike_only',
    label: 'Important updates only',
    description: 'Only reach out when market conditions or contract timing make it worth my attention.',
    icon: <Zap className="w-5 h-5 text-zinc-400" />,
  },
]

function ConfirmedView({ type, email }: { type: UnsubscribeType; email: string }) {
  const messages: Record<UnsubscribeType, { headline: string; sub: string }> = {
    permanent: {
      headline: 'You\'ve been removed.',
      sub: `${email} will not receive further outreach from Nodal Point.`,
    },
    pause_90: {
      headline: 'Emails paused for 90 days.',
      sub: `We'll stand down until ${new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`,
    },
    spike_only: {
      headline: 'Preference saved.',
      sub: 'We\'ll only reach out when there\'s a genuine cost-saving opportunity for your portfolio.',
    },
  }

  const { headline, sub } = messages[type]

  return (
    <div className="flex flex-col items-center text-center gap-6">
      <div className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
        <CheckCircle className="w-7 h-7 text-[#002FA7]" />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">{headline}</h2>
        <p className="text-sm text-zinc-400 max-w-xs">{sub}</p>
      </div>
      {type !== 'permanent' && (
        <a
          href="https://www.linkedin.com/company/nodal-point"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm hover:border-zinc-700 hover:text-zinc-100 transition-colors"
        >
          <Linkedin className="w-4 h-4" />
          Follow Nodal Point on LinkedIn
        </a>
      )}
    </div>
  )
}

function UnsubscribeContent() {
  const searchParams = useSearchParams()
  const email = searchParams?.get('email') || ''
  const [selected, setSelected] = useState<UnsubscribeType>('permanent')
  const [state, setState] = useState<PageState>('select')
  const [confirmedType, setConfirmedType] = useState<UnsubscribeType | null>(null)

  const handleSubmit = async () => {
    if (!email) {
      setState('error')
      return
    }
    setState('submitting')
    try {
      const res = await fetch('/api/email/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, type: selected }),
      })
      if (!res.ok) throw new Error('Request failed')
      setConfirmedType(selected)
      setState('confirmed')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-16">
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
        className="mb-10 flex flex-col items-center gap-3"
      >
        <Image
          src="/images/nodalpoint-webicon.png"
          alt="Nodal Point"
          width={40}
          height={40}
          className="w-10 h-10"
        />
        <span className="text-zinc-500 text-xs tracking-[0.15em] uppercase font-mono">Nodal Point</span>
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.8, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
        className="w-full max-w-md bg-zinc-900/60 border border-zinc-800 rounded-2xl p-8 backdrop-blur-sm"
      >
        {state === 'confirmed' && confirmedType ? (
          <ConfirmedView type={confirmedType} email={email} />
        ) : state === 'error' ? (
          <div className="flex flex-col items-center text-center gap-4">
            <p className="text-zinc-300 text-sm">Something went wrong. Please try again or reply directly to the email.</p>
            <button
              onClick={() => setState('select')}
              className="text-xs text-zinc-500 hover:text-zinc-300 underline transition-colors"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="mb-7">
              <h1 className="text-xl font-semibold text-zinc-100 tracking-tight mb-1.5">
                Manage your preferences
              </h1>
              {email && (
                <p className="text-sm text-zinc-500 font-mono truncate">{email}</p>
              )}
            </div>

            <div className="flex flex-col gap-2.5 mb-7">
              {OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelected(opt.value)}
                  className={[
                    'w-full text-left rounded-xl border px-4 py-3.5 transition-all duration-150',
                    selected === opt.value
                      ? 'border-[#002FA7] bg-[#002FA7]/10'
                      : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700',
                  ].join(' ')}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">{opt.icon}</div>
                    <div className="flex flex-col gap-0.5">
                      <span className={[
                        'text-sm font-medium leading-snug',
                        selected === opt.value ? 'text-zinc-100' : 'text-zinc-300',
                      ].join(' ')}>
                        {opt.label}
                      </span>
                      <span className="text-xs text-zinc-500 leading-relaxed">{opt.description}</span>
                    </div>
                    <div className="ml-auto shrink-0 mt-0.5">
                      <div className={[
                        'w-4 h-4 rounded-full border-2 transition-all',
                        selected === opt.value
                          ? 'border-[#002FA7] bg-[#002FA7]'
                          : 'border-zinc-700',
                      ].join(' ')} />
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={handleSubmit}
              disabled={state === 'submitting'}
              className="w-full py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-100 text-sm font-medium transition-colors"
            >
              {state === 'submitting' ? 'Processing...' : 'Confirm'}
            </button>
          </>
        )}
        <a
          href="https://nodalpoint.io"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 w-full inline-flex items-center justify-center py-2.5 rounded-lg border border-zinc-700 text-zinc-300 text-sm hover:text-zinc-100 hover:border-zinc-500 transition-colors"
        >
          Visit nodalpoint.io
        </a>
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        className="mt-8 text-xs text-zinc-700 text-center max-w-xs"
      >
        Nodal Point · Commercial Energy · Fort Worth, TX<br />
        Your preference will be applied within minutes.
      </motion.p>
    </div>
  )
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
      </div>
    }>
      <UnsubscribeContent />
    </Suspense>
  )
}
