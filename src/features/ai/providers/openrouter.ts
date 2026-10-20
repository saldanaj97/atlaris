import type {
  AiPlanGenerationProvider,
  GenerationInput,
  GenerationOptions,
  ModuleLessonBatchGenerationInput,
  ProviderGenerateResult,
  ProviderUsage,
} from '@/features/ai/types/provider.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { OpenRouterCore } from '@openrouter/sdk/core';
import type { chatSend } from '@openrouter/sdk/funcs/chatSend';
import type { ChatRequest } from '@openrouter/sdk/models';

import { getOutputTokenCeiling } from '@/features/ai/cost';
import { buildUserPrompt } from '@/features/ai/prompts';
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
import { openRouterEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';
import * as Sentry from '@sentry/nextjs';

export type OpenRouterClient = {
  chat: {
    send: (
      request: ChatRequest,
      options?: OpenRouterRequestOptions,
    ) => Promise<unknown>;
  };
};

type OpenRouterRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
};

/** Generation stage, tagged on each AI Gateway log entry. */
type OpenRouterRequestStage = 'plan' | 'lesson';

const AI_GATEWAY_HOSTNAME = 'gateway.ai.cloudflare.com';

type AiGatewayConfig = {
  token: string;
  logPayloads: boolean;
};

export type OpenRouterProviderConfig = {
  apiKey?: string;
  /**
   * Picks `OPENROUTER_API_KEY_<TIER>` when no `apiKey` is given. Grounded
   * stages pass it; the legacy pipeline does not, so it keeps one key.
   */
  tier?: SubscriptionTier;
  model: string;
  fallbackModels?: readonly string[];
  siteUrl?: string;
  appName?: string;
  temperature?: number;
};

const OPENROUTER_DEFAULT_TIMEOUT_MS = DEFAULT_GENERATION_TIMEOUT_MS;
const OPENROUTER_TIMEOUT_EXTENSION_MS = DEFAULT_GENERATION_EXTENSION_MS;

type OpenRouterSdkOptions = ConstructorParameters<typeof OpenRouterCore>[0];

/**
 * Loads the SDK on the first request, and only its core client and standalone
 * chat function. The full `OpenRouter` client builds thousands of zod schemas
 * at import, which pushed the jobs Worker toward Cloudflare's startup CPU
 * limit (validation error 10021).
 */
function createLazyOpenRouterClient(
  sdkOptions: OpenRouterSdkOptions,
): OpenRouterClient {
  let sdk: Promise<{ core: OpenRouterCore; send: typeof chatSend }> | undefined;
  return {
    chat: {
      send: async (request, options) => {
        sdk ??= Promise.all([
          import('@openrouter/sdk/core'),
          import('@openrouter/sdk/funcs/chatSend'),
        ]).then(([coreModule, chatSendModule]) => ({
          core: new coreModule.OpenRouterCore(sdkOptions),
          send: chatSendModule.chatSend,
        }));
        const { core, send } = await sdk;
        const result = await send(core, { chatRequest: request }, options);
        if (!result.ok) {
          throw result.error;
        }
        return result.value;
      },
    },
  };
}

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
  const seenModels = new Set<string>();
  for (const model of [primaryModel, ...fallbackModels]) {
    if (!model || seenModels.has(model)) {
      continue;
    }
    seenModels.add(model);
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
  onFinishReason?: (finishReason: string) => void,
): { stream: ReadableStream<string>; isStreaming: boolean } {
  const isStreamingResponse = isAsyncIterable(response);
  if (isStreamingResponse) {
    const stream = streamFromEvents({
      events: response as AsyncIterable<StreamEventLike>,
      onUsage: (usage, { usageObjectPresent }) => {
        mergeStreamUsageIntoMetadata(metadataUsage, usage, usageObjectPresent);
      },
      onModel,
      onFinishReason,
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

type OpenRouterChatMessage = { role: 'user'; content: string };

const PRESET_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * System prompts live only in OpenRouter presets, so a request without a valid
 * preset slug must not be sent.
 */
function requirePresetSlug(value: string | undefined, envName: string): string {
  const slug = value?.trim();
  if (!slug) {
    throw new Error(`${envName} is not set`);
  }
  if (!PRESET_SLUG_PATTERN.test(slug)) {
    throw new Error(`${envName} must be an OpenRouter preset slug`);
  }
  return slug;
}

/**
 * AI Gateway headers go only to the gateway host, so the Cloudflare token never
 * reaches OpenRouter when `OPENROUTER_BASE_URL` is unset or points elsewhere.
 */
function resolveAiGatewayConfig(): AiGatewayConfig | undefined {
  const token = openRouterEnv.aiGatewayToken;
  if (!token) {
    return undefined;
  }
  const { hostname } = new URL(openRouterEnv.baseUrl);
  if (hostname !== AI_GATEWAY_HOSTNAME) {
    return undefined;
  }
  return { token, logPayloads: openRouterEnv.aiGatewayLogPayloads };
}

function buildAiGatewayHeaders(
  gateway: AiGatewayConfig,
  stage: OpenRouterRequestStage,
  presetSlug: string,
): Record<string, string> {
  return {
    'cf-aig-authorization': `Bearer ${gateway.token}`,
    'cf-aig-metadata': JSON.stringify({ stage, preset: presetSlug }),
    // Regenerations resend identical requests and must get a fresh answer.
    'cf-aig-skip-cache': 'true',
    // One quick retry, overriding the dashboard. Streamed calls fail before the
    // stream starts (429, 5xx), so a retry cannot repeat a running generation.
    // No cf-aig-request-timeout: a timeout retry could.
    'cf-aig-max-attempts': '2',
    'cf-aig-retry-delay': '1000',
    'cf-aig-backoff': 'constant',
    ...(gateway.logPayloads ? {} : { 'cf-aig-collect-log-payload': 'false' }),
  };
}

export class OpenRouterProvider implements AiPlanGenerationProvider {
  private readonly client: OpenRouterClient;
  private readonly model: string;
  private readonly routeModels: string[];
  private readonly temperature: number;
  private readonly aiGateway: AiGatewayConfig | undefined;

  constructor(cfg: OpenRouterProviderConfig, client?: OpenRouterClient) {
    if (!cfg.model) {
      throw new Error('OpenRouterProvider requires a model to be specified');
    }
    this.model = cfg.model;
    this.routeModels = buildRouteModels(cfg.model, cfg.fallbackModels);
    this.temperature = cfg.temperature ?? 0.2;
    this.aiGateway = resolveAiGatewayConfig();
    if (client) {
      this.client = client;
    } else {
      const apiKey = cfg.apiKey ?? openRouterEnv.apiKeyForTier(cfg.tier);
      if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY is not set');
      }
      const siteUrl = cfg.siteUrl ?? openRouterEnv.siteUrl;
      const appName = cfg.appName ?? openRouterEnv.appName;
      this.client = createLazyOpenRouterClient({
        apiKey,
        serverURL: openRouterEnv.baseUrl,
        ...(siteUrl && { httpReferer: siteUrl }),
        ...(appName && { appTitle: appName }),
      });
    }
  }

  private executeJsonObjectChat(
    messages: readonly OpenRouterChatMessage[],
    presetSlug: string,
    stage: OpenRouterRequestStage,
    options: GenerationOptions | undefined,
    requestSpanName: string,
  ): Promise<ProviderGenerateResult> {
    return Sentry.startSpanManual(
      {
        op: 'gen_ai.request',
        name: requestSpanName,
        attributes: {
          'gen_ai.request.model': this.model,
          'gen_ai.request.model_route': this.routeModels.join(' > '),
          'gen_ai.request.temperature': this.temperature,
        },
      },
      async (span, finish) => {
        const requestOptions: OpenRouterRequestOptions = {};
        if (options?.signal) {
          requestOptions.signal = options.signal;
        }
        if (this.aiGateway) {
          requestOptions.headers = buildAiGatewayHeaders(
            this.aiGateway,
            stage,
            presetSlug,
          );
        }
        // Streaming responses routinely exceed base timeout; extension applied unconditionally
        // until adaptive timeout is wired end-to-end (see GitHub #214).
        requestOptions.timeoutMs =
          (options?.timeoutMs ?? OPENROUTER_DEFAULT_TIMEOUT_MS) +
          OPENROUTER_TIMEOUT_EXTENSION_MS;

        let response: unknown;
        try {
          const responseFormat = { type: 'json_object' as const };
          const tokenCeiling = getRouteTokenCeiling(this.routeModels);
          const messagePayload = [...messages];
          const presetSuffix = `@preset/${presetSlug}`;
          const requestBody =
            this.routeModels.length > 1
              ? {
                  models: this.routeModels.map(
                    (model) => `${model}${presetSuffix}`,
                  ),
                  messages: messagePayload,
                  stream: true,
                  temperature: this.temperature,
                  responseFormat,
                  maxTokens: tokenCeiling,
                }
              : {
                  model: `${this.model}${presetSuffix}`,
                  messages: messagePayload,
                  stream: true,
                  temperature: this.temperature,
                  responseFormat,
                  maxTokens: tokenCeiling,
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
            (finishReason) => {
              metadata.finishReason = finishReason;
            },
          );

        // Model metadata starts with the requested model, may get a quick
        // best-effort value from the initial streaming response, and is finally
        // overwritten by the stream parser when it discovers the resolved route.
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

  async generate(
    input: GenerationInput,
    options?: GenerationOptions,
  ): Promise<ProviderGenerateResult> {
    const presetSlug = requirePresetSlug(
      openRouterEnv.planPreset,
      'OPENROUTER_PLAN_PRESET',
    );
    const userPrompt = buildUserPrompt({
      topic: input.topic,
      notes: input.notes,
      skillLevel: input.skillLevel,
      learningStyle: input.learningStyle,
      weeklyHours: input.weeklyHours,
      startDate: input.startDate,
      deadlineDate: input.deadlineDate,
    });

    const messages: OpenRouterChatMessage[] = [
      { role: 'user', content: userPrompt },
    ];

    return this.executeJsonObjectChat(
      messages,
      presetSlug,
      'plan',
      options,
      `request ${this.routeModels.join(' > ')}`,
    );
  }

  async generateModuleLessonBatch(
    input: ModuleLessonBatchGenerationInput,
    options?: GenerationOptions,
  ): Promise<ProviderGenerateResult> {
    const presetSlug = requirePresetSlug(
      openRouterEnv.lessonPreset,
      'OPENROUTER_LESSON_PRESET',
    );
    const messages: OpenRouterChatMessage[] = [
      { role: 'user', content: input.userPrompt },
    ];

    return this.executeJsonObjectChat(
      messages,
      presetSlug,
      'lesson',
      options,
      `request module-lesson-batch ${this.routeModels.join(' > ')}`,
    );
  }
}
