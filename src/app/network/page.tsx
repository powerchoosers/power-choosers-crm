import { KPIGrid } from "@/components/dashboard/KPIGrid";
import { ActivityChart } from "@/components/dashboard/ActivityChart";
import { SuggestedLeads } from "@/components/dashboard/SuggestedLeads";
import { RecentAlerts } from "@/components/dashboard/RecentAlerts";
import { TaskManagement } from "@/components/dashboard/TaskManagement";

export default function Home() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tighter text-white">Dashboard</h1>
          <p className="text-zinc-400 mt-1">Overview of system performance and activity.</p>
        </div>
        <div className="flex items-center gap-2">
           <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
           <span className="text-sm text-zinc-400">System Operational</span>
        </div>
      </div>

      <KPIGrid />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
           <ActivityChart />
        </div>
        <div className="h-[450px]">
           <SuggestedLeads />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 h-[450px]">
           <RecentAlerts />
        </div>
        <div className="lg:col-span-2 h-[450px]">
           <TaskManagement />
        </div>
      </div>
    </div>
  );
}
