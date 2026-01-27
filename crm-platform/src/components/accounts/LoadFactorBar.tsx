'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface LoadFactorBarProps {
  value?: number // 0 to 1
  className?: string
}

export const LoadFactorBar: React.FC<LoadFactorBarProps> = ({ value = 0, className }) => {
  const isGood = value >= 0.6
  const isBad = value < 0.4
  const isModerate = !isGood && !isBad

  const colorClass = isGood 
    ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' 
    : isBad 
      ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' 
      : 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]'

  const label = isGood ? 'High Efficiency' : isBad ? 'Demand Ratchet Risk' : 'Moderate Load'

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex justify-between items-end">
        <h4 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Load Factor</h4>
        <span className={cn(
          "text-xs font-mono font-bold tabular-nums",
          isGood ? "text-emerald-500" : isBad ? "text-red-500" : "text-yellow-500"
        )}>
          {Math.round(value * 100)}%
        </span>
      </div>
      
      <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden relative border border-white/5">
        <div
          className={cn("h-full transition-all duration-1000 ease-out", colorClass)}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>

      <div className="flex justify-between items-center">
        <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-tighter">{label}</span>
        {value === 0 && (
          <button className="text-[9px] font-mono text-[#002FA7] hover:underline uppercase">
            Calculate from Bill
          </button>
        )}
      </div>
    </div>
  )
}
