import type { SubscriptionTier } from '@/shared/types/billing.types';

import { getModelsForTier } from '@/features/ai/ai-models';
import {
  MODEL_OPERATIONS,
  PRO_GROUNDED_REVIEW_CATALOG,
  PRO_GROUNDED_WRITER_CATALOG,
  STARTER_OUTLINE_REGENERATION_MODEL_IDS,
} from '@/features/ai/model-operation-policy';
import {
  GROUNDED_PICK_ROLES,
  getGroundedPickCatalog,
  getGroundedPickDefault,
  getPersistableModelsForTier,
  resolveGroundedModelPick,
  validateGroundedPick,
  isPersistableModelId,
  isRuntimeOnlyModelId,
  resolveEffectivePreference,
  resolveOverrideOrSavedModelId,
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
      'google/gemini-3-pro-preview',
      'google/gemini-2.0-flash-exp:free',
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
      preferredRegenerationAiModel: 'google/gemini-3.1-pro-preview',
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

  describe('resolveOverrideOrSavedModelId', () => {
    const saved = {
      preferredAiModel: 'openai/gpt-5.2',
      preferredRegenerationAiModel: 'google/gemini-3.1-pro-preview',
      preferredLessonAiModel: 'google/gemini-3-flash-preview',
    };

    it('prefers an explicit override over the saved slot', () => {
      expect(
        resolveOverrideOrSavedModelId(
          'google/gemini-3-flash-preview',
          'pro',
          saved,
          'regeneration',
        ),
      ).toBe('google/gemini-3-flash-preview');
    });

    it('uses the Pro regeneration saved slot when override is omitted', () => {
      expect(
        resolveOverrideOrSavedModelId(undefined, 'pro', saved, 'regeneration'),
      ).toBe(saved.preferredRegenerationAiModel);
    });

    it('uses the Starter outline slot for regeneration when override is omitted', () => {
      expect(
        resolveOverrideOrSavedModelId(
          undefined,
          'starter',
          saved,
          'regeneration',
        ),
      ).toBe(saved.preferredAiModel);
    });

    it('uses the Pro lesson saved slot when override is omitted', () => {
      expect(resolveOverrideOrSavedModelId(null, 'pro', saved, 'lesson')).toBe(
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

    it('falls back to the Pro regeneration default for a retired saved id', () => {
      expect(
        resolveEffectivePreference(
          'pro',
          'google/gemini-3-pro-preview',
          'regeneration',
        ),
      ).toBe('google/gemini-3.1-pro-preview');
    });

    it('hides a retired saved id from the settings picker', () => {
      expect(
        resolveSavedPreferenceForSettings(
          'pro',
          'openai/gpt-4o-mini-search-preview',
          'initial_outline',
        ),
      ).toBeNull();
    });

    it('uses the Pro lesson default when the lesson slot is empty', () => {
      expect(resolveEffectivePreference('pro', null, 'lesson')).toBe(
        'google/gemini-3-flash-preview',
      );
    });
  });
});

describe('grounded model picks', () => {
  const NO_PICKS = {
    preferredWriterAiModel: null,
    preferredVerifierAiModel: null,
    preferredAdvisorAiModel: null,
  };

  it('offers the 1b Pro catalog for each role', () => {
    expect(getGroundedPickCatalog('writer')).toEqual(
      PRO_GROUNDED_WRITER_CATALOG,
    );
    expect(getGroundedPickCatalog('verifier')).toEqual(
      PRO_GROUNDED_REVIEW_CATALOG,
    );
    expect(getGroundedPickCatalog('advisor')).toEqual(
      PRO_GROUNDED_REVIEW_CATALOG,
    );
  });

  it('defaults to the tier primary model and has none where a role does not run', () => {
    expect(getGroundedPickDefault('pro', 'writer')).toBe('openai/gpt-6-sol');
    expect(getGroundedPickDefault('pro', 'verifier')).toBe(
      'anthropic/claude-sonnet-5.5',
    );
    expect(getGroundedPickDefault('pro', 'advisor')).toBe(
      'anthropic/claude-opus-5.5',
    );
    expect(getGroundedPickDefault('free', 'verifier')).toBeNull();
    expect(getGroundedPickDefault('free', 'advisor')).toBeNull();
  });

  it.each(GROUNDED_PICK_ROLES)(
    'accepts a Pro %s pick in the catalog',
    (role) => {
      const [modelId] = getGroundedPickCatalog(role);
      expect(validateGroundedPick('pro', role, modelId ?? '')).toEqual({
        valid: true,
      });
    },
  );

  it.each(['free', 'starter'] as const)(
    'rejects every %s pick, even one in the catalog',
    (tier) => {
      for (const role of GROUNDED_PICK_ROLES) {
        const [modelId] = getGroundedPickCatalog(role);
        expect(validateGroundedPick(tier, role, modelId ?? '')).toEqual({
          valid: false,
          reason: 'tier_denied',
        });
      }
    },
  );

  it.each([
    ['writer', 'anthropic/claude-opus-5.5'],
    ['verifier', 'openai/gpt-6-luna'],
    ['advisor', 'openai/gpt-5.2'],
    ['writer', 'not-a-real-model'],
  ] as const)('rejects an off-catalog Pro %s pick %s', (role, modelId) => {
    expect(validateGroundedPick('pro', role, modelId)).toEqual({
      valid: false,
      reason: 'invalid_model',
    });
  });

  it('uses a valid Pro pick', () => {
    expect(
      resolveGroundedModelPick(
        'pro',
        { ...NO_PICKS, preferredVerifierAiModel: 'openai/gpt-6-sol' },
        'verifier',
      ),
    ).toBe('openai/gpt-6-sol');
  });

  it.each(['starter', 'free'] as const)(
    'falls back to the code-owned models after a downgrade to %s and keeps the stored pick',
    (tier) => {
      const saved = {
        preferredWriterAiModel: 'anthropic/claude-sonnet-5.5',
        preferredVerifierAiModel: 'openai/gpt-6-sol',
        preferredAdvisorAiModel: 'anthropic/claude-haiku-5.5',
      };
      const before = { ...saved };

      for (const role of GROUNDED_PICK_ROLES) {
        expect(resolveGroundedModelPick(tier, saved, role)).toBeNull();
      }
      expect(saved).toEqual(before);
      expect(resolveGroundedModelPick('pro', saved, 'writer')).toBe(
        'anthropic/claude-sonnet-5.5',
      );
    },
  );

  it('ignores an empty or off-catalog stored pick', () => {
    expect(resolveGroundedModelPick('pro', NO_PICKS, 'writer')).toBeNull();
    expect(
      resolveGroundedModelPick(
        'pro',
        { ...NO_PICKS, preferredAdvisorAiModel: 'openai/gpt-5.2' },
        'advisor',
      ),
    ).toBeNull();
  });
});
