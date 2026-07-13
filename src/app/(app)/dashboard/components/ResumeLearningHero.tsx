import type { PlanSummary } from '@/shared/types/db.types';

import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import { Play } from 'lucide-react';
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
  return `${completedModules} of ${moduleCount} modules complete. Keep going!`;
}

interface HeroCircularProgressProps {
  progressPercent: number;
  size?: number;
  strokeWidth?: number;
}

function HeroCircularProgress({
  progressPercent,
  size = 64,
  strokeWidth = 6,
}: HeroCircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progressPercent / 100);
  return (
    <div
      className='relative flex-shrink-0'
      style={{ width: size, height: size }}
    >
      <progress
        aria-label={`Plan progress: ${progressPercent}% complete`}
        className='sr-only'
        value={progressPercent}
        max={100}
      >{`Plan progress: ${progressPercent}% complete`}</progress>
      <svg
        className='-rotate-90'
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden='true'
      >
        <title>Progress indicator</title>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill='none'
          className='stroke-muted'
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill='none'
          className='stroke-primary'
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap='round'
        />
      </svg>
      <span
        className='absolute inset-0 flex items-center justify-center text-sm font-semibold text-foreground tabular-nums'
        aria-hidden='true'
      >
        {progressPercent}%
      </span>
    </div>
  );
}

export function ResumeLearningHero({ plan }: ResumeLearningHeroProps) {
  const clampedCompletion = Math.max(0, Math.min(1, plan.completion));
  const progressPercent = Math.round(clampedCompletion * 100);

  const upNextLabel = getUpNextLabel(plan);

  return (
    <Surface
      variant='interactive'
      padding='comfortable'
      className='flex flex-col gap-4 border-primary/20'
    >
      <div className='flex items-start justify-between gap-4'>
        <p className='text-xs font-medium tracking-wider text-muted-foreground uppercase'>
          Most Recent Plan
        </p>
        <HeroCircularProgress progressPercent={progressPercent} />
      </div>

      {/* ponytail: stack until lg — side-by-side truncates the title around tablet widths */}
      <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
        <div className='min-w-0 space-y-2 lg:flex-1'>
          <h2 className='text-2xl font-semibold wrap-break-word text-foreground md:text-3xl lg:truncate'>
            {plan.plan.topic}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {getResumeHeroDescription(plan)}
          </p>
        </div>

        <div className='flex w-full min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between lg:w-auto lg:justify-end lg:gap-4'>
          <p className='min-w-0 text-sm wrap-break-word text-muted-foreground sm:flex-1 lg:max-w-xs lg:flex-none'>
            <span className='font-medium text-foreground'>Up Next:</span>{' '}
            {upNextLabel}
          </p>
          <Button asChild className='w-full shrink-0 px-5 py-2.5 sm:w-auto'>
            <Link href={`/plans/${plan.plan.id}`}>
              <Play />
              Continue Learning
            </Link>
          </Button>
        </div>
      </div>
    </Surface>
  );
}
