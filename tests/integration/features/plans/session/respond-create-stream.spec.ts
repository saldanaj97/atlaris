import {
	readStreamingResponse,
	type StreamingEvent,
} from '@tests/helpers/streaming';
import { buildTestAuthUserId } from '@tests/helpers/testIds';
import { describe, expect, it, vi } from 'vitest';
import { AVAILABLE_MODELS } from '@/features/ai/ai-models';
import type {
	CreatePlanResult,
	GenerationAttemptResult,
	PlanLifecycleService,
	ProcessGenerationInput,
} from '@/features/plans/lifecycle';
import {
	createPlanGenerationSessionBoundary,
	type RespondCreateStreamArgs,
} from '@/features/plans/session/plan-generation-session';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';

const VALID_PRO_MODEL = AVAILABLE_MODELS.find(({ tier }) => tier === 'pro')?.id;

if (!VALID_PRO_MODEL) {
	throw new Error('Expected at least one pro-tier model fixture');
}

const SUCCESS_CREATE_RESULT: CreatePlanResult = {
	status: 'success',
	planId: 'plan_boundary_create_success',
	tier: 'pro',
	normalizedInput: {
		topic: 'Boundary Topic',
		skillLevel: 'beginner',
		weeklyHours: 5,
		learningStyle: 'mixed',
		startDate: null,
		deadlineDate: '2030-01-01',
	},
};

const SUCCESS_ATTEMPT_RESULT: GenerationAttemptResult = {
	status: 'generation_success',
	data: {
		modules: [
			{
				title: 'Boundary Module',
				estimatedMinutes: 60,
				tasks: [{ title: 'Boundary Task', estimatedMinutes: 30 }],
			},
		],
		metadata: {
			provider: 'mock',
			model: 'mock-model',
			usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
		},
		durationMs: 5,
	},
};

const BASE_BODY: CreateLearningPlanInput = {
	topic: 'Boundary Topic',
	skillLevel: 'beginner',
	weeklyHours: 5,
	learningStyle: 'mixed',
	notes: undefined,
	startDate: undefined,
	deadlineDate: '2030-01-01',
	visibility: 'private',
	origin: 'ai',
};

interface FakeLifecycleHandle {
	service: PlanLifecycleService;
	createPlan: ReturnType<typeof vi.fn>;
	processGenerationAttempt: ReturnType<typeof vi.fn>;
}

function buildFakeLifecycle({
	createResult = SUCCESS_CREATE_RESULT,
	process,
}: {
	createResult?: CreatePlanResult;
	process: (input: ProcessGenerationInput) => Promise<GenerationAttemptResult>;
}): FakeLifecycleHandle {
	const createPlan = vi.fn().mockResolvedValue(createResult);
	const processGenerationAttempt = vi.fn(process);

	const service = {
		createPlan,
		processGenerationAttempt,
	} as unknown as PlanLifecycleService;

	return { service, createPlan, processGenerationAttempt };
}

function buildCreateRequest(
	overrides: { signal?: AbortSignal; url?: string } = {},
): Request {
	return new Request(overrides.url ?? 'http://localhost/api/v1/plans/stream', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(BASE_BODY),
		...(overrides.signal ? { signal: overrides.signal } : {}),
	});
}

function buildArgs(
	args: Partial<RespondCreateStreamArgs> & { req: Request; authUserId: string },
): RespondCreateStreamArgs {
	return {
		internalUserId: 'internal-user-id',
		body: { ...BASE_BODY },
		savedPreferredAiModel: null,
		...args,
	};
}

function findEvent(
	events: StreamingEvent[],
	type: string,
): StreamingEvent | undefined {
	return events.find((event) => event.type === type);
}

describe('PlanGenerationSessionBoundary.respondCreateStream', () => {
	it('emits plan_start, module_summary, progress, then complete on success', async () => {
		const fake = buildFakeLifecycle({
			process: async () => SUCCESS_ATTEMPT_RESULT,
		});
		const createLifecycleService = vi.fn(() => fake.service);
		const boundary = createPlanGenerationSessionBoundary({
			createLifecycleService,
		});

		const authUserId = buildTestAuthUserId('boundary-create-success');
		const req = buildCreateRequest();

		const response = await boundary.respondCreateStream(
			buildArgs({ req, authUserId }),
		);

		expect(response.status).toBe(200);
		expect(createLifecycleService).toHaveBeenCalledTimes(1);
		expect(fake.createPlan).toHaveBeenCalledTimes(1);
		expect(fake.processGenerationAttempt).toHaveBeenCalledTimes(1);

		const events = await readStreamingResponse(response);
		const types = events.map((event) => event.type);
		expect(types).toEqual([
			'plan_start',
			'module_summary',
			'progress',
			'complete',
		]);

		const planStart = findEvent(events, 'plan_start');
		expect(planStart?.data).toMatchObject({
			planId: SUCCESS_CREATE_RESULT.planId,
			attemptNumber: 1,
			topic: 'Boundary Topic',
		});

		const complete = findEvent(events, 'complete');
		expect(complete?.data).toMatchObject({
			planId: SUCCESS_CREATE_RESULT.planId,
			modulesCount: 1,
			tasksCount: 1,
			totalMinutes: 60,
		});
	});

	it('emits sanitized error event for handled retryable failures', async () => {
		const fake = buildFakeLifecycle({
			process: async () => ({
				status: 'retryable_failure',
				classification: 'provider_error',
				error: new Error(
					'OpenRouter upstream failure: api_key=sk-live-secret-value',
				),
			}),
		});
		const boundary = createPlanGenerationSessionBoundary({
			createLifecycleService: () => fake.service,
		});

		const authUserId = buildTestAuthUserId('boundary-create-retryable');
		const req = buildCreateRequest();

		const response = await boundary.respondCreateStream(
			buildArgs({ req, authUserId }),
		);

		expect(response.status).toBe(200);

		const events = await readStreamingResponse(response);
		const planStart = findEvent(events, 'plan_start');
		const errorEvent = findEvent(events, 'error');
		expect(planStart).toBeDefined();
		expect(errorEvent).toBeDefined();
		expect(findEvent(events, 'complete')).toBeUndefined();

		const errorData = errorEvent?.data ?? {};
		expect(errorData).toMatchObject({
			code: 'GENERATION_FAILED',
			classification: 'provider_error',
			retryable: true,
		});
		const message = String(errorData.message ?? '');
		expect(message).not.toContain('api_key');
		expect(message).not.toContain('sk-live-secret-value');
	});

	it('emits permanent failure error code without retryable flag', async () => {
		const fake = buildFakeLifecycle({
			process: async () => ({
				status: 'permanent_failure',
				classification: 'validation',
				error: new Error('invalid generated payload'),
			}),
		});
		const boundary = createPlanGenerationSessionBoundary({
			createLifecycleService: () => fake.service,
		});

		const authUserId = buildTestAuthUserId('boundary-create-permanent');
		const req = buildCreateRequest();

		const response = await boundary.respondCreateStream(
			buildArgs({ req, authUserId }),
		);

		const events = await readStreamingResponse(response);
		const errorEvent = findEvent(events, 'error');
		expect(errorEvent?.data).toMatchObject({
			code: 'INVALID_OUTPUT',
			classification: 'validation',
			retryable: false,
		});
	});

	it('emits fallback error event when generation throws an unhandled error', async () => {
		const fake = buildFakeLifecycle({
			process: async () => {
				throw new Error('boundary unhandled boom');
			},
		});
		const boundary = createPlanGenerationSessionBoundary({
			createLifecycleService: () => fake.service,
		});

		const authUserId = buildTestAuthUserId('boundary-create-unhandled');
		const req = buildCreateRequest();

		const response = await boundary.respondCreateStream(
			buildArgs({ req, authUserId }),
		);

		const events = await readStreamingResponse(response);
		const planStart = findEvent(events, 'plan_start');
		const errorEvent = findEvent(events, 'error');
		expect(planStart).toBeDefined();
		expect(errorEvent).toBeDefined();
		expect(findEvent(events, 'complete')).toBeUndefined();
		expect(errorEvent?.data).toMatchObject({
			classification: 'provider_error',
		});
	});

	it('suppresses terminal SSE events when the client disconnects mid-stream', async () => {
		const controller = new AbortController();
		const fake = buildFakeLifecycle({
			process: async () => {
				controller.abort();
				throw new DOMException('Client disconnected', 'AbortError');
			},
		});
		const boundary = createPlanGenerationSessionBoundary({
			createLifecycleService: () => fake.service,
		});

		const authUserId = buildTestAuthUserId('boundary-create-disconnect');
		const req = buildCreateRequest({ signal: controller.signal });

		const response = await boundary.respondCreateStream(
			buildArgs({ req, authUserId }),
		);

		expect(response.status).toBe(200);

		const events = await readStreamingResponse(response);
		expect(findEvent(events, 'plan_start')).toBeDefined();
		expect(findEvent(events, 'complete')).toBeUndefined();
		expect(findEvent(events, 'error')).toBeUndefined();
	});

	it('passes responseHeaders through to the streaming Response', async () => {
		const fake = buildFakeLifecycle({
			process: async () => SUCCESS_ATTEMPT_RESULT,
		});
		const boundary = createPlanGenerationSessionBoundary({
			createLifecycleService: () => fake.service,
		});

		const authUserId = buildTestAuthUserId('boundary-create-headers');
		const req = buildCreateRequest();

		const response = await boundary.respondCreateStream(
			buildArgs({
				req,
				authUserId,
				responseHeaders: {
					'X-RateLimit-Limit': '7',
					'X-Custom-Test': 'boundary',
				},
			}),
		);

		expect(response.headers.get('X-RateLimit-Limit')).toBe('7');
		expect(response.headers.get('X-Custom-Test')).toBe('boundary');
		expect(response.headers.get('Content-Type')).toBe('text/event-stream');

		await response.body?.cancel();
	});

	it('ignores invalid model query param when savedPreferredAiModel is null', async () => {
		const captured: ProcessGenerationInput[] = [];
		const fake = buildFakeLifecycle({
			process: async (input) => {
				captured.push(input);
				return SUCCESS_ATTEMPT_RESULT;
			},
		});
		const boundary = createPlanGenerationSessionBoundary({
			createLifecycleService: () => fake.service,
		});

		const authUserId = buildTestAuthUserId('boundary-create-model-invalid');
		const req = buildCreateRequest({
			url: 'http://localhost/api/v1/plans/stream?model=invalid/model-id',
		});

		const response = await boundary.respondCreateStream(
			buildArgs({
				req,
				authUserId,
				savedPreferredAiModel: null,
			}),
		);

		await readStreamingResponse(response);

		expect(captured).toHaveLength(1);
		// Invalid query param + null saved preference → tier_default → no override.
		expect(captured[0]?.modelOverride).toBeUndefined();
	});

	it('forwards a valid model query param into processGenerationAttempt', async () => {
		const captured: ProcessGenerationInput[] = [];
		const fake = buildFakeLifecycle({
			process: async (input) => {
				captured.push(input);
				return SUCCESS_ATTEMPT_RESULT;
			},
		});
		const boundary = createPlanGenerationSessionBoundary({
			createLifecycleService: () => fake.service,
		});

		const authUserId = buildTestAuthUserId('boundary-create-model-valid');
		const req = buildCreateRequest({
			url: `http://localhost/api/v1/plans/stream?model=${encodeURIComponent(VALID_PRO_MODEL)}`,
		});

		const response = await boundary.respondCreateStream(
			buildArgs({
				req,
				authUserId,
				savedPreferredAiModel: null,
			}),
		);

		await readStreamingResponse(response);

		expect(captured).toHaveLength(1);
		expect(captured[0]?.modelOverride).toBe(VALID_PRO_MODEL);
	});

	it('falls back to savedPreferredAiModel when no query param is supplied', async () => {
		const captured: ProcessGenerationInput[] = [];
		const fake = buildFakeLifecycle({
			process: async (input) => {
				captured.push(input);
				return SUCCESS_ATTEMPT_RESULT;
			},
		});
		const boundary = createPlanGenerationSessionBoundary({
			createLifecycleService: () => fake.service,
		});

		const authUserId = buildTestAuthUserId('boundary-create-saved-pref');
		const req = buildCreateRequest();

		const response = await boundary.respondCreateStream(
			buildArgs({
				req,
				authUserId,
				savedPreferredAiModel: VALID_PRO_MODEL,
			}),
		);

		await readStreamingResponse(response);

		expect(captured).toHaveLength(1);
		expect(captured[0]?.modelOverride).toBe(VALID_PRO_MODEL);
	});

	it('builds a fresh lifecycle service per request via the injected factory', async () => {
		const fake = buildFakeLifecycle({
			process: async () => SUCCESS_ATTEMPT_RESULT,
		});
		const createLifecycleService = vi.fn<
			(db: AttemptsDbClient) => PlanLifecycleService
		>(() => fake.service);
		const boundary = createPlanGenerationSessionBoundary({
			createLifecycleService,
		});

		const authUserId = buildTestAuthUserId('boundary-create-factory');

		const responses = await Promise.all([
			boundary.respondCreateStream(
				buildArgs({ req: buildCreateRequest(), authUserId }),
			),
			boundary.respondCreateStream(
				buildArgs({ req: buildCreateRequest(), authUserId }),
			),
		]);

		await Promise.all(
			responses.map((response) => readStreamingResponse(response)),
		);

		expect(createLifecycleService).toHaveBeenCalledTimes(2);
		for (const call of createLifecycleService.mock.calls) {
			expect(call[0]).toBeDefined();
		}
	});
});
