import { setTaskProgressBatch } from '@/lib/db/queries/tasks';
import { taskProgress } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestModule, createTestTask } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

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
  it('returns an empty result without touching the database for empty batches', async () => {
    const authUserId = buildTestAuthUserId('db-tasks-empty');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });

    await expect(setTaskProgressBatch(userId, [], db)).resolves.toEqual([]);
  });

  it('rejects duplicate task ids before writing', async () => {
    const authUserId = buildTestAuthUserId('db-tasks-dup');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const plan = await createTestPlan({ userId, topic: 'duplicate guard' });
    const mod = await createTestModule({ planId: plan.id });
    const task = await createTestTask({ moduleId: mod.id });

    await expect(
      setTaskProgressBatch(
        userId,
        [
          { taskId: task.id, status: 'in_progress' },
          { taskId: task.id, status: 'completed' },
        ],
        db,
        { planId: plan.id },
      ),
    ).rejects.toThrow(`Duplicate taskIds in updates: ${task.id}`);

    const rows = await db
      .select()
      .from(taskProgress)
      .where(eq(taskProgress.taskId, task.id));

    expect(rows).toHaveLength(0);
  });

  it('persists multiple task updates in one unscoped batch', async () => {
    const authUserId = buildTestAuthUserId('db-tasks-multi');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const plan = await createTestPlan({ userId, topic: 'multi batch' });
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
    );

    expect(rows).toHaveLength(2);
    const rowsByTaskId = new Map(rows.map((row) => [row.taskId, row]));
    expect(rowsByTaskId.get(completedTask.id)?.status).toBe('completed');
    expect(rowsByTaskId.get(startedTask.id)?.status).toBe('in_progress');

    const persisted = await db
      .select()
      .from(taskProgress)
      .where(eq(taskProgress.userId, userId));

    expect(persisted).toHaveLength(2);
  });

  it('rejects batches when plan scope does not match task ownership', async () => {
    const authUserId = buildTestAuthUserId('db-tasks-plan-scope');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const planA = await createTestPlan({ userId, topic: 'plan scope A' });
    const planB = await createTestPlan({ userId, topic: 'plan scope B' });
    const modB = await createTestModule({ planId: planB.id });
    const taskB = await createTestTask({ moduleId: modB.id });

    await expect(
      setTaskProgressBatch(
        userId,
        [{ taskId: taskB.id, status: 'completed' }],
        db,
        { planId: planA.id },
      ),
    ).rejects.toThrow('One or more tasks not found.');

    const rows = await db
      .select()
      .from(taskProgress)
      .where(eq(taskProgress.taskId, taskB.id));

    expect(rows).toHaveLength(0);
  });

  it('rejects batches for tasks owned by another user', async () => {
    const ownerAuthUserId = buildTestAuthUserId('db-tasks-owner');
    const ownerId = await ensureUser({
      authUserId: ownerAuthUserId,
      email: buildTestEmail(ownerAuthUserId),
    });
    const otherAuthUserId = buildTestAuthUserId('db-tasks-other');
    const otherUserId = await ensureUser({
      authUserId: otherAuthUserId,
      email: buildTestEmail(otherAuthUserId),
    });
    const plan = await createTestPlan({ userId: ownerId, topic: 'owner plan' });
    const mod = await createTestModule({ planId: plan.id });
    const task = await createTestTask({ moduleId: mod.id });

    await expect(
      setTaskProgressBatch(
        otherUserId,
        [{ taskId: task.id, status: 'completed' }],
        db,
      ),
    ).rejects.toThrow('Task not found or access denied');

    const rows = await db
      .select()
      .from(taskProgress)
      .where(eq(taskProgress.taskId, task.id));

    expect(rows).toHaveLength(0);
  });

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
