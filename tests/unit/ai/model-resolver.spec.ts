import { describe, expect, it } from 'vitest';
import { AI_DEFAULT_MODEL, AVAILABLE_MODELS } from '@/features/ai/ai-models';
import { ModelResolutionError } from '@/features/ai/model-resolution-error';
import {
  type ModelResolution,
  resolveModelForTier,
  validateModelForTier,
} from '@/features/ai/model-resolver';
import type { AiPlanGenerationProvider } from '@/features/ai/types/provider.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

describe('Model resolver (Task 2 - Phase 2)', () => {
  const getModelIdBy = (
    predicate: (model: (typeof AVAILABLE_MODELS)[number]) => boolean
  ): string => {
    const model = AVAILABLE_MODELS.find(predicate);
    if (!model) {
      throw new Error('Expected model fixture to exist in AVAILABLE_MODELS');
    }
    return model.id;
  };

  const FREE_MODEL_ID = getModelIdBy((model) => model.tier === 'free');
  const PRO_MODEL_ID = getModelIdBy((model) => model.tier === 'pro');
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
  });

  const resolveWithMockProvider = (
    userTier: SubscriptionTier,
    requestedModel?: string | null
  ): { result: ModelResolution } => {
    const provider = createMockProvider();
    const providerGetter = () => provider;
    const result = resolveModelForTier(
      userTier,
      requestedModel,
      providerGetter
    );
    return { result };
  };

  const expectResolution = (
    result: ModelResolution,
    expected: ResolutionExpectation
  ): void => {
    expect(result.modelId).toBe(expected.modelId);
    expect(result.fallback).toBe(expected.fallback);
    expect(result.fallbackReason).toBe(expected.fallbackReason);
  };

  describe('Free tier users', () => {
    it('returns default model when no model requested', () => {
      const { result } = resolveWithMockProvider('free');

      expectResolution(result, {
        modelId: AI_DEFAULT_MODEL,
        fallback: true,
        fallbackReason: 'not_specified',
      });
    });

    it('allows free tier model', () => {
      const { result } = resolveWithMockProvider('free', FREE_MODEL_ID);

      expectResolution(result, {
        modelId: FREE_MODEL_ID,
        fallback: false,
      });
    });

    it('denies pro model and falls back to default', () => {
      const { result } = resolveWithMockProvider('free', PRO_MODEL_ID);

      expectResolution(result, {
        modelId: AI_DEFAULT_MODEL,
        fallback: true,
        fallbackReason: 'tier_denied',
      });
    });

    it('rejects invalid model ID', () => {
      const { result } = resolveWithMockProvider('free', 'invalid-model-id');

      expectResolution(result, {
        modelId: AI_DEFAULT_MODEL,
        fallback: true,
        fallbackReason: 'invalid_model',
      });
    });
  });

  describe('validateModelForTier', () => {
    it('returns valid for allowed tier model', () => {
      expect(validateModelForTier('free', FREE_MODEL_ID)).toEqual({
        valid: true,
      });
    });

    it('returns tier_denied for disallowed tier model', () => {
      expect(validateModelForTier('free', PRO_MODEL_ID)).toEqual({
        valid: false,
        reason: 'tier_denied',
      });
    });

    it('returns invalid_model for unknown model id', () => {
      expect(validateModelForTier('pro', 'does/not/exist')).toEqual({
        valid: false,
        reason: 'invalid_model',
      });
    });
  });

  describe('Starter tier users', () => {
    it('returns default model when no model requested', () => {
      const { result } = resolveWithMockProvider('starter');

      expectResolution(result, {
        modelId: AI_DEFAULT_MODEL,
        fallback: true,
        fallbackReason: 'not_specified',
      });
    });

    it('gets free models only (same as free tier)', () => {
      const { result } = resolveWithMockProvider('starter', FREE_MODEL_ID);

      expectResolution(result, {
        modelId: FREE_MODEL_ID,
        fallback: false,
      });
    });

    it('denies pro models', () => {
      const { result } = resolveWithMockProvider('starter', PRO_MODEL_ID);

      expectResolution(result, {
        modelId: AI_DEFAULT_MODEL,
        fallback: true,
        fallbackReason: 'tier_denied',
      });
    });
  });

  describe('Pro tier users', () => {
    it('allows free models', () => {
      const { result } = resolveWithMockProvider('pro', FREE_MODEL_ID);

      expectResolution(result, {
        modelId: FREE_MODEL_ID,
        fallback: false,
      });
    });

    it('allows pro models', () => {
      const { result } = resolveWithMockProvider('pro', PRO_MODEL_ID);

      expectResolution(result, {
        modelId: PRO_MODEL_ID,
        fallback: false,
      });
    });

    it('rejects invalid model even for pro', () => {
      const { result } = resolveWithMockProvider('pro', 'fake-model');

      expectResolution(result, {
        modelId: AI_DEFAULT_MODEL,
        fallback: true,
        fallbackReason: 'invalid_model',
      });
    });

    it('treats undefined as not_specified for pro tier', () => {
      const { result } = resolveWithMockProvider('pro', undefined);

      expectResolution(result, {
        modelId: AI_DEFAULT_MODEL,
        fallback: true,
        fallbackReason: 'not_specified',
      });
    });

    it.each([
      ["empty string ''", ''],
      ['null', null],
    ] as const)('treats %s as invalid for pro tier: resolves to AI_DEFAULT_MODEL with fallback invalid_model', (_label, edgeValue) => {
      const { result } = resolveWithMockProvider('pro', edgeValue);

      expectResolution(result, {
        modelId: AI_DEFAULT_MODEL,
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
        resolveModelForTier('free', undefined, throwingProviderGetter);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(ModelResolutionError);
      expect((thrown as ModelResolutionError).code).toBe(
        'PROVIDER_INIT_FAILED'
      );
      expect((thrown as ModelResolutionError).message).toBe(
        'Provider initialization failed.'
      );
    });

    it('throws ModelResolutionError with PROVIDER_INIT_FAILED when provider creation fails for explicit model path', () => {
      const throwingProviderGetter = () => {
        throw new Error('Invalid model config');
      };
      let thrown: unknown;
      try {
        resolveModelForTier('pro', PRO_MODEL_ID, throwingProviderGetter);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(ModelResolutionError);
      expect((thrown as ModelResolutionError).code).toBe(
        'PROVIDER_INIT_FAILED'
      );
      expect((thrown as ModelResolutionError).message).toBe(
        'Provider initialization failed.'
      );
    });
  });
});
