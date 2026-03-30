import { describe, expect, it } from 'vitest';

import {
  getPersistableModelsForTier,
  isPersistableModelId,
  resolveSavedPreferenceForSettings,
} from '@/features/ai/model-preferences';
import type { SubscriptionTier } from '@/features/ai/types/model.types';
import { AI_DEFAULT_MODEL } from '@/shared/constants/ai-models';

const FREE_PERSISTABLE_MODELS = getPersistableModelsForTier('free');
const PRO_PERSISTABLE_MODELS = getPersistableModelsForTier('pro');
const FREE_MODEL_ID = FREE_PERSISTABLE_MODELS[0]?.id;
const SECOND_FREE_MODEL_ID = FREE_PERSISTABLE_MODELS[1]?.id ?? FREE_MODEL_ID;
const PRO_ONLY_MODEL_ID = PRO_PERSISTABLE_MODELS.find(
  ({ id }) => !FREE_PERSISTABLE_MODELS.some((model) => model.id === id)
)?.id;

if (!FREE_MODEL_ID || !SECOND_FREE_MODEL_ID || !PRO_ONLY_MODEL_ID) {
  throw new Error('Expected persistable free and pro model fixtures');
}

describe('model-preferences', () => {
  describe('isPersistableModelId', () => {
    it.each([
      FREE_MODEL_ID,
      SECOND_FREE_MODEL_ID,
      PRO_ONLY_MODEL_ID,
    ])('accepts persistable enum-listed id %s', (id) => {
      expect(isPersistableModelId(id)).toBe(true);
    });

    it.each([
      '',
      AI_DEFAULT_MODEL,
      'not-a-real-model',
      'fake/',
      'too/many/parts/here',
      'openai/',
      'gpt-oss-20b:free',
    ])('rejects non-persistable or invalid id %s', (id) => {
      expect(isPersistableModelId(id)).toBe(false);
    });
  });

  describe('getPersistableModelsForTier', () => {
    it('excludes runtime router from free tier and includes a free-tier saveable model', () => {
      const freeModels = getPersistableModelsForTier('free');
      expect(freeModels.some((m) => m.id === 'openrouter/free')).toBe(false);
      expect(freeModels.some((m) => m.id === FREE_MODEL_ID)).toBe(true);
    });

    it('starter tier matches free-tier filtering for persistable models', () => {
      const freeModels = getPersistableModelsForTier('free');
      const starterModels = getPersistableModelsForTier('starter');
      expect(starterModels.map((m) => m.id).sort()).toEqual(
        freeModels.map((m) => m.id).sort()
      );
    });

    it('pro tier includes persistable pro-catalog models not in free-tier list', () => {
      const freeModels = getPersistableModelsForTier('free');
      const proModels = getPersistableModelsForTier('pro');
      const freeIds = new Set(freeModels.map((m) => m.id));
      const proOnly = proModels.filter((m) => !freeIds.has(m.id));
      expect(proOnly.length).toBeGreaterThan(0);
      expect(proOnly.some((m) => m.id === PRO_ONLY_MODEL_ID)).toBe(true);
    });
  });

  describe('resolveSavedPreferenceForSettings', () => {
    it.each<[SubscriptionTier, string | null | undefined, string | null]>([
      ['free', null, null],
      ['free', undefined, null],
      ['free', '', null],
      ['free', FREE_MODEL_ID, FREE_MODEL_ID],
      ['free', PRO_ONLY_MODEL_ID, null],
      ['free', AI_DEFAULT_MODEL, null],
      ['free', 'not-a-real-model', null],
      ['pro', PRO_ONLY_MODEL_ID, PRO_ONLY_MODEL_ID],
      ['starter', PRO_ONLY_MODEL_ID, null],
      ['starter', FREE_MODEL_ID, FREE_MODEL_ID],
    ])('tier %s with stored %j returns %j', (tier, stored, expected) => {
      expect(resolveSavedPreferenceForSettings(tier, stored)).toBe(expected);
    });
  });
});
