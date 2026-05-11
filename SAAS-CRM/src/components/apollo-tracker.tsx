'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

const APOLLO_APP_ID = '691c89270f724f000d121b65'
const TRACKER_ID = 'apollo-website-tracker'
const CRM_PATH_PREFIXES = ['/network']
const shouldTrackPath = (pathname: string) => {
  return !CRM_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

export default function ApolloTracker() {
  const pathname = usePathname()

  useEffect(() => {
    // Skip injecting on CRM paths so only the public site is tracked.
    if (!pathname || !shouldTrackPath(pathname)) return

    if (document.getElementById(TRACKER_ID)) return

    const script = document.createElement('script')
    script.id = TRACKER_ID
    script.src = `https://assets.apollo.io/micro/website-tracker/tracker.iife.js?nocache=${Math.random()
      .toString(36)
      .substring(7)}`
    script.async = true
    script.defer = true
    script.onload = () => {
      window.trackingFunctions?.onLoad?.({ appId: APOLLO_APP_ID })
    }

    document.head.appendChild(script)
  }, [pathname])

  return null
}

declare global {
  interface Window {
    trackingFunctions?: {
      onLoad: (options: { appId: string }) => void
    }
  }
}
