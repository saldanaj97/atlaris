import type { PlanSummary } from '@/shared/types/db.types';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ROUTES } from '@/features/navigation/routes';
import Link from 'next/link';

interface ResumeLearningHeroProps {
  plan: PlanSummary;
}

/**
 * PlanSummary modules omit per-task progress; use completion metrics only.
 */
function getUpNextLabel(plan: PlanSummary): string {
  const progressPercent = Math.round(
    Math.max(0, Math.min(1, plan.completion)) * 100,
  );

  if (progressPercent >= 100) {
    return 'Plan complete';
  }

  if (plan.completedModules === 0) {
    return plan.modules[0]?.title ?? 'Getting Started';
  }

  return 'Continue your plan';
}

function getResumeHeroDescription(plan: PlanSummary): string {
  const moduleCount = plan.modules.length;
  const completedModules = plan.completedModules;
  const topic = plan.plan.topic;
  const topicLower = (topic ?? 'your topic').toLowerCase();

  if (completedModules === 0) {
    return `Start your journey with ${moduleCount} modules covering ${topicLower}.`;
  }
  if (completedModules === moduleCount) {
    return `Congratulations! You've completed all ${moduleCount} modules.`;
  }
  return `${completedModules} of ${moduleCount} modules complete · Up next: ${getUpNextLabel(plan)}`;
}

/**
 * After Hours resume card — arched panel, soft progress track, peach pill CTA.
 */
export function ResumeLearningHero({ plan }: ResumeLearningHeroProps) {
  const clampedCompletion = Math.max(0, Math.min(1, plan.completion));
  const progressPercent = Math.round(clampedCompletion * 100);

  return (
    <article className='rounded-[1.75rem] border border-panel-border bg-panel p-6 text-panel-foreground sm:p-7'>
      <p className='mb-3 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase'>
        Most recent plan
      </p>

      <h2 className='text-xl font-semibold text-balance text-foreground sm:text-2xl'>
        {plan.plan.topic}
      </h2>

      <p className='mt-2 max-w-xl text-sm font-normal text-muted-foreground'>
        {getResumeHeroDescription(plan)}
      </p>

      <div className='mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5'>
        <div className='min-w-0 flex-1'>
          <div className='mb-2 flex items-baseline justify-between gap-3'>
            <span className='text-xs font-medium text-muted-foreground'>
              Progress
            </span>
            <span className='text-xs font-medium text-foreground tabular-nums'>
              {progressPercent}%
            </span>
          </div>
          {/* soft track (#3b2135 → secondary) + accent fill (#f0a06e → primary) */}
          <Progress
            value={progressPercent}
            aria-label={`Plan progress: ${progressPercent}% complete`}
            className='h-2 bg-secondary'
          />
        </div>

        <div className='flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center'>
          {/* accent CTA */}
          <Button
            asChild
            className='h-10 rounded-full bg-primary px-5 text-primary-foreground hover:bg-primary/90'
          >
            <Link href={`/plans/${plan.plan.id}`}>Continue</Link>
          </Button>
          {/* ctaBg plate — card/panel surface with line border */}
          <Button
            asChild
            variant='outline'
            className='h-10 rounded-full border-panel-border bg-panel px-5 text-panel-foreground hover:bg-secondary hover:text-foreground'
          >
            <Link href={ROUTES.PLANS.ROOT}>All plans</Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
