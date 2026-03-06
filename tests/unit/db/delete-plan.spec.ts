import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OwnedPlanRecord } from '@/lib/db/queries/helpers/plans-helpers';
import { deletePlan } from '@/lib/db/queries/plans';
import type { getDb } from '@/lib/db/runtime';

import { createId } from '../../fixtures/ids';

// Mock selectOwnedPlanById so we control plan lookup results
const mockSelectOwnedPlanById = vi.fn();
vi.mock('@/lib/db/queries/helpers/plans-helpers', () => ({
  selectOwnedPlanById: (...args: unknown[]) => mockSelectOwnedPlanById(...args),
}));

// Mock getDb so the delete query doesn't hit a real DB
const mockWhere = vi.fn().mockResolvedValue([]);
const mockDeleteFn = vi.fn().mockReturnValue({ where: mockWhere });
const mockDbClient = {
  delete: mockDeleteFn,
} as unknown as ReturnType<typeof getDb>;

vi.mock('@/lib/db/runtime', () => ({
  getDb: () => mockDbClient,
}));

function buildOwnedPlan(
  overrides: Partial<OwnedPlanRecord> = {}
): OwnedPlanRecord {
  return {
    id: createId('plan'),
    userId: createId('user'),
    topic: 'Test Topic',
    skillLevel: 'beginner',
    weeklyHours: 5,
    learningStyle: 'reading',
    startDate: null,
    deadlineDate: null,
    visibility: 'private',
    origin: 'ai',
    extractedContext: null,
    generationStatus: 'ready',
    isQuotaEligible: false,
    finalizedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('deletePlan', () => {
  const userId = createId('user');
  const planId = createId('plan');

  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteFn.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([]);
  });

  it('returns not_found when plan does not exist', async () => {
    mockSelectOwnedPlanById.mockResolvedValue(null);

    const result = await deletePlan(planId, userId);

    expect(result).toEqual({ success: false, reason: 'not_found' });
    expect(mockDeleteFn).not.toHaveBeenCalled();
  });

  it('returns currently_generating when plan is actively generating', async () => {
    const plan = buildOwnedPlan({
      id: planId,
      userId,
      generationStatus: 'generating',
    });
    mockSelectOwnedPlanById.mockResolvedValue(plan);

    const result = await deletePlan(planId, userId);

    expect(result).toEqual({ success: false, reason: 'currently_generating' });
    expect(mockDeleteFn).not.toHaveBeenCalled();
  });

  it('deletes a ready plan and returns success', async () => {
    const plan = buildOwnedPlan({
      id: planId,
      userId,
      generationStatus: 'ready',
    });
    mockSelectOwnedPlanById.mockResolvedValue(plan);

    const result = await deletePlan(planId, userId);

    expect(result).toEqual({ success: true });
    expect(mockDeleteFn).toHaveBeenCalledTimes(1);
  });

  it('deletes a failed plan and returns success', async () => {
    const plan = buildOwnedPlan({
      id: planId,
      userId,
      generationStatus: 'failed',
    });
    mockSelectOwnedPlanById.mockResolvedValue(plan);

    const result = await deletePlan(planId, userId);

    expect(result).toEqual({ success: true });
    expect(mockDeleteFn).toHaveBeenCalledTimes(1);
  });

  it('deletes a pending_retry plan and returns success', async () => {
    const plan = buildOwnedPlan({
      id: planId,
      userId,
      generationStatus: 'pending_retry',
    });
    mockSelectOwnedPlanById.mockResolvedValue(plan);

    const result = await deletePlan(planId, userId);

    expect(result).toEqual({ success: true });
    expect(mockDeleteFn).toHaveBeenCalledTimes(1);
  });

  it('passes the correct dbClient to selectOwnedPlanById', async () => {
    mockSelectOwnedPlanById.mockResolvedValue(null);

    await deletePlan(planId, userId);

    expect(mockSelectOwnedPlanById).toHaveBeenCalledWith({
      planId,
      ownerUserId: userId,
      dbClient: mockDbClient,
    });
  });
});
