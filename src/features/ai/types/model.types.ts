/**
 * Subscription tier required to access a model. The AI model catalog only
 * splits between `free`-accessible and `pro`-only tiers, regardless of how
 * many subscription tiers the billing surface defines.
 */
export type ModelTier = 'free' | 'pro';

/**
 * Metadata for an available AI model.
 */
export type AvailableModel = {
	/** OpenRouter model ID (e.g., 'google/gemini-1.5-flash') */
	id: string;
	/** Display name for UI (e.g., 'Gemini 1.5 Flash') */
	name: string;
	/** Provider name (e.g., 'Google', 'OpenAI', 'Anthropic') */
	provider: string;
	/** Short description for UI display */
	description: string;
	/** Required subscription tier to access this model */
	tier: ModelTier;
	/** Context window size in tokens */
	contextWindow: number;
	/** Maximum output tokens the model will produce */
	maxOutputTokens?: number;
	/** Input cost per million tokens (USD) - 0 for free models */
	inputCostPerMillion: number;
	/** Output cost per million tokens (USD) - 0 for free models */
	outputCostPerMillion: number;
};
