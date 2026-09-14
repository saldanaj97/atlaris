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
import { Label } from '@/components/ui/label';
import { CUSTOM_DEADLINE_VALUE } from '@/features/plans/plan-form-payload';
import { formatDateToYmd } from '@/lib/date/format-local-ymd';
import { Calendar, Clock } from 'lucide-react';

function setLocalMinimumDeadline(input: HTMLInputElement | null): void {
  if (input) input.min = formatDateToYmd(new Date());
}

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
  const deadlineOptions = buildDeadlineOptionsForTier(subscriptionTier);
  const showCustomDeadline =
    subscriptionTier === 'pro' && state.deadlineWeeks === CUSTOM_DEADLINE_VALUE;
  const skillLevelId = `${baseId}-skill-level`;
  const weeklyHoursId = `${baseId}-weekly-hours`;
  const learningStyleId = `${baseId}-learning-style`;
  const deadlineId = `${baseId}-deadline`;
  const deadlineDateId = `${baseId}-deadline-date`;

  return (
    <fieldset className='m-0 min-w-0'>
      <legend className='mb-3 text-sm leading-5 font-medium text-foreground'>
        Plan preferences
      </legend>
      <div className='grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2'>
        <div className='min-w-0 space-y-2'>
          <Label htmlFor={skillLevelId}>Skill level</Label>
          <InlineDropdown
            id={skillLevelId}
            ariaLabel='Skill level'
            options={SKILL_LEVEL_OPTIONS}
            value={state.skillLevel}
            onChange={(value) => dispatch({ type: 'set-skill-level', value })}
            placeholder='Experience'
            variant='primary'
          />
        </div>
        <div className='min-w-0 space-y-2'>
          <Label htmlFor={weeklyHoursId}>Weekly hours</Label>
          <InlineDropdown
            id={weeklyHoursId}
            ariaLabel='Weekly hours'
            options={WEEKLY_HOURS_OPTIONS}
            value={state.weeklyHours}
            onChange={(value) => dispatch({ type: 'set-weekly-hours', value })}
            icon={<Clock className='size-3.5' />}
            placeholder='Weekly time'
            variant='primary'
          />
        </div>
        <div className='min-w-0 space-y-2'>
          <Label htmlFor={learningStyleId}>Learning style</Label>
          <InlineDropdown
            id={learningStyleId}
            ariaLabel='Learning style'
            options={LEARNING_STYLE_OPTIONS}
            value={state.learningStyle}
            onChange={(value) =>
              dispatch({ type: 'set-learning-style', value })
            }
            placeholder='Learning style'
            variant='primary'
          />
        </div>
        <div className='min-w-0 space-y-2'>
          <Label htmlFor={deadlineId}>Deadline</Label>
          <InlineDropdown
            id={deadlineId}
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
        </div>
        {showCustomDeadline ? (
          <div className='min-w-0 space-y-2 md:col-span-2'>
            <Label htmlFor={deadlineDateId}>Custom deadline date</Label>
            <Input
              id={deadlineDateId}
              ref={setLocalMinimumDeadline}
              type='date'
              value={state.deadlineDate ?? ''}
              onChange={(event) =>
                dispatch({
                  type: 'set-deadline-date',
                  value: event.target.value,
                })
              }
              className='min-h-[40px] w-full'
            />
          </div>
        ) : null}
      </div>
    </fieldset>
  );
}
