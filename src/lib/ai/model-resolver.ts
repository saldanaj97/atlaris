/**
 * Unified model/tier resolution for all generation entry points.
 *
 * Every route that kicks off plan generation (stream, retry, etc.) MUST use
 * `resolveModelForTier` so tier-gating logic lives in exactly one place.
 *
 * @module lib/ai/model-resolver
 */

import {
  getDefaultModelForTier,
  getModelsForTier,
  isValidModelId,
} from '@/lib/ai/ai-models';
import * as providerFactory from '@/lib/ai/provider-factory';
import type { SubscriptionTier } from '@/lib/ai/types/model.types';
import type { AiPlanGenerationProvider } from '@/lib/ai/types/provider.types';
import { AppError } from '@/lib/api/errors';
import { logger, type Logger } from '@/lib/logging/logger';

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

export type ModelValidationResult =
  | { valid: true }
  | { valid: false; reason: 'invalid_model' | 'tier_denied' };

export type ModelResolverLogger = Pick<Logger, 'warn' | 'info' | 'error'>;
export type ProviderGetter =
  typeof providerFactory.getGenerationProviderWithModel;

function isModelResolverLogger(
  candidate: ModelResolverLogger | ProviderGetter
): candidate is ModelResolverLogger {
  return typeof candidate !== 'function';
}

/**
 * Validates whether a requested model is both known and allowed for a tier.
 */
export function validateModelForTier(
  userTier: SubscriptionTier,
  requestedModel: string
): ModelValidationResult {
  if (!isValidModelId(requestedModel)) {
    return { valid: false, reason: 'invalid_model' };
  }

  const allowedModels = getModelsForTier(userTier);
  const isAllowed = allowedModels.some((model) => model.id === requestedModel);

  if (!isAllowed) {
    return { valid: false, reason: 'tier_denied' };
  }

  return { valid: true };
}

/**
 * Wraps provider factory calls in try/catch. Logs and rethrows with contextual
 * details (requestedModel, which factory failed) for centralized error surfaces.
 */
function getProviderSafe(
  modelIdToUse: string,
  requestedModel: string | undefined | null,
  providerGetter: ProviderGetter,
  requestLogger: ModelResolverLogger
): AiPlanGenerationProvider {
  try {
    // Always use the model-specific provider factory so default-model fallback
    // cannot be silently redirected by aiEnv.defaultModel.
    return providerGetter(modelIdToUse);
  } catch (err) {
    requestLogger.error(
      {
        err,
        requestedModel: requestedModel ?? 'default',
        factory: 'getGenerationProviderWithModel',
      },
      'Provider factory failed'
    );
    throw new AppError('Provider initialization failed.', {
      status: 500,
      code: 'PROVIDER_INIT_FAILED',
      details: err instanceof Error ? { cause: err } : { message: String(err) },
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
 * @param requestLoggerOrProviderGetter - Optional logger injection for tests/callers that need
 *   log isolation. Backward-compatible: also accepts provider getter as 3rd arg.
 * @param providerGetterArg - Optional provider getter; used when logger is passed as 3rd arg.
 * @returns ModelResolution with the resolved provider and metadata
 */
export function resolveModelForTier(
  userTier: SubscriptionTier,
  requestedModel?: string | null,
  requestLoggerOrProviderGetter: ModelResolverLogger | ProviderGetter = logger,
  providerGetterArg?: ProviderGetter
): ModelResolution {
  const requestLogger = isModelResolverLogger(requestLoggerOrProviderGetter)
    ? requestLoggerOrProviderGetter
    : logger;
  const providerGetter = isModelResolverLogger(requestLoggerOrProviderGetter)
    ? (providerGetterArg ?? providerFactory.getGenerationProviderWithModel)
    : requestLoggerOrProviderGetter;

  const defaultModelForTier = getDefaultModelForTier(userTier);

  // Explicitly omitted (undefined) → not_specified; null/empty → invalid_model
  const modelSpecified = requestedModel !== undefined;

  if (!modelSpecified) {
    return {
      modelId: defaultModelForTier,
      provider: getProviderSafe(
        defaultModelForTier,
        requestedModel,
        providerGetter,
        requestLogger
      ),
      fallback: true,
      fallbackReason: 'not_specified',
    };
  }

  // Explicit null or empty string → invalid_model
  if (requestedModel === null || requestedModel === '') {
    requestLogger.warn(
      { requestedModel, userTier },
      'Invalid model requested, falling back to default'
    );
    return {
      modelId: defaultModelForTier,
      provider: getProviderSafe(
        defaultModelForTier,
        requestedModel,
        providerGetter,
        requestLogger
      ),
      fallback: true,
      fallbackReason: 'invalid_model',
    };
  }

  // Check if model ID is valid
  const validation = validateModelForTier(userTier, requestedModel);

  if (!validation.valid) {
    requestLogger.warn(
      { requestedModel, userTier, reason: validation.reason },
      'Invalid or tier-denied model, falling back to default'
    );
    return {
      modelId: defaultModelForTier,
      provider: getProviderSafe(
        defaultModelForTier,
        requestedModel,
        providerGetter,
        requestLogger
      ),
      fallback: true,
      fallbackReason: validation.reason,
    };
  }

  // Model is valid and allowed
  return {
    modelId: requestedModel,
    provider: getProviderSafe(
      requestedModel,
      requestedModel,
      providerGetter,
      requestLogger
    ),
    fallback: false,
  };
}
