import { createLearningPlanSchema } from '@/features/plans/validation/learningPlans';
import { describe, expect, it } from 'vitest';

const validBaseInput = {
  topic: 'Learn TypeScript',
  skillLevel: 'beginner' as const,
  weeklyHours: 5,
  learningStyle: 'mixed' as const,
};

describe('createLearningPlanSchema', () => {
  it('still accepts supported origins', () => {
    const result = createLearningPlanSchema.safeParse({
      ...validBaseInput,
      origin: 'ai',
    });

    expect(result.success).toBe(true);
  });
});
