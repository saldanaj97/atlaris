import { beforeEach, describe, expect, it, vi } from 'vitest';

const removePlansForWrite = vi.hoisted(() => vi.fn());

vi.mock('@/features/plans/write-service', () => ({
  removePlansForWrite,
}));

vi.mock('@/lib/api/request-boundary', async () => {
  const { withErrorBoundary } = await vi.importActual<
    typeof import('@/lib/api/route-wrappers')
  >('@/lib/api/route-wrappers');

  return {
    requestBoundary: {
      route: (
        _options: unknown,
        handler: (scope: {
          req: Request;
          actor: { id: string };
          db: unknown;
          correlationId: string;
        }) => Promise<Response>,
      ) =>
        withErrorBoundary((req) =>
          handler({
            req,
            actor: { id: 'user-1' },
            db: {},
            correlationId: 'test-correlation-id',
          }),
        ),
    },
  };
});

import { POST } from '@/app/api/v1/plans/bulk-delete/route';

describe('POST /api/v1/plans/bulk-delete', () => {
  beforeEach(() => {
    removePlansForWrite.mockReset();
  });

  it('returns the canonical 500 response when bulk deletion faults', async () => {
    removePlansForWrite.mockRejectedValue(new Error('database unavailable'));

    const response = await POST(
      new Request('http://localhost/api/v1/plans/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planIds: ['00000000-0000-4000-8000-000000000001'],
        }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
    });
  });

  it('normalizes and deduplicates mixed-case plan IDs before bulk deletion', async () => {
    const canonicalPlanId = 'a0000000-0000-4000-8000-000000000000';
    removePlansForWrite.mockResolvedValue([
      { planId: canonicalPlanId, success: true },
    ]);

    const response = await POST(
      new Request('http://localhost/api/v1/plans/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planIds: [canonicalPlanId.toUpperCase(), canonicalPlanId],
        }),
      }),
    );

    expect(removePlansForWrite).toHaveBeenCalledWith({
      planIds: [canonicalPlanId],
      userId: 'user-1',
    });
    expect(response.status).toBe(200);
  });

  it('returns a controlled 413 for an oversized declared JSON body', async () => {
    const response = await POST(
      new Request('http://localhost/api/v1/plans/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(256 * 1024 + 1),
        },
        body: new ReadableStream<Uint8Array>({
          pull() {
            throw new Error('body should not be read');
          },
        }),
        duplex: 'half',
      } as RequestInit),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: 'payload too large',
      code: 'PAYLOAD_TOO_LARGE',
    });
    expect(removePlansForWrite).not.toHaveBeenCalled();
  });
});
