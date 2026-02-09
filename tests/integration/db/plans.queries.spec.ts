import { describe, expect, it, beforeEach } from 'vitest';

import { db } from '@/lib/db/service-role';
import {
  getLearningPlanDetail,
  getPlanAttemptsForUser,
  getUserLearningPlans,
} from '@/lib/db/queries/plans';
import { learningPlans, modules, tasks } from '@/lib/db/schema';
import { ensureUser } from '../../helpers/db';

describe('Plan Queries - Tenant Scoping', () => {
  let ownerId: string;
  let attackerId: string;
  let ownerPlanId: string;

  beforeEach(async () => {
    // Create two users
    ownerId = await ensureUser({
      authUserId: 'auth_plan_queries_owner',
      email: 'owner-queries@example.com',
    });

    attackerId = await ensureUser({
      authUserId: 'auth_plan_queries_attacker',
      email: 'attacker-queries@example.com',
    });

    // Create a plan for the owner
    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: ownerId,
        topic: 'Owner Plan',
        skillLevel: 'intermediate',
        weeklyHours: 10,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
        generationStatus: 'ready',
      })
      .returning();

    ownerPlanId = plan.id;

    // Add modules and tasks to make it a complete plan
    const [module] = await db
      .insert(modules)
      .values({
        planId: ownerPlanId,
        order: 1,
        title: 'Test Module',
        description: 'Test description',
        estimatedMinutes: 60,
      })
      .returning();

    await db.insert(tasks).values({
      moduleId: module.id,
      order: 1,
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
      const detail = await getLearningPlanDetail(
        '00000000-0000-0000-0000-000000000000',
        ownerId
      );

      expect(detail).toBeNull();
    });
  });

  describe('getPlanAttemptsForUser', () => {
    it('returns attempts for owner', async () => {
      const result = await getPlanAttemptsForUser(ownerPlanId, ownerId);

      expect(result).not.toBeNull();
      expect(result?.plan.id).toBe(ownerPlanId);
      // Ownership is already enforced by the WHERE clause in the query
    });

    it('returns null when accessing plan owned by another user (cross-tenant protection)', async () => {
      const result = await getPlanAttemptsForUser(ownerPlanId, attackerId);

      expect(result).toBeNull();
    });
  });

  describe('getUserLearningPlans', () => {
    it('returns only plans owned by the specified user', async () => {
      // Create another plan for the attacker
      const [attackerPlan] = await db
        .insert(learningPlans)
        .values({
          userId: attackerId,
          topic: 'Attacker Plan',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'reading',
          visibility: 'private',
          origin: 'ai',
        })
        .returning();

      const ownerPlans = await getUserLearningPlans(ownerId);
      const attackerPlans = await getUserLearningPlans(attackerId);

      expect(ownerPlans).toHaveLength(1);
      expect(ownerPlans[0].id).toBe(ownerPlanId);
      expect(ownerPlans[0].userId).toBe(ownerId);

      expect(attackerPlans).toHaveLength(1);
      expect(attackerPlans[0].id).toBe(attackerPlan.id);
      expect(attackerPlans[0].userId).toBe(attackerId);

      // Verify no cross-contamination
      expect(ownerPlans.some((p) => p.id === attackerPlan.id)).toBe(false);
      expect(attackerPlans.some((p) => p.id === ownerPlanId)).toBe(false);
    });
  });
});
