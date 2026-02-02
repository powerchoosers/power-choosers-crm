import InfrastructureMap from '@/components/infrastructure/InfrastructureMap';

export default function InfrastructurePage() {
  return (
    <div className="h-[calc(100vh-4rem)] w-full bg-zinc-950 flex flex-col animate-in fade-in duration-700">
      {/* HEADER - Minimalist */}
      <div className="h-16 border-b border-white/5 flex items-center px-6 bg-zinc-950 z-10">
        <h1 className="text-sm font-mono text-zinc-100 uppercase tracking-widest flex items-center gap-3">
          <span className="w-2 h-2 bg-[#002FA7] rounded-full animate-pulse shadow-[0_0_10px_#002FA7]" />
          Infrastructure // Asset_Map
        </h1>
        <div className="ml-auto flex items-center gap-4">
           <span className="text-[10px] text-zinc-600 font-mono tracking-[0.2em]">
             ERCOT_NODAL_V1.4
           </span>
        </div>
      </div>

      {/* THE MAP CONTAINER */}
      <div className="flex-1 relative overflow-hidden bg-zinc-900/20">
        <InfrastructureMap />
      </div>
    </div>
  );
}
