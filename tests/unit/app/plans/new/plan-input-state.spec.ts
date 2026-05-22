import {
  createInitialPlanInputState,
  planInputReducer,
} from '@/app/(app)/plans/new/components/plan-form/plan-input-state';
import { describe, expect, it } from 'vitest';

describe('plan-input-state', () => {
  it('creates initial state with the topic and null preferences', () => {
    expect(createInitialPlanInputState('Learn Rust')).toEqual({
      topic: 'Learn Rust',
      skillLevel: null,
      weeklyHours: null,
      learningStyle: null,
      deadlineWeeks: null,
    });
  });

  it.each([
    {
      action: { type: 'set-skill-level' as const, value: 'beginner' as const },
      expectedField: 'skillLevel' as const,
      expectedValue: 'beginner' as const,
      untouchedField: 'weeklyHours' as const,
    },
    {
      action: { type: 'set-weekly-hours' as const, value: '3-5' as const },
      expectedField: 'weeklyHours' as const,
      expectedValue: '3-5' as const,
      untouchedField: 'learningStyle' as const,
    },
    {
      action: { type: 'set-learning-style' as const, value: 'mixed' as const },
      expectedField: 'learningStyle' as const,
      expectedValue: 'mixed' as const,
      untouchedField: 'deadlineWeeks' as const,
    },
    {
      action: { type: 'set-deadline-weeks' as const, value: '4' as const },
      expectedField: 'deadlineWeeks' as const,
      expectedValue: '4' as const,
      untouchedField: 'topic' as const,
      topicValue: 'Learn Rust',
    },
  ])(
    'updates only $expectedField for $action.type',
    ({ action, expectedField, expectedValue, untouchedField, topicValue }) => {
      const state = planInputReducer(
        createInitialPlanInputState('Learn Rust'),
        action,
      );

      expect(state[expectedField]).toBe(expectedValue);
      if (topicValue !== undefined) {
        expect(state.topic).toBe(topicValue);
      } else {
        expect(state[untouchedField]).toBeNull();
      }
    },
  );

  it('updates topic on reset-topic without clearing selected preferences', () => {
    let state = createInitialPlanInputState('Learn Rust');
    state = planInputReducer(state, {
      type: 'set-skill-level',
      value: 'advanced',
    });
    state = planInputReducer(state, {
      type: 'set-weekly-hours',
      value: '11-15',
    });

    state = planInputReducer(state, {
      type: 'reset-topic',
      value: 'Learn Go',
    });

    expect(state).toEqual({
      topic: 'Learn Go',
      skillLevel: 'advanced',
      weeklyHours: '11-15',
      learningStyle: null,
      deadlineWeeks: null,
    });
  });

  it('updates topic on set-topic without clearing selected preferences', () => {
    let state = createInitialPlanInputState('Learn Rust');
    state = planInputReducer(state, {
      type: 'set-learning-style',
      value: 'reading',
    });

    state = planInputReducer(state, {
      type: 'set-topic',
      value: 'Learn TypeScript',
    });

    expect(state.topic).toBe('Learn TypeScript');
    expect(state.learningStyle).toBe('reading');
  });
});
