import {
  BookOpen,
  Check,
  Clock,
  ExternalLink,
  MoreHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react';

import type { ActivityItem } from '../types';

export function ActivityCard({ activity }: { activity: ActivityItem }) {
  const typeConfig = {
    session: {
      icon: BookOpen,
      color: 'bg-purple-100 text-purple-600',
      borderColor: 'border-l-purple-400',
    },
    milestone: {
      icon: Trophy,
      color: 'bg-amber-100 text-amber-600',
      borderColor: 'border-l-amber-400',
    },
    export: {
      icon: ExternalLink,
      color: 'bg-emerald-100 text-emerald-600',
      borderColor: 'border-l-emerald-400',
    },
    streak: {
      icon: Zap,
      color: 'bg-rose-100 text-rose-600',
      borderColor: 'border-l-rose-400',
    },
    progress: {
      icon: TrendingUp,
      color: 'bg-cyan-100 text-cyan-600',
      borderColor: 'border-l-cyan-400',
    },
    recommendation: {
      icon: Sparkles,
      color: 'bg-violet-100 text-violet-600',
      borderColor: 'border-l-violet-400',
    },
  };

  const config = typeConfig[activity.type];
  const Icon = config.icon;

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border border-l-4 border-white/60 ${config.borderColor} bg-white/60 p-5 shadow-sm backdrop-blur-sm transition hover:shadow-lg`}
    >
      <div className="flex gap-4">
        {/* Icon */}
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${config.color}`}
        >
          <Icon className="h-5 w-5" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-start justify-between gap-2">
            <div>
              <span className="text-xs font-medium text-slate-400">
                {activity.planTitle}
              </span>
              <h4 className="font-semibold text-slate-900">{activity.title}</h4>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex-shrink-0 text-xs text-slate-400">
                {activity.timestamp}
              </span>
              <button className="rounded-lg p-1 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-500">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>

          {activity.description && (
            <p className="mb-3 text-sm text-slate-600">
              {activity.description}
            </p>
          )}

          {/* Metadata */}
          {activity.metadata && (
            <div className="flex flex-wrap items-center gap-3">
              {activity.metadata.duration && (
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock className="h-3 w-3" />
                  {activity.metadata.duration}
                </span>
              )}
              {activity.metadata.progress !== undefined && (
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Target className="h-3 w-3" />
                  {activity.metadata.progress}% complete
                </span>
              )}
              {activity.metadata.platform && (
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Check className="h-3 w-3" />
                  {activity.metadata.platform}
                </span>
              )}
              {activity.metadata.streakCount && (
                <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  <Zap className="h-3 w-3" />
                  {activity.metadata.streakCount} days
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
