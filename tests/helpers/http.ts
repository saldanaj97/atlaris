/**
 * HTTP mock helpers for testing
 * Provides utilities to mock fetch/HEAD requests with per-URL responses
 */

import type { HeadCheckResult } from '@/lib/curation/validate';

export interface MockFetchResponse {
  status: number;
  url: string;
  ok: boolean;
  json?: () => Promise<unknown>;
}

export interface MockFetchConfig {
  method?: string;
  url: string;
  status: number;
  ok: boolean;
  body?: unknown;
}

/**
 * Creates a mock fetch implementation that responds with predefined data
 * @param configs Array of URL-to-response mappings
 * @returns Mocked fetch function
 */
export function createMockFetch(configs: MockFetchConfig[]): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    let url: string;
    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof URL) {
      url = input.href;
    } else if (
      typeof input === 'object' &&
      input !== null &&
      'url' in (input as any)
    ) {
      const candidate = (input as any).url;
      if (typeof candidate === 'string') {
        url = candidate;
      } else {
        throw new Error('Unsupported RequestInfo: url field is not a string');
      }
    } else {
      throw new Error('Unsupported RequestInfo type for mock fetch');
    }
    const inferredMethod =
      init?.method ??
      (typeof input === 'object' && input !== null && 'method' in (input as any)
        ? ((input as any).method as string | undefined)
        : undefined);
    const method = inferredMethod ?? 'GET';
    const config = configs.find(
      (c) => c.url === url && (c.method === undefined || c.method === method)
    );
    if (!config) {
      throw new Error(`No mock config found for ${method} ${url}`);
    }

    const response: MockFetchResponse = {
      status: config.status,
      url: config.url,
      ok: config.ok,
    };

    if (config.body) {
      response.json = async () => config.body;
    }

    return response as unknown as Response;
  };
}

/**
 * Creates a HEAD request mock specifically for docs validation
 * @param urlStatusMap Map of URLs to their HEAD response status
 * @returns Function that returns HeadOkResult
 */
export function createMockHeadOk(
  urlStatusMap: Record<string, number>
): (url: string, timeoutMs?: number) => Promise<HeadCheckResult> {
  return async (url: string, _timeoutMs?: number) => {
    const status = urlStatusMap[url];
    if (status === undefined) {
      return { ok: false, status: undefined };
    }

    return {
      ok: status >= 200 && status < 300,
      status,
      finalUrl: url,
    };
  };
}

/**
 * Creates a latency-free fetch mock (instant resolution)
 * Useful for avoiding sleeps in tests
 */
export function createInstantFetch(configs: MockFetchConfig[]): typeof fetch {
  return createMockFetch(configs);
}
