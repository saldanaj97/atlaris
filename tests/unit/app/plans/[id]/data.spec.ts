import { describe, expect, it, vi } from 'vitest';

import { loadPlanForPage } from '@/app/plans/[id]/data';
import type { PlanAccessResult } from '@/app/plans/[id]/types';
import { createFailedPlanAccessResult } from '../../../../fixtures/plan-access';

describe('loadPlanForPage', () => {
  it('invokes getPlanForPage on every call (no cross-request memoization by planId)', async () => {
    const getPlanForPageMock =
      vi.fn<(planId: string) => Promise<PlanAccessResult>>();
    const result = createFailedPlanAccessResult();

    getPlanForPageMock.mockResolvedValue(result);

    const first = await loadPlanForPage('plan-a', {
      getPlanForPage: getPlanForPageMock,
    });
    const second = await loadPlanForPage('plan-a', {
      getPlanForPage: getPlanForPageMock,
    });

    expect(first).toEqual(result);
    expect(second).toEqual(result);
    expect(getPlanForPageMock).toHaveBeenCalledTimes(2);
    expect(getPlanForPageMock).toHaveBeenNthCalledWith(1, 'plan-a');
    expect(getPlanForPageMock).toHaveBeenNthCalledWith(2, 'plan-a');
  });
});
