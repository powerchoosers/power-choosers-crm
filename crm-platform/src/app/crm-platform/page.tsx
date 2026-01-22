import { KPIGrid } from "@/components/dashboard/KPIGrid";
import { ActivityChart } from "@/components/dashboard/ActivityChart";

export default function Home() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Dashboard</h1>
          <p className="text-zinc-400 mt-1">Overview of system performance and activity.</p>
        </div>
        <div className="flex items-center gap-2">
           <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
           <span className="text-sm text-zinc-400">System Operational</span>
        </div>
      </div>

      <KPIGrid />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
           <ActivityChart />
        </div>
        <div className="rounded-3xl border border-white/10 bg-zinc-900/50 backdrop-blur-xl p-6 h-[400px]">
           <div className="mb-6">
              <h3 className="text-lg font-medium text-white">Recent Alerts</h3>
              <p className="text-sm text-zinc-400">System notifications and warnings</p>
           </div>
           <div className="space-y-2 overflow-y-auto max-h-[280px] pr-2 scrollbar-thin scrollbar-thumb-zinc-800">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-4 items-start p-3 rounded-xl hover:bg-white/5 transition-colors cursor-default group">
                   <div className="w-2 h-2 mt-2 rounded-full bg-signal group-hover:shadow-[0_0_8px_rgba(0,47,167,0.8)] transition-shadow" />
                   <div>
                      <p className="text-sm text-zinc-200">High call volume detected in North Region.</p>
                      <p className="text-xs text-zinc-500 mt-1">2 minutes ago</p>
                   </div>
                </div>
              ))}
           </div>
        </div>
      </div>
    </div>
  );
}
