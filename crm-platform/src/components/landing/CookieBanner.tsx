'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const CONSENT_KEY = 'np_cookie_consent'

export function CookieBanner() {
  const [visible, setVisible] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    try {
      const consent = localStorage.getItem(CONSENT_KEY)
      if (!consent) setVisible(true)
    } catch {
      // localStorage unavailable
    }
  }, [])

  if (pathname?.startsWith('/briefings/')) return null
  if (!visible) return null

  const dismiss = () => {
    try { localStorage.setItem(CONSENT_KEY, 'accepted') } catch {}
    setVisible(false)
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[200] p-4 md:p-6 pointer-events-none">
      <div className="max-w-5xl mx-auto pointer-events-auto bg-white border border-zinc-200 rounded-2xl shadow-2xl px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-8">
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[9px] text-[#002FA7] uppercase tracking-[0.25em] mb-1">COOKIE NOTICE</p>
          <p className="text-sm text-zinc-600 leading-relaxed">
            We use cookies to analyze site traffic and improve our platform. No data is shared for advertising. Read our{' '}
            <Link href="/privacy" className="text-[#002FA7] underline underline-offset-2 hover:text-blue-800 transition-colors">
              Privacy Policy
            </Link>.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={dismiss}
            className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors font-medium px-4 py-2 rounded-full hover:bg-zinc-100"
          >
            Decline
          </button>
          <button
            onClick={dismiss}
            className="bg-[#002FA7] text-white text-sm font-medium px-5 py-2.5 rounded-full hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-blue-900/20"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
