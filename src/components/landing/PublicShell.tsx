import type { ReactNode } from 'react'
import { LandingHeader } from '@/components/landing/LandingHeader'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { displayFontClass } from '@/components/landing/fonts'

/**
 * Wrapper for every public page: loads the headline font, sets base text styles, and adds
 * the shared header and footer. Put the page's sections inside it.
 *
 * `tone` is what the header should look like on first paint: "dark" when the page opens
 * with a dark section (PageHero does), "light" otherwise.
 */
export function PublicShell({
  children,
  tone = 'dark',
  footer = true,
}: {
  children: ReactNode
  tone?: 'light' | 'dark'
  footer?: boolean
}) {
  return (
    <div className={`${displayFontClass} min-h-screen overflow-x-clip bg-white font-sans text-zinc-600 antialiased selection:bg-[#002FA7] selection:text-white`}>
      <LandingHeader tone={tone} />
      <main>{children}</main>
      {footer ? <LandingFooter /> : null}
    </div>
  )
}
