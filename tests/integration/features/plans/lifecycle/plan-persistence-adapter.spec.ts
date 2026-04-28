import { ensureUser } from '@tests/helpers/db';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getAttemptCap } from '@/features/ai/generation-policy';
import { PlanPersistenceAdapter } from '@/features/plans/lifecycle/adapters/plan-persistence-adapter';
import { generationAttempts, learningPlans } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

const planPayload = {
  topic: 'Adapter integration topic',
  skillLevel: 'beginner' as const,
  weeklyHours: 5,
  learningStyle: 'mixed' as const,
  visibility: 'private' as const,
  origin: 'ai' as const,
};

describe('PlanPersistenceAdapter (integration)', () => {
  it('atomicInsertPlan persists a generating plan row', async () => {
    const authUserId = buildTestAuthUserId('persist-adapter-insert');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const adapter = new PlanPersistenceAdapter(db);

    const result = await adapter.atomicInsertPlan(userId, {
      ...planPayload,
      topic: `${planPayload.topic} insert`,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const [row] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, result.id));

    expect(row?.generationStatus).toBe('generating');
    expect(row?.isQuotaEligible).toBe(false);
    expect(row?.finalizedAt).toBeNull();
  });

  it('atomicInsertPlan rejects when active plan cap is reached', async () => {
    const authUserId = buildTestAuthUserId('persist-adapter-cap');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const adapter = new PlanPersistenceAdapter(db);

    for (let i = 0; i < 3; i++) {
      const r = await adapter.atomicInsertPlan(userId, {
        ...planPayload,
        topic: `${planPayload.topic} cap ${i}`,
      });
      expect(r.success).toBe(true);
    }

    const rejected = await adapter.atomicInsertPlan(userId, {
      ...planPayload,
      topic: `${planPayload.topic} cap overflow`,
    });

    expect(rejected.success).toBe(false);
    if (rejected.success) return;
    expect(rejected.reason).toMatch(/limit reached/i);
  });

  it('findRecentDuplicatePlan returns the recent plan id for the same topic', async () => {
    const authUserId = buildTestAuthUserId('persist-adapter-dup');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    const adapter = new PlanPersistenceAdapter(db);
    const topic = `${planPayload.topic} duplicate`;

    const inserted = await adapter.atomicInsertPlan(userId, {
      ...planPayload,
      topic,
    });
    expect(inserted.success).toBe(true);
    if (!inserted.success) return;

    const dupId = await adapter.findRecentDuplicatePlan(userId, topic);
    expect(dupId).toBe(inserted.id);
  });

  it('markGenerationSuccess updates persisted flags', async () => {
    const authUserId = buildTestAuthUserId('persist-adapter-status-success');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    const adapter = new PlanPersistenceAdapter(db);

    const inserted = await adapter.atomicInsertPlan(userId, {
      ...planPayload,
      topic: `${planPayload.topic} status-success`,
    });
    expect(inserted.success).toBe(true);
    if (!inserted.success) return;

    await adapter.markGenerationSuccess(inserted.id);

    const [readyRow] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, inserted.id));
    expect(readyRow?.generationStatus).toBe('ready');
    expect(readyRow?.isQuotaEligible).toBe(true);
    expect(readyRow?.finalizedAt).toBeInstanceOf(Date);
  });

  it('markGenerationFailure updates persisted flags', async () => {
    const authUserId = buildTestAuthUserId('persist-adapter-status-fail');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    const adapter = new PlanPersistenceAdapter(db);

    const inserted = await adapter.atomicInsertPlan(userId, {
      ...planPayload,
      topic: `${planPayload.topic} status-fail`,
    });
    expect(inserted.success).toBe(true);
    if (!inserted.success) return;

    await adapter.markGenerationFailure(inserted.id);

    const [failedRow] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, inserted.id));
    expect(failedRow?.generationStatus).toBe('failed');
    expect(failedRow?.isQuotaEligible).toBe(false);
  });

  it('findCappedPlanWithoutModules returns plan id when attempt cap hit and no modules', async () => {
    const authUserId = buildTestAuthUserId('persist-adapter-capped');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    const adapter = new PlanPersistenceAdapter(db);
    const cap = getAttemptCap();

    const inserted = await adapter.atomicInsertPlan(userId, {
      ...planPayload,
      topic: `${planPayload.topic} capped`,
    });
    expect(inserted.success).toBe(true);
    if (!inserted.success) return;

    for (let i = 0; i < cap; i++) {
      await db.insert(generationAttempts).values({
        planId: inserted.id,
        status: 'failure',
        classification: 'provider_error',
        durationMs: 1,
        modulesCount: 0,
        tasksCount: 0,
      });
    }

    const cappedId = await adapter.findCappedPlanWithoutModules(userId);
    expect(cappedId).toBe(inserted.id);
  });
});
