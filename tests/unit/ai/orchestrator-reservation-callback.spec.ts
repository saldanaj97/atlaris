import { makeAttemptsDbClient } from '@tests/fixtures/db-mocks';
import { createId } from '@tests/fixtures/ids';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runGenerationAttempt } from '@/features/ai/orchestrator';
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
import type { AttemptReservation } from '@/lib/db/queries/types/attempts.types';

type AttemptOperationsOverrides = {
  reserveAttemptSlot: typeof reserveAttemptSlot;
  finalizeAttemptSuccess: typeof finalizeAttemptSuccess;
  finalizeAttemptFailure: typeof finalizeAttemptFailure;
};

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

function buildReservedAttempt(attemptNumber: number): AttemptReservation {
  return {
    reserved: true,
    attemptId: createId('attempt'),
    attemptNumber,
    startedAt: new Date('2026-02-12T00:00:00.000Z'),
    sanitized: {
      topic: { value: 'TypeScript', truncated: false, originalLength: 10 },
      notes: { value: undefined, truncated: false },
    },
    promptHash: createId('hash'),
  };
}

describe('runGenerationAttempt reservation seam', () => {
  let mockDbClient: ReturnType<typeof makeAttemptsDbClient>;
  let reserved: AttemptReservation;

  beforeEach(() => {
    mockDbClient = makeAttemptsDbClient();
    reserved = buildReservedAttempt(2);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('invokes onAttemptReserved after reservation and before provider generate', async () => {
    const planId = createId('plan');
    const userId = createId('user');
    const order: string[] = [];
    const onAttemptReserved = vi.fn(() => {
      order.push('reserved_callback');
    });
    const provider = createProvider(() => {
      order.push('provider');
    });

    const reserveSpy = vi.fn().mockImplementation(async () => {
      order.push('reserve');
      return reserved;
    }) as typeof reserveAttemptSlot;

    const successRecord = {
      id: reserved.attemptId,
      planId,
      status: 'success',
      classification: null,
      durationMs: 100,
      modulesCount: 1,
      tasksCount: 1,
      truncatedTopic: false,
      truncatedNotes: false,
      normalizedEffort: false,
      promptHash: reserved.promptHash,
      metadata: null,
      createdAt: new Date(),
    };

    const attemptOperations: AttemptOperationsOverrides = {
      reserveAttemptSlot: reserveSpy,
      finalizeAttemptSuccess: vi
        .fn()
        .mockResolvedValue(successRecord) as typeof finalizeAttemptSuccess,
      finalizeAttemptFailure: vi.fn().mockResolvedValue({
        ...successRecord,
        status: 'failure',
        classification: 'provider_error',
        modulesCount: 0,
        tasksCount: 0,
      }) as typeof finalizeAttemptFailure,
    };

    await runGenerationAttempt(
      {
        planId,
        userId,
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
        allowedGenerationStatuses: ['failed', 'pending_retry'],
        onAttemptReserved,
      },
    );

    expect(order).toEqual(['reserve', 'reserved_callback', 'provider']);
    expect(onAttemptReserved).toHaveBeenCalledWith(reserved);
    expect(reserveSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        planId,
        userId,
        allowedGenerationStatuses: ['failed', 'pending_retry'],
      }),
    );
  });

  it('does not invoke onAttemptReserved when reservation rejects', async () => {
    const onAttemptReserved = vi.fn();
    const attemptOperations: AttemptOperationsOverrides = {
      reserveAttemptSlot: vi.fn().mockResolvedValue({
        reserved: false,
        reason: 'in_progress',
      }) as typeof reserveAttemptSlot,
      finalizeAttemptSuccess: vi
        .fn()
        .mockResolvedValue({}) as typeof finalizeAttemptSuccess,
      finalizeAttemptFailure: vi
        .fn()
        .mockResolvedValue({}) as typeof finalizeAttemptFailure,
    };

    const result = await runGenerationAttempt(
      {
        planId: createId('plan'),
        userId: createId('user'),
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
        onAttemptReserved,
      },
    );

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.reservationRejectionReason).toBe('in_progress');
    }
    expect(onAttemptReserved).not.toHaveBeenCalled();
  });

  it('finalizes failure when onAttemptReserved throws after reservation', async () => {
    const planId = createId('plan');
    const userId = createId('user');
    const onAttemptReserved = vi.fn(() => {
      throw new Error('callback boom');
    });
    const provider = createProvider(() => {});

    const failureRecord = {
      id: reserved.attemptId,
      planId,
      status: 'failure' as const,
      classification: 'provider_error' as const,
      durationMs: 1,
      modulesCount: 0,
      tasksCount: 0,
      truncatedTopic: false,
      truncatedNotes: false,
      normalizedEffort: false,
      promptHash: reserved.promptHash,
      metadata: null,
      createdAt: new Date(),
    };

    const attemptOperations: AttemptOperationsOverrides = {
      reserveAttemptSlot: vi
        .fn()
        .mockResolvedValue(reserved) as typeof reserveAttemptSlot,
      finalizeAttemptSuccess: vi
        .fn()
        .mockResolvedValue({}) as typeof finalizeAttemptSuccess,
      finalizeAttemptFailure: vi
        .fn()
        .mockResolvedValue(failureRecord) as typeof finalizeAttemptFailure,
    };

    const result = await runGenerationAttempt(
      {
        planId,
        userId,
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
        onAttemptReserved,
      },
    );

    expect(result.status).toBe('failure');
    expect(
      vi.mocked(attemptOperations.finalizeAttemptFailure),
    ).toHaveBeenCalled();
    expect(
      vi.mocked(attemptOperations.finalizeAttemptSuccess),
    ).not.toHaveBeenCalled();
  });
});
