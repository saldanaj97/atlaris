import { createTestModule, createTestTask } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { setTaskProgressBatch } from '@/lib/db/queries/tasks';
import { taskProgress } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

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
});
