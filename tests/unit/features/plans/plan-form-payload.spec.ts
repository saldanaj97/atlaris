import {
  buildCreatePlanPayloadFromForm,
  type PlanFormData,
  planFormPayloadErrorMessage,
} from '@/features/plans/plan-form-payload';
import { describe, expect, it } from 'vitest';

const baseFormData: PlanFormData = {
  topic: 'TypeScript',
  skillLevel: 'beginner',
  weeklyHours: '5',
  learningStyle: 'mixed',
  deadlineWeeks: '2',
};

describe('buildCreatePlanPayloadFromForm', () => {
  it('maps form values directly to the create payload', () => {
    const result = buildCreatePlanPayloadFromForm(baseFormData);

    expect(result).toMatchObject({
      ok: true,
      payload: {
        topic: 'TypeScript',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      },
    });
  });

  it('returns a structured error for invalid form values', () => {
    const result = buildCreatePlanPayloadFromForm({
      ...baseFormData,
      weeklyHours: 'invalid',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).not.toBe('');
  });
});

describe('planFormPayloadErrorMessage', () => {
  it('returns the error message when it is short and non-empty', () => {
    expect(
      planFormPayloadErrorMessage({
        message: 'Deadline must be in the future',
        name: 'Error',
      }),
    ).toBe('Deadline must be in the future');
  });

  it('falls back for empty or overly long messages', () => {
    expect(planFormPayloadErrorMessage({ message: '', name: 'Error' })).toBe(
      'Please double-check the form and try again.',
    );

    expect(
      planFormPayloadErrorMessage({
        message: 'x'.repeat(201),
        name: 'Error',
      }),
    ).toBe('Please double-check the form and try again.');
  });
});
