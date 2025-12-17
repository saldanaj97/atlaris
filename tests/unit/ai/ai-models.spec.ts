import { describe, expect, it } from 'vitest';

import {
  AI_DEFAULT_MODEL,
  AVAILABLE_MODELS,
  getDefaultModelForTier,
  getModelById,
  getModelsForTier,
  isValidModelId,
} from '@/lib/ai/ai-models';
import type { SubscriptionTier } from '@/lib/ai/types';

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
      expect(AI_DEFAULT_MODEL).toBe('google/gemini-2.0-flash-exp:free');
    });
  });

  describe('getModelById', () => {
    it('returns correct model for valid ID', () => {
      const model = getModelById('google/gemini-2.0-flash-exp:free');
      expect(model).toBeDefined();
      expect(model?.id).toBe('google/gemini-2.0-flash-exp:free');
      expect(model?.name).toBe('Gemini 2.0 Flash');
      expect(model?.provider).toBe('Google');
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
    it('returns only free models for free tier', () => {
      const models = getModelsForTier('free');
      expect(models.length).toBeGreaterThan(0);
      models.forEach((model) => {
        expect(model.tier).toBe('free');
      });
    });

    it('returns only free models for starter tier', () => {
      const models = getModelsForTier('starter');
      expect(models.length).toBeGreaterThan(0);
      models.forEach((model) => {
        expect(model.tier).toBe('free');
      });
    });

    it('returns all models for pro tier', () => {
      const models = getModelsForTier('pro');
      expect(models).toEqual(AVAILABLE_MODELS);
    });

    it('pro tier includes both free and pro models', () => {
      const models = getModelsForTier('pro');
      const freeModels = models.filter((m) => m.tier === 'free');
      const proModels = models.filter((m) => m.tier === 'pro');

      expect(freeModels.length).toBeGreaterThan(0);
      expect(proModels.length).toBeGreaterThan(0);
    });

    it('free and starter tiers return same models', () => {
      const freeModels = getModelsForTier('free');
      const starterModels = getModelsForTier('starter');
      expect(freeModels).toEqual(starterModels);
    });

    it.each<{ tier: SubscriptionTier; expectedMinCount: number }>([
      { tier: 'free', expectedMinCount: 1 },
      { tier: 'starter', expectedMinCount: 1 },
      { tier: 'pro', expectedMinCount: 2 },
    ])(
      '$tier tier returns at least $expectedMinCount models',
      ({ tier, expectedMinCount }) => {
        const models = getModelsForTier(tier);
        expect(models.length).toBeGreaterThanOrEqual(expectedMinCount);
      }
    );
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
    it('returns a valid model ID for free tier', () => {
      const modelId = getDefaultModelForTier('free');
      expect(isValidModelId(modelId)).toBe(true);
    });

    it('returns a valid model ID for starter tier', () => {
      const modelId = getDefaultModelForTier('starter');
      expect(isValidModelId(modelId)).toBe(true);
    });

    it('returns a valid model ID for pro tier', () => {
      const modelId = getDefaultModelForTier('pro');
      expect(isValidModelId(modelId)).toBe(true);
    });

    it('returns a free-tier accessible model for free users', () => {
      const modelId = getDefaultModelForTier('free');
      const model = getModelById(modelId);
      expect(model?.tier).toBe('free');
    });

    it('returns a free-tier accessible model for starter users', () => {
      const modelId = getDefaultModelForTier('starter');
      const model = getModelById(modelId);
      expect(model?.tier).toBe('free');
    });

    it('returns first available model for tier', () => {
      const freeModels = getModelsForTier('free');
      const defaultModel = getDefaultModelForTier('free');
      expect(defaultModel).toBe(freeModels[0].id);
    });
  });

  describe('Model data integrity', () => {
    it('known free models have zero input cost', () => {
      const freeModels = AVAILABLE_MODELS.filter(
        (m) => m.tier === 'free' && m.inputCostPerMillion === 0
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
