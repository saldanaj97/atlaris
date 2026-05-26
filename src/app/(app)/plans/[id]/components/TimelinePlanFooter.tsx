import type { JSX } from 'react';

import {
  PLAN_FOOTER_THEME,
  type PlanFooterStatus,
} from '@/app/(app)/plans/plans-progress-theme';
import { cn } from '@/lib/utils';
import { CheckCircle2, Flag } from 'lucide-react';

interface TimelinePlanFooterProps {
  isPlanComplete: boolean;
  moduleCount: number;
}

export function TimelinePlanFooter({
  isPlanComplete,
  moduleCount,
}: TimelinePlanFooterProps): JSX.Element {
  const status: PlanFooterStatus = isPlanComplete ? 'complete' : 'incomplete';
  const theme = PLAN_FOOTER_THEME[status];
  const moduleLabel = `${moduleCount} module${moduleCount !== 1 ? 's' : ''}`;

  return (
    <div className='mt-5 flex items-stretch'>
      <div className='relative flex w-16 shrink-0 items-center justify-center'>
        <div
          className={cn(
            'z-10 flex h-8 w-8 items-center justify-center rounded-full border-[3px] bg-panel shadow-sm',
            theme.marker,
          )}
        >
          {isPlanComplete ? (
            <CheckCircle2 size={18} className='fill-success/15' />
          ) : (
            <Flag size={16} />
          )}
        </div>
      </div>
      <div
        className={cn('flex-1 rounded-2xl border p-5 shadow-sm', theme.card)}
      >
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <p className={cn('text-sm font-semibold', theme.label)}>
              {isPlanComplete ? 'Congratulations!' : 'End of plan'}
            </p>
            <h3 className={cn('mt-1 text-lg font-semibold', theme.title)}>
              {isPlanComplete
                ? 'You have completed all modules in this plan.'
                : 'This is the end of the plan.'}
            </h3>
          </div>
          <span
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-semibold',
              theme.badge,
            )}
          >
            {moduleLabel} {isPlanComplete ? 'finished' : 'total'}
          </span>
        </div>
      </div>
    </div>
  );
}
