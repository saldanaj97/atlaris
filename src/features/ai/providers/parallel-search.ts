import type { ResearchMode } from '@/features/ai/model-operation-policy';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';

import {
  ProviderError,
  ProviderInvalidResponseError,
  ProviderRateLimitError,
  ProviderTimeoutError,
} from '@/features/ai/providers/errors';
import { withBilledUsage } from '@/features/ai/usage';
import { parallelEnv } from '@/lib/config/env/ai';
import { isAbortError } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';
import { z } from 'zod';

export const PARALLEL_SEARCH_URL = 'https://api.parallel.ai/v1/search';

const PARALLEL_SEARCH_TIMEOUT_MS = 60_000;

const PARALLEL_SEARCH_MODEL_ID = 'parallel/search';
const PARALLEL_PROVIDER = 'parallel';

const LOG_SOURCE = 'parallel-search';
const ERROR_MESSAGE_MAX_CHARS = 300;

/**
 * https://docs.parallel.ai/getting-started/pricing (read 2026-10-29): a
 * request includes 10 results; each further result costs $0.001.
 */
const PARALLEL_SEARCH_BASE_MICROUSD = {
  fast: 1_000,
  advanced: 5_000,
} as const satisfies Record<ResearchMode, number>;
const PARALLEL_SEARCH_INCLUDED_RESULTS = 10;
const PARALLEL_SEARCH_EXTRA_RESULT_MICROUSD = 1_000;

export function parallelSearchCostMicrousd(
  mode: ResearchMode,
  resultCount: number,
): number {
  const extra = Math.max(0, resultCount - PARALLEL_SEARCH_INCLUDED_RESULTS);
  return (
    PARALLEL_SEARCH_BASE_MICROUSD[mode] +
    extra * PARALLEL_SEARCH_EXTRA_RESULT_MICROUSD
  );
}

export function parallelSearchUsage(
  mode: ResearchMode,
  resultCount: number,
): CanonicalAIUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    model: PARALLEL_SEARCH_MODEL_ID,
    provider: PARALLEL_PROVIDER,
    estimatedCostCents: 0,
    providerCostMicrousd: parallelSearchCostMicrousd(mode, resultCount),
    isPartial: false,
    missingFields: [],
  };
}

type ParallelSearchRequest = {
  readonly objective: string;
  readonly searchQueries: readonly string[];
  readonly mode: ResearchMode;
  readonly maxResults: number;
  readonly maxCharsTotal: number;
  readonly signal?: AbortSignal;
};

export type ParallelSearchResult = {
  readonly url: string;
  readonly title: string | null;
  readonly excerpts: readonly string[];
};

type ParallelSearchResponse = {
  readonly resultCount: number;
  readonly results: readonly [ParallelSearchResult, ...ParallelSearchResult[]];
};

type ParallelSearchDeps = {
  fetch?: typeof fetch;
  timeoutMs?: number;
};

const parallelSearchResultSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !/\s/.test(value), 'URL contains whitespace'),
  title: z.string().nullish(),
  excerpts: z.array(z.string()).default([]),
});

const parallelSearchResponseSchema = z.object({
  search_id: z.string(),
  results: z.array(z.unknown()),
});

const parallelErrorResponseSchema = z.object({
  error: z.object({ message: z.string() }),
});

async function readErrorMessage(response: Response): Promise<string | null> {
  try {
    const parsed = parallelErrorResponseSchema.safeParse(
      JSON.parse(await response.text()),
    );
    return parsed.success
      ? parsed.data.error.message.slice(0, ERROR_MESSAGE_MAX_CHARS)
      : null;
  } catch {
    return null;
  }
}

async function readSearchResponse(
  response: Response,
): Promise<ParallelSearchResponse> {
  let raw: unknown;
  try {
    raw = await response.json();
  } catch (error) {
    throw new ProviderInvalidResponseError('Parallel search body is not JSON', {
      cause: error,
    });
  }
  const parsed = parallelSearchResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ProviderInvalidResponseError(
      'Parallel search response does not match the expected shape',
      { cause: parsed.error },
    );
  }
  const searchId = parsed.data.search_id;
  const resultCount = parsed.data.results.length;

  const results: ParallelSearchResult[] = [];
  for (const item of parsed.data.results) {
    const result = parallelSearchResultSchema.safeParse(item);
    if (result.success) {
      results.push({
        url: result.data.url,
        title: result.data.title?.trim() || null,
        excerpts: result.data.excerpts,
      });
    }
  }
  if (results.length < resultCount) {
    logger.warn(
      {
        source: LOG_SOURCE,
        event: 'parallel_search_results_dropped',
        searchId,
        resultCount,
        droppedCount: resultCount - results.length,
      },
      'Parallel search returned results without a usable URL',
    );
  }
  const [first, ...rest] = results;
  if (!first) {
    throw new ProviderInvalidResponseError(
      'Parallel search returned no results',
    );
  }
  if (results.every((result) => result.excerpts.length === 0)) {
    logger.warn(
      {
        source: LOG_SOURCE,
        event: 'parallel_search_no_excerpts',
        searchId,
        resultCount,
      },
      'Parallel search returned results without excerpts',
    );
  }
  return { resultCount, results: [first, ...rest] };
}

export async function searchParallel(
  request: ParallelSearchRequest,
  deps: ParallelSearchDeps = {},
): Promise<ParallelSearchResponse> {
  const apiKey = parallelEnv.apiKey;
  if (!apiKey) {
    throw new Error('PARALLEL_API_KEY is not set');
  }
  const body = {
    objective: request.objective,
    search_queries: request.searchQueries,
    mode: request.mode,
    max_chars_total: request.maxCharsTotal,
    advanced_settings: { max_results: request.maxResults },
  };
  const timeoutSignal = AbortSignal.timeout(
    deps.timeoutMs ?? PARALLEL_SEARCH_TIMEOUT_MS,
  );
  const signal = AbortSignal.any([
    timeoutSignal,
    ...(request.signal ? [request.signal] : []),
  ]);

  let response: Response;
  try {
    response = await (deps.fetch ?? fetch)(PARALLEL_SEARCH_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (timeoutSignal.aborted) {
      throw new ProviderTimeoutError('Parallel search timed out', {
        cause: error,
      });
    }
    if (isAbortError(error)) {
      throw error;
    }
    throw new ProviderError(
      'provider_error',
      'Parallel search request failed',
      {
        cause: error,
      },
    );
  }

  if (response.status === 429) {
    throw new ProviderRateLimitError('Parallel search rate limit exceeded', {
      statusCode: response.status,
    });
  }
  if (!response.ok) {
    const reason = await readErrorMessage(response);
    throw new ProviderError(
      'provider_error',
      `Parallel search failed with HTTP ${response.status}${reason ? `: ${reason}` : ''}`,
      { statusCode: response.status },
    );
  }

  return withBilledUsage(
    () => Promise.resolve(parallelSearchUsage(request.mode, 0)),
    () => readSearchResponse(response),
  );
}
