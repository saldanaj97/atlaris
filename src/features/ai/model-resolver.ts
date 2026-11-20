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

  const modelSpecified = requestedModel !== undefined;

  if (!modelSpecified) {
    return defaultResolution('not_specified');
  }

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
