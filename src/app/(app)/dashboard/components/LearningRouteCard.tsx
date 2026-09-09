import type { PlanSummary } from '@/shared/types/db.types';

import { getOrderedPlanModules } from '@/app/(app)/dashboard/components/activity-utils';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

const TITLE_ID = 'dashboard-learning-route-heading';
const ROUTE_WINDOW = 4;

export function LearningRouteCard({ plan }: { plan: PlanSummary }) {
  const modules = getOrderedPlanModules(plan);
  if (modules.length === 0) {
    return null;
  }

  const currentIndex = Math.min(plan.completedModules, modules.length - 1);
  const windowStart =
    modules.length <= ROUTE_WINDOW
      ? 0
      : Math.min(Math.max(0, currentIndex - 1), modules.length - ROUTE_WINDOW);
  const visibleModules = modules.slice(windowStart, windowStart + ROUTE_WINDOW);
  const routePercent = Math.round(
    (plan.completedModules / modules.length) * 100,
  );

  return (
    <Card
      as='section'
      aria-labelledby={TITLE_ID}
      className='h-full p-5 animate-dashboard-unfold [animation-delay:120ms] motion-reduce:animate-none sm:p-6'
    >
      <h2
        id={TITLE_ID}
        className='text-lg font-semibold text-foreground sm:text-xl'
      >
        Your learning route
      </h2>
      <p className='mt-2 text-sm text-muted-foreground'>
        {plan.plan.topic} · {plan.completedModules} of {modules.length} modules
      </p>

      <ol className='mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-2'>
        {visibleModules.map((module) => {
          const moduleIndex = modules.findIndex(
            (item) => item.id === module.id,
          );
          const isComplete = moduleIndex < plan.completedModules;
          const isCurrent = moduleIndex === plan.completedModules;

          return (
            <li key={module.id} className='min-w-0 text-center'>
              <span
                className={cn(
                  'mx-auto flex size-7 items-center justify-center rounded-full border text-xs font-medium tabular-nums',
                  isComplete &&
                    'border-action-primary bg-action-primary text-action-primary-foreground',
                  isCurrent &&
                    !isComplete &&
                    'border-action-primary text-foreground',
                  !isComplete &&
                    !isCurrent &&
                    'border-border text-muted-foreground',
                )}
              >
                {module.order}
              </span>
              <span className='mt-2 block truncate text-xs text-muted-foreground'>
                {module.title}
              </span>
            </li>
          );
        })}
      </ol>

      <Progress
        value={routePercent}
        max={100}
        aria-label={`${plan.plan.topic} module route`}
        className='mt-5 h-1.5'
      />
    </Card>
  );
}
