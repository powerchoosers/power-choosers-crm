'use client'

import React, { useState, useEffect } from 'react'
import { Landmark, ArrowUpRight, Plus, Trash2, Sparkles } from 'lucide-react'
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
  isEditing?: boolean
  onUpdate?: (meters: Meter[]) => void
}

export const MeterArray: React.FC<MeterArrayProps> = ({ meters = [], isEditing = false, onUpdate }) => {
  const [localMeters, setLocalMeters] = useState<Meter[]>(meters)

  useEffect(() => {
    setLocalMeters(meters)
  }, [meters])

  const handleAddMeter = () => {
    const newMeter: Meter = {
      id: `temp_${Date.now()}`,
      esiId: '',
      address: '',
      rate: '',
      endDate: ''
    }
    const updated = [...localMeters, newMeter]
    setLocalMeters(updated)
    onUpdate?.(updated)
  }

  const handleRemoveMeter = (id: string) => {
    const updated = localMeters.filter(m => m.id !== id)
    setLocalMeters(updated)
    onUpdate?.(updated)
  }

  const handleUpdateMeter = (id: string, field: keyof Meter, value: string) => {
    const updated = localMeters.map(m =>
      m.id === id ? { ...m, [field]: value } : m
    )
    setLocalMeters(updated)
    onUpdate?.(updated)
  }
  return (
    <div className={cn(
      "nodal-module-glass nodal-monolith-edge rounded-2xl transition-all duration-500 overflow-hidden flex flex-col",
      isEditing ? 'border-[#002FA7]/30 ring-1 ring-[#002FA7]/20' : ''
    )}>
      <div className="flex justify-between items-center p-4 border-b border-white/5 nodal-recessed">
        <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
          Grid_Connection_Points <span className="text-zinc-700">[{localMeters.length}]</span>
        </h3>
        {isEditing && (
          <button
            onClick={handleAddMeter}
            className="text-[10px] text-[#002FA7] hover:text-white font-mono flex items-center gap-1 uppercase tracking-widest transition-colors animate-in fade-in slide-in-from-right-2 duration-300"
          >
            <Plus className="w-3 h-3" /> Add Meter
          </button>
        )}
      </div>

      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {localMeters.length > 0 ? (
            localMeters.map((meter, index) => (
              <div
                key={meter.id || `meter-${index}`}
                className={cn(
                  "group relative bg-zinc-950/40 p-4 rounded-xl border transition-all duration-300",
                  isEditing
                    ? "border-white/10 hover:border-[#002FA7]/50"
                    : "border-white/5 hover:border-[#002FA7]/30"
                )}
              >
                {isEditing ? (
                  // EDIT MODE
                  <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-[#002FA7]/10 border border-[#002FA7]/20">
                          <Landmark className="w-3.5 h-3.5 text-[#002FA7]" />
                        </div>
                        <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">ESI ID</span>
                      </div>
                      <button
                        onClick={() => handleRemoveMeter(meter.id)}
                        className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors"
                        title="Remove Meter"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <input
                      type="text"
                      value={meter.esiId}
                      onChange={(e) => handleUpdateMeter(meter.id, 'esiId', e.target.value)}
                      className="w-full bg-zinc-950/50 border border-white/5 rounded-lg px-3 py-2 text-xs font-mono text-zinc-300 focus:outline-none focus:border-[#002FA7]/50 focus:ring-1 focus:ring-[#002FA7]/30 transition-all"
                      placeholder="10000000000000000000"
                    />

                    <div>
                      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider block mb-1.5">Service Address</span>
                      <input
                        type="text"
                        value={meter.address}
                        onChange={(e) => handleUpdateMeter(meter.id, 'address', e.target.value)}
                        className="w-full bg-zinc-950/50 border border-white/5 rounded-lg px-3 py-2 text-[10px] text-zinc-400 focus:outline-none focus:border-[#002FA7]/50 focus:ring-1 focus:ring-[#002FA7]/30 transition-all"
                        placeholder="123 Main St, Dallas, TX 75201"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider block mb-1.5">Rate (¢/kWh)</span>
                        <input
                          type="text"
                          value={meter.rate}
                          onChange={(e) => handleUpdateMeter(meter.id, 'rate', e.target.value)}
                          className="w-full bg-zinc-950/50 border border-white/5 rounded-lg px-3 py-2 text-sm font-mono text-white tabular-nums focus:outline-none focus:border-[#002FA7]/50 focus:ring-1 focus:ring-[#002FA7]/30 transition-all"
                          placeholder="0.045"
                        />
                      </div>
                      <div>
                        <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider block mb-1.5">End Date</span>
                        <input
                          type="text"
                          value={meter.endDate}
                          onChange={(e) => handleUpdateMeter(meter.id, 'endDate', e.target.value)}
                          className="w-full bg-zinc-950/50 border border-white/5 rounded-lg px-3 py-2 text-[9px] font-mono text-emerald-500 uppercase focus:outline-none focus:border-[#002FA7]/50 focus:ring-1 focus:ring-[#002FA7]/30 transition-all"
                          placeholder="03/25"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  // VIEW MODE
                  <>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-[#002FA7]/10 border border-[#002FA7]/20">
                          <Landmark className="w-3.5 h-3.5 text-[#002FA7]" />
                        </div>
                        <div className="font-mono text-xs text-zinc-300 tracking-tight">{meter.esiId || 'No ESI ID'}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold font-mono text-white tabular-nums tracking-tighter">
                          {meter.rate ? `${meter.rate}¢` : '--'}
                        </div>
                        <div className="text-[9px] font-mono text-emerald-500 uppercase tracking-tighter">
                          {meter.endDate ? `Exp: ${meter.endDate}` : 'No Date'}
                        </div>
                      </div>
                    </div>

                    <div className="text-[10px] text-zinc-500 font-medium truncate mb-2">
                      {meter.address || 'No address provided'}
                    </div>

                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowUpRight className="w-3 h-3 text-zinc-600" />
                    </div>
                  </>
                )}
              </div>
            ))
          ) : (
            <div className="col-span-2 p-8 rounded-xl border border-dashed border-white/5 bg-zinc-950/20 flex flex-col items-center justify-center gap-2">
              <Landmark className="w-6 h-6 text-zinc-700" />
              <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest text-center">
                No grid connection points identified.<br />
                {isEditing ? 'Click "Add Meter" to begin tracking.' : 'Initialize meter array to begin asset tracking.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
