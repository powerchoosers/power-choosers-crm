import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

/**
 * Shared building blocks for the public site. Use these instead of restyling buttons and
 * links page by page, so every page moves and reads the same way.
 */

export const focusOnLight =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#002FA7]'
export const focusOnDark =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'

const buttonBase =
  'group inline-flex items-center justify-center gap-2 rounded-[10px] px-6 py-3.5 text-base font-medium transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50'

/** Class strings, for when the element is a <button> or needs custom contents. */
export const buttonPrimary = `${buttonBase} bg-[#002FA7] text-white hover:bg-[#0a3fd1] hover:shadow-[0_10px_30px_-10px_rgba(0,47,167,0.8)]`
export const buttonOutlineOnDark = `${buttonBase} border border-white/25 text-white hover:border-white/60 hover:bg-white/5`
export const buttonOutlineOnLight = `${buttonBase} border border-zinc-300 bg-white text-zinc-950 hover:border-zinc-950`

/** Small arrow that nudges right when its `group` parent is hovered. */
export function NudgeArrow() {
  return (
    <ArrowRight
      aria-hidden
      className="h-4 w-4 transition-transform duration-200 ease-out group-hover:translate-x-1"
    />
  )
}

type Surface = 'light' | 'dark'

/** The one main action on a page or section. */
export function PrimaryLink({
  href,
  children,
  surface = 'light',
  className = '',
}: {
  href: string
  children: ReactNode
  surface?: Surface
  className?: string
}) {
  return (
    <Link href={href} className={`${buttonPrimary} ${surface === 'dark' ? focusOnDark : focusOnLight} ${className}`}>
      {children}
      <NudgeArrow />
    </Link>
  )
}

/** The quieter second action that sits next to a PrimaryLink. */
export function OutlineLink({
  href,
  children,
  surface = 'light',
  className = '',
}: {
  href: string
  children: ReactNode
  surface?: Surface
  className?: string
}) {
  const style = surface === 'dark' ? `${buttonOutlineOnDark} ${focusOnDark}` : `${buttonOutlineOnLight} ${focusOnLight}`
  return (
    <Link href={href} className={`${style} ${className}`}>
      {children}
    </Link>
  )
}

/** Inline text link in Nodal blue with an underline that draws in on hover. */
export function TextLink({
  href,
  children,
  className = '',
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  return (
    <Link
      href={href}
      className={`group inline-flex items-center gap-1.5 rounded-sm text-base font-medium text-[#002FA7] ${focusOnLight} ${className}`}
    >
      <span className="np-link">{children}</span>
      <NudgeArrow />
    </Link>
  )
}
