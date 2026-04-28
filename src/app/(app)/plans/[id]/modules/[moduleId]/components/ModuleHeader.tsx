import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ListTodo,
  Lock,
} from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MetricCard } from '@/components/ui/metric-card';
import { formatMinutes } from '@/features/plans/formatters';
import { deriveModuleCompletionSummary } from '@/features/plans/task-progress/client';
import type {
  ModuleNavItem,
  ModuleWithTasks,
} from '@/lib/db/queries/types/modules.types';
import type { ProgressStatus } from '@/shared/types/db.types';

interface ModuleHeaderProps {
  module: ModuleWithTasks;
  planId: string;
  planTopic: string;
  totalModules: number;
  previousModuleId: string | null;
  nextModuleId: string | null;
  statuses: Record<string, ProgressStatus>;
  previousModulesComplete: boolean;
  allModules: ModuleNavItem[];
}

// Gradient presets based on module order for visual variety
/** Brand-only gradients (primary / accent / primary-dark) for visual variety */
const MODULE_GRADIENTS = [
  'from-primary via-accent to-primary-dark',
  'from-primary-dark via-primary to-accent',
  'from-accent via-primary to-primary-dark',
  'from-primary via-primary-dark to-accent',
  'from-chart-2 via-primary to-accent',
];

/**
 * Glassmorphism hero header for the module detail page.
 * Displays module title, progress stats, and navigation between modules.
 */
export function ModuleHeader({
  module,
  planId,
  planTopic,
  totalModules,
  previousModuleId,
  nextModuleId,
  statuses,
  previousModulesComplete,
  allModules,
}: ModuleHeaderProps): JSX.Element {
  const {
    totalTasks,
    completedTasks,
    totalMinutes,
    completionPercent: completion,
  } = deriveModuleCompletionSummary(module, statuses);

  const gradient =
    MODULE_GRADIENTS[(module.order - 1) % MODULE_GRADIENTS.length];

  return (
    <article className="mb-8">
      {/* Breadcrumb Navigation */}
      <nav className="mb-6">
        <ol className="flex items-center gap-1 text-sm">
          <li>
            <Link
              href={`/plans/${planId}`}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-primary dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-primary"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="max-w-[180px] truncate sm:max-w-[280px]">
                {planTopic}
              </span>
            </Link>
          </li>
          <li className="text-stone-300 dark:text-stone-600">
            <ChevronRight className="h-4 w-4" />
          </li>
          <li>
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 font-medium text-primary transition-colors hover:bg-primary/20 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none dark:bg-primary/20 dark:text-primary dark:hover:bg-primary/30 dark:focus:ring-offset-stone-900">
                Module {module.order}
                <ChevronDown className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-80 w-64 overflow-y-auto"
              >
                {allModules.map((m) => {
                  const isCurrent = m.id === module.id;
                  const isLocked = m.isLocked;

                  return (
                    <DropdownMenuItem
                      key={m.id}
                      asChild
                      disabled={isLocked}
                      className={isLocked ? 'opacity-50' : ''}
                    >
                      <Link
                        href={
                          isLocked ? '#' : `/plans/${planId}/modules/${m.id}`
                        }
                        className={`flex items-center gap-2 ${
                          isCurrent ? 'bg-primary/20 text-primary' : ''
                        } ${isLocked ? 'pointer-events-none text-stone-400 dark:text-stone-500' : ''}`}
                        onClick={
                          isLocked ? (e) => e.preventDefault() : undefined
                        }
                        aria-disabled={isLocked}
                      >
                        {isLocked ? (
                          <Lock className="h-4 w-4 flex-shrink-0 text-stone-400 dark:text-stone-500" />
                        ) : (
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">
                            {m.order}
                          </span>
                        )}
                        <span className="truncate">{m.title}</span>
                        {isCurrent && !isLocked && (
                          <CheckCircle2 className="ml-auto h-4 w-4 flex-shrink-0 text-primary" />
                        )}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        </ol>
      </nav>

      {/* Hero Card with Glassmorphism */}
      <div
        className={`relative overflow-hidden rounded-3xl bg-linear-to-br ${gradient} p-8 shadow-2xl shadow-primary/20`}
      >
        {/* Decorative glassmorphism overlay */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtOS45NDEgMC0xOCA4LjA1OS0xOCAxOHM4LjA1OSAxOCAxOCAxOGMzLjA5IDAgNi0uNzc4IDguNTQzLTIuMTQ3QzUzLjA1MSA0Ny41OCA1OCA0MC40MTYgNTggMzJjMC04LjI4NC02LjcxNi0xNS0xNS0xNS0xLjU5MyAwLTMuMTI4LjI0OC00LjU3My43MDlDMzcuMjkgMTguMjQ5IDM2LjY1MiAxOCAzNiAxOHoiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIiBzdHJva2Utd2lkdGg9IjEiLz48L2c+PC9zdmc+')] opacity-30" />

        <div className="relative z-10 flex min-h-[200px] flex-col justify-between">
          {/* Top Row: Module Badge and Navigation */}
          <div className="flex items-start justify-between">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-white/25 px-3 py-1 text-xs font-medium text-white">
                Module {module.order} of {totalModules}
              </span>
            </div>

            {/* Module Navigation */}
            <div className="flex gap-2">
              {previousModuleId ? (
                <Link
                  href={`/plans/${planId}/modules/${previousModuleId}`}
                  className="rounded-full bg-white/25 p-2 text-white transition hover:bg-white/35"
                  aria-label="Previous module"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              ) : (
                <span className="cursor-not-allowed rounded-full bg-white/10 p-2 text-white/40">
                  <ArrowLeft className="h-4 w-4" />
                </span>
              )}
              {nextModuleId ? (
                <Link
                  href={`/plans/${planId}/modules/${nextModuleId}`}
                  className="rounded-full bg-white/25 p-2 text-white transition hover:bg-white/35"
                  aria-label="Next module"
                >
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <span className="cursor-not-allowed rounded-full bg-white/10 p-2 text-white/40">
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </div>
          </div>

          {/* Module Title and Description */}
          <div>
            <h1 className="mb-2 flex items-center gap-2 text-3xl font-bold text-white md:text-4xl">
              {module.title}
              {!previousModulesComplete && (
                <Lock className="h-6 w-6 text-white/50 md:h-7 md:w-7" />
              )}
              {completion === 100 && (
                <CheckCircle2 className="h-6 w-6 text-white drop-shadow-md md:h-7 md:w-7" />
              )}
            </h1>
            {module.description && (
              <p className="max-w-2xl text-lg text-white/80">
                {module.description}
              </p>
            )}
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

      {/* Stats grid */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <MetricCard
          icon={<ListTodo className="h-5 w-5" />}
          label="Lessons"
          value={`${completedTasks}/${totalTasks}`}
          sublabel="Completed"
        />
        <MetricCard
          icon={<Clock className="h-5 w-5" />}
          label="Duration"
          value={formatMinutes(totalMinutes)}
          sublabel={formatMinutes(module.estimatedMinutes)}
        />
        <MetricCard
          icon={<BookOpen className="h-5 w-5" />}
          label="Progress"
          value={`${completion}%`}
          sublabel={
            completion === 100
              ? 'Module complete!'
              : `${totalTasks - completedTasks} remaining`
          }
        />
      </div>
    </article>
  );
}
