import { describe, expect, it } from 'vitest';

import { recordFailure, startAttempt } from '@/lib/db/queries/attempts';

import { MockDbClient, asDbClient, createInput } from '../helpers/attempts';

describe('attempt service – validation failure', () => {
  it('records failure classification without truncating stored modules', async () => {
    const mockDb = new MockDbClient();
    const longNotes = 'Needs trimming...'.repeat(200);

    const preparation = await startAttempt({
      planId: 'plan-1',
      userId: 'user-1',
      input: createInput({
        topic: 'A'.repeat(210),
        notes: longNotes,
      }),
      dbClient: asDbClient(mockDb),
      now: () => new Date('2024-01-05T00:00:00.000Z'),
    });

    const attempt = await recordFailure({
      planId: 'plan-1',
      preparation,
      classification: 'validation',
      durationMs: 987.3,
      providerMetadata: { provider: 'mock', model: 'validator' },
      timedOut: false,
      extendedTimeout: false,
      dbClient: asDbClient(mockDb),
      now: () => new Date('2024-01-05T00:00:05.000Z'),
    });

    expect(mockDb.modules).toHaveLength(0);
    expect(mockDb.tasks).toHaveLength(0);

    expect(attempt.status).toBe('failure');
    expect(attempt.classification).toBe('validation');
    expect(attempt.durationMs).toBe(987);
    expect(attempt.truncatedTopic).toBe(true);
    expect(attempt.truncatedNotes).toBe(true);

    const metadata = attempt.metadata as Record<string, any>;
    expect(metadata.input.topic).toEqual({
      truncated: true,
      original_length: 210,
    });
    expect(metadata.input.notes).toEqual({
      truncated: true,
      original_length: longNotes.length,
    });
    expect(metadata.failure).toEqual({
      classification: 'validation',
      timedOut: false,
    });
  });
});
