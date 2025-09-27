import { describe, expect, it } from 'vitest';

import { ATTEMPT_CAP, startAttempt } from '@/lib/db/queries/attempts';

import { MockDbClient, asDbClient, createInput } from './helpers/attempts';

describe('attempt service – capped attempts', () => {
  it('flags preparation as capped when limit reached', async () => {
    const mockDb = new MockDbClient();
    mockDb.existingAttempts = ATTEMPT_CAP;

    const preparation = await startAttempt({
      planId: 'plan-1',
      userId: 'user-1',
      input: createInput(),
      dbClient: asDbClient(mockDb),
      now: () => new Date('2024-01-07T00:00:00.000Z'),
    });

    expect(preparation.capped).toBe(true);
    expect(preparation.attemptNumber).toBe(ATTEMPT_CAP + 1);
  });
});
