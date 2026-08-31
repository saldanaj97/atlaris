import type {
  AiPlanGenerationProvider,
  GenerationInput,
  GenerationOptions,
} from '@/features/ai/types/provider.types';
import type { reserveAttemptSlot } from '@/lib/db/queries/attempts';
import type { AttemptReservation } from '@/lib/db/queries/types/attempts.types';

import { runGenerationExecution } from '@/features/ai/orchestrator';
import { makeAttemptsDbClient } from '@tests/fixtures/db-mocks';
import { createId } from '@tests/fixtures/ids';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AttemptOperationsOverrides = {
  reserveAttemptSlot: typeof reserveAttemptSlot;
};

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

type TimeoutTestContextOverrides = {
  attemptId?: string;
  planId?: string;
  userId?: string;
  promptHash?: string;
  startedAt?: Date;
};

function createTimeoutTestContext(
  overrides: TimeoutTestContextOverrides = {},
): {
  reservedAttempt: AttemptReservation;
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
    generationPurpose: 'initial',
  };

  return {
    reservedAttempt,
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
    generateModuleLessonBatch: async () => ({
      stream: new ReadableStream<string>({
        start(controller) {
          controller.close();
        },
      }),
      metadata: { provider: 'mock', model: 'mock-model' },
    }),
  };
}

describe('runGenerationExecution timeout wiring', () => {
  let ctx: ReturnType<typeof createTimeoutTestContext>;
  let mockDbClient: ReturnType<typeof makeAttemptsDbClient>;

  beforeEach(() => {
    ctx = createTimeoutTestContext();
    mockDbClient = makeAttemptsDbClient();
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
    };

    const result = await runGenerationExecution(
      {
        planId: ctx.ids.planId,
        userId: ctx.ids.userId,
        generationPurpose: 'initial',
        input: {
          topic: 'TypeScript',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
        },
      },
      {
        dbClient: mockDbClient,
        attemptOperations,
        provider,
      },
    );

    expect(result.kind).toBe('success');
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
    };

    const result = await runGenerationExecution(
      {
        planId: ctx.ids.planId,
        userId: ctx.ids.userId,
        generationPurpose: 'initial',
        input: {
          topic: 'TypeScript',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
        },
      },
      {
        dbClient: mockDbClient,
        attemptOperations,
        provider,
        timeoutConfig: {
          baseMs: 2500,
          extensionMs: 1000,
          extensionThresholdMs: 2000,
        },
      },
    );

    expect(result.kind).toBe('success');
    expect(observedTimeoutMs).toBe(2500);
  });
});
