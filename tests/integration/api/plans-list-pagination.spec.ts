import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/v1/plans/route';
import { learningPlans, taskProgress } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { createTestModule, createTestTask } from '../../fixtures/modules';
import { buildTestPlanInsert } from '../../fixtures/plans';
import { clearTestUser, setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';

// Keep this auth-server mock local. Removing it cleanly would require routing
// requestBoundary.route -> withAuth through injectable auth/session providers in
// the middleware stack and every route-handler construction site.
vi.mock('@/lib/auth/server', () => ({
	auth: { getSession: vi.fn() },
}));

describe('GET /api/v1/plans pagination', () => {
	const authUserId = 'auth_plans_list_test_user';
	let userId = '';

	beforeEach(async () => {
		const { auth } = await import('@/lib/auth/server');
		vi.mocked(auth.getSession).mockResolvedValue({
			data: { user: { id: authUserId } },
		});

		setTestUser(authUserId);
		userId = await ensureUser({
			authUserId,
			email: 'plans-list@example.com',
			subscriptionTier: 'pro',
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearTestUser();
	});

	it('returns the default page size, total count header, and lightweight summaries', async () => {
		const planRows = Array.from({ length: 25 }, (_, index) =>
			buildTestPlanInsert(userId, {
				topic: `Plan ${index}`,
				skillLevel: 'beginner',
				weeklyHours: 5,
				learningStyle: 'mixed',
				visibility: 'private',
				origin: 'ai',
				generationStatus: 'ready',
				isQuotaEligible: true,
				createdAt: new Date(
					`2026-01-01T00:${String(index).padStart(2, '0')}:00Z`,
				),
				updatedAt: new Date(
					`2026-01-01T01:${String(index).padStart(2, '0')}:00Z`,
				),
			}),
		);

		const insertedPlans = await db
			.insert(learningPlans)
			.values(planRows)
			.returning();
		const latestPlan = insertedPlans.find((plan) => plan.topic === 'Plan 24');

		if (!latestPlan) {
			throw new Error('Failed to create latest plan fixture');
		}

		const module = await createTestModule({
			planId: latestPlan.id,
			title: 'Latest module',
			estimatedMinutes: 90,
		});
		const completedTask = await createTestTask({
			moduleId: module.id,
			order: 1,
			title: 'Completed task',
			estimatedMinutes: 30,
		});
		await createTestTask({
			moduleId: module.id,
			order: 2,
			title: 'Pending task',
			estimatedMinutes: 60,
		});

		await db.insert(taskProgress).values({
			taskId: completedTask.id,
			userId,
			status: 'completed',
			completedAt: new Date('2026-01-01T03:00:00.000Z'),
		});

		const response = await GET(
			new NextRequest('http://localhost:3000/api/v1/plans', { method: 'GET' }),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get('X-Total-Count')).toBe('25');

		const body = await response.json();
		expect(body).toHaveLength(20);
		expect(body[0]).toMatchObject({
			id: latestPlan.id,
			topic: 'Plan 24',
			totalTasks: 2,
			completedTasks: 1,
			totalMinutes: 90,
			completedMinutes: 30,
			moduleCount: 1,
			completedModules: 0,
			completion: 0.5,
		});
		expect(body[0]).not.toHaveProperty('plan');
		expect(body[0]).not.toHaveProperty('modules');
		expect(body[0]).not.toHaveProperty('extractedContext');
	});

	it('supports custom limit and offset and clamps oversized limits', async () => {
		const planRows = Array.from({ length: 105 }, (_, index) =>
			buildTestPlanInsert(userId, {
				topic: `Paged Plan ${index}`,
				skillLevel: 'intermediate',
				weeklyHours: 4,
				learningStyle: 'reading',
				visibility: 'private',
				origin: 'ai',
				generationStatus: 'ready',
				isQuotaEligible: true,
				createdAt: new Date(Date.UTC(2026, 1, 1, 0, 0, index)),
				updatedAt: new Date(Date.UTC(2026, 1, 1, 1, 0, index)),
			}),
		);

		await db.insert(learningPlans).values(planRows);

		const pagedResponse = await GET(
			new NextRequest('http://localhost:3000/api/v1/plans?limit=5&offset=10', {
				method: 'GET',
			}),
		);
		expect(pagedResponse.status).toBe(200);
		const pagedBody = await pagedResponse.json();
		expect(pagedBody).toHaveLength(5);
		expect(
			pagedBody.map((plan: { createdAt: string }) =>
				Date.parse(plan.createdAt),
			),
		).toEqual(
			[...pagedBody]
				.map((plan: { createdAt: string }) => Date.parse(plan.createdAt))
				.sort((left, right) => right - left),
		);
		expect(pagedBody[0].topic).toBe('Paged Plan 94');

		const oversizedResponse = await GET(
			new NextRequest('http://localhost:3000/api/v1/plans?limit=200', {
				method: 'GET',
			}),
		);
		expect(oversizedResponse.status).toBe(200);
		const oversizedBody = await oversizedResponse.json();
		expect(oversizedBody).toHaveLength(100);
	});

	it('rejects invalid pagination values', async () => {
		const invalidLimitResponse = await GET(
			new NextRequest('http://localhost:3000/api/v1/plans?limit=0', {
				method: 'GET',
			}),
		);
		expect(invalidLimitResponse.status).toBe(400);

		const invalidOffsetResponse = await GET(
			new NextRequest('http://localhost:3000/api/v1/plans?offset=-1', {
				method: 'GET',
			}),
		);
		expect(invalidOffsetResponse.status).toBe(400);
	});
});
