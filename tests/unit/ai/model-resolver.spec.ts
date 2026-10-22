import type { ModelOperation } from '@/features/ai/model-operation-policy';
import type { AiPlanGenerationProvider } from '@/features/ai/types/provider.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  inMemoryModelCatalogStore,
  MODEL_CATALOG_FIXTURE,
} from '../../fixtures/ai-model-catalog';
import { AI_DEFAULT_MODEL } from '@/features/ai/ai-models';
import { ModelResolutionError } from '@/features/ai/model-resolution-error';
import {
  type ModelResolution,
  resolveModelForTier,
  validateModelForTier,
} from '@/features/ai/model-resolver';
import { logger } from '@/lib/logging/logger';
import * as Sentry from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nextjs')>()),
  captureMessage: vi.fn(),
}));

const STARTER_DEFAULT = 'openai/gpt-6-luna';
const STARTER_OVERRIDE = 'deepseek/deepseek-v4.1-flash';
const PRO_OUTLINE_DEFAULT = 'openai/gpt-6.1-sol';
const PRO_REGEN_DEFAULT = 'anthropic/claude-sonnet-5.5';
const PRO_LESSON_DEFAULT = 'anthropic/claude-haiku-5.5';
const PRO_ONLY_MODEL_ID = 'anthropic/claude-opus-5.5';
const OTHER_CATALOG_ID = 'openai/gpt-6-luna';
/** Former catalog ids that OpenRouter no longer serves; may remain in saved rows. */
const RETIRED_MODEL_IDS = [
  'google/gemini-3-pro-preview',
  'google/gemini-2.0-flash-exp:free',
  'openai/gpt-oss-20b:free',
  'alibaba/tongyi-deepresearch-30b-a3b:free',
  'openai/gpt-4o-mini-search-preview',
] as const;

describe('Model resolver', () => {
  type ResolutionExpectation = Pick<
    ModelResolution,
    'modelId' | 'fallback' | 'fallbackReason'
  >;

  const createMockProvider = (): AiPlanGenerationProvider => ({
    generate: () =>
      Promise.resolve({
        stream: new ReadableStream<string>(),
        metadata: {},
      }),
    generateModuleLessonBatch: () =>
      Promise.resolve({
        stream: new ReadableStream<string>(),
        metadata: {},
      }),
  });

  const resolveWithMockProvider = async (
    userTier: SubscriptionTier,
    requestedModel: string | null | undefined,
    operation: ModelOperation,
  ): Promise<{
    result: ModelResolution;
    providerGetter: ReturnType<typeof vi.fn>;
  }> => {
    const provider = createMockProvider();
    const providerGetter = vi.fn(() => provider);
    const result = await resolveModelForTier(
      userTier,
      requestedModel,
      operation,
      providerGetter,
    );
    return { result, providerGetter };
  };

  const expectResolution = (
    result: ModelResolution,
    expected: ResolutionExpectation,
  ): void => {
    expect(result.modelId).toBe(expected.modelId);
    expect(result.fallback).toBe(expected.fallback);
    expect(result.fallbackReason).toBe(expected.fallbackReason);
  };

  describe('Free tier', () => {
    it('returns the free router when no model is requested', async () => {
      const { result } = await resolveWithMockProvider(
        'free',
        undefined,
        'initial_outline',
      );

      expectResolution(result, {
        modelId: AI_DEFAULT_MODEL,
        fallback: true,
        fallbackReason: 'not_specified',
      });
    });

    it('allows the free router and ignores paid overrides', async () => {
      const allowed = await resolveWithMockProvider(
        'free',
        AI_DEFAULT_MODEL,
        'initial_outline',
      );
      expectResolution(allowed.result, {
        modelId: AI_DEFAULT_MODEL,
        fallback: false,
      });

      const denied = await resolveWithMockProvider(
        'free',
        PRO_OUTLINE_DEFAULT,
        'initial_outline',
      );
      expectResolution(denied.result, {
        modelId: AI_DEFAULT_MODEL,
        fallback: true,
        fallbackReason: 'tier_denied',
      });
    });

    it('passes operation to the provider factory before work', async () => {
      const { providerGetter } = await resolveWithMockProvider(
        'free',
        AI_DEFAULT_MODEL,
        'lesson',
      );

      expect(providerGetter).toHaveBeenCalledWith(
        AI_DEFAULT_MODEL,
        'free',
        'lesson',
      );
    });

    it('falls back before provider when a Pro-only catalog id is requested', async () => {
      const proOnly = await resolveWithMockProvider(
        'free',
        PRO_ONLY_MODEL_ID,
        'initial_outline',
      );
      expectResolution(proOnly.result, {
        modelId: AI_DEFAULT_MODEL,
        fallback: true,
        fallbackReason: 'tier_denied',
      });
      expect(proOnly.providerGetter).toHaveBeenCalledWith(
        AI_DEFAULT_MODEL,
        'free',
        'initial_outline',
      );

      const otherCatalog = await resolveWithMockProvider(
        'free',
        OTHER_CATALOG_ID,
        'lesson',
      );
      expectResolution(otherCatalog.result, {
        modelId: AI_DEFAULT_MODEL,
        fallback: true,
        fallbackReason: 'tier_denied',
      });
    });

    it('rejects invalid model IDs with the operation default', async () => {
      const { result } = await resolveWithMockProvider(
        'free',
        'invalid-model-id',
        'initial_outline',
      );

      expectResolution(result, {
        modelId: AI_DEFAULT_MODEL,
        fallback: true,
        fallbackReason: 'invalid_model',
      });
    });
  });

  describe('validateModelForTier', () => {
    it('returns valid for an allowed operation model', async () => {
      expect(
        await validateModelForTier('free', AI_DEFAULT_MODEL, 'initial_outline'),
      ).toEqual({
        valid: true,
      });
    });

    it('returns tier_denied for a Pro-only model on Free/Starter', async () => {
      expect(
        await validateModelForTier(
          'free',
          PRO_ONLY_MODEL_ID,
          'initial_outline',
        ),
      ).toEqual({
        valid: false,
        reason: 'tier_denied',
      });
      expect(
        await validateModelForTier(
          'starter',
          PRO_ONLY_MODEL_ID,
          'regeneration',
        ),
      ).toEqual({
        valid: false,
        reason: 'tier_denied',
      });
    });

    it('allows DeepSeek for Starter outline and regeneration only', async () => {
      const deepseek = 'deepseek/deepseek-v4.1-flash';
      for (const operation of ['initial_outline', 'regeneration'] as const) {
        expect(
          await validateModelForTier('starter', deepseek, operation),
        ).toEqual({
          valid: true,
        });
      }
      for (const operation of [
        'initial_outline',
        'regeneration',
        'lesson',
      ] as const) {
        expect(await validateModelForTier('pro', deepseek, operation)).toEqual({
          valid: false,
          reason: 'tier_denied',
        });
      }
    });

    it('follows the synced guardrail list, not a code list', async () => {
      const added = {
        ...MODEL_CATALOG_FIXTURE.starter[0]!,
        modelId: 'vendor/new-guardrail-model',
      };
      await inMemoryModelCatalogStore.replaceTierModels(
        'starter',
        [
          ...MODEL_CATALOG_FIXTURE.starter.filter(
            (model) => model.modelId !== 'deepseek/deepseek-v4.1-flash',
          ),
          added,
        ],
        new Date(),
      );

      expect(
        await validateModelForTier('starter', added.modelId, 'regeneration'),
      ).toEqual({ valid: true });
      expect(
        await validateModelForTier(
          'starter',
          'deepseek/deepseek-v4.1-flash',
          'regeneration',
        ),
      ).toEqual({ valid: false, reason: 'invalid_model' });
    });

    it('returns invalid_model for unknown model id', async () => {
      expect(
        await validateModelForTier('pro', 'does/not/exist', 'initial_outline'),
      ).toEqual({
        valid: false,
        reason: 'invalid_model',
      });
    });
  });

  describe('Starter tier', () => {
    it('uses the outline default and allows an allowlist override', async () => {
      const unspecified = await resolveWithMockProvider(
        'starter',
        undefined,
        'initial_outline',
      );
      expectResolution(unspecified.result, {
        modelId: STARTER_DEFAULT,
        fallback: true,
        fallbackReason: 'not_specified',
      });

      const override = await resolveWithMockProvider(
        'starter',
        STARTER_OVERRIDE,
        'regeneration',
      );
      expectResolution(override.result, {
        modelId: STARTER_OVERRIDE,
        fallback: false,
      });
    });

    it('does not fall back to openrouter/free for outline/regen', async () => {
      const { result } = await resolveWithMockProvider(
        'starter',
        PRO_ONLY_MODEL_ID,
        'initial_outline',
      );

      expectResolution(result, {
        modelId: STARTER_DEFAULT,
        fallback: true,
        fallbackReason: 'tier_denied',
      });
      expect(result.modelId).not.toBe(AI_DEFAULT_MODEL);
    });

    it('falls back from GPT-6.1 Sol, which Starter keeps for grounded roles only', async () => {
      const sol = 'openai/gpt-6.1-sol';
      expect(
        MODEL_CATALOG_FIXTURE.starter.map((model) => model.modelId),
      ).toContain(sol);
      for (const operation of ['initial_outline', 'regeneration'] as const) {
        expect(await validateModelForTier('starter', sol, operation)).toEqual({
          valid: false,
          reason: 'tier_denied',
        });
        const { result } = await resolveWithMockProvider(
          'starter',
          sol,
          operation,
        );
        expectResolution(result, {
          modelId: STARTER_DEFAULT,
          fallback: true,
          fallbackReason: 'tier_denied',
        });
      }
      expect(await validateModelForTier('pro', sol, 'initial_outline')).toEqual(
        { valid: true },
      );
    });

    it('ignores a plan preference for lesson and uses the free router', async () => {
      const { result, providerGetter } = await resolveWithMockProvider(
        'starter',
        STARTER_DEFAULT,
        'lesson',
      );

      expectResolution(result, {
        modelId: AI_DEFAULT_MODEL,
        fallback: true,
        fallbackReason: 'tier_denied',
      });
      expect(providerGetter).toHaveBeenCalledWith(
        AI_DEFAULT_MODEL,
        'starter',
        'lesson',
      );
    });
  });

  describe('Pro tier', () => {
    it('uses independent operation defaults instead of the first catalog row', async () => {
      expect(
        (await resolveWithMockProvider('pro', undefined, 'initial_outline'))
          .result.modelId,
      ).toBe(PRO_OUTLINE_DEFAULT);
      expect(
        (await resolveWithMockProvider('pro', undefined, 'regeneration')).result
          .modelId,
      ).toBe(PRO_REGEN_DEFAULT);
      expect(
        (await resolveWithMockProvider('pro', undefined, 'lesson')).result
          .modelId,
      ).toBe(PRO_LESSON_DEFAULT);
    });

    it('allows the Free-labelled router on Pro', async () => {
      const { result } = await resolveWithMockProvider(
        'pro',
        AI_DEFAULT_MODEL,
        'initial_outline',
      );

      expectResolution(result, {
        modelId: AI_DEFAULT_MODEL,
        fallback: false,
      });
    });

    it.each(RETIRED_MODEL_IDS)(
      'falls back to the regeneration default before the provider for retired id %s',
      async (retiredId) => {
        const { result, providerGetter } = await resolveWithMockProvider(
          'pro',
          retiredId,
          'regeneration',
        );

        expectResolution(result, {
          modelId: PRO_REGEN_DEFAULT,
          fallback: true,
          fallbackReason: 'invalid_model',
        });
        expect(providerGetter).toHaveBeenCalledWith(
          PRO_REGEN_DEFAULT,
          'pro',
          'regeneration',
        );
        expect(providerGetter).not.toHaveBeenCalledWith(
          retiredId,
          expect.anything(),
          expect.anything(),
        );
      },
    );

    it('falls back to the operation default for invalid ids', async () => {
      const { result } = await resolveWithMockProvider(
        'pro',
        'fake-model',
        'regeneration',
      );

      expectResolution(result, {
        modelId: PRO_REGEN_DEFAULT,
        fallback: true,
        fallbackReason: 'invalid_model',
      });
    });

    it.each([
      ["empty string ''", ''],
      ['null', null],
    ] as const)(
      'treats %s as invalid for Pro outline',
      async (_label, edgeValue) => {
        const { result } = await resolveWithMockProvider(
          'pro',
          edgeValue,
          'initial_outline',
        );

        expectResolution(result, {
          modelId: PRO_OUTLINE_DEFAULT,
          fallback: true,
          fallbackReason: 'invalid_model',
        });
      },
    );
  });

  describe('Free-router fallback', () => {
    beforeEach(async () => {
      // Starter's default (Luna) and its writer-route fallback (DeepSeek) left
      // the guardrail, so the default becomes the free router.
      await inMemoryModelCatalogStore.replaceTierModels(
        'starter',
        MODEL_CATALOG_FIXTURE.starter.filter(
          (model) =>
            model.modelId !== STARTER_DEFAULT &&
            model.modelId !== STARTER_OVERRIDE,
        ),
        new Date(),
      );
      vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.mocked(Sentry.captureMessage).mockClear();
    });

    it('flags the generation and alerts once', async () => {
      const { result } = await resolveWithMockProvider(
        'starter',
        undefined,
        'initial_outline',
      );

      expect(result).toMatchObject({
        modelId: AI_DEFAULT_MODEL,
        fallbackReason: 'not_specified',
        freeRouterFallback: true,
      });
      expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          level: 'error',
          fingerprint: [
            'model_free_router_fallback',
            'starter',
            'initial_outline',
          ],
        }),
      );
    });

    it('does not alert on lookups or a still-listed requested model', async () => {
      await validateModelForTier('starter', STARTER_DEFAULT, 'initial_outline');
      const { result } = await resolveWithMockProvider(
        'starter',
        'anthropic/claude-haiku-5.5',
        'initial_outline',
      );

      expect(result.modelId).toBe('anthropic/claude-haiku-5.5');
      expect(result.freeRouterFallback).toBeUndefined();
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });
  });

  describe('Provider factory errors', () => {
    it('throws ModelResolutionError with PROVIDER_INIT_FAILED when provider creation fails for default path', async () => {
      const throwingProviderGetter = () => {
        throw new Error('Missing API key');
      };
      let thrown: unknown;
      try {
        await resolveModelForTier(
          'free',
          undefined,
          'initial_outline',
          throwingProviderGetter,
        );
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(ModelResolutionError);
      expect((thrown as ModelResolutionError).code).toBe(
        'PROVIDER_INIT_FAILED',
      );
      expect((thrown as ModelResolutionError).message).toBe(
        'Provider initialization failed.',
      );
    });

    it('throws ModelResolutionError with PROVIDER_INIT_FAILED when provider creation fails for explicit model path', async () => {
      const throwingProviderGetter = () => {
        throw new Error('Invalid model config');
      };
      let thrown: unknown;
      try {
        await resolveModelForTier(
          'pro',
          PRO_OUTLINE_DEFAULT,
          'initial_outline',
          throwingProviderGetter,
        );
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(ModelResolutionError);
      expect((thrown as ModelResolutionError).code).toBe(
        'PROVIDER_INIT_FAILED',
      );
      expect((thrown as ModelResolutionError).message).toBe(
        'Provider initialization failed.',
      );
    });
  });
});
