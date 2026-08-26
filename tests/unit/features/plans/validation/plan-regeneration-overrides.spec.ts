import { planRegenerationOverridesSchema } from '@/features/plans/validation/learningPlans.schemas';
import { describe, expect, it } from 'vitest';

describe('planRegenerationOverridesSchema', () => {
  it('accepts allowed public overrides', () => {
    expect(
      planRegenerationOverridesSchema.parse({
        skillLevel: 'advanced',
        weeklyHours: 8,
        learningStyle: 'practice',
        startDate: '2026-01-01',
        deadlineDate: '2026-02-01',
        model: 'google/gemini-3-flash-preview',
      }),
    ).toMatchObject({
      skillLevel: 'advanced',
      weeklyHours: 8,
    });
  });

  it('fails closed on forged topic or notes', () => {
    expect(
      planRegenerationOverridesSchema.safeParse({ topic: 'forged topic' })
        .success,
    ).toBe(false);
    expect(
      planRegenerationOverridesSchema.safeParse({ notes: 'forged notes' })
        .success,
    ).toBe(false);
  });
});
