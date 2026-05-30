import type { PlanFormData } from '@/features/plans/plan-form.types';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockMapOnboardingToCreateInput } = vi.hoisted(() => ({
  mockMapOnboardingToCreateInput: vi.fn(),
}));

vi.mock('@/features/plans/create-mapper', () => ({
  mapOnboardingToCreateInput: mockMapOnboardingToCreateInput,
}));

import {
  buildCreatePlanPayloadFromForm,
  planFormPayloadErrorMessage,
} from '@/features/plans/plan-form-payload';

const baseFormData: PlanFormData = {
  topic: 'TypeScript',
  skillLevel: 'beginner',
  weeklyHours: '5',
  learningStyle: 'mixed',
  deadlineWeeks: '2',
};

describe('buildCreatePlanPayloadFromForm', () => {
  beforeEach(() => {
    mockMapOnboardingToCreateInput.mockReset();
  });

  it('normalizes mapper errors into a structured payload error', () => {
    mockMapOnboardingToCreateInput.mockImplementation(() => {
      throw new Error('validation failed');
    });

    const result = buildCreatePlanPayloadFromForm(baseFormData);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual(
        expect.objectContaining({
          message: 'validation failed',
          name: 'Error',
          stack: expect.any(String),
        }),
      );
    }
  });

  it('normalizes non-Error failures into a structured payload error', () => {
    mockMapOnboardingToCreateInput.mockImplementation(() => {
      throw 'boom';
    });

    expect(buildCreatePlanPayloadFromForm(baseFormData)).toEqual({
      ok: false,
      error: {
        message: 'boom',
        name: 'Error',
      },
    });
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
