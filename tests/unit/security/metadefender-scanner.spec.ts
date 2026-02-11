import { afterEach, describe, expect, it, vi } from 'vitest';

import { MetaDefenderScanProvider } from '@/lib/security/providers/metadefender';

const BASE_URL = 'https://api.metadefender.com/v4';

const mockLogger: Pick<
  import('@/lib/logging/logger').Logger,
  'info' | 'error'
> = {
  info: vi.fn(),
  error: vi.fn(),
};

const jsonResponse = (payload: object, status = 200): Response => {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
};

describe('MetaDefenderScanProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('returns clean verdict when provider reports clean', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data_id: 'job-1' }))
      .mockResolvedValueOnce(
        jsonResponse({
          scan_results: {
            progress_percentage: 100,
            scan_all_result_a: 'Clean',
          },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new MetaDefenderScanProvider({
      apiKey: 'test-key',
      baseUrl: BASE_URL,
      timeoutMs: 5_000,
      pollIntervalMs: 1,
      logger: mockLogger,
    });

    await expect(
      provider.scan(Buffer.from('%PDF-1.7\n%%EOF', 'utf8'))
    ).resolves.toEqual({
      clean: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns infected verdict when provider reports infected', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data_id: 'job-2' }))
      .mockResolvedValueOnce(
        jsonResponse({
          scan_results: {
            progress_percentage: 100,
            scan_all_result_a: 'Infected',
          },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new MetaDefenderScanProvider({
      apiKey: 'test-key',
      baseUrl: BASE_URL,
      timeoutMs: 5_000,
      pollIntervalMs: 1,
      logger: mockLogger,
    });

    await expect(
      provider.scan(Buffer.from('%PDF-1.7\n%%EOF', 'utf8'))
    ).resolves.toEqual({
      clean: false,
      threat: 'MetaDefender-Infected',
    });
  });

  it('polls status endpoint until progress reaches 100', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data_id: 'job-3' }))
      .mockResolvedValueOnce(
        jsonResponse({
          scan_results: {
            progress_percentage: 20,
            scan_all_result_a: 'In Progress',
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          scan_results: {
            progress_percentage: 100,
            scan_all_result_a: 'No Threat Detected',
          },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new MetaDefenderScanProvider({
      apiKey: 'test-key',
      baseUrl: BASE_URL,
      timeoutMs: 5_000,
      pollIntervalMs: 1,
      logger: mockLogger,
    });

    await expect(
      provider.scan(Buffer.from('%PDF-1.7\n%%EOF', 'utf8'))
    ).resolves.toEqual({
      clean: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws when submit call returns non-200 response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}, 500));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new MetaDefenderScanProvider({
      apiKey: 'test-key',
      baseUrl: BASE_URL,
      timeoutMs: 5_000,
      logger: mockLogger,
    });

    await expect(provider.scan(Buffer.from('content', 'utf8'))).rejects.toThrow(
      'MetaDefender submit failed with status 500'
    );
  });

  it('throws when status response is malformed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data_id: 'job-4' }))
      .mockResolvedValueOnce(jsonResponse({ invalid: true }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new MetaDefenderScanProvider({
      apiKey: 'test-key',
      baseUrl: BASE_URL,
      timeoutMs: 5_000,
      pollIntervalMs: 1,
      logger: mockLogger,
    });

    await expect(provider.scan(Buffer.from('content', 'utf8'))).rejects.toThrow(
      'MetaDefender status response was malformed'
    );
  });

  it('propagates error when fetch rejects (DNS/connection/socket timeout)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValueOnce(new Error('Network request failed'))
    );

    const provider = new MetaDefenderScanProvider({
      apiKey: 'test-key',
      baseUrl: BASE_URL,
      timeoutMs: 5_000,
      pollIntervalMs: 1,
      logger: mockLogger,
    });

    await expect(
      provider.scan(Buffer.from('%PDF-1.7\n%%EOF', 'utf8'))
    ).rejects.toThrow(/network|failed|MetaDefender/i);
  });

  it('enforces hard timeout for scan requests', async () => {
    const fetchMock = vi.fn(
      async (
        input: RequestInfo | URL,
        init?: RequestInit
      ): Promise<Response> => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url.endsWith('/file')) {
          return jsonResponse({ data_id: 'job-timeout' });
        }

        return new Promise<Response>((_, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error('Missing abort signal'));
            return;
          }

          const abortErr = Object.assign(new Error('Aborted'), {
            name: 'AbortError',
          });
          if (signal.aborted) {
            reject(abortErr);
            return;
          }

          signal.addEventListener('abort', () => reject(abortErr), {
            once: true,
          });
        });
      }
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new MetaDefenderScanProvider({
      apiKey: 'test-key',
      baseUrl: BASE_URL,
      timeoutMs: 20,
      pollIntervalMs: 1,
      logger: mockLogger,
    });

    await expect(provider.scan(Buffer.from('content', 'utf8'))).rejects.toThrow(
      'MetaDefender scan timed out after 20ms'
    );
  });
});
