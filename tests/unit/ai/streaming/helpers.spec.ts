import { safeMarkPlanFailed } from '@/app/api/v1/plans/stream/helpers';
import type { StreamingHelperDependencies } from '@/app/api/v1/plans/stream/helpers';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createId } from '../../../fixtures/ids';

let mockMarkPlanGenerationFailure: NonNullable<
  StreamingHelperDependencies['markPlanGenerationFailure']
>;

describe('stream helpers', () => {
  beforeEach(() => {
    mockMarkPlanGenerationFailure = vi
      .fn()
      .mockResolvedValue(undefined) as NonNullable<
      StreamingHelperDependencies['markPlanGenerationFailure']
    >;
  });

  it('swallows mark failure errors in safeMarkPlanFailed', async () => {
    vi.mocked(mockMarkPlanGenerationFailure).mockRejectedValueOnce(
      new Error('db down')
    );

    await expect(
      safeMarkPlanFailed(
        createId('plan'),
        createId('user'),
        {} as AttemptsDbClient,
        { markPlanGenerationFailure: mockMarkPlanGenerationFailure }
      )
    ).resolves.toBeUndefined();

    expect(mockMarkPlanGenerationFailure).toHaveBeenCalledTimes(1);
  });
});
