import { getGenerationAttemptCap } from '@/features/ai/generation-policy';
import {
  atomicCheckAndInsertPlan,
  findCappedPlanWithoutModules,
  markPlanGenerationFailure,
  markPlanGenerationSuccess,
} from '@/features/plans/lifecycle/plan-persistence-store';
import { generationAttempts, learningPlans } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

const planPayload = {
  topic: 'Adapter integration topic',
  skillLevel: 'beginner' as const,
  weeklyHours: 5,
  learningStyle: 'mixed' as const,
  visibility: 'private' as const,
  origin: 'ai' as const,
};

describe('plan persistence store', () => {
  it('atomicInsertPlan persists a generating plan row', async () => {
    const authUserId = buildTestAuthUserId('persist-adapter-insert');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });

    const result = await atomicCheckAndInsertPlan(
      userId,
      {
        ...planPayload,
        topic: `${planPayload.topic} insert`,
      },
      db,
    );

    expect(result.status).toBe('created');
    if (result.status !== 'created') return;

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

    for (let i = 0; i < 3; i++) {
      const r = await atomicCheckAndInsertPlan(
        userId,
        {
          ...planPayload,
          topic: `${planPayload.topic} cap ${i}`,
        },
        db,
      );
      expect(r.status).toBe('created');
    }

    const rejected = await atomicCheckAndInsertPlan(
      userId,
      {
        ...planPayload,
        topic: `${planPayload.topic} cap overflow`,
      },
      db,
    );

    expect(rejected.status).toBe('limit_reached');
  });

  it('atomicInsertPlan returns the recent plan id for the same topic', async () => {
    const authUserId = buildTestAuthUserId('persist-adapter-dup');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    const topic = `${planPayload.topic} duplicate`;

    const inserted = await atomicCheckAndInsertPlan(
      userId,
      {
        ...planPayload,
        topic,
      },
      db,
    );
    expect(inserted.status).toBe('created');
    if (inserted.status !== 'created') return;

    const duplicate = await atomicCheckAndInsertPlan(
      userId,
      {
        ...planPayload,
        topic,
      },
      db,
    );
    expect(duplicate).toEqual({
      status: 'duplicate',
      existingPlanId: inserted.id,
    });
  });

  it('serializes simultaneous identical plan creation into one row', async () => {
    const authUserId = buildTestAuthUserId('persist-adapter-concurrent-dup');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const topic = `${planPayload.topic} concurrent duplicate`;

    const results = await Promise.all([
      atomicCheckAndInsertPlan(userId, { ...planPayload, topic }, db),
      atomicCheckAndInsertPlan(userId, { ...planPayload, topic }, db),
    ]);

    const created = results.find((result) => result.status === 'created');
    const duplicate = results.find((result) => result.status === 'duplicate');
    expect(created?.status).toBe('created');
    expect(duplicate).toEqual({
      status: 'duplicate',
      existingPlanId: created?.status === 'created' ? created.id : undefined,
    });

    const rows = await db
      .select({ id: learningPlans.id })
      .from(learningPlans)
      .where(eq(learningPlans.userId, userId));
    expect(rows).toHaveLength(1);

    const secondDistinct = await atomicCheckAndInsertPlan(
      userId,
      {
        ...planPayload,
        topic: `${topic} distinct`,
      },
      db,
    );
    expect(secondDistinct.status).toBe('created');
  });

  it('markGenerationSuccess updates persisted flags', async () => {
    const authUserId = buildTestAuthUserId('persist-adapter-status-success');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    const inserted = await atomicCheckAndInsertPlan(
      userId,
      {
        ...planPayload,
        topic: `${planPayload.topic} status-success`,
      },
      db,
    );
    expect(inserted.status).toBe('created');
    if (inserted.status !== 'created') return;

    await markPlanGenerationSuccess(inserted.id, db);

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
    const inserted = await atomicCheckAndInsertPlan(
      userId,
      {
        ...planPayload,
        topic: `${planPayload.topic} status-fail`,
      },
      db,
    );
    expect(inserted.status).toBe('created');
    if (inserted.status !== 'created') return;

    await markPlanGenerationFailure(inserted.id, db);

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
    const cap = getGenerationAttemptCap();

    const inserted = await atomicCheckAndInsertPlan(
      userId,
      {
        ...planPayload,
        topic: `${planPayload.topic} capped`,
      },
      db,
    );
    expect(inserted.status).toBe('created');
    if (inserted.status !== 'created') return;

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

    const cappedId = await findCappedPlanWithoutModules(userId, db);
    expect(cappedId).toBe(inserted.id);
  });
});
