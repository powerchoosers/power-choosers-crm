'use client';

import React from 'react';
import { CheckCircle2, Circle, Clock, AlertCircle, Plus } from 'lucide-react';

interface Task {
  id: string;
  title: string;
  status: 'pending' | 'completed' | 'overdue';
  priority: 'high' | 'medium' | 'low';
  dueDate: string;
}

const tasks: Task[] = [
  {
    id: '1',
    title: 'Audit Acme Manufacturing Bill History',
    status: 'overdue',
    priority: 'high',
    dueDate: '2026-01-27'
  },
  {
    id: '2',
    title: 'Follow up with Downtown Office Complex',
    status: 'pending',
    priority: 'medium',
    dueDate: '2026-01-30'
  },
  {
    id: '3',
    title: 'Review 4CP Curtailment Strategy',
    status: 'pending',
    priority: 'high',
    dueDate: '2026-02-01'
  },
  {
    id: '4',
    title: 'Update Market Volatility Protocol',
    status: 'completed',
    priority: 'low',
    dueDate: '2026-01-25'
  }
];

export function TaskManagement() {
  const metrics = {
    overdue: tasks.filter(t => t.status === 'overdue').length,
    pending: tasks.filter(t => t.status === 'pending').length,
    total: tasks.length
  };

  return (
    <div className="nodal-glass p-6 rounded-2xl flex flex-col h-full border border-white/5 relative overflow-hidden group">
      {/* Top light source catch */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-white tracking-tight">Task Management</h3>
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-mono">Operational Directives</p>
        </div>
        <button className="h-8 w-8 rounded-full bg-zinc-900/50 border border-white/5 flex items-center justify-center hover:bg-[#002FA7]/20 hover:border-[#002FA7]/50 transition-all text-zinc-400 hover:text-white">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
          <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-1">Overdue</p>
          <p className="text-xl font-mono tabular-nums text-rose-500 font-bold">{metrics.overdue}</p>
        </div>
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
          <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-1">Pending</p>
          <p className="text-xl font-mono tabular-nums text-amber-500 font-bold">{metrics.pending}</p>
        </div>
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
          <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-1">Total</p>
          <p className="text-xl font-mono tabular-nums text-zinc-300 font-bold">{metrics.total}</p>
        </div>
      </div>

      <div className="space-y-2 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-800 np-scroll flex-1">
        {tasks.map((task) => (
          <div 
            key={task.id} 
            className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.03] hover:bg-white/[0.05] hover:border-white/10 transition-all cursor-pointer group/item"
          >
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                {task.status === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : task.status === 'overdue' ? (
                  <AlertCircle className="w-4 h-4 text-rose-500" />
                ) : (
                  <Circle className="w-4 h-4 text-zinc-600 group-hover/item:text-zinc-400 transition-colors" />
                )}
              </div>
              <div>
                <p className={`text-sm font-medium transition-colors ${
                  task.status === 'completed' ? 'text-zinc-500 line-through' : 'text-zinc-200 group-hover/item:text-white'
                }`}>
                  {task.title}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-sm font-mono uppercase tracking-tighter border ${
                    task.priority === 'high' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                    task.priority === 'medium' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                    'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                  }`}>
                    {task.priority}_PRIORITY
                  </span>
                  <div className="flex items-center gap-1 text-[10px] text-zinc-600 font-mono tabular-nums">
                    <Clock className="w-3 h-3" />
                    {task.dueDate}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-4 h-4 rounded-full bg-zinc-800 border border-zinc-950 flex items-center justify-center text-[8px] font-bold text-zinc-500">
                {String.fromCharCode(64 + i)}
              </div>
            ))}
          </div>
          Active_Agents
        </div>
        <div className="flex items-center gap-1 hover:text-white cursor-pointer transition-colors">
          Manage_Vault
        </div>
      </div>
    </div>
  );
}
