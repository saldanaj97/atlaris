import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { getGenerationProvider } from '@/lib/ai/provider-factory';
import { MockGenerationProvider } from '@/lib/ai/providers/mock';
import { RouterGenerationProvider } from '@/lib/ai/providers/router';

describe('AI Provider Factory', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Test environment behavior', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
    });

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
      process.env.NODE_ENV = 'development';
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
      process.env.NODE_ENV = 'production';
      delete process.env.VITEST_WORKER_ID;
    });

    it('should return RouterGenerationProvider by default in production', () => {
      delete process.env.AI_PROVIDER;

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(RouterGenerationProvider);
    });

    it('should return MockGenerationProvider when explicitly set to "mock" in production', () => {
      process.env.AI_PROVIDER = 'mock';

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });

    it('should return RouterGenerationProvider for any non-mock provider in production', () => {
      process.env.AI_PROVIDER = 'openai';

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(RouterGenerationProvider);
    });
  });

  describe('VITEST_WORKER_ID detection', () => {
    beforeEach(() => {
      delete process.env.NODE_ENV;
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
      process.env.NODE_ENV = 'test';
      process.env.AI_PROVIDER = '';
      delete process.env.AI_USE_MOCK;

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });

    it('should handle whitespace in AI_PROVIDER', () => {
      process.env.NODE_ENV = 'test';
      process.env.AI_PROVIDER = '  mock  ';

      const provider = getGenerationProvider();

      // Should trim and lowercase, resulting in mock provider
      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });

    it('should handle zero as MOCK_GENERATION_SEED', () => {
      process.env.NODE_ENV = 'test';
      process.env.AI_PROVIDER = 'mock';
      process.env.MOCK_GENERATION_SEED = '0';

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });

    it('should handle negative MOCK_GENERATION_SEED', () => {
      process.env.NODE_ENV = 'test';
      process.env.AI_PROVIDER = 'mock';
      process.env.MOCK_GENERATION_SEED = '-100';

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });
  });
});
