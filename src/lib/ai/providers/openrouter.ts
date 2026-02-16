import { OpenRouter } from '@openrouter/sdk';
import * as Sentry from '@sentry/nextjs';

import { buildSystemPrompt, buildUserPrompt } from '@/lib/ai/prompts';
import { ProviderError, ProviderInvalidResponseError } from '@/lib/ai/provider';
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

const USAGE_TOKEN_FIELDS = [
  'promptTokens',
  'completionTokens',
  'totalTokens',
  'input_tokens',
  'output_tokens',
  'total_tokens',
] as const;

function isTextPartArray(value: unknown): value is TextPart[] {
  return (
    Array.isArray(value) &&
    value.every((part) => {
      if (!isObjectRecord(part) || typeof part.type !== 'string') {
        return false;
      }
      return part.text === undefined || typeof part.text === 'string';
    })
  );
}

function isUsageShape(value: unknown): value is StreamEventLike['usage'] {
  if (!isObjectRecord(value)) {
    return false;
  }

  return USAGE_TOKEN_FIELDS.every((field) => {
    const fieldValue = value[field];
    return fieldValue === undefined || typeof fieldValue === 'number';
  });
}

function describeResponseValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (Array.isArray(value)) {
    return `array(length=${value.length})`;
  }
  if (isObjectRecord(value)) {
    const keys = Object.keys(value);
    return `object(keys=${keys.length > 0 ? keys.join(', ') : 'none'})`;
  }
  if (typeof value === 'string') {
    return `string(length=${value.length})`;
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return `${typeof value}(${value.toString()})`;
  }
  if (typeof value === 'symbol') {
    return 'symbol';
  }
  if (typeof value === 'function') {
    return 'function';
  }
  return typeof value;
}

function createInvalidShapeError(
  fieldPath: string,
  expected: string,
  actual: unknown
): ProviderInvalidResponseError {
  return new ProviderInvalidResponseError(
    `OpenRouter returned invalid response shape: expected ${fieldPath} to be ${expected}, received ${describeResponseValue(actual)}`
  );
}

function validateNonStreamingResponse(response: unknown): {
  rawContent: string | TextPart[];
  usage: StreamEventLike['usage'] | undefined;
} {
  if (!isObjectRecord(response)) {
    throw createInvalidShapeError('response', 'an object', response);
  }

  const rawChoices = response.choices;
  if (!Array.isArray(rawChoices)) {
    throw createInvalidShapeError('choices', 'an array', rawChoices);
  }
  const choices: unknown[] = rawChoices;

  if (choices.length === 0) {
    throw new ProviderInvalidResponseError(
      'OpenRouter returned an empty response (choices array was empty)'
    );
  }

  const firstChoice = choices[0];
  if (!isObjectRecord(firstChoice)) {
    throw createInvalidShapeError('choices[0]', 'an object', firstChoice);
  }

  const message = firstChoice.message;
  if (!isObjectRecord(message)) {
    throw createInvalidShapeError('choices[0].message', 'an object', message);
  }

  const rawContent = message.content;
  if (typeof rawContent !== 'string' && !isTextPartArray(rawContent)) {
    throw createInvalidShapeError(
      'choices[0].message.content',
      'a string or TextPart[]',
      rawContent
    );
  }

  const usage = response.usage;
  if (usage !== undefined && !isUsageShape(usage)) {
    throw createInvalidShapeError(
      'usage',
      'an object with numeric token fields',
      usage
    );
  }

  return {
    rawContent,
    usage,
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

    return Sentry.startSpanManual(
      {
        op: 'gen_ai.request',
        name: `request ${this.model}`,
        attributes: {
          'gen_ai.request.model': this.model,
          'gen_ai.request.temperature': this.temperature,
        },
      },
      async (span, finish) => {
        const requestOptions: {
          signal?: AbortSignal;
          timeoutMs?: number;
        } = {};
        if (options?.signal) {
          requestOptions.signal = options.signal;
        }
        // Streaming responses routinely exceed base timeout; extension applied unconditionally
        // until adaptive timeout is wired end-to-end (see GitHub #214).
        requestOptions.timeoutMs =
          (options?.timeoutMs ?? OPENROUTER_DEFAULT_TIMEOUT_MS) +
          OPENROUTER_TIMEOUT_EXTENSION_MS;

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

        // Defaulting undefined to 0 simplifies downstream handling; consumers cannot distinguish
        // "provider reported zero" from "provider did not report usage."
        const metadataUsage: ProviderUsage = {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        };
        const isStreamingResponse = isAsyncIterable(response);
        // Streaming: when SDK returns AsyncIterable we yield chunk-by-chunk; otherwise single-chunk fallback.
        // Track full streaming UX (SDK stream mode + ReadableStream + chunk-by-chunk) in GitHub #214.
        const stream = isStreamingResponse
          ? streamFromEvents({
              events: response as AsyncIterable<StreamEventLike>,
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
              const nonStreamResponse = validateNonStreamingResponse(response);
              const content = parseContent(nonStreamResponse.rawContent);
              if (!content) {
                throw new ProviderInvalidResponseError(
                  'OpenRouter returned no text content'
                );
              }
              const normalizedUsage = normalizeUsage(nonStreamResponse?.usage);
              metadataUsage.promptTokens =
                normalizedUsage.promptTokens ?? metadataUsage.promptTokens;
              metadataUsage.completionTokens =
                normalizedUsage.completionTokens ??
                metadataUsage.completionTokens;
              metadataUsage.totalTokens =
                normalizedUsage.totalTokens ?? metadataUsage.totalTokens;
              return toStream(content);
            })();

        if (!isStreamingResponse) {
          span.setAttribute(
            'gen_ai.usage.input_tokens',
            metadataUsage.promptTokens ?? 0
          );
          span.setAttribute(
            'gen_ai.usage.output_tokens',
            metadataUsage.completionTokens ?? 0
          );
          finish();
        } else {
          // For streaming, update span when stream consumption completes.
          let streamSpanFinished = false;
          const finishStreamSpan = (): void => {
            if (streamSpanFinished) {
              return;
            }
            streamSpanFinished = true;
            span.setAttribute(
              'gen_ai.usage.input_tokens',
              metadataUsage.promptTokens ?? 0
            );
            span.setAttribute(
              'gen_ai.usage.output_tokens',
              metadataUsage.completionTokens ?? 0
            );
            finish();
          };
          const formatStreamReason = (reason: unknown): string => {
            if (reason instanceof Error) {
              return `${reason.name}: ${reason.message}`;
            }
            if (
              typeof reason === 'string' ||
              typeof reason === 'number' ||
              typeof reason === 'boolean' ||
              typeof reason === 'bigint'
            ) {
              return String(reason);
            }
            if (reason == null) {
              return 'none';
            }
            try {
              return JSON.stringify(reason);
            } catch {
              return Object.prototype.toString.call(reason);
            }
          };
          const finishStreamSpanWithError = (reason: unknown): void => {
            span.setAttribute('gen_ai.stream.terminated_with_error', true);
            span.setAttribute(
              'gen_ai.stream.termination_reason',
              formatStreamReason(reason)
            );
            finishStreamSpan();
          };

          const transformedStream = stream.pipeThrough(
            new TransformStream<string, string>({
              transform(chunk, controller) {
                try {
                  controller.enqueue(chunk);
                } catch (error) {
                  finishStreamSpanWithError(error);
                  throw error;
                }
              },
              flush() {
                finishStreamSpan();
              },
              // lib.dom lacks this callback, but runtimes invoke it on cancellation.
              cancel(reason) {
                finishStreamSpanWithError(reason);
              },
            } as Transformer<string, string> & {
              cancel: (reason?: unknown) => void;
            })
          );
          let transformedReader: ReadableStreamDefaultReader<string> | null =
            null;
          const wrappedStream = new ReadableStream<string>({
            async start(controller) {
              transformedReader = transformedStream.getReader();
              try {
                while (true) {
                  const { done, value } = await transformedReader.read();
                  if (done) {
                    controller.close();
                    return;
                  }
                  controller.enqueue(value);
                }
              } catch (error) {
                finishStreamSpanWithError(error);
                controller.error(error);
              } finally {
                transformedReader.releaseLock();
                transformedReader = null;
              }
            },
            cancel(reason) {
              finishStreamSpanWithError(reason);
              if (transformedReader) {
                return transformedReader.cancel(reason);
              }
              return transformedStream.cancel(reason);
            },
          });
          return {
            stream: wrappedStream,
            metadata: {
              usage: metadataUsage,
              provider: 'openrouter',
              model: this.model,
            },
          };
        }

        return {
          stream,
          metadata: {
            usage: metadataUsage,
            provider: 'openrouter',
            model: this.model,
          },
        };
      }
    );
  }
}
