'use client'

import { useEffect } from 'react'

export const panelTheme = {
  shell: 'h-full flex flex-col bg-zinc-950 border-white/5 text-white relative overflow-hidden shadow-2xl',
  header: 'h-14 border-b border-white/5 flex items-center justify-between px-6 bg-zinc-950/80 backdrop-blur-xl shrink-0',
  headerTitleWrap: 'flex items-center gap-2',
  closeButton: 'text-zinc-500 hover:text-zinc-300 text-[10px] font-mono tracking-wider transition-colors',
  body: 'flex-1 overflow-y-auto px-6 pt-6 pb-8 custom-scrollbar',
  field:
    'w-full h-9 bg-zinc-950/90 border border-white/10 rounded-xl px-3 text-sm font-mono text-white placeholder:text-zinc-700 focus:border-[#002FA7] focus:ring-1 focus:ring-[#002FA7]/50 outline-none transition-all',
  selectTrigger:
    'w-full h-9 bg-zinc-950/90 border border-white/10 rounded-xl px-3 text-sm font-mono text-zinc-300 focus:border-[#002FA7] focus:ring-1 focus:ring-[#002FA7]/50',
  textarea:
    'w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm font-mono text-white placeholder:text-zinc-700 focus:border-[#002FA7] focus:ring-1 focus:ring-[#002FA7]/50 outline-none transition-all resize-none',
  cta:
    'w-full h-10 rounded-xl bg-[#002FA7] text-white hover:bg-[#002FA7]/90 font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed',
} as const

export function useEscClose(onClose: () => void, disabled = false) {
  useEffect(() => {
    if (disabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, disabled])
}
