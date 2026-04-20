import { describe, expect, it, vi } from 'vitest';
import { updatePreferencesSchema } from '@/app/api/v1/user/preferences/validation';
import {
  AI_DEFAULT_MODEL,
  AVAILABLE_MODELS,
  isValidModelId,
} from '@/features/ai/ai-models';
import { getPersistableModelsForTier } from '@/features/ai/model-preferences';
import { resolveModelForTier } from '@/features/ai/model-resolver';

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
  throw new Error('Expected model fixtures for validation tests');
}

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

describe('Model validation helpers (preferences + tier gating)', () => {
  describe('Model override query param parsing', () => {
    it('extracts model ID from query param', () => {
      const url = new URL(
        `http://localhost/api/v1/plans/stream?model=${encodeURIComponent(FREE_QUERY_OVERRIDE_MODEL)}`
      );
      const modelOverride = url.searchParams.get('model');
      expect(modelOverride).toBe(FREE_QUERY_OVERRIDE_MODEL);
    });

    it('returns null when model param is not present', () => {
      const url = new URL('http://localhost/api/v1/plans/stream');
      const modelOverride = url.searchParams.get('model');
      expect(modelOverride).toBeNull();
    });

    it('handles URL-encoded model IDs', () => {
      const url = new URL(
        `http://localhost/api/v1/plans/stream?model=${encodeURIComponent(FREE_QUERY_OVERRIDE_MODEL)}`
      );
      const modelOverride = url.searchParams.get('model');
      expect(modelOverride).toBe(FREE_QUERY_OVERRIDE_MODEL);
    });

    it('handles model param with other query params', () => {
      const url = new URL(
        `http://localhost/api/v1/plans/stream?topic=test&model=${encodeURIComponent(FREE_PERSISTABLE_MODEL)}&hours=10`
      );
      const modelOverride = url.searchParams.get('model');
      expect(modelOverride).toBe(FREE_PERSISTABLE_MODEL);
    });
  });

  describe('Model override validation logic (without tier-gating)', () => {
    it('uses override when valid model ID is provided', () => {
      const modelOverride = FREE_QUERY_OVERRIDE_MODEL;
      const model =
        modelOverride && isValidModelId(modelOverride)
          ? modelOverride
          : AI_DEFAULT_MODEL;
      expect(model).toBe(FREE_QUERY_OVERRIDE_MODEL);
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
        FREE_QUERY_OVERRIDE_MODEL,
        stubProviderGetter,
        stubLogger
      );
      expect(resolution.modelId).toBe(FREE_QUERY_OVERRIDE_MODEL);
    });

    it('allows free-tier model for pro user', () => {
      const resolution = resolveModelForTier(
        'pro',
        FREE_QUERY_OVERRIDE_MODEL,
        stubProviderGetter,
        stubLogger
      );
      expect(resolution.modelId).toBe(FREE_QUERY_OVERRIDE_MODEL);
    });

    it('allows pro-tier model for pro user', () => {
      const resolution = resolveModelForTier(
        'pro',
        PRO_PERSISTABLE_MODEL,
        stubProviderGetter,
        stubLogger
      );
      expect(resolution.modelId).toBe(PRO_PERSISTABLE_MODEL);
    });

    it('BLOCKS pro-tier model for free user - falls back to default', () => {
      const resolution = resolveModelForTier(
        'free',
        PRO_PERSISTABLE_MODEL,
        stubProviderGetter,
        stubLogger
      );
      expect(resolution.modelId).toBe(AI_DEFAULT_MODEL);
    });

    it('BLOCKS pro-tier model for starter user - falls back to default', () => {
      const resolution = resolveModelForTier(
        'starter',
        PRO_PERSISTABLE_MODEL,
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
    it('validates valid model ID', () => {
      const result = updatePreferencesSchema.safeParse({
        preferredAiModel: FREE_PERSISTABLE_MODEL,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.preferredAiModel).toBe(FREE_PERSISTABLE_MODEL);
      }
    });

    it('validates another valid model ID', () => {
      const result = updatePreferencesSchema.safeParse({
        preferredAiModel: PRO_PERSISTABLE_MODEL,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid model ID', () => {
      const result = updatePreferencesSchema.safeParse({
        preferredAiModel: 'not-a-real-model',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.preferredAiModel).toEqual(
          expect.arrayContaining(['Invalid model ID'])
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

    it('rejects undefined preferredAiModel', () => {
      const result = updatePreferencesSchema.safeParse({
        preferredAiModel: undefined,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.preferredAiModel).toEqual(
          expect.arrayContaining(['Invalid model ID'])
        );
      }
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
        preferredAiModel: FREE_PERSISTABLE_MODEL,
        extraField: 'rejected',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().formErrors.join(' ')).toContain(
          'Unrecognized key'
        );
      }
    });
  });

  describe('isValidModelId integration', () => {
    it('is imported and works correctly', () => {
      expect(typeof isValidModelId).toBe('function');
      expect(isValidModelId(FREE_QUERY_OVERRIDE_MODEL)).toBe(true);
      expect(isValidModelId('fake-model')).toBe(false);
    });

    it('handles edge cases', () => {
      expect(isValidModelId('')).toBe(false);
      expect(isValidModelId('   ')).toBe(false);
      expect(isValidModelId('google/')).toBe(false);
    });
  });
});
