import { Newsreader } from 'next/font/google'

/**
 * Headline face for the public site. Body text stays on Inter (set in the root layout).
 * Put `displayFontClass` on a page wrapper, then use the `np-display` class on headlines.
 */
const newsreader = Newsreader({
  subsets: ['latin'],
  axes: ['opsz'],
  variable: '--font-newsreader',
  display: 'swap',
})

export const displayFontClass = newsreader.variable
