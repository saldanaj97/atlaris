import { AI_DEFAULT_MODEL, AVAILABLE_MODELS } from '@/lib/ai/ai-models';
import {
  resolveModelForTier,
  validateModelForTier,
  type ModelResolverLogger,
} from '@/lib/ai/model-resolver';
import * as providerFactory from '@/lib/ai/provider-factory';
import { AppError } from '@/lib/api/errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  /** Second free model (non-default) to exercise getGenerationProviderWithModel path */
  const SECOND_FREE_MODEL_ID = getModelIdBy(
    (model) => model.tier === 'free' && model.id !== AI_DEFAULT_MODEL
  );
  let mockLogger: ModelResolverLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    };
  });

  describe('Free tier users', () => {
    it('returns default model when no model requested', () => {
      const defaultProvider = {
        generate: vi.fn(),
      } as ReturnType<typeof providerFactory.getGenerationProviderWithModel>;
      const providerSpy = vi
        .spyOn(providerFactory, 'getGenerationProviderWithModel')
        .mockReturnValue(defaultProvider);
      const result = resolveModelForTier('free', undefined, mockLogger);

      expect(result.modelId).toBe(AI_DEFAULT_MODEL);
      expect(result.provider).toBe(defaultProvider);
      expect(result.fallback).toBe(true);
      expect(result.fallbackReason).toBe('not_specified');
      expect(providerSpy).toHaveBeenCalledTimes(1);
      expect(providerSpy).toHaveBeenCalledWith(AI_DEFAULT_MODEL);
    });

    it('allows free tier model', () => {
      const result = resolveModelForTier('free', FREE_MODEL_ID, mockLogger);

      expect(result.modelId).toBe(FREE_MODEL_ID);
      expect(result.fallback).toBe(false);
    });

    it('denies pro model and falls back to default', () => {
      const result = resolveModelForTier('free', PRO_MODEL_ID, mockLogger);

      expect(result.modelId).toBe(AI_DEFAULT_MODEL);
      expect(result.fallback).toBe(true);
      expect(result.fallbackReason).toBe('tier_denied');
    });

    it('rejects invalid model ID', () => {
      const result = resolveModelForTier(
        'free',
        'invalid-model-id',
        mockLogger
      );

      expect(result.modelId).toBe(AI_DEFAULT_MODEL);
      expect(result.fallback).toBe(true);
      expect(result.fallbackReason).toBe('invalid_model');
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
      const result = resolveModelForTier('starter', undefined, mockLogger);

      expect(result.modelId).toBe(AI_DEFAULT_MODEL);
      expect(result.fallback).toBe(true);
      expect(result.fallbackReason).toBe('not_specified');
    });

    it('gets free models only (same as free tier)', () => {
      const result = resolveModelForTier('starter', FREE_MODEL_ID, mockLogger);

      expect(result.modelId).toBe(FREE_MODEL_ID);
      expect(result.fallback).toBe(false);
    });

    it('denies pro models', () => {
      const result = resolveModelForTier('starter', PRO_MODEL_ID, mockLogger);

      expect(result.modelId).toBe(AI_DEFAULT_MODEL);
      expect(result.fallback).toBe(true);
      expect(result.fallbackReason).toBe('tier_denied');
    });
  });

  describe('Pro tier users', () => {
    it('allows free models', () => {
      const result = resolveModelForTier('pro', FREE_MODEL_ID, mockLogger);

      expect(result.modelId).toBe(FREE_MODEL_ID);
      expect(result.fallback).toBe(false);
    });

    it('allows pro models', () => {
      const result = resolveModelForTier('pro', PRO_MODEL_ID, mockLogger);

      expect(result.modelId).toBe(PRO_MODEL_ID);
      expect(result.fallback).toBe(false);
    });

    it('rejects invalid model even for pro', () => {
      const result = resolveModelForTier('pro', 'fake-model', mockLogger);

      expect(result.modelId).toBe(AI_DEFAULT_MODEL);
      expect(result.fallback).toBe(true);
      expect(result.fallbackReason).toBe('invalid_model');
    });

    it('treats undefined as not_specified for pro tier', () => {
      const result = resolveModelForTier('pro', undefined, mockLogger);

      expect(result.modelId).toBe(AI_DEFAULT_MODEL);
      expect(result.fallback).toBe(true);
      expect(result.fallbackReason).toBe('not_specified');
    });

    it.each([
      ["empty string ''", ''],
      ['null', null],
    ] as const)(
      'treats %s as invalid for pro tier: resolves to AI_DEFAULT_MODEL with fallback invalid_model',
      (_label, edgeValue) => {
        const result = resolveModelForTier('pro', edgeValue, mockLogger);

        expect(result.modelId).toBe(AI_DEFAULT_MODEL);
        expect(result.fallback).toBe(true);
        expect(result.fallbackReason).toBe('invalid_model');
      }
    );
  });

  describe('Provider factory errors', () => {
    it('throws AppError with PROVIDER_INIT_FAILED when provider creation fails for default path', () => {
      const spy = vi.spyOn(providerFactory, 'getGenerationProviderWithModel');
      spy.mockImplementation(() => {
        throw new Error('Missing API key');
      });

      expect(() => resolveModelForTier('free', undefined, mockLogger)).toThrow(
        AppError
      );

      let thrown: AppError | null = null;
      try {
        resolveModelForTier('free', undefined, mockLogger);
      } catch (error) {
        thrown = error as AppError;
      }

      if (!thrown) {
        throw new Error('Expected AppError to be thrown');
      }

      expect(thrown.code()).toBe('PROVIDER_INIT_FAILED');
      expect(thrown.status()).toBe(500);
      expect(thrown.message).toBe('Provider initialization failed.');
    });

    it('throws AppError with PROVIDER_INIT_FAILED when getGenerationProviderWithModel fails', () => {
      expect.assertions(4);
      const spy = vi.spyOn(providerFactory, 'getGenerationProviderWithModel');
      spy.mockImplementationOnce(() => {
        throw new Error('Invalid model config');
      });

      try {
        resolveModelForTier('pro', PRO_MODEL_ID, mockLogger);
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code()).toBe('PROVIDER_INIT_FAILED');
        expect((err as AppError).status()).toBe(500);
        expect((err as AppError).message).toBe(
          'Provider initialization failed.'
        );
      }
    });
  });

  describe('Provider selection', () => {
    it('uses model-specific provider even for default model', () => {
      const defaultProvider = {
        generate: vi.fn(),
      } as ReturnType<typeof providerFactory.getGenerationProviderWithModel>;
      vi.spyOn(
        providerFactory,
        'getGenerationProviderWithModel'
      ).mockReturnValue(defaultProvider);

      const result = resolveModelForTier('free', AI_DEFAULT_MODEL, mockLogger);

      expect(result.modelId).toBe(AI_DEFAULT_MODEL);
      expect(result.provider).toBe(defaultProvider);
      expect(result.fallback).toBe(false);
    });

    it('uses model-specific provider for non-default model', () => {
      const customProvider = {
        generate: vi.fn(),
      } as ReturnType<typeof providerFactory.getGenerationProviderWithModel>;
      const customSpy = vi
        .spyOn(providerFactory, 'getGenerationProviderWithModel')
        .mockReturnValue(customProvider);

      const result = resolveModelForTier(
        'free',
        SECOND_FREE_MODEL_ID,
        mockLogger
      );

      expect(result.modelId).toBe(SECOND_FREE_MODEL_ID);
      expect(result.provider).toBe(customProvider);
      expect(result.fallback).toBe(false);
      expect(customSpy).toHaveBeenCalledWith(SECOND_FREE_MODEL_ID);
    });
  });
});
