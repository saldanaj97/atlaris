import {
  removePlanForWrite,
  removePlansForWrite,
} from '@/features/plans/write-service';
import { deletePlan } from '@/lib/db/queries/plans';
import { db as serviceRoleDb } from '@supabase/service-role';
import { createId } from '@tests/fixtures/ids';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/queries/plans', () => ({
  deletePlan: vi.fn(),
}));

const mockDeletePlan = vi.mocked(deletePlan);
const mockTransaction = vi.mocked(serviceRoleDb.transaction);

describe('removePlanForWrite', () => {
  const planId = createId('plan');
  const userId = createId('user');

  beforeEach(() => {
    mockDeletePlan.mockReset();
    mockTransaction.mockClear();
  });

  it('delegates to deletePlan with ownership context and service-role client', async () => {
    mockDeletePlan.mockResolvedValue({ success: true });

    await removePlanForWrite({ planId, userId });

    expect(mockDeletePlan).toHaveBeenCalledWith(planId, userId, serviceRoleDb);
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

  it('throws ConflictError when deletePlan returns active_child_generation', async () => {
    mockDeletePlan.mockResolvedValue({
      success: false,
      reason: 'active_child_generation',
    });

    await expect(removePlanForWrite({ planId, userId })).rejects.toThrow(
      'Cannot delete a plan while a module lesson is generating.',
    );
  });
});

describe('removePlansForWrite', () => {
  const userId = createId('user');
  const firstPlanId = '00000000-0000-4000-8000-000000000001';
  const secondPlanId = '00000000-0000-4000-8000-000000000002';

  beforeEach(() => {
    mockDeletePlan.mockReset();
    mockTransaction.mockClear();
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
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockDeletePlan).toHaveBeenNthCalledWith(
      1,
      firstPlanId,
      userId,
      serviceRoleDb,
    );
    expect(mockDeletePlan).toHaveBeenNthCalledWith(
      2,
      secondPlanId,
      userId,
      serviceRoleDb,
    );
  });

  it('returns per-plan success and failure results without throwing', async () => {
    mockDeletePlan
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, reason: 'not_found' });

    const results = await removePlansForWrite({
      planIds: [firstPlanId, secondPlanId],
      userId,
    });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockDeletePlan).toHaveBeenNthCalledWith(
      1,
      firstPlanId,
      userId,
      serviceRoleDb,
    );
    expect(mockDeletePlan).toHaveBeenNthCalledWith(
      2,
      secondPlanId,
      userId,
      serviceRoleDb,
    );
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

  it('acquires plan locks in canonical UUID order while preserving result order', async () => {
    const laterPlanId = 'f0000000-0000-4000-8000-000000000000';
    const earlierPlanId = 'A0000000-0000-4000-8000-000000000000';
    mockDeletePlan
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, reason: 'not_found' });

    const results = await removePlansForWrite({
      planIds: [laterPlanId, earlierPlanId],
      userId,
    });

    expect(mockDeletePlan).toHaveBeenNthCalledWith(
      1,
      earlierPlanId,
      userId,
      serviceRoleDb,
    );
    expect(mockDeletePlan).toHaveBeenNthCalledWith(
      2,
      laterPlanId,
      userId,
      serviceRoleDb,
    );
    expect(results).toEqual([
      {
        planId: laterPlanId,
        success: false,
        reason: 'not_found',
        message: 'Learning plan not found.',
      },
      { planId: earlierPlanId, success: true },
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

  it('maps active_child_generation failures to readable messages', async () => {
    mockDeletePlan.mockResolvedValue({
      success: false,
      reason: 'active_child_generation',
    });

    const results = await removePlansForWrite({
      planIds: [firstPlanId],
      userId,
    });

    expect(results).toEqual([
      {
        planId: firstPlanId,
        success: false,
        reason: 'active_child_generation',
        message: 'Cannot delete a plan while a module lesson is generating.',
      },
    ]);
  });

  it('propagates unexpected delete errors instead of converting them to conflicts', async () => {
    const error = new Error('database unavailable');
    mockDeletePlan.mockRejectedValueOnce(error);

    await expect(
      removePlansForWrite({
        planIds: [firstPlanId, secondPlanId],
        userId,
      }),
    ).rejects.toBe(error);
  });

  it('propagates a later unexpected delete error from the shared transaction', async () => {
    const error = new Error('database unavailable');
    mockDeletePlan
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(error);

    await expect(
      removePlansForWrite({
        planIds: [firstPlanId, secondPlanId],
        userId,
      }),
    ).rejects.toBe(error);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockDeletePlan).toHaveBeenNthCalledWith(
      1,
      firstPlanId,
      userId,
      serviceRoleDb,
    );
    expect(mockDeletePlan).toHaveBeenNthCalledWith(
      2,
      secondPlanId,
      userId,
      serviceRoleDb,
    );
  });
});
