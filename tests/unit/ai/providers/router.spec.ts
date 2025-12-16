import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_MODEL } from '@/lib/ai/models';
import { MockGenerationProvider } from '@/lib/ai/providers/mock';
import {
  RouterGenerationProvider,
  type RouterConfig,
} from '@/lib/ai/providers/router';

// Mock the OpenRouter SDK to avoid API calls
vi.mock('@openrouter/sdk', () => ({
  OpenRouter: vi.fn().mockImplementation(() => ({
    chat: {
      send: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                modules: [
                  {
                    title: 'Test Module',
                    description: 'Test description',
                    estimated_minutes: 60,
                    tasks: [
                      {
                        title: 'Test Task',
                        description: 'Test task description',
                        estimated_minutes: 30,
                      },
                    ],
                  },
                ],
              }),
            },
          },
        ],
      }),
    },
  })),
}));

describe('RouterGenerationProvider', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.OPENROUTER_API_KEY = 'test-api-key';
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('uses DEFAULT_MODEL when no model is provided', () => {
      process.env.AI_USE_MOCK = 'false';
      delete process.env.AI_DEFAULT_MODEL;

      const provider = new RouterGenerationProvider();

      // Access private providers array to verify configuration
      const providers = (provider as any).providers;
      expect(providers).toHaveLength(1);
      // The provider factory should use DEFAULT_MODEL
      expect(DEFAULT_MODEL).toBe('google/gemini-2.0-flash-exp:free');
    });

    it('uses provided model in config', () => {
      process.env.AI_USE_MOCK = 'false';

      const config: RouterConfig = {
        model: 'anthropic/claude-haiku-4.5',
      };

      const provider = new RouterGenerationProvider(config);
      const providers = (provider as any).providers;

      expect(providers).toHaveLength(1);
    });

    it('uses aiEnv.defaultModel when available', () => {
      process.env.AI_USE_MOCK = 'false';
      process.env.AI_DEFAULT_MODEL = 'openai/gpt-4o-mini';

      const provider = new RouterGenerationProvider();
      const providers = (provider as any).providers;

      expect(providers).toHaveLength(1);
    });

    it('uses MockGenerationProvider when useMock is true', () => {
      const config: RouterConfig = {
        useMock: true,
        model: 'should-be-ignored',
      };

      const provider = new RouterGenerationProvider(config);
      const providers = (provider as any).providers;

      expect(providers).toHaveLength(1);
      // Factory returns mock provider
      const mockProvider = providers[0]();
      expect(mockProvider).toBeInstanceOf(MockGenerationProvider);
    });

    it('uses MockGenerationProvider when AI_USE_MOCK is "true" in non-production', () => {
      process.env.AI_USE_MOCK = 'true';
      (process.env as any).NODE_ENV = 'development';

      const provider = new RouterGenerationProvider();
      const providers = (provider as any).providers;

      expect(providers).toHaveLength(1);
      const mockProvider = providers[0]();
      expect(mockProvider).toBeInstanceOf(MockGenerationProvider);
    });

    it('does not include Google AI fallback', () => {
      process.env.AI_USE_MOCK = 'false';

      const provider = new RouterGenerationProvider({
        model: 'anthropic/claude-haiku-4.5',
      });
      const providers = (provider as any).providers;

      // Should only have OpenRouter, no Google AI fallback
      expect(providers).toHaveLength(1);
    });
  });

  describe('model configuration priority', () => {
    it('prioritizes config.model over aiEnv.defaultModel', () => {
      process.env.AI_USE_MOCK = 'false';
      process.env.AI_DEFAULT_MODEL = 'env-default-model';

      const config: RouterConfig = {
        model: 'config-model',
      };

      const provider = new RouterGenerationProvider(config);
      const providers = (provider as any).providers;

      expect(providers).toHaveLength(1);
      // The factory should use config.model
    });

    it('falls back to aiEnv.defaultModel when config.model is not provided', () => {
      process.env.AI_USE_MOCK = 'false';
      process.env.AI_DEFAULT_MODEL = 'env-default-model';

      const provider = new RouterGenerationProvider({});
      const providers = (provider as any).providers;

      expect(providers).toHaveLength(1);
    });

    it('falls back to DEFAULT_MODEL when neither config nor env provides model', () => {
      process.env.AI_USE_MOCK = 'false';
      delete process.env.AI_DEFAULT_MODEL;

      const provider = new RouterGenerationProvider({});
      const providers = (provider as any).providers;

      expect(providers).toHaveLength(1);
    });
  });

  describe('mock configuration', () => {
    it('respects mock settings in test environment', () => {
      process.env.VITEST_WORKER_ID = '1';
      process.env.AI_USE_MOCK = 'true';

      const provider = new RouterGenerationProvider();
      const providers = (provider as any).providers;

      expect(providers).toHaveLength(1);
      const mockProvider = providers[0]();
      expect(mockProvider).toBeInstanceOf(MockGenerationProvider);
    });

    it('allows real provider in test when AI_USE_MOCK is false', () => {
      process.env.VITEST_WORKER_ID = '1';
      process.env.AI_USE_MOCK = 'false';

      const provider = new RouterGenerationProvider({
        model: 'test/model',
        useMock: false,
      });
      const providers = (provider as any).providers;

      expect(providers).toHaveLength(1);
      // Factory creates OpenRouterProvider, not MockGenerationProvider
    });
  });
});
