'use client'

import { Bell, Calendar, CheckSquare, Clock, Zap } from 'lucide-react'

export function RightPanel() {
  return (
    <aside className="fixed right-0 top-0 bottom-0 z-30 w-80 bg-zinc-950/50 backdrop-blur-xl border-l border-white/5 pt-24 pb-8 px-6 flex flex-col gap-8 overflow-y-auto hidden lg:flex">
      
      {/* Upcoming Tasks Widget */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Upcoming Tasks</h3>
          <button className="text-xs text-signal hover:text-blue-400 transition-colors">View All</button>
        </div>
        <div className="space-y-3">
          {[
            { title: 'Contract Renewal', client: 'ABC Corp', time: '2:00 PM', urgent: true },
            { title: 'Follow-up Call', client: 'XYZ Energy', time: '4:30 PM', urgent: false },
            { title: 'Rate Analysis', client: 'Metro District', time: 'Tomorrow', urgent: false },
          ].map((task, i) => (
            <div key={i} className="group p-3 rounded-2xl bg-zinc-900/50 border border-white/5 hover:bg-zinc-800/50 hover:border-white/10 transition-all cursor-pointer">
              <div className="flex items-start gap-3">
                <div className={`mt-1 w-2 h-2 rounded-full ${task.urgent ? 'bg-red-500 animate-pulse' : 'bg-zinc-600'}`} />
                <div>
                  <div className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors">{task.title}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{task.client}</div>
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-zinc-400">
                    <Clock size={12} />
                    <span>{task.time}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity Widget */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Activity</h3>
        </div>
        <div className="relative border-l border-zinc-800 ml-3 space-y-6 pb-2">
          {[
            { action: 'Call completed', target: 'John Doe', time: '10m ago' },
            { action: 'Email sent', target: 'Sarah Smith', time: '1h ago' },
            { action: 'Contract signed', target: 'Tech Industries', time: '2h ago' },
            { action: 'New lead', target: 'Global Logistics', time: '4h ago' },
          ].map((activity, i) => (
            <div key={i} className="relative pl-6">
              <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-zinc-900 border border-zinc-700" />
              <div className="text-sm text-zinc-300">{activity.action}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{activity.target}</div>
              <div className="text-[10px] text-zinc-600 mt-1">{activity.time}</div>
            </div>
          ))}
        </div>
      </div>

      {/* System Status Widget */}
      <div className="mt-auto p-4 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 border border-white/5">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-lg bg-green-500/10 text-green-500">
            <Zap size={16} />
          </div>
          <div>
            <div className="text-xs font-medium text-zinc-400">System Status</div>
            <div className="text-sm font-bold text-white">All Systems Go</div>
          </div>
        </div>
        <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
          <div className="bg-green-500 h-full w-full" />
        </div>
      </div>

    </aside>
  )
}
