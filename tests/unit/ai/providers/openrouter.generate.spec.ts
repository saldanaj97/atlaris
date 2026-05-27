import {
  collectOpenRouterStream,
  createOpenRouterMockClient,
  OPENROUTER_SAMPLE_INPUT,
  OPENROUTER_TEST_MODEL,
  VALID_PLAN_RESPONSE,
} from './openrouter-test-helpers';
import { AI_DEFAULT_MODEL } from '@/features/ai/ai-models';
import { DEFAULT_OUTPUT_TOKEN_CEILING } from '@/features/ai/cost';
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

  describe('generate', () => {
    it('generates a valid plan from string content response', async () => {
      const { client, send } = createOpenRouterMockClient();
      send.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify(VALID_PLAN_RESPONSE),
            },
          },
        ],
        usage: {
          promptTokens: 100,
          completionTokens: 500,
          totalTokens: 600,
        },
      });

      const provider = new OpenRouterProvider(
        { model: OPENROUTER_TEST_MODEL },
        client,
      );
      const result = await provider.generate(OPENROUTER_SAMPLE_INPUT);

      const rawText = await collectOpenRouterStream(result.stream);
      const parsed = JSON.parse(rawText);

      expect(parsed.modules).toHaveLength(3);
      expect(parsed.modules[0].title).toBe('Introduction to TypeScript');
      expect(result.metadata.provider).toBe('openrouter');
      expect(result.metadata.model).toBe(OPENROUTER_TEST_MODEL);
    });

    it('generates a valid plan from array content response', async () => {
      const { client, send } = createOpenRouterMockClient();
      send.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: [
                { type: 'text', text: JSON.stringify(VALID_PLAN_RESPONSE) },
              ],
            },
          },
        ],
        usage: {
          promptTokens: 100,
          completionTokens: 500,
          totalTokens: 600,
        },
      });

      const provider = new OpenRouterProvider(
        { model: OPENROUTER_TEST_MODEL },
        client,
      );
      const result = await provider.generate(OPENROUTER_SAMPLE_INPUT);

      const rawText = await collectOpenRouterStream(result.stream);
      const parsed = JSON.parse(rawText);

      expect(parsed.modules).toHaveLength(3);
    });

    it('returns correct usage metadata', async () => {
      const { client, send } = createOpenRouterMockClient();
      send.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify(VALID_PLAN_RESPONSE),
            },
          },
        ],
        usage: {
          promptTokens: 150,
          completionTokens: 750,
          totalTokens: 900,
        },
      });

      const provider = new OpenRouterProvider(
        { model: OPENROUTER_TEST_MODEL },
        client,
      );
      const result = await provider.generate(OPENROUTER_SAMPLE_INPUT);

      expect(result.metadata.usage).toEqual({
        promptTokens: 150,
        completionTokens: 750,
        totalTokens: 900,
        providerReportedCostUsd: undefined,
      });
    });

    it('maps non-streaming usage.cost (USD) to providerReportedCostUsd', async () => {
      const { client, send } = createOpenRouterMockClient();
      send.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify(VALID_PLAN_RESPONSE),
            },
          },
        ],
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          cost: 0.004567,
        },
      });

      const provider = new OpenRouterProvider(
        { model: OPENROUTER_TEST_MODEL },
        client,
      );
      const result = await provider.generate(OPENROUTER_SAMPLE_INPUT);

      expect(result.metadata.usage?.providerReportedCostUsd).toBe(0.004567);
    });

    it('handles missing usage data gracefully', async () => {
      const { client, send } = createOpenRouterMockClient();
      send.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify(VALID_PLAN_RESPONSE),
            },
          },
        ],
      });

      const provider = new OpenRouterProvider(
        { model: OPENROUTER_TEST_MODEL },
        client,
      );
      const result = await provider.generate(OPENROUTER_SAMPLE_INPUT);

      // Missing usage data is reported as undefined (not silently defaulted to 0)
      // so downstream normalization can detect and alert on it.
      expect(result.metadata.usage).toEqual({
        promptTokens: undefined,
        completionTokens: undefined,
        totalTokens: undefined,
        providerReportedCostUsd: undefined,
      });
    });

    it('calls SDK with correct parameters including maxTokens', async () => {
      const { client, send } = createOpenRouterMockClient();
      send.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify(VALID_PLAN_RESPONSE),
            },
          },
        ],
      });

      const provider = new OpenRouterProvider(
        {
          model: 'anthropic/claude-3-opus',
          temperature: 0.7,
        },
        client,
      );

      await provider.generate(OPENROUTER_SAMPLE_INPUT);

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'anthropic/claude-3-opus',
          temperature: 0.7,
          stream: true,
          responseFormat: { type: 'json_object' },
          maxTokens: expect.any(Number),
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({ role: 'user' }),
          ]),
        }),
        expect.any(Object),
      );
    });

    it('uses the safest output ceiling across the route models', async () => {
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
      });

      const provider = new OpenRouterProvider(
        {
          model: 'openai/gpt-4o',
          fallbackModels: [AI_DEFAULT_MODEL],
        },
        client,
      );
      await provider.generate(OPENROUTER_SAMPLE_INPUT);

      const requestBody = send.mock.calls[0][0] as {
        maxTokens: number;
      };
      expect(requestBody.maxTokens).toBe(DEFAULT_OUTPUT_TOKEN_CEILING);
    });

    it('includes topic in user prompt', async () => {
      const { client, send } = createOpenRouterMockClient();
      send.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify(VALID_PLAN_RESPONSE),
            },
          },
        ],
      });

      const provider = new OpenRouterProvider(
        { model: OPENROUTER_TEST_MODEL },
        client,
      );
      await provider.generate(OPENROUTER_SAMPLE_INPUT);

      const callArgs = send.mock.calls[0][0];
      const userMessage = callArgs.messages.find(
        (m: { role: string }) => m.role === 'user',
      );

      expect(userMessage.content).toContain('TypeScript Fundamentals');
      expect(userMessage.content).toContain('beginner');
    });

    it('includes notes in user prompt', async () => {
      const { client, send } = createOpenRouterMockClient();
      send.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify(VALID_PLAN_RESPONSE),
            },
          },
        ],
      });

      const provider = new OpenRouterProvider(
        { model: OPENROUTER_TEST_MODEL },
        client,
      );
      await provider.generate(OPENROUTER_SAMPLE_INPUT);

      const callArgs = send.mock.calls[0][0];
      const userMessage = callArgs.messages.find(
        (m: { role: string }) => m.role === 'user',
      );

      expect(userMessage.content).toContain('Notes: Focus on type safety');
    });
  });
});
