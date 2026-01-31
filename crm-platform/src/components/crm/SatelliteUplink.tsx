'use client'
import { useState } from 'react';
import { MapPin, Satellite, Wifi, Loader2 } from 'lucide-react';

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
      
      {/* HEADER: Always Visible */}
      <div className="p-4 border-b border-white/5 flex justify-between items-start bg-zinc-900/50">
        <div>
          <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 flex items-center gap-2">
            <MapPin className="w-3 h-3 text-[#002FA7]" /> Asset Location
          </h3>
          <p className="text-sm text-zinc-300 font-medium truncate max-w-[200px]">{address || 'No Address Provided'}</p>
        </div>
        {isActive && !isLoading && (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-[10px] font-mono text-green-500">LIVE</span>
          </div>
        )}
      </div>

      {/* BODY: The Toggle */}
      <div className="h-48 relative w-full bg-zinc-950 flex flex-col items-center justify-center">
        
        {isLoading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 text-[#002FA7] animate-spin" />
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Negotiating Uplink...</span>
          </div>
        ) : !isActive || !apiKey ? (
          <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-10 flex flex-col items-center justify-center">
            {/* The "Locked" State */}
            <div className="z-10 text-center">
              <div className="mb-3 mx-auto w-12 h-12 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-500 group-hover:text-white group-hover:border-[#002FA7] transition-all">
                <Satellite className="w-5 h-5" />
              </div>
              <button 
                onClick={establishUplink}
                className="icon-button-forensic text-xs font-mono !text-[#002FA7] border border-[#002FA7]/30 bg-[#002FA7]/5 px-4 py-2 rounded-xl hover:!bg-[#002FA7] hover:!text-white transition-all uppercase tracking-wider flex items-center gap-2 hover:shadow-[0_0_30px_-5px_rgba(0,47,167,0.6)]"
                title="Establish Uplink"
              >
                <Wifi className="w-3 h-3" /> Establish Uplink
              </button>
              <p className="text-[10px] text-zinc-600 mt-2">Consumes 1 API Credit</p>
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
