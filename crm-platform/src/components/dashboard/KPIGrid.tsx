import { ArrowUpRight, ArrowDownRight, Activity, Users, PhoneCall, Zap } from 'lucide-react'

const stats = [
  {
    title: 'Total Revenue',
    value: '$45,231.89',
    change: '+20.1%',
    trend: 'up',
    icon: Activity,
  },
  {
    title: 'Active Calls',
    value: '24',
    change: '+180.1%',
    trend: 'up',
    icon: PhoneCall,
  },
  {
    title: 'New Clients',
    value: '573',
    change: '+19%',
    trend: 'up',
    icon: Users,
  },
  {
    title: 'Energy Saved',
    value: '2.4 GWh',
    change: '-4%',
    trend: 'down',
    icon: Zap,
  },
]

export function KPIGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.title}
          className="nodal-glass p-6 nodal-glass-hover group rounded-2xl"
        >
          <div className="flex items-center justify-between space-y-0 pb-2">
            <span className="text-sm font-medium text-zinc-400 group-hover:text-zinc-300 transition-colors">{stat.title}</span>
            <stat.icon className="h-4 w-4 text-zinc-500 group-hover:text-signal transition-colors" />
          </div>
          <div className="flex items-center justify-between pt-4">
             <div className="text-3xl font-semibold text-white tracking-tighter font-mono tabular-nums">{stat.value}</div>
             <div className={`text-xs flex items-center font-mono tabular-nums ${stat.trend === 'up' ? 'text-green-500' : 'text-red-500'}`}>
                {stat.trend === 'up' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                <span className="ml-1">{stat.change}</span>
             </div>
          </div>
        </div>
      ))}
    </div>
  )
}
