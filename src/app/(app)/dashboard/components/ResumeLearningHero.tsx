import type { GenerationStatus, PlanSummary } from '@/shared/types/db.types';

import { getResumeModule } from '@/app/(app)/dashboard/components/activity-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { planDetailPath } from '@/features/navigation/routes';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface ResumeLearningHeroProps {
  plan: PlanSummary;
}

function resumeBadge(
  status: GenerationStatus,
  isComplete: boolean,
): { label: string; className: string } {
  switch (status) {
    case 'ready':
      return isComplete
        ? {
            label: 'Complete',
            className: 'border-success/40 bg-success/10 text-success',
          }
        : {
            label: 'Active',
            className: 'border-success/40 bg-success/10 text-success',
          };
    case 'generating':
    case 'pending_retry':
      return {
        label: 'Generating',
        className: 'border-panel-border bg-panel-muted text-muted-foreground',
      };
    case 'failed':
      return {
        label: 'Failed',
        className: 'border-danger/40 bg-danger-subtle text-danger',
      };
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/**
 * Current plan resume card: topic, next module, task progress, and actions.
 */
export function ResumeLearningHero({ plan }: ResumeLearningHeroProps) {
  const clampedCompletion = Math.max(0, Math.min(1, plan.completion));
  const progressPercent = Math.round(clampedCompletion * 100);
  const resumeModule = getResumeModule(plan);
  const isComplete = progressPercent >= 100;
  const badge = resumeBadge(plan.plan.generationStatus, isComplete);
  const planHref = planDetailPath(plan.plan.id);
  const moduleHref = resumeModule
    ? `${planHref}/modules/${resumeModule.id}`
    : undefined;
  const moduleMeta = resumeModule
    ? `Module ${resumeModule.order} · ${resumeModule.title}`
    : isComplete
      ? 'Plan complete'
      : 'Continue your current route';

  return (
    <Card
      as='article'
      className='relative h-full overflow-hidden p-5 animate-dashboard-unfold [--dashboard-entry-x:-0.75rem] motion-reduce:animate-none sm:p-6'
    >
      <div className='flex h-full flex-col'>
        <h2 className='text-lg font-semibold text-foreground sm:text-xl'>
          Resume learning
        </h2>

        <Badge variant='outline' className={`mt-4 ${badge.className}`}>
          {badge.label}
        </Badge>

        <h3 className='mt-4 text-xl font-semibold text-balance text-foreground'>
          {plan.plan.topic}
        </h3>
        <p className='mt-2 text-sm text-muted-foreground'>{moduleMeta}</p>
        {resumeModule?.description ? (
          <p className='mt-3 text-sm text-muted-foreground'>
            {resumeModule.description}
          </p>
        ) : null}

        <div className='mt-5'>
          <div className='flex items-center justify-between gap-3 text-xs text-muted-foreground tabular-nums'>
            <p>
              {plan.completedTasks} of {plan.totalTasks} tasks
            </p>
            <p className='font-medium text-foreground'>{progressPercent}%</p>
          </div>
          <Progress
            value={progressPercent}
            max={100}
            aria-label={`${plan.plan.topic} progress`}
            className='mt-2 h-1.5'
          />
        </div>

        <div className='mt-auto flex flex-wrap gap-2.5 pt-5'>
          <Button asChild size='sm'>
            <Link href={planHref}>
              Continue learning
              <ArrowRight className='size-4' />
            </Link>
          </Button>
          {moduleHref ? (
            <Button asChild size='sm' variant='outline'>
              <Link href={moduleHref}>View module</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
