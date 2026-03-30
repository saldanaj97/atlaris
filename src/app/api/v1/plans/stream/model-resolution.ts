import { resolveSavedPreferenceForSettings } from '@/features/ai/model-preferences';
import { validateModelForTier } from '@/features/ai/model-resolver';
import type { SubscriptionTier } from '@/features/ai/types/model.types';

export type StreamModelResolution = {
  modelOverride?: string;
  resolutionSource: 'query_override' | 'saved_preference' | 'tier_default';
  suppliedModel?: string;
};

type ResolveStreamModelResolutionInput = {
  searchParams: URLSearchParams;
  tier: SubscriptionTier;
  savedPreferredAiModel: string | null | undefined;
};

export function resolveStreamModelResolution({
  searchParams,
  tier,
  savedPreferredAiModel,
}: ResolveStreamModelResolutionInput): StreamModelResolution {
  const suppliedModel = searchParams.has('model')
    ? (searchParams.get('model') ?? '')
    : undefined;

  if (suppliedModel !== undefined) {
    const validation = validateModelForTier(tier, suppliedModel);
    if (validation.valid) {
      return {
        modelOverride: suppliedModel,
        resolutionSource: 'query_override',
        suppliedModel,
      };
    }
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
