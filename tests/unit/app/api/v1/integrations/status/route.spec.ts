import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  loggerMock: {
    info: vi.fn(),
    error: vi.fn(),
  },
  eqMock: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();

  return {
    ...actual,
    eq: mocks.eqMock,
  };
});

vi.mock('@/lib/api/auth', () => ({
  withAuthAndRateLimit: (_scope: string, handler: unknown) => handler,
  withErrorBoundary: (handler: unknown) => handler,
}));

vi.mock('@/lib/db/runtime', () => ({
  getDb: mocks.getDbMock,
}));

vi.mock('@/lib/logging/logger', () => ({
  logger: mocks.loggerMock,
}));

import { GET } from '@/app/api/v1/integrations/status/route';

function mockStatusQuery(tokens: unknown[]): void {
  const query = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(tokens),
  };

  mocks.getDbMock.mockReturnValue({
    select: vi.fn().mockReturnValue(query),
  });
}

describe('GET /api/v1/integrations/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns connected integrations and logs start, count, and success', async () => {
    mockStatusQuery([
      {
        provider: 'google_calendar',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ]);

    const response = await GET({ user: { id: 'user-123' } } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      integrations: [
        {
          provider: 'google_calendar',
          connected: true,
          connectedAt: '2026-03-01T00:00:00.000Z',
        },
      ],
    });

    expect(mocks.loggerMock.info).toHaveBeenNthCalledWith(
      1,
      { userId: 'user-123' },
      'Integrations status fetch started'
    );
    expect(mocks.loggerMock.info).toHaveBeenNthCalledWith(
      2,
      { userId: 'user-123', tokenCount: 1 },
      'Integrations status token count fetched'
    );
    expect(mocks.loggerMock.info).toHaveBeenNthCalledWith(
      3,
      { userId: 'user-123', integrationCount: 1 },
      'Integrations status fetch succeeded'
    );
  });

  it('logs and rethrows database failures', async () => {
    const failure = new Error('db offline');
    const query = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockRejectedValue(failure),
    };

    mocks.getDbMock.mockReturnValue({
      select: vi.fn().mockReturnValue(query),
    });

    await expect(GET({ user: { id: 'user-123' } } as never)).rejects.toThrow(
      'db offline'
    );

    expect(mocks.loggerMock.error).toHaveBeenCalledWith(
      { userId: 'user-123', error: failure },
      'Integrations status fetch failed'
    );
  });
});
