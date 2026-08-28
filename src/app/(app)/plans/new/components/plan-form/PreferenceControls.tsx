import type { PlanInputAction, PlanInputState } from './plan-input-state';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { Dispatch } from 'react';

import {
  LEARNING_STYLE_OPTIONS,
  SKILL_LEVEL_OPTIONS,
  WEEKLY_HOURS_OPTIONS,
} from './constants';
import { buildDeadlineOptionsForTier } from './deadline-tier';
import { InlineDropdown } from './InlineDropdown';
import { Input } from '@/components/ui/input';
import { CUSTOM_DEADLINE_VALUE } from '@/features/plans/plan-form-payload';
import { formatDateToYmd } from '@/lib/date/format-local-ymd';
import { cn } from '@/lib/utils';
import { Calendar, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

export function PreferenceControls({
  baseId,
  state,
  dispatch,
  subscriptionTier,
}: {
  baseId: string;
  state: PlanInputState;
  dispatch: Dispatch<PlanInputAction>;
  subscriptionTier: SubscriptionTier;
}) {
  const [minimumDeadline, setMinimumDeadline] = useState<string>();
  useEffect(() => setMinimumDeadline(formatDateToYmd(new Date())), []);

  const deadlineOptions = buildDeadlineOptionsForTier(subscriptionTier);
  const showCustomDeadline =
    subscriptionTier === 'pro' && state.deadlineWeeks === CUSTOM_DEADLINE_VALUE;

  return (
    <div
      className={cn(
        'm-0 grid min-w-0 grid-cols-1 gap-3',
        'sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end lg:gap-x-4 lg:gap-y-3',
        'xl:flex-none',
      )}
    >
      <InlineDropdown
        id={`${baseId}-skill-level`}
        ariaLabel='Skill level'
        options={SKILL_LEVEL_OPTIONS}
        value={state.skillLevel}
        onChange={(value) => dispatch({ type: 'set-skill-level', value })}
        placeholder='Experience'
        variant='primary'
      />
      <InlineDropdown
        id={`${baseId}-weekly-hours`}
        ariaLabel='Weekly hours'
        options={WEEKLY_HOURS_OPTIONS}
        value={state.weeklyHours}
        onChange={(value) => dispatch({ type: 'set-weekly-hours', value })}
        icon={<Clock className='size-3.5' />}
        placeholder='Weekly time'
        variant='primary'
      />
      <InlineDropdown
        id={`${baseId}-learning-style`}
        ariaLabel='Learning style'
        options={LEARNING_STYLE_OPTIONS}
        value={state.learningStyle}
        onChange={(value) => dispatch({ type: 'set-learning-style', value })}
        placeholder='Learning style'
        variant='primary'
      />
      <InlineDropdown
        id={`${baseId}-deadline`}
        ariaLabel='Deadline'
        options={deadlineOptions}
        value={state.deadlineWeeks}
        onChange={(value) =>
          dispatch({
            type: 'set-deadline-weeks',
            value,
          })
        }
        icon={<Calendar className='size-3.5' />}
        placeholder='Finish by'
        variant='primary'
      />
      {showCustomDeadline ? (
        <Input
          id={`${baseId}-deadline-date`}
          type='date'
          aria-label='Custom deadline date'
          min={minimumDeadline}
          value={state.deadlineDate ?? ''}
          onChange={(event) =>
            dispatch({ type: 'set-deadline-date', value: event.target.value })
          }
          className='min-h-10 w-full sm:w-auto'
        />
      ) : null}
    </div>
  );
}
