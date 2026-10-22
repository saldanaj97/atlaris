import { updatePreferencesSchema } from '@/app/api/v1/user/preferences/validation';
import { AI_DEFAULT_MODEL } from '@/features/ai/ai-models';
import { resolveModelForTier } from '@/features/ai/model-resolver';
import { describe, expect, it, vi } from 'vitest';

const STARTER_PERSISTABLE_MODEL = 'deepseek/deepseek-v4.1-flash';
const PRO_PERSISTABLE_MODEL = 'anthropic/claude-opus-5.5';
// The free router is the only Free-labelled catalog model.
const FREE_QUERY_OVERRIDE_MODEL = AI_DEFAULT_MODEL;
const PRO_OUTLINE_DEFAULT = 'openai/gpt-6.1-sol';
const STARTER_OUTLINE_DEFAULT = 'openai/gpt-6-luna';

const stubProviderGetter = vi.fn((_modelId: string) => ({
  generate: vi.fn(async () => {
    throw new Error(
      'Provider generate should not be called in model resolution tests',
    );
  }),
  generateModuleLessonBatch: vi.fn(async () => {
    throw new Error(
      'Provider generateModuleLessonBatch should not be called in model resolution tests',
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
        `http://localhost/api/v1/plans?model=${encodeURIComponent(FREE_QUERY_OVERRIDE_MODEL)}`,
      );
      const modelOverride = url.searchParams.get('model');
      expect(modelOverride).toBe(FREE_QUERY_OVERRIDE_MODEL);
    });

    it('returns null when model param is not present', () => {
      const url = new URL('http://localhost/api/v1/plans');
      const modelOverride = url.searchParams.get('model');
      expect(modelOverride).toBeNull();
    });

    it('handles URL-encoded model IDs', () => {
      const url = new URL(
        `http://localhost/api/v1/plans?model=${encodeURIComponent(FREE_QUERY_OVERRIDE_MODEL)}`,
      );
      const modelOverride = url.searchParams.get('model');
      expect(modelOverride).toBe(FREE_QUERY_OVERRIDE_MODEL);
    });

    it('handles model param with other query params', () => {
      const url = new URL(
        `http://localhost/api/v1/plans?topic=test&model=${encodeURIComponent(STARTER_PERSISTABLE_MODEL)}&hours=10`,
      );
      const modelOverride = url.searchParams.get('model');
      expect(modelOverride).toBe(STARTER_PERSISTABLE_MODEL);
    });
  });

  describe('Tier-gated model override validation (production logic)', async () => {
    it('allows the free router for a Free user', async () => {
      const resolution = await resolveModelForTier(
        'free',
        AI_DEFAULT_MODEL,
        'initial_outline',
        stubProviderGetter,
        stubLogger,
      );
      expect(resolution.modelId).toBe(AI_DEFAULT_MODEL);
    });

    it('allows a Free-labelled catalog model for a Pro user', async () => {
      const resolution = await resolveModelForTier(
        'pro',
        FREE_QUERY_OVERRIDE_MODEL,
        'initial_outline',
        stubProviderGetter,
        stubLogger,
      );
      expect(resolution.modelId).toBe(FREE_QUERY_OVERRIDE_MODEL);
    });

    it('allows a Pro catalog model for a Pro user', async () => {
      const resolution = await resolveModelForTier(
        'pro',
        PRO_PERSISTABLE_MODEL,
        'initial_outline',
        stubProviderGetter,
        stubLogger,
      );
      expect(resolution.modelId).toBe(PRO_PERSISTABLE_MODEL);
    });

    it('BLOCKS a paid model for a Free user and falls back to the free router', async () => {
      const resolution = await resolveModelForTier(
        'free',
        PRO_PERSISTABLE_MODEL,
        'initial_outline',
        stubProviderGetter,
        stubLogger,
      );
      expect(resolution.modelId).toBe(AI_DEFAULT_MODEL);
      expect(resolution.fallbackReason).toBe('tier_denied');
    });

    it('BLOCKS a model outside the Starter guardrail and falls back to the Starter default', async () => {
      const resolution = await resolveModelForTier(
        'starter',
        PRO_PERSISTABLE_MODEL,
        'initial_outline',
        stubProviderGetter,
        stubLogger,
      );
      expect(resolution.modelId).toBe(STARTER_OUTLINE_DEFAULT);
      expect(resolution.fallbackReason).toBe('tier_denied');
    });

    it('falls back to the Pro operation default when an invalid model ID is provided', async () => {
      const resolution = await resolveModelForTier(
        'pro',
        'invalid/model-id',
        'initial_outline',
        stubProviderGetter,
        stubLogger,
      );
      expect(resolution.modelId).toBe(PRO_OUTLINE_DEFAULT);
      expect(resolution.fallbackReason).toBe('invalid_model');
    });

    it('falls back to the Free operation default when null is provided', async () => {
      const resolution = await resolveModelForTier(
        'free',
        null,
        'initial_outline',
        stubProviderGetter,
        stubLogger,
      );
      expect(resolution.modelId).toBe(AI_DEFAULT_MODEL);
    });

    it('falls back to the Pro operation default when empty string is provided', async () => {
      const resolution = await resolveModelForTier(
        'pro',
        '',
        'initial_outline',
        stubProviderGetter,
        stubLogger,
      );
      expect(resolution.modelId).toBe(PRO_OUTLINE_DEFAULT);
    });
  });

  describe('Preferences schema validation', () => {
    it('validates valid model ID', () => {
      const result = updatePreferencesSchema.safeParse({
        preferredAiModel: STARTER_PERSISTABLE_MODEL,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.preferredAiModel).toBe(STARTER_PERSISTABLE_MODEL);
      }
    });

    it('validates another valid model ID', () => {
      const result = updatePreferencesSchema.safeParse({
        preferredAiModel: PRO_PERSISTABLE_MODEL,
      });
      expect(result.success).toBe(true);
    });

    it('accepts unknown model IDs as text; the route enforces policy', () => {
      const result = updatePreferencesSchema.safeParse({
        preferredAiModel: 'not-a-real-model',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.preferredAiModel).toBe('not-a-real-model');
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

    it('accepts independent Pro regeneration and lesson slots', () => {
      const result = updatePreferencesSchema.safeParse({
        preferredRegenerationAiModel: PRO_PERSISTABLE_MODEL,
        preferredLessonAiModel: null,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.preferredAiModel).toBeUndefined();
        expect(result.data.preferredRegenerationAiModel).toBe(
          PRO_PERSISTABLE_MODEL,
        );
        expect(result.data.preferredLessonAiModel).toBeNull();
      }
    });

    it('rejects unknown keys (strict schema)', () => {
      const result = updatePreferencesSchema.safeParse({
        preferredAiModel: STARTER_PERSISTABLE_MODEL,
        extraField: 'rejected',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().formErrors.join(' ')).toContain(
          'Unrecognized key',
        );
      }
    });
  });
});
