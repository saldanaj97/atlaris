import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';

import { buildCreateGenerationInput } from '@/features/plans/session/generation-input';
import { describe, expect, it } from 'vitest';

const body: CreateLearningPlanInput = {
  topic: 'Learn TypeScript',
  skillLevel: 'beginner',
  weeklyHours: 5,
  learningStyle: 'mixed',
  notes: 'Focus on generics',
  startDate: undefined,
  deadlineDate: undefined,
  visibility: 'private',
  origin: 'ai',
};

describe('buildCreateGenerationInput', () => {
  it('classifies new-plan stream generation as initial', () => {
    const input = buildCreateGenerationInput({
      body,
      createResult: {
        planId: 'plan-create-001',
        tier: 'free',
        normalizedInput: {
          topic: 'Learn TypeScript',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          startDate: '2026-01-01',
          deadlineDate: '2026-03-01',
        },
      },
      userId: 'user-001',
    });

    expect(input.generationPurpose).toBe('initial');
    expect(input.planId).toBe('plan-create-001');
    expect(input.userId).toBe('user-001');
    expect(input.input.topic).toBe('Learn TypeScript');
    expect(input.input.notes).toBe('Focus on generics');
  });
});
