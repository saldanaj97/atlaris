import { resolveSavedPreferenceForSettings } from '@/features/ai/model-preferences';
import { validateModelForTier } from '@/features/ai/model-resolver';
import type { SubscriptionTier } from '@/features/ai/types/model.types';
import { logger } from '@/lib/logging/logger';

export type StreamModelResolution = {
  modelOverride?: string;
  resolutionSource:
    | 'query_override'
    | 'query_override_invalid'
    | 'saved_preference'
    | 'tier_default';
  suppliedModel?: string;
  validationError?: { reason: string };
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
    return {
      resolutionSource: 'query_override_invalid',
      suppliedModel,
      validationError: { reason: validation.reason },
    };
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
    };
  }

  return {
    resolutionSource: 'tier_default',
    suppliedModel,
  };
}
