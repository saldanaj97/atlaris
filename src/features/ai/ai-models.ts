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
import {
  getGroundedOperationPolicy,
  getModelOperationPolicy,
} from '@/features/ai/model-operation-policy';
import { ModelResolutionError } from '@/features/ai/model-resolution-error';
import { logger } from '@/lib/logging/logger';
import { AI_DEFAULT_MODEL } from '@/shared/constants/ai-models';

export { AI_DEFAULT_MODEL };

type TierModels = {
  readonly models: AvailableModel[];
  /** The operation default, or its first allowed fallback. */
  readonly defaultModelId: string;
};

/**
 * The operation's code-listed fallbacks for a default the guardrail dropped:
 * its grounded writer route (`GROUNDED_MODELS_BY_TIER`), in order.
 */
function getDefaultFallbackModelIds(
  tier: SubscriptionTier,
  operation: ModelOperation,
): string[] {
  const grounded = getGroundedOperationPolicy(tier, operation);
  return grounded.allowed ? grounded.models.map((model) => model.modelId) : [];
}

async function resolveTierModels(
  tier: SubscriptionTier,
  operation: ModelOperation,
): Promise<TierModels> {
  const policy = getModelOperationPolicy(tier, operation);
  if (!policy.allowed) {
    return { models: [], defaultModelId: policy.defaultModelId };
  }
  const models = [
    ...(policy.usesFreeRouter ? [FREE_ROUTER_MODEL] : []),
    ...(policy.usesTierCatalog ? await getTierModels(tier) : []),
  ];
  const isListed = (modelId: string) =>
    models.some((model) => model.id === modelId);
  if (isListed(policy.defaultModelId)) {
    return { models, defaultModelId: policy.defaultModelId };
  }

  const fallbackModelId = getDefaultFallbackModelIds(tier, operation).find(
    isListed,
  );
  const fields = {
    tier,
    operation,
    defaultModelId: policy.defaultModelId,
    fallbackModelId: fallbackModelId ?? null,
    modelIds: models.map((model) => model.id),
    event: 'model_default_not_in_guardrail',
  };
  if (fallbackModelId) {
    logger.warn(
      fields,
      'Operation default model is missing from the tier guardrail models; using its fallback',
    );
    return { models, defaultModelId: fallbackModelId };
  }
  logger.error(
    fields,
    'Operation default model and its fallbacks are missing from the tier guardrail models',
  );
  throw new ModelResolutionError(
    `Default model "${policy.defaultModelId}" and its fallbacks are not available for ${tier} ${operation}.`,
    { code: 'DEFAULT_MODEL_UNAVAILABLE' },
  );
}

/**
 * Models allowed for a subscription tier and generation operation. Throws
 * when neither the operation's code-owned default nor any of its code-listed
 * fallbacks is among them (see {@link getDefaultModelForTier}).
 */
export async function getModelsForTier(
  tier: SubscriptionTier,
  operation: ModelOperation,
): Promise<AvailableModel[]> {
  return (await resolveTierModels(tier, operation)).models;
}

/**
 * The default model for a subscription tier and generation operation: the
 * code-owned default while the tier's guardrail lists it, otherwise the first
 * listed model on the operation's grounded writer route. Throws when none is
 * listed.
 */
export async function getDefaultModelForTier(
  tier: SubscriptionTier,
  operation: ModelOperation,
): Promise<string> {
  return (await resolveTierModels(tier, operation)).defaultModelId;
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
