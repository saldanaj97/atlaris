/**
 * Unified model/tier resolution for all generation entry points.
 *
 * Every route that kicks off plan generation (stream, retry, etc.) MUST use
 * `resolveModelForTier` so tier-gating logic lives in exactly one place.
 *
 * @module lib/ai/model-resolver
 */

import { AppError } from '@/lib/api/errors';
import {
  AI_DEFAULT_MODEL,
  getModelsForTier,
  isValidModelId,
} from '@/lib/ai/ai-models';
import {
  getGenerationProvider,
  getGenerationProviderWithModel,
} from '@/lib/ai/provider-factory';
import type { SubscriptionTier } from '@/lib/ai/types/model.types';
import type { AiPlanGenerationProvider } from '@/lib/ai/types/provider.types';
import { logger } from '@/lib/logging/logger';

export interface ModelResolution {
  /** The model ID that was resolved (always valid and tier-allowed) */
  modelId: string;
  /** The provider instance configured for this model */
  provider: AiPlanGenerationProvider;
  /** Whether the requested model was denied and fell back to default */
  fallback: boolean;
  /** If fallback occurred, the reason */
  fallbackReason?: 'invalid_model' | 'tier_denied' | 'not_specified';
}

/**
 * Wraps provider factory calls in try/catch. Logs and rethrows with contextual
 * details (requestedModel, which factory failed) for centralized error surfaces.
 */
function getProviderSafe(
  modelIdToUse: string,
  requestedModel: string | undefined | null
): AiPlanGenerationProvider {
  const useCustomModel = modelIdToUse !== AI_DEFAULT_MODEL;
  const factory = useCustomModel
    ? 'getGenerationProviderWithModel'
    : 'getGenerationProvider';

  try {
    return useCustomModel
      ? getGenerationProviderWithModel(modelIdToUse)
      : getGenerationProvider();
  } catch (err) {
    logger.error(
      { err, requestedModel: requestedModel ?? 'default', factory },
      'Provider factory failed'
    );
    throw new AppError('Provider initialization failed.', {
      status: 500,
      code: 'PROVIDER_INIT_FAILED',
      details: err instanceof Error ? { cause: err } : undefined,
    });
  }
}

/**
 * Resolves the generation provider and model for a given user tier and optional model override.
 * All generation entry points (stream, retry, default) MUST use this function.
 *
 * @param userTier - The user's subscription tier
 * @param requestedModel - Optional model ID from request. Pass undefined when param absent
 *   (not_specified fallback). Null/empty string means invalid_model fallback.
 * @returns ModelResolution with the resolved provider and metadata
 */
export function resolveModelForTier(
  userTier: SubscriptionTier,
  requestedModel?: string | null
): ModelResolution {
  // Explicitly omitted (undefined) → not_specified; null/empty → invalid_model
  const modelSpecified = requestedModel !== undefined;

  if (!modelSpecified) {
    return {
      modelId: AI_DEFAULT_MODEL,
      provider: getProviderSafe(AI_DEFAULT_MODEL, requestedModel),
      fallback: true,
      fallbackReason: 'not_specified',
    };
  }

  // Explicit null or empty string → invalid_model
  if (requestedModel === null || requestedModel === '') {
    logger.warn(
      { requestedModel, userTier },
      'Invalid model requested, falling back to default'
    );
    return {
      modelId: AI_DEFAULT_MODEL,
      provider: getProviderSafe(AI_DEFAULT_MODEL, requestedModel),
      fallback: true,
      fallbackReason: 'invalid_model',
    };
  }

  // Check if model ID is valid
  if (!isValidModelId(requestedModel)) {
    logger.warn(
      { requestedModel, userTier },
      'Invalid model requested, falling back to default'
    );
    return {
      modelId: AI_DEFAULT_MODEL,
      provider: getProviderSafe(AI_DEFAULT_MODEL, requestedModel),
      fallback: true,
      fallbackReason: 'invalid_model',
    };
  }

  // Check if model is allowed for user's tier
  const allowedModels = getModelsForTier(userTier);
  const isAllowed = allowedModels.some((m) => m.id === requestedModel);

  if (!isAllowed) {
    logger.warn(
      { requestedModel, userTier },
      'Model not allowed for tier, falling back to default'
    );
    return {
      modelId: AI_DEFAULT_MODEL,
      provider: getProviderSafe(AI_DEFAULT_MODEL, requestedModel),
      fallback: true,
      fallbackReason: 'tier_denied',
    };
  }

  // Model is valid and allowed
  return {
    modelId: requestedModel,
    provider: getProviderSafe(requestedModel, requestedModel),
    fallback: false,
  };
}
