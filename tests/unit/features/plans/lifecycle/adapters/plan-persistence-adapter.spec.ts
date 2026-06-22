import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/plans/lifecycle/adapters/plan-persistence-store', () => ({
  atomicCheckAndInsertPlan: vi.fn(),
  findCappedPlanWithoutModules: vi.fn(),
  markPlanGenerationFailure: vi.fn(),
  markPlanGenerationSuccess: vi.fn(),
}));

import { PlanPersistenceAdapter } from '@/features/plans/lifecycle/adapters/plan-persistence-adapter';
import * as persistenceStore from '@/features/plans/lifecycle/adapters/plan-persistence-store';
import { makeDbClient } from '@tests/fixtures/db-mocks';

const planData = {
  topic: 't',
  skillLevel: 'beginner',
  weeklyHours: 1,
  learningStyle: 'mixed',
  visibility: 'private',
  origin: 'ai',
} as const;

describe('PlanPersistenceAdapter', () => {
  const fakeDb = makeDbClient();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('atomicInsertPlan returns the explicit limit result from the store', async () => {
    vi.mocked(persistenceStore.atomicCheckAndInsertPlan).mockResolvedValue({
      status: 'limit_reached',
      currentCount: 3,
      limit: 3,
    });
    const adapter = new PlanPersistenceAdapter(fakeDb);
    const result = await adapter.atomicInsertPlan('user-1', planData);
    expect(result).toEqual({
      status: 'limit_reached',
      currentCount: 3,
      limit: 3,
    });
  });

  it('atomicInsertPlan rethrows non-limit errors from the store', async () => {
    const err = new Error('db down');
    vi.mocked(persistenceStore.atomicCheckAndInsertPlan).mockRejectedValue(err);
    const adapter = new PlanPersistenceAdapter(fakeDb);
    await expect(adapter.atomicInsertPlan('user-1', planData)).rejects.toThrow(
      err,
    );
  });

  it('atomicInsertPlan returns success when store inserts', async () => {
    vi.mocked(persistenceStore.atomicCheckAndInsertPlan).mockResolvedValue({
      status: 'created',
      id: 'plan-1',
    });
    const adapter = new PlanPersistenceAdapter(fakeDb);
    const result = await adapter.atomicInsertPlan('user-1', planData);
    expect(result).toEqual({ status: 'created', id: 'plan-1' });
  });
});
