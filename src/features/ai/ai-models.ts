import type { AvailableModel } from './types/model.types';
import type { ModelOperation } from '@/features/ai/model-operation-policy';
import type { SubscriptionTier } from '@/shared/types/billing.types';

/**
 * OpenRouter AI Model Configuration
 *
 * This module defines all available OpenRouter models with metadata for UI display
 * and tier-gating. Operation catalogs and defaults live in
 * `model-operation-policy.ts`; catalog `tier` labels are not proof of zero cost.
 *
 * @module lib/ai/ai-models
 */
import { getModelOperationPolicy } from '@/features/ai/model-operation-policy';
import { AI_DEFAULT_MODEL, isValidModelId } from '@/shared/constants/ai-models';

export { AI_DEFAULT_MODEL, isValidModelId };

/**
 * Complete list of available OpenRouter models.
 * Models are listed in order of recommendation within their tier.
 */
export const AVAILABLE_MODELS = [
  // Free tier models - accessible to all users
  {
    id: 'openrouter/free',
    name: 'Free Models Router',
    provider: 'OpenRouter',
    description:
      'Routes each request to a compatible free OpenRouter model. Zero cost, but the exact backend and output limits vary by request.',
    tier: 'free',
    contextWindow: 200_000,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
  },
  {
    id: 'google/gemini-2.0-flash-exp:free',
    name: 'Gemini 2.0 Flash',
    provider: 'Google',
    description:
      'Fast free Gemini option with a 1M-token context window for large prompts and reference material.',
    tier: 'free',
    contextWindow: 1_048_576,
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
    maxOutputTokens: 65_500,
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
    maxOutputTokens: 65_500,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
  },

  // Pro-labelled catalog models. Catalog `tier` is not proof of zero cost.
  {
    id: 'anthropic/claude-haiku-4.5',
    name: 'Claude Haiku 4.5',
    provider: 'Anthropic',
    description:
      'Fast and efficient model from Anthropic with strong reasoning capabilities.',
    tier: 'pro',
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    inputCostPerMillion: 1,
    outputCostPerMillion: 5,
  },
  {
    id: 'google/gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    provider: 'Google',
    description: 'Optimized version of Gemini Flash for faster processing.',
    tier: 'pro',
    contextWindow: 1_050_000,
    maxOutputTokens: 525_000,
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
    maxOutputTokens: 525_000,
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
    maxOutputTokens: 525_000,
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
    maxOutputTokens: 500_000,
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
    maxOutputTokens: 64_000,
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
    maxOutputTokens: 64_000,
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
    maxOutputTokens: 64_000,
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
    maxOutputTokens: 200_000,
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
    maxOutputTokens: 200_000,
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
 * Get models allowed for a subscription tier and generation operation.
 */
export function getModelsForTier(
  tier: SubscriptionTier,
  operation: ModelOperation,
): AvailableModel[] {
  const policy = getModelOperationPolicy(tier, operation);
  if (policy.modelIds === 'full') {
    return AVAILABLE_MODELS;
  }

  return policy.modelIds.map((id) => {
    const model = getModelById(id);
    if (!model) {
      throw new Error(`Operation policy references unknown model "${id}"`);
    }
    return model;
  });
}

/**
 * Get the default model for a subscription tier and generation operation.
 */
export function getDefaultModelForTier(
  tier: SubscriptionTier,
  operation: ModelOperation,
): string {
  return getModelOperationPolicy(tier, operation).defaultModelId;
}

/**
 * Returns the ordered provider fallback route for a resolved primary model.
 *
 * Free never falls back to a paid model. Starter outline/regen never falls
 * back to `openrouter/free`. Starter/Free lesson uses the free router with
 * no paid fallback. Pro keeps an empty provider fallback list.
 */
export function getFallbackModelsForTier(
  tier: SubscriptionTier,
  primaryModelId: string,
  operation: ModelOperation,
): string[] {
  const policy = getModelOperationPolicy(tier, operation);
  if (!policy.allowed || tier === 'pro') {
    return [];
  }

  switch (operation) {
    case 'lesson':
      return primaryModelId === AI_DEFAULT_MODEL ? [] : [AI_DEFAULT_MODEL];
    case 'initial_outline':
    case 'regeneration':
      return [];
    default: {
      const _never: never = operation;
      throw new Error(`Unhandled model operation: ${String(_never)}`);
    }
  }
}
