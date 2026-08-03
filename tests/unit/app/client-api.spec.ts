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
    });

    expect(AbortSignal.timeout).toHaveBeenCalledWith(10);
  });
});
