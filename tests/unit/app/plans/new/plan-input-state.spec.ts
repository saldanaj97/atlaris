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

  it('updates only the targeted preference field for each selection action', () => {
    let state = createInitialPlanInputState('Learn Rust');

    state = planInputReducer(state, {
      type: 'set-skill-level',
      value: 'beginner',
    });
    expect(state.skillLevel).toBe('beginner');
    expect(state.weeklyHours).toBeNull();

    state = planInputReducer(state, {
      type: 'set-weekly-hours',
      value: '3-5',
    });
    expect(state.weeklyHours).toBe('3-5');
    expect(state.learningStyle).toBeNull();

    state = planInputReducer(state, {
      type: 'set-learning-style',
      value: 'mixed',
    });
    expect(state.learningStyle).toBe('mixed');
    expect(state.deadlineWeeks).toBeNull();

    state = planInputReducer(state, {
      type: 'set-deadline-weeks',
      value: '4',
    });
    expect(state.deadlineWeeks).toBe('4');
    expect(state.topic).toBe('Learn Rust');
  });

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
