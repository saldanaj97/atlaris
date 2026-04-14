import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function withServerWindowHiddenAsync<T>(
  run: () => Promise<T>
): Promise<T> {
  const originalWindow = globalThis.window;
  delete (globalThis as Record<string, unknown>).window;

  try {
    return await run();
  } finally {
    (globalThis as Record<string, unknown>).window = originalWindow;
  }
}

async function loadProviderFactory() {
  vi.resetModules();
  const factory = await import('@/features/ai/providers/factory');
  return {
    getGenerationProvider: factory.getGenerationProvider,
    getGenerationProviderWithModel: factory.getGenerationProviderWithModel,
  };
}

describe('AI Provider Factory', () => {
  beforeEach(() => {
    delete process.env.AI_PROVIDER;
    delete process.env.AI_USE_MOCK;
    delete process.env.MOCK_GENERATION_SEED;
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VITEST_WORKER_ID', '1');
  });

  afterEach(() => {
    delete process.env.AI_PROVIDER;
    delete process.env.AI_USE_MOCK;
    delete process.env.MOCK_GENERATION_SEED;
    vi.unstubAllEnvs();
  });

  describe('Test environment behavior', () => {
    it('returns MockGenerationProvider by default in test mode', async () => {
      const { getGenerationProvider } = await loadProviderFactory();
      const provider = getGenerationProvider();

      expect(provider.constructor.name).toBe('MockGenerationProvider');
    });

    it('returns MockGenerationProvider when AI_PROVIDER is "mock"', async () => {
      process.env.AI_PROVIDER = 'mock';
      const { getGenerationProvider } = await loadProviderFactory();

      const provider = getGenerationProvider();

      expect(provider.constructor.name).toBe('MockGenerationProvider');
    });

    it('returns MockGenerationProvider with deterministic seed when MOCK_GENERATION_SEED is set', async () => {
      process.env.AI_PROVIDER = 'mock';
      process.env.MOCK_GENERATION_SEED = '12345';
      const { getGenerationProvider } = await loadProviderFactory();

      const provider = getGenerationProvider();

      expect(provider.constructor.name).toBe('MockGenerationProvider');
    });

    it('handles invalid MOCK_GENERATION_SEED gracefully', async () => {
      process.env.AI_PROVIDER = 'mock';
      process.env.MOCK_GENERATION_SEED = 'not-a-number';
      const { getGenerationProvider } = await loadProviderFactory();

      const provider = getGenerationProvider();

      expect(provider.constructor.name).toBe('MockGenerationProvider');
    });

    it('returns RouterGenerationProvider when AI_USE_MOCK is "false"', async () => {
      process.env.AI_USE_MOCK = 'false';
      const { getGenerationProvider } = await loadProviderFactory();

      const provider = getGenerationProvider();

      expect(provider.constructor.name).toBe('RouterGenerationProvider');
    });

    it('throws for malformed AI_USE_MOCK values instead of treating them as false', async () => {
      process.env.AI_USE_MOCK = 'sometimes';
      const { getGenerationProvider } = await loadProviderFactory();

      try {
        getGenerationProvider();
        expect.fail('Expected malformed AI_USE_MOCK to throw');
      } catch (error) {
        expect(error).toMatchObject({
          name: 'EnvValidationError',
          message: 'AI_USE_MOCK must be one of: true, false, 1, 0',
        });
      }
    });

    it('prioritizes AI_PROVIDER over AI_USE_MOCK', async () => {
      process.env.AI_PROVIDER = 'mock';
      process.env.AI_USE_MOCK = 'false';
      const { getGenerationProvider } = await loadProviderFactory();

      const provider = getGenerationProvider();

      expect(provider.constructor.name).toBe('MockGenerationProvider');
    });

    it('handles case-insensitive AI_PROVIDER values', async () => {
      process.env.AI_PROVIDER = 'MOCK';
      const { getGenerationProvider } = await loadProviderFactory();

      const provider = getGenerationProvider();

      expect(provider.constructor.name).toBe('MockGenerationProvider');
    });

    it('returns RouterGenerationProvider for explicit non-mock providers', async () => {
      const providers = ['openai', 'anthropic', 'google', 'OPENAI'];
      const { getGenerationProvider } = await loadProviderFactory();

      providers.forEach((providerType) => {
        process.env.AI_PROVIDER = providerType;

        const provider = getGenerationProvider();

        expect(provider.constructor.name).toBe('RouterGenerationProvider');
      });
    });
  });

  describe('Production environment behavior', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('VITEST_WORKER_ID', '');
    });

    it('returns RouterGenerationProvider by default in production', async () => {
      const provider = await withServerWindowHiddenAsync(async () => {
        const { getGenerationProvider } = await loadProviderFactory();
        return getGenerationProvider();
      });

      expect(provider.constructor.name).toBe('RouterGenerationProvider');
    });

    it('returns MockGenerationProvider when explicitly set to "mock" in production', async () => {
      process.env.AI_PROVIDER = 'mock';
      const provider = await withServerWindowHiddenAsync(async () => {
        const { getGenerationProvider } = await loadProviderFactory();
        return getGenerationProvider();
      });

      expect(provider.constructor.name).toBe('MockGenerationProvider');
    });

    it('returns RouterGenerationProvider for any non-mock provider in production', async () => {
      process.env.AI_PROVIDER = 'openai';
      const provider = await withServerWindowHiddenAsync(async () => {
        const { getGenerationProvider } = await loadProviderFactory();
        return getGenerationProvider();
      });

      expect(provider.constructor.name).toBe('RouterGenerationProvider');
    });
  });

  describe('Edge cases', () => {
    it('handles empty string AI_PROVIDER', async () => {
      process.env.AI_PROVIDER = '';
      const { getGenerationProvider } = await loadProviderFactory();

      const provider = getGenerationProvider();

      expect(provider.constructor.name).toBe('MockGenerationProvider');
    });

    it('handles whitespace in AI_PROVIDER', async () => {
      process.env.AI_PROVIDER = '  mock  ';
      const { getGenerationProvider } = await loadProviderFactory();

      const provider = getGenerationProvider();

      expect(provider.constructor.name).toBe('MockGenerationProvider');
    });

    it('handles zero as MOCK_GENERATION_SEED', async () => {
      process.env.AI_PROVIDER = 'mock';
      process.env.MOCK_GENERATION_SEED = '0';
      const { getGenerationProvider } = await loadProviderFactory();

      const provider = getGenerationProvider();

      expect(provider.constructor.name).toBe('MockGenerationProvider');
    });

    it('handles negative MOCK_GENERATION_SEED', async () => {
      process.env.AI_PROVIDER = 'mock';
      process.env.MOCK_GENERATION_SEED = '-100';
      const { getGenerationProvider } = await loadProviderFactory();

      const provider = getGenerationProvider();

      expect(provider.constructor.name).toBe('MockGenerationProvider');
    });
  });

  describe('getGenerationProviderWithModel', () => {
    it('returns MockGenerationProvider in test environment by default', async () => {
      const { getGenerationProviderWithModel } = await loadProviderFactory();
      const provider = getGenerationProviderWithModel(
        'google/gemini-2.0-flash-exp:free'
      );

      expect(provider.constructor.name).toBe('MockGenerationProvider');
    });

    it('returns MockGenerationProvider when AI_PROVIDER is "mock"', async () => {
      process.env.AI_PROVIDER = 'mock';
      const { getGenerationProviderWithModel } = await loadProviderFactory();

      const provider = getGenerationProviderWithModel(
        'anthropic/claude-haiku-4.5'
      );

      expect(provider.constructor.name).toBe('MockGenerationProvider');
    });

    it('returns RouterGenerationProvider when AI_USE_MOCK is "false"', async () => {
      process.env.AI_USE_MOCK = 'false';
      const { getGenerationProviderWithModel } = await loadProviderFactory();

      const provider = getGenerationProviderWithModel(
        'google/gemini-2.0-flash-exp:free'
      );

      expect(provider.constructor.name).toBe('RouterGenerationProvider');
    });

    it('accepts any model ID string', async () => {
      process.env.AI_USE_MOCK = 'false';
      const { getGenerationProviderWithModel } = await loadProviderFactory();

      const provider1 = getGenerationProviderWithModel(
        'google/gemini-2.0-flash-exp:free'
      );
      const provider2 = getGenerationProviderWithModel('invalid/model-id');
      const provider3 = getGenerationProviderWithModel(
        'anthropic/claude-haiku-4.5'
      );

      expect(provider1.constructor.name).toBe('RouterGenerationProvider');
      expect(provider2.constructor.name).toBe('RouterGenerationProvider');
      expect(provider3.constructor.name).toBe('RouterGenerationProvider');
    });

    it('respects MOCK_GENERATION_SEED in test environment', async () => {
      process.env.AI_PROVIDER = 'mock';
      process.env.MOCK_GENERATION_SEED = '42';
      const { getGenerationProviderWithModel } = await loadProviderFactory();

      const provider = getGenerationProviderWithModel(
        'google/gemini-2.0-flash-exp:free'
      );

      expect(provider.constructor.name).toBe('MockGenerationProvider');
    });

    it('throws when modelId is empty', async () => {
      process.env.AI_USE_MOCK = 'false';
      const { getGenerationProviderWithModel } = await loadProviderFactory();

      expect(() => getGenerationProviderWithModel('')).toThrow(
        'modelId must be a non-empty string'
      );
    });
  });
});
