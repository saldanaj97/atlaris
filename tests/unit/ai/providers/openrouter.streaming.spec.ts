import type { StreamEventLike } from '@/features/ai/providers/openrouter-response';

import {
  collectOpenRouterStream,
  createOpenRouterMockClient,
  OPENROUTER_SAMPLE_INPUT,
  OPENROUTER_TEST_MODEL,
  VALID_PLAN_RESPONSE,
} from './openrouter-test-helpers';
import { AI_DEFAULT_MODEL } from '@/features/ai/ai-models';
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
    describe('AsyncIterable streaming path', () => {
      async function* streamEvents(
        payload: string,
        usage?: {
          promptTokens?: number;
          completionTokens?: number;
          totalTokens?: number;
        },
      ): AsyncIterable<{
        delta?: string;
        choices?: Array<{
          delta?: { content?: string };
          message?: { content?: string };
        }>;
        usage?: typeof usage;
      }> {
        const chunkSize = 8;
        for (let i = 0; i < payload.length; i += chunkSize) {
          yield { delta: payload.slice(i, i + chunkSize) };
        }
        if (usage) {
          yield { usage };
        }
      }

      it('generates plan from AsyncIterable stream (delta chunks)', async () => {
        const payload = JSON.stringify(VALID_PLAN_RESPONSE);
        const { client, send } = createOpenRouterMockClient();
        send.mockResolvedValueOnce(
          streamEvents(payload, {
            promptTokens: 100,
            completionTokens: 500,
            totalTokens: 600,
          }),
        );

        const provider = new OpenRouterProvider(
          { model: OPENROUTER_TEST_MODEL },
          client,
        );
        const result = await provider.generate(OPENROUTER_SAMPLE_INPUT);

        const rawText = await collectOpenRouterStream(result.stream);
        const parsed = JSON.parse(rawText);

        expect(parsed.modules).toHaveLength(3);
        expect(parsed.modules[0].title).toBe('Introduction to TypeScript');
        expect(result.metadata.usage).toEqual({
          promptTokens: 100,
          completionTokens: 500,
          totalTokens: 600,
          providerReportedCostUsd: undefined,
        });
      });

      it('generates plan when the full payload arrives in a single streaming chunk', async () => {
        const payload = JSON.stringify(VALID_PLAN_RESPONSE);
        async function* streamFullPayloadChunk(): AsyncIterable<StreamEventLike> {
          yield { delta: payload };
          yield {
            usage: {
              promptTokens: 100,
              completionTokens: 500,
              totalTokens: 600,
            },
          };
        }

        const { client, send } = createOpenRouterMockClient();
        send.mockResolvedValueOnce(streamFullPayloadChunk());

        const provider = new OpenRouterProvider(
          { model: OPENROUTER_TEST_MODEL },
          client,
        );
        const result = await provider.generate(OPENROUTER_SAMPLE_INPUT);

        const rawText = await collectOpenRouterStream(result.stream);
        expect(JSON.parse(rawText).modules).toHaveLength(3);
        expect(result.metadata.usage).toEqual({
          promptTokens: 100,
          completionTokens: 500,
          totalTokens: 600,
          providerReportedCostUsd: undefined,
        });
      });

      it('generates plan from AsyncIterable stream (choices[0].delta.content)', async () => {
        const payload = JSON.stringify(VALID_PLAN_RESPONSE);
        async function* streamViaChoices(): AsyncIterable<{
          choices?: Array<{ delta?: { content?: string } }>;
          usage?: {
            promptTokens?: number;
            completionTokens?: number;
            totalTokens?: number;
          };
        }> {
          const chunkSize = 10;
          for (let i = 0; i < payload.length; i += chunkSize) {
            yield {
              choices: [
                { delta: { content: payload.slice(i, i + chunkSize) } },
              ],
            };
          }
          yield {
            usage: {
              promptTokens: 50,
              completionTokens: 200,
              totalTokens: 250,
            },
          };
        }

        const { client, send } = createOpenRouterMockClient();
        send.mockResolvedValueOnce(streamViaChoices());

        const provider = new OpenRouterProvider(
          { model: OPENROUTER_TEST_MODEL },
          client,
        );
        const result = await provider.generate(OPENROUTER_SAMPLE_INPUT);

        const rawText = await collectOpenRouterStream(result.stream);
        const parsed = JSON.parse(rawText);

        expect(parsed.modules).toHaveLength(3);
        expect(result.metadata.usage).toEqual({
          promptTokens: 50,
          completionTokens: 200,
          totalTokens: 250,
          providerReportedCostUsd: undefined,
        });
      });

      it('updates metadata.model from streaming chunk model metadata', async () => {
        const payload = JSON.stringify(VALID_PLAN_RESPONSE);
        async function* streamWithModelMetadata(): AsyncIterable<
          StreamEventLike & { data?: { model?: string } }
        > {
          yield {
            data: { model: AI_DEFAULT_MODEL },
            delta: payload.slice(0, 40),
          } as StreamEventLike & { data?: { model?: string } };
          yield {
            delta: payload.slice(40),
          } as StreamEventLike;
        }

        const { client, send } = createOpenRouterMockClient();
        send.mockResolvedValueOnce(streamWithModelMetadata());

        const provider = new OpenRouterProvider(
          {
            model: 'openai/gpt-4o',
            fallbackModels: [AI_DEFAULT_MODEL],
          },
          client,
        );
        const result = await provider.generate(OPENROUTER_SAMPLE_INPUT);

        await collectOpenRouterStream(result.stream);

        expect(result.metadata.model).toBe(AI_DEFAULT_MODEL);
      });

      it('streams and merges usage from multiple events', async () => {
        const payload = JSON.stringify(VALID_PLAN_RESPONSE);
        async function* streamWithMidUsage(): AsyncIterable<{
          delta?: string;
          usage?: {
            promptTokens?: number;
            completionTokens?: number;
            totalTokens?: number;
          };
        }> {
          yield { delta: payload.slice(0, 20), usage: { promptTokens: 80 } };
          yield { delta: payload.slice(20, 100) };
          yield {
            delta: payload.slice(100),
            usage: { completionTokens: 400, totalTokens: 480 },
          };
        }

        const { client, send } = createOpenRouterMockClient();
        send.mockResolvedValueOnce(streamWithMidUsage());

        const provider = new OpenRouterProvider(
          { model: OPENROUTER_TEST_MODEL },
          client,
        );
        const result = await provider.generate(OPENROUTER_SAMPLE_INPUT);

        const rawText = await collectOpenRouterStream(result.stream);
        expect(JSON.parse(rawText).modules).toHaveLength(3);
        const usage = result.metadata.usage;
        if (!usage) throw new Error('Expected usage metadata');
        expect(usage.promptTokens).toBe(80);
        expect(usage.completionTokens).toBe(400);
        expect(usage.totalTokens).toBe(480);
      });

      it.each([
        {
          name: 'keeps the last streaming usage.cost (USD) on the final event',
          streamFactory: async function* streamWithCost(payload: string) {
            yield {
              delta: payload.slice(0, 40),
              usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
            };
            yield {
              usage: {
                promptTokens: 10,
                completionTokens: 20,
                totalTokens: 30,
                cost: 0.01,
              },
            };
          },
          expectedCost: 0.01,
        },
        {
          name: 'clears streaming usage.cost when a later chunk has usage without cost',
          streamFactory: async function* streamCostThenUsageWithoutCost(
            payload: string,
          ) {
            yield {
              delta: payload.slice(0, 40),
              usage: {
                promptTokens: 1,
                completionTokens: 2,
                totalTokens: 3,
                cost: 0.01,
              },
            };
            yield {
              usage: {
                promptTokens: 10,
                completionTokens: 20,
                totalTokens: 30,
              },
            };
          },
          expectedCost: undefined,
        },
        {
          name: 'retains streaming usage.cost when later chunks omit the usage field',
          streamFactory: async function* streamWithTextOnlyAfterCost(
            payload: string,
          ) {
            yield {
              delta: payload.slice(0, 40),
              usage: {
                promptTokens: 1,
                completionTokens: 2,
                totalTokens: 3,
                cost: 0.02,
              },
            };
            yield { delta: payload.slice(40) };
          },
          expectedCost: 0.02,
        },
        {
          name: 'retains streaming usage.cost when a later chunk has usage: null',
          streamFactory: async function* streamCostThenNullUsage(
            payload: string,
          ) {
            yield {
              delta: payload.slice(0, 40),
              usage: {
                promptTokens: 1,
                completionTokens: 2,
                totalTokens: 3,
                cost: 0.01,
              },
            };
            yield { usage: null };
            yield { delta: payload.slice(40) };
          },
          expectedCost: 0.01,
        },
        {
          name: 'retains streaming usage.cost when a later chunk has a primitive usage value',
          streamFactory: async function* streamCostThenPrimitiveUsage(
            payload: string,
          ) {
            yield {
              delta: payload.slice(0, 40),
              usage: {
                promptTokens: 1,
                completionTokens: 2,
                totalTokens: 3,
                cost: 0.01,
              },
            };
            yield { usage: 1 } as StreamEventLike;
            yield { delta: payload.slice(40) };
          },
          expectedCost: 0.01,
        },
        {
          name: 'retains streaming usage.cost when a later chunk has an array usage value',
          streamFactory: async function* streamCostThenArrayUsage(
            payload: string,
          ) {
            yield {
              delta: payload.slice(0, 40),
              usage: {
                promptTokens: 1,
                completionTokens: 2,
                totalTokens: 3,
                cost: 0.01,
              },
            };
            yield { usage: [] as never };
            yield { delta: payload.slice(40) };
          },
          expectedCost: 0.01,
        },
        {
          name: 'clears streaming usage.cost when a later usage object omits cost after text-only chunks',
          streamFactory: async function* streamWithTextOnlyAfterCostThenUsage(
            payload: string,
          ) {
            yield {
              delta: payload.slice(0, 40),
              usage: {
                promptTokens: 1,
                completionTokens: 2,
                totalTokens: 3,
                cost: 0.02,
              },
            };
            yield { delta: payload.slice(40, 120) };
            yield {
              usage: {
                promptTokens: 10,
                completionTokens: 20,
                totalTokens: 30,
              },
            };
          },
          expectedCost: undefined,
          expectedPromptTokens: 10,
        },
      ])(
        '$name',
        async ({ streamFactory, expectedCost, expectedPromptTokens }) => {
          const payload = JSON.stringify(VALID_PLAN_RESPONSE);
          const { client, send } = createOpenRouterMockClient();
          send.mockResolvedValueOnce(streamFactory(payload));

          const provider = new OpenRouterProvider(
            { model: OPENROUTER_TEST_MODEL },
            client,
          );
          const result = await provider.generate(OPENROUTER_SAMPLE_INPUT);
          await collectOpenRouterStream(result.stream);

          expect(result.metadata.usage?.providerReportedCostUsd).toBe(
            expectedCost,
          );
          if (expectedPromptTokens !== undefined) {
            expect(result.metadata.usage?.promptTokens).toBe(
              expectedPromptTokens,
            );
          }
        },
      );
    });
  });
});
