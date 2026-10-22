import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  inMemoryModelCatalogStore,
  MODEL_CATALOG_FIXTURE,
} from '../../fixtures/ai-model-catalog';
import { getModelsForTier } from '@/features/ai/ai-models';
import {
  type ModelOperation,
  MODEL_OPERATIONS,
  PRO_GROUNDED_REVIEW_CATALOG,
  PRO_GROUNDED_WRITER_CATALOG,
} from '@/features/ai/model-operation-policy';
import {
  GROUNDED_PICK_ROLES,
  getGroundedPickCatalog,
  getGroundedPickDefault,
  getPersistableModelsForTier,
  resolveGroundedModelPick,
  resolveGroundedWriterModelId,
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

const STARTER_MODEL_ID = 'deepseek/deepseek-v4.1-flash';
const PRO_ONLY_MODEL_ID = 'anthropic/claude-opus-5.5';
const RETIRED_MODEL_ID = 'google/gemini-3-pro-preview';

const ids = (models: readonly { id: string }[]) =>
  models.map((model) => model.id).sort();

describe('model-preferences', () => {
  describe('isPersistableModelId', () => {
    it.each([STARTER_MODEL_ID, PRO_ONLY_MODEL_ID, RETIRED_MODEL_ID])(
      'accepts model slugs that are not runtime-only %s',
      (id) => {
        expect(isPersistableModelId(id)).toBe(true);
      },
    );

    it.each([
      '',
      AI_DEFAULT_MODEL,
      'not-a-real-model',
      'fake/',
      'too/many/parts/here',
      'openai/',
      'gpt-oss-20b:free',
      '/gpt-6-luna',
      '   ',
    ])('rejects non-persistable or malformed id %j', (id) => {
      expect(isPersistableModelId(id)).toBe(false);
    });
  });

  describe('getPersistableModelsForTier', () => {
    it('Free persistable lists are empty for every operation', async () => {
      for (const operation of MODEL_OPERATIONS) {
        expect(await getPersistableModelsForTier('free', operation)).toEqual(
          [],
        );
      }
    });

    it('Starter outline/regen persistable lists are the Starter guardrail models minus grounded-only ones', async () => {
      const expected = MODEL_CATALOG_FIXTURE.starter
        .map((model) => model.modelId)
        .filter((id) => id !== 'openai/gpt-6.1-sol')
        .sort();
      for (const operation of ['initial_outline', 'regeneration'] as const) {
        expect(
          ids(await getPersistableModelsForTier('starter', operation)),
        ).toEqual(expected);
      }
    });

    it('Starter lesson persistable list is empty', async () => {
      expect(await getPersistableModelsForTier('starter', 'lesson')).toEqual(
        [],
      );
    });

    it('Pro persistable list is the Pro guardrail models without the router', async () => {
      const proModels = await getPersistableModelsForTier(
        'pro',
        'initial_outline',
      );
      expect(ids(proModels)).toEqual(
        MODEL_CATALOG_FIXTURE.pro.map((model) => model.modelId).sort(),
      );
      expect(proModels.some((m) => m.id === AI_DEFAULT_MODEL)).toBe(false);
    });

    it('matches the operation models minus runtime-only ids', async () => {
      for (const tier of ['free', 'starter', 'pro'] as const) {
        for (const operation of MODEL_OPERATIONS) {
          expect(
            (await getPersistableModelsForTier(tier, operation)).map(
              (m) => m.id,
            ),
          ).toEqual(
            (await getModelsForTier(tier, operation))
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
      ['pro', RETIRED_MODEL_ID, null, 'initial_outline'],
    ])(
      'tier %s stored %j returns %j for %s',
      async (tier, stored, expected, operation) => {
        expect(
          await resolveSavedPreferenceForSettings(tier, stored, operation),
        ).toBe(expected);
      },
    );
  });

  describe('savedModelIdForOperation', () => {
    const saved = {
      preferredAiModel: 'openai/gpt-6.1-sol',
      preferredRegenerationAiModel: 'anthropic/claude-sonnet-5.5',
      preferredLessonAiModel: 'anthropic/claude-haiku-5.5',
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
      preferredAiModel: 'openai/gpt-6.1-sol',
      preferredRegenerationAiModel: 'anthropic/claude-sonnet-5.5',
      preferredLessonAiModel: 'anthropic/claude-haiku-5.5',
    };

    it('prefers an explicit override over the saved slot', () => {
      expect(
        resolveOverrideOrSavedModelId(
          'anthropic/claude-haiku-5.5',
          'pro',
          saved,
          'regeneration',
        ),
      ).toBe('anthropic/claude-haiku-5.5');
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
    it('returns the saved id when it is allowed for the operation', async () => {
      expect(
        await resolveEffectivePreference(
          'starter',
          STARTER_MODEL_ID,
          'initial_outline',
        ),
      ).toBe(STARTER_MODEL_ID);
    });

    it('returns the Free router default without treating it as a saved value', async () => {
      expect(
        await resolveEffectivePreference(
          'free',
          PRO_ONLY_MODEL_ID,
          'initial_outline',
        ),
      ).toBe(AI_DEFAULT_MODEL);
      expect(
        await resolveEffectivePreference('free', null, 'initial_outline'),
      ).toBe(AI_DEFAULT_MODEL);
    });

    it('falls back to the Pro regeneration default for a retired saved id', async () => {
      expect(
        await resolveEffectivePreference(
          'pro',
          RETIRED_MODEL_ID,
          'regeneration',
        ),
      ).toBe('anthropic/claude-sonnet-5.5');
    });

    it.each<[SubscriptionTier, ModelOperation, string]>([
      ['starter', 'initial_outline', 'openai/gpt-6-luna'],
      ['starter', 'regeneration', 'openai/gpt-6-luna'],
      ['pro', 'initial_outline', 'openai/gpt-6.1-sol'],
      ['pro', 'regeneration', 'anthropic/claude-sonnet-5.5'],
      ['pro', 'lesson', 'anthropic/claude-haiku-5.5'],
    ])(
      'falls back to the %s %s default once a saved pick leaves the guardrail',
      async (tier, operation, expected) => {
        const saved = tier === 'starter' ? STARTER_MODEL_ID : PRO_ONLY_MODEL_ID;
        expect(await resolveEffectivePreference(tier, saved, operation)).toBe(
          saved,
        );

        await inMemoryModelCatalogStore.replaceTierModels(
          tier,
          MODEL_CATALOG_FIXTURE[tier].filter(
            (model) => model.modelId !== saved,
          ),
          new Date(),
        );

        expect(await resolveEffectivePreference(tier, saved, operation)).toBe(
          expected,
        );
        expect(
          await resolveSavedPreferenceForSettings(tier, saved, operation),
        ).toBeNull();
      },
    );

    it('treats a Starter saved GPT-6.1 Sol pick like one outside the guardrail', async () => {
      const sol = 'openai/gpt-6.1-sol';
      for (const operation of ['initial_outline', 'regeneration'] as const) {
        expect(
          await resolveEffectivePreference('starter', sol, operation),
        ).toBe('openai/gpt-6-luna');
        expect(
          await resolveSavedPreferenceForSettings('starter', sol, operation),
        ).toBeNull();
      }
      expect(await resolveEffectivePreference('pro', sol, 'regeneration')).toBe(
        sol,
      );
    });

    it('uses the Pro lesson default when the lesson slot is empty', async () => {
      expect(await resolveEffectivePreference('pro', null, 'lesson')).toBe(
        'anthropic/claude-haiku-5.5',
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
    ['advisor', 'deepseek/deepseek-v4.1-flash'],
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
        {
          ...NO_PICKS,
          preferredAdvisorAiModel: 'deepseek/deepseek-v4.1-flash',
        },
        'advisor',
      ),
    ).toBeNull();
  });
});

describe('resolveGroundedWriterModelId', () => {
  const PICKS = {
    preferredWriterAiModel: 'anthropic/claude-haiku-5.5',
    preferredVerifierAiModel: null,
    preferredAdvisorAiModel: null,
  };

  it('uses the Pro writer pick when there is no override', () => {
    expect(resolveGroundedWriterModelId('pro', undefined, PICKS)).toBe(
      'anthropic/claude-haiku-5.5',
    );
  });

  it('lets an explicit override beat the saved pick', () => {
    expect(
      resolveGroundedWriterModelId('pro', 'openai/gpt-6.1-sol', PICKS),
    ).toBe('openai/gpt-6.1-sol');
  });

  it('falls back to the saved pick when the override is off the writer catalog', () => {
    expect(
      resolveGroundedWriterModelId('pro', 'openai/gpt-4o-mini', PICKS),
    ).toBe('anthropic/claude-haiku-5.5');
  });

  it('ignores an off-catalog override when Pro saved no pick', () => {
    expect(
      resolveGroundedWriterModelId('pro', 'openai/gpt-4o-mini', {
        ...PICKS,
        preferredWriterAiModel: null,
      }),
    ).toBeNull();
  });

  it.each(['starter', 'free'] as const)(
    'ignores an override for %s',
    (tier) => {
      expect(
        resolveGroundedWriterModelId(tier, 'openai/gpt-6.1-sol', PICKS),
      ).toBeNull();
    },
  );

  it.each([null, undefined, ''])(
    'ignores an empty override (%s)',
    (override) => {
      expect(resolveGroundedWriterModelId('pro', override, PICKS)).toBe(
        'anthropic/claude-haiku-5.5',
      );
    },
  );

  it('falls back to the tier writers when Pro saved no pick or an off-catalog one', () => {
    expect(
      resolveGroundedWriterModelId('pro', undefined, {
        ...PICKS,
        preferredWriterAiModel: null,
      }),
    ).toBeNull();
    expect(
      resolveGroundedWriterModelId('pro', undefined, {
        ...PICKS,
        preferredWriterAiModel: 'deepseek/deepseek-v4.1-flash',
      }),
    ).toBeNull();
  });

  it.each(['starter', 'free'] as const)(
    'ignores a saved %s writer pick',
    (tier) => {
      expect(resolveGroundedWriterModelId(tier, undefined, PICKS)).toBeNull();
    },
  );
});
