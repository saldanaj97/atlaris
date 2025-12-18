import {
  AI_DEFAULT_MODEL,
  getModelsForTier,
  isValidModelId,
} from '@/lib/ai/ai-models';
import { updatePreferencesSchema } from '@/lib/validation/user-preferences';
import { describe, expect, it } from 'vitest';

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
        'http://localhost/api/v1/plans/stream?model=google/gemini-2.0-flash-exp:free'
      );
      const modelOverride = url.searchParams.get('model');
      expect(modelOverride).toBe('google/gemini-2.0-flash-exp:free');
    });

    it('returns null when model param is not present', () => {
      const url = new URL('http://localhost/api/v1/plans/stream');
      const modelOverride = url.searchParams.get('model');
      expect(modelOverride).toBeNull();
    });

    it('handles URL-encoded model IDs', () => {
      const url = new URL(
        'http://localhost/api/v1/plans/stream?model=google%2Fgemini-2.0-flash-exp%3Afree'
      );
      const modelOverride = url.searchParams.get('model');
      expect(modelOverride).toBe('google/gemini-2.0-flash-exp:free');
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
      const modelOverride = 'google/gemini-2.0-flash-exp:free';
      const model =
        modelOverride && isValidModelId(modelOverride)
          ? modelOverride
          : AI_DEFAULT_MODEL;
      expect(model).toBe('google/gemini-2.0-flash-exp:free');
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
    /**
     * Helper that mirrors the production tier-gating logic from route.ts
     */
    function resolveModel(
      modelOverride: string | null,
      userTier: 'free' | 'starter' | 'pro'
    ): string {
      const allowedModels = getModelsForTier(userTier);
      return modelOverride &&
        isValidModelId(modelOverride) &&
        allowedModels.some((m) => m.id === modelOverride)
        ? modelOverride
        : AI_DEFAULT_MODEL;
    }

    it('allows free-tier model for free user', () => {
      const model = resolveModel('google/gemini-2.0-flash-exp:free', 'free');
      expect(model).toBe('google/gemini-2.0-flash-exp:free');
    });

    it('allows free-tier model for pro user', () => {
      const model = resolveModel('google/gemini-2.0-flash-exp:free', 'pro');
      expect(model).toBe('google/gemini-2.0-flash-exp:free');
    });

    it('allows pro-tier model for pro user', () => {
      const model = resolveModel('anthropic/claude-sonnet-4.5', 'pro');
      expect(model).toBe('anthropic/claude-sonnet-4.5');
    });

    it('BLOCKS pro-tier model for free user - falls back to default', () => {
      // This is the critical security test: free users cannot use expensive models
      const model = resolveModel('anthropic/claude-sonnet-4.5', 'free');
      expect(model).toBe(AI_DEFAULT_MODEL);
    });

    it('BLOCKS pro-tier model for starter user - falls back to default', () => {
      const model = resolveModel('openai/gpt-5.2', 'starter');
      expect(model).toBe(AI_DEFAULT_MODEL);
    });

    it('falls back to default when invalid model ID is provided', () => {
      const model = resolveModel('invalid/model-id', 'pro');
      expect(model).toBe(AI_DEFAULT_MODEL);
    });

    it('falls back to default when null is provided', () => {
      const model = resolveModel(null, 'free');
      expect(model).toBe(AI_DEFAULT_MODEL);
    });

    it('falls back to default when empty string is provided', () => {
      const model = resolveModel('', 'pro');
      expect(model).toBe(AI_DEFAULT_MODEL);
    });
  });

  describe('Preferences schema validation', () => {
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
        expect(result.error.flatten().fieldErrors.preferredAiModel).toContain(
          'Invalid model ID'
        );
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

    it('rejects null preferredAiModel', () => {
      const result = updatePreferencesSchema.safeParse({
        preferredAiModel: null,
      });
      expect(result.success).toBe(false);
    });

    it('allows extra fields (Zod default behavior)', () => {
      const result = updatePreferencesSchema.safeParse({
        preferredAiModel: 'google/gemini-2.0-flash-exp:free',
        extraField: 'ignored',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('isValidModelId integration', () => {
    it('is imported and works correctly', () => {
      expect(typeof isValidModelId).toBe('function');
      expect(isValidModelId('google/gemini-2.0-flash-exp:free')).toBe(true);
      expect(isValidModelId('fake-model')).toBe(false);
    });

    it('handles edge cases', () => {
      expect(isValidModelId('')).toBe(false);
      expect(isValidModelId('   ')).toBe(false);
      expect(isValidModelId('google/')).toBe(false);
    });
  });
});
