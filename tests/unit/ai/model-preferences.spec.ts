import type { SubscriptionTier } from '@/shared/types/billing.types';

import { getModelsForTier } from '@/features/ai/ai-models';
import {
  MODEL_OPERATIONS,
  STARTER_OUTLINE_REGENERATION_MODEL_IDS,
} from '@/features/ai/model-operation-policy';
import {
  getPersistableModelsForTier,
  isPersistableModelId,
  isRuntimeOnlyModelId,
  resolveEffectivePreference,
  resolveSavedPreferenceForSettings,
  savedModelIdForOperation,
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
    ])('accepts catalog ids that are not runtime-only %s', (id) => {
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

    it('matches the operation policy catalog minus runtime-only ids', () => {
      const tiers = ['free', 'starter', 'pro'] as const;
      for (const tier of tiers) {
        for (const operation of MODEL_OPERATIONS) {
          expect(
            getPersistableModelsForTier(tier, operation).map((m) => m.id),
          ).toEqual(
            getModelsForTier(tier, operation)
              .filter((m) => !isRuntimeOnlyModelId(m.id))
              .map((m) => m.id),
          );
        }
      }
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

  describe('savedModelIdForOperation', () => {
    const saved = {
      preferredAiModel: 'openai/gpt-5.2',
      preferredRegenerationAiModel: 'google/gemini-3-pro-preview',
      preferredLessonAiModel: 'google/gemini-3-flash-preview',
    };

    it('Starter/Free regeneration reuse the outline slot', () => {
      expect(savedModelIdForOperation('starter', saved, 'regeneration')).toBe(
        saved.preferredAiModel,
      );
      expect(savedModelIdForOperation('free', saved, 'regeneration')).toBe(
        saved.preferredAiModel,
      );
    });

    it('Pro regeneration and lesson use their own slots', () => {
      expect(savedModelIdForOperation('pro', saved, 'initial_outline')).toBe(
        saved.preferredAiModel,
      );
      expect(savedModelIdForOperation('pro', saved, 'regeneration')).toBe(
        saved.preferredRegenerationAiModel,
      );
      expect(savedModelIdForOperation('pro', saved, 'lesson')).toBe(
        saved.preferredLessonAiModel,
      );
    });
  });

  describe('resolveEffectivePreference', () => {
    it('returns the saved id when it is allowed for the operation', () => {
      expect(
        resolveEffectivePreference(
          'starter',
          STARTER_MODEL_ID,
          'initial_outline',
        ),
      ).toBe(STARTER_MODEL_ID);
    });

    it('returns the Free router default without treating it as a saved value', () => {
      expect(
        resolveEffectivePreference(
          'free',
          PRO_ONLY_MODEL_ID,
          'initial_outline',
        ),
      ).toBe(AI_DEFAULT_MODEL);
      expect(resolveEffectivePreference('free', null, 'initial_outline')).toBe(
        AI_DEFAULT_MODEL,
      );
    });

    it('uses the Pro lesson default when the lesson slot is empty', () => {
      expect(resolveEffectivePreference('pro', null, 'lesson')).toBe(
        'google/gemini-3-flash-preview',
      );
    });
  });
});
