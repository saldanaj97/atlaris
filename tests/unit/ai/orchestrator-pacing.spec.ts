import type {
  GenerationAttemptContext,
  RunGenerationOptions,
} from '@/features/ai/types/orchestrator.types';
import type {
  AiPlanGenerationProvider,
  GenerationInput,
} from '@/features/ai/types/provider.types';
import type { reserveAttemptSlot } from '@/lib/db/queries/attempts';
import type {
  AttemptRejection,
  AttemptReservation,
  AttemptsDbClient,
} from '@/lib/db/queries/types/attempts.types';

import { runGenerationExecution } from '@/features/ai/orchestrator';
import { pacePlan } from '@/features/ai/pacing';
import { ProviderTimeoutError } from '@/features/ai/providers/errors';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type AttemptOpsOverrides = {
  reserveAttemptSlot: typeof reserveAttemptSlot;
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
function createAttemptsDbClientMock(): AttemptsDbClient {
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

  return requiredDbMethods as AttemptsDbClient;
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
  overrides: Partial<GenerationAttemptContext> = {},
): GenerationAttemptContext {
  return {
    planId: buildId('plan'),
    userId: buildId('user'),
    input: {
      ...buildInput(),
      ...(overrides.input ?? {}),
    },
    generationPurpose: 'initial',
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
  overrides: Partial<AttemptReservation> = {},
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
    generationPurpose: 'initial',
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
  }>,
): AiPlanGenerationProvider {
  return {
    generate: vi.fn().mockResolvedValue({
      stream: streamFromJson({ modules }),
      metadata: { model: 'gpt-4' },
    }),
    generateModuleLessonBatch: vi.fn().mockResolvedValue({
      stream: streamFromJson({ version: 1, tasks: [] }),
      metadata: { model: 'gpt-4' },
    }),
  };
}

function createDbHarness(params?: {
  reservation?: AttemptReservation | AttemptRejection;
}): {
  attemptOperations: AttemptOpsOverrides;
  dbClient: AttemptsDbClient;
  reserveAttemptSlotMock: ReturnType<typeof vi.fn<typeof reserveAttemptSlot>>;
} {
  const reservation = params?.reservation ?? buildReservation();
  const reserveAttemptSlotMock = vi
    .fn<typeof reserveAttemptSlot>()
    .mockResolvedValue(reservation);

  return {
    attemptOperations: {
      reserveAttemptSlot: reserveAttemptSlotMock,
    },
    dbClient: createAttemptsDbClientMock(),
    reserveAttemptSlotMock,
  };
}

describe('runGenerationExecution pacing', () => {
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

  it('applies pacing after parsing and returns unfinalized success', async () => {
    const context = buildContext();
    const provider = createProvider(parsedModules);
    const { attemptOperations, dbClient, reserveAttemptSlotMock } =
      createDbHarness();
    const options: RunGenerationOptions = {
      attemptOperations,
      provider,
      dbClient,
      timeoutConfig: { baseMs: 30_000, extensionMs: 10_000 },
      clock: () => Date.now(),
      now: () => new Date(),
    };

    const expectedPaced = pacePlan(parsedModules, context.input);
    const result = await runGenerationExecution(context, options);

    expect(result.kind).toBe('success');
    if (result.kind !== 'success') {
      throw new Error('Expected success result');
    }

    expect(result.modules).toEqual(expectedPaced);
    expect(result.metadata).toEqual({ model: 'gpt-4' });
    expect(reserveAttemptSlotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        generationPurpose: 'initial',
      }),
    );
  });

  it('fails closed when reserved purpose does not match context purpose', async () => {
    const context = buildContext({ generationPurpose: 'initial' });
    const reservation = buildReservation({
      generationPurpose: 'regeneration',
    });
    const provider = createProvider(parsedModules);
    const { attemptOperations, dbClient } = createDbHarness();

    await expect(
      runGenerationExecution(context, {
        attemptOperations,
        provider,
        dbClient,
        reservation,
        timeoutConfig: { baseMs: 30_000, extensionMs: 10_000 },
      }),
    ).rejects.toThrow(/does not match/);
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
    const { attemptOperations, dbClient } = createDbHarness();

    const result = await runGenerationExecution(context, {
      attemptOperations,
      provider,
      dbClient,
      timeoutConfig: { baseMs: 30_000, extensionMs: 10_000 },
    });

    expect(result.kind).toBe('success');
    if (result.kind !== 'success') {
      throw new Error('Expected success result');
    }
    const totalTasks = result.modules.reduce((sum, module) => {
      return sum + module.tasks.length;
    }, 0);
    expect(totalTasks).toBeLessThan(4);
  });

  it('maps in_progress reservation rejection to rate_limit classification', async () => {
    const context = buildContext();
    const provider = createProvider(parsedModules);
    const { attemptOperations, dbClient } = createDbHarness({
      reservation: {
        reserved: false,
        reason: 'in_progress',
      },
    });

    const result = await runGenerationExecution(context, {
      attemptOperations,
      provider,
      dbClient,
      timeoutConfig: { baseMs: 30_000, extensionMs: 10_000 },
    });

    expect(result.kind).toBe('failure_rejected');
    if (result.kind !== 'failure_rejected') {
      throw new Error('Expected rejection result');
    }
    expect(result.result.classification).toBe('rate_limit');
    expect(result.result.attempt.classification).toBe('rate_limit');
  });

  it('returns capped failure without parsing or pacing', async () => {
    const context = buildContext();
    const provider = createProvider(parsedModules);
    const { attemptOperations, dbClient } = createDbHarness({
      reservation: {
        reserved: false,
        reason: 'capped',
      },
    });

    const result = await runGenerationExecution(context, {
      attemptOperations,
      provider,
      dbClient,
      timeoutConfig: { baseMs: 30_000, extensionMs: 10_000 },
    });

    expect(result.kind).toBe('failure_rejected');
    if (result.kind !== 'failure_rejected') {
      throw new Error('Expected rejection result');
    }
    expect(result.result.classification).toBe('capped');
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('classifies ProviderTimeoutError as timed out without parsing', async () => {
    const context = buildContext();
    const provider: AiPlanGenerationProvider = {
      generate: vi.fn().mockRejectedValue(new ProviderTimeoutError('timeout')),
      generateModuleLessonBatch: vi.fn().mockResolvedValue({
        stream: streamFromJson({ version: 1, tasks: [] }),
        metadata: {},
      }),
    };
    const { attemptOperations, dbClient } = createDbHarness();

    const result = await runGenerationExecution(context, {
      attemptOperations,
      provider,
      dbClient,
      timeoutConfig: { baseMs: 30_000, extensionMs: 10_000 },
    });

    expect(result.kind).toBe('failure_reserved');
    if (result.kind !== 'failure_reserved') {
      throw new Error('Expected reserved failure result');
    }
    expect(result.classification).toBe('timeout');
    expect(result.timedOut).toBe(true);
  });

  it('keeps modules unchanged when no deadline is provided', async () => {
    const context = buildContext({
      input: buildInput({
        startDate: null,
        deadlineDate: null,
      }),
    });
    const provider = createProvider(parsedModules);
    const { attemptOperations, dbClient } = createDbHarness();

    const result = await runGenerationExecution(context, {
      attemptOperations,
      provider,
      dbClient,
      timeoutConfig: { baseMs: 30_000, extensionMs: 10_000 },
    });

    expect(result.kind).toBe('success');
    if (result.kind !== 'success') {
      throw new Error('Expected success result');
    }
    // pacePlan treats missing deadlines as "no trim", so orchestrator should return parsed modules as-is.
    expect(result.modules).toEqual(parsedModules);
  });
});
