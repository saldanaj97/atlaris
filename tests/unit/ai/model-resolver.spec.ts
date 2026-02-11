import { AI_DEFAULT_MODEL } from '@/lib/ai/ai-models';
import { resolveModelForTier } from '@/lib/ai/model-resolver';
import * as providerFactory from '@/lib/ai/provider-factory';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logging/logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Model resolver (Task 2 - Phase 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Free tier users', () => {
    it('returns default model when no model requested', () => {
      const defaultProvider = {
        generate: vi.fn(),
      } as ReturnType<typeof providerFactory.getGenerationProvider>;
      const defaultSpy = vi
        .spyOn(providerFactory, 'getGenerationProvider')
        .mockReturnValue(defaultProvider);
      const modelSpy = vi.spyOn(
        providerFactory,
        'getGenerationProviderWithModel'
      );
      const result = resolveModelForTier('free');

      expect(result.modelId).toBe(AI_DEFAULT_MODEL);
      expect(result.provider).toBe(defaultProvider);
      expect(result.fallback).toBe(true);
      expect(result.fallbackReason).toBe('not_specified');
      expect(defaultSpy).toHaveBeenCalledTimes(1);
      expect(modelSpy).not.toHaveBeenCalled();
    });

    it('allows free tier model', () => {
      const result = resolveModelForTier(
        'free',
        'google/gemini-2.0-flash-exp:free'
      );

      expect(result.modelId).toBe('google/gemini-2.0-flash-exp:free');
      expect(result.fallback).toBe(false);
    });

    it('denies pro model and falls back to default', () => {
      const result = resolveModelForTier('free', 'anthropic/claude-sonnet-4.5');

      expect(result.modelId).toBe(AI_DEFAULT_MODEL);
      expect(result.fallback).toBe(true);
      expect(result.fallbackReason).toBe('tier_denied');
    });

    it('rejects invalid model ID', () => {
      const result = resolveModelForTier('free', 'invalid-model-id');

      expect(result.modelId).toBe(AI_DEFAULT_MODEL);
      expect(result.fallback).toBe(true);
      expect(result.fallbackReason).toBe('invalid_model');
    });
  });

  describe('Starter tier users', () => {
    it('returns default model when no model requested', () => {
      const result = resolveModelForTier('starter');

      expect(result.modelId).toBe(AI_DEFAULT_MODEL);
      expect(result.fallback).toBe(true);
      expect(result.fallbackReason).toBe('not_specified');
    });

    it('gets free models only (same as free tier)', () => {
      const result = resolveModelForTier(
        'starter',
        'google/gemini-2.0-flash-exp:free'
      );

      expect(result.modelId).toBe('google/gemini-2.0-flash-exp:free');
      expect(result.fallback).toBe(false);
    });

    it('denies pro models', () => {
      const result = resolveModelForTier('starter', 'openai/gpt-4o');

      expect(result.modelId).toBe(AI_DEFAULT_MODEL);
      expect(result.fallback).toBe(true);
      expect(result.fallbackReason).toBe('tier_denied');
    });
  });

  describe('Pro tier users', () => {
    it('allows free models', () => {
      const result = resolveModelForTier(
        'pro',
        'google/gemini-2.0-flash-exp:free'
      );

      expect(result.modelId).toBe('google/gemini-2.0-flash-exp:free');
      expect(result.fallback).toBe(false);
    });

    it('allows pro models', () => {
      const result = resolveModelForTier('pro', 'anthropic/claude-sonnet-4.5');

      expect(result.modelId).toBe('anthropic/claude-sonnet-4.5');
      expect(result.fallback).toBe(false);
    });

    it('resolves pro model openai/gpt-4o without fallback', () => {
      const result = resolveModelForTier('pro', 'openai/gpt-4o');

      expect(result.modelId).toBe('openai/gpt-4o');
      expect(result.fallback).toBe(false);
    });

    it('rejects invalid model even for pro', () => {
      const result = resolveModelForTier('pro', 'fake-model');

      expect(result.modelId).toBe(AI_DEFAULT_MODEL);
      expect(result.fallback).toBe(true);
      expect(result.fallbackReason).toBe('invalid_model');
    });

    it.each([
      ['undefined', undefined],
      ["empty string ''", ''],
      ['null', null],
    ] as const)(
      'treats %s as invalid for pro tier: resolves to AI_DEFAULT_MODEL with fallback invalid_model',
      (_label, edgeValue) => {
        const result = resolveModelForTier('pro', edgeValue);

        expect(result.modelId).toBe(AI_DEFAULT_MODEL);
        expect(result.fallback).toBe(true);
        expect(result.fallbackReason).toBe('invalid_model');
      }
    );
  });

  describe('Provider factory errors', () => {
    it('rethrows with contextual details when getGenerationProvider fails', () => {
      const spy = vi.spyOn(providerFactory, 'getGenerationProvider');
      spy.mockImplementationOnce(() => {
        throw new Error('Missing API key');
      });

      expect(() => resolveModelForTier('free')).toThrow(
        /Provider initialization failed \(requestedModel=default, factory=getGenerationProvider\): Missing API key/
      );
    });

    it('rethrows with contextual details when getGenerationProviderWithModel fails', () => {
      const spy = vi.spyOn(providerFactory, 'getGenerationProviderWithModel');
      spy.mockImplementationOnce(() => {
        throw new Error('Invalid model config');
      });

      expect(() =>
        resolveModelForTier('pro', 'anthropic/claude-sonnet-4.5')
      ).toThrow(
        /Provider initialization failed \(requestedModel=anthropic\/claude-sonnet-4\.5, factory=getGenerationProviderWithModel\): Invalid model config/
      );
    });
  });

  describe('Provider selection', () => {
    it('uses default provider when model is the default', () => {
      const defaultProvider = {
        generate: vi.fn(),
      } as ReturnType<typeof providerFactory.getGenerationProvider>;
      const defaultSpy = vi
        .spyOn(providerFactory, 'getGenerationProvider')
        .mockReturnValue(defaultProvider);
      const modelSpy = vi.spyOn(
        providerFactory,
        'getGenerationProviderWithModel'
      );

      const result = resolveModelForTier('free', AI_DEFAULT_MODEL);

      expect(result.modelId).toBe(AI_DEFAULT_MODEL);
      expect(result.provider).toBe(defaultProvider);
      expect(result.fallback).toBe(false);
      expect(defaultSpy).toHaveBeenCalledTimes(1);
      expect(modelSpy).not.toHaveBeenCalled();
    });

    it('uses model-specific provider for non-default model', () => {
      const customProvider = {
        generate: vi.fn(),
      } as ReturnType<typeof providerFactory.getGenerationProviderWithModel>;
      const defaultSpy = vi.spyOn(providerFactory, 'getGenerationProvider');
      const customSpy = vi
        .spyOn(providerFactory, 'getGenerationProviderWithModel')
        .mockReturnValue(customProvider);

      const result = resolveModelForTier('free', 'anthropic/claude-haiku-4.5');

      expect(result.modelId).toBe('anthropic/claude-haiku-4.5');
      expect(result.provider).toBe(customProvider);
      expect(result.fallback).toBe(false);
      expect(customSpy).toHaveBeenCalledWith('anthropic/claude-haiku-4.5');
      expect(defaultSpy).not.toHaveBeenCalled();
    });
  });
});
