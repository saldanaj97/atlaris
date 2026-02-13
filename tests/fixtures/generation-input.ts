import type { GenerationInput } from '@/lib/ai/types/provider.types';

/**
 * Builds GenerationInput with stable defaults for tests.
 * Keep this in one place so shape changes only require one update.
 */
/** Defaults used when no overrides are passed. Same shape as GenerationInput (topic, notes, skillLevel, weeklyHours, learningStyle). */
const DEFAULT_GENERATION_INPUT: GenerationInput = {
  topic: 'Test Topic',
  notes: null,
  skillLevel: 'beginner',
  weeklyHours: 10,
  learningStyle: 'mixed',
};

export { DEFAULT_GENERATION_INPUT };

export function createGenerationInput(
  overrides: Partial<GenerationInput> = {}
): GenerationInput {
  return {
    ...DEFAULT_GENERATION_INPUT,
    ...overrides,
  };
}
