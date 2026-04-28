import { describe, expect, it } from 'vitest';

import { createLearningPlanSchema } from '@/features/plans/validation/learningPlans';

const validBaseInput = {
  topic: 'Learn TypeScript',
  skillLevel: 'beginner' as const,
  weeklyHours: 5,
  learningStyle: 'mixed' as const,
};

describe('createLearningPlanSchema', () => {
  it('rejects the removed pdf origin at the API boundary', () => {
    const result = createLearningPlanSchema.safeParse({
      ...validBaseInput,
      origin: 'pdf',
    });

    expect(result.success).toBe(false);
  });

  it('still accepts supported origins', () => {
    const result = createLearningPlanSchema.safeParse({
      ...validBaseInput,
      origin: 'ai',
    });

    expect(result.success).toBe(true);
  });
});
