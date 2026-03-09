import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deletePlan } from '@/lib/db/queries/plans';
import { learningPlans } from '@/lib/db/schema';

import { createId } from '../../fixtures/ids';
import { createTestPlan } from '../../fixtures/owned-plan-record';

type DeletePlanDbClient = NonNullable<Parameters<typeof deletePlan>[2]>;

const mockSelectOwnedPlanById = vi.fn();
const mockReturning = vi.fn();
const mockWhere = vi.fn();
const mockDeleteFn = vi.fn();
const mockSelectFn = vi.fn();
const mockDbClient = {
  delete: mockDeleteFn,
  select: mockSelectFn,
} satisfies DeletePlanDbClient;
const pgDialect = new PgDialect();

describe('deletePlan', () => {
  const userId = createId('user');
  const planId = createId('plan');
  let capturedDeleteWhere: Parameters<PgDialect['sqlToQuery']>[0] | undefined;

  beforeEach(() => {
    mockSelectOwnedPlanById.mockReset();
    mockReturning.mockReset();
    mockWhere.mockReset();
    mockDeleteFn.mockReset();
    capturedDeleteWhere = undefined;

    mockDeleteFn.mockImplementation((_table: unknown) => ({
      where: mockWhere,
    }));
    mockWhere.mockImplementation((whereClause: unknown) => {
      capturedDeleteWhere = whereClause as Parameters<
        PgDialect['sqlToQuery']
      >[0];
      return { returning: mockReturning };
    });
    mockReturning.mockResolvedValue([{ id: planId }]);
  });

  it('returns not_found when plan does not exist', async () => {
    mockSelectOwnedPlanById.mockResolvedValue(null);

    const result = await deletePlan(planId, userId, mockDbClient, {
      selectOwnedPlanById: mockSelectOwnedPlanById,
    });

    expect(result).toEqual({ success: false, reason: 'not_found' });
    expect(mockDeleteFn).not.toHaveBeenCalled();
    expect(mockSelectOwnedPlanById).toHaveBeenCalledWith({
      planId,
      ownerUserId: userId,
      dbClient: mockDbClient,
    });
  });

  it('returns currently_generating when plan is actively generating', async () => {
    const plan = createTestPlan({
      id: planId,
      userId,
      generationStatus: 'generating',
    });
    mockSelectOwnedPlanById.mockResolvedValue(plan);

    const result = await deletePlan(planId, userId, mockDbClient, {
      selectOwnedPlanById: mockSelectOwnedPlanById,
    });

    expect(result).toEqual({ success: false, reason: 'currently_generating' });
    expect(mockDeleteFn).not.toHaveBeenCalled();
  });

  it('deletes a ready plan with the expected target and predicate', async () => {
    const plan = createTestPlan({
      id: planId,
      userId,
      generationStatus: 'ready',
    });
    mockSelectOwnedPlanById.mockResolvedValue(plan);

    const result = await deletePlan(planId, userId, mockDbClient, {
      selectOwnedPlanById: mockSelectOwnedPlanById,
    });

    expect(result).toEqual({ success: true });
    expect(mockDeleteFn).toHaveBeenCalledTimes(1);
    expect(mockDeleteFn).toHaveBeenCalledWith(learningPlans);
    expect(mockWhere).toHaveBeenCalledTimes(1);

    const deleteWhereQuery = pgDialect.sqlToQuery(
      capturedDeleteWhere as Parameters<PgDialect['sqlToQuery']>[0]
    );
    expect(deleteWhereQuery.sql).toContain('"learning_plans"."id"');
    expect(deleteWhereQuery.sql).toContain('"learning_plans"."user_id"');
    expect(deleteWhereQuery.sql).toContain(
      '"learning_plans"."generation_status"'
    );
    expect(deleteWhereQuery.params).toEqual([
      planId,
      userId,
      'ready',
      'failed',
      'pending_retry',
    ]);
  });

  it('propagates delete errors from the database layer', async () => {
    const plan = createTestPlan({
      id: planId,
      userId,
      generationStatus: 'ready',
    });
    const connectionLostError = new Error('Connection lost');
    mockSelectOwnedPlanById.mockResolvedValue(plan);
    mockWhere.mockImplementation(() => {
      throw connectionLostError;
    });

    await expect(
      deletePlan(planId, userId, mockDbClient, {
        selectOwnedPlanById: mockSelectOwnedPlanById,
      })
    ).rejects.toThrow(connectionLostError);
  });

  it.each(['failed', 'pending_retry'] as const)(
    'deletes a %s plan and returns success',
    async (generationStatus) => {
      const plan = createTestPlan({
        id: planId,
        userId,
        generationStatus,
      });
      mockSelectOwnedPlanById.mockResolvedValue(plan);

      const result = await deletePlan(planId, userId, mockDbClient, {
        selectOwnedPlanById: mockSelectOwnedPlanById,
      });

      expect(result).toEqual({ success: true });
      expect(mockDeleteFn).toHaveBeenCalledTimes(1);
    }
  );

  it('returns currently_generating when the plan starts generating before delete', async () => {
    mockSelectOwnedPlanById
      .mockResolvedValueOnce(
        createTestPlan({
          id: planId,
          userId,
          generationStatus: 'ready',
        })
      )
      .mockResolvedValueOnce(
        createTestPlan({
          id: planId,
          userId,
          generationStatus: 'generating',
        })
      );
    mockReturning.mockResolvedValue([]);

    const result = await deletePlan(planId, userId, mockDbClient, {
      selectOwnedPlanById: mockSelectOwnedPlanById,
    });

    expect(result).toEqual({ success: false, reason: 'currently_generating' });
    expect(mockSelectOwnedPlanById).toHaveBeenCalledTimes(2);
  });

  it('returns not_found when delete affects no rows and the plan is gone', async () => {
    mockSelectOwnedPlanById
      .mockResolvedValueOnce(
        createTestPlan({
          id: planId,
          userId,
          generationStatus: 'ready',
        })
      )
      .mockResolvedValueOnce(null);
    mockReturning.mockResolvedValue([]);

    const result = await deletePlan(planId, userId, mockDbClient, {
      selectOwnedPlanById: mockSelectOwnedPlanById,
    });

    expect(result).toEqual({ success: false, reason: 'not_found' });
    expect(mockSelectOwnedPlanById).toHaveBeenCalledTimes(2);
  });
});
