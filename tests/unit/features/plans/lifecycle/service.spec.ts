import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanLifecycleServicePorts } from '@/features/plans/lifecycle/service';
import { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { CreateAiPlanInput } from '@/features/plans/lifecycle/types';

import { makeCanonicalUsage } from '../../../../fixtures/canonical-usage.factory';

// ─── Helpers ─────────────────────────────────────────────────────

function createMockPorts(
	overrides?: Partial<PlanLifecycleServicePorts>,
): PlanLifecycleServicePorts {
	return {
		planPersistence: {
			atomicInsertPlan: async () => ({
				success: true as const,
				id: 'plan-123',
			}),
			findCappedPlanWithoutModules: async () => null,
			findRecentDuplicatePlan: async () => null,
			markGenerationSuccess: async () => {},
			markGenerationFailure: async () => {},
		},
		quota: {
			resolveUserTier: async () => 'free' as const,
			checkDurationCap: () => ({ allowed: true }),
			normalizePlanDuration: () => ({
				startDate: '2025-01-01',
				deadlineDate: '2025-01-15',
				totalWeeks: 2,
			}),
		},
		generation: {
			runGeneration: async () => ({
				status: 'success' as const,
				modules: [],
				metadata: {},
				usage: {
					inputTokens: 0,
					outputTokens: 0,
					totalTokens: 0,
					model: 'openai/gpt-4o',
					provider: 'openrouter',
					estimatedCostCents: 0,
					providerCostMicrousd: null,
					isPartial: false,
					missingFields: [],
				},
				durationMs: 1000,
			}),
		},
		usageRecording: {
			recordUsage: async () => {},
		},
		jobQueue: {
			enqueueJob: async () => 'job-123',
			completeJob: async () => {},
			failJob: async () => {},
		},
		...overrides,
	};
}

const validInput: CreateAiPlanInput = {
	userId: 'user-abc',
	topic: 'Learn TypeScript',
	skillLevel: 'beginner',
	weeklyHours: 5,
	learningStyle: 'mixed',
};

// ─── Tests ───────────────────────────────────────────────────────

describe('PlanLifecycleService', () => {
	let service: PlanLifecycleService;
	let ports: PlanLifecycleServicePorts;

	beforeEach(() => {
		ports = createMockPorts();
		service = new PlanLifecycleService(ports);
	});

	describe('createPlan', () => {
		it('succeeds for valid AI-origin input and returns plan ID', async () => {
			const result = await service.createPlan(validInput);

			expect(result.status).toBe('success');
			if (result.status === 'success') {
				expect(result.planId).toBe('plan-123');
				expect(result.tier).toBe('free');
			}
		});

		it('rejects when plan cap is reached', async () => {
			ports = createMockPorts({
				planPersistence: {
					...createMockPorts().planPersistence,
					atomicInsertPlan: async () => ({
						success: false as const,
						reason: 'Plan limit reached for current subscription tier',
					}),
				},
			});
			service = new PlanLifecycleService(ports);

			const result = await service.createPlan(validInput);

			expect(result.status).toBe('quota_rejected');
			if (result.status === 'quota_rejected') {
				expect(result.reason).toContain('Plan limit reached');
			}
		});

		it('rejects when duration cap is exceeded', async () => {
			ports = createMockPorts({
				quota: {
					...createMockPorts().quota,
					checkDurationCap: () => ({
						allowed: false,
						reason: 'Free tier limited to 4 weeks',
						upgradeUrl: '/upgrade',
					}),
				},
			});
			service = new PlanLifecycleService(ports);

			const result = await service.createPlan(validInput);

			expect(result.status).toBe('quota_rejected');
			if (result.status === 'quota_rejected') {
				expect(result.reason).toContain('4 weeks');
				expect(result.upgradeUrl).toBe('/upgrade');
			}
		});

		it('returns permanent_failure when topic is too short', async () => {
			const result = await service.createPlan({ ...validInput, topic: 'ab' });

			expect(result.status).toBe('permanent_failure');
			if (result.status === 'permanent_failure') {
				expect(result.classification).toBe('validation');
				expect(result.error.message).toContain('at least 3 characters');
			}
		});

		it('returns permanent_failure when topic is empty', async () => {
			const result = await service.createPlan({ ...validInput, topic: '' });

			expect(result.status).toBe('permanent_failure');
			if (result.status === 'permanent_failure') {
				expect(result.classification).toBe('validation');
			}
		});

		it('rejects when a capped plan exists', async () => {
			ports = createMockPorts({
				planPersistence: {
					...createMockPorts().planPersistence,
					findCappedPlanWithoutModules: async () => 'capped-plan-456',
				},
			});
			service = new PlanLifecycleService(ports);

			const result = await service.createPlan(validInput);

			expect(result.status).toBe('attempt_cap_exceeded');
			if (result.status === 'attempt_cap_exceeded') {
				expect(result.reason).toContain('capped-plan-456');
				expect(result.reason).toContain('exhausted generation attempts');
				expect(result.cappedPlanId).toBe('capped-plan-456');
			}
		});

		it('short-circuits before tier and duration work when a capped plan exists', async () => {
			const resolveUserTier = vi.fn().mockResolvedValue('free');
			const checkDurationCap = vi.fn().mockReturnValue({ allowed: true });
			const normalizePlanDuration = vi.fn().mockReturnValue({
				startDate: '2025-01-01',
				deadlineDate: '2025-01-15',
				totalWeeks: 2,
			});

			ports = createMockPorts({
				planPersistence: {
					...createMockPorts().planPersistence,
					findCappedPlanWithoutModules: async () => 'capped-plan-456',
				},
				quota: {
					...createMockPorts().quota,
					resolveUserTier,
					checkDurationCap,
					normalizePlanDuration,
				},
			});
			service = new PlanLifecycleService(ports);

			const result = await service.createPlan(validInput);

			expect(result.status).toBe('attempt_cap_exceeded');
			expect(resolveUserTier).not.toHaveBeenCalled();
			expect(checkDurationCap).not.toHaveBeenCalled();
			expect(normalizePlanDuration).not.toHaveBeenCalled();
		});

		it('passes normalized dates to atomicInsertPlan', async () => {
			let capturedData: unknown;
			ports = createMockPorts({
				planPersistence: {
					...createMockPorts().planPersistence,
					atomicInsertPlan: async (_userId, planData) => {
						capturedData = planData;
						return { success: true as const, id: 'plan-789' };
					},
				},
				quota: {
					...createMockPorts().quota,
					normalizePlanDuration: () => ({
						startDate: '2025-03-01',
						deadlineDate: '2025-03-15',
						totalWeeks: 2,
					}),
				},
			});
			service = new PlanLifecycleService(ports);

			await service.createPlan(validInput);

			expect(capturedData).toMatchObject({
				topic: 'Learn TypeScript',
				skillLevel: 'beginner',
				weeklyHours: 5,
				learningStyle: 'mixed',
				visibility: 'private',
				origin: 'ai',
				startDate: '2025-03-01',
				deadlineDate: '2025-03-15',
			});
		});

		it('trims whitespace from topic before inserting', async () => {
			let capturedData: unknown;
			ports = createMockPorts({
				planPersistence: {
					...createMockPorts().planPersistence,
					atomicInsertPlan: async (_userId, planData) => {
						capturedData = planData;
						return { success: true as const, id: 'plan-trim' };
					},
				},
			});
			service = new PlanLifecycleService(ports);

			await service.createPlan({ ...validInput, topic: '  Learn Rust  ' });

			expect(capturedData).toMatchObject({ topic: 'Learn Rust' });
		});

		it('returns duplicate_detected when a recent duplicate plan exists', async () => {
			ports = createMockPorts({
				planPersistence: {
					...createMockPorts().planPersistence,
					findRecentDuplicatePlan: async () => 'existing-plan-id',
				},
			});
			service = new PlanLifecycleService(ports);

			const result = await service.createPlan(validInput);

			expect(result.status).toBe('duplicate_detected');
			if (result.status === 'duplicate_detected') {
				expect(result.existingPlanId).toBe('existing-plan-id');
			}
		});

		it('does not call atomicInsertPlan when duplicate is detected', async () => {
			const insertSpy = vi
				.fn()
				.mockResolvedValue({ success: true as const, id: 'plan-new' });
			ports = createMockPorts({
				planPersistence: {
					...createMockPorts().planPersistence,
					findRecentDuplicatePlan: async () => 'existing-plan-id',
					atomicInsertPlan: insertSpy,
				},
			});
			service = new PlanLifecycleService(ports);

			await service.createPlan(validInput);

			expect(insertSpy).not.toHaveBeenCalled();
		});

		it('passes userId and trimmed topic to findRecentDuplicatePlan', async () => {
			let capturedUserId: string | undefined;
			let capturedTopic: string | undefined;
			ports = createMockPorts({
				planPersistence: {
					...createMockPorts().planPersistence,
					findRecentDuplicatePlan: async (userId, topic) => {
						capturedUserId = userId;
						capturedTopic = topic;
						return null;
					},
				},
			});
			service = new PlanLifecycleService(ports);

			await service.createPlan({
				...validInput,
				topic: '  Learn TypeScript  ',
			});

			expect(capturedUserId).toBe('user-abc');
			expect(capturedTopic).toBe('Learn TypeScript');
		});

		it('proceeds to create plan when no duplicate exists', async () => {
			// Default mock returns null for findRecentDuplicatePlan
			const result = await service.createPlan(validInput);

			expect(result.status).toBe('success');
			if (result.status === 'success') {
				expect(result.planId).toBe('plan-123');
			}
		});

		it('resolves tier for the correct userId', async () => {
			let capturedUserId: string | undefined;
			ports = createMockPorts({
				quota: {
					...createMockPorts().quota,
					resolveUserTier: async (userId) => {
						capturedUserId = userId;
						return 'pro';
					},
				},
			});
			service = new PlanLifecycleService(ports);

			const result = await service.createPlan({
				...validInput,
				userId: 'user-xyz',
			});

			expect(capturedUserId).toBe('user-xyz');
			if (result.status === 'success') {
				expect(result.tier).toBe('pro');
			}
		});
	});

	describe('processGenerationAttempt', () => {
		const validGenerationInput = {
			planId: 'plan-gen-001',
			userId: 'user-abc',
			tier: 'free' as const,
			input: {
				topic: 'Learn TypeScript',
				skillLevel: 'beginner' as const,
				weeklyHours: 5,
				learningStyle: 'mixed' as const,
			},
		};

		it('passes partial usage with missing fields through to usage recording on success', async () => {
			const recordUsageSpy = vi.fn().mockResolvedValue(undefined);
			const partialUsage = makeCanonicalUsage({
				provider: 'unknown',
				isPartial: true,
				missingFields: ['provider'],
				providerCostMicrousd: null,
			});
			ports = createMockPorts({
				usageRecording: {
					recordUsage: recordUsageSpy,
				},
				generation: {
					runGeneration: async () => ({
						status: 'success',
						modules: [],
						metadata: {},
						usage: partialUsage,
						durationMs: 250,
					}),
				},
			});
			service = new PlanLifecycleService(ports);

			await service.processGenerationAttempt(validGenerationInput);

			expect(recordUsageSpy).toHaveBeenCalledWith({
				userId: 'user-abc',
				usage: partialUsage,
				kind: 'plan',
			});
		});

		it('records partial permanent-failure usage when generation returns missing token fields', async () => {
			const recordUsageSpy = vi.fn().mockResolvedValue(undefined);
			const partialUsage = makeCanonicalUsage({
				inputTokens: 0,
				outputTokens: 0,
				totalTokens: 0,
				isPartial: true,
				missingFields: ['inputTokens', 'outputTokens'],
			});
			ports = createMockPorts({
				usageRecording: {
					recordUsage: recordUsageSpy,
				},
				generation: {
					runGeneration: async () => ({
						status: 'failure',
						classification: 'validation',
						error: new Error('missing usage fields'),
						metadata: {},
						usage: partialUsage,
						durationMs: 200,
					}),
				},
			});
			service = new PlanLifecycleService(ports);

			const result =
				await service.processGenerationAttempt(validGenerationInput);

			expect(result.status).toBe('permanent_failure');
			expect(recordUsageSpy).toHaveBeenCalledWith({
				userId: 'user-abc',
				usage: partialUsage,
				kind: 'plan',
			});
		});
	});
});
