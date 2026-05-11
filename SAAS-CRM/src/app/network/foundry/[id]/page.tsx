'use client'

import { useParams } from 'next/navigation'
import { Suspense } from 'react'
import FoundryBuilder from '@/components/foundry/FoundryBuilder'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

function FoundryBuilderContent() {
  const params = useParams()
  const id = (params?.id as string) || ''

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* HEADER - Standardized */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-4">
          <Link href="/network/foundry">
            <Button variant="ghost" size="sm" className="icon-button-forensic w-9 h-9 flex items-center justify-center rounded-xl border border-white/5 bg-transparent text-zinc-400 hover:text-white hover:bg-white/5 transition-all">
              <ChevronLeft size={20} />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tighter text-zinc-100">Foundry_Forge</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#002FA7] animate-pulse shadow-[0_0_8px_rgba(0,47,167,0.5)]" />
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                Template_Assembly // Asset_ID: {id === 'new' ? 'INITIALIZING' : id.slice(0, 8)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-zinc-600 font-mono tracking-[0.2em]">
            V1.4-FOUNDRY // STATUS_READY
          </span>
        </div>
      </div>

      <div className="flex-1 nodal-void-card overflow-hidden flex flex-col relative">
        <FoundryBuilder assetId={id === 'new' ? undefined : id} />
      </div>
    </div>
  )
}

export default function FoundryBuilderPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-pulse">
        <div className="h-10 bg-zinc-900/50 rounded-lg w-48" />
        <div className="flex-1 bg-zinc-900/30 rounded-xl border border-white/5" />
      </div>
    }>
      <FoundryBuilderContent />
    </Suspense>
  )
}
