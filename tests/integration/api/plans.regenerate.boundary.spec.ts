import { seedFailedAttemptsForDurableWindow } from '@tests/fixtures/attempts';
import { createPlan } from '@tests/fixtures/plans';
import { setTestUser } from '@tests/helpers/auth';
import { ensureUser } from '@tests/helpers/db';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { desc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { POST } from '@/app/api/v1/plans/[planId]/regenerate/route';
import { TIER_LIMITS } from '@/features/billing/tier-limits';
import { getCurrentMonth } from '@/features/billing/usage-metrics';
import { clearAllUserRateLimiters } from '@/lib/api/user-rate-limit';
import { jobQueue, usageMetrics } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

const BASE_URL = 'http://localhost/api/v1/plans';

async function createRequest(planId: string, body: unknown) {
	return {
		request: new Request(`${BASE_URL}/${planId}/regenerate`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		}),
		context: { params: Promise.resolve({ planId }) },
	};
}

async function countJobsForPlan(planId: string): Promise<number> {
	const jobs = await db
		.select({ id: jobQueue.id })
		.from(jobQueue)
		.where(eq(jobQueue.planId, planId));
	return jobs.length;
}

describe('POST /api/v1/plans/:id/regenerate real boundary', () => {
	beforeEach(() => {
		clearAllUserRateLimiters();
	});

	it('returns 404 and does not enqueue for a plan owned by another user', async () => {
		const authUserId = buildTestAuthUserId('regen-boundary-owner');
		setTestUser(authUserId);
		await ensureUser({
			authUserId,
			email: buildTestEmail(authUserId),
			subscriptionTier: 'pro',
		});

		const otherAuthUserId = buildTestAuthUserId('regen-boundary-other');
		const otherUserId = await ensureUser({
			authUserId: otherAuthUserId,
			email: buildTestEmail(otherAuthUserId),
			subscriptionTier: 'pro',
		});
		const otherPlan = await createPlan(otherUserId);

		const { request, context } = await createRequest(otherPlan.id, {
			overrides: { topic: 'wrong owner attempt' },
		});

		const response = await POST(request, context);

		expect(response.status).toBe(404);
		const body = await response.json();
		expect(body.error).toBe('Learning plan not found.');
		expect(await countJobsForPlan(otherPlan.id)).toBe(0);
	});

	it('returns 429 and does not enqueue when durable generation window is exhausted', async () => {
		const authUserId = buildTestAuthUserId('regen-boundary-durable');
		setTestUser(authUserId);
		const userId = await ensureUser({
			authUserId,
			email: buildTestEmail(authUserId),
			subscriptionTier: 'pro',
		});
		const plan = await createPlan(userId);
		await seedFailedAttemptsForDurableWindow(plan.id, {
			promptHashPrefix: 'regen-boundary-durable',
		});

		const { request, context } = await createRequest(plan.id, {
			overrides: { topic: 'blocked by durable limit' },
		});

		const response = await POST(request, context);

		expect(response.status).toBe(429);
		expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
		const body = await response.json();
		expect(body.code).toBe('RATE_LIMITED');
		expect(await countJobsForPlan(plan.id)).toBe(0);
	});

	it('returns 429 and does not enqueue when monthly regeneration quota is exhausted', async () => {
		const authUserId = buildTestAuthUserId('regen-boundary-quota');
		setTestUser(authUserId);
		const userId = await ensureUser({
			authUserId,
			email: buildTestEmail(authUserId),
			subscriptionTier: 'free',
		});
		const plan = await createPlan(userId);
		await db
			.insert(usageMetrics)
			.values({
				userId,
				month: getCurrentMonth(),
				plansGenerated: 0,
				regenerationsUsed: TIER_LIMITS.free.monthlyRegenerations,
				exportsUsed: 0,
			})
			.onConflictDoUpdate({
				target: [usageMetrics.userId, usageMetrics.month],
				set: {
					regenerationsUsed: TIER_LIMITS.free.monthlyRegenerations,
				},
			});

		const { request, context } = await createRequest(plan.id, {
			overrides: { topic: 'blocked by monthly quota' },
		});

		const response = await POST(request, context);

		expect(response.status).toBe(429);
		const body = await response.json();
		expect(body.error).toBe(
			'Regeneration quota exceeded for your subscription tier.',
		);
		expect(await countJobsForPlan(plan.id)).toBe(0);
	});

	it('enqueues once and rejects a duplicate active regeneration without a second job', async () => {
		const authUserId = buildTestAuthUserId('regen-boundary-dedupe');
		setTestUser(authUserId);
		const userId = await ensureUser({
			authUserId,
			email: buildTestEmail(authUserId),
			subscriptionTier: 'pro',
		});
		const plan = await createPlan(userId);

		const firstRequest = await createRequest(plan.id, {
			overrides: { topic: 'first queued topic' },
		});
		const first = await POST(firstRequest.request, firstRequest.context);

		expect(first.status).toBe(202);
		expect(await countJobsForPlan(plan.id)).toBe(1);

		const secondRequest = await createRequest(plan.id, {
			overrides: { topic: 'second queued topic' },
		});
		const second = await POST(secondRequest.request, secondRequest.context);
		expect(second.status).toBe(409);
		const secondBody = await second.json();
		expect(secondBody.code).toBe('REGENERATION_ALREADY_QUEUED');

		const jobs = await db
			.select()
			.from(jobQueue)
			.where(eq(jobQueue.planId, plan.id))
			.orderBy(desc(jobQueue.createdAt));

		expect(jobs).toHaveLength(1);
		const [job] = jobs;
		expect(job?.jobType).toBe('plan_regeneration');
		expect(['pending', 'processing']).toContain(job?.status);
	});
});
