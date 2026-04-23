import { describe, expect, it, vi } from 'vitest';

import type { MeteredReservationToken } from '@/features/billing/metered-reservation';
import { runRegenerationQuotaReserved } from '@/features/billing/regeneration-quota-boundary';
import type { RegenerationOrchestrationDeps } from '@/features/plans/regeneration-orchestration/deps';
import { createDefaultRegenerationOrchestrationDeps } from '@/features/plans/regeneration-orchestration/deps';
import { requestPlanRegeneration } from '@/features/plans/regeneration-orchestration/request';
import type { RegenerationOwnedPlan } from '@/features/plans/regeneration-orchestration/types';
import { RateLimitError } from '@/lib/api/errors';
import type { DbClient } from '@/lib/db/types';

const fakeDb = {} as DbClient;

const ownedPlan: RegenerationOwnedPlan = {
	id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
	userId: 'user-1',
	topic: 'rust',
	skillLevel: 'beginner',
	weeklyHours: 5,
	learningStyle: 'mixed',
	startDate: null,
	deadlineDate: null,
};

const baseToken: MeteredReservationToken = {
	userId: 'user-1',
	month: '2026-04',
	meter: 'regeneration',
	limit: 5,
	newCount: 3,
};

function deferred<T = void>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

type RequestDepsOverrides = {
	[K in keyof RegenerationOrchestrationDeps]?: K extends 'queue'
		? Partial<RegenerationOrchestrationDeps['queue']>
		: RegenerationOrchestrationDeps[K];
};

function buildDeps(
	overrides: RequestDepsOverrides = {},
): RegenerationOrchestrationDeps {
	const tryRegister = vi.fn((getDrainPromise: () => Promise<unknown>) => {
		void getDrainPromise();
		return true;
	});
	const drain = vi.fn(() => Promise.resolve());

	const base: RegenerationOrchestrationDeps = {
		dbClient: fakeDb,
		queue: {
			enabled: vi.fn(() => true),
			enqueueWithResult: vi.fn(async () => ({
				id: 'job-1',
				deduplicated: false,
			})),
			getNextJob: vi.fn(),
			completeJob: vi.fn(),
			failJob: vi.fn(),
		},
		quota: {
			runReserved: vi.fn(async (args) => {
				const workResult = await args.work();
				if (workResult.disposition === 'consumed') {
					return {
						ok: true as const,
						consumed: true as const,
						value: workResult.value,
					};
				}
				return {
					ok: true as const,
					consumed: false as const,
					value: workResult.value,
					reconciliationRequired: false as const,
				};
			}) as RegenerationOrchestrationDeps['quota']['runReserved'],
		},
		plans: {
			getActiveRegenerationJob: vi.fn(async () => null),
			findOwnedPlan: vi.fn(async () => ownedPlan),
		},
		tier: {
			resolveUserTier: vi.fn(async () => 'pro' as const),
		},
		priority: {
			computeJobPriority: vi.fn(() => 7),
			isPriorityTopic: vi.fn(() => false),
		},
		lifecycle: {
			service: {} as RegenerationOrchestrationDeps['lifecycle']['service'],
		},
		retry: {
			shouldRetryJob: vi.fn(),
		},
		inlineDrain: {
			tryRegister,
			drain,
		},
		rateLimit: {
			check: vi.fn(async () => ({
				remaining: 4,
				limit: 10,
				reset: 1_700_000_000,
			})),
		},
		logger: {
			info: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
		},
	};

	return {
		...base,
		dbClient: (overrides.dbClient ??
			base.dbClient) as RegenerationOrchestrationDeps['dbClient'],
		queue: { ...base.queue, ...overrides.queue },
		quota: { ...base.quota, ...overrides.quota },
		plans: { ...base.plans, ...overrides.plans },
		tier: { ...base.tier, ...overrides.tier },
		priority: { ...base.priority, ...overrides.priority },
		lifecycle: { ...base.lifecycle, ...overrides.lifecycle },
		retry: { ...base.retry, ...overrides.retry },
		inlineDrain: { ...base.inlineDrain, ...overrides.inlineDrain },
		rateLimit: { ...base.rateLimit, ...overrides.rateLimit },
		logger: { ...base.logger, ...overrides.logger },
	};
}

describe('requestPlanRegeneration', () => {
	it('uses injected inlineDrain when building default deps', () => {
		const drain = vi.fn(async () => undefined);
		const deps = createDefaultRegenerationOrchestrationDeps(fakeDb, {
			inlineDrain: drain,
		});

		expect(deps.inlineDrain.drain).toBe(drain);
	});

	it('returns queue-disabled when queue is off', async () => {
		const deps = buildDeps({
			queue: { enabled: () => false },
		});
		const result = await requestPlanRegeneration(
			{
				userId: 'user-1',
				planId: ownedPlan.id,
				inlineProcessingEnabled: true,
			},
			deps,
		);
		expect(result).toEqual({ kind: 'queue-disabled' });
		expect(deps.plans.findOwnedPlan).not.toHaveBeenCalled();
	});

	it('returns enqueued with inlineDrainScheduled true when lock acquired', async () => {
		const deps = buildDeps();
		const result = await requestPlanRegeneration(
			{
				userId: 'user-1',
				planId: ownedPlan.id,
				inlineProcessingEnabled: true,
			},
			deps,
		);
		expect(result).toMatchObject({
			kind: 'enqueued',
			jobId: 'job-1',
			inlineDrainScheduled: true,
		});
		expect(deps.inlineDrain.tryRegister).toHaveBeenCalledTimes(1);
	});

	it('logs and continues when inline drain throws synchronously', async () => {
		const drainError = new Error('sync drain boom');
		let registeredPromise: Promise<unknown> | undefined;
		const deps = buildDeps({
			inlineDrain: {
				tryRegister: vi.fn((getDrainPromise: () => Promise<unknown>) => {
					registeredPromise = getDrainPromise();
					return true;
				}),
				drain: vi.fn(() => {
					throw drainError;
				}),
			},
		});

		const result = await requestPlanRegeneration(
			{
				userId: 'user-1',
				planId: ownedPlan.id,
				inlineProcessingEnabled: true,
			},
			deps,
		);

		expect(result).toMatchObject({
			kind: 'enqueued',
			inlineDrainScheduled: true,
		});
		await registeredPromise;
		expect(deps.logger.error).toHaveBeenCalledWith(
			{
				planId: ownedPlan.id,
				userId: 'user-1',
				error: drainError,
				inlineProcessingEnabled: true,
				drainFn: 'drainRegenerationQueue',
			},
			'Inline regeneration queue drain failed',
		);
	});

	it('registers a promise that tracks async inline drain completion', async () => {
		const drain = deferred();
		let registeredPromise: Promise<unknown> | undefined;
		const deps = buildDeps({
			inlineDrain: {
				tryRegister: vi.fn((getDrainPromise: () => Promise<unknown>) => {
					registeredPromise = getDrainPromise();
					return true;
				}),
				drain: vi.fn(() => drain.promise),
			},
		});

		const result = await requestPlanRegeneration(
			{
				userId: 'user-1',
				planId: ownedPlan.id,
				inlineProcessingEnabled: true,
			},
			deps,
		);

		expect(result).toMatchObject({
			kind: 'enqueued',
			inlineDrainScheduled: true,
		});
		expect(registeredPromise).toBeDefined();

		let settled = false;
		void registeredPromise?.then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);

		drain.resolve();
		await registeredPromise;
		expect(settled).toBe(true);
	});

	it('returns enqueued with inlineDrainScheduled false when inlineProcessingEnabled is false', async () => {
		const deps = buildDeps();
		const result = await requestPlanRegeneration(
			{
				userId: 'user-1',
				planId: ownedPlan.id,
				inlineProcessingEnabled: false,
			},
			deps,
		);
		expect(result).toMatchObject({
			kind: 'enqueued',
			inlineDrainScheduled: false,
		});
		expect(deps.inlineDrain.tryRegister).not.toHaveBeenCalled();
	});

	it('returns enqueued with inlineDrainScheduled false when lock not acquired', async () => {
		const drain = vi.fn(() => Promise.resolve());
		const tryRegister = vi.fn(() => false);
		const deps = buildDeps({
			inlineDrain: {
				tryRegister,
				drain,
			},
		});
		const result = await requestPlanRegeneration(
			{
				userId: 'user-1',
				planId: ownedPlan.id,
				inlineProcessingEnabled: true,
			},
			deps,
		);
		expect(result).toMatchObject({
			kind: 'enqueued',
			inlineDrainScheduled: false,
		});
		expect(tryRegister).toHaveBeenCalledTimes(1);
		expect(drain).not.toHaveBeenCalled();
	});

	it('returns active-job-conflict without enqueue or quota', async () => {
		const base = buildDeps();
		const deps = buildDeps({
			plans: {
				...base.plans,
				getActiveRegenerationJob: vi.fn(async () => ({ id: 'existing' })),
			},
		});
		const runReserved = deps.quota.runReserved as ReturnType<typeof vi.fn>;
		const result = await requestPlanRegeneration(
			{
				userId: 'user-1',
				planId: ownedPlan.id,
				inlineProcessingEnabled: false,
			},
			deps,
		);
		expect(result).toEqual({
			kind: 'active-job-conflict',
			existingJobId: 'existing',
		});
		expect(runReserved).not.toHaveBeenCalled();
		expect(deps.queue.enqueueWithResult).not.toHaveBeenCalled();
	});

	it('maps queue dedupe to queue-dedupe-conflict and calls compensate once', async () => {
		const compensate = vi.fn().mockResolvedValue(undefined);
		const reportReconciliation = vi.fn();
		const deps = buildDeps({
			queue: {
				enqueueWithResult: vi.fn(async () => ({
					id: 'dup-job',
					deduplicated: true,
				})),
			},
			quota: {
				runReserved: ((
					args: Parameters<typeof runRegenerationQuotaReserved>[0],
				) =>
					runRegenerationQuotaReserved(args, {
						reserve: vi.fn().mockResolvedValue({
							ok: true,
							token: baseToken,
						}),
						compensate,
						reportReconciliation,
					})) as RegenerationOrchestrationDeps['quota']['runReserved'],
			},
		});

		const result = await requestPlanRegeneration(
			{
				userId: 'user-1',
				planId: ownedPlan.id,
				inlineProcessingEnabled: false,
			},
			deps,
		);

		expect(result).toEqual({
			kind: 'queue-dedupe-conflict',
			existingJobId: 'dup-job',
		});
		expect(compensate).toHaveBeenCalledTimes(1);
		expect(reportReconciliation).not.toHaveBeenCalled();
	});

	it('compensates once when enqueue throws after quota reserve, without reconciliation report', async () => {
		const enqueueError = new Error('enqueue failed');
		const compensate = vi.fn().mockResolvedValue(undefined);
		const reportReconciliation = vi.fn();
		const deps = buildDeps({
			queue: {
				enqueueWithResult: vi.fn().mockRejectedValue(enqueueError),
			},
			quota: {
				runReserved: ((
					args: Parameters<typeof runRegenerationQuotaReserved>[0],
				) =>
					runRegenerationQuotaReserved(args, {
						reserve: vi.fn().mockResolvedValue({
							ok: true,
							token: baseToken,
						}),
						compensate,
						reportReconciliation,
					})) as RegenerationOrchestrationDeps['quota']['runReserved'],
			},
		});

		await expect(
			requestPlanRegeneration(
				{
					userId: 'user-1',
					planId: ownedPlan.id,
					inlineProcessingEnabled: false,
				},
				deps,
			),
		).rejects.toBe(enqueueError);

		expect(compensate).toHaveBeenCalledTimes(1);
		expect(compensate).toHaveBeenCalledWith(baseToken, fakeDb);
		expect(reportReconciliation).not.toHaveBeenCalled();
	});

	it('returns quota-denied when reservation fails', async () => {
		const deps = buildDeps({
			quota: {
				runReserved: vi.fn().mockResolvedValue({
					ok: false as const,
					currentCount: 5,
					limit: 5,
				}),
			},
		});
		const result = await requestPlanRegeneration(
			{
				userId: 'user-1',
				planId: ownedPlan.id,
				inlineProcessingEnabled: false,
			},
			deps,
		);
		expect(result).toEqual({
			kind: 'quota-denied',
			currentCount: 5,
			limit: 5,
			reason: 'Regeneration quota exceeded for your subscription tier.',
		});
	});

	it('returns plan-not-found when findOwnedPlan returns null', async () => {
		const base = buildDeps();
		const deps = buildDeps({
			plans: {
				...base.plans,
				findOwnedPlan: vi.fn(async () => null),
			},
		});
		const result = await requestPlanRegeneration(
			{
				userId: 'user-1',
				planId: ownedPlan.id,
				inlineProcessingEnabled: false,
			},
			deps,
		);
		expect(result).toEqual({ kind: 'plan-not-found' });
	});

	it('propagates RateLimitError from rate limit check', async () => {
		const deps = buildDeps({
			rateLimit: {
				check: vi.fn().mockRejectedValue(
					new RateLimitError('blocked', {
						retryAfter: 60,
						remaining: 0,
						limit: 3,
						reset: 1,
					}),
				),
			},
		});
		await expect(
			requestPlanRegeneration(
				{
					userId: 'user-1',
					planId: ownedPlan.id,
					inlineProcessingEnabled: false,
				},
				deps,
			),
		).rejects.toSatisfy(
			(err: unknown) => err instanceof RateLimitError && err.status() === 429,
		);
	});

	it('registers guarded drain promise that absorbs rejection', async () => {
		let registeredPromise: Promise<unknown> | undefined;
		const deps = buildDeps({
			inlineDrain: {
				tryRegister: (fn: () => Promise<unknown>) => {
					registeredPromise = fn();
					return true;
				},
				drain: () => Promise.reject(new Error('drain boom')),
			},
		});
		const result = await requestPlanRegeneration(
			{
				userId: 'user-1',
				planId: ownedPlan.id,
				inlineProcessingEnabled: true,
			},
			deps,
		);
		expect(result.kind).toBe('enqueued');
		await registeredPromise;
		expect(deps.logger.error).toHaveBeenCalled();
	});
});
