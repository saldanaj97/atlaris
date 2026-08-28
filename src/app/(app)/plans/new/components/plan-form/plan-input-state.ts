import {
  DEADLINE_OPTIONS,
  LEARNING_STYLE_OPTIONS,
  SKILL_LEVEL_OPTIONS,
  WEEKLY_HOURS_OPTIONS,
} from './constants';
import { CUSTOM_DEADLINE_VALUE } from '@/features/plans/plan-form-payload';
import { assertNever } from '@/lib/errors';

export type SkillLevel = (typeof SKILL_LEVEL_OPTIONS)[number]['value'];
export type WeeklyHours = (typeof WEEKLY_HOURS_OPTIONS)[number]['value'];
export type LearningStyle = (typeof LEARNING_STYLE_OPTIONS)[number]['value'];
export type DeadlineWeeks =
  | (typeof DEADLINE_OPTIONS)[number]['value']
  | typeof CUSTOM_DEADLINE_VALUE;

export interface PlanInputState {
  topic: string;
  skillLevel: SkillLevel | null;
  weeklyHours: WeeklyHours | null;
  learningStyle: LearningStyle | null;
  deadlineWeeks: DeadlineWeeks | null;
  deadlineDate: string | null;
}

export type PlanInputAction =
  | { type: 'set-topic'; value: string }
  | { type: 'reset-topic'; value: string }
  | { type: 'set-skill-level'; value: SkillLevel }
  | { type: 'set-weekly-hours'; value: WeeklyHours }
  | { type: 'set-learning-style'; value: LearningStyle }
  | { type: 'set-deadline-weeks'; value: DeadlineWeeks }
  | { type: 'set-deadline-date'; value: string }
  | { type: 'clear-deadline' };

export function createInitialPlanInputState(
  initialTopic: string,
): PlanInputState {
  return {
    topic: initialTopic,
    skillLevel: null,
    weeklyHours: null,
    learningStyle: null,
    deadlineWeeks: null,
    deadlineDate: null,
  };
}

export function planInputReducer(
  state: PlanInputState,
  action: PlanInputAction,
): PlanInputState {
  switch (action.type) {
    case 'set-topic':
      return {
        ...state,
        topic: action.value,
      };
    // Keep this action separate so external resets remain distinct from user edits in reducer traces.
    case 'reset-topic':
      return {
        ...state,
        topic: action.value,
      };
    case 'set-skill-level':
      return {
        ...state,
        skillLevel: action.value,
      };
    case 'set-weekly-hours':
      return {
        ...state,
        weeklyHours: action.value,
      };
    case 'set-learning-style':
      return {
        ...state,
        learningStyle: action.value,
      };
    case 'set-deadline-weeks':
      return {
        ...state,
        deadlineWeeks: action.value,
        deadlineDate:
          action.value === CUSTOM_DEADLINE_VALUE ? state.deadlineDate : null,
      };
    case 'set-deadline-date':
      return {
        ...state,
        deadlineWeeks: CUSTOM_DEADLINE_VALUE,
        deadlineDate: action.value,
      };
    case 'clear-deadline':
      return {
        ...state,
        deadlineWeeks: null,
        deadlineDate: null,
      };
    default:
      return assertNever(action);
  }
}
