'use client';

import React from 'react';
import { Sparkles, TrendingUp, Building2, Factory } from 'lucide-react';

interface Lead {
  id: string;
  name: string;
  type: string;
  usage: string;
  score: number;
  category: 'Industrial' | 'Commercial' | 'Residential';
}

const leads: Lead[] = [
  {
    id: '1',
    name: 'Acme Manufacturing',
    type: 'Industrial',
    usage: '500kW avg',
    score: 92,
    category: 'Industrial'
  },
  {
    id: '2',
    name: 'Downtown Office Complex',
    type: 'Commercial',
    usage: '300kW avg',
    score: 87,
    category: 'Commercial'
  },
  {
    id: '3',
    name: 'Northside Data Center',
    type: 'Industrial',
    usage: '1.2MW avg',
    score: 95,
    category: 'Industrial'
  }
];

export function SuggestedLeads() {
  return (
    <div className="nodal-glass p-6 rounded-2xl flex flex-col h-full border border-white/5 relative overflow-hidden group">
      {/* Top light source catch */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-medium text-white tracking-tight">Suggested Leads</h3>
            <Sparkles className="w-4 h-4 text-[#002FA7] animate-pulse" />
          </div>
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-mono">Forensic Node Analysis</p>
        </div>
        <div className="h-8 w-8 rounded-full bg-zinc-900/50 border border-white/5 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-zinc-400" />
        </div>
      </div>

      <div className="space-y-3 flex-1 overflow-y-auto pr-2 np-scroll">
        {leads.map((lead) => (
          <div 
            key={lead.id} 
            className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.03] hover:bg-white/[0.05] hover:border-white/10 transition-all cursor-pointer group/item"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-zinc-900/80 flex items-center justify-center border border-white/5 text-zinc-400 group-hover/item:text-white group-hover/item:border-white/10 transition-all shadow-inner">
                {lead.category === 'Industrial' ? <Factory className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-200 group-hover/item:text-white transition-colors">{lead.name}</p>
                <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-tight mt-0.5">
                  {lead.type} • <span className="text-zinc-400 tabular-nums">{lead.usage}</span>
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-mono font-bold text-[#002FA7] tabular-nums">
                {lead.score}%
              </div>
              <div className="text-[9px] text-zinc-600 font-mono uppercase tracking-tighter">
                Match_Rate
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#002FA7] shadow-[0_0_8px_rgba(0,47,167,0.6)]" />
          Protocol_V2.1
        </div>
        <div className="flex items-center gap-1 hover:text-white cursor-pointer transition-colors">
          View_All [3]
        </div>
      </div>
    </div>
  );
}
