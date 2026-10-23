/**
 * Unified model/tier resolution for all generation entry points.
 *
 * Every route that kicks off plan generation (stream, retry, etc.) MUST use
 * `resolveModelForTier` so tier-gating logic lives in exactly one place.
 *
 */

import type { ModelOperation } from '@/features/ai/model-operation-policy';
import type { AvailableModel } from '@/features/ai/types/model.types';
import type { AiPlanGenerationProvider } from '@/features/ai/types/provider.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  getModelsForTier,
  resolveDefaultModelForTier,
} from '@/features/ai/ai-models';
import { getCatalogModel } from '@/features/ai/model-catalog/catalog';
import { ModelResolutionError } from '@/features/ai/model-resolution-error';
import { getGenerationProviderWithModel } from '@/features/ai/providers/factory';
import { type Logger, logger } from '@/lib/logging/logger';
import * as Sentry from '@sentry/nextjs';

export type ModelResolution = {
  modelId: string;
  provider: AiPlanGenerationProvider;
  fallback: boolean;
  fallbackReason?: 'invalid_model' | 'tier_denied' | 'not_specified';
  /** The operation default ran on the free router because the tier's guardrail left no paid default. */
  freeRouterFallback?: true;
};

type ModelValidationResult =
  | { valid: true }
  | { valid: false; reason: 'invalid_model' | 'tier_denied' };

type ProviderGetter = typeof getGenerationProviderWithModel;

type ModelResolverLogger = {
  error: Logger['error'];
  warn: Logger['warn'];
  info: Logger['info'];
};

/**
 * Validates whether a requested model is allowed for a tier × operation:
 * `tier_denied` when another tier's guardrail lists it, `invalid_model` when
 * none does. Throws only when the default check or catalog read fails.
 * Pass `allowedModels` when the caller already resolved the tier's models.
 */
export async function validateModelForTier(
  userTier: SubscriptionTier,
  requestedModel: string,
  operation: ModelOperation,
  allowedModels?: readonly AvailableModel[],
): Promise<ModelValidationResult> {
  allowedModels ??= await getModelsForTier(userTier, operation);
  if (allowedModels.some((model) => model.id === requestedModel)) {
    return { valid: true };
  }
  return (await getCatalogModel(requestedModel))
    ? { valid: false, reason: 'tier_denied' }
    : { valid: false, reason: 'invalid_model' };
}

/**
 * Wraps provider factory calls in try/catch. Logs and rethrows with contextual
 * details (requestedModel, which factory failed) for centralized error surfaces.
 */
function getProviderSafe(
  modelIdToUse: string,
  requestedModel: string | undefined | null,
  userTier: SubscriptionTier,
  operation: ModelOperation,
  providerGetter: ProviderGetter,
  requestLogger: ModelResolverLogger,
): AiPlanGenerationProvider {
  try {
    // Always use the model-specific provider factory so default-model fallback
    // cannot be silently redirected by aiEnv.defaultModel.
    return providerGetter(modelIdToUse, userTier, operation);
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
      'Provider factory failed',
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
 * @param operation - Generation operation whose catalog and default apply.
 * @param providerGetter - Optional provider getter for dependency injection in tests.
 *   Defaults to getGenerationProviderWithModel.
 * @param requestLogger - Optional logger injection for tests/callers that need log isolation.
 * @returns ModelResolution with the resolved provider and metadata
 */
export async function resolveModelForTier(
  userTier: SubscriptionTier,
  requestedModel: string | null | undefined,
  operation: ModelOperation,
  providerGetter: ProviderGetter = getGenerationProviderWithModel,
  requestLogger: ModelResolverLogger = logger,
): Promise<ModelResolution> {
  const tierDefault = await resolveDefaultModelForTier(userTier, operation);
  const defaultModelForTier = tierDefault.modelId;
  // Alert once per generation that runs on the free-router fallback, not on
  // every model lookup (settings, validation).
  const defaultResolution = (
    fallbackReason: NonNullable<ModelResolution['fallbackReason']>,
  ): ModelResolution => {
    const resolution: ModelResolution = {
      modelId: defaultModelForTier,
      provider: getProviderSafe(
        defaultModelForTier,
        requestedModel,
        userTier,
        operation,
        providerGetter,
        requestLogger,
      ),
      fallback: true,
      fallbackReason,
    };
    if (!tierDefault.freeRouterFallback) {
      return resolution;
    }
    Sentry.captureMessage(
      'Generation fell back to the free router: the tier guardrail lists no paid default',
      {
        level: 'error',
        fingerprint: ['model_free_router_fallback', userTier, operation],
        tags: {
          event: 'model_free_router_fallback',
          tier: userTier,
          operation,
        },
      },
    );
    return { ...resolution, freeRouterFallback: true };
  };

  // Explicitly omitted (undefined) → not_specified; null/empty → invalid_model
  const modelSpecified = requestedModel !== undefined;

  if (!modelSpecified) {
    return defaultResolution('not_specified');
  }

  // Explicit null or empty string → invalid_model
  if (requestedModel === null || requestedModel === '') {
    requestLogger.warn(
      { requestedModel, userTier, operation },
      'Invalid model requested, falling back to default',
    );
    return defaultResolution('invalid_model');
  }

  const validation = await validateModelForTier(
    userTier,
    requestedModel,
    operation,
    tierDefault.models,
  );

  if (!validation.valid) {
    requestLogger.warn(
      { requestedModel, userTier, operation, reason: validation.reason },
      'Invalid or tier-denied model, falling back to default',
    );
    return defaultResolution(validation.reason);
  }

  return {
    modelId: requestedModel,
    provider: getProviderSafe(
      requestedModel,
      requestedModel,
      userTier,
      operation,
      providerGetter,
      requestLogger,
    ),
    fallback: false,
  };
}
