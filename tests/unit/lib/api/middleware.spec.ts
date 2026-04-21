import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withErrorBoundary } from '@/lib/api/middleware';
import { logger } from '@/lib/logging/logger';

describe('withErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(logger, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns 499 and does not log Unhandled API route error for AbortError', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    const handler = withErrorBoundary(async () => {
      throw abort;
    });
    const req = new Request('http://localhost/api/x', { method: 'POST' });

    const res = await handler(req);

    expect(res.status).toBe(499);
    expect(res.headers.get('Connection')).toBe('close');
    expect(logger.debug).toHaveBeenCalledWith(
      { url: req.url, method: req.method },
      'Request aborted by client'
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it.skipIf(typeof DOMException === 'undefined')(
    'returns 499 for DOMException AbortError',
    async () => {
      const abort = new DOMException('Aborted', 'AbortError');
      const handler = withErrorBoundary(async () => {
        throw abort;
      });
      const req = new Request('http://localhost/api/y', { method: 'GET' });

      const res = await handler(req);

      expect(res.status).toBe(499);
      expect(logger.error).not.toHaveBeenCalled();
    }
  );

  it('logs Unhandled API route error and maps through toErrorResponse for non-abort errors', async () => {
    const boom = new Error('boom');
    const handler = withErrorBoundary(async () => {
      throw boom;
    });
    const req = new Request('http://localhost/api/z', { method: 'PUT' });

    const res = await handler(req);

    expect(res.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith(
      { error: boom },
      'Unhandled API route error'
    );
  });

  it('handles non-abort errors even when DOMException is unavailable', async () => {
    vi.stubGlobal('DOMException', undefined);

    const boom = new Error('boom');
    const handler = withErrorBoundary(async () => {
      throw boom;
    });
    const req = new Request('http://localhost/api/no-domexception', {
      method: 'POST',
    });

    const res = await handler(req);

    expect(res.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith(
      { error: boom },
      'Unhandled API route error'
    );
  });
});
