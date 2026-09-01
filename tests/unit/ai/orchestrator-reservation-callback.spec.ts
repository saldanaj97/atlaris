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
import { createDeferredPromise } from '@tests/helpers/deferred-promise';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AttemptOperationsOverrides = {
  reserveAttemptSlot: typeof reserveAttemptSlot;
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
    generationPurpose: 'initial',
  };
}

describe('runGenerationExecution reservation seam', () => {
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
    const callbackStarted = createDeferredPromise<void>();
    const callbackGate = createDeferredPromise<void>();
    const onAttemptReserved = vi.fn(async () => {
      order.push('reserved_callback');
      callbackStarted.resolve(undefined);
      await callbackGate.promise;
      order.push('callback_resolved');
    });
    const provider = createProvider(() => {
      order.push('provider');
    });

    const reserveSpy = vi.fn().mockImplementation(async () => {
      order.push('reserve');
      return reserved;
    }) as typeof reserveAttemptSlot;

    const attemptOperations: AttemptOperationsOverrides = {
      reserveAttemptSlot: reserveSpy,
    };

    const generation = runGenerationExecution(
      {
        planId,
        userId,
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
        allowedGenerationStatuses: ['failed', 'pending_retry'],
        onAttemptReserved,
      },
    );

    await callbackStarted.promise;
    expect(order).toEqual(['reserve', 'reserved_callback']);
    expect(onAttemptReserved).toHaveBeenCalledWith(reserved);
    callbackGate.resolve(undefined);
    const result = await generation;

    expect(result.kind).toBe('success');
    expect(order).toEqual([
      'reserve',
      'reserved_callback',
      'callback_resolved',
      'provider',
    ]);
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
    };

    const result = await runGenerationExecution(
      {
        planId: createId('plan'),
        userId: createId('user'),
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
        onAttemptReserved,
      },
    );

    expect(result.kind).toBe('failure_rejected');
    if (result.kind === 'failure_rejected') {
      expect(result.result.reservationRejectionReason).toBe('in_progress');
    }
    expect(onAttemptReserved).not.toHaveBeenCalled();
  });

  it('returns unfinalized reserved failure when onAttemptReserved throws after reservation', async () => {
    const planId = createId('plan');
    const userId = createId('user');
    const onAttemptReserved = vi.fn(() => {
      throw new Error('callback boom');
    });
    const generate = vi.fn();
    const provider = createProvider(generate);

    const attemptOperations: AttemptOperationsOverrides = {
      reserveAttemptSlot: vi
        .fn()
        .mockResolvedValue(reserved) as typeof reserveAttemptSlot,
    };

    const result = await runGenerationExecution(
      {
        planId,
        userId,
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
        onAttemptReserved,
      },
    );

    expect(result.kind).toBe('failure_reserved');
    if (result.kind !== 'failure_reserved') {
      throw new Error('Expected reserved failure');
    }
    expect(result.reservation.attemptId).toBe(reserved.attemptId);
    expect(result.error.message).toBe('callback boom');
    expect(generate).not.toHaveBeenCalled();
  });
});
