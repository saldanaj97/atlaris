import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type {
  CreatePlanSuccess,
  GenerationAttemptResult,
  ProcessGenerationInput,
} from '@/features/plans/lifecycle/types';
import type {
  RespondCreateStreamArgs,
  RespondRetryStreamArgs,
  RetryPlanGenerationPlanSnapshot,
} from '@/features/plans/session/plan-generation-session';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';
import type { AttemptReservation } from '@/lib/db/queries/types/attempts.types';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { db } from '@supabase/service-role';
import { vi } from 'vitest';

export interface MockProcessLifecycleHandle {
  service: PlanLifecycleService;
  processGenerationAttempt: ReturnType<typeof vi.fn>;
}

export interface MockCreateLifecycleHandle extends MockProcessLifecycleHandle {
  createPlan: ReturnType<typeof vi.fn>;
}

export const SUCCESS_CREATE_RESULT: CreatePlanSuccess = {
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

export const SUCCESS_CREATE_ATTEMPT_RESULT: GenerationAttemptResult = {
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

export const SUCCESS_RETRY_ATTEMPT_RESULT: GenerationAttemptResult = {
  status: 'generation_success',
  data: {
    modules: [
      {
        title: 'Retry Module',
        estimatedMinutes: 90,
        tasks: [
          { title: 'Retry Task A', estimatedMinutes: 30 },
          { title: 'Retry Task B', estimatedMinutes: 60 },
        ],
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

export const BASE_CREATE_BODY: CreateLearningPlanInput = {
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

export const BASE_RETRY_PLAN_SNAPSHOT: RetryPlanGenerationPlanSnapshot = {
  topic: 'Retry Topic',
  skillLevel: 'intermediate',
  weeklyHours: 6,
  learningStyle: 'mixed',
  startDate: '2030-01-01',
  deadlineDate: '2030-06-01',
  origin: 'ai',
};

export function buildCreateStreamRequest(
  overrides: { signal?: AbortSignal; url?: string } = {},
): Request {
  return new Request(overrides.url ?? 'http://localhost/api/v1/plans/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(BASE_CREATE_BODY),
    ...(overrides.signal ? { signal: overrides.signal } : {}),
  });
}

export function buildRetryStreamRequest(
  planId: string,
  signal?: AbortSignal,
): Request {
  return new Request(`http://localhost/api/v1/plans/${planId}/retry`, {
    method: 'POST',
    ...(signal ? { signal } : {}),
  });
}

export function buildCreateStreamArgs(
  args: Partial<RespondCreateStreamArgs> & {
    req: Request;
    authUserId: string;
  },
): RespondCreateStreamArgs {
  return {
    internalUserId: 'internal-user-id',
    body: { ...BASE_CREATE_BODY },
    savedPreferredAiModel: null,
    ...args,
  };
}

export interface BuildRetryStreamArgsInput {
  req: Request;
  authUserId: string;
  internalUserId: string;
  planId?: string;
  plan?: RetryPlanGenerationPlanSnapshot;
  responseHeaders?: HeadersInit;
  requestId?: string;
}

export function buildRetryStreamArgs(
  input: BuildRetryStreamArgsInput,
): RespondRetryStreamArgs {
  return {
    req: input.req,
    authUserId: input.authUserId,
    internalUserId: input.internalUserId,
    planId: input.planId ?? 'plan_boundary_retry',
    plan: input.plan ?? { ...BASE_RETRY_PLAN_SNAPSHOT },
    tierDb: db,
    ...(input.responseHeaders
      ? { responseHeaders: input.responseHeaders }
      : {}),
    ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
  };
}

export async function setupPlanSessionUser(scenario: string): Promise<{
  authUserId: string;
  internalUserId: string;
}> {
  const authUserId = buildTestAuthUserId(scenario);
  const internalUserId = await ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
    subscriptionTier: 'pro',
  });
  return { authUserId, internalUserId };
}

export function fakeAttemptReservation(
  topic: string,
  attemptNumber: number,
): AttemptReservation {
  return {
    reserved: true,
    attemptId: `fake-attempt-${attemptNumber}`,
    attemptNumber,
    startedAt: new Date(),
    sanitized: {
      topic: {
        value: topic,
        truncated: false,
        originalLength: topic.length,
      },
      notes: { value: undefined, truncated: false },
    },
    promptHash: `fake-hash-${attemptNumber}`,
  };
}

export function buildMockProcessLifecycle(
  process: (input: ProcessGenerationInput) => Promise<GenerationAttemptResult>,
  options?: {
    reserveAttemptNumber?: number;
    topic?: string;
  },
): MockProcessLifecycleHandle {
  const reserveN = options?.reserveAttemptNumber ?? 2;
  const topic = options?.topic ?? 'Test Topic';
  const processGenerationAttempt = vi.fn(
    async (input: ProcessGenerationInput) => {
      input.onAttemptReserved?.(fakeAttemptReservation(topic, reserveN));
      return process(input);
    },
  );

  const service = {
    createPlan: vi.fn(),
    processGenerationAttempt,
  } as unknown as PlanLifecycleService;

  return { service, processGenerationAttempt };
}

export function buildMockCreateLifecycle({
  createResult,
  process,
  reserveAttemptNumber = 1,
  topic = 'Boundary Topic',
}: {
  createResult: CreatePlanSuccess;
  process: (input: ProcessGenerationInput) => Promise<GenerationAttemptResult>;
  reserveAttemptNumber?: number;
  topic?: string;
}): MockCreateLifecycleHandle {
  const createPlan = vi.fn().mockResolvedValue(createResult);
  const { processGenerationAttempt } = buildMockProcessLifecycle(process, {
    reserveAttemptNumber,
    topic,
  });

  const createService = {
    createPlan,
    processGenerationAttempt,
  } as unknown as PlanLifecycleService;

  return {
    service: createService,
    createPlan,
    processGenerationAttempt,
  };
}
