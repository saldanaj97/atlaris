import { OpenRouter } from '@openrouter/sdk';
import * as Sentry from '@sentry/nextjs';

import { getOutputTokenCeiling } from '@/features/ai/cost';
import { buildSystemPrompt, buildUserPrompt } from '@/features/ai/prompts';
import {
  ProviderError,
  ProviderInvalidResponseError,
} from '@/features/ai/providers/errors';
import {
  getStatusCodeFromError,
  isAsyncIterable,
  isObjectRecord,
  extractResponseModel,
  normalizeUsage,
  parseContent,
  type StreamEventLike,
  streamFromEvents,
  validateNonStreamingResponse,
} from '@/features/ai/providers/openrouter-response';
import { toStream } from '@/features/ai/streaming/utils';
import {
  DEFAULT_GENERATION_EXTENSION_MS,
  DEFAULT_GENERATION_TIMEOUT_MS,
} from '@/features/ai/timeout';
import type {
  AiPlanGenerationProvider,
  GenerationInput,
  GenerationOptions,
  ProviderGenerateResult,
  ProviderUsage,
} from '@/features/ai/types/provider.types';
import { openRouterEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';

export type OpenRouterClient = {
  chat: {
    send: import('@openrouter/sdk').OpenRouter['chat']['send'];
  };
};

export type OpenRouterProviderConfig = {
  apiKey?: string;
  model: string;
  fallbackModels?: readonly string[];
  siteUrl?: string;
  appName?: string;
  temperature?: number;
};

const OPENROUTER_DEFAULT_TIMEOUT_MS = DEFAULT_GENERATION_TIMEOUT_MS;
const OPENROUTER_TIMEOUT_EXTENSION_MS = DEFAULT_GENERATION_EXTENSION_MS;

/** Narrow span surface used for gen_ai.* manual span attributes */
type GenAiManualSpan = {
  setAttribute(key: string, value: string | number | boolean): void;
};

function createFreshMetadataUsage(): ProviderUsage {
  return {
    promptTokens: undefined,
    completionTokens: undefined,
    totalTokens: undefined,
    providerReportedCostUsd: undefined,
  };
}

function buildRouteModels(
  primaryModel: string,
  fallbackModels: readonly string[] = [],
): string[] {
  const routeModels: string[] = [];
  for (const model of [primaryModel, ...fallbackModels]) {
    if (!model || routeModels.includes(model)) {
      continue;
    }
    routeModels.push(model);
  }
  return routeModels;
}

function getRouteTokenCeiling(routeModels: readonly string[]): number {
  return routeModels.reduce(
    (lowest, modelId) => Math.min(lowest, getOutputTokenCeiling(modelId)),
    Number.POSITIVE_INFINITY,
  );
}

function mergeStreamUsageIntoMetadata(
  metadataUsage: ProviderUsage,
  usage: ProviderUsage,
  usageObjectPresent: boolean,
): void {
  metadataUsage.promptTokens = usage.promptTokens ?? metadataUsage.promptTokens;
  metadataUsage.completionTokens =
    usage.completionTokens ?? metadataUsage.completionTokens;
  metadataUsage.totalTokens = usage.totalTokens ?? metadataUsage.totalTokens;
  if (usageObjectPresent) {
    if (usage.providerReportedCostUsd != null) {
      metadataUsage.providerReportedCostUsd = usage.providerReportedCostUsd;
    } else {
      metadataUsage.providerReportedCostUsd = undefined;
    }
  }
}

function mergeNonStreamUsageIntoMetadata(
  metadataUsage: ProviderUsage,
  normalizedUsage: ProviderUsage,
): void {
  metadataUsage.promptTokens =
    normalizedUsage.promptTokens ?? metadataUsage.promptTokens;
  metadataUsage.completionTokens =
    normalizedUsage.completionTokens ?? metadataUsage.completionTokens;
  metadataUsage.totalTokens =
    normalizedUsage.totalTokens ?? metadataUsage.totalTokens;
  if (normalizedUsage.providerReportedCostUsd != null) {
    metadataUsage.providerReportedCostUsd =
      normalizedUsage.providerReportedCostUsd;
  }
}

function logAndThrowFromOpenRouterSend(err: unknown, model: string): never {
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
    model,
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
        : 'provider_error';

  throw new ProviderError(kind, message, {
    cause: err instanceof Error ? err : undefined,
    statusCode: status,
  });
}

function formatStreamTerminationReason(reason: unknown): string {
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
}

function appendGenAiTokenUsageAttributes(
  span: GenAiManualSpan,
  metadataUsage: ProviderUsage,
): void {
  span.setAttribute(
    'gen_ai.usage.input_tokens',
    metadataUsage.promptTokens ?? 0,
  );
  span.setAttribute(
    'gen_ai.usage.output_tokens',
    metadataUsage.completionTokens ?? 0,
  );
}

function wrapStreamWithGenAiSpanLifecycle(
  stream: ReadableStream<string>,
  span: GenAiManualSpan,
  metadataUsage: ProviderUsage,
  finish: () => void,
): ReadableStream<string> {
  let streamSpanFinished = false;
  const finishStreamSpan = (): void => {
    if (streamSpanFinished) {
      return;
    }
    streamSpanFinished = true;
    appendGenAiTokenUsageAttributes(span, metadataUsage);
    finish();
  };
  const finishStreamSpanWithError = (reason: unknown): void => {
    span.setAttribute('gen_ai.stream.terminated_with_error', true);
    span.setAttribute(
      'gen_ai.stream.termination_reason',
      formatStreamTerminationReason(reason),
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
      cancel(reason) {
        finishStreamSpanWithError(reason);
      },
    } as Transformer<string, string> & {
      cancel: (reason?: unknown) => void;
    }),
  );
  let transformedReader: ReadableStreamDefaultReader<string> | null = null;
  return new ReadableStream<string>({
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
}

function resolveOpenRouterContentStream(
  response: unknown,
  metadataUsage: ProviderUsage,
  onModel?: (model: string) => void,
): { stream: ReadableStream<string>; isStreaming: boolean } {
  const isStreamingResponse = isAsyncIterable(response);
  if (isStreamingResponse) {
    const stream = streamFromEvents({
      events: response as AsyncIterable<StreamEventLike>,
      onUsage: (usage, { usageObjectPresent }) => {
        mergeStreamUsageIntoMetadata(metadataUsage, usage, usageObjectPresent);
      },
      onModel,
    });
    return { stream, isStreaming: true };
  }

  const nonStreamResponse = validateNonStreamingResponse(response);
  const content = parseContent(nonStreamResponse.rawContent);
  if (!content) {
    throw new ProviderInvalidResponseError(
      'OpenRouter returned no text content',
    );
  }
  const normalizedUsage = normalizeUsage(nonStreamResponse?.usage);
  mergeNonStreamUsageIntoMetadata(metadataUsage, normalizedUsage);
  const responseModel = extractResponseModel(response);
  if (responseModel) {
    onModel?.(responseModel);
  }
  return { stream: toStream(content), isStreaming: false };
}

export class OpenRouterProvider implements AiPlanGenerationProvider {
  private readonly client: OpenRouterClient;
  private readonly model: string;
  private readonly routeModels: string[];
  private readonly temperature: number;

  constructor(cfg: OpenRouterProviderConfig, client?: OpenRouterClient) {
    if (!cfg.model) {
      throw new Error('OpenRouterProvider requires a model to be specified');
    }
    this.model = cfg.model;
    this.routeModels = buildRouteModels(cfg.model, cfg.fallbackModels);
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
    options?: GenerationOptions,
  ): Promise<ProviderGenerateResult> {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      topic: input.topic,
      notes: input.notes,
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
        name: `request ${this.routeModels.join(' > ')}`,
        attributes: {
          'gen_ai.request.model': this.model,
          'gen_ai.request.model_route': this.routeModels.join(' > '),
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
          const responseFormat = { type: 'json_object' as const };
          const requestBody =
            this.routeModels.length > 1
              ? {
                  models: this.routeModels,
                  messages,
                  stream: true,
                  temperature: this.temperature,
                  responseFormat,
                  maxTokens: getRouteTokenCeiling(this.routeModels),
                }
              : {
                  model: this.model,
                  messages,
                  stream: true,
                  temperature: this.temperature,
                  responseFormat,
                  maxTokens: getRouteTokenCeiling(this.routeModels),
                };
          response = await this.client.chat.send(requestBody, requestOptions);
        } catch (err) {
          logAndThrowFromOpenRouterSend(err, this.model);
        }

        const metadataUsage = createFreshMetadataUsage();
        const metadata: ProviderGenerateResult['metadata'] = {
          usage: metadataUsage,
          provider: 'openrouter',
          model: this.model,
        };
        const { stream, isStreaming: isStreamingResponse } =
          resolveOpenRouterContentStream(
            response,
            metadataUsage,
            (resolvedModel) => {
              metadata.model = resolvedModel;
            },
          );

        if (isStreamingResponse) {
          const responseModel = extractResponseModel(response);
          if (responseModel) {
            metadata.model = responseModel;
          }
        }

        if (!isStreamingResponse) {
          appendGenAiTokenUsageAttributes(span, metadataUsage);
          finish();
          return { stream, metadata };
        }

        return {
          stream: wrapStreamWithGenAiSpanLifecycle(
            stream,
            span,
            metadataUsage,
            finish,
          ),
          metadata,
        };
      },
    );
  }
}
