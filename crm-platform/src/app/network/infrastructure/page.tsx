import InfrastructureMap from '@/components/infrastructure/InfrastructureMap';

export default function InfrastructurePage() {
  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* HEADER - Standardized */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tighter text-zinc-100">Infrastructure_Map</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                ERCOT_NODAL_GRID // UPLINK_ACTIVE
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
           <span className="text-[10px] text-zinc-600 font-mono tracking-[0.2em]">
             V1.4 // SYSTEM_STABLE
           </span>
        </div>
      </div>

      {/* THE MAP CONTAINER - Standardized Glass Wrapper */}
      <div className="flex-1 rounded-2xl border border-white/10 bg-zinc-900/30 backdrop-blur-xl overflow-hidden flex flex-col relative">
        <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none bg-gradient-to-b from-white/5 to-transparent z-10" />
        
        <div className="flex-1 relative overflow-hidden">
          <InfrastructureMap />
        </div>
        
        {/* Sync_Block Footer */}
        <div className="flex-none border-t border-white/5 bg-zinc-900/90 p-4 flex items-center justify-between backdrop-blur-sm z-20">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                  <span>Sync_Block 01–01</span>
                  <div className="h-1 w-1 rounded-full bg-zinc-800" />
                  <span className="text-zinc-500">Total_Nodes: <span className="text-zinc-400 tabular-nums">01</span></span>
                </div>
            </div>
            <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
              Location: Texas_Interconnect
            </div>
        </div>
      </div>
    </div>
  );
}
