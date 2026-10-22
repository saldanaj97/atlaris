import type { AvailableModel } from './types/model.types';
import type { ModelOperation } from '@/features/ai/model-operation-policy';
import type { SubscriptionTier } from '@/shared/types/billing.types';

/**
 * The models each tier × operation offers: its tier's OpenRouter guardrail
 * list (`model-catalog`) and/or the `openrouter/free` router, per
 * `model-operation-policy.ts`. Catalog `tier` labels are not proof of zero cost.
 *
 * @module lib/ai/ai-models
 */
import {
  FREE_ROUTER_MODEL,
  getTierModels,
} from '@/features/ai/model-catalog/catalog';
import { getModelOperationPolicy } from '@/features/ai/model-operation-policy';
import { ModelResolutionError } from '@/features/ai/model-resolution-error';
import { logger } from '@/lib/logging/logger';
import { AI_DEFAULT_MODEL } from '@/shared/constants/ai-models';

export { AI_DEFAULT_MODEL };

/**
 * Models allowed for a subscription tier and generation operation. Throws
 * when the operation's code-owned default is not among them (for example,
 * the guardrail dropped it): resolution must not quietly pick another model.
 */
export async function getModelsForTier(
  tier: SubscriptionTier,
  operation: ModelOperation,
): Promise<AvailableModel[]> {
  const policy = getModelOperationPolicy(tier, operation);
  if (!policy.allowed) {
    return [];
  }
  const models = [
    ...(policy.usesFreeRouter ? [FREE_ROUTER_MODEL] : []),
    ...(policy.usesTierCatalog ? await getTierModels(tier) : []),
  ];
  if (!models.some((model) => model.id === policy.defaultModelId)) {
    logger.error(
      {
        tier,
        operation,
        defaultModelId: policy.defaultModelId,
        modelIds: models.map((model) => model.id),
        event: 'model_default_not_in_guardrail',
      },
      'Operation default model is missing from the tier guardrail models',
    );
    throw new ModelResolutionError(
      `Default model "${policy.defaultModelId}" is not available for ${tier} ${operation}.`,
      { code: 'DEFAULT_MODEL_UNAVAILABLE' },
    );
  }
  return models;
}

/**
 * The default model for a subscription tier and generation operation, after
 * checking it is still in the tier's models (see {@link getModelsForTier}).
 */
export async function getDefaultModelForTier(
  tier: SubscriptionTier,
  operation: ModelOperation,
): Promise<string> {
  await getModelsForTier(tier, operation);
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
