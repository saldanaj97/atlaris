/**
 * Catalog access label (`free` vs `pro`). This is not proof of zero cost and
 * is not the operation allowlist — see `model-operation-policy.ts`.
 */
type ModelTier = 'free' | 'pro';

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
  /** Catalog access label. Not proof of zero cost. */
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
