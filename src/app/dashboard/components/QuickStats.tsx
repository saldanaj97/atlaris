import type { LucideIcon } from 'lucide-react';
import { Clock, Target, TrendingUp, Trophy } from 'lucide-react';

interface StatItem {
  icon: LucideIcon;
  label: string;
  value: string;
  trend: string;
  color: string;
}

const QUICK_STATS: StatItem[] = [
  {
    icon: Clock,
    label: 'Today',
    value: '2h 15m',
    trend: '+30 min',
    color: 'text-primary',
  },
  {
    icon: Target,
    label: 'Weekly Goal',
    value: '68%',
    trend: '8.5/12h',
    color: 'text-emerald-500',
  },
  {
    icon: Trophy,
    label: 'Streak',
    value: '7 days',
    trend: 'Best: 14',
    color: 'text-amber-500',
  },
  {
    icon: TrendingUp,
    label: 'This Week',
    value: '+12%',
    trend: 'vs last week',
    color: 'text-cyan-500',
  },
];

export function QuickStats() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {QUICK_STATS.map((stat) => (
        <div
          key={stat.label}
          className="dark:bg-card-background rounded-2xl border border-white/40 bg-black/5 p-4 shadow-lg backdrop-blur-xl transition hover:shadow-xl dark:border-white/10"
        >
          <div className="mb-2 flex items-center gap-2">
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
            <span className="text-xs font-medium text-slate-400 uppercase">
              {stat.label}
            </span>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white">
            {stat.value}
          </div>
          <div className="text-xs text-slate-400">{stat.trend}</div>
        </div>
      ))}
    </div>
  );
}
