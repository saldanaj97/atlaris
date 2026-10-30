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

/**
 * Parallel Search API (DEV-171): one request with our own key, called before
 * the research model runs. Docs: https://docs.parallel.ai/api-reference/search/search
 */
export const PARALLEL_SEARCH_URL = 'https://api.parallel.ai/v1/search';

/** Covers `advanced` mode, which takes several seconds; the step timeout is larger. */
export const PARALLEL_SEARCH_TIMEOUT_MS = 60_000;

/** Recorded as the `model` of a search-only usage event (no model call ran). */
export const PARALLEL_SEARCH_MODEL_ID = 'parallel/search';
export const PARALLEL_PROVIDER = 'parallel';

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

/** What one request cost, in integer micro-USD, from its mode and result count. */
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

/**
 * One search as a usage record: no tokens, its cost from the price table.
 * Recorded on its own when no model call followed the search (DEV-185).
 */
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

export type ParallelSearchRequest = {
  /** Natural-language goal behind the search. */
  readonly objective: string;
  /** 2–3 keyword queries of 3–6 words each. */
  readonly searchQueries: readonly string[];
  readonly mode: ResearchMode;
  readonly maxResults: number;
  /** Cap on excerpt characters across all results (`max_chars_total`). */
  readonly maxCharsTotal: number;
  readonly signal?: AbortSignal;
};

export type ParallelSearchResult = {
  readonly url: string;
  readonly title: string | null;
  /** Markdown excerpts, most relevant first. */
  readonly excerpts: readonly string[];
};

export type ParallelSearchResponse = {
  readonly searchId: string;
  /** Results Parallel returned and billed, usable or not. */
  readonly resultCount: number;
  /** The usable results, by decreasing relevance; never empty. */
  readonly results: readonly [ParallelSearchResult, ...ParallelSearchResult[]];
};

type ParallelSearchDeps = {
  fetch?: typeof fetch;
  /** Test seam; the request timeout. */
  timeoutMs?: number;
};

/** One result; a URL with whitespace could break the prompt's result lines. */
const parallelSearchResultSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !/\s/.test(value), 'URL contains whitespace'),
  title: z.string().nullish(),
  excerpts: z.array(z.string()).default([]),
});

/** Each result is checked on its own, so a malformed one drops only itself. */
const parallelSearchResponseSchema = z.object({
  search_id: z.string(),
  results: z.array(z.unknown()),
});

const parallelErrorResponseSchema = z.object({
  error: z.object({ message: z.string() }),
});

/** Parallel's reason for a non-2xx response, when its body carries one. */
async function readErrorMessage(response: Response): Promise<string | null> {
  // Best effort: the status is the error; the body only adds Parallel's reason.
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
  // Excerpts are enabled by default; the brief needs them, so a run without
  // any is worth noticing (the schema's default would otherwise hide it).
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
  return { searchId, resultCount, results: [first, ...rest] };
}

/**
 * Runs one search. Throws a plain `Error` without `PARALLEL_API_KEY` and a
 * `ProviderError` on an HTTP failure, timeout, malformed body or zero results;
 * the research step owns retries. A completed request is billed whatever its
 * body, so an error thrown after a 2xx carries the search's usage
 * (`billedUsageOf`). A caller's abort is rethrown as is.
 */
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
