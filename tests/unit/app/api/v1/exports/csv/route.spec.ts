import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  andMock: vi.fn((...args: unknown[]) => ({ kind: 'and', args })),
  eqMock: vi.fn((left: unknown, right: unknown) => ({
    kind: 'eq',
    left,
    right,
  })),
  countMock: vi.fn(() => ({ kind: 'count' })),
}));

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();

  return {
    ...actual,
    and: mocks.andMock,
    eq: mocks.eqMock,
    count: mocks.countMock,
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

import { GET } from '@/app/api/v1/exports/csv/route';

type MockQuery = {
  from: ReturnType<typeof vi.fn>;
  leftJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy?: ReturnType<typeof vi.fn>;
  limit?: ReturnType<typeof vi.fn>;
};

function makeMockSelect(countValue: number, rows: unknown[]): MockQuery {
  const countQuery: MockQuery = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ count: countValue }]),
  };

  const rowsQuery: MockQuery = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };

  mocks.getDbMock.mockReturnValue({
    select: vi
      .fn()
      .mockReturnValueOnce(countQuery)
      .mockReturnValueOnce(rowsQuery),
  });

  return rowsQuery;
}

describe('GET /api/v1/exports/csv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('streams CSV output, prepends UTF-8 BOM, and quotes CR/CRLF-containing fields', async () => {
    makeMockSelect(1, [
      {
        planTopic: 'Plan A',
        skillLevel: 'beginner',
        weeklyHours: 5,
        startDate: '2026-03-01',
        deadlineDate: '2026-04-01',
        planCreatedAt: new Date('2026-03-01T00:00:00.000Z'),
        moduleTitle: 'Module\r\nOne',
        moduleOrder: 1,
        moduleEstimatedMinutes: 30,
        taskTitle: 'Task\rTitle',
        taskOrder: 1,
        taskEstimatedMinutes: 15,
        progressStatus: 'completed',
        completedAt: new Date('2026-03-02T00:00:00.000Z'),
      },
    ]);

    const response = await GET({ user: { id: 'user-123' } } as never);

    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(ReadableStream);
    expect(response.headers.get('Content-Type')).toContain('text/csv');

    // Verify UTF-8 BOM bytes (0xEF 0xBB 0xBF) are the first three bytes.
    // TextDecoder strips the BOM from decoded text, so we inspect the raw buffer.
    const buffer = await response.clone().arrayBuffer();
    const bytes = new Uint8Array(buffer);
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);

    const csv = await response.text();
    expect(csv).toContain('Plan,Skill Level,Weekly Hours');
    expect(csv).toContain('"Module\r\nOne"');
    expect(csv).toContain('"Task\rTitle"');
    expect(mocks.loggerMock.info).toHaveBeenCalledWith(
      { userId: 'user-123', rowCount: 1 },
      'CSV export generated'
    );
  });

  it('scopes task progress joins by task id and user id', async () => {
    const rowsQuery = makeMockSelect(0, []);

    await GET({ user: { id: 'user-123' } } as never);

    expect(rowsQuery.leftJoin).toHaveBeenCalledTimes(3);
    expect(rowsQuery.leftJoin.mock.calls[2]?.[1]).toEqual({
      kind: 'and',
      args: [
        { kind: 'eq', left: expect.anything(), right: expect.anything() },
        { kind: 'eq', left: expect.anything(), right: 'user-123' },
      ],
    });
  });

  it('fails fast when the count query exceeds the synchronous row limit', async () => {
    const countQuery: MockQuery = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ count: 10_001 }]),
    };

    mocks.getDbMock.mockReturnValue({
      select: vi.fn().mockReturnValueOnce(countQuery),
    });

    await expect(
      GET({ user: { id: 'user-123' } } as never)
    ).rejects.toMatchObject({
      name: 'AppError',
      message: 'CSV export is too large for direct download.',
    });

    expect(mocks.loggerMock.warn).toHaveBeenCalledWith(
      { userId: 'user-123', rowCount: 10_001, maxRows: 10_000 },
      'CSV export exceeded synchronous row limit'
    );
  });

  it('fetches rows with limit(MAX_CSV_EXPORT_ROWS) after a passing count', async () => {
    const rowsQuery = makeMockSelect(1, []);

    await GET({ user: { id: 'user-123' } } as never);

    expect(rowsQuery.limit).toHaveBeenCalledWith(10_000);
  });
});
