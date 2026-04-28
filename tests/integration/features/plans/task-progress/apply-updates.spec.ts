import { createTestModule, createTestTask } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { applyTaskProgressUpdates } from '@/features/plans/task-progress';
import { taskProgress } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

function expectDate(value: unknown, label: string): asserts value is Date {
  expect(value).toBeInstanceOf(Date);
  if (!(value instanceof Date)) {
    throw new Error(`${label} must be a Date`);
  }
}

describe('applyTaskProgressUpdates (integration)', () => {
  it('returns empty result without writes when updates array is empty', async () => {
    const authUserId = buildTestAuthUserId('tp-empty');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const plan = await createTestPlan({ userId, topic: 'empty batch plan' });
    const mod = await createTestModule({ planId: plan.id });
    const task = await createTestTask({ moduleId: mod.id });

    const result = await applyTaskProgressUpdates({
      userId,
      planId: plan.id,
      updates: [],
      dbClient: db,
    });

    expect(result.revalidatePaths).toEqual([]);
    expect(result.progress).toHaveLength(0);
    expect(result.visibleState.appliedByTaskId).toEqual({});

    const rows = await db
      .select()
      .from(taskProgress)
      .where(
        and(eq(taskProgress.userId, userId), eq(taskProgress.taskId, task.id)),
      );
    expect(rows).toHaveLength(0);
  });

  it('rejects task ids from another plan before persistence', async () => {
    const authUserId = buildTestAuthUserId('tp-cross-plan');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const planA = await createTestPlan({ userId, topic: 'plan A' });
    const planB = await createTestPlan({ userId, topic: 'plan B' });
    const modA = await createTestModule({ planId: planA.id });
    const modB = await createTestModule({ planId: planB.id });
    const taskA = await createTestTask({ moduleId: modA.id, order: 1 });
    const taskB = await createTestTask({ moduleId: modB.id, order: 1 });

    await expect(
      applyTaskProgressUpdates({
        userId,
        planId: planA.id,
        updates: [{ taskId: taskB.id, status: 'completed' }],
        dbClient: db,
      }),
    ).rejects.toThrow('One or more tasks not found.');

    const rowsB = await db
      .select()
      .from(taskProgress)
      .where(eq(taskProgress.taskId, taskB.id));
    expect(rowsB).toHaveLength(0);

    const ok = await applyTaskProgressUpdates({
      userId,
      planId: planA.id,
      updates: [{ taskId: taskA.id, status: 'completed' }],
      dbClient: db,
    });
    expect(ok.revalidatePaths).toEqual([`/plans/${planA.id}`, '/plans']);
    expect(ok.visibleState.appliedByTaskId[taskA.id]).toBe('completed');
  });

  it('rejects module-scoped batch when task is in another module', async () => {
    const authUserId = buildTestAuthUserId('tp-cross-mod');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const plan = await createTestPlan({ userId, topic: 'two modules' });
    const mod1 = await createTestModule({ planId: plan.id, order: 1 });
    const mod2 = await createTestModule({ planId: plan.id, order: 2 });
    await createTestTask({ moduleId: mod1.id, order: 1 });
    const t2 = await createTestTask({ moduleId: mod2.id, order: 1 });

    await expect(
      applyTaskProgressUpdates({
        userId,
        planId: plan.id,
        moduleId: mod1.id,
        updates: [{ taskId: t2.id, status: 'completed' }],
        dbClient: db,
      }),
    ).rejects.toThrow('One or more tasks not found.');

    const out = await applyTaskProgressUpdates({
      userId,
      planId: plan.id,
      moduleId: mod2.id,
      updates: [{ taskId: t2.id, status: 'completed' }],
      dbClient: db,
    });
    expect(out.revalidatePaths).toEqual([
      `/plans/${plan.id}/modules/${mod2.id}`,
      `/plans/${plan.id}`,
      '/plans',
    ]);
  });

  it('sets completedAt for completed and clears it when moving away from completed', async () => {
    const authUserId = buildTestAuthUserId('tp-completed-at');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const plan = await createTestPlan({ userId, topic: 'completed-at' });
    const mod = await createTestModule({ planId: plan.id });
    const task = await createTestTask({ moduleId: mod.id });

    const first = await applyTaskProgressUpdates({
      userId,
      planId: plan.id,
      updates: [{ taskId: task.id, status: 'completed' }],
      dbClient: db,
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    const firstProgress = first.progress[0];
    expect(firstProgress).toBeDefined();
    if (!firstProgress) {
      throw new Error('Expected first progress row');
    }
    expectDate(firstProgress.completedAt, 'first completedAt');
    expectDate(firstProgress.updatedAt, 'first updatedAt');
    const firstUpdatedAt = firstProgress.updatedAt.getTime();
    expect(firstUpdatedAt).toBeGreaterThan(0);

    const second = await applyTaskProgressUpdates({
      userId,
      planId: plan.id,
      updates: [{ taskId: task.id, status: 'in_progress' }],
      dbClient: db,
      // Deterministic clock avoids wall-clock sleeps for update ordering.
      now: new Date('2026-01-01T00:00:01.000Z'),
    });
    const secondProgress = second.progress[0];
    expect(secondProgress).toBeDefined();
    if (!secondProgress) {
      throw new Error('Expected second progress row');
    }
    expect(secondProgress.completedAt).toBeNull();
    expectDate(secondProgress.updatedAt, 'second updatedAt');
    expect(secondProgress.updatedAt.getTime()).toBeGreaterThan(firstUpdatedAt);
  });
});
