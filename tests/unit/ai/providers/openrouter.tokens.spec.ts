import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_OUTPUT_TOKEN_CEILING,
  getOutputTokenCeiling,
} from '@/features/ai/cost';
import { OpenRouterProvider } from '@/features/ai/providers/openrouter';
import {
  createOpenRouterMockClient,
  OPENROUTER_SAMPLE_INPUT,
  OPENROUTER_TEST_MODEL,
  VALID_PLAN_RESPONSE,
} from './openrouter-test-helpers';

describe('OpenRouterProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('OPENROUTER_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('output-token ceiling enforcement', () => {
    it('sends maxTokens derived from the model ceiling', async () => {
      const { client, send } = createOpenRouterMockClient();
      send.mockResolvedValueOnce({
        choices: [
          {
            message: { content: JSON.stringify(VALID_PLAN_RESPONSE) },
          },
        ],
      });

      const provider = new OpenRouterProvider(
        { model: OPENROUTER_TEST_MODEL },
        client,
      );
      await provider.generate(OPENROUTER_SAMPLE_INPUT);

      const requestBody = send.mock.calls[0][0] as {
        maxTokens: number;
        model: string;
        [key: string]: unknown;
      };
      expect(requestBody).toHaveProperty('maxTokens');
      expect(typeof requestBody.maxTokens).toBe('number');
      expect(requestBody.maxTokens).toBeGreaterThan(0);
    });

    it('uses model-specific ceiling for models with explicit maxOutputTokens', async () => {
      const { client, send } = createOpenRouterMockClient();
      send.mockResolvedValueOnce({
        choices: [
          {
            message: { content: JSON.stringify(VALID_PLAN_RESPONSE) },
          },
        ],
      });

      // openai/gpt-4o has maxOutputTokens: 64_000
      const provider = new OpenRouterProvider(
        { model: 'openai/gpt-4o' },
        client,
      );
      await provider.generate(OPENROUTER_SAMPLE_INPUT);

      const requestBody = send.mock.calls[0][0] as {
        maxTokens: number;
        [key: string]: unknown;
      };
      expect(requestBody.maxTokens).toBe(
        getOutputTokenCeiling('openai/gpt-4o'),
      );
    });

    it('uses default ceiling for unknown models', async () => {
      const { client, send } = createOpenRouterMockClient();
      send.mockResolvedValueOnce({
        choices: [
          {
            message: { content: JSON.stringify(VALID_PLAN_RESPONSE) },
          },
        ],
      });

      const provider = new OpenRouterProvider(
        { model: 'unknown/model-xyz' },
        client,
      );
      await provider.generate(OPENROUTER_SAMPLE_INPUT);

      const requestBody = send.mock.calls[0][0] as {
        maxTokens: number;
        [key: string]: unknown;
      };
      expect(requestBody.maxTokens).toBe(DEFAULT_OUTPUT_TOKEN_CEILING);
    });
  });
});
