import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type {
  CreatePlanResult,
  GenerationAttemptResult,
  ProcessGenerationInput,
} from '@/features/plans/lifecycle/types';
import type { AttemptReservation } from '@/lib/db/queries/types/attempts.types';
import { vi } from 'vitest';

export interface MockProcessLifecycleHandle {
  service: PlanLifecycleService;
  processGenerationAttempt: ReturnType<typeof vi.fn>;
}

export interface MockCreateLifecycleHandle extends MockProcessLifecycleHandle {
  createPlan: ReturnType<typeof vi.fn>;
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
  createResult: CreatePlanResult;
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
