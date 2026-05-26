import {
  collectOpenRouterStream,
  createOpenRouterMockClient,
  OPENROUTER_SAMPLE_INPUT,
  OPENROUTER_TEST_MODEL,
} from './openrouter-test-helpers';
import { ProviderInvalidResponseError } from '@/features/ai/providers/errors';
import { OpenRouterProvider } from '@/features/ai/providers/openrouter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('OpenRouterProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('OPENROUTER_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('error handling', () => {
    it('throws ProviderInvalidResponseError when response is empty', async () => {
      const { client, send } = createOpenRouterMockClient();
      send
        .mockResolvedValueOnce({
          choices: [],
        })
        .mockResolvedValueOnce({
          choices: [],
        });

      const provider = new OpenRouterProvider(
        { model: OPENROUTER_TEST_MODEL },
        client,
      );

      await expect(provider.generate(OPENROUTER_SAMPLE_INPUT)).rejects.toThrow(
        ProviderInvalidResponseError,
      );
      await expect(provider.generate(OPENROUTER_SAMPLE_INPUT)).rejects.toThrow(
        'OpenRouter returned an empty response',
      );
    });

    it('throws ProviderInvalidResponseError when content is null', async () => {
      const { client, send } = createOpenRouterMockClient();
      send.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
            },
          },
        ],
      });

      const provider = new OpenRouterProvider(
        { model: OPENROUTER_TEST_MODEL },
        client,
      );

      await expect(provider.generate(OPENROUTER_SAMPLE_INPUT)).rejects.toThrow(
        ProviderInvalidResponseError,
      );
    });

    it('passes raw response text through without provider-level schema validation', async () => {
      const { client, send } = createOpenRouterMockClient();
      send.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: 'not valid json { broken',
            },
          },
        ],
      });

      const provider = new OpenRouterProvider(
        { model: OPENROUTER_TEST_MODEL },
        client,
      );
      const result = await provider.generate(OPENROUTER_SAMPLE_INPUT);
      const rawText = await collectOpenRouterStream(result.stream);

      expect(rawText).toBe('not valid json { broken');
    });

    it('throws ProviderInvalidResponseError when array content has no text items', async () => {
      const { client, send } = createOpenRouterMockClient();
      const noTextContent = {
        choices: [
          {
            message: {
              content: [
                { type: 'image', image_url: 'https://example.com/image.png' },
              ],
            },
          },
        ],
      };
      send
        .mockResolvedValueOnce(noTextContent)
        .mockResolvedValueOnce(noTextContent);

      const provider = new OpenRouterProvider(
        { model: OPENROUTER_TEST_MODEL },
        client,
      );

      await expect(provider.generate(OPENROUTER_SAMPLE_INPUT)).rejects.toThrow(
        ProviderInvalidResponseError,
      );
      await expect(provider.generate(OPENROUTER_SAMPLE_INPUT)).rejects.toThrow(
        'no text content',
      );
    });
  });
});
