import {
  removePlanForWrite,
  removePlansForWrite,
} from '@/features/plans/write-service';
import { deletePlan } from '@/lib/db/queries/plans';
import { createId } from '@tests/fixtures/ids';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/queries/plans', () => ({
  deletePlan: vi.fn(),
}));

const mockDeletePlan = vi.mocked(deletePlan);

describe('removePlanForWrite', () => {
  const planId = createId('plan');
  const userId = createId('user');

  beforeEach(() => {
    mockDeletePlan.mockReset();
  });

  it('delegates to deletePlan with ownership context only', async () => {
    mockDeletePlan.mockResolvedValue({ success: true });

    await removePlanForWrite({ planId, userId });

    expect(mockDeletePlan).toHaveBeenCalledWith(planId, userId);
  });

  it('throws NotFoundError when deletePlan returns not_found', async () => {
    mockDeletePlan.mockResolvedValue({ success: false, reason: 'not_found' });

    await expect(removePlanForWrite({ planId, userId })).rejects.toThrow(
      'Learning plan not found.',
    );
  });

  it('throws ConflictError when deletePlan returns currently_generating', async () => {
    mockDeletePlan.mockResolvedValue({
      success: false,
      reason: 'currently_generating',
    });

    await expect(removePlanForWrite({ planId, userId })).rejects.toThrow(
      'Cannot delete a plan that is currently generating.',
    );
  });
});

describe('removePlansForWrite', () => {
  const userId = createId('user');
  const firstPlanId = createId('plan');
  const secondPlanId = createId('plan');

  beforeEach(() => {
    mockDeletePlan.mockReset();
  });

  it('returns all successes when every plan deletes', async () => {
    mockDeletePlan.mockResolvedValue({ success: true });

    const results = await removePlansForWrite({
      planIds: [firstPlanId, secondPlanId],
      userId,
    });

    expect(results).toEqual([
      { planId: firstPlanId, success: true },
      { planId: secondPlanId, success: true },
    ]);
  });

  it('returns per-plan success and failure results without throwing', async () => {
    mockDeletePlan
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, reason: 'not_found' });

    const results = await removePlansForWrite({
      planIds: [firstPlanId, secondPlanId],
      userId,
    });

    expect(mockDeletePlan).toHaveBeenNthCalledWith(1, firstPlanId, userId);
    expect(mockDeletePlan).toHaveBeenNthCalledWith(2, secondPlanId, userId);
    expect(results).toEqual([
      { planId: firstPlanId, success: true },
      {
        planId: secondPlanId,
        success: false,
        reason: 'not_found',
        message: 'Learning plan not found.',
      },
    ]);
  });

  it('maps currently_generating failures to readable messages', async () => {
    mockDeletePlan.mockResolvedValue({
      success: false,
      reason: 'currently_generating',
    });

    const results = await removePlansForWrite({
      planIds: [firstPlanId],
      userId,
    });

    expect(results).toEqual([
      {
        planId: firstPlanId,
        success: false,
        reason: 'currently_generating',
        message: 'Cannot delete a plan that is currently generating.',
      },
    ]);
  });

  it('rethrows unexpected deletePlan errors instead of swallowing them', async () => {
    mockDeletePlan.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      removePlansForWrite({
        planIds: [firstPlanId],
        userId,
      }),
    ).rejects.toThrow('database unavailable');
  });
});
