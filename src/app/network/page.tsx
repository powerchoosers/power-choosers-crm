import { KPIGrid } from "@/components/dashboard/KPIGrid";
import { VelocityTrackerV3 } from "@/components/dashboard/ActivityChart";
import { SignalMatrix } from "@/components/dashboard/SignalMatrix";
import { ForensicLogStream } from "@/components/dashboard/ForensicLogStream";
import { TaskManagement } from "@/components/dashboard/TaskManagement";

export default function Home() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header: Forensic Command Deck */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white font-mono">
            FORENSIC_COMMAND_DECK
          </h1>
          <p className="text-[11px] font-mono text-zinc-500 uppercase tracking-widest mt-1">
            Situation → Context → Action
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
            System_Operational
          </span>
        </div>
      </div>

      {/* Zone 1: Telemetry header (physics-based metrics) */}
      <KPIGrid />

      {/* Zone 2 + 3: Dial Quota Engine | Active Signal Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 min-h-[380px]">
          <VelocityTrackerV3 />
        </div>
        <div className="h-[420px] min-h-[420px]">
          <SignalMatrix />
        </div>
      </div>

      {/* Zone 4: Forensic log stream (terminal-style AI actions) */}
      <ForensicLogStream />

      {/* Tactical: Task management */}
      <div className="h-[450px]">
        <TaskManagement />
      </div>
    </div>
  );
}
