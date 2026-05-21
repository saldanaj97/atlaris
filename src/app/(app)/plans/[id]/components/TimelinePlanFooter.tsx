import { cn } from '@/lib/utils';
import { CheckCircle2, Flag } from 'lucide-react';
import type { JSX } from 'react';
import {
  getPlanFooterBadgeClassName,
  getPlanFooterCardClassName,
  getPlanFooterLabelClassName,
  getPlanFooterMarkerClassName,
  getPlanFooterTitleClassName,
  type PlanFooterStatus,
} from './timeline-module-card-styles';

interface TimelinePlanFooterProps {
  isPlanComplete: boolean;
  moduleCount: number;
}

export function TimelinePlanFooter({
  isPlanComplete,
  moduleCount,
}: TimelinePlanFooterProps): JSX.Element {
  const status: PlanFooterStatus = isPlanComplete ? 'complete' : 'incomplete';
  const moduleLabel = `${moduleCount} module${moduleCount !== 1 ? 's' : ''}`;

  return (
    <div className="mt-5 flex items-stretch">
      <div className="relative flex w-16 shrink-0 items-center justify-center">
        <div
          className={cn(
            'z-10 flex h-8 w-8 items-center justify-center rounded-full border-[3px] bg-panel shadow-sm',
            getPlanFooterMarkerClassName(status),
          )}
        >
          {isPlanComplete ? (
            <CheckCircle2 size={18} className="fill-success/15" />
          ) : (
            <Flag size={16} />
          )}
        </div>
      </div>
      <div
        className={cn(
          'flex-1 rounded-2xl border p-5 shadow-sm',
          getPlanFooterCardClassName(status),
        )}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p
              className={cn(
                'text-sm font-semibold',
                getPlanFooterLabelClassName(status),
              )}
            >
              {isPlanComplete ? 'Congratulations!' : 'End of plan'}
            </p>
            <h3
              className={cn(
                'mt-1 text-lg font-semibold',
                getPlanFooterTitleClassName(status),
              )}
            >
              {isPlanComplete
                ? 'You have completed all modules in this plan.'
                : 'This is the end of the plan.'}
            </h3>
          </div>
          <span
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-semibold',
              getPlanFooterBadgeClassName(status),
            )}
          >
            {moduleLabel} {isPlanComplete ? 'finished' : 'total'}
          </span>
        </div>
      </div>
    </div>
  );
}
