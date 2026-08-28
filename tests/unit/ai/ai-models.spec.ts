import {
  AI_DEFAULT_MODEL,
  AVAILABLE_MODELS,
  getDefaultModelForTier,
  getFallbackModelsForTier,
  getModelById,
  getModelsForTier,
  isValidModelId,
} from '@/features/ai/ai-models';
import { STARTER_OUTLINE_REGENERATION_MODEL_IDS } from '@/features/ai/model-operation-policy';
import { describe, expect, it } from 'vitest';

describe('AI Models Configuration', () => {
  describe('AVAILABLE_MODELS', () => {
    it('contains at least one model', () => {
      expect(AVAILABLE_MODELS.length).toBeGreaterThan(0);
    });

    it('has required properties for each model', () => {
      AVAILABLE_MODELS.forEach((model) => {
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('name');
        expect(model).toHaveProperty('provider');
        expect(model).toHaveProperty('description');
        expect(model).toHaveProperty('tier');
        expect(model).toHaveProperty('contextWindow');
        expect(model).toHaveProperty('inputCostPerMillion');
        expect(model).toHaveProperty('outputCostPerMillion');
      });
    });

    it('has correct property types for each model', () => {
      AVAILABLE_MODELS.forEach((model) => {
        expect(typeof model.id).toBe('string');
        expect(typeof model.name).toBe('string');
        expect(typeof model.provider).toBe('string');
        expect(typeof model.description).toBe('string');
        expect(['free', 'pro']).toContain(model.tier);
        expect(typeof model.contextWindow).toBe('number');
        expect(typeof model.inputCostPerMillion).toBe('number');
        expect(typeof model.outputCostPerMillion).toBe('number');
      });
    });

    it('has non-empty string values for text fields', () => {
      AVAILABLE_MODELS.forEach((model) => {
        expect(model.id.length).toBeGreaterThan(0);
        expect(model.name.length).toBeGreaterThan(0);
        expect(model.provider.length).toBeGreaterThan(0);
        expect(model.description.length).toBeGreaterThan(0);
      });
    });

    it('has positive numeric values for token-related fields', () => {
      AVAILABLE_MODELS.forEach((model) => {
        expect(model.contextWindow).toBeGreaterThan(0);
        expect(model.inputCostPerMillion).toBeGreaterThanOrEqual(0);
        expect(model.outputCostPerMillion).toBeGreaterThanOrEqual(0);
      });
    });

    it('labels Claude Haiku as pro because it is paid', () => {
      const model = getModelById('anthropic/claude-haiku-4.5');
      expect(model?.tier).toBe('pro');
      expect(model?.inputCostPerMillion).toBeGreaterThan(0);
      expect(model?.outputCostPerMillion).toBeGreaterThan(0);
    });

    it('contains both free and pro tier models', () => {
      const freeModels = AVAILABLE_MODELS.filter((m) => m.tier === 'free');
      const proModels = AVAILABLE_MODELS.filter((m) => m.tier === 'pro');

      expect(freeModels.length).toBeGreaterThan(0);
      expect(proModels.length).toBeGreaterThan(0);
    });

    it('has unique model IDs', () => {
      const ids = AVAILABLE_MODELS.map((m) => m.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('DEFAULT_MODEL', () => {
    it('is a valid model ID', () => {
      expect(isValidModelId(AI_DEFAULT_MODEL)).toBe(true);
    });

    it('exists in AVAILABLE_MODELS', () => {
      const model = AVAILABLE_MODELS.find((m) => m.id === AI_DEFAULT_MODEL);
      expect(model).toBeDefined();
    });

    it('is a free tier model', () => {
      const model = AVAILABLE_MODELS.find((m) => m.id === AI_DEFAULT_MODEL);
      expect(model?.tier).toBe('free');
    });

    it('has the expected value', () => {
      expect(AI_DEFAULT_MODEL).toBe('openrouter/free');
    });
  });

  describe('getModelById', () => {
    it('returns correct model for valid ID', () => {
      const model = getModelById('openrouter/free');
      expect(model).toBeDefined();
      expect(model?.id).toBe('openrouter/free');
      expect(model?.name).toBe('Free Models Router');
      expect(model?.provider).toBe('OpenRouter');
    });

    it('includes Gemini 2.0 Flash because it is still a supported free model', () => {
      const model = getModelById('google/gemini-2.0-flash-exp:free');
      expect(model).toMatchObject({
        id: 'google/gemini-2.0-flash-exp:free',
        name: 'Gemini 2.0 Flash',
        provider: 'Google',
        tier: 'free',
        contextWindow: 1_048_576,
      });
    });

    it('returns correct model for each model in AVAILABLE_MODELS', () => {
      AVAILABLE_MODELS.forEach((expectedModel) => {
        const model = getModelById(expectedModel.id);
        expect(model).toBeDefined();
        expect(model).toEqual(expectedModel);
      });
    });

    it('returns undefined for invalid ID', () => {
      expect(getModelById('invalid/model-id')).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(getModelById('')).toBeUndefined();
    });

    it('returns undefined for partial match', () => {
      expect(getModelById('google/gemini')).toBeUndefined();
    });

    it('returns undefined for case-mismatched ID', () => {
      expect(getModelById('Google/Gemini-2.0-Flash-Exp:Free')).toBeUndefined();
    });
  });

  describe('getModelsForTier', () => {
    it('returns only the free router for Free outline and lesson', () => {
      expect(
        getModelsForTier('free', 'initial_outline').map((m) => m.id),
      ).toEqual([AI_DEFAULT_MODEL]);
      expect(getModelsForTier('free', 'lesson').map((m) => m.id)).toEqual([
        AI_DEFAULT_MODEL,
      ]);
    });

    it('returns an empty catalog for Free regeneration', () => {
      expect(getModelsForTier('free', 'regeneration')).toEqual([]);
    });

    it('returns the Starter outline/regen allowlist, not the Free catalog', () => {
      expect(
        getModelsForTier('starter', 'initial_outline').map((m) => m.id),
      ).toEqual([...STARTER_OUTLINE_REGENERATION_MODEL_IDS]);
      expect(
        getModelsForTier('starter', 'regeneration').map((m) => m.id),
      ).toEqual([...STARTER_OUTLINE_REGENERATION_MODEL_IDS]);
    });

    it('returns only the free router for Starter lesson', () => {
      expect(getModelsForTier('starter', 'lesson').map((m) => m.id)).toEqual([
        AI_DEFAULT_MODEL,
      ]);
    });

    it('returns all models for Pro operations', () => {
      expect(getModelsForTier('pro', 'initial_outline')).toEqual(
        AVAILABLE_MODELS,
      );
      expect(getModelsForTier('pro', 'regeneration')).toEqual(AVAILABLE_MODELS);
      expect(getModelsForTier('pro', 'lesson')).toEqual(AVAILABLE_MODELS);
    });

    it('does not include Claude Haiku in Free or Starter catalogs', () => {
      expect(
        getModelsForTier('free', 'initial_outline').map((m) => m.id),
      ).not.toContain('anthropic/claude-haiku-4.5');
      expect(
        getModelsForTier('starter', 'initial_outline').map((m) => m.id),
      ).not.toContain('anthropic/claude-haiku-4.5');
    });
  });

  describe('isValidModelId', () => {
    it('returns true for valid model IDs', () => {
      AVAILABLE_MODELS.forEach((model) => {
        expect(isValidModelId(model.id)).toBe(true);
      });
    });

    it('returns true for DEFAULT_MODEL', () => {
      expect(isValidModelId(AI_DEFAULT_MODEL)).toBe(true);
    });

    it('returns false for invalid IDs', () => {
      expect(isValidModelId('invalid/model')).toBe(false);
      expect(isValidModelId('not-a-real-model')).toBe(false);
      expect(isValidModelId('random-string-123')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isValidModelId('')).toBe(false);
    });

    it('returns false for whitespace-only string', () => {
      expect(isValidModelId('   ')).toBe(false);
      expect(isValidModelId('\t\n')).toBe(false);
    });

    it('returns false for partial model IDs', () => {
      expect(isValidModelId('google/')).toBe(false);
      expect(isValidModelId('/gemini-2.0-flash-exp:free')).toBe(false);
    });

    it('returns false for case-mismatched IDs', () => {
      expect(isValidModelId('GOOGLE/GEMINI-2.0-FLASH-EXP:FREE')).toBe(false);
    });
  });

  describe('getDefaultModelForTier', () => {
    it('returns the free router for Free outline and lesson', () => {
      expect(getDefaultModelForTier('free', 'initial_outline')).toBe(
        AI_DEFAULT_MODEL,
      );
      expect(getDefaultModelForTier('free', 'lesson')).toBe(AI_DEFAULT_MODEL);
    });

    it('returns Gemini 2.5 Flash Lite for Starter outline and regen', () => {
      expect(getDefaultModelForTier('starter', 'initial_outline')).toBe(
        'google/gemini-2.5-flash-lite',
      );
      expect(getDefaultModelForTier('starter', 'regeneration')).toBe(
        'google/gemini-2.5-flash-lite',
      );
    });

    it('returns the free router for Starter lesson', () => {
      expect(getDefaultModelForTier('starter', 'lesson')).toBe(
        AI_DEFAULT_MODEL,
      );
    });

    it('returns operation-specific Pro defaults, not the first catalog row', () => {
      expect(AVAILABLE_MODELS[0]?.id).toBe(AI_DEFAULT_MODEL);
      expect(getDefaultModelForTier('pro', 'initial_outline')).toBe(
        'openai/gpt-5.2',
      );
      expect(getDefaultModelForTier('pro', 'regeneration')).toBe(
        'google/gemini-3-pro-preview',
      );
      expect(getDefaultModelForTier('pro', 'lesson')).toBe(
        'google/gemini-3-flash-preview',
      );
    });
  });

  describe('getFallbackModelsForTier', () => {
    it('never adds a paid fallback for Free outline', () => {
      expect(
        getFallbackModelsForTier(
          'free',
          'anthropic/claude-haiku-4.5',
          'initial_outline',
        ),
      ).toEqual([]);
    });

    it('never falls back to openrouter/free for Starter outline/regen', () => {
      expect(
        getFallbackModelsForTier(
          'starter',
          'google/gemini-2.5-flash-lite',
          'initial_outline',
        ),
      ).toEqual([]);
      expect(
        getFallbackModelsForTier(
          'starter',
          'openai/gpt-4o-mini-2024-07-18',
          'regeneration',
        ),
      ).toEqual([]);
    });

    it('uses openrouter/free as the only Starter/Free lesson fallback', () => {
      expect(
        getFallbackModelsForTier(
          'starter',
          'google/gemini-2.5-flash-lite',
          'lesson',
        ),
      ).toEqual([AI_DEFAULT_MODEL]);
      expect(
        getFallbackModelsForTier('free', AI_DEFAULT_MODEL, 'lesson'),
      ).toEqual([]);
    });

    it('does not add provider fallbacks for Pro', () => {
      expect(
        getFallbackModelsForTier(
          'pro',
          'anthropic/claude-sonnet-4.5',
          'initial_outline',
        ),
      ).toEqual([]);
    });
  });

  describe('Model data integrity', () => {
    it('keeps openrouter/free metadata router-aware instead of backend-specific', () => {
      const model = getModelById('openrouter/free');
      expect(model).toMatchObject({
        contextWindow: 200_000,
      });
      expect(model?.maxOutputTokens).toBeUndefined();
      expect(model?.description).toContain('output limits vary');
    });

    it('known free models have zero input cost', () => {
      const freeModels = AVAILABLE_MODELS.filter(
        (m) => m.tier === 'free' && m.inputCostPerMillion === 0,
      );
      // At least some free models should have zero cost
      expect(freeModels.length).toBeGreaterThan(0);
    });

    it('all models have reasonable context windows', () => {
      AVAILABLE_MODELS.forEach((model) => {
        // Context windows should be at least 1K tokens
        expect(model.contextWindow).toBeGreaterThanOrEqual(1000);
        // And no more than 10M tokens (reasonable upper bound)
        expect(model.contextWindow).toBeLessThanOrEqual(10_000_000);
      });
    });
  });
});
