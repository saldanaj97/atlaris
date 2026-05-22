import { Calendar, Clock } from 'lucide-react';
import type { Dispatch } from 'react';
import { cn } from '@/lib/utils';
import {
  DEADLINE_OPTIONS,
  LEARNING_STYLE_OPTIONS,
  SKILL_LEVEL_OPTIONS,
  WEEKLY_HOURS_OPTIONS,
} from './constants';
import { InlineDropdown } from './InlineDropdown';
import type { PlanInputAction, PlanInputState } from './plan-input-state';

export function PreferenceControls({
  baseId,
  state,
  dispatch,
}: {
  baseId: string;
  state: PlanInputState;
  dispatch: Dispatch<PlanInputAction>;
}) {
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
        ariaLabel="Skill level"
        options={SKILL_LEVEL_OPTIONS}
        value={state.skillLevel}
        onChange={(value) => dispatch({ type: 'set-skill-level', value })}
        placeholder="Experience"
        variant="primary"
      />
      <InlineDropdown
        id={`${baseId}-weekly-hours`}
        ariaLabel="Weekly hours"
        options={WEEKLY_HOURS_OPTIONS}
        value={state.weeklyHours}
        onChange={(value) => dispatch({ type: 'set-weekly-hours', value })}
        icon={<Clock className="size-3.5" />}
        placeholder="Weekly time"
        variant="primary"
      />
      <InlineDropdown
        id={`${baseId}-learning-style`}
        ariaLabel="Learning style"
        options={LEARNING_STYLE_OPTIONS}
        value={state.learningStyle}
        onChange={(value) => dispatch({ type: 'set-learning-style', value })}
        placeholder="Learning style"
        variant="primary"
      />
      <InlineDropdown
        id={`${baseId}-deadline`}
        ariaLabel="Deadline"
        options={DEADLINE_OPTIONS}
        value={state.deadlineWeeks}
        onChange={(value) => dispatch({ type: 'set-deadline-weeks', value })}
        icon={<Calendar className="size-3.5" />}
        placeholder="Finish by"
        variant="primary"
      />
    </div>
  );
}
