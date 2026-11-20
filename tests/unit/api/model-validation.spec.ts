import { updatePreferencesSchema } from '@/app/api/v1/user/preferences/validation';
import { AI_DEFAULT_MODEL } from '@/features/ai/ai-models';
import { resolveModelForTier } from '@/features/ai/model-resolver';
import { describe, expect, it, vi } from 'vitest';

const PRO_PERSISTABLE_MODEL = 'anthropic/claude-opus-5.5';

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
  describe('Tier-gated model override validation (production logic)', async () => {
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
  });

  describe('Preferences schema validation', () => {
    it('accepts unknown model IDs as text; the route enforces policy', () => {
      const result = updatePreferencesSchema.safeParse({
        preferredAiModel: 'not-a-real-model',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.preferredAiModel).toBe('not-a-real-model');
      }
    });

    it('rejects non-string preferredAiModel', () => {
      const result = updatePreferencesSchema.safeParse({
        preferredAiModel: 123,
      });
      expect(result.success).toBe(false);
    });
  });
});
