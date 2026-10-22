import { AI_DEFAULT_MODEL } from '@/features/ai/ai-models';
import { resolveStreamModelResolution } from '@/features/plans/session/model-resolution';
import { logger } from '@/lib/logging/logger';
import { afterEach, describe, expect, it, vi } from 'vitest';

const STARTER_PERSISTABLE_MODEL = 'deepseek/deepseek-v4.1-flash';
const OTHER_STARTER_PERSISTABLE_MODEL = 'anthropic/claude-haiku-5.5';
const PRO_PERSISTABLE_MODEL = 'anthropic/claude-opus-5.5';
// The free router is the only Free-labelled catalog model.
const FREE_QUERY_OVERRIDE_MODEL = AI_DEFAULT_MODEL;

describe('resolveStreamModelResolution', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefers a valid query override', async () => {
    const resolution = await resolveStreamModelResolution({
      searchParams: new URLSearchParams({ model: FREE_QUERY_OVERRIDE_MODEL }),
      tier: 'pro',
      savedPreferredAiModel: STARTER_PERSISTABLE_MODEL,
    });

    expect(resolution).toEqual({
      modelOverride: FREE_QUERY_OVERRIDE_MODEL,
      resolutionSource: 'query_override',
      suppliedModel: FREE_QUERY_OVERRIDE_MODEL,
    });
  });

  it('falls back to saved preference when query override fails validation', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    const resolution = await resolveStreamModelResolution({
      searchParams: new URLSearchParams({ model: 'invalid/model-id' }),
      tier: 'starter',
      savedPreferredAiModel: STARTER_PERSISTABLE_MODEL,
    });

    expect(resolution).toEqual({
      modelOverride: STARTER_PERSISTABLE_MODEL,
      resolutionSource: 'saved_preference',
      suppliedModel: 'invalid/model-id',
      validationError: {
        reason: 'invalid_model',
      },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: 'starter',
        suppliedModel: 'invalid/model-id',
        reason: expect.stringMatching(/invalid_model|tier_denied/),
      }),
      'Invalid or tier-denied model override supplied; ignoring query override',
    );
  });

  it('returns query_override_invalid when override fails and no saved preference exists', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    const resolution = await resolveStreamModelResolution({
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
      'Invalid or tier-denied model override supplied; ignoring query override',
    );
  });

  it('falls back to tier default when no usable override exists', async () => {
    const resolution = await resolveStreamModelResolution({
      searchParams: new URLSearchParams(),
      tier: 'free',
      savedPreferredAiModel: PRO_PERSISTABLE_MODEL,
    });

    expect(resolution).toEqual({
      resolutionSource: 'tier_default',
    });
  });

  it('uses a Starter/Pro allowlist query override over the saved outline preference', async () => {
    const resolution = await resolveStreamModelResolution({
      searchParams: new URLSearchParams({ model: STARTER_PERSISTABLE_MODEL }),
      tier: 'starter',
      savedPreferredAiModel: OTHER_STARTER_PERSISTABLE_MODEL,
    });

    expect(resolution).toEqual({
      modelOverride: STARTER_PERSISTABLE_MODEL,
      resolutionSource: 'query_override',
      suppliedModel: STARTER_PERSISTABLE_MODEL,
    });
  });

  it('uses saved preference when no query override is supplied', async () => {
    const resolution = await resolveStreamModelResolution({
      searchParams: new URLSearchParams(),
      tier: 'starter',
      savedPreferredAiModel: STARTER_PERSISTABLE_MODEL,
    });

    expect(resolution).toEqual({
      modelOverride: STARTER_PERSISTABLE_MODEL,
      resolutionSource: 'saved_preference',
    });
  });

  it('does not persist or apply a Free saved preference', async () => {
    const resolution = await resolveStreamModelResolution({
      searchParams: new URLSearchParams(),
      tier: 'free',
      savedPreferredAiModel: STARTER_PERSISTABLE_MODEL,
    });

    expect(resolution).toEqual({
      resolutionSource: 'tier_default',
    });
  });
});
