import * as Sentry from '@sentry/nextjs';
import { ZodError } from 'zod';
import {
  createAndStreamPlanGenerationSession,
  type PlanGenerationHandlerOverrides,
} from '@/features/plans/session/plan-generation-session';
import { createLearningPlanSchema } from '@/features/plans/validation/learningPlans';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';
import type { PlainHandler } from '@/lib/api/auth';
import { withAuthAndRateLimit } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import { parseJsonBody } from '@/lib/api/parse-json-body';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { getDb } from '@/lib/db/runtime';
import { type Logger, logger } from '@/lib/logging/logger';

type StreamRouteLogger = Pick<Logger, 'error' | 'info' | 'warn'>;

/**
 * Creates the stream POST handler with optional dependency overrides.
 * Used by integration tests to supply mocks; production uses the default lifecycle service.
 */
export function createStreamHandler(deps?: {
  overrides?: PlanGenerationHandlerOverrides;
  logger?: StreamRouteLogger;
}): PlainHandler {
  const routeLogger = deps?.logger ?? logger;

  return withErrorBoundary(
    withAuthAndRateLimit(
      'aiGeneration',
      async ({ req, userId, user: currentUser }) => {
        routeLogger.info({ authUserId: userId }, 'Plan stream handler entered');

        const parsedBody = await parseJsonBody(req, {
          mode: 'required',
          onMalformedJson: (error) =>
            new ValidationError(
              'Invalid request body.',
              { reason: 'Malformed or invalid JSON payload.' },
              { authUserId: userId, error: serializeError(error) }
            ),
        });

        let payloadLog: Record<string, unknown> | null = null;
        try {
          payloadLog = toPayloadLog(parsedBody);
        } catch (error) {
          const payload = toBestEffortPayloadLog(parsedBody);
          routeLogger.warn(
            {
              authUserId: userId,
              error: serializeError(error),
              payload,
            },
            'Plan stream payload log failed'
          );
          Sentry.captureException(
            error instanceof Error ? error : new Error(String(error)),
            {
              level: 'warning',
              tags: {
                route: 'plans-stream',
                source: 'payload-log',
              },
              extra: {
                authUserId: userId,
                payload,
              },
            }
          );
        }
        if (payloadLog) {
          routeLogger.info(
            { authUserId: userId, payload: payloadLog },
            'Plan stream request payload received'
          );
        }

        let body: CreateLearningPlanInput;
        try {
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

        routeLogger.info(
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

function toBestEffortPayloadLog(payload: unknown): Record<string, unknown> {
  return {
    payloadType: typeof payload,
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
