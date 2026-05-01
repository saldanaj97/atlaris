import { createTestModule, createTestTask } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { setTaskProgressBatch } from '@/lib/db/queries/tasks';
import { taskProgress } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

const RECENT_TIMESTAMP_THRESHOLD_MS = 10_000;

function expectDate(value: unknown, label: string): asserts value is Date {
  expect(value).toBeInstanceOf(Date);
  if (!(value instanceof Date)) {
    throw new Error(`${label} must be a Date`);
  }
}

function expectRecentTimestamp(value: Date) {
  expect(Math.abs(Date.now() - value.getTime())).toBeLessThanOrEqual(
    RECENT_TIMESTAMP_THRESHOLD_MS,
  );
}

describe('Task Queries', () => {
  it('rejects single-item writes when module scope does not match the task module', async () => {
    const authUserId = buildTestAuthUserId('db-tasks-scope');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const plan = await createTestPlan({ userId, topic: 'task scope guard' });
    const moduleA = await createTestModule({ planId: plan.id, order: 1 });
    const moduleB = await createTestModule({ planId: plan.id, order: 2 });
    const taskB = await createTestTask({ moduleId: moduleB.id, order: 1 });

    await expect(
      setTaskProgressBatch(
        userId,
        [{ taskId: taskB.id, status: 'completed' }],
        db,
        { moduleId: moduleA.id },
      ),
    ).rejects.toThrow('One or more tasks not found.');

    const rows = await db
      .select()
      .from(taskProgress)
      .where(eq(taskProgress.taskId, taskB.id));

    expect(rows).toHaveLength(0);
  });

  it('uses DB-backed timestamps for the no-scope single-update fallback', async () => {
    const authUserId = buildTestAuthUserId('db-tasks-single-time');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const plan = await createTestPlan({ userId, topic: 'single timestamp' });
    const mod = await createTestModule({ planId: plan.id });
    const task = await createTestTask({ moduleId: mod.id });

    const first = await setTaskProgressBatch(
      userId,
      [{ taskId: task.id, status: 'completed' }],
      db,
    );
    const firstProgress = first[0];
    expect(firstProgress).toBeDefined();
    if (!firstProgress) {
      throw new Error('Expected first progress row');
    }
    expectDate(firstProgress.completedAt, 'first completedAt');
    expectDate(firstProgress.updatedAt, 'first updatedAt');
    const firstUpdatedAt = firstProgress.updatedAt.getTime();
    expect(firstUpdatedAt).toBeGreaterThan(0);
    expectRecentTimestamp(firstProgress.completedAt);
    expectRecentTimestamp(firstProgress.updatedAt);

    const second = await setTaskProgressBatch(
      userId,
      [{ taskId: task.id, status: 'in_progress' }],
      db,
    );
    const secondProgress = second[0];
    expect(secondProgress).toBeDefined();
    if (!secondProgress) {
      throw new Error('Expected second progress row');
    }
    expect(secondProgress.completedAt).toBeNull();
    expectDate(secondProgress.updatedAt, 'second updatedAt');
    // DB clock recency is the contract here; strict ms ordering is incidental.
    expectRecentTimestamp(secondProgress.updatedAt);
  });

  it('uses DB-backed timestamps for scoped batch updates', async () => {
    const authUserId = buildTestAuthUserId('db-tasks-batch-time');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const plan = await createTestPlan({ userId, topic: 'batch timestamp' });
    const mod = await createTestModule({ planId: plan.id });
    const completedTask = await createTestTask({ moduleId: mod.id, order: 1 });
    const startedTask = await createTestTask({ moduleId: mod.id, order: 2 });

    const rows = await setTaskProgressBatch(
      userId,
      [
        { taskId: completedTask.id, status: 'completed' },
        { taskId: startedTask.id, status: 'in_progress' },
      ],
      db,
      { planId: plan.id },
    );
    const rowsByTaskId = new Map(rows.map((row) => [row.taskId, row]));
    const completedProgress = rowsByTaskId.get(completedTask.id);
    const startedProgress = rowsByTaskId.get(startedTask.id);

    expect(completedProgress).toBeDefined();
    if (!completedProgress) {
      throw new Error('Expected completed progress row');
    }
    expectDate(completedProgress.completedAt, 'completed completedAt');
    expectDate(completedProgress.updatedAt, 'completed updatedAt');
    expectRecentTimestamp(completedProgress.completedAt);
    expectRecentTimestamp(completedProgress.updatedAt);
    expect(startedProgress).toBeDefined();
    if (!startedProgress) {
      throw new Error('Expected started progress row');
    }
    expect(startedProgress.completedAt).toBeNull();
    expectDate(startedProgress.updatedAt, 'started updatedAt');
    expectRecentTimestamp(startedProgress.updatedAt);
  });
});
