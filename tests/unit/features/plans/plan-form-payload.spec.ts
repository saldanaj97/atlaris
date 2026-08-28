import {
  buildCreatePlanPayloadFromForm,
  CUSTOM_DEADLINE_VALUE,
  type PlanFormData,
  planFormPayloadErrorMessage,
} from '@/features/plans/plan-form-payload';
import { describe, expect, it } from 'vitest';

const baseFormData: PlanFormData = {
  topic: 'TypeScript',
  skillLevel: 'beginner',
  weeklyHours: '3-5',
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

  it.each(['', ' ', '5', 'invalid'])(
    'returns a structured error for unsupported weekly hours %j',
    (weeklyHours) => {
      const result = buildCreatePlanPayloadFromForm({
        ...baseFormData,
        weeklyHours,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).not.toBe('');
    },
  );

  it('submits a Pro custom deadlineDate instead of converting custom weeks', () => {
    const result = buildCreatePlanPayloadFromForm({
      ...baseFormData,
      deadlineWeeks: CUSTOM_DEADLINE_VALUE,
      deadlineDate: '2027-06-15',
    });

    expect(result).toMatchObject({
      ok: true,
      payload: { deadlineDate: '2027-06-15' },
    });
  });

  it('returns an error when custom deadline is selected without a date', () => {
    const result = buildCreatePlanPayloadFromForm({
      ...baseFormData,
      deadlineWeeks: CUSTOM_DEADLINE_VALUE,
    });

    expect(result.ok).toBe(false);
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
