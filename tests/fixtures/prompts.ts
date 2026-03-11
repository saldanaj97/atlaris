import type { PromptParams } from '@/lib/ai/prompts';

const DEFAULT_PROMPT_PARAMS: PromptParams = {
  topic: 'TypeScript',
  skillLevel: 'intermediate',
  learningStyle: 'mixed',
  weeklyHours: 10,
};

export function createPromptParams(
  overrides: Partial<PromptParams> = {}
): PromptParams {
  return {
    ...DEFAULT_PROMPT_PARAMS,
    ...overrides,
  };
}
