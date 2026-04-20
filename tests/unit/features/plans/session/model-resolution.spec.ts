import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_DEFAULT_MODEL, AVAILABLE_MODELS } from '@/features/ai/ai-models';
import { getPersistableModelsForTier } from '@/features/ai/model-preferences';
import { resolveStreamModelResolution } from '@/features/plans/session/model-resolution';
import { logger } from '@/lib/logging/logger';

const FREE_PERSISTABLE_MODELS = getPersistableModelsForTier('free');
const FREE_PERSISTABLE_MODEL = FREE_PERSISTABLE_MODELS[0]?.id;
const PRO_PERSISTABLE_MODEL = getPersistableModelsForTier('pro').find(
  ({ id }) => !FREE_PERSISTABLE_MODELS.some((model) => model.id === id)
)?.id;
const FREE_QUERY_OVERRIDE_MODEL = AVAILABLE_MODELS.find(
  ({ tier, id }) => tier === 'free' && id !== AI_DEFAULT_MODEL
)?.id;

if (
  !FREE_PERSISTABLE_MODEL ||
  !PRO_PERSISTABLE_MODEL ||
  !FREE_QUERY_OVERRIDE_MODEL
) {
  throw new Error('Expected model fixtures for model-resolution tests');
}

describe('resolveStreamModelResolution', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefers a valid query override', () => {
    const resolution = resolveStreamModelResolution({
      searchParams: new URLSearchParams({ model: FREE_QUERY_OVERRIDE_MODEL }),
      tier: 'pro',
      savedPreferredAiModel: FREE_PERSISTABLE_MODEL,
    });

    expect(resolution).toEqual({
      modelOverride: FREE_QUERY_OVERRIDE_MODEL,
      resolutionSource: 'query_override',
      suppliedModel: FREE_QUERY_OVERRIDE_MODEL,
    });
  });

  it('falls back to saved preference when query override fails validation', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    const resolution = resolveStreamModelResolution({
      searchParams: new URLSearchParams({ model: 'invalid/model-id' }),
      tier: 'free',
      savedPreferredAiModel: FREE_PERSISTABLE_MODEL,
    });

    expect(resolution).toEqual({
      modelOverride: FREE_PERSISTABLE_MODEL,
      resolutionSource: 'saved_preference',
      suppliedModel: 'invalid/model-id',
      validationError: {
        reason: 'invalid_model',
      },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: 'free',
        suppliedModel: 'invalid/model-id',
        reason: expect.stringMatching(/invalid_model|tier_denied/),
      }),
      'Invalid or tier-denied model override supplied; ignoring query override'
    );
  });

  it('returns query_override_invalid when override fails and no saved preference exists', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    const resolution = resolveStreamModelResolution({
      searchParams: new URLSearchParams({ model: 'invalid/model-id' }),
      tier: 'free',
      savedPreferredAiModel: null,
    });

    expect(resolution).toEqual({
      resolutionSource: 'query_override_invalid',
      suppliedModel: 'invalid/model-id',
      validationError: {
        reason: 'invalid_model',
      },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: 'free',
        suppliedModel: 'invalid/model-id',
        reason: expect.stringMatching(/invalid_model|tier_denied/),
      }),
      'Invalid or tier-denied model override supplied; ignoring query override'
    );
  });

  it('falls back to tier default when no usable override exists', () => {
    const resolution = resolveStreamModelResolution({
      searchParams: new URLSearchParams(),
      tier: 'free',
      savedPreferredAiModel: PRO_PERSISTABLE_MODEL,
    });

    expect(resolution).toEqual({
      resolutionSource: 'tier_default',
    });
  });

  it('uses saved preference when no query override is supplied', () => {
    const resolution = resolveStreamModelResolution({
      searchParams: new URLSearchParams(),
      tier: 'free',
      savedPreferredAiModel: FREE_PERSISTABLE_MODEL,
    });

    expect(resolution).toEqual({
      modelOverride: FREE_PERSISTABLE_MODEL,
      resolutionSource: 'saved_preference',
    });
  });
});
