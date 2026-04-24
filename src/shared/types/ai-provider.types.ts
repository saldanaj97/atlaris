import type { LearningStyle, SkillLevel } from '@/shared/types/db.types';

export type GenerationInput = {
	topic: string;
	notes?: string | null;
	skillLevel: SkillLevel;
	weeklyHours: number;
	learningStyle: LearningStyle;
	startDate?: string | null;
	deadlineDate?: string | null;
};

/** Core scalar fields shared across create/retry/stream/lifecycle. */
export type PlanGenerationCoreFields = Pick<
	GenerationInput,
	| 'topic'
	| 'skillLevel'
	| 'learningStyle'
	| 'weeklyHours'
	| 'startDate'
	| 'deadlineDate'
>;

/** Same as {@link PlanGenerationCoreFields} with explicit null dates after normalization. */
export type PlanGenerationCoreFieldsNormalized = Omit<
	PlanGenerationCoreFields,
	'startDate' | 'deadlineDate'
> & {
	startDate: string | null;
	deadlineDate: string | null;
};

export type ProviderUsage = {
	promptTokens?: number;
	completionTokens?: number;
	totalTokens?: number;
	/**
	 * OpenRouter `usage.cost` when present (USD, not credits). Parsed from the
	 * final streaming chunk or non-streaming `response.usage` — see
	 * `openrouter-response.ts` and `src/features/ai/openrouter-cost-contract.ts`.
	 */
	providerReportedCostUsd?: number | null;
};

export type ProviderMetadata = {
	model?: string;
	provider?: string;
	usage?: ProviderUsage;
};
