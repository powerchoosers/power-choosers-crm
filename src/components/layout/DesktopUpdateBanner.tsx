'use client'

import { useEffect, useState } from 'react'
import { Download, RotateCw, X } from 'lucide-react'
import type { DesktopUpdateState } from '@/types/desktop'

const DISMISSED_VERSION_KEY = 'nodal-desktop-update-dismissed-version'

export function DesktopUpdateBanner() {
  const [isDesktop, setIsDesktop] = useState(false)
  const [updateState, setUpdateState] = useState<DesktopUpdateState | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.nodalDesktop?.isDesktop) {
      return
    }

    setIsDesktop(true)

    const isDismissed = (version?: string | null) => {
      if (!version) return false
      return window.sessionStorage.getItem(DISMISSED_VERSION_KEY) === version
    }

    const syncInitialState = async () => {
      try {
        const currentState = await window.nodalDesktop!.getUpdateState()
        if (currentState.phase === 'downloaded' && !isDismissed(currentState.version)) {
          setUpdateState(currentState)
        }
      } catch {
        // If the bridge is unavailable or the update check fails, stay quiet.
      }
    }

    void syncInitialState()

    const unsubscribe = window.nodalDesktop.onUpdateEvent((nextState) => {
      if (nextState.phase === 'downloaded') {
        if (isDismissed(nextState.version)) {
          return
        }

        setInstalling(false)
        setUpdateState(nextState)
        return
      }

      if (nextState.phase === 'error') {
        setInstalling(false)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  if (!isDesktop || !updateState || updateState.phase !== 'downloaded') {
    return null
  }

  const versionLabel = updateState.releaseName || updateState.version || 'latest build'

  const dismiss = () => {
    if (typeof window !== 'undefined' && updateState.version) {
      window.sessionStorage.setItem(DISMISSED_VERSION_KEY, updateState.version)
    }

    setInstalling(false)
    setUpdateState(null)
  }

  const installNow = async () => {
    if (!window.nodalDesktop) {
      return
    }

    setInstalling(true)

    try {
      await window.nodalDesktop.installUpdate()
    } catch {
      setInstalling(false)
    }
  }

  return (
    <div className="fixed left-1/2 top-4 z-[1200] w-[min(92vw,48rem)] -translate-x-1/2">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl">
        <div className="flex items-start gap-4 px-4 py-3 sm:px-5">
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border border-[#002FA7]/40 bg-[#002FA7]/15 text-[#8ba6ff]">
            <Download className="size-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">Desktop Update</div>
              <div className="h-px flex-1 bg-white/5" />
              <div className="font-mono text-[10px] text-zinc-600">{versionLabel}</div>
            </div>

            <div className="mt-1 text-sm text-zinc-200">A newer desktop build is ready to install.</div>
            <div className="mt-1 text-xs text-zinc-500">Restart now to load the latest version.</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={installNow}
              disabled={installing}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#002FA7]/40 bg-[#002FA7]/15 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#c7d6ff] transition-colors hover:bg-[#002FA7]/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {installing ? <RotateCw className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              {installing ? 'Installing' : 'Install'}
            </button>

            <button
              type="button"
              onClick={dismiss}
              className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-200"
              aria-label="Dismiss desktop update"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
