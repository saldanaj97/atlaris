/**
 * OpenRouter AI Model Configuration
 *
 * This module defines all available OpenRouter models with metadata for UI display
 * and tier-gating. Models are categorized by subscription tier (free/pro) and include
 * technical specifications for context windows and token limits.
 *
 * @module lib/ai/models
 */

/**
 * Fallback default model used when no user preference is specified.
 *
 * Note: this file is imported by client components (e.g. model selector UI),
 * so it must remain free of server-only env access.
 */
export const AI_DEFAULT_MODEL = 'google/gemini-2.0-flash-exp:free';

// (kept for backward compatibility) AI_DEFAULT_MODEL is defined above.

/**
 * Subscription tier required to access a model.
 */
export type ModelTier = 'free' | 'pro';

/**
 * User subscription tier (free, starter, or pro).
 * Starter tier has access to free models only.
 * Pro tier has access to all models.
 */
export type SubscriptionTier = 'free' | 'starter' | 'pro';

/**
 * Metadata for an available AI model.
 */
export interface AvailableModel {
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
  /** Input cost per million tokens (USD) - 0 for free models */
  inputCostPerMillion: number;
  /** Output cost per million tokens (USD) - 0 for free models */
  outputCostPerMillion: number;
}

/**
 * Complete list of available OpenRouter models.
 * Models are listed in order of recommendation within their tier.
 */
export const AVAILABLE_MODELS: AvailableModel[] = [
  // Free tier models - accessible to all users
  {
    id: 'google/gemini-2.0-flash-exp:free',
    name: 'Gemini 2.0 Flash',
    provider: 'Google',
    description:
      'Fast, high-quality model with massive context window. Best for complex learning plans.',
    tier: 'free',
    contextWindow: 1_050_000,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
  },
  {
    id: 'anthropic/claude-haiku-4.5:free',
    name: 'Claude Haiku 4.5',
    provider: 'Anthropic',
    description:
      'Fast and efficient model from Anthropic with strong reasoning capabilities.',
    tier: 'free',
    contextWindow: 200_000,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
  },
  {
    id: 'openai/gpt-oss-20b:free',
    name: 'GPT-OSS 20B',
    provider: 'OpenAI',
    description: 'Open-source style model for general-purpose tasks.',
    tier: 'free',
    contextWindow: 131_000,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
  },
  {
    id: 'alibaba/tongyi-deepresearch-30b-a3b:free',
    name: 'Tongyi DeepResearch 30B',
    provider: 'Alibaba',
    description: 'Research-focused model with strong analytical capabilities.',
    tier: 'free',
    contextWindow: 131_000,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
  },

  // Pro tier models - require paid subscription
  {
    id: 'anthropic/claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    provider: 'Anthropic',
    description:
      'Premium model with exceptional reasoning and nuanced understanding.',
    tier: 'pro',
    contextWindow: 1_000_000,
    inputCostPerMillion: 3,
    outputCostPerMillion: 15,
  },
  {
    id: 'openai/gpt-5.2',
    name: 'GPT-5.2',
    provider: 'OpenAI',
    description:
      'Latest GPT model with advanced reasoning and extended context.',
    tier: 'pro',
    contextWindow: 400_000,
    inputCostPerMillion: 1.75,
    outputCostPerMillion: 14,
  },
  {
    id: 'openai/gpt-5.1',
    name: 'GPT-5.1',
    provider: 'OpenAI',
    description:
      'Advanced GPT model with strong performance across diverse tasks.',
    tier: 'pro',
    contextWindow: 400_000,
    inputCostPerMillion: 1.5,
    outputCostPerMillion: 12,
  },
  {
    id: 'google/gemini-3-pro-preview',
    name: 'Gemini 3 Pro Preview',
    provider: 'Google',
    description:
      'Preview of next-generation Gemini with enhanced capabilities.',
    tier: 'pro',
    contextWindow: 1_050_000,
    inputCostPerMillion: 2,
    outputCostPerMillion: 10,
  },
  {
    id: 'google/gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    provider: 'Google',
    description: 'Optimized version of Gemini Flash for faster processing.',
    tier: 'pro',
    contextWindow: 1_050_000,
    inputCostPerMillion: 0.5,
    outputCostPerMillion: 2.5,
  },
  {
    id: 'openai/gpt-4o-2024-05-13',
    name: 'GPT-4o (2024-05-13)',
    provider: 'OpenAI',
    description:
      'Omni model with multimodal capabilities and strong performance.',
    tier: 'pro',
    contextWindow: 128_000,
    inputCostPerMillion: 5,
    outputCostPerMillion: 15,
  },
  {
    id: 'openai/gpt-4o-mini-search-preview',
    name: 'GPT-4o Mini Search Preview',
    provider: 'OpenAI',
    description: 'Compact model with search enhancement capabilities.',
    tier: 'pro',
    contextWindow: 128_000,
    inputCostPerMillion: 0.2,
    outputCostPerMillion: 0.8,
  },
  {
    id: 'openai/gpt-4o-mini-2024-07-18',
    name: 'GPT-4o Mini (2024-07-18)',
    provider: 'OpenAI',
    description: 'Efficient mini model for cost-effective quality generation.',
    tier: 'pro',
    contextWindow: 128_000,
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.6,
  },
];

/**
 * Get a model by its OpenRouter ID.
 *
 * @param id - The OpenRouter model ID (e.g., 'google/gemini-1.5-flash')
 * @returns The model metadata or undefined if not found
 */
export function getModelById(id: string): AvailableModel | undefined {
  return AVAILABLE_MODELS.find((model) => model.id === id);
}

/**
 * Get all models available for a given subscription tier.
 * Free and starter users get free models only.
 * Pro users get all models.
 *
 * @param tier - The user's subscription tier
 * @returns Array of models available to this tier
 */
export function getModelsForTier(tier: SubscriptionTier): AvailableModel[] {
  if (tier === 'pro') {
    return AVAILABLE_MODELS;
  }
  // Free and starter tiers only get free models
  return AVAILABLE_MODELS.filter((model) => model.tier === 'free');
}

/**
 * Check if a model ID is valid (exists in AVAILABLE_MODELS).
 *
 * @param id - The model ID to validate
 * @returns True if the model ID is valid
 */
export function isValidModelId(id: string): boolean {
  return AVAILABLE_MODELS.some((model) => model.id === id);
}

/**
 * Get the default model for a user's subscription tier.
 * Falls back to DEFAULT_MODEL if no tier-appropriate model is found.
 *
 * @param tier - The user's subscription tier
 * @returns The recommended default model ID for this tier
 */
export function getDefaultModelForTier(tier: SubscriptionTier): string {
  const availableModels = getModelsForTier(tier);
  return availableModels.length > 0 ? availableModels[0].id : AI_DEFAULT_MODEL;
}
