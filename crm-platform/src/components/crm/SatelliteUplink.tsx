'use client'
import { useState } from 'react';
import { MapPin, Satellite, Wifi, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SatelliteUplink({ address }: { address: string }) {
  const [isActive, setIsActive] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const establishUplink = async () => {
    if (isLoading) return
    if (apiKey) {
      setIsActive(true)
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch('/api/maps/config')
      const data: unknown = await res.json()
      const nextKey =
        data && typeof data === 'object' && typeof (data as Record<string, unknown>).apiKey === 'string'
          ? ((data as Record<string, unknown>).apiKey as string)
          : null
      if (nextKey) {
        setApiKey(nextKey)
        setIsActive(true)
      }
    } catch (err) {
      console.error('Failed to load Maps API key:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden relative group">
      
      {/* UPLINK HEADER */}
      <div className="flex items-center justify-between p-3 bg-zinc-900/40 border-b border-white/5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center border transition-all duration-500 bg-zinc-800/30 border-white/5 text-zinc-600">
            <Satellite className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">Asset_Status</div>
            <div className="text-[9px] font-mono text-zinc-600 uppercase mt-0.5">
              {isActive ? 'Signal_Acquired' : 'Idle_Standby'}
            </div>
          </div>
        </div>
      </div>

      {/* BODY: The Toggle */}
      <div className={cn(
        "h-48 relative w-full bg-zinc-900/40 flex flex-col items-center justify-center transition-all duration-500",
        (!isActive || !apiKey) && !isLoading ? "opacity-70" : "opacity-100"
      )}>
        
        {isLoading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 text-[#002FA7] animate-spin" />
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Negotiating Uplink...</span>
          </div>
        ) : !isActive || !apiKey ? (
          <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-30 flex flex-col items-center justify-center">
            {/* The "Locked" State */}
            <div className="z-10 text-center px-6">
              <div className="mb-3 mx-auto w-10 h-10 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-500 group-hover:text-white group-hover:border-[#002FA7] transition-all">
                <Satellite className="w-4 h-4" />
              </div>
              <button 
                onClick={establishUplink}
                className="icon-button-forensic h-8 pl-4 pr-6 text-[10px] font-mono !text-[#4D88FF] border border-[#4D88FF]/50 bg-[#4D88FF]/20 rounded-lg hover:!bg-[#4D88FF] hover:!text-white transition-all uppercase tracking-widest flex items-center justify-center gap-2.5 hover:shadow-[0_0_30px_-5px_rgba(77,136,255,0.6)] mx-auto"
                title="Establish Uplink"
              >
                <Wifi className="w-3.5 h-3.5" /> Establish Uplink
              </button>
            </div>
          </div>
        ) : (
          /* The "Unlocked" State - Google Maps Iframe */
          <iframe 
            width="100%" 
            height="100%" 
            style={{ border: 0 }} 
            loading="lazy" 
            allowFullScreen 
            src={`https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${encodeURIComponent(address)}&maptype=satellite`}>
          </iframe>
        )}
      </div>
    </div>
  );
}
