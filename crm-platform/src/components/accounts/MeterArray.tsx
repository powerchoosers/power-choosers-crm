'use client'

import React from 'react'
import { Landmark, ArrowUpRight, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Meter {
  id: string
  esiId: string
  address: string
  rate: string
  endDate: string
}

interface MeterArrayProps {
  meters?: Meter[]
  onAddMeter?: () => void
}

export const MeterArray: React.FC<MeterArrayProps> = ({ meters = [], onAddMeter }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-[0.2em]">Grid Connection Points (ESI-IDs)</h3>
        <button 
          onClick={onAddMeter}
          className="text-[10px] text-[#002FA7] hover:text-[#002FA7]/80 font-mono flex items-center gap-1 uppercase tracking-widest transition-colors"
        >
          <Plus className="w-3 h-3" /> Add Meter
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {meters.length > 0 ? (
          meters.map((meter) => (
            <div 
              key={meter.id} 
              className="group relative nodal-glass p-4 rounded-xl border border-white/5 hover:border-[#002FA7]/30 transition-all duration-300"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-[#002FA7]/10 border border-[#002FA7]/20">
                    <Landmark className="w-3.5 h-3.5 text-[#002FA7]" />
                  </div>
                  <div className="font-mono text-xs text-zinc-300 tracking-tight">{meter.esiId}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold font-mono text-white tabular-nums tracking-tighter">
                    {meter.rate}¢
                  </div>
                  <div className="text-[9px] font-mono text-emerald-500 uppercase tracking-tighter">
                    Exp: {meter.endDate}
                  </div>
                </div>
              </div>
              
              <div className="text-[10px] text-zinc-500 font-medium truncate mb-2">
                {meter.address}
              </div>

              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowUpRight className="w-3 h-3 text-zinc-600" />
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-2 p-8 rounded-xl border border-dashed border-white/5 bg-white/[0.02] flex flex-col items-center justify-center gap-2">
            <Landmark className="w-6 h-6 text-zinc-700" />
            <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest text-center">
              No grid connection points identified.<br/>
              Initialize meter array to begin asset tracking.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
