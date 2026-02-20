import { beforeEach, describe, expect, it } from 'vitest';

import {
  getLearningPlanDetail,
  getPlanAttemptsForUser,
} from '@/lib/db/queries/plans';
import { createTestModule, createTestTask } from '../../fixtures/modules';
import { createTestPlan } from '../../fixtures/plans';
import { createTestUser } from '../../fixtures/users';

const NON_EXISTENT_PLAN_ID = '00000000-0000-0000-0000-000000000000';

describe('Plan Queries - Tenant Scoping', () => {
  let ownerId: string;
  let attackerId: string;
  let ownerPlanId: string;

  beforeEach(async () => {
    const owner = await createTestUser();
    const attacker = await createTestUser();
    ownerId = owner.id;
    attackerId = attacker.id;

    const plan = await createTestPlan({
      userId: ownerId,
      visibility: 'private',
      generationStatus: 'ready',
    });
    ownerPlanId = plan.id;

    const module = await createTestModule({
      planId: ownerPlanId,
      title: 'Test Module',
      description: 'Test description',
      estimatedMinutes: 60,
    });

    await createTestTask({
      moduleId: module.id,
      title: 'Test Task',
      description: 'Test task description',
      estimatedMinutes: 30,
    });
  });

  describe('getLearningPlanDetail', () => {
    it('returns plan detail for owner', async () => {
      const detail = await getLearningPlanDetail(ownerPlanId, ownerId);

      expect(detail).not.toBeNull();
      expect(detail?.plan.id).toBe(ownerPlanId);
      expect(detail?.plan.userId).toBe(ownerId);
    });

    it('returns null when accessing plan owned by another user (cross-tenant protection)', async () => {
      const detail = await getLearningPlanDetail(ownerPlanId, attackerId);

      expect(detail).toBeNull();
    });

    it('returns null for non-existent plan', async () => {
      const detail = await getLearningPlanDetail(NON_EXISTENT_PLAN_ID, ownerId);

      expect(detail).toBeNull();
    });
  });

  describe('getPlanAttemptsForUser', () => {
    it('returns attempts for owner', async () => {
      const result = await getPlanAttemptsForUser(ownerPlanId, ownerId);

      expect(result).not.toBeNull();
      expect(result?.plan.id).toBe(ownerPlanId);
      expect(result?.plan.topic).toBe('Owner Plan');
      expect(result?.plan.generationStatus).toBe('ready');
      // Ownership is already enforced by the WHERE clause in the query
    });

    it('returns null when accessing plan owned by another user (cross-tenant protection)', async () => {
      const result = await getPlanAttemptsForUser(ownerPlanId, attackerId);

      expect(result).toBeNull();
    });
  });
});
