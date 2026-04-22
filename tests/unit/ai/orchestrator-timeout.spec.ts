import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
	AiPlanGenerationProvider,
	GenerationInput,
	GenerationOptions,
} from '@/features/ai/types/provider.types';
import type {
	finalizeAttemptFailure,
	finalizeAttemptSuccess,
	reserveAttemptSlot,
} from '@/lib/db/queries/attempts';
import type {
	AttemptReservation,
	AttemptsDbClient,
} from '@/lib/db/queries/types/attempts.types';
import { createId } from '../../fixtures/ids';

type MockAttemptsDbClient = {
	select: () => unknown;
	insert: () => unknown;
	update: () => unknown;
	delete: () => unknown;
	transaction: () => unknown;
};

function asAttemptsDbClient(dbClient: MockAttemptsDbClient): AttemptsDbClient {
	// NOTE: keeps a bespoke AttemptsDbClient double instead of tests/fixtures/db-mocks.ts#makeAttemptsDbClient because this test injects a timeout-specific mock shape rather than the full query client.
	return dbClient as unknown as AttemptsDbClient;
}

type AttemptOperationsOverrides = {
	reserveAttemptSlot: typeof reserveAttemptSlot;
	finalizeAttemptSuccess: typeof finalizeAttemptSuccess;
	finalizeAttemptFailure: typeof finalizeAttemptFailure;
};

import { runGenerationAttempt } from '@/features/ai/orchestrator';

const ORIGINAL_TIMEOUT_ENV = {
	baseMs: process.env.AI_TIMEOUT_BASE_MS,
	extensionMs: process.env.AI_TIMEOUT_EXTENSION_MS,
	extensionThresholdMs: process.env.AI_TIMEOUT_EXTENSION_THRESHOLD_MS,
};

const TIMEOUT_ENV_KEYS = [
	'AI_TIMEOUT_BASE_MS',
	'AI_TIMEOUT_EXTENSION_MS',
	'AI_TIMEOUT_EXTENSION_THRESHOLD_MS',
] as const;

const TIMEOUT_ENV_LOOKUP: Record<
	(typeof TIMEOUT_ENV_KEYS)[number],
	string | undefined
> = {
	AI_TIMEOUT_BASE_MS: ORIGINAL_TIMEOUT_ENV.baseMs,
	AI_TIMEOUT_EXTENSION_MS: ORIGINAL_TIMEOUT_ENV.extensionMs,
	AI_TIMEOUT_EXTENSION_THRESHOLD_MS: ORIGINAL_TIMEOUT_ENV.extensionThresholdMs,
};

function restoreTimeoutEnvVar(key: (typeof TIMEOUT_ENV_KEYS)[number]): void {
	const originalValue = TIMEOUT_ENV_LOOKUP[key];
	if (originalValue === undefined) {
		delete process.env[key];
		return;
	}
	process.env[key] = originalValue;
}

type SuccessAttemptRecord = {
	id: string;
	planId: string;
	status: string;
	classification: string | null;
	durationMs: number;
	modulesCount: number;
	tasksCount: number;
	truncatedTopic: boolean;
	truncatedNotes: boolean;
	normalizedEffort: boolean;
	promptHash: string;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
};

type FailureAttemptRecord = SuccessAttemptRecord & {
	status: 'failure';
	classification: 'timeout' | 'validation' | 'provider_error';
	modulesCount: 0;
	tasksCount: 0;
};

type TimeoutTestContextOverrides = {
	attemptId?: string;
	planId?: string;
	userId?: string;
	promptHash?: string;
	startedAt?: Date;
	createdAt?: Date;
	status?: string;
};

function createTimeoutTestContext(
	overrides: TimeoutTestContextOverrides = {},
): {
	reservedAttempt: AttemptReservation;
	successAttemptRecord: SuccessAttemptRecord;
	ids: {
		attemptId: string;
		planId: string;
		userId: string;
		promptHash: string;
	};
} {
	const attemptId = overrides.attemptId ?? createId('attempt');
	const planId = overrides.planId ?? createId('plan');
	const userId = overrides.userId ?? createId('user');
	const promptHash = overrides.promptHash ?? createId('hash');
	const startedAt = overrides.startedAt ?? new Date('2026-02-12T00:00:00.000Z');
	const createdAt = overrides.createdAt ?? new Date('2026-02-12T00:00:01.000Z');
	const status = overrides.status ?? 'success';

	const reservedAttempt: AttemptReservation = {
		reserved: true,
		attemptId,
		attemptNumber: 1,
		startedAt,
		sanitized: {
			topic: { value: 'TypeScript', truncated: false, originalLength: 10 },
			notes: { value: undefined, truncated: false, originalLength: undefined },
		},
		promptHash,
	};

	const successAttemptRecord: SuccessAttemptRecord = {
		id: attemptId,
		planId,
		status,
		classification: null,
		durationMs: 100,
		modulesCount: 1,
		tasksCount: 1,
		truncatedTopic: false,
		truncatedNotes: false,
		normalizedEffort: false,
		promptHash,
		metadata: null,
		createdAt,
	};

	return {
		reservedAttempt,
		successAttemptRecord,
		ids: { attemptId, planId, userId, promptHash },
	};
}

function createProvider(
	onGenerate: (options?: GenerationOptions) => void,
): AiPlanGenerationProvider {
	return {
		async generate(_input: GenerationInput, options?: GenerationOptions) {
			onGenerate(options);
			return {
				stream: new ReadableStream<string>({
					start(controller) {
						controller.enqueue(
							JSON.stringify({
								modules: [
									{
										title: 'Module 1',
										estimatedMinutes: 60,
										tasks: [{ title: 'Task 1', estimatedMinutes: 30 }],
									},
								],
							}),
						);
						controller.close();
					},
				}),
				metadata: { provider: 'mock', model: 'mock-model' },
			};
		},
	};
}

describe('runGenerationAttempt timeout wiring', () => {
	let ctx: ReturnType<typeof createTimeoutTestContext>;
	let mockDbClient: MockAttemptsDbClient;
	let failureAttemptRecord: FailureAttemptRecord;

	beforeEach(() => {
		ctx = createTimeoutTestContext();
		failureAttemptRecord = {
			...ctx.successAttemptRecord,
			status: 'failure',
			classification: 'timeout',
			modulesCount: 0,
			tasksCount: 0,
		};
		mockDbClient = {
			select: () => ({}),
			insert: () => ({}),
			update: () => ({}),
			delete: () => ({}),
			transaction: () => ({}),
		};
	});

	afterEach(() => {
		vi.clearAllMocks();

		TIMEOUT_ENV_KEYS.forEach(restoreTimeoutEnvVar);
	});

	it('uses aiTimeoutEnv baseMs when no override is provided', async () => {
		process.env.AI_TIMEOUT_BASE_MS = '4321';
		process.env.AI_TIMEOUT_EXTENSION_MS = '1111';
		process.env.AI_TIMEOUT_EXTENSION_THRESHOLD_MS = '3000';

		let observedTimeoutMs: number | undefined;
		const provider = createProvider((options) => {
			observedTimeoutMs = options?.timeoutMs;
		});
		const attemptOperations: AttemptOperationsOverrides = {
			reserveAttemptSlot: vi
				.fn()
				.mockResolvedValue(ctx.reservedAttempt) as typeof reserveAttemptSlot,
			finalizeAttemptSuccess: vi
				.fn()
				.mockResolvedValue(
					ctx.successAttemptRecord,
				) as typeof finalizeAttemptSuccess,
			finalizeAttemptFailure: vi
				.fn()
				.mockResolvedValue(
					failureAttemptRecord,
				) as typeof finalizeAttemptFailure,
		};

		const result = await runGenerationAttempt(
			{
				planId: ctx.ids.planId,
				userId: ctx.ids.userId,
				input: {
					topic: 'TypeScript',
					skillLevel: 'beginner',
					weeklyHours: 5,
					learningStyle: 'mixed',
				},
			},
			{
				dbClient: asAttemptsDbClient(mockDbClient),
				attemptOperations,
				provider,
			},
		);

		expect(result.status).toBe('success');
		expect(observedTimeoutMs).toBe(4321);
	});

	it('passes explicit timeout override to provider', async () => {
		process.env.AI_TIMEOUT_BASE_MS = '9999';

		let observedTimeoutMs: number | undefined;
		const provider = createProvider((options) => {
			observedTimeoutMs = options?.timeoutMs;
		});
		const attemptOperations: AttemptOperationsOverrides = {
			reserveAttemptSlot: vi
				.fn()
				.mockResolvedValue(ctx.reservedAttempt) as typeof reserveAttemptSlot,
			finalizeAttemptSuccess: vi
				.fn()
				.mockResolvedValue(
					ctx.successAttemptRecord,
				) as typeof finalizeAttemptSuccess,
			finalizeAttemptFailure: vi
				.fn()
				.mockResolvedValue(
					failureAttemptRecord,
				) as typeof finalizeAttemptFailure,
		};

		const result = await runGenerationAttempt(
			{
				planId: ctx.ids.planId,
				userId: ctx.ids.userId,
				input: {
					topic: 'TypeScript',
					skillLevel: 'beginner',
					weeklyHours: 5,
					learningStyle: 'mixed',
				},
			},
			{
				dbClient: asAttemptsDbClient(mockDbClient),
				attemptOperations,
				provider,
				timeoutConfig: {
					baseMs: 2500,
					extensionMs: 1000,
					extensionThresholdMs: 2000,
				},
			},
		);

		expect(result.status).toBe('success');
		expect(observedTimeoutMs).toBe(2500);
	});
});
