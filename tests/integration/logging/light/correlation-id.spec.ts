import { describe, expect, it, vi } from 'vitest';

import { withRequestContext } from '@/lib/api/context';
import { recordSuccess, startAttempt } from '@/lib/db/queries/attempts';

import {
  MockDbClient,
  asDbClient,
  createInput,
  createModules,
  createSequentialNow,
} from '../../../helpers/attempts';

describe('attempt logging correlation id', () => {
  it('embeds the active correlation id in attempt logs', async () => {
    const mockDb = new MockDbClient();
    mockDb.planOwnerUserId = 'user-correlation';

    const now = createSequentialNow([
      new Date('2024-04-01T00:00:00.000Z'),
      new Date('2024-04-01T00:00:03.500Z'),
    ]);

    const preparation = await startAttempt({
      planId: 'plan-correlation',
      userId: 'user-correlation',
      input: createInput(),
      dbClient: asDbClient(mockDb),
      now,
    });

    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await withRequestContext(
      { correlationId: 'corr-abc-123', userId: 'user-correlation' },
      async () => {
        await recordSuccess({
          planId: 'plan-correlation',
          preparation,
          modules: createModules(),
          providerMetadata: undefined,
          durationMs: 3500,
          extendedTimeout: false,
          dbClient: asDbClient(mockDb),
          now,
        });
      }
    );

    expect(consoleSpy).toHaveBeenCalled();
    const lastCall = consoleSpy.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe('[attempts] success');
    expect(lastCall?.[1]).toMatchObject({
      correlationId: 'corr-abc-123',
      planId: 'plan-correlation',
      durationMs: expect.any(Number),
    });

    consoleSpy.mockRestore();
  });
});
