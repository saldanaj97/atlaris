import {
  getGenerationProvider,
  getGenerationProviderWithModel,
} from '@/lib/ai/provider-factory';
import { MockGenerationProvider } from '@/lib/ai/providers/mock';
import { RouterGenerationProvider } from '@/lib/ai/providers/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('AI Provider Factory', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Test environment behavior', () => {
    it('should return MockGenerationProvider by default in test mode', () => {
      delete process.env.AI_PROVIDER;
      delete process.env.AI_USE_MOCK;
      delete process.env.MOCK_GENERATION_SEED;

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });

    it('should return MockGenerationProvider when AI_PROVIDER is "mock"', () => {
      process.env.AI_PROVIDER = 'mock';
      delete process.env.MOCK_GENERATION_SEED;

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });

    it('should return MockGenerationProvider with deterministic seed when MOCK_GENERATION_SEED is set', () => {
      process.env.AI_PROVIDER = 'mock';
      process.env.MOCK_GENERATION_SEED = '12345';

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(MockGenerationProvider);
      // Note: We can't directly test the seed value, but we verify it doesn't throw
    });

    it('should handle invalid MOCK_GENERATION_SEED gracefully', () => {
      process.env.AI_PROVIDER = 'mock';
      process.env.MOCK_GENERATION_SEED = 'not-a-number';

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });

    it('should return RouterGenerationProvider when AI_PROVIDER is not "mock"', () => {
      process.env.AI_PROVIDER = 'openai';

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(RouterGenerationProvider);
    });

    it('should return RouterGenerationProvider when AI_USE_MOCK is "false"', () => {
      delete process.env.AI_PROVIDER;
      process.env.AI_USE_MOCK = 'false';

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(RouterGenerationProvider);
    });

    it('should prioritize AI_PROVIDER over AI_USE_MOCK', () => {
      process.env.AI_PROVIDER = 'mock';
      process.env.AI_USE_MOCK = 'false';

      const provider = getGenerationProvider();

      // AI_PROVIDER=mock should take precedence
      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });

    it('should handle case-insensitive AI_PROVIDER values', () => {
      process.env.AI_PROVIDER = 'MOCK';

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });

    it('should return RouterGenerationProvider for explicit non-mock providers', () => {
      const providers = ['openai', 'anthropic', 'google', 'OPENAI'];

      providers.forEach((providerType) => {
        process.env.AI_PROVIDER = providerType;

        const provider = getGenerationProvider();

        expect(provider).toBeInstanceOf(RouterGenerationProvider);
      });
    });
  });

  describe('Development environment behavior', () => {
    beforeEach(() => {
      delete process.env.VITEST_WORKER_ID;
    });

    it('should return MockGenerationProvider by default in development', () => {
      delete process.env.AI_PROVIDER;

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });

    it('should return MockGenerationProvider when AI_PROVIDER is "mock" in development', () => {
      process.env.AI_PROVIDER = 'mock';

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });

    it('should return RouterGenerationProvider when AI_PROVIDER is set to non-mock in development', () => {
      process.env.AI_PROVIDER = 'openai';

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(RouterGenerationProvider);
    });

    it('should respect MOCK_GENERATION_SEED in development', () => {
      process.env.AI_PROVIDER = 'mock';
      process.env.MOCK_GENERATION_SEED = '99999';

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });
  });

  describe('Production environment behavior', () => {
    beforeEach(() => {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.VITEST_WORKER_ID;
    });

    afterEach(() => {
      // Restore window if it was hidden
      if (!globalThis.window) {
        (globalThis as any).window = undefined;
      }
    });

    it('should return RouterGenerationProvider by default in production', () => {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.AI_PROVIDER;

      // Hide window temporarily for this production test (simulating server env)
      const originalWindow = globalThis.window;
      delete (globalThis as any).window;

      const provider = getGenerationProvider();

      (globalThis as any).window = originalWindow;
      expect(provider).toBeInstanceOf(RouterGenerationProvider);
    });

    it('should return MockGenerationProvider when explicitly set to "mock" in production', () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.AI_PROVIDER = 'mock';

      // Hide window temporarily for this production test (simulating server env)
      const originalWindow = globalThis.window;
      delete (globalThis as any).window;

      const provider = getGenerationProvider();

      (globalThis as any).window = originalWindow;
      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });

    it('should return RouterGenerationProvider for any non-mock provider in production', () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.AI_PROVIDER = 'openai';

      // Hide window temporarily for this production test (simulating server env)
      const originalWindow = globalThis.window;
      delete (globalThis as any).window;

      const provider = getGenerationProvider();

      (globalThis as any).window = originalWindow;
      expect(provider).toBeInstanceOf(RouterGenerationProvider);
    });
  });

  describe('VITEST_WORKER_ID detection', () => {
    beforeEach(() => {
      process.env.VITEST_WORKER_ID = '1';
    });

    it('should treat environment as test when VITEST_WORKER_ID is set', () => {
      delete process.env.AI_PROVIDER;
      delete process.env.AI_USE_MOCK;

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });

    it('should respect AI_USE_MOCK=false even with VITEST_WORKER_ID', () => {
      delete process.env.AI_PROVIDER;
      process.env.AI_USE_MOCK = 'false';

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(RouterGenerationProvider);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string AI_PROVIDER', () => {
      process.env.AI_PROVIDER = '';
      delete process.env.AI_USE_MOCK;

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });

    it('should handle whitespace in AI_PROVIDER', () => {
      process.env.AI_PROVIDER = '  mock  ';

      const provider = getGenerationProvider();

      // Should trim and lowercase, resulting in mock provider
      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });

    it('should handle zero as MOCK_GENERATION_SEED', () => {
      process.env.AI_PROVIDER = 'mock';
      process.env.MOCK_GENERATION_SEED = '0';

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });

    it('should handle negative MOCK_GENERATION_SEED', () => {
      process.env.AI_PROVIDER = 'mock';
      process.env.MOCK_GENERATION_SEED = '-100';

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });
  });

  describe('getGenerationProviderWithModel', () => {
    it('should return MockGenerationProvider in test environment by default', () => {
      delete process.env.AI_PROVIDER;
      delete process.env.AI_USE_MOCK;

      const provider = getGenerationProviderWithModel(
        'google/gemini-2.0-flash-exp:free'
      );

      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });

    it('should return MockGenerationProvider when AI_PROVIDER is "mock"', () => {
      process.env.AI_PROVIDER = 'mock';

      const provider = getGenerationProviderWithModel(
        'anthropic/claude-haiku-4.5'
      );

      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });

    it('should return RouterGenerationProvider when AI_USE_MOCK is "false"', () => {
      delete process.env.AI_PROVIDER;
      process.env.AI_USE_MOCK = 'false';

      const provider = getGenerationProviderWithModel(
        'google/gemini-2.0-flash-exp:free'
      );

      expect(provider).toBeInstanceOf(RouterGenerationProvider);
    });

    it('should accept any model ID string', () => {
      // In test environment with AI_USE_MOCK=false, still verify different model IDs work
      process.env.AI_USE_MOCK = 'false';
      delete process.env.AI_PROVIDER;

      // Valid model ID
      const provider1 = getGenerationProviderWithModel(
        'google/gemini-2.0-flash-exp:free'
      );
      expect(provider1).toBeInstanceOf(RouterGenerationProvider);

      // Even invalid model IDs are passed through (validation happens elsewhere)
      const provider2 = getGenerationProviderWithModel('invalid/model-id');
      expect(provider2).toBeInstanceOf(RouterGenerationProvider);

      // Different valid model
      const provider3 = getGenerationProviderWithModel(
        'anthropic/claude-haiku-4.5'
      );
      expect(provider3).toBeInstanceOf(RouterGenerationProvider);
    });

    it('should respect MOCK_GENERATION_SEED in test environment', () => {
      process.env.AI_PROVIDER = 'mock';
      process.env.MOCK_GENERATION_SEED = '42';

      const provider = getGenerationProviderWithModel(
        'google/gemini-2.0-flash-exp:free'
      );

      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });
  });
});
