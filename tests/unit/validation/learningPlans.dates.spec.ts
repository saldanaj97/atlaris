import { describe, expect, it } from 'vitest';

import { onboardingFormSchema } from '@/lib/validation/learningPlans';

function baseInput() {
  return {
    topic: 'Learning AI',
    skillLevel: 'beginner',
    weeklyHours: 5,
    learningStyle: 'reading',
    notes: undefined as string | undefined,
  };
}

function yyyyMmDd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

describe('onboardingFormSchema date validations', () => {
  it('accepts deadline today', () => {
    const today = new Date();
    const input = {
      ...baseInput(),
      deadlineDate: yyyyMmDd(today),
    };
    const result = onboardingFormSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects past deadline', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const input = {
      ...baseInput(),
      deadlineDate: yyyyMmDd(yesterday),
    };
    const result = onboardingFormSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors.deadlineDate || [];
      expect(errors.some((m) => m?.includes('past'))).toBe(true);
    }
  });

  it('allows empty start date but enforces when provided', () => {
    const input = {
      ...baseInput(),
      deadlineDate: yyyyMmDd(new Date()),
      startDate: undefined,
    };
    const result = onboardingFormSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects start date in the past when provided', () => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const input = {
      ...baseInput(),
      deadlineDate: yyyyMmDd(today),
      startDate: yyyyMmDd(yesterday),
    };
    const result = onboardingFormSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors.startDate || [];
      expect(errors.some((m) => m?.includes('past'))).toBe(true);
    }
  });

  it('enforces startDate <= deadlineDate', () => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const input = {
      ...baseInput(),
      deadlineDate: yyyyMmDd(today),
      startDate: yyyyMmDd(tomorrow),
    };
    const result = onboardingFormSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors.startDate || [];
      expect(errors.some((m) => m?.includes('on or before'))).toBe(true);
    }
  });

  it('requires YYYY-MM-DD format', () => {
    const input = {
      ...baseInput(),
      deadlineDate: '2025-1-1', // invalid format
    } as any;
    const result = onboardingFormSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors.deadlineDate || [];
      expect(errors.some((m) => m?.includes('YYYY-MM-DD'))).toBe(true);
    }
  });

  it('caps deadlines to within 1 year', () => {
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 2);
    const input = {
      ...baseInput(),
      deadlineDate: yyyyMmDd(farFuture),
    };
    const result = onboardingFormSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors.deadlineDate || [];
      expect(errors.some((m) => m?.includes('1 year'))).toBe(true);
    }
  });
});
