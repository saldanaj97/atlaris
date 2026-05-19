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

import { GradientProgressHeroFrame } from '@/app/(app)/plans/[id]/components/GradientProgressHeroFrame';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MetricCard } from '@/components/ui/metric-card';
import { formatMinutes } from '@/features/plans/formatters';
import type {
  ModuleDetailModule,
  ModuleDetailNavItem,
} from '@/features/plans/read-projection/types';
import { deriveModuleCompletionSummary } from '@/features/plans/task-progress/client';
import { cn } from '@/lib/utils';
import type { ProgressStatus } from '@/shared/types/db.types';

interface ModuleHeaderProps {
  module: ModuleDetailModule;
  planId: string;
  planTopic: string;
  totalModules: number;
  previousModuleId: string | null;
  nextModuleId: string | null;
  statuses: Record<string, ProgressStatus>;
  previousModulesComplete: boolean;
  allModules: ModuleDetailNavItem[];
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

function ModuleRoundNavLink({
  planId,
  targetModuleId,
  direction,
}: {
  planId: string;
  targetModuleId: string | null;
  direction: 'previous' | 'next';
}) {
  const Icon = direction === 'previous' ? ArrowLeft : ArrowRight;
  const ariaLabel =
    direction === 'previous' ? 'Previous module' : 'Next module';
  if (!targetModuleId) {
    return (
      <span className="cursor-not-allowed rounded-full bg-white/10 p-2 text-white/40">
        <Icon className="h-4 w-4" />
      </span>
    );
  }
  return (
    <Link
      href={`/plans/${planId}/modules/${targetModuleId}`}
      className="rounded-full bg-white/25 p-2 text-white transition hover:bg-white/35"
      aria-label={ariaLabel}
    >
      <Icon className="h-4 w-4" />
    </Link>
  );
}

function ModuleSwitcherMenuItem({
  planId,
  moduleId,
  item,
}: {
  planId: string;
  moduleId: string;
  item: ModuleDetailNavItem;
}) {
  const isCurrent = item.id === moduleId;

  if (item.isLocked) {
    return (
      <DropdownMenuItem asChild disabled className="opacity-50">
        <Link
          href="#"
          className="pointer-events-none flex items-center gap-2 text-stone-400 dark:text-stone-500"
          onClick={(e) => e.preventDefault()}
          aria-disabled
        >
          <Lock className="size-4 shrink-0 text-stone-400 dark:text-stone-500" />
          <span className="truncate">{item.title}</span>
        </Link>
      </DropdownMenuItem>
    );
  }

  const linkClassName = cn(
    'flex items-center gap-2',
    isCurrent && 'bg-primary/20 text-primary',
  );

  return (
    <DropdownMenuItem asChild>
      <Link
        href={`/plans/${planId}/modules/${item.id}`}
        className={linkClassName}
      >
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">
          {item.order}
        </span>
        <span className="truncate">{item.title}</span>
        {isCurrent && (
          <CheckCircle2 className="ml-auto size-4 shrink-0 text-primary" />
        )}
      </Link>
    </DropdownMenuItem>
  );
}

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
              <span className="max-w-56 truncate sm:max-w-88">{planTopic}</span>
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
                {allModules.map((m) => (
                  <ModuleSwitcherMenuItem
                    key={m.id}
                    planId={planId}
                    moduleId={module.id}
                    item={m}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        </ol>
      </nav>

      {/* Hero Card with Glassmorphism */}
      <GradientProgressHeroFrame
        className="shadow-primary/20"
        contentClassName="min-h-62"
        gradientClassName={gradient}
        completion={completion}
      >
        {/* Top Row: Module Badge and Navigation */}
        <div className="flex items-start justify-between">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-white/25 px-3 py-1 text-xs font-medium text-white">
              Module {module.order} of {totalModules}
            </span>
          </div>

          {/* Module Navigation */}
          <div className="flex gap-2">
            <ModuleRoundNavLink
              planId={planId}
              targetModuleId={previousModuleId}
              direction="previous"
            />
            <ModuleRoundNavLink
              planId={planId}
              targetModuleId={nextModuleId}
              direction="next"
            />
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
      </GradientProgressHeroFrame>

      {/* Stats grid */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <MetricCard
          icon={<ListTodo />}
          label="Lessons"
          value={`${completedTasks}/${totalTasks}`}
          sublabel="Completed"
        />
        <MetricCard
          icon={<Clock />}
          label="Duration"
          value={formatMinutes(totalMinutes)}
          sublabel={formatMinutes(module.estimatedMinutes)}
        />
        <MetricCard
          icon={<BookOpen />}
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
