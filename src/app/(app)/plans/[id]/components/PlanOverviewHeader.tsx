import type { PlanOverviewStats } from '@/app/(app)/plans/[id]/types';
import type { ClientPlanDetail } from '@/shared/types/client.types';

import { Button } from '@/components/ui/button';
import { PageHero } from '@/components/ui/page-hero';
import { SectionOverline } from '@/components/ui/section-overline';
import { planDetailPath } from '@/features/navigation/routes';
import { formatMinutes, formatSkillLevel } from '@/features/plans/formatters';
import { ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';

interface PlanOverviewProps {
  plan: ClientPlanDetail;
  stats: PlanOverviewStats;
  activeModuleId?: string | null;
}

/** Introduces the plan and keeps the primary learning action near its title. */
export function PlanOverviewHeader({
  plan,
  stats,
  activeModuleId = null,
}: PlanOverviewProps) {
  const continueHref = activeModuleId
    ? `${planDetailPath(plan.id)}/modules/${activeModuleId}`
    : '#learning-path';
  const continueLabel = activeModuleId ? 'Continue learning' : 'Review roadmap';

  return (
    <PageHero className='rounded-2xl border border-panel-border bg-panel px-5 py-6 sm:px-7 sm:py-8'>
      <div className='relative z-10 max-w-3xl'>
        <SectionOverline
          icon={<Sparkles aria-hidden='true' className='size-4' />}
        >
          Learning plan · {formatSkillLevel(plan.skillLevel)}
        </SectionOverline>
        <h1 className='font-heading mt-3 max-w-2xl text-[32px] leading-[1.15] tracking-[-0.03em] text-balance wrap-break-word text-foreground sm:text-[40px]'>
          {plan.topic}
        </h1>
        <p className='mt-3 max-w-xl text-sm leading-relaxed wrap-break-word text-muted-foreground sm:text-base'>
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
          <span className='text-xs text-muted-foreground tabular-nums'>
            {stats.completionPercentage}% complete ·{' '}
            {formatMinutes(stats.totalMinutes)} planned
            {stats.totalModules > 0
              ? ` · ${stats.completedModules} of ${stats.totalModules} modules`
              : null}
          </span>
        </div>
      </div>

      <div
        aria-hidden='true'
        className='absolute right-0 bottom-0 left-0 h-1 bg-border/50'
      >
        <div
          className='h-full bg-action-primary transition-[width] duration-500 motion-reduce:transition-none'
          style={{ width: `${stats.completionPercentage}%` }}
        />
      </div>
    </PageHero>
  );
}
