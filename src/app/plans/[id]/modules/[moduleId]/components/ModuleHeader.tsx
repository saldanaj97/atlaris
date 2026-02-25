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
import type {
  ModuleNavItem,
  ModuleWithTasks,
} from '@/lib/db/queries/types/modules.types';
import { formatMinutes } from '@/lib/formatters';
import type { ProgressStatus } from '@/lib/types/db';

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
const MODULE_GRADIENTS = [
  'from-primary via-accent to-primary',
  'from-emerald-600 via-teal-500 to-cyan-500',
  'from-amber-600 via-orange-500 to-red-500',
  'from-pink-600 via-rose-500 to-red-500',
  'from-blue-600 via-cyan-500 to-teal-500',
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
  const tasks = module.tasks ?? [];

  // Calculate progress metrics
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(
    (task) => statuses[task.id] === 'completed'
  ).length;
  const totalMinutes = tasks.reduce(
    (sum, task) => sum + (task.estimatedMinutes ?? 0),
    0
  );
  const completion =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

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
              className="hover:text-primary dark:hover:text-primary inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium text-stone-600 transition-colors hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
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
              <DropdownMenuTrigger className="bg-primary/10 text-primary hover:bg-primary/20 focus:ring-ring dark:bg-primary/20 dark:text-primary dark:hover:bg-primary/30 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none dark:focus:ring-offset-stone-900">
                Module {module.order}
                <ChevronDown className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-80 w-64 overflow-y-auto border-white/40 bg-white/80 backdrop-blur-xl dark:border-stone-700/50 dark:bg-stone-900/80"
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
                          <span className="bg-primary/20 text-primary flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium">
                            {m.order}
                          </span>
                        )}
                        <span className="truncate">{m.title}</span>
                        {isCurrent && !isLocked && (
                          <CheckCircle2 className="text-primary ml-auto h-4 w-4 flex-shrink-0" />
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
        className={`relative overflow-hidden rounded-3xl bg-linear-to-br ${gradient} shadow-primary/20 p-8 shadow-2xl`}
      >
        {/* Decorative glassmorphism overlay */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtOS45NDEgMC0xOCA4LjA1OS0xOCAxOHM4LjA1OSAxOCAxOCAxOGMzLjA5IDAgNi0uNzc4IDguNTQzLTIuMTQ3QzUzLjA1MSA0Ny41OCA1OCA0MC40MTYgNTggMzJjMC04LjI4NC02LjcxNi0xNS0xNS0xNS0xLjU5MyAwLTMuMTI4LjI0OC00LjU3My43MDlDMzcuMjkgMTguMjQ5IDM2LjY1MiAxOCAzNiAxOHoiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIiBzdHJva2Utd2lkdGg9IjEiLz48L2c+PC9zdmc+')] opacity-30" />

        <div className="relative z-10 flex min-h-[200px] flex-col justify-between">
          {/* Top Row: Module Badge and Navigation */}
          <div className="flex items-start justify-between">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                Module {module.order} of {totalModules}
              </span>
            </div>

            {/* Module Navigation */}
            <div className="flex gap-2">
              {previousModuleId ? (
                <Link
                  href={`/plans/${planId}/modules/${previousModuleId}`}
                  className="rounded-full bg-white/20 p-2 text-white backdrop-blur-sm transition hover:bg-white/30"
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
                  className="rounded-full bg-white/20 p-2 text-white backdrop-blur-sm transition hover:bg-white/30"
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
                <CheckCircle2 className="h-6 w-6 text-green-300 md:h-7 md:w-7" />
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

      {/* Stats Grid with Glassmorphism */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={<ListTodo className="h-5 w-5" />}
          label="Lessons"
          value={`${completedTasks}/${totalTasks}`}
          sublabel="Completed"
        />
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          label="Duration"
          value={formatMinutes(totalMinutes)}
          sublabel={formatMinutes(module.estimatedMinutes)}
        />
        <StatCard
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
    <div className="rounded-2xl border border-white/40 bg-white/30 p-4 shadow-lg backdrop-blur-xl transition hover:shadow-xl dark:border-stone-800/50 dark:bg-stone-900/30">
      <div className="mb-3 flex items-center gap-2 text-stone-500 dark:text-stone-400">
        {icon}
        <span className="text-xs font-medium uppercase">{label}</span>
      </div>
      <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">
        {value}
      </div>
      <div className="text-xs text-stone-500 dark:text-stone-400">
        {sublabel}
      </div>
    </div>
  );
}
