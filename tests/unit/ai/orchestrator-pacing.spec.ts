import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  runGenerationAttempt,
  type GenerationAttemptContext,
  type RunGenerationOptions,
} from '@/lib/ai/orchestrator';
import { pacePlan } from '@/lib/ai/pacing';
import {
  ProviderTimeoutError,
  type AiPlanGenerationProvider,
  type GenerationInput,
} from '@/lib/ai/provider';
import {
  finalizeAttemptFailure,
  finalizeAttemptSuccess,
  reserveAttemptSlot,
} from '@/lib/db/queries/attempts';
import type {
  AttemptRejection,
  AttemptReservation,
  AttemptsDbClient,
  GenerationAttemptRecord,
} from '@/lib/db/queries/types/attempts.types';

type AttemptOpsOverrides = {
  reserveAttemptSlot: typeof reserveAttemptSlot;
  finalizeAttemptSuccess: typeof finalizeAttemptSuccess;
  finalizeAttemptFailure: typeof finalizeAttemptFailure;
};

/** Drizzle methods required by attempt operations; type-checked so signature changes are caught. */
type RequiredAttemptsDbMethods = Pick<
  AttemptsDbClient,
  'select' | 'insert' | 'update' | 'delete' | 'transaction'
>;

/**
 * Builds a type-safe AttemptsDbClient mock for unit tests. Required Drizzle methods are
 * explicitly typed against AttemptsDbClient so signature changes are caught. If
 * AttemptsDbClient gains new required methods used by the orchestrator or attempts module,
 * add them to RequiredAttemptsDbMethods and provide implementations here.
 */
function createAttemptsDbClientMock(overrides: {
  reserveAttemptSlot: AttemptOpsOverrides['reserveAttemptSlot'];
  finalizeAttemptSuccess: AttemptOpsOverrides['finalizeAttemptSuccess'];
  finalizeAttemptFailure: AttemptOpsOverrides['finalizeAttemptFailure'];
}): AttemptsDbClient & AttemptOpsOverrides {
  const requiredDbMethods: RequiredAttemptsDbMethods = {
    select: () => {
      throw new Error('select should not be called in this test');
    },
    insert: () => {
      throw new Error('insert should not be called in this test');
    },
    update: () => {
      throw new Error('update should not be called in this test');
    },
    delete: () => {
      throw new Error('delete should not be called in this test');
    },
    transaction: () => {
      throw new Error('transaction should not be called in this test');
    },
  };

  return {
    ...requiredDbMethods,
    reserveAttemptSlot: overrides.reserveAttemptSlot,
    finalizeAttemptSuccess: overrides.finalizeAttemptSuccess,
    finalizeAttemptFailure: overrides.finalizeAttemptFailure,
  } as AttemptsDbClient & AttemptOpsOverrides;
}

function buildId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function streamFromJson(payload: object): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      controller.enqueue(JSON.stringify(payload));
      controller.close();
    },
  });
}

function buildContext(
  overrides: Partial<GenerationAttemptContext> = {}
): GenerationAttemptContext {
  return {
    planId: buildId('plan'),
    userId: buildId('user'),
    input: {
      ...buildInput(),
      ...(overrides.input ?? {}),
    },
    ...overrides,
  };
}

function buildInput(overrides: Partial<GenerationInput> = {}): GenerationInput {
  return {
    topic: 'Test Topic',
    skillLevel: 'intermediate',
    weeklyHours: 5,
    learningStyle: 'mixed',
    startDate: '2024-01-01',
    deadlineDate: '2024-01-29',
    ...overrides,
  };
}

function buildReservation(
  overrides: Partial<AttemptReservation> = {}
): AttemptReservation {
  return {
    reserved: true,
    attemptId: buildId('attempt'),
    attemptNumber: 1,
    startedAt: new Date('2024-01-01T00:00:00.000Z'),
    sanitized: {
      topic: {
        value: 'Test Topic',
        truncated: false,
        originalLength: 10,
      },
      notes: {
        value: undefined,
        truncated: false,
        originalLength: undefined,
      },
    },
    promptHash: buildId('hash'),
    ...overrides,
  };
}

function buildAttemptRecord(
  planId: string,
  overrides: Partial<GenerationAttemptRecord> = {}
): GenerationAttemptRecord {
  return {
    id: buildId('attempt-record'),
    planId,
    status: 'success',
    classification: null,
    durationMs: 1,
    modulesCount: 1,
    tasksCount: 2,
    truncatedTopic: false,
    truncatedNotes: false,
    normalizedEffort: false,
    promptHash: buildId('hash'),
    metadata: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createProvider(
  modules: Array<{
    title: string;
    description?: string;
    estimatedMinutes: number;
    tasks: Array<{
      title: string;
      description?: string;
      estimatedMinutes: number;
    }>;
  }>
): AiPlanGenerationProvider {
  return {
    generate: vi.fn().mockResolvedValue({
      stream: streamFromJson({ modules }),
      metadata: { model: 'gpt-4' },
    }),
  };
}

function createDbHarness(params?: {
  planId?: string;
  reservation?: AttemptReservation | AttemptRejection;
  successAttempt?: GenerationAttemptRecord;
  failureAttempt?: GenerationAttemptRecord;
}): {
  dbClient: AttemptsDbClient & AttemptOpsOverrides;
  reserveAttemptSlotMock: ReturnType<typeof vi.fn<typeof reserveAttemptSlot>>;
  finalizeAttemptSuccessMock: ReturnType<
    typeof vi.fn<typeof finalizeAttemptSuccess>
  >;
  finalizeAttemptFailureMock: ReturnType<
    typeof vi.fn<typeof finalizeAttemptFailure>
  >;
} {
  const planId = params?.planId ?? buildId('plan');
  const reservation = params?.reservation ?? buildReservation();
  const successAttempt = params?.successAttempt ?? buildAttemptRecord(planId);
  const failureAttempt =
    params?.failureAttempt ??
    buildAttemptRecord(successAttempt.planId, {
      status: 'failure',
      classification: 'timeout',
      modulesCount: 0,
      tasksCount: 0,
    });

  const reserveAttemptSlotMock = vi
    .fn<typeof reserveAttemptSlot>()
    .mockResolvedValue(reservation);
  const finalizeAttemptSuccessMock = vi
    .fn<typeof finalizeAttemptSuccess>()
    .mockResolvedValue(successAttempt);
  const finalizeAttemptFailureMock = vi
    .fn<typeof finalizeAttemptFailure>()
    .mockResolvedValue(failureAttempt);

  const dbClient = createAttemptsDbClientMock({
    reserveAttemptSlot: reserveAttemptSlotMock,
    finalizeAttemptSuccess: finalizeAttemptSuccessMock,
    finalizeAttemptFailure: finalizeAttemptFailureMock,
  });

  return {
    dbClient,
    reserveAttemptSlotMock,
    finalizeAttemptSuccessMock,
    finalizeAttemptFailureMock,
  };
}

describe('runGenerationAttempt pacing', () => {
  const parsedModules = [
    {
      title: 'Module 1',
      description: 'Desc 1',
      estimatedMinutes: 90,
      tasks: [
        {
          title: 'Task 1',
          description: 'Task desc',
          estimatedMinutes: 45,
        },
        {
          title: 'Task 2',
          description: 'Task desc',
          estimatedMinutes: 45,
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies pacing after parsing and before recording success', async () => {
    const context = buildContext();
    const provider = createProvider(parsedModules);
    const { dbClient, finalizeAttemptSuccessMock } = createDbHarness({
      successAttempt: buildAttemptRecord(context.planId),
    });
    const options: RunGenerationOptions = {
      provider,
      dbClient,
      timeoutConfig: { baseMs: 30_000, extensionMs: 10_000 },
      clock: () => Date.now(),
      now: () => new Date(),
    };

    const expectedPaced = pacePlan(parsedModules, context.input);
    const result = await runGenerationAttempt(context, options);

    expect(result.status).toBe('success');
    if (result.status !== 'success') {
      throw new Error('Expected success result');
    }

    expect(result.modules).toEqual(expectedPaced);
    expect(result.metadata).toEqual({ model: 'gpt-4' });
    expect(finalizeAttemptSuccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modules: expectedPaced,
        providerMetadata: { model: 'gpt-4' },
      })
    );
  });

  it('trims work when available capacity is low', async () => {
    const denseModules = [
      {
        title: 'Module 1',
        description: 'Desc 1',
        estimatedMinutes: 180,
        tasks: [
          { title: 'Task 1', description: 'Task desc', estimatedMinutes: 45 },
          { title: 'Task 2', description: 'Task desc', estimatedMinutes: 45 },
          { title: 'Task 3', description: 'Task desc', estimatedMinutes: 45 },
          { title: 'Task 4', description: 'Task desc', estimatedMinutes: 45 },
        ],
      },
    ];
    const context = buildContext({
      input: buildInput({
        weeklyHours: 1,
        deadlineDate: '2024-01-08',
      }),
    });
    const provider = createProvider(denseModules);
    const { dbClient } = createDbHarness({
      planId: context.planId,
      successAttempt: buildAttemptRecord(context.planId),
    });

    const result = await runGenerationAttempt(context, {
      provider,
      dbClient,
      timeoutConfig: { baseMs: 30_000, extensionMs: 10_000 },
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') {
      throw new Error('Expected success result');
    }
    const totalTasks = result.modules.reduce((sum, module) => {
      return sum + module.tasks.length;
    }, 0);
    expect(totalTasks).toBeLessThan(4);
  });

  it('returns capped failure without parsing or pacing', async () => {
    const context = buildContext();
    const provider = createProvider(parsedModules);
    const { dbClient, finalizeAttemptFailureMock, finalizeAttemptSuccessMock } =
      createDbHarness({
        planId: context.planId,
        reservation: {
          reserved: false,
          reason: 'capped',
        },
      });

    const result = await runGenerationAttempt(context, {
      provider,
      dbClient,
      timeoutConfig: { baseMs: 30_000, extensionMs: 10_000 },
    });

    expect(result.status).toBe('failure');
    expect(result.classification).toBe('capped');
    expect(finalizeAttemptSuccessMock).not.toHaveBeenCalled();
    expect(finalizeAttemptFailureMock).not.toHaveBeenCalled();
  });

  it('classifies ProviderTimeoutError as timed out without parsing', async () => {
    const context = buildContext();
    const provider: AiPlanGenerationProvider = {
      generate: vi.fn().mockRejectedValue(new ProviderTimeoutError('timeout')),
    };
    const { dbClient, finalizeAttemptFailureMock } = createDbHarness({
      planId: context.planId,
      failureAttempt: buildAttemptRecord(context.planId, {
        status: 'failure',
        classification: 'timeout',
      }),
    });

    const result = await runGenerationAttempt(context, {
      provider,
      dbClient,
      timeoutConfig: { baseMs: 30_000, extensionMs: 10_000 },
    });

    expect(result.status).toBe('failure');
    if (result.status !== 'failure') {
      throw new Error('Expected failure result');
    }
    expect(result.classification).toBe('timeout');
    expect(result.timedOut).toBe(true);
    expect(finalizeAttemptFailureMock).toHaveBeenCalledTimes(1);
  });

  it('keeps modules unchanged when no deadline is provided', async () => {
    const context = buildContext({
      input: buildInput({
        startDate: null,
        deadlineDate: null,
      }),
    });
    const provider = createProvider(parsedModules);
    const { dbClient } = createDbHarness({
      planId: context.planId,
      successAttempt: buildAttemptRecord(context.planId),
    });

    const result = await runGenerationAttempt(context, {
      provider,
      dbClient,
      timeoutConfig: { baseMs: 30_000, extensionMs: 10_000 },
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') {
      throw new Error('Expected success result');
    }
    // pacePlan treats missing deadlines as "no trim", so orchestrator should persist parsed modules as-is.
    expect(result.modules).toEqual(parsedModules);
  });
});
