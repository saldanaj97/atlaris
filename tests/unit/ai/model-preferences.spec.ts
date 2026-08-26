import type { SubscriptionTier } from '@/shared/types/billing.types';

import { STARTER_OUTLINE_REGENERATION_MODEL_IDS } from '@/features/ai/model-operation-policy';
import {
  getPersistableModelsForTier,
  isPersistableModelId,
  resolveSavedPreferenceForSettings,
} from '@/features/ai/model-preferences';
import { AI_DEFAULT_MODEL } from '@/shared/constants/ai-models';
import { describe, expect, it } from 'vitest';

const STARTER_OUTLINE_MODELS = getPersistableModelsForTier(
  'starter',
  'initial_outline',
);
const PRO_OUTLINE_MODELS = getPersistableModelsForTier(
  'pro',
  'initial_outline',
);
const STARTER_MODEL_ID = STARTER_OUTLINE_MODELS[0]?.id;
const PRO_ONLY_MODEL_ID = PRO_OUTLINE_MODELS.find(
  ({ id }) => !STARTER_OUTLINE_MODELS.some((model) => model.id === id),
)?.id;

if (!STARTER_MODEL_ID || !PRO_ONLY_MODEL_ID) {
  throw new Error('Expected persistable starter and pro model fixtures');
}

describe('model-preferences', () => {
  describe('isPersistableModelId', () => {
    it.each([
      STARTER_MODEL_ID,
      PRO_ONLY_MODEL_ID,
      'anthropic/claude-haiku-4.5',
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
    it('Free persistable lists are empty for every operation', () => {
      expect(getPersistableModelsForTier('free', 'initial_outline')).toEqual(
        [],
      );
      expect(getPersistableModelsForTier('free', 'regeneration')).toEqual([]);
      expect(getPersistableModelsForTier('free', 'lesson')).toEqual([]);
    });

    it('Starter outline/regen persistable lists are the three allowlisted ids', () => {
      expect(
        getPersistableModelsForTier('starter', 'initial_outline').map(
          (m) => m.id,
        ),
      ).toEqual([...STARTER_OUTLINE_REGENERATION_MODEL_IDS]);
      expect(
        getPersistableModelsForTier('starter', 'regeneration').map((m) => m.id),
      ).toEqual([...STARTER_OUTLINE_REGENERATION_MODEL_IDS]);
    });

    it('Starter lesson persistable list is empty', () => {
      expect(getPersistableModelsForTier('starter', 'lesson')).toEqual([]);
    });

    it('Pro persistable list includes paid catalog models and excludes the router', () => {
      const proModels = getPersistableModelsForTier('pro', 'initial_outline');
      expect(proModels.some((m) => m.id === 'openrouter/free')).toBe(false);
      expect(proModels.some((m) => m.id === PRO_ONLY_MODEL_ID)).toBe(true);
      expect(proModels.some((m) => m.id === 'anthropic/claude-haiku-4.5')).toBe(
        true,
      );
    });
  });

  describe('resolveSavedPreferenceForSettings', () => {
    it.each<
      [
        SubscriptionTier,
        string | null | undefined,
        string | null,
        'initial_outline' | 'lesson',
      ]
    >([
      ['free', null, null, 'initial_outline'],
      ['free', undefined, null, 'initial_outline'],
      ['free', '', null, 'initial_outline'],
      ['free', STARTER_MODEL_ID, null, 'initial_outline'],
      ['free', PRO_ONLY_MODEL_ID, null, 'initial_outline'],
      ['free', AI_DEFAULT_MODEL, null, 'initial_outline'],
      ['starter', STARTER_MODEL_ID, STARTER_MODEL_ID, 'initial_outline'],
      ['starter', STARTER_MODEL_ID, null, 'lesson'],
      ['starter', PRO_ONLY_MODEL_ID, null, 'initial_outline'],
      ['pro', PRO_ONLY_MODEL_ID, PRO_ONLY_MODEL_ID, 'initial_outline'],
    ])(
      'tier %s stored %j returns %j for %s',
      (tier, stored, expected, operation) => {
        expect(resolveSavedPreferenceForSettings(tier, stored, operation)).toBe(
          expected,
        );
      },
    );
  });
});
