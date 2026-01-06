'use client';

import {
  BookOpen,
  Calendar,
  Clock,
  ExternalLink,
  Share2,
  TrendingUp,
} from 'lucide-react';
import { useMemo } from 'react';

import { formatMinutes, formatSkillLevel } from '@/lib/formatters';

import type { ClientPlanDetail } from '@/lib/types/client';
import type { ProgressStatus } from '@/lib/types/db';

interface PlanOverviewProps {
  plan: ClientPlanDetail;
  statuses: Record<string, ProgressStatus>;
}

// Gradient presets based on skill level for visual variety
const SKILL_GRADIENTS: Record<string, string> = {
  beginner: 'from-emerald-600 via-teal-500 to-cyan-500',
  intermediate: 'from-purple-600 via-pink-500 to-rose-500',
  advanced: 'from-amber-600 via-orange-500 to-red-500',
};

/**
 * Magazine-style hero overview card for a learning plan.
 * Displays plan title, progress stats, and quick actions in an editorial layout.
 */
export function PlanOverviewHeader({ plan, statuses }: PlanOverviewProps) {
  // Memoize modules to maintain stable reference
  const modules = useMemo(() => plan.modules ?? [], [plan.modules]);

  // Calculate progress metrics
  const {
    completedTasks,
    totalTasks,
    completion,
    totalMinutes,
    estimatedWeeks,
  } = useMemo(() => {
    const tasks = modules.flatMap((m) => m.tasks ?? []);
    const total = tasks.length;
    const completed = Object.values(statuses).filter(
      (s) => s === 'completed'
    ).length;
    const minutes = tasks.reduce(
      (sum, t) => sum + (t.estimatedMinutes ?? 0),
      0
    );
    const weeks = plan.weeklyHours
      ? Math.ceil(minutes / (plan.weeklyHours * 60))
      : null;

    return {
      completedTasks: completed,
      totalTasks: total,
      completion: total > 0 ? Math.round((completed / total) * 100) : 0,
      totalMinutes: minutes,
      estimatedWeeks: weeks,
    };
  }, [modules, statuses, plan.weeklyHours]);

  // Calculate completed modules
  const completedModules = useMemo(() => {
    return modules.filter((mod) => {
      const moduleTasks = mod.tasks ?? [];
      if (moduleTasks.length === 0) return false;
      return moduleTasks.every((task) => statuses[task.id] === 'completed');
    }).length;
  }, [modules, statuses]);

  const gradient =
    SKILL_GRADIENTS[plan.skillLevel] ?? SKILL_GRADIENTS.intermediate;

  // Format estimated completion date
  const estimatedCompletionDate = useMemo(() => {
    if (!estimatedWeeks) return null;
    const date = new Date();
    date.setDate(date.getDate() + estimatedWeeks * 7);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }, [estimatedWeeks]);

  // Generate tags from plan metadata
  const tags = useMemo(() => {
    const result: string[] = [];
    result.push(formatSkillLevel(plan.skillLevel));
    if (plan.weeklyHours) {
      result.push(`${plan.weeklyHours}h/week`);
    }
    if (modules.length > 0) {
      result.push(`${modules.length} modules`);
    }
    return result;
  }, [plan.skillLevel, plan.weeklyHours, modules.length]);

  return (
    <article className="lg:col-span-2">
      {/* Cover Image Area */}
      <div
        className={`relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br ${gradient} p-8 shadow-2xl shadow-purple-500/20`}
      >
        {/* Decorative elements */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtOS45NDEgMC0xOCA4LjA1OS0xOCAxOHM4LjA1OSAxOCAxOCAxOGMzLjA5IDAgNi0uNzc4IDguNTQzLTIuMTQ3QzUzLjA1MSA0Ny41OCA1OCA0MC40MTYgNTggMzJjMC04LjI4NC02LjcxNi0xNS0xNS0xNS0xLjU5MyAwLTMuMTI4LjI0OC00LjU3My43MDlDMzcuMjkgMTguMjQ5IDM2LjY1MiAxOCAzNiAxOHoiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIiBzdHJva2Utd2lkdGg9IjEiLz48L2c+PC9zdmc+')] opacity-30" />

        <div className="relative z-10 flex min-h-[280px] flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-full bg-white/20 p-2 text-white backdrop-blur-sm transition hover:bg-white/30"
                aria-label="Share plan"
              >
                <Share2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="rounded-full bg-white/20 p-2 text-white backdrop-blur-sm transition hover:bg-white/30"
                aria-label="Open in new tab"
              >
                <ExternalLink className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium tracking-wider text-white/70 uppercase">
              Learning Plan
            </p>
            <h2 className="mb-1 text-4xl font-bold text-white md:text-5xl">
              {plan.topic}
            </h2>
            <p className="text-xl text-white/80">
              {formatSkillLevel(plan.skillLevel)} •{' '}
              {formatMinutes(totalMinutes)} total
            </p>
          </div>
        </div>

        {/* Progress bar overlay */}
        <div className="absolute right-0 bottom-0 left-0 h-1 bg-black/20">
          <div
            className="h-full bg-white transition-all duration-500"
            style={{ width: `${completion}%` }}
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<BookOpen className="h-5 w-5" />}
          label="Modules"
          value={`${completedModules}/${modules.length}`}
          sublabel="Completed"
        />
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          label="Progress"
          value={`${completion}%`}
          sublabel={`${completedTasks}/${totalTasks} tasks`}
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Total Effort"
          value={formatMinutes(totalMinutes)}
          sublabel={plan.weeklyHours ? `${plan.weeklyHours}h/week` : '—'}
        />
        <StatCard
          icon={<Calendar className="h-5 w-5" />}
          label="Est. Finish"
          value={estimatedCompletionDate ?? '—'}
          sublabel={
            estimatedWeeks
              ? `${estimatedWeeks} week${estimatedWeeks === 1 ? '' : 's'}`
              : 'Not calculated'
          }
        />
      </div>
    </article>
  );
}

function StatCard({
  icon,
  label,
  value,
  sublabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel: string;
}) {
  return (
    <div className="rounded-2xl border border-stone-100 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-3 flex items-center gap-2 text-stone-400 dark:text-stone-500">
        {icon}
        <span className="text-xs font-medium uppercase">{label}</span>
      </div>
      <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">
        {value}
      </div>
      <div className="text-xs text-stone-400 dark:text-stone-500">
        {sublabel}
      </div>
    </div>
  );
}
