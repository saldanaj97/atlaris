import type { PlanRegenerationState } from '@/app/(app)/plans/[id]/types';
import type { PlanOverviewStats } from '@/app/(app)/plans/[id]/types';
import type { ClientPlanDetail } from '@/shared/types/client.types';
import type { CSSProperties } from 'react';

import { RegeneratePlanDialog } from '@/app/(app)/plans/[id]/components/RegeneratePlanDialog';
import { Button } from '@/components/ui/button';
import { PageHero } from '@/components/ui/page-hero';
import { planDetailPath } from '@/features/navigation/routes';
import { formatMinutes } from '@/features/plans/formatters';
import { ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface PlanOverviewProps {
  plan: ClientPlanDetail;
  stats: PlanOverviewStats;
  activeModuleId?: string | null;
  regeneration?: PlanRegenerationState;
}

/** Introduces the plan and keeps the primary learning action near its title. */
export function PlanOverviewHeader({
  plan,
  stats,
  activeModuleId = null,
  regeneration,
}: PlanOverviewProps) {
  const continueHref = activeModuleId
    ? `${planDetailPath(plan.id)}/modules/${activeModuleId}`
    : '#learning-path';
  const continueLabel = activeModuleId ? 'Continue learning' : 'Review roadmap';

  return (
    <PageHero className='rounded-2xl border border-panel-border bg-panel px-5 py-6 sm:px-7 sm:py-8'>
      <div className='relative z-10 max-w-3xl'>
        <h1 className='max-w-2xl type-title-hero text-balance wrap-break-word text-foreground'>
          {plan.topic}
        </h1>
        <p className='mt-3 max-w-xl type-body wrap-break-word text-muted-foreground sm:type-reading'>
          A structured path for learning {plan.topic}, paced around your
          available time.
        </p>

        <div className='mt-5 flex flex-wrap items-center gap-3'>
          <Button asChild variant='cta'>
            <Link href={continueHref}>
              {continueLabel}
              <ArrowRight aria-hidden='true' />
            </Link>
          </Button>
          <Button asChild variant='outline'>
            <a href='#learning-path'>View roadmap</a>
          </Button>
          {regeneration?.isRegenerating ? (
            <Button variant='outline' disabled>
              <Loader2
                aria-hidden='true'
                className='animate-spin motion-reduce:animate-none'
              />
              Regenerating…
            </Button>
          ) : regeneration?.canRegenerate ? (
            <RegeneratePlanDialog planId={plan.id} />
          ) : null}
          <span className='type-meta text-muted-foreground tabular-nums'>
            {stats.completionPercentage}% complete ·{' '}
            {formatMinutes(stats.totalMinutes)} planned
            {stats.totalModules > 0
              ? ` · ${stats.completedModules} of ${stats.totalModules} modules`
              : null}
          </span>
        </div>
        {regeneration?.isRegenerating ? (
          <output className='mt-3 block type-body text-muted-foreground'>
            A new version of this plan is being generated. It replaces this one
            when it is ready.
          </output>
        ) : null}
      </div>

      <div
        aria-hidden='true'
        className='absolute right-0 bottom-0 left-0 h-1 bg-border/50'
      >
        <div
          className='h-full w-(--plan-progress-width) bg-action-primary transition-[width] duration-500 motion-reduce:transition-none'
          style={
            {
              '--plan-progress-width': `${stats.completionPercentage}%`,
            } as CSSProperties
          }
        />
      </div>
    </PageHero>
  );
}
