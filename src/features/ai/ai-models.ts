import type { AvailableModel } from './types/model.types';
import type { ModelOperation } from '@/features/ai/model-operation-policy';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  FREE_ROUTER_MODEL,
  getTierModels,
} from '@/features/ai/model-catalog/catalog';
import {
  getGroundedOperationPolicy,
  getModelOperationPolicy,
  PICKER_HIDDEN_MODEL_IDS_BY_TIER,
} from '@/features/ai/model-operation-policy';
import { logger } from '@/lib/logging/logger';
import { AI_DEFAULT_MODEL } from '@/shared/constants/ai-models';

export { AI_DEFAULT_MODEL };

type TierModels = {
  readonly models: AvailableModel[];
  readonly defaultModelId: string;
  readonly freeRouterFallback: boolean;
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
    return {
      models: [],
      defaultModelId: policy.defaultModelId,
      freeRouterFallback: false,
    };
  }
  const hiddenModelIds: readonly string[] =
    PICKER_HIDDEN_MODEL_IDS_BY_TIER[tier];
  const models = [
    ...(policy.usesFreeRouter ? [FREE_ROUTER_MODEL] : []),
    ...(policy.usesTierCatalog
      ? (await getTierModels(tier)).filter(
          (model) => !hiddenModelIds.includes(model.id),
        )
      : []),
  ];
  const isListed = (modelId: string) =>
    models.some((model) => model.id === modelId);
  if (isListed(policy.defaultModelId)) {
    return {
      models,
      defaultModelId: policy.defaultModelId,
      freeRouterFallback: false,
    };
  }

  const fallbackModelId = getDefaultFallbackModelIds(tier, operation).find(
    isListed,
  );
  const fields = {
    tier,
    operation,
    defaultModelId: policy.defaultModelId,
    fallbackModelId,
    modelIds: models.map((model) => model.id),
    event: 'model_default_not_in_guardrail',
  };
  if (fallbackModelId) {
    logger.warn(
      fields,
      'Operation default model is missing from the tier guardrail models; using its fallback',
    );
    return {
      models,
      defaultModelId: fallbackModelId,
      freeRouterFallback: false,
    };
  }
  logger.error(
    { ...fields, fallbackModelId: AI_DEFAULT_MODEL },
    'Operation default model and its fallbacks are missing from the tier guardrail models; using the free router',
  );
  return {
    models: isListed(AI_DEFAULT_MODEL)
      ? models
      : [FREE_ROUTER_MODEL, ...models],
    defaultModelId: AI_DEFAULT_MODEL,
    freeRouterFallback: true,
  };
}

/**
 * Models allowed for a subscription tier and generation operation. Includes
 * the free router when it is the last-resort default (see
 * {@link getDefaultModelForTier}).
 */
export async function getModelsForTier(
  tier: SubscriptionTier,
  operation: ModelOperation,
): Promise<AvailableModel[]> {
  return (await resolveTierModels(tier, operation)).models;
}

export async function getDefaultModelForTier(
  tier: SubscriptionTier,
  operation: ModelOperation,
): Promise<string> {
  return (await resolveTierModels(tier, operation)).defaultModelId;
}

export async function resolveDefaultModelForTier(
  tier: SubscriptionTier,
  operation: ModelOperation,
): Promise<{
  modelId: string;
  freeRouterFallback: boolean;
  models: AvailableModel[];
}> {
  const { defaultModelId, freeRouterFallback, models } =
    await resolveTierModels(tier, operation);
  return { modelId: defaultModelId, freeRouterFallback, models };
}

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
