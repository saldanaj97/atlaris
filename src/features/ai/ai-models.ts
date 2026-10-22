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

  // Pro-labelled catalog models. Catalog `tier` is not proof of zero cost.
  {
    id: 'openai/gpt-6-luna',
    name: 'GPT-6 Luna',
    provider: 'OpenAI',
    description: 'Fast, low-cost OpenAI model for everyday plan generation.',
    tier: 'pro',
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
    inputCostPerMillion: 0.1,
    outputCostPerMillion: 0.5,
  },
  {
    id: 'anthropic/claude-haiku-5.5',
    name: 'Claude Haiku 5.5',
    provider: 'Anthropic',
    description:
      'Fast and efficient model from Anthropic with strong reasoning capabilities.',
    tier: 'pro',
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    inputCostPerMillion: 0.1,
    outputCostPerMillion: 0.5,
  },
  {
    id: 'deepseek/deepseek-v4.1-flash',
    name: 'DeepSeek V4.1 Flash',
    provider: 'DeepSeek',
    description: 'Low-cost DeepSeek flash model with a very large context.',
    tier: 'pro',
    contextWindow: 1_048_576,
    maxOutputTokens: 943_718,
    inputCostPerMillion: 0.3,
    outputCostPerMillion: 1.2,
  },
  {
    id: 'openai/gpt-6.1-sol',
    name: 'GPT-6.1 Sol',
    provider: 'OpenAI',
    description:
      'Latest frontier OpenAI model for complex, multi-step planning.',
    tier: 'pro',
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
    inputCostPerMillion: 2,
    outputCostPerMillion: 10,
  },
  {
    id: 'openai/gpt-6-sol',
    name: 'GPT-6 Sol',
    provider: 'OpenAI',
    description:
      'Frontier OpenAI model with strong performance across diverse tasks.',
    tier: 'pro',
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
    inputCostPerMillion: 2,
    outputCostPerMillion: 10,
  },
  {
    id: 'anthropic/claude-sonnet-5.5',
    name: 'Claude Sonnet 5.5',
    provider: 'Anthropic',
    description:
      'Premium model with exceptional reasoning and nuanced understanding.',
    tier: 'pro',
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    inputCostPerMillion: 2,
    outputCostPerMillion: 10,
  },
  {
    id: 'anthropic/claude-opus-5.5',
    name: 'Claude Opus 5.5',
    provider: 'Anthropic',
    description:
      'Most capable Anthropic model for the hardest reasoning tasks.',
    tier: 'pro',
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    inputCostPerMillion: 4,
    outputCostPerMillion: 20,
  },
] satisfies AvailableModel[];

/**
 * Get a model by its OpenRouter ID.
 *
 * @param id - The OpenRouter model ID (e.g., 'openai/gpt-6-luna')
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
