/**
 * Unified model/tier resolution for all generation entry points.
 *
 * Every route that kicks off plan generation (stream, retry, etc.) MUST use
 * `resolveModelForTier` so tier-gating logic lives in exactly one place.
 *
 */

import {
  getDefaultModelForTier,
  getModelsForTier,
  isValidModelId,
} from '@/features/ai/ai-models';
import { ModelResolutionError } from '@/features/ai/model-resolution-error';
import { getGenerationProviderWithModel } from '@/features/ai/providers/factory';
import { logger } from '@/lib/logging/logger';

import type { SubscriptionTier } from '@/features/ai/types/model.types';
import type { AiPlanGenerationProvider } from '@/features/ai/types/provider.types';

export type ModelResolution = {
  modelId: string;
  provider: AiPlanGenerationProvider;
  fallback: boolean;
  fallbackReason?: 'invalid_model' | 'tier_denied' | 'not_specified';
};

type ModelValidationResult =
  | { valid: true }
  | { valid: false; reason: 'invalid_model' | 'tier_denied' };

type ProviderGetter = typeof getGenerationProviderWithModel;

type ModelResolverLogger = {
  error(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
};

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
    const factoryName = providerGetter.name || 'unknownFactory';
    const errPayload =
      err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : { message: String(err) };
    requestLogger.error(
      {
        err: errPayload,
        requestedModel: requestedModel ?? 'default',
        factory: factoryName,
      },
      'Provider factory failed'
    );
    throw new ModelResolutionError('Provider initialization failed.', {
      code: 'PROVIDER_INIT_FAILED',
      ...(err instanceof Error ? {} : { details: { message: String(err) } }),
      ...(err instanceof Error ? { cause: err } : {}),
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
 * @param providerGetter - Optional provider getter for dependency injection in tests.
 *   Defaults to getGenerationProviderWithModel.
 * @param requestLogger - Optional logger injection for tests/callers that need log isolation.
 * @returns ModelResolution with the resolved provider and metadata
 */
export function resolveModelForTier(
  userTier: SubscriptionTier,
  requestedModel?: string | null,
  providerGetter: ProviderGetter = getGenerationProviderWithModel,
  requestLogger: ModelResolverLogger = logger
): ModelResolution {
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
