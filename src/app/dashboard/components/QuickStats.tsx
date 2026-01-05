'use client';

import { Clock, Target, Trophy, TrendingUp } from 'lucide-react';

export function QuickStats() {
  return (
    <div className="grid grid-cols-4 gap-4">
      {[
        {
          icon: Clock,
          label: 'Today',
          value: '2h 15m',
          trend: '+30 min',
          color: 'text-purple-500',
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
      ].map((stat) => (
        <div
          key={stat.label}
          className="rounded-2xl border border-white/60 bg-white/60 p-4 shadow-sm backdrop-blur-sm transition hover:shadow-md"
        >
          <div className="mb-2 flex items-center gap-2">
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
            <span className="text-xs font-medium text-slate-400 uppercase">
              {stat.label}
            </span>
          </div>
          <div className="text-xl font-bold text-slate-900">{stat.value}</div>
          <div className="text-xs text-slate-400">{stat.trend}</div>
        </div>
      ))}
    </div>
  );
}
