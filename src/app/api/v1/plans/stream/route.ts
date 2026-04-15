import { ZodError } from 'zod';
import type {
  GenerationAttemptResult,
  ProcessGenerationInput,
} from '@/features/plans/lifecycle';
import { createAndStreamPlanGenerationSession } from '@/features/plans/session/plan-generation-session';
import { createLearningPlanSchema } from '@/features/plans/validation/learningPlans';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';
import type { PlainHandler } from '@/lib/api/auth';
import { withAuthAndRateLimit } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { getDb } from '@/lib/db/runtime';
import { logger } from '@/lib/logging/logger';

/**
 * Dependency injection interface for tests.
 * Tests can override `processGenerationAttempt` to inject mocked generation behavior.
 */
export interface StreamDependencyOverrides {
  processGenerationAttempt?: (
    input: ProcessGenerationInput
  ) => Promise<GenerationAttemptResult>;
}

/**
 * Creates the stream POST handler with optional dependency overrides.
 * Used by integration tests to supply mocks; production uses the default lifecycle service.
 */
export function createStreamHandler(deps?: {
  overrides?: StreamDependencyOverrides;
}): PlainHandler {
  return withErrorBoundary(
    withAuthAndRateLimit(
      'aiGeneration',
      async ({ req, userId, user: currentUser }) => {
        logger.info({ authUserId: userId }, 'Plan stream handler entered');

        let body: CreateLearningPlanInput;
        try {
          const parsedBody: unknown = await req.json();
          logger.info(
            {
              authUserId: userId,
              payload: toPayloadLog(parsedBody),
            },
            'Plan stream request payload received'
          );
          body = createLearningPlanSchema.parse(parsedBody);
        } catch (error) {
          if (error instanceof ZodError) {
            throw new ValidationError(
              'Invalid request body.',
              error.flatten(),
              { authUserId: userId, validation: error.flatten() }
            );
          }
          throw new ValidationError(
            'Invalid request body.',
            { reason: 'Malformed or invalid JSON payload.' },
            { authUserId: userId, error: serializeError(error) }
          );
        }

        const db = getDb();
        const internalUserId = currentUser.id;

        // ─── Rate limiting (generation-specific, checked BEFORE plan creation) ──
        const rateLimit = await checkPlanGenerationRateLimit(
          internalUserId,
          db
        );
        const generationRateLimitHeaders =
          getPlanGenerationRateLimitHeaders(rateLimit);

        logger.info(
          { authUserId: userId },
          'Delegating plan stream request to generation session'
        );

        return await createAndStreamPlanGenerationSession({
          req,
          authUserId: userId,
          userId: internalUserId,
          body,
          savedPreferredAiModel: currentUser.preferredAiModel ?? null,
          processGenerationAttempt: deps?.overrides?.processGenerationAttempt,
          headers: generationRateLimitHeaders,
        });
      }
    )
  );
}

export const POST = createStreamHandler();

function toPayloadLog(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') {
    return { payloadType: typeof payload };
  }

  const maybePayload = payload as Partial<CreateLearningPlanInput> & {
    notes?: unknown;
    extractedContent?: unknown;
  };

  return {
    topic: typeof maybePayload.topic === 'string' ? maybePayload.topic : null,
    skillLevel:
      typeof maybePayload.skillLevel === 'string'
        ? maybePayload.skillLevel
        : null,
    weeklyHours:
      typeof maybePayload.weeklyHours === 'number'
        ? maybePayload.weeklyHours
        : null,
    learningStyle:
      typeof maybePayload.learningStyle === 'string'
        ? maybePayload.learningStyle
        : null,
    visibility:
      typeof maybePayload.visibility === 'string'
        ? maybePayload.visibility
        : null,
    origin:
      typeof maybePayload.origin === 'string' ? maybePayload.origin : null,
    hasNotes:
      typeof maybePayload.notes === 'string' && maybePayload.notes.length > 0,
    hasExtractedContent:
      typeof maybePayload.extractedContent === 'object' &&
      maybePayload.extractedContent !== null,
  };
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    value: String(error),
  };
}
