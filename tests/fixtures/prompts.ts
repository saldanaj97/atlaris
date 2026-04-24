import type { GenerationInput } from '@/shared/types/ai-provider.types';

const DEFAULT_PROMPT_PARAMS: GenerationInput = {
	topic: 'TypeScript',
	skillLevel: 'intermediate',
	learningStyle: 'mixed',
	weeklyHours: 10,
};

export function createPromptParams(
	overrides: Partial<GenerationInput> = {},
): GenerationInput {
	return {
		...DEFAULT_PROMPT_PARAMS,
		...overrides,
	};
}
