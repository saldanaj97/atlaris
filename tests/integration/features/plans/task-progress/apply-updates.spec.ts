import { createTestModule, createTestTask } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { applyTaskProgressUpdates } from '@/features/plans/task-progress';
import { taskProgress } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

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
		});
		expect(first.progress[0]?.completedAt).toBeInstanceOf(Date);

		const second = await applyTaskProgressUpdates({
			userId,
			planId: plan.id,
			updates: [{ taskId: task.id, status: 'in_progress' }],
			dbClient: db,
		});
		expect(second.progress[0]?.completedAt).toBeNull();
	});
});
