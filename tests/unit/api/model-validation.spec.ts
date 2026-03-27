import { describe, expect, it, vi } from 'vitest';
import { updatePreferencesSchema } from '@/app/api/v1/user/preferences/validation';
import { AI_DEFAULT_MODEL, isValidModelId } from '@/features/ai/ai-models';
import { resolveModelForTier } from '@/features/ai/model-resolver';

const stubProviderGetter = vi.fn((_modelId: string) => ({
  generate: vi.fn(async () => {
    throw new Error(
      'Provider generate should not be called in model resolution tests'
    );
  }),
}));

const stubLogger = {
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
};

/**
 * Unit tests for model validation logic used in API routes.
 * These tests verify the behavior of model ID validation and parsing
 * without requiring database or authentication.
 *
 * The schema is imported from the shared validation module to ensure
 * tests stay in sync with production validation.
 */

describe('Model Validation (API Layer)', () => {
  describe('Model override query param parsing', () => {
    it('extracts model ID from query param', () => {
      const url = new URL(
        'http://localhost/api/v1/plans/stream?model=openai/gpt-oss-20b:free'
      );
      const modelOverride = url.searchParams.get('model');
      expect(modelOverride).toBe('openai/gpt-oss-20b:free');
    });

    it('returns null when model param is not present', () => {
      const url = new URL('http://localhost/api/v1/plans/stream');
      const modelOverride = url.searchParams.get('model');
      expect(modelOverride).toBeNull();
    });

    it('handles URL-encoded model IDs', () => {
      const url = new URL(
        'http://localhost/api/v1/plans/stream?model=openai%2Fgpt-oss-20b%3Afree'
      );
      const modelOverride = url.searchParams.get('model');
      expect(modelOverride).toBe('openai/gpt-oss-20b:free');
    });

    it('handles model param with other query params', () => {
      const url = new URL(
        'http://localhost/api/v1/plans/stream?topic=test&model=anthropic/claude-haiku-4.5&hours=10'
      );
      const modelOverride = url.searchParams.get('model');
      expect(modelOverride).toBe('anthropic/claude-haiku-4.5');
    });
  });

  describe('Model override validation logic (without tier-gating)', () => {
    it('uses override when valid model ID is provided', () => {
      const modelOverride = 'openai/gpt-oss-20b:free';
      const model =
        modelOverride && isValidModelId(modelOverride)
          ? modelOverride
          : AI_DEFAULT_MODEL;
      expect(model).toBe('openai/gpt-oss-20b:free');
    });

    it('falls back to DEFAULT_MODEL when invalid model ID is provided', () => {
      const modelOverride = 'invalid/model-id';
      const model =
        modelOverride && isValidModelId(modelOverride)
          ? modelOverride
          : AI_DEFAULT_MODEL;
      expect(model).toBe(AI_DEFAULT_MODEL);
    });

    it('falls back to DEFAULT_MODEL when empty string is provided', () => {
      const modelOverride = '';
      const model =
        modelOverride && isValidModelId(modelOverride)
          ? modelOverride
          : AI_DEFAULT_MODEL;
      expect(model).toBe(AI_DEFAULT_MODEL);
    });

    it('falls back to DEFAULT_MODEL when null is provided', () => {
      const modelOverride = null;
      const model =
        modelOverride && isValidModelId(modelOverride)
          ? modelOverride
          : AI_DEFAULT_MODEL;
      expect(model).toBe(AI_DEFAULT_MODEL);
    });
  });

  describe('Tier-gated model override validation (production logic)', () => {
    it('allows free-tier model for free user', () => {
      const resolution = resolveModelForTier(
        'free',
        'openai/gpt-oss-20b:free',
        stubProviderGetter,
        stubLogger
      );
      expect(resolution.modelId).toBe('openai/gpt-oss-20b:free');
    });

    it('allows free-tier model for pro user', () => {
      const resolution = resolveModelForTier(
        'pro',
        'openai/gpt-oss-20b:free',
        stubProviderGetter,
        stubLogger
      );
      expect(resolution.modelId).toBe('openai/gpt-oss-20b:free');
    });

    it('allows pro-tier model for pro user', () => {
      const resolution = resolveModelForTier(
        'pro',
        'anthropic/claude-sonnet-4.5',
        stubProviderGetter,
        stubLogger
      );
      expect(resolution.modelId).toBe('anthropic/claude-sonnet-4.5');
    });

    it('BLOCKS pro-tier model for free user - falls back to default', () => {
      // This is the critical security test: free users cannot use expensive models
      const resolution = resolveModelForTier(
        'free',
        'anthropic/claude-sonnet-4.5',
        stubProviderGetter,
        stubLogger
      );
      expect(resolution.modelId).toBe(AI_DEFAULT_MODEL);
    });

    it('BLOCKS pro-tier model for starter user - falls back to default', () => {
      const resolution = resolveModelForTier(
        'starter',
        'openai/gpt-5.2',
        stubProviderGetter,
        stubLogger
      );
      expect(resolution.modelId).toBe(AI_DEFAULT_MODEL);
    });

    it('falls back to default when invalid model ID is provided', () => {
      const resolution = resolveModelForTier(
        'pro',
        'invalid/model-id',
        stubProviderGetter,
        stubLogger
      );
      expect(resolution.modelId).toBe(AI_DEFAULT_MODEL);
    });

    it('falls back to default when null is provided', () => {
      const resolution = resolveModelForTier(
        'free',
        null,
        stubProviderGetter,
        stubLogger
      );
      expect(resolution.modelId).toBe(AI_DEFAULT_MODEL);
    });

    it('falls back to default when empty string is provided', () => {
      const resolution = resolveModelForTier(
        'pro',
        '',
        stubProviderGetter,
        stubLogger
      );
      expect(resolution.modelId).toBe(AI_DEFAULT_MODEL);
    });
  });

  describe('Preferences schema validation', () => {
    // Keep this legacy Gemini ID here on purpose: persisted preference values still
    // come from the DB enum, which currently includes it even though override tests
    // use the current free-tier model ID.
    it('validates valid model ID', () => {
      const result = updatePreferencesSchema.safeParse({
        preferredAiModel: 'google/gemini-2.0-flash-exp:free',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.preferredAiModel).toBe(
          'google/gemini-2.0-flash-exp:free'
        );
      }
    });

    it('validates another valid model ID', () => {
      const result = updatePreferencesSchema.safeParse({
        preferredAiModel: 'anthropic/claude-haiku-4.5',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid model ID', () => {
      const result = updatePreferencesSchema.safeParse({
        preferredAiModel: 'not-a-real-model',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const unionIssue = result.error.issues.find(
          (i) =>
            i.path.length === 1 &&
            i.path[0] === 'preferredAiModel' &&
            i.code === 'invalid_union'
        );
        expect(unionIssue).toBeDefined();
        expect(result.error.format()._errors).toContain('Invalid model ID');
      }
    });

    it('rejects empty string', () => {
      const result = updatePreferencesSchema.safeParse({
        preferredAiModel: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing preferredAiModel field', () => {
      const result = updatePreferencesSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects non-string preferredAiModel', () => {
      const result = updatePreferencesSchema.safeParse({
        preferredAiModel: 123,
      });
      expect(result.success).toBe(false);
    });

    it('accepts null preferredAiModel to clear saved preference', () => {
      const result = updatePreferencesSchema.safeParse({
        preferredAiModel: null,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.preferredAiModel).toBeNull();
      }
    });

    it('rejects unknown keys (strict schema)', () => {
      const result = updatePreferencesSchema.safeParse({
        preferredAiModel: 'google/gemini-2.0-flash-exp:free',
        extraField: 'rejected',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find(
          (i) => i.code === 'unrecognized_keys'
        );
        expect(issue).toBeDefined();
        expect(issue?.code).toBe('unrecognized_keys');
        expect(issue?.keys).toContain('extraField');
      }
    });
  });

  describe('isValidModelId integration', () => {
    it('is imported and works correctly', () => {
      expect(typeof isValidModelId).toBe('function');
      expect(isValidModelId('openai/gpt-oss-20b:free')).toBe(true);
      expect(isValidModelId('fake-model')).toBe(false);
    });

    it('handles edge cases', () => {
      expect(isValidModelId('')).toBe(false);
      expect(isValidModelId('   ')).toBe(false);
      expect(isValidModelId('google/')).toBe(false);
    });
  });
});
