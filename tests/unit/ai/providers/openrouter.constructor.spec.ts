import {
  collectOpenRouterStream,
  createOpenRouterMockClient,
  OPENROUTER_SAMPLE_INPUT,
  OPENROUTER_TEST_MODEL,
  VALID_PLAN_RESPONSE,
} from './openrouter-test-helpers';
import { AI_DEFAULT_MODEL } from '@/features/ai/ai-models';
import {
  OpenRouterProvider,
  type OpenRouterProviderConfig,
} from '@/features/ai/providers/openrouter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('OpenRouterProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('OPENROUTER_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('constructor', () => {
    it('throws error when model is not provided', () => {
      const { client } = createOpenRouterMockClient();
      expect(
        () => new OpenRouterProvider({} as OpenRouterProviderConfig, client),
      ).toThrow('OpenRouterProvider requires a model to be specified');
    });

    it('throws error when API key is not provided', () => {
      vi.stubEnv('OPENROUTER_API_KEY', '');
      expect(
        () => new OpenRouterProvider({ model: OPENROUTER_TEST_MODEL }),
      ).toThrow('OPENROUTER_API_KEY is not set');
    });

    it('uses custom model when specified', async () => {
      const { client, send } = createOpenRouterMockClient();
      send.mockResolvedValueOnce({
        model: 'anthropic/claude-3-sonnet',
        choices: [
          {
            message: {
              content: JSON.stringify(VALID_PLAN_RESPONSE),
            },
          },
        ],
      });

      const provider = new OpenRouterProvider(
        { model: 'anthropic/claude-3-sonnet' },
        client,
      );

      const result = await provider.generate(OPENROUTER_SAMPLE_INPUT);

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'anthropic/claude-3-sonnet',
        }),
        expect.any(Object),
      );
      expect(result.metadata.model).toBe('anthropic/claude-3-sonnet');
    });

    it('sends fallback routes using models when configured', async () => {
      const { client, send } = createOpenRouterMockClient();
      send.mockResolvedValueOnce({
        model: AI_DEFAULT_MODEL,
        choices: [
          {
            message: {
              content: JSON.stringify(VALID_PLAN_RESPONSE),
            },
          },
        ],
        usage: {
          promptTokens: 20,
          completionTokens: 40,
          totalTokens: 60,
        },
      });

      const provider = new OpenRouterProvider(
        {
          model: 'anthropic/claude-haiku-4.5',
          fallbackModels: [AI_DEFAULT_MODEL],
        },
        client,
      );
      const result = await provider.generate(OPENROUTER_SAMPLE_INPUT);
      await collectOpenRouterStream(result.stream);

      const [request] = send.mock.calls[0] ?? [];
      expect(request).toMatchObject({
        models: ['anthropic/claude-haiku-4.5', AI_DEFAULT_MODEL],
      });
      expect(request).not.toHaveProperty('model');
      expect(result.metadata.model).toBe(AI_DEFAULT_MODEL);
    });
  });
});
