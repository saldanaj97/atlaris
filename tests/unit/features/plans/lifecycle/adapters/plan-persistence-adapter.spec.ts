import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/plans/lifecycle/adapters/plan-persistence-store', () => ({
  atomicCheckAndInsertPlan: vi.fn(),
  findCappedPlanWithoutModules: vi.fn(),
  findRecentDuplicatePlan: vi.fn(),
  markPlanGenerationFailure: vi.fn(),
  markPlanGenerationSuccess: vi.fn(),
}));

import { PlanLimitReachedError } from '@/features/plans/errors';
import { PlanPersistenceAdapter } from '@/features/plans/lifecycle/adapters/plan-persistence-adapter';
import * as persistenceStore from '@/features/plans/lifecycle/adapters/plan-persistence-store';
import type { DbClient } from '@/lib/db/types';

const planData = {
  topic: 't',
  skillLevel: 'beginner',
  weeklyHours: 1,
  learningStyle: 'mixed',
  visibility: 'private',
  origin: 'ai',
} as const;

describe('PlanPersistenceAdapter', () => {
  const fakeDb = {} as DbClient;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('atomicInsertPlan returns failure when store throws PlanLimitReachedError', async () => {
    vi.mocked(persistenceStore.atomicCheckAndInsertPlan).mockRejectedValue(
      new PlanLimitReachedError()
    );
    const adapter = new PlanPersistenceAdapter(fakeDb);
    const result = await adapter.atomicInsertPlan('user-1', planData);
    expect(result).toEqual({
      success: false,
      reason: 'Plan limit reached for current subscription tier',
    });
  });

  it('atomicInsertPlan rethrows non-limit errors from the store', async () => {
    const err = new Error('db down');
    vi.mocked(persistenceStore.atomicCheckAndInsertPlan).mockRejectedValue(err);
    const adapter = new PlanPersistenceAdapter(fakeDb);
    await expect(adapter.atomicInsertPlan('user-1', planData)).rejects.toThrow(
      err
    );
  });

  it('atomicInsertPlan returns success when store inserts', async () => {
    vi.mocked(persistenceStore.atomicCheckAndInsertPlan).mockResolvedValue({
      id: 'plan-1',
    });
    const adapter = new PlanPersistenceAdapter(fakeDb);
    const result = await adapter.atomicInsertPlan('user-1', planData);
    expect(result).toEqual({ success: true, id: 'plan-1' });
  });
});
