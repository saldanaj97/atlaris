import { expectRlsViolation } from './rls-test-helpers';
import { setTaskProgressBatch } from '@/lib/db/queries/tasks';
import { learningActivityEvents, taskProgress } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestModule, createTestTask } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { truncateAll } from '@tests/helpers/db/truncate';
import { ensureUser } from '@tests/helpers/db/users';
import {
  cleanupTrackedRlsClients,
  createRlsDbForUser,
} from '@tests/helpers/rls';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

async function createActivityFixture(suffix: string) {
  const authUserId = buildTestAuthUserId(`activity-${suffix}`);
  const userId = await ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
  });
  const plan = await createTestPlan({ userId, topic: 'Activity Plan' });
  const module = await createTestModule({ planId: plan.id });
  const task = await createTestTask({ moduleId: module.id });

  return { authUserId, userId, plan, module, task };
}

describe('learning_activity_events RLS and write boundary', () => {
  beforeEach(async () => {
    await cleanupTrackedRlsClients();
    await truncateAll();
  });

  afterEach(async () => {
    await cleanupTrackedRlsClients();
  });

  it('request-auth batch progress writes can record learning activity', async () => {
    const { authUserId, userId, plan, task } =
      await createActivityFixture('batch-write');
    const authDb = await createRlsDbForUser(authUserId);

    const progressRows = await setTaskProgressBatch(
      userId,
      [{ taskId: task.id, status: 'completed' }],
      authDb,
      { planId: plan.id },
    );

    expect(progressRows).toHaveLength(1);
    expect(progressRows[0]?.status).toBe('completed');

    const eventRows = await authDb
      .select()
      .from(learningActivityEvents)
      .where(eq(learningActivityEvents.taskId, task.id));

    expect(eventRows).toHaveLength(1);
    expect(eventRows[0]?.status).toBe('completed');
    expect(eventRows[0]?.taskEstimatedMinutes).toBe(30);
  });

  it('owners can read activity history but cannot directly write it', async () => {
    const { authUserId, userId, plan, module, task } =
      await createActivityFixture('owner-read');
    const otherAuthUserId = buildTestAuthUserId('activity-other');
    await ensureUser({
      authUserId: otherAuthUserId,
      email: buildTestEmail(otherAuthUserId),
    });

    await db.insert(taskProgress).values({
      taskId: task.id,
      userId,
      status: 'completed',
    });

    const ownerDb = await createRlsDbForUser(authUserId);
    const otherDb = await createRlsDbForUser(otherAuthUserId);
    const ownerRows = await ownerDb.select().from(learningActivityEvents);
    const otherRows = await otherDb.select().from(learningActivityEvents);

    expect(ownerRows).toHaveLength(1);
    expect(ownerRows[0]?.status).toBe('completed');
    expect(otherRows).toHaveLength(0);
    const eventId = ownerRows[0]?.id;
    expect(eventId).toBeDefined();
    if (!eventId) throw new Error('Expected learning activity event id');

    await expectRlsViolation(() =>
      ownerDb.insert(learningActivityEvents).values({
        userId,
        planId: plan.id,
        moduleId: module.id,
        taskId: task.id,
        status: 'completed',
        taskEstimatedMinutes: 30,
        occurredAt: new Date(),
      }),
    );
    await expectRlsViolation(() =>
      ownerDb
        .update(learningActivityEvents)
        .set({ status: 'in_progress' })
        .where(eq(learningActivityEvents.id, eventId)),
    );
    await expectRlsViolation(() =>
      ownerDb
        .delete(learningActivityEvents)
        .where(eq(learningActivityEvents.id, eventId)),
    );
  });

  it('uses the database clock for activity history timestamps', async () => {
    const { authUserId, userId, task } =
      await createActivityFixture('forged-clock');
    const authDb = await createRlsDbForUser(authUserId);
    const forgedInsertTime = new Date('2001-01-01T00:00:00.000Z');
    const forgedUpdateTime = new Date('2002-01-01T00:00:00.000Z');

    await authDb.insert(taskProgress).values({
      taskId: task.id,
      userId,
      status: 'completed',
      completedAt: forgedInsertTime,
      updatedAt: forgedInsertTime,
    });
    await authDb
      .update(taskProgress)
      .set({
        status: 'in_progress',
        completedAt: null,
        updatedAt: forgedUpdateTime,
      })
      .where(eq(taskProgress.taskId, task.id));

    const completedEvents = await authDb
      .select()
      .from(learningActivityEvents)
      .where(
        and(
          eq(learningActivityEvents.taskId, task.id),
          eq(learningActivityEvents.status, 'completed'),
        ),
      );
    const inProgressEvents = await authDb
      .select()
      .from(learningActivityEvents)
      .where(
        and(
          eq(learningActivityEvents.taskId, task.id),
          eq(learningActivityEvents.status, 'in_progress'),
        ),
      );

    expect(completedEvents).toHaveLength(1);
    expect(inProgressEvents).toHaveLength(1);
    expect(completedEvents[0]?.occurredAt.getTime()).toBeGreaterThan(
      forgedInsertTime.getTime(),
    );
    expect(inProgressEvents[0]).toMatchObject({
      previousStatus: 'completed',
      status: 'in_progress',
    });
    expect(inProgressEvents[0]?.occurredAt.getTime()).toBeGreaterThan(
      forgedUpdateTime.getTime(),
    );
  });

  it('does not allow browser-authenticated users to delete progress rows', async () => {
    const { authUserId, userId, task } =
      await createActivityFixture('deny-delete');
    await db.insert(taskProgress).values({
      taskId: task.id,
      userId,
      status: 'completed',
    });

    const authDb = await createRlsDbForUser(authUserId);

    await expectRlsViolation(() =>
      authDb.delete(taskProgress).where(eq(taskProgress.taskId, task.id)),
    );

    const rows = await db
      .select()
      .from(taskProgress)
      .where(eq(taskProgress.taskId, task.id));
    expect(rows).toHaveLength(1);
  });
});
