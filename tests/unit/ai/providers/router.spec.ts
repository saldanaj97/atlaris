import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_DEFAULT_MODEL } from '@/lib/ai/ai-models';
import type { GenerationInput } from '@/lib/ai/provider';
import {
  RouterGenerationProvider,
  type RouterConfig,
} from '@/lib/ai/providers/router';

vi.mock('@openrouter/sdk', () => {
  return {
    OpenRouter: class {
      chat = {
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
          usage: {
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30,
          },
        }),
      };
    },
  };
});

const mockInput: GenerationInput = {
  topic: 'Test Topic',
  skillLevel: 'beginner',
  learningStyle: 'mixed',
  weeklyHours: 10,
};

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
    it('uses DEFAULT_MODEL when no model is provided', async () => {
      process.env.AI_USE_MOCK = 'false';
      delete process.env.AI_DEFAULT_MODEL;

      const provider = new RouterGenerationProvider();
      const result = await provider.generate(mockInput);

      expect(result.metadata.provider).toBe('openrouter');
      expect(result.metadata.model).toBe(AI_DEFAULT_MODEL);
    });

    it('uses provided model in config', async () => {
      process.env.AI_USE_MOCK = 'false';

      const config: RouterConfig = {
        model: 'anthropic/claude-haiku-4.5',
      };

      const provider = new RouterGenerationProvider(config);
      const result = await provider.generate(mockInput);

      expect(result.metadata.provider).toBe('openrouter');
      expect(result.metadata.model).toBe('anthropic/claude-haiku-4.5');
    });

    it('uses aiEnv.defaultModel when available', async () => {
      process.env.AI_USE_MOCK = 'false';
      process.env.AI_DEFAULT_MODEL = 'openai/gpt-4o-mini';

      const provider = new RouterGenerationProvider();
      const result = await provider.generate(mockInput);

      expect(result.metadata.provider).toBe('openrouter');
      expect(result.metadata.model).toBe('openai/gpt-4o-mini');
    });

    it('uses MockGenerationProvider when useMock is true', async () => {
      const config: RouterConfig = {
        useMock: true,
        model: 'should-be-ignored',
      };

      const provider = new RouterGenerationProvider(config);
      const result = await provider.generate(mockInput);

      expect(result.metadata.provider).toBe('mock');
    });

    it('config.useMock=true overrides AI_USE_MOCK env when set to false', async () => {
      process.env.AI_USE_MOCK = 'false';

      const provider = new RouterGenerationProvider({ useMock: true });
      const result = await provider.generate(mockInput);

      expect(result.metadata.provider).toBe('mock');
    });

    it('config.useMock=false overrides AI_USE_MOCK env when set to true', async () => {
      process.env.AI_USE_MOCK = 'true';
      (process.env as any).NODE_ENV = 'development';

      const provider = new RouterGenerationProvider({
        useMock: false,
        model: 'test/model',
      });
      const result = await provider.generate(mockInput);

      expect(result.metadata.provider).toBe('openrouter');
    });

    it('uses MockGenerationProvider when AI_USE_MOCK is "true" in non-production', async () => {
      process.env.AI_USE_MOCK = 'true';
      (process.env as any).NODE_ENV = 'development';

      const provider = new RouterGenerationProvider();
      const result = await provider.generate(mockInput);

      expect(result.metadata.provider).toBe('mock');
    });

    it('does not include Google AI fallback', async () => {
      process.env.AI_USE_MOCK = 'false';

      const provider = new RouterGenerationProvider({
        model: 'anthropic/claude-haiku-4.5',
      });
      const result = await provider.generate(mockInput);

      expect(result.metadata.provider).toBe('openrouter');
      expect(result.metadata.model).toBe('anthropic/claude-haiku-4.5');
    });
  });

  describe('model configuration priority', () => {
    it('prioritizes config.model over aiEnv.defaultModel', async () => {
      process.env.AI_USE_MOCK = 'false';
      process.env.AI_DEFAULT_MODEL = 'env-default-model';

      const config: RouterConfig = {
        model: 'config-model',
      };

      const provider = new RouterGenerationProvider(config);
      const result = await provider.generate(mockInput);

      expect(result.metadata.provider).toBe('openrouter');
      expect(result.metadata.model).toBe('config-model');
    });

    it('falls back to aiEnv.defaultModel when config.model is not provided', async () => {
      process.env.AI_USE_MOCK = 'false';
      process.env.AI_DEFAULT_MODEL = 'env-default-model';

      const provider = new RouterGenerationProvider({});
      const result = await provider.generate(mockInput);

      expect(result.metadata.provider).toBe('openrouter');
      expect(result.metadata.model).toBe('env-default-model');
    });

    it('falls back to DEFAULT_MODEL when neither config nor env provides model', async () => {
      process.env.AI_USE_MOCK = 'false';
      delete process.env.AI_DEFAULT_MODEL;

      const provider = new RouterGenerationProvider({});
      const result = await provider.generate(mockInput);

      expect(result.metadata.provider).toBe('openrouter');
      expect(result.metadata.model).toBe(AI_DEFAULT_MODEL);
    });
  });

  describe('mock configuration', () => {
    it('respects mock settings in test environment', async () => {
      process.env.VITEST_WORKER_ID = '1';
      process.env.AI_USE_MOCK = 'true';

      const provider = new RouterGenerationProvider();
      const result = await provider.generate(mockInput);

      expect(result.metadata.provider).toBe('mock');
    });

    it('allows real provider in test when AI_USE_MOCK is false', async () => {
      process.env.VITEST_WORKER_ID = '1';
      process.env.AI_USE_MOCK = 'false';

      const provider = new RouterGenerationProvider({
        model: 'test/model',
        useMock: false,
      });
      const result = await provider.generate(mockInput);

      expect(result.metadata.provider).toBe('openrouter');
      expect(result.metadata.model).toBe('test/model');
    });
  });
});
