import type {
  AiPlanGenerationProvider,
  GenerationInput,
  GenerationOptions,
  ModuleLessonBatchGenerationInput,
  ProviderGenerateResult,
} from '@/features/ai/types/provider.types';

import {
  ProviderError,
  ProviderInvalidResponseError,
} from '@/features/ai/providers/errors';
import { MockGenerationProvider } from '@/features/ai/providers/mock';
import { OpenRouterProvider } from '@/features/ai/providers/openrouter';
import { aiEnv, appEnv } from '@/lib/config/env';
import { isAbortError } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';
import {
  MAX_PROVIDER_RETRIES,
  PROVIDER_RETRY_MAX_MS,
  PROVIDER_RETRY_MIN_MS,
} from '@/shared/constants/retry-policy';

export type RouterConfig = {
  useMock?: boolean;
  model?: string;
  fallbackModels?: readonly string[];
};

/**
 * Extracts HTTP status from arbitrary SDK/fetch errors via safe property narrowing.
 * Intentional exception to the "no unknown/any" guideline: the parameter is typed
 * as `unknown` so callers must pass through untyped errors (e.g. from fetch or
 * OpenRouter SDK) and we narrow safely using explicit checks for `status`,
 * `statusCode`, and `response.status`. If the linter flags `unknown` here, add a
 * targeted oxlint disable for that rule and reference getStatusCode in the comment
 * so future readers know it is intentional.
 */
function getStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const statusFromDirect =
    'status' in error && typeof error.status === 'number' && error.status > 0
      ? error.status
      : undefined;
  if (statusFromDirect !== undefined) {
    return statusFromDirect;
  }

  const statusFromProvider =
    'statusCode' in error &&
    typeof error.statusCode === 'number' &&
    error.statusCode > 0
      ? error.statusCode
      : undefined;
  if (statusFromProvider !== undefined) {
    return statusFromProvider;
  }

  const responseStatus =
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'status' in error.response &&
    typeof error.response.status === 'number' &&
    error.response.status > 0
      ? error.response.status
      : undefined;

  return responseStatus;
}

function shouldRetry(error: unknown): boolean {
  if (isAbortError(error)) {
    return false;
  }

  if (error instanceof ProviderInvalidResponseError) {
    return false;
  }

  if (error instanceof ProviderError) {
    if (error.kind === 'rate_limit') {
      return true;
    }
    if (error.kind === 'timeout' || error.kind === 'invalid_response') {
      return false;
    }
    const status = getStatusCode(error) ?? getStatusCode(error.cause);
    return typeof status === 'number' ? status >= 500 : false;
  }

  const status = getStatusCode(error);
  return typeof status === 'number' ? status >= 500 : false;
}

function abortErrorFromSignal(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }

  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortErrorFromSignal(signal);
  }
}

function retryDelayMs(): number {
  if (PROVIDER_RETRY_MAX_MS <= PROVIDER_RETRY_MIN_MS) {
    return PROVIDER_RETRY_MIN_MS;
  }

  return (
    PROVIDER_RETRY_MIN_MS +
    Math.floor(
      Math.random() * (PROVIDER_RETRY_MAX_MS - PROVIDER_RETRY_MIN_MS + 1),
    )
  );
}

function waitForRetry(signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, retryDelayMs());

    function onAbort() {
      clearTimeout(timeout);
      reject(signal ? abortErrorFromSignal(signal) : new Error('Aborted'));
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export class RouterGenerationProvider implements AiPlanGenerationProvider {
  private readonly providers: (() => AiPlanGenerationProvider)[];

  constructor(cfg: RouterConfig = {}) {
    if (cfg.useMock === true) {
      this.providers = [() => new MockGenerationProvider()];
      return;
    }

    if (cfg.useMock === false) {
      const model = cfg.model ?? aiEnv.defaultModel;
      this.providers = [
        () =>
          new OpenRouterProvider({
            model,
            ...(cfg.fallbackModels !== undefined
              ? { fallbackModels: cfg.fallbackModels }
              : {}),
          }),
      ];
      return;
    }

    const model = cfg.model ?? aiEnv.defaultModel;
    this.providers = [
      () =>
        new OpenRouterProvider({
          model,
          ...(cfg.fallbackModels !== undefined
            ? { fallbackModels: cfg.fallbackModels }
            : {}),
        }),
    ];
  }

  private async invokeWithRetry(
    operation: () => Promise<ProviderGenerateResult>,
    options?: GenerationOptions,
  ): Promise<ProviderGenerateResult> {
    for (let attempt = 0; attempt <= MAX_PROVIDER_RETRIES; attempt++) {
      throwIfAborted(options?.signal);

      try {
        return await operation();
      } catch (error) {
        if (
          isAbortError(error) ||
          !shouldRetry(error) ||
          attempt >= MAX_PROVIDER_RETRIES
        ) {
          throw error;
        }

        await waitForRetry(options?.signal);
      }
    }

    throw new Error('Provider retry loop exited unexpectedly');
  }

  private async runWithProviderFallback(
    options: GenerationOptions | undefined,
    run: (
      provider: AiPlanGenerationProvider,
    ) => Promise<ProviderGenerateResult>,
  ): Promise<ProviderGenerateResult> {
    let lastError: unknown;

    for (const factory of this.providers) {
      const provider = factory();
      const providerName = provider.constructor?.name ?? 'unknown-provider';
      if (!appEnv.isProduction) {
        logger.debug(
          {
            source: 'ai-router',
            event: 'provider_attempt',
            provider: providerName,
          },
          'AI router attempting provider',
        );
      }
      try {
        const result = await this.invokeWithRetry(() => run(provider), options);
        return result;
      } catch (err) {
        if (isAbortError(err)) {
          throw err;
        }

        lastError = err;
        const message = err instanceof Error ? err.message : 'unknown error';
        logger.warn(
          {
            source: 'ai-router',
            event: 'provider_failed',
            provider: providerName,
            message,
            ...(err instanceof Error && !appEnv.isProduction
              ? { stack: err.stack }
              : {}),
          },
          'AI router provider failed',
        );
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error('All AI providers failed');
  }

  async generate(
    input: GenerationInput,
    options?: GenerationOptions,
  ): Promise<ProviderGenerateResult> {
    return this.runWithProviderFallback(options, (provider) =>
      provider.generate(input, options),
    );
  }

  async generateModuleLessonBatch(
    input: ModuleLessonBatchGenerationInput,
    options?: GenerationOptions,
  ): Promise<ProviderGenerateResult> {
    return this.runWithProviderFallback(options, (provider) =>
      provider.generateModuleLessonBatch(input, options),
    );
  }
}
