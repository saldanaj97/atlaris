import {
  createEventStream,
  streamHeaders,
} from '@/features/ai/streaming/events';
import { logger } from '@/lib/logging/logger';

import type {
  GenerationAttemptResult,
  ProcessGenerationInput,
} from '@/features/plans/lifecycle/types';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';
import type {
  AttemptReservation,
  AttemptsDbClient,
} from '@/lib/db/queries/types/attempts.types';

import type { PreparedSessionPlan } from './session-command';
import {
  buildPlanStartEvent,
  executeLifecycleGenerationStream,
} from './stream-emitters';

export interface RunPlanGenerationSessionStreamParams {
  requestSignal: AbortSignal;
  /** Correlation id for SSE `error.requestId`; omit when unknown. */
  requestId?: string;
  authUserId: string;
  dbClient: AttemptsDbClient;
  cleanup: () => Promise<void>;
  prepared: PreparedSessionPlan;
  processGeneration: (
    input: ProcessGenerationInput,
  ) => Promise<GenerationAttemptResult>;
  responseHeaders?: HeadersInit;
}

function withPlanStartOnReservation({
  generationInput,
  planId,
  planStartInput,
  emit,
}: {
  generationInput: ProcessGenerationInput;
  planId: string;
  planStartInput: CreateLearningPlanInput;
  emit: (event: ReturnType<typeof buildPlanStartEvent>) => void;
}): ProcessGenerationInput {
  let planStartEmitted = false;

  return {
    ...generationInput,
    onAttemptReserved: (reservation: AttemptReservation) => {
      if (planStartEmitted) {
        logger.warn(
          {
            planId,
            attemptId: reservation.attemptId,
            attemptNumber: reservation.attemptNumber,
          },
          'plan_start reservation callback invoked more than once; ignoring duplicate',
        );
        return;
      }

      planStartEmitted = true;
      emit(
        buildPlanStartEvent({
          planId,
          attemptNumber: reservation.attemptNumber,
          input: planStartInput,
        }),
      );
    },
  };
}

export async function runPlanGenerationSessionStream({
  requestSignal,
  requestId,
  authUserId,
  dbClient,
  cleanup,
  prepared,
  processGeneration,
  responseHeaders,
}: RunPlanGenerationSessionStreamParams): Promise<Response> {
  try {
    const stream = createEventStream(
      async (emit, _controller, streamContext) => {
        const generationInputWithReservation = withPlanStartOnReservation({
          generationInput: prepared.generationInput,
          planId: prepared.planId,
          planStartInput: prepared.planStartInput,
          emit,
        });

        try {
          await executeLifecycleGenerationStream({
            reqSignal: requestSignal,
            streamSignal: streamContext.signal,
            planId: prepared.planId,
            userId: authUserId,
            emit,
            processGeneration: () =>
              processGeneration(generationInputWithReservation),
            onUnhandledError: async (error, startedAt) => {
              await prepared.onUnhandledError(error, startedAt, dbClient);
            },
            fallbackClassification: prepared.fallbackClassification,
            requestId,
          });
        } finally {
          try {
            await cleanup();
          } catch (cleanupError) {
            logger.error(
              { authUserId, planId: prepared.planId, err: cleanupError },
              'plan generation stream cleanup failed after stream',
            );
          }
        }
      },
    );

    return new Response(stream, {
      status: 200,
      headers: {
        ...streamHeaders,
        ...responseHeaders,
      },
    });
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      logger.error(
        { authUserId, planId: prepared.planId, err: cleanupError },
        'plan generation stream cleanup failed after outer error',
      );
    }
    throw error;
  }
}
