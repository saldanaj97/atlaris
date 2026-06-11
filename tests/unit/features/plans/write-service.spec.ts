import { removePlanForWrite } from '@/features/plans/write-service';
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
  const dbClient = { tag: 'request-scoped-db' } as never;

  beforeEach(() => {
    mockDeletePlan.mockReset();
  });

  it('forwards the injected db client to deletePlan', async () => {
    mockDeletePlan.mockResolvedValue({ success: true });

    await removePlanForWrite({ planId, userId, dbClient });

    expect(mockDeletePlan).toHaveBeenCalledWith(planId, userId, dbClient);
  });

  it('throws NotFoundError when deletePlan returns not_found', async () => {
    mockDeletePlan.mockResolvedValue({ success: false, reason: 'not_found' });

    await expect(
      removePlanForWrite({ planId, userId, dbClient }),
    ).rejects.toThrow('Learning plan not found.');
  });

  it('throws ConflictError when deletePlan returns currently_generating', async () => {
    mockDeletePlan.mockResolvedValue({
      success: false,
      reason: 'currently_generating',
    });

    await expect(
      removePlanForWrite({ planId, userId, dbClient }),
    ).rejects.toThrow('Cannot delete a plan that is currently generating.');
  });
});
