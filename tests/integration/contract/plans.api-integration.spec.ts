import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { GET as GET_STATUS } from '@/app/api/v1/plans/[planId]/status/route';
import { generationAttempts, learningPlans, modules } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';

const BASE_URL = 'http://localhost/api/v1/plans';

async function createStatusRequest(planId: string) {
	return new Request(`${BASE_URL}/${planId}/status`, {
		method: 'GET',
		headers: { 'content-type': 'application/json' },
	});
}

describe('Phase 4: API Integration', () => {
	const authUserId = buildTestAuthUserId('phase4-user');
	const authEmail = buildTestEmail(authUserId);

	describe('T041: Status endpoint state transition test', () => {
		it('maps generationStatus to plan status correctly: generating -> ready', async () => {
			setTestUser(authUserId);
			const userId = await ensureUser({ authUserId, email: authEmail });

			const [plan] = await db
				.insert(learningPlans)
				.values({
					userId,
					topic: 'Status Test Plan',
					skillLevel: 'beginner',
					weeklyHours: 4,
					learningStyle: 'reading',
					visibility: 'private',
					origin: 'ai',
					generationStatus: 'generating',
				})
				.returning();

			let statusRequest = await createStatusRequest(plan.id);
			let statusResponse = await GET_STATUS(statusRequest);
			expect(statusResponse.status).toBe(200);
			let statusPayload = await statusResponse.json();
			expect(statusPayload.status).toBe('processing');
			expect(statusPayload.planId).toBe(plan.id);

			await db
				.update(learningPlans)
				.set({ generationStatus: 'ready' })
				.where(eq(learningPlans.id, plan.id));

			await db.insert(modules).values({
				planId: plan.id,
				order: 1,
				title: 'Module 1',
				description: 'First module',
				estimatedMinutes: 120,
			});

			statusRequest = await createStatusRequest(plan.id);
			statusResponse = await GET_STATUS(statusRequest);
			statusPayload = await statusResponse.json();
			expect(statusPayload.status).toBe('ready');
		});

		it('maps failed job status correctly', async () => {
			setTestUser(authUserId);
			const userId = await ensureUser({ authUserId, email: authEmail });

			const [plan] = await db
				.insert(learningPlans)
				.values({
					userId,
					topic: 'Failed Plan',
					skillLevel: 'beginner',
					weeklyHours: 4,
					learningStyle: 'reading',
					visibility: 'private',
					origin: 'ai',
					generationStatus: 'failed',
				})
				.returning();

			await db.insert(generationAttempts).values({
				planId: plan.id,
				status: 'failure',
				classification: 'timeout',
				durationMs: 5000,
				modulesCount: 0,
				tasksCount: 0,
			});

			const statusRequest = await createStatusRequest(plan.id);
			const statusResponse = await GET_STATUS(statusRequest);
			const statusPayload = await statusResponse.json();
			expect(statusPayload.status).toBe('failed');
			expect(statusPayload.latestError).toBe(
				'Plan generation timed out. Please try again.',
			);
		});
	});
});
