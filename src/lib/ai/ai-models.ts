/**
 * OpenRouter AI Model Configuration
 *
 * This module defines all available OpenRouter models with metadata for UI display
 * and tier-gating. Models are categorized by subscription tier (free/pro) and include
 * technical specifications for context windows and token limits.
 *
 * @module lib/ai/ai-models
 */
import type { AvailableModel, SubscriptionTier } from './types';

/**
 * Fallback default model used when no user preference is specified.
 *
 * Note: this file is imported by client components (e.g. model selector UI),
 * so it must remain free of server-only env access.
 */
export const AI_DEFAULT_MODEL = 'google/gemini-2.0-flash-exp:free';

// (kept for backward compatibility) AI_DEFAULT_MODEL is defined above.

/**
 * Complete list of available OpenRouter models.
 * Models are listed in order of recommendation within their tier.
 */
export const AVAILABLE_MODELS = [
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
    id: 'openai/gpt-oss-20b:free',
    name: 'gpt-oss-20b',
    provider: 'OpenAI',
    description: 'Open-source style model for general-purpose tasks.',
    tier: 'free',
    contextWindow: 131_000,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
  },
  {
    id: 'alibaba/tongyi-deepresearch-30b-a3b:free',
    name: 'Tongyi DeepResearch 30B A3B',
    provider: 'Alibaba',
    description: 'Research-focused model with strong analytical capabilities.',
    tier: 'free',
    contextWindow: 131_000,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
  },
  {
    id: 'anthropic/claude-haiku-4.5',
    name: 'Claude Haiku 4.5',
    provider: 'Anthropic',
    description:
      'Fast and efficient model from Anthropic with strong reasoning capabilities.',
    tier: 'free',
    contextWindow: 200_000,
    inputCostPerMillion: 1,
    outputCostPerMillion: 5,
  },

  // Pro tier models - require paid subscription
  {
    id: 'google/gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    provider: 'Google',
    description: 'Optimized version of Gemini Flash for faster processing.',
    tier: 'pro',
    contextWindow: 1_050_000,
    inputCostPerMillion: 0.1,
    outputCostPerMillion: 0.4,
  },
  {
    id: 'google/gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview',
    provider: 'Google',
    description:
      'Next-generation flash model with improved speed and intelligence.',
    tier: 'pro',
    contextWindow: 1_050_000,
    inputCostPerMillion: 0.5,
    outputCostPerMillion: 1,
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
    outputCostPerMillion: 12,
  },
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
    id: 'openai/gpt-4o-mini-2024-07-18',
    name: 'GPT-4o-mini 2024-07-18',
    provider: 'OpenAI',
    description: 'Efficient mini model for cost-effective quality generation.',
    tier: 'pro',
    contextWindow: 128_000,
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.6,
  },
  {
    id: 'openai/gpt-4o-mini-search-preview',
    name: 'GPT-4o-mini Search Preview',
    provider: 'OpenAI',
    description: 'Compact model with search enhancement capabilities.',
    tier: 'pro',
    contextWindow: 128_000,
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.6,
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    description:
      'High-performance omni model for complex reasoning and multimodal tasks.',
    tier: 'pro',
    contextWindow: 128_000,
    inputCostPerMillion: 2.5,
    outputCostPerMillion: 10,
  },
  {
    id: 'openai/gpt-5.1',
    name: 'GPT-5.1',
    provider: 'OpenAI',
    description:
      'Advanced GPT model with strong performance across diverse tasks.',
    tier: 'pro',
    contextWindow: 400_000,
    inputCostPerMillion: 1.25,
    outputCostPerMillion: 10,
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
] satisfies AvailableModel[];

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
