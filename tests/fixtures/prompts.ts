import type {
  MicroExplanationPromptParams,
  PromptParams,
} from '@/lib/ai/prompts';

const DEFAULT_PROMPT_PARAMS: PromptParams = {
  topic: 'TypeScript',
  skillLevel: 'intermediate',
  learningStyle: 'mixed',
  weeklyHours: 10,
};

const DEFAULT_MICRO_EXPLANATION_PARAMS: MicroExplanationPromptParams = {
  topic: 'React Hooks',
  taskTitle: 'Understanding useState',
  skillLevel: 'beginner',
};

export function createPromptParams(
  overrides: Partial<PromptParams> = {}
): PromptParams {
  return {
    ...DEFAULT_PROMPT_PARAMS,
    ...overrides,
  };
}

export function createMicroExplanationParams(
  overrides: Partial<MicroExplanationPromptParams> = {}
): MicroExplanationPromptParams {
  return {
    ...DEFAULT_MICRO_EXPLANATION_PARAMS,
    ...overrides,
  };
}
