'use client'

import { Newspaper, ExternalLink } from 'lucide-react'

export default function NewsFeedWidget() {
  const news = [
    { title: "CenterPoint Rate Hike Approved", source: "ERCOT Intel", time: "2h ago" },
    { title: "Grid Weather Watch Issued", source: "NOAA Energy", time: "5h ago" },
    { title: "Solar Output Hits New High", source: "Market Pulse", time: "1d ago" }
  ]

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {news.map((item) => (
          <div 
            key={item.title}
            className="group p-3 rounded-xl bg-zinc-900/40 border border-white/5 hover:border-white/10 transition-all cursor-pointer"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <h4 className="text-[11px] font-medium text-zinc-300 group-hover:text-white leading-tight">
                {item.title}
              </h4>
              <ExternalLink size={10} className="text-zinc-600 group-hover:text-zinc-400 shrink-0" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono text-zinc-600 uppercase">{item.source}</span>
              <span className="text-[9px] font-mono text-zinc-700">{item.time}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
