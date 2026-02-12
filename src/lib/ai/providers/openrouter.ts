import { OpenRouter } from '@openrouter/sdk';
import * as Sentry from '@sentry/nextjs';

import { buildSystemPrompt, buildUserPrompt } from '@/lib/ai/prompts';
import { ProviderError, ProviderInvalidResponseError } from '@/lib/ai/provider';
import { createAdaptiveTimeout } from '@/lib/ai/timeout';
import type {
  AiPlanGenerationProvider,
  GenerationInput,
  GenerationOptions,
  ProviderGenerateResult,
  ProviderUsage,
} from '@/lib/ai/types/provider.types';
import { asyncIterableToReadableStream, toStream } from '@/lib/ai/utils';
import { openRouterEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';

export type OpenRouterChatResponse = Awaited<
  ReturnType<OpenRouter['chat']['send']>
>;

/** Minimal interface for the OpenRouter chat client (supports DI for testing). */
export interface OpenRouterClient {
  chat: {
    send: OpenRouter['chat']['send'];
  };
}

export interface OpenRouterProviderConfig {
  apiKey?: string;
  model: string;
  siteUrl?: string;
  appName?: string;
  temperature?: number;
}

const OPENROUTER_DEFAULT_TIMEOUT_MS = 30_000;
const OPENROUTER_TIMEOUT_EXTENSION_MS = 15_000;

interface TextPart {
  type: string;
  text?: string;
}

interface StreamDeltaLike {
  content?: string | TextPart[] | null;
}

interface StreamChoiceLike {
  delta?: StreamDeltaLike | null;
  message?: StreamDeltaLike | null;
}

interface StreamEventLike {
  choices?: StreamChoiceLike[];
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  delta?: string;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAsyncIterable(
  value: unknown
): value is AsyncIterable<StreamEventLike> {
  return (
    isObjectRecord(value) &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function'
  );
}

function parseContent(
  content: string | TextPart[] | null | undefined
): string | null {
  if (!content) {
    return null;
  }

  if (typeof content === 'string') {
    return content;
  }

  const text = content
    .filter((item): item is TextPart => item.type === 'text')
    .map((item) => item.text ?? '')
    .join('');

  return text.length > 0 ? text : null;
}

function extractChunkText(event: StreamEventLike): string {
  if (typeof event.delta === 'string' && event.delta.length > 0) {
    return event.delta;
  }

  const choice = event.choices?.[0];
  if (!choice) {
    return '';
  }

  const fromDelta = parseContent(choice.delta?.content);
  if (fromDelta) {
    return fromDelta;
  }

  const fromMessage = parseContent(choice.message?.content);
  return fromMessage ?? '';
}

function normalizeUsage(
  usage:
    | {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
      }
    | undefined
): ProviderUsage {
  return {
    promptTokens: usage?.promptTokens ?? usage?.input_tokens,
    completionTokens: usage?.completionTokens ?? usage?.output_tokens,
    totalTokens: usage?.totalTokens ?? usage?.total_tokens,
  };
}

function getStatusCodeFromError(error: unknown): number | undefined {
  if (!isObjectRecord(error)) {
    return undefined;
  }

  if (typeof error.status === 'number') {
    return error.status;
  }

  if (typeof error.statusCode === 'number') {
    return error.statusCode;
  }

  if (
    isObjectRecord(error.response) &&
    typeof error.response.status === 'number'
  ) {
    return error.response.status;
  }

  return undefined;
}

function streamFromEvents(params: {
  events: AsyncIterable<StreamEventLike>;
  onUsage: (usage: ProviderUsage) => void;
}): ReadableStream<string> {
  const { events, onUsage } = params;
  const textChunks = (async function* () {
    let emittedAnyText = false;

    for await (const event of events) {
      onUsage(normalizeUsage(event.usage));
      const text = extractChunkText(event);
      if (!text) {
        continue;
      }
      emittedAnyText = true;
      yield text;
    }

    if (!emittedAnyText) {
      throw new ProviderInvalidResponseError(
        'OpenRouter returned no text content'
      );
    }
  })();

  return asyncIterableToReadableStream(textChunks);
}

export class OpenRouterProvider implements AiPlanGenerationProvider {
  private readonly client: OpenRouterClient;
  private readonly model: string;
  private readonly temperature: number;

  constructor(cfg: OpenRouterProviderConfig, client?: OpenRouterClient) {
    if (!cfg.model) {
      throw new Error('OpenRouterProvider requires a model to be specified');
    }
    this.model = cfg.model;
    this.temperature = cfg.temperature ?? 0.2;
    if (client) {
      this.client = client;
    } else {
      const apiKey = cfg.apiKey ?? openRouterEnv.apiKey;
      if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY is not set');
      }
      const siteUrl = cfg.siteUrl ?? openRouterEnv.siteUrl;
      const appName = cfg.appName ?? openRouterEnv.appName;
      this.client = new OpenRouter({
        apiKey,
        ...(siteUrl && { siteUrl }),
        ...(appName && { appName }),
      }) as OpenRouterClient;
    }
  }

  async generate(
    input: GenerationInput,
    options?: GenerationOptions
  ): Promise<ProviderGenerateResult> {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      topic: input.topic,
      notes: input.notes,
      pdfContext: input.pdfContext,
      skillLevel: input.skillLevel,
      learningStyle: input.learningStyle,
      weeklyHours: input.weeklyHours,
      startDate: input.startDate,
      deadlineDate: input.deadlineDate,
    });

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    return Sentry.startSpan(
      {
        op: 'gen_ai.request',
        name: `request ${this.model}`,
        attributes: {
          'gen_ai.request.model': this.model,
          'gen_ai.request.temperature': this.temperature,
        },
      },
      async (span) => {
        const requestOptions: {
          signal?: AbortSignal;
          timeoutMs?: number;
        } = {};
        if (options?.signal) {
          requestOptions.signal = options.signal;
        }
        const adaptiveTimeout = createAdaptiveTimeout({
          baseMs: options?.timeoutMs ?? OPENROUTER_DEFAULT_TIMEOUT_MS,
          extensionMs: OPENROUTER_TIMEOUT_EXTENSION_MS,
        });
        adaptiveTimeout.notifyFirstModule();
        requestOptions.timeoutMs =
          adaptiveTimeout.deadline - adaptiveTimeout.startedAt;
        adaptiveTimeout.cancel();

        let response: unknown;
        try {
          response = await this.client.chat.send(
            {
              model: this.model,
              messages,
              stream: true,
              temperature: this.temperature,
              responseFormat: { type: 'json_object' },
              provider: { requireParameters: true },
            },
            requestOptions
          );
        } catch (err) {
          const status = getStatusCodeFromError(err);
          const message =
            err instanceof Error
              ? err.message
              : isObjectRecord(err) && typeof err.message === 'string'
                ? err.message
                : 'OpenRouter API call failed';
          const errorDetails = {
            source: 'openrouter-provider',
            event: 'api_error',
            model: this.model,
            errorMessage: message,
            errorName: err instanceof Error ? err.name : 'Unknown',
            ...(err && typeof err === 'object' && 'code' in err
              ? { errorCode: (err as { code: unknown }).code }
              : {}),
            ...(status ? { httpStatus: status } : {}),
          };
          logger.error(errorDetails, 'OpenRouter API call failed');

          const kind =
            status === 429
              ? 'rate_limit'
              : status === 408 || message.toLowerCase().includes('timeout')
                ? 'timeout'
                : 'unknown';

          throw new ProviderError(kind, message, {
            cause: err instanceof Error ? err : undefined,
            statusCode: status,
          });
        }

        const metadataUsage = normalizeUsage(
          isObjectRecord(response) && 'usage' in response
            ? (response.usage as StreamEventLike['usage'] | undefined)
            : undefined
        );
        // Streaming: when SDK returns AsyncIterable we yield chunk-by-chunk; otherwise single-chunk fallback.
        // Track full streaming UX (SDK stream mode + ReadableStream + chunk-by-chunk) in GitHub #214.
        const stream = isAsyncIterable(response)
          ? streamFromEvents({
              events: response,
              onUsage: (usage) => {
                metadataUsage.promptTokens =
                  usage.promptTokens ?? metadataUsage.promptTokens;
                metadataUsage.completionTokens =
                  usage.completionTokens ?? metadataUsage.completionTokens;
                metadataUsage.totalTokens =
                  usage.totalTokens ?? metadataUsage.totalTokens;
              },
            })
          : (() => {
              const nonStreamResponse = isObjectRecord(response)
                ? (response as {
                    choices?: Array<{
                      message?: { content?: string | TextPart[] | null };
                    }>;
                    usage?: StreamEventLike['usage'];
                  })
                : null;
              const rawContent =
                nonStreamResponse?.choices?.[0]?.message?.content;
              if (!rawContent) {
                throw new ProviderInvalidResponseError(
                  'OpenRouter returned an empty response'
                );
              }
              const content = parseContent(rawContent);
              if (!content) {
                throw new ProviderInvalidResponseError(
                  'OpenRouter returned no text content'
                );
              }
              const normalizedUsage = normalizeUsage(nonStreamResponse?.usage);
              metadataUsage.promptTokens = normalizedUsage.promptTokens;
              metadataUsage.completionTokens = normalizedUsage.completionTokens;
              metadataUsage.totalTokens = normalizedUsage.totalTokens;
              return toStream(content);
            })();

        const usage = metadataUsage;
        if (usage) {
          span.setAttribute(
            'gen_ai.usage.input_tokens',
            usage.promptTokens ?? 0
          );
          span.setAttribute(
            'gen_ai.usage.output_tokens',
            usage.completionTokens ?? 0
          );
        }

        return {
          stream,
          metadata: {
            usage: {
              promptTokens: usage.promptTokens ?? 0,
              completionTokens: usage.completionTokens ?? 0,
              totalTokens: usage.totalTokens ?? 0,
            },
            provider: 'openrouter',
            model: this.model,
          },
        };
      }
    );
  }
}
