import pRetry from 'p-retry';

import { ProviderError, ProviderInvalidResponseError } from '@/lib/ai/provider';
import { MockGenerationProvider } from '@/lib/ai/providers/mock';
import { OpenRouterProvider } from '@/lib/ai/providers/openrouter';
import type {
  AiPlanGenerationProvider,
  GenerationInput,
  GenerationOptions,
  ProviderGenerateResult,
} from '@/lib/ai/types/provider.types';
import { aiEnv, appEnv, openRouterEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';

/**
 * Extracts HTTP status from arbitrary SDK/fetch errors via safe property narrowing.
 * Intentional exception to the "no unknown/any" guideline: the parameter is typed
 * as `unknown` so callers must pass through untyped errors (e.g. from fetch or
 * OpenRouter SDK) and we narrow safely using explicit checks for `status`,
 * `statusCode`, and `response.status`. If the linter flags `unknown` here, add an
 * eslint-disable-next-line for that rule only and reference getStatusCode in the
 * comment so future readers know it is intentional.
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

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
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

export interface RouterConfig {
  useMock?: boolean;
  model?: string;
}

export type MicroExplanationConfig = {
  apiKey: string;
  baseUrl: string;
  siteUrl?: string;
  appName?: string;
};

export class RouterGenerationProvider implements AiPlanGenerationProvider {
  private readonly providers: (() => AiPlanGenerationProvider)[];

  constructor(cfg: RouterConfig = {}) {
    // Explicit config flag takes precedence over environment
    if (cfg.useMock === true) {
      this.providers = [() => new MockGenerationProvider()];
      return;
    }

    if (cfg.useMock === false) {
      const model = cfg.model ?? aiEnv.defaultModel;
      this.providers = [() => new OpenRouterProvider({ model })];
      return;
    }

    // Fall back to environment-based mock behavior (only in non-production)
    const useMock = aiEnv.useMock === 'true' && !appEnv.isProduction;

    if (useMock) {
      this.providers = [() => new MockGenerationProvider()];
      return;
    }

    // OpenRouter is now the only provider (Google AI deprecated)
    const model = cfg.model ?? aiEnv.defaultModel;
    this.providers = [() => new OpenRouterProvider({ model })];

    // TODO: Add Google AI as emergency fallback only if OpenRouter is completely down.
    // For now, we rely on OpenRouter's internal model routing and fallbacks.
  }

  getMicroExplanationConfig(): MicroExplanationConfig | null {
    const apiKey = openRouterEnv.apiKey;
    if (!apiKey) {
      return null;
    }
    return {
      apiKey,
      baseUrl: openRouterEnv.baseUrl,
      siteUrl: openRouterEnv.siteUrl,
      appName: openRouterEnv.appName,
    };
  }

  async generate(
    input: GenerationInput,
    options?: GenerationOptions
  ): Promise<ProviderGenerateResult> {
    let lastError: unknown;

    for (const factory of this.providers) {
      const provider = factory();
      const providerName = provider.constructor?.name ?? 'unknown-provider';
      if (!appEnv.isProduction) {
        // Lightweight debug signal to help trace provider order and failures locally
        logger.debug(
          {
            source: 'ai-router',
            event: 'provider_attempt',
            provider: providerName,
          },
          'AI router attempting provider'
        );
      }
      try {
        // Retry only transient provider failures.
        const result = await pRetry(() => provider.generate(input, options), {
          retries: 1,
          minTimeout: 300,
          maxTimeout: 700,
          randomize: true,
          signal: options?.signal,
          onFailedAttempt: ({ error }) => {
            if (!shouldRetry(error)) {
              throw error;
            }
          },
        });
        return result;
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : 'unknown error';
        // Always log provider failures in production for visibility
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
          'AI router provider failed'
        );
        continue; // try next provider
      }
    }

    // Ensure we throw an Error object
    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error('All AI providers failed');
  }
}
