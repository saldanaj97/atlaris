import { beforeEach, describe, expect, it, vi } from 'vitest';
import { safeMarkPlanFailed } from '@/features/plans/session/stream-cleanup';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';
import { createId } from '../../../fixtures/ids';

describe('safeMarkPlanFailed', () => {
  const planId = createId('plan');
  const userId = createId('user');
  const dbClient = {} as AttemptsDbClient;
  const loggerError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('swallows mark failure errors and logs plan + user context', async () => {
    const markFailureError = new Error('db down');
    const injectedMarkFailure = vi.fn().mockRejectedValue(markFailureError);

    await expect(
      safeMarkPlanFailed(planId, userId, dbClient, {
        markPlanGenerationFailure: injectedMarkFailure,
        logger: { error: loggerError },
      })
    ).resolves.toBeUndefined();

    expect(injectedMarkFailure).toHaveBeenCalledTimes(1);
    expect(injectedMarkFailure).toHaveBeenCalledWith(planId, dbClient);
    expect(loggerError).toHaveBeenCalledWith(
      {
        error: markFailureError,
        planId,
        userId,
      },
      'Failed to mark plan as failed after generation error.'
    );
  });

  it('does not log when the injected failure marker succeeds', async () => {
    const injectedMarkFailure = vi.fn().mockResolvedValue(undefined);

    await expect(
      safeMarkPlanFailed(planId, userId, dbClient, {
        markPlanGenerationFailure: injectedMarkFailure,
        logger: { error: loggerError },
      })
    ).resolves.toBeUndefined();

    expect(injectedMarkFailure).toHaveBeenCalledTimes(1);
    expect(injectedMarkFailure).toHaveBeenCalledWith(planId, dbClient);
    expect(loggerError).not.toHaveBeenCalled();
  });
});
