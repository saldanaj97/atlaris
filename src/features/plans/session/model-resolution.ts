import { resolveSavedPreferenceForSettings } from '@/features/ai/model-preferences';
import { validateModelForTier } from '@/features/ai/model-resolver';
import type { SubscriptionTier } from '@/features/ai/types/model.types';
import { logger } from '@/lib/logging/logger';

type StreamModelResolution = {
  modelOverride?: string;
  resolutionSource:
    | 'query_override'
    | 'query_override_invalid'
    | 'saved_preference'
    | 'tier_default';
  suppliedModel?: string;
  validationError?: StreamModelValidationError;
};

type StreamModelValidationError = {
  reason: string;
};

type ResolveStreamModelResolutionInput = {
  searchParams: URLSearchParams;
  tier: SubscriptionTier;
  savedPreferredAiModel: string | null;
};

export function resolveStreamModelResolution({
  searchParams,
  tier,
  savedPreferredAiModel,
}: ResolveStreamModelResolutionInput): StreamModelResolution {
  const suppliedModel = searchParams.get('model') ?? undefined;
  let validationError: StreamModelValidationError | undefined;

  if (suppliedModel !== undefined) {
    const validation = validateModelForTier(tier, suppliedModel);
    if (validation.valid) {
      return {
        modelOverride: suppliedModel,
        resolutionSource: 'query_override',
        suppliedModel,
      };
    }

    logger.warn(
      { tier, suppliedModel, reason: validation.reason },
      'Invalid or tier-denied model override supplied; ignoring query override'
    );

    validationError = { reason: validation.reason };
  }

  const savedModel = resolveSavedPreferenceForSettings(
    tier,
    savedPreferredAiModel
  );
  if (savedModel !== null) {
    return {
      modelOverride: savedModel,
      resolutionSource: 'saved_preference',
      suppliedModel,
      validationError,
    };
  }

  return {
    // `query_override_invalid` means a caller explicitly supplied `?model=...`,
    // but validation rejected it and no saved preference remained to use instead.
    resolutionSource:
      validationError !== undefined ? 'query_override_invalid' : 'tier_default',
    suppliedModel,
    validationError,
  };
}
