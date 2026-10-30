import {
  ProviderError,
  ProviderInvalidResponseError,
  ProviderRateLimitError,
  ProviderTimeoutError,
} from '@/features/ai/providers/errors';
import {
  PARALLEL_SEARCH_URL,
  parallelSearchCostMicrousd,
  parallelSearchUsage,
  searchParallel,
} from '@/features/ai/providers/parallel-search';
import { billedUsageOf } from '@/features/ai/usage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REQUEST = {
  objective: 'Find sources on Rust ownership for a beginner',
  searchQueries: ['rust ownership tutorial', 'rust borrowing rules'],
  mode: 'fast',
  maxResults: 6,
  maxCharsTotal: 12_000,
} as const;

const OWNERSHIP_URL =
  'https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html';

const RESULTS_BODY = {
  search_id: 'search_1',
  results: [
    {
      url: OWNERSHIP_URL,
      title: ' Understanding Ownership ',
      publish_date: '2025-01-01',
      excerpts: ['Ownership is a set of rules.'],
    },
    { url: 'https://blog.example.com/rust', title: null, excerpts: [] },
  ],
  session_id: 'sess_1',
  usage: [{ name: 'sku_search', count: 1 }],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Rejects with the request signal's reason once it aborts. */
function hangingFetch() {
  return vi.fn<typeof fetch>(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          return;
        }
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        signal.addEventListener('abort', () => reject(signal.reason));
      }),
  );
}

describe('searchParallel', () => {
  beforeEach(() => {
    vi.stubEnv('PARALLEL_API_KEY', 'parallel-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('posts the objective, queries, mode and caps with the API key', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse(RESULTS_BODY)),
    );

    const response = await searchParallel(REQUEST, { fetch: fetchMock });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(PARALLEL_SEARCH_URL);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'x-api-key': 'parallel-key' });
    expect(JSON.parse(String(init?.body))).toEqual({
      objective: REQUEST.objective,
      search_queries: [...REQUEST.searchQueries],
      mode: 'fast',
      max_chars_total: 12_000,
      advanced_settings: { max_results: 6 },
    });
    expect(response).toEqual({
      resultCount: 2,
      results: [
        {
          url: OWNERSHIP_URL,
          title: 'Understanding Ownership',
          excerpts: ['Ownership is a set of rules.'],
        },
        { url: 'https://blog.example.com/rust', title: null, excerpts: [] },
      ],
    });
  });

  it('fails without a key before any request', async () => {
    vi.stubEnv('PARALLEL_API_KEY', '');
    const fetchMock = vi.fn<typeof fetch>();

    const error = await searchParallel(REQUEST, { fetch: fetchMock }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ProviderError);
    expect((error as Error).message).toMatch(/PARALLEL_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops a result without a usable URL and keeps the rest', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse({
          search_id: 'search_2',
          results: [
            { url: '', excerpts: ['orphan'] },
            { url: 'https://a.example/with space', excerpts: [] },
            { url: OWNERSHIP_URL, title: 'Ownership', excerpts: [] },
          ],
        }),
      ),
    );

    await expect(
      searchParallel(REQUEST, { fetch: fetchMock }),
    ).resolves.toEqual({
      resultCount: 3,
      results: [{ url: OWNERSHIP_URL, title: 'Ownership', excerpts: [] }],
    });
  });

  it.each([
    {
      name: 'HTTP 500',
      body: jsonResponse({}, 500),
      type: ProviderError,
      billed: false,
    },
    {
      name: 'HTTP 429',
      body: jsonResponse({}, 429),
      type: ProviderRateLimitError,
      billed: false,
    },
    {
      name: 'a non-JSON body',
      body: new Response('<html>', { status: 200 }),
      type: ProviderInvalidResponseError,
      billed: true,
    },
    {
      name: 'a malformed body',
      body: jsonResponse({ results: 'no' }),
      type: ProviderInvalidResponseError,
      billed: true,
    },
    {
      name: 'zero results',
      body: jsonResponse({ search_id: 's', results: [] }),
      type: ProviderInvalidResponseError,
      billed: true,
    },
  ])('throws on $name', async ({ body, type, billed }) => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(body));

    const error = await searchParallel(REQUEST, { fetch: fetchMock }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(type);
    // A completed request is billed whatever its body; a failed one is not.
    expect(billedUsageOf(error)).toEqual(
      billed ? parallelSearchUsage('fast', 0) : null,
    );
  });

  it("names Parallel's reason on an HTTP failure", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse(
          {
            type: 'error',
            error: { ref_id: 'r1', message: 'max_results must be <= 20' },
          },
          400,
        ),
      ),
    );

    await expect(searchParallel(REQUEST, { fetch: fetchMock })).rejects.toThrow(
      'Parallel search failed with HTTP 400: max_results must be <= 20',
    );
  });

  it('maps the request timeout to a timeout error', async () => {
    await expect(
      searchParallel(REQUEST, { fetch: hangingFetch(), timeoutMs: 5 }),
    ).rejects.toBeInstanceOf(ProviderTimeoutError);
  });

  it("rethrows the caller's abort as is", async () => {
    const controller = new AbortController();
    controller.abort();

    const error = await searchParallel(
      { ...REQUEST, signal: controller.signal },
      { fetch: hangingFetch() },
    ).catch((caught: unknown) => caught);

    expect(error).toBe(controller.signal.reason);
    expect(error).not.toBeInstanceOf(ProviderError);
  });
});

describe('parallelSearchCostMicrousd', () => {
  it.each([
    ['fast', 10, 1_000],
    ['fast', 15, 6_000],
    ['advanced', 24, 19_000],
  ] as const)('%s mode with %i results costs %i µUSD', (mode, count, cost) => {
    expect(parallelSearchCostMicrousd(mode, count)).toBe(cost);
  });
});
