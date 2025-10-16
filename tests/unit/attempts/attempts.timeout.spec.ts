import { describe, expect, it } from 'vitest';

import { recordFailure } from '@/lib/db/queries/attempts';

import { MockDbClient, asDbClient } from '../helpers/attempts';

describe('attempt service – timeout failure', () => {
  it('persists timeout classification and metadata flags', async () => {
    const mockDb = new MockDbClient();

    const preparation = {
      planId: 'plan-1',
      userId: 'user-1',
      attemptNumber: 1,
      capped: false,
      startedAt: new Date('2024-01-06T12:00:00.000Z'),
      sanitized: {
        topic: {
          value: 'GraphQL APIs',
          truncated: false,
          originalLength: 'GraphQL APIs'.length,
        },
        notes: {
          value: undefined,
          truncated: false,
        },
      },
      promptHash: 'hash-abc',
    } as const;

    const attempt = await recordFailure({
      planId: 'plan-1',
      preparation,
      classification: 'timeout',
      durationMs: 10_001.4,
      timedOut: true,
      extendedTimeout: true,
      providerMetadata: { provider: 'mock', model: 'slow' },
      dbClient: asDbClient(mockDb),
      now: () => new Date('2024-01-06T12:00:20.000Z'),
    });

    expect(mockDb.modules).toHaveLength(0);
    expect(mockDb.tasks).toHaveLength(0);

    expect(attempt.status).toBe('failure');
    expect(attempt.classification).toBe('timeout');
    expect(attempt.durationMs).toBe(10001);
    expect(attempt.promptHash).toBe('hash-abc');

    const metadata = attempt.metadata as Record<string, any>;
    expect(metadata.failure).toEqual({
      classification: 'timeout',
      timedOut: true,
    });
    expect(metadata.timing).toMatchObject({
      extended_timeout: true,
    });
  });
});
