import { requestJson } from '@/app/_shared/client-api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

describe('requestJson', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses AbortSignal.timeout and reports its abort as a timeout', async () => {
    const reason = new DOMException('Timed out', 'TimeoutError');
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort(reason));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(reason));

    await expect(
      requestJson({
        url: '/test',
        schema: z.object({ ok: z.boolean() }),
        fallbackMessage: 'Failed',
        timeoutMs: 10,
      }),
    ).resolves.toMatchObject({
      kind: 'error',
      message: 'Request timed out — please try again',
      outcomeUnknown: true,
    });

    expect(AbortSignal.timeout).toHaveBeenCalledWith(10);
  });

  it('reports a timeout while consuming the response body as unknown', async () => {
    const timeoutReason = new DOMException('Timed out', 'TimeoutError');
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(
      AbortSignal.abort(timeoutReason),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi
          .fn()
          .mockRejectedValue(new DOMException('Aborted', 'AbortError')),
      } as unknown as Response),
    );

    await expect(
      requestJson({
        url: '/test',
        schema: z.object({ ok: z.boolean() }),
        fallbackMessage: 'Failed',
        timeoutMs: 10,
      }),
    ).resolves.toMatchObject({
      kind: 'error',
      message: 'Request timed out — please try again',
      outcomeUnknown: true,
    });
  });

  it('honors caller cancellation when a timeout is configured', async () => {
    const caller = new AbortController();
    const timeout = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason);
          });
        });
      }),
    );

    const request = requestJson({
      url: '/test',
      init: { signal: caller.signal },
      schema: z.object({ ok: z.boolean() }),
      fallbackMessage: 'Failed',
      timeoutMs: 10,
    });

    caller.abort(new DOMException('Cancelled', 'AbortError'));

    await expect(request).resolves.toEqual({ kind: 'aborted' });
  });

  it('keeps a parsed non-OK response definitive', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: 'Plans cannot be deleted right now.', code: 'CONFLICT' },
            { status: 409 },
          ),
        ),
    );

    const result = await requestJson({
      url: '/test',
      schema: z.object({ ok: z.boolean() }),
      fallbackMessage: 'Failed',
    });

    expect(result).toMatchObject({
      kind: 'error',
      message: 'Plans cannot be deleted right now.',
    });
    expect(result).not.toHaveProperty('outcomeUnknown');
  });
});
