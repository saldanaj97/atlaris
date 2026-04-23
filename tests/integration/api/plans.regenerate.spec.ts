import { setTestUser } from '@tests/helpers/auth';
import { ensureUser } from '@tests/helpers/db';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/v1/plans/[planId]/regenerate/route';
import { requestPlanRegeneration } from '@/features/plans/regeneration-orchestration';
import { RateLimitError } from '@/lib/api/errors';
import { clearAllUserRateLimiters } from '@/lib/api/user-rate-limit';

vi.mock(
	'@/features/plans/regeneration-orchestration',
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import('@/features/plans/regeneration-orchestration')
			>();
		return {
			...actual,
			requestPlanRegeneration: vi.fn(),
		};
	},
);

const mockRequestPlanRegeneration = vi.mocked(requestPlanRegeneration);

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

describe('POST /api/v1/plans/:id/regenerate', () => {
	const authUserId = buildTestAuthUserId('api-regen-user');
	const authEmail = buildTestEmail(authUserId);

	beforeEach(async () => {
		clearAllUserRateLimiters();
		mockRequestPlanRegeneration.mockReset();
	});

	it('maps enqueued boundary result to 202 with rate limit headers', async () => {
		setTestUser(authUserId);
		const userId = await ensureUser({
			authUserId,
			email: authEmail,
			subscriptionTier: 'pro',
		});

		const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
		mockRequestPlanRegeneration.mockResolvedValue({
			kind: 'enqueued',
			jobId: 'job-1',
			planId,
			status: 'pending',
			inlineDrainScheduled: false,
			planGenerationRateLimit: {
				remaining: 9,
				limit: 10,
				reset: 1_700_000_000,
			},
		});

		const { request, context } = await createRequest(planId, {
			overrides: { topic: 'interview prep' },
		});

		const res = await POST(request, context);
		expect(res.status).toBe(202);
		expect(res.headers.get('X-RateLimit-Remaining')).toEqual(
			expect.any(String),
		);

		const body = await res.json();
		expect(body.status).toBe('pending');
		expect(body.planId).toBe(planId);
		expect(body.jobId).toBe('job-1');
		expect(mockRequestPlanRegeneration).toHaveBeenCalledWith(
			expect.objectContaining({
				userId,
				planId,
				overrides: { topic: 'interview prep' },
				inlineProcessingEnabled: expect.any(Boolean),
			}),
		);
	});

	it('maps plan-not-found to 404', async () => {
		setTestUser(authUserId);
		await ensureUser({
			authUserId,
			email: authEmail,
		});

		const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
		mockRequestPlanRegeneration.mockResolvedValue({ kind: 'plan-not-found' });

		const { request, context } = await createRequest(planId, {
			overrides: { topic: 'interview prep' },
		});

		const res = await POST(request, context);
		expect(res.status).toBe(404);

		const body = await res.json();
		expect(body.error).toBe('Learning plan not found.');
	});

	it('maps queue-disabled to 503', async () => {
		setTestUser(authUserId);
		await ensureUser({
			authUserId,
			email: authEmail,
		});

		const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
		mockRequestPlanRegeneration.mockResolvedValue({ kind: 'queue-disabled' });

		const { request, context } = await createRequest(planId, {
			overrides: { topic: 'interview prep' },
		});

		const res = await POST(request, context);
		expect(res.status).toBe(503);
		const body = await res.json();
		expect(body.error).toBe(
			'Plan regeneration is temporarily disabled while queue workers are unavailable.',
		);
	});

	it('maps active-job-conflict to 409 with job id', async () => {
		setTestUser(authUserId);
		await ensureUser({
			authUserId,
			email: authEmail,
		});

		const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
		mockRequestPlanRegeneration.mockResolvedValue({
			kind: 'active-job-conflict',
			existingJobId: 'existing-job',
		});

		const { request, context } = await createRequest(planId, {
			overrides: { topic: 'interview prep' },
		});

		const res = await POST(request, context);
		expect(res.status).toBe(409);
		const body = await res.json();
		expect(body.code).toBe('REGENERATION_ALREADY_QUEUED');
		expect(body.details?.jobId).toBe('existing-job');
	});

	it('maps queue-dedupe-conflict with reconciliation flag', async () => {
		setTestUser(authUserId);
		await ensureUser({
			authUserId,
			email: authEmail,
		});

		const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
		mockRequestPlanRegeneration.mockResolvedValue({
			kind: 'queue-dedupe-conflict',
			existingJobId: 'dup',
			reconciliationRequired: true,
		});

		const { request, context } = await createRequest(planId, {
			overrides: { topic: 'interview prep' },
		});

		const res = await POST(request, context);
		expect(res.status).toBe(409);
		const body = await res.json();
		expect(body.details?.reconciliationRequired).toBe(true);
		expect(body.details?.jobId).toBe('dup');
	});

	it('maps quota-denied to 429', async () => {
		setTestUser(authUserId);
		await ensureUser({
			authUserId,
			email: authEmail,
		});

		const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
		mockRequestPlanRegeneration.mockResolvedValue({
			kind: 'quota-denied',
			currentCount: 5,
			limit: 5,
			reason: 'Regeneration quota exceeded for your subscription tier.',
		});

		const { request, context } = await createRequest(planId, {
			overrides: { topic: 'interview prep' },
		});

		const res = await POST(request, context);
		expect(res.status).toBe(429);

		const body = await res.json();
		// Matches RateLimitError message in route for `quota-denied` (requestPlanRegeneration).
		expect(body.error).toBe(
			'Regeneration quota exceeded for your subscription tier.',
		);
	});

	it('propagates RateLimitError from boundary as 429', async () => {
		setTestUser(authUserId);
		await ensureUser({
			authUserId,
			email: authEmail,
		});

		const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
		mockRequestPlanRegeneration.mockRejectedValue(
			new RateLimitError(
				`Rate limit exceeded. Maximum 5 plan generation requests allowed per 60 minutes.`,
				{
					retryAfter: 120,
					remaining: 0,
					limit: 5,
					reset: 1_700_000_000,
				},
			),
		);

		const { request, context } = await createRequest(planId, {
			overrides: { topic: 'blocked by durable limit' },
		});

		const response = await POST(request, context);
		expect(response.status).toBe(429);
		expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');

		const body = await response.json();
		expect(body.code).toBe('RATE_LIMITED');
		expect(typeof body.retryAfter).toBe('number');
	});

	it('returns 400 with invalid JSON message when body is not JSON', async () => {
		setTestUser(authUserId);
		await ensureUser({
			authUserId,
			email: authEmail,
			subscriptionTier: 'pro',
		});

		const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

		const request = new Request(`${BASE_URL}/${planId}/regenerate`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{ not json',
		});
		const context = { params: Promise.resolve({ planId }) };

		const res = await POST(request, context);
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toBe('Invalid JSON in request body.');
		expect(mockRequestPlanRegeneration).not.toHaveBeenCalled();
	});

	describe('invalid overrides schema', () => {
		it('rejects topic that is too short', async () => {
			setTestUser(authUserId);
			await ensureUser({
				authUserId,
				email: authEmail,
			});

			const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

			const { request, context } = await createRequest(planId, {
				overrides: { topic: 'ab' },
			});

			const res = await POST(request, context);
			expect(res.status).toBe(400);

			const body = await res.json();
			expect(body.error).toBe('Invalid overrides.');
			expect(mockRequestPlanRegeneration).not.toHaveBeenCalled();
		});

		it('rejects invalid weeklyHours', async () => {
			setTestUser(authUserId);
			await ensureUser({
				authUserId,
				email: authEmail,
			});

			const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

			const { request, context } = await createRequest(planId, {
				overrides: { weeklyHours: -5 },
			});

			const res = await POST(request, context);
			expect(res.status).toBe(400);

			const body = await res.json();
			expect(body.error).toBe('Invalid overrides.');
		});

		it('rejects invalid skillLevel', async () => {
			setTestUser(authUserId);
			await ensureUser({
				authUserId,
				email: authEmail,
			});

			const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

			const { request, context } = await createRequest(planId, {
				overrides: { skillLevel: 'expert' },
			});

			const res = await POST(request, context);
			expect(res.status).toBe(400);

			const body = await res.json();
			expect(body.error).toBe('Invalid overrides.');
		});

		it('rejects extra fields in overrides', async () => {
			setTestUser(authUserId);
			await ensureUser({
				authUserId,
				email: authEmail,
			});

			const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

			const { request, context } = await createRequest(planId, {
				overrides: { topic: 'new topic', extraField: 'not allowed' },
			});

			const res = await POST(request, context);
			expect(res.status).toBe(400);

			const body = await res.json();
			expect(body.error).toBe('Invalid overrides.');
		});
	});
});
