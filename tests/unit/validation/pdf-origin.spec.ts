import { describe, expect, it } from 'vitest';

import { createLearningPlanSchema } from '@/lib/validation/learningPlans';

const baseInput = {
  topic: 'Learn TypeScript',
  skillLevel: 'beginner',
  weeklyHours: 5,
  learningStyle: 'reading',
};

describe('createLearningPlanSchema PDF origin', () => {
  it('requires extractedContent when origin is pdf', () => {
    const result = createLearningPlanSchema.safeParse({
      ...baseInput,
      origin: 'pdf',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.extractedContent).toBeDefined();
    }
  });

  it('accepts extractedContent for pdf origin', () => {
    const result = createLearningPlanSchema.safeParse({
      ...baseInput,
      origin: 'pdf',
      extractedContent: {
        mainTopic: 'Intro to TypeScript',
        sections: [
          {
            title: 'Basics',
            content: 'Types, interfaces, and functions.',
            level: 1,
          },
        ],
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects extractedContent for non-pdf origin', () => {
    const result = createLearningPlanSchema.safeParse({
      ...baseInput,
      origin: 'ai',
      extractedContent: {
        mainTopic: 'Intro to TypeScript',
        sections: [
          {
            title: 'Basics',
            content: 'Types, interfaces, and functions.',
            level: 1,
          },
        ],
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const flatErrors = result.error.flatten();
      expect(flatErrors.fieldErrors.extractedContent).toEqual([
        'extractedContent is only allowed for PDF-based plans.',
      ]);
    }
  });
});
