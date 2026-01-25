'use client'

import { ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Area, AreaChart } from "recharts"

const data = [
  { time: "09:00", calls: 40 },
  { time: "10:00", calls: 30 },
  { time: "11:00", calls: 45 },
  { time: "12:00", calls: 25 },
  { time: "13:00", calls: 55 },
  { time: "14:00", calls: 60 },
  { time: "15:00", calls: 40 },
  { time: "16:00", calls: 35 },
  { time: "17:00", calls: 20 },
]

export function ActivityChart() {
  return (
    <div className="nodal-glass p-6 h-[400px] rounded-2xl">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-white">Call Activity</h3>
        <p className="text-sm text-zinc-400">Live call volume tracking</p>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#002FA7" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#002FA7" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis 
            dataKey="time" 
            stroke="#52525b" 
            fontSize={12} 
            tickLine={false} 
            axisLine={false} 
          />
          <YAxis 
            stroke="#52525b" 
            fontSize={12} 
            tickLine={false} 
            axisLine={false}
            tickFormatter={(value) => `${value}`} 
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', color: '#fff' }}
            itemStyle={{ color: '#fff' }}
          />
          <Area 
            type="monotone" 
            dataKey="calls" 
            stroke="#002FA7" 
            strokeWidth={3}
            fillOpacity={1} 
            fill="url(#colorCalls)" 
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
