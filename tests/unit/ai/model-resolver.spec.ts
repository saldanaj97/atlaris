import type { ModelOperation } from '@/features/ai/model-operation-policy';
import type { AiPlanGenerationProvider } from '@/features/ai/types/provider.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { AI_DEFAULT_MODEL } from '@/features/ai/ai-models';
import { ModelResolutionError } from '@/features/ai/model-resolution-error';
import {
  type ModelResolution,
  resolveModelForTier,
  validateModelForTier,
} from '@/features/ai/model-resolver';
import { describe, expect, it, vi } from 'vitest';

const STARTER_DEFAULT = 'google/gemini-2.5-flash-lite';
const STARTER_OVERRIDE = 'openai/gpt-4o-mini-2024-07-18';
const PRO_OUTLINE_DEFAULT = 'openai/gpt-5.2';
const PRO_REGEN_DEFAULT = 'google/gemini-3-pro-preview';
const PRO_LESSON_DEFAULT = 'google/gemini-3-flash-preview';
const HAIKU_MODEL_ID = 'anthropic/claude-haiku-4.5';
const OTHER_FREE_CATALOG_ID = 'google/gemini-2.0-flash-exp:free';

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

  const resolveWithMockProvider = (
    userTier: SubscriptionTier,
    requestedModel: string | null | undefined,
    operation: ModelOperation,
  ): { result: ModelResolution; providerGetter: ReturnType<typeof vi.fn> } => {
    const provider = createMockProvider();
    const providerGetter = vi.fn(() => provider);
    const result = resolveModelForTier(
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
    it('returns the free router when no model is requested', () => {
      const { result } = resolveWithMockProvider(
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

    it('allows the free router and ignores paid overrides', () => {
      const allowed = resolveWithMockProvider(
        'free',
        AI_DEFAULT_MODEL,
        'initial_outline',
      );
      expectResolution(allowed.result, {
        modelId: AI_DEFAULT_MODEL,
        fallback: false,
      });

      const denied = resolveWithMockProvider(
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

    it('passes operation to the provider factory before work', () => {
      const { providerGetter } = resolveWithMockProvider(
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

    it('falls back before provider when Haiku or another catalog id is requested', () => {
      const haiku = resolveWithMockProvider(
        'free',
        HAIKU_MODEL_ID,
        'initial_outline',
      );
      expectResolution(haiku.result, {
        modelId: AI_DEFAULT_MODEL,
        fallback: true,
        fallbackReason: 'tier_denied',
      });
      expect(haiku.providerGetter).toHaveBeenCalledWith(
        AI_DEFAULT_MODEL,
        'free',
        'initial_outline',
      );

      const otherFree = resolveWithMockProvider(
        'free',
        OTHER_FREE_CATALOG_ID,
        'lesson',
      );
      expectResolution(otherFree.result, {
        modelId: AI_DEFAULT_MODEL,
        fallback: true,
        fallbackReason: 'tier_denied',
      });
    });

    it('rejects invalid model IDs with the operation default', () => {
      const { result } = resolveWithMockProvider(
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
    it('returns valid for an allowed operation model', () => {
      expect(
        validateModelForTier('free', AI_DEFAULT_MODEL, 'initial_outline'),
      ).toEqual({
        valid: true,
      });
    });

    it('returns tier_denied for Haiku on Free/Starter', () => {
      expect(
        validateModelForTier('free', HAIKU_MODEL_ID, 'initial_outline'),
      ).toEqual({
        valid: false,
        reason: 'tier_denied',
      });
      expect(
        validateModelForTier('starter', HAIKU_MODEL_ID, 'regeneration'),
      ).toEqual({
        valid: false,
        reason: 'tier_denied',
      });
    });

    it('returns invalid_model for unknown model id', () => {
      expect(
        validateModelForTier('pro', 'does/not/exist', 'initial_outline'),
      ).toEqual({
        valid: false,
        reason: 'invalid_model',
      });
    });
  });

  describe('Starter tier', () => {
    it('uses the outline default and allows an allowlist override', () => {
      const unspecified = resolveWithMockProvider(
        'starter',
        undefined,
        'initial_outline',
      );
      expectResolution(unspecified.result, {
        modelId: STARTER_DEFAULT,
        fallback: true,
        fallbackReason: 'not_specified',
      });

      const override = resolveWithMockProvider(
        'starter',
        STARTER_OVERRIDE,
        'regeneration',
      );
      expectResolution(override.result, {
        modelId: STARTER_OVERRIDE,
        fallback: false,
      });
    });

    it('does not fall back to openrouter/free for outline/regen', () => {
      const { result } = resolveWithMockProvider(
        'starter',
        PRO_OUTLINE_DEFAULT,
        'initial_outline',
      );

      expectResolution(result, {
        modelId: STARTER_DEFAULT,
        fallback: true,
        fallbackReason: 'tier_denied',
      });
      expect(result.modelId).not.toBe(AI_DEFAULT_MODEL);
    });

    it('ignores a plan preference for lesson and uses the free router', () => {
      const { result, providerGetter } = resolveWithMockProvider(
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
    it('uses independent operation defaults instead of the first catalog row', () => {
      expect(
        resolveWithMockProvider('pro', undefined, 'initial_outline').result
          .modelId,
      ).toBe(PRO_OUTLINE_DEFAULT);
      expect(
        resolveWithMockProvider('pro', undefined, 'regeneration').result
          .modelId,
      ).toBe(PRO_REGEN_DEFAULT);
      expect(
        resolveWithMockProvider('pro', undefined, 'lesson').result.modelId,
      ).toBe(PRO_LESSON_DEFAULT);
    });

    it('allows a Free-labelled catalog model on Pro', () => {
      const { result } = resolveWithMockProvider(
        'pro',
        OTHER_FREE_CATALOG_ID,
        'initial_outline',
      );

      expectResolution(result, {
        modelId: OTHER_FREE_CATALOG_ID,
        fallback: false,
      });
    });

    it('falls back to the operation default for invalid ids', () => {
      const { result } = resolveWithMockProvider(
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
    ] as const)('treats %s as invalid for Pro outline', (_label, edgeValue) => {
      const { result } = resolveWithMockProvider(
        'pro',
        edgeValue,
        'initial_outline',
      );

      expectResolution(result, {
        modelId: PRO_OUTLINE_DEFAULT,
        fallback: true,
        fallbackReason: 'invalid_model',
      });
    });
  });

  describe('Provider factory errors', () => {
    it('throws ModelResolutionError with PROVIDER_INIT_FAILED when provider creation fails for default path', () => {
      const throwingProviderGetter = () => {
        throw new Error('Missing API key');
      };
      let thrown: unknown;
      try {
        resolveModelForTier(
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

    it('throws ModelResolutionError with PROVIDER_INIT_FAILED when provider creation fails for explicit model path', () => {
      const throwingProviderGetter = () => {
        throw new Error('Invalid model config');
      };
      let thrown: unknown;
      try {
        resolveModelForTier(
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
