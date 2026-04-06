import {
  buildPlanStartEvent,
  executeLifecycleGenerationStream,
} from '@/app/api/v1/plans/stream/helpers';
import {
  createEventStream,
  streamHeaders,
} from '@/features/ai/streaming/events';
import type {
  GenerationAttemptResult,
  ProcessGenerationInput,
} from '@/features/plans/lifecycle';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';
import { appEnv } from '@/lib/config/env';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';
import { getDb } from '@/lib/db/runtime';
import { logger } from '@/lib/logging/logger';
import type { FailureClassification } from '@/shared/types/client.types';

// Streamed plan generation can legitimately hold the dedicated RLS connection
// open for a few minutes while AI output is produced and persisted.
const RLS_IDLE_TIMEOUT_SECONDS = 180;

export async function createStreamDbClient(authUserId: string): Promise<{
  dbClient: AttemptsDbClient;
  cleanup: () => Promise<void>;
}> {
  if (appEnv.isTest) {
    return {
      dbClient: getDb(),
      cleanup: async () => {},
    };
  }

  const { createAuthenticatedRlsClient } = await import('@/lib/db/rls');
  const { db, cleanup } = await createAuthenticatedRlsClient(authUserId, {
    idleTimeout: RLS_IDLE_TIMEOUT_SECONDS,
  });

  return {
    dbClient: db,
    cleanup,
  };
}

export interface CreatePlanGenerationSessionResponseParams {
  req: Request;
  authUserId: string;
  dbClient: AttemptsDbClient;
  cleanup: () => Promise<void>;
  planId: string;
  attemptNumber?: number;
  planStartInput: CreateLearningPlanInput;
  generationInput: ProcessGenerationInput;
  processGeneration: (
    input: ProcessGenerationInput
  ) => Promise<GenerationAttemptResult>;
  onUnhandledError: (
    error: unknown,
    startedAt: number,
    dbClient: AttemptsDbClient
  ) => Promise<void>;
  fallbackClassification?: FailureClassification | 'unknown';
  headers?: HeadersInit;
}

export async function createPlanGenerationSessionResponse({
  req,
  authUserId,
  dbClient,
  cleanup,
  planId,
  attemptNumber = 1,
  planStartInput,
  generationInput,
  processGeneration,
  onUnhandledError,
  fallbackClassification = 'provider_error',
  headers,
}: CreatePlanGenerationSessionResponseParams): Promise<Response> {
  let closed = false;
  const closeStreamDb = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    try {
      await cleanup();
    } catch (error) {
      logger.error({ authUserId, error }, 'Failed to close stream DB client');
    }
  };

  try {
    const stream = createEventStream(
      async (emit, _controller, streamContext) => {
        try {
          emit(
            buildPlanStartEvent({
              planId,
              attemptNumber,
              input: planStartInput,
            })
          );

          await executeLifecycleGenerationStream({
            reqSignal: req.signal,
            streamSignal: streamContext.signal,
            planId,
            userId: authUserId,
            emit,
            processGeneration: () => processGeneration(generationInput),
            onUnhandledError: async (error, startedAt) => {
              await onUnhandledError(error, startedAt, dbClient);
            },
            fallbackClassification,
          });
        } finally {
          await closeStreamDb();
        }
      }
    );

    return new Response(stream, {
      status: 200,
      headers: {
        ...streamHeaders,
        ...headers,
      },
    });
  } catch (error) {
    await closeStreamDb();
    throw error;
  }
}
