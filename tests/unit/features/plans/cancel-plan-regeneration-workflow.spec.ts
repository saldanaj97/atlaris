import type { CancelPlanRegenerationWorkflowDeps } from '@/features/plans/cancel-plan-regeneration-workflow';

import {
  cancelPlanRegenerationWorkflow,
  consumeIntentionalPlanRegenerationCancellation,
  resetPlanRegenerationCancellationMarkersForTests,
} from '@/features/plans/cancel-plan-regeneration-workflow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('cancelPlanRegenerationWorkflow', () => {
  beforeEach(() => {
    resetPlanRegenerationCancellationMarkersForTests();
  });

  it('does not leave an intentional-cancellation marker when cancellation fails', async () => {
    const cancellationError = new Error('cancel failed');
    const cancel = vi.fn().mockRejectedValue(cancellationError);
    const getRunFn = vi.fn(() => ({ cancel })) as unknown as NonNullable<
      CancelPlanRegenerationWorkflowDeps['getRunFn']
    >;
    const log = { info: vi.fn(), error: vi.fn() };

    await expect(
      cancelPlanRegenerationWorkflow('wrun_failed_cancel', {
        getRunFn,
        log,
      }),
    ).resolves.toBe(false);

    expect(
      consumeIntentionalPlanRegenerationCancellation('wrun_failed_cancel'),
    ).toBe(false);
  });
});
