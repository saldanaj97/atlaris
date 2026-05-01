import * as Sentry from '@sentry/nextjs';
import { ZodError } from 'zod';
import {
  createPlanGenerationSessionBoundary,
  type PlanGenerationSessionBoundary,
} from '@/features/plans/session/plan-generation-session';
import { createLearningPlanSchema } from '@/features/plans/validation/learningPlans';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';
import type { PlainHandler } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors';
import { parseJsonBody } from '@/lib/api/parse-json-body';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { serializeErrorForLog } from '@/lib/errors';
import { requestBoundary } from '@/lib/api/request-boundary';
import { type Logger, logger } from '@/lib/logging/logger';

type StreamRouteLogger = Pick<Logger, 'error' | 'info' | 'warn'>;

const defaultBoundary: PlanGenerationSessionBoundary =
  createPlanGenerationSessionBoundary();

function tryBuildPayloadLog(
  payload: unknown,
):
  | { ok: true; payloadLog: Record<string, unknown> }
  | { ok: false; error: unknown; fallback: Record<string, unknown> } {
  try {
    // Payload logging must not break generation when unusual getters/proxies throw.
    return { ok: true, payloadLog: toPayloadLog(payload) };
  } catch (error) {
    return {
      ok: false,
      error,
      fallback: { payloadType: typeof payload },
    };
  }
}

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

/**
 * Creates the stream POST handler with optional dependency overrides.
 *
 * Tests inject a fake `boundary` (typically built via
 * `createPlanGenerationSessionBoundary({ createLifecycleService })`) to swap
 * the lifecycle service under the boundary; production uses the default
 * boundary singleton.
 */
export function createStreamHandler(deps?: {
  boundary?: PlanGenerationSessionBoundary;
  logger?: StreamRouteLogger;
}): PlainHandler {
  const routeLogger = deps?.logger ?? logger;
  const boundary = deps?.boundary ?? defaultBoundary;

  return requestBoundary.route(
    { rateLimit: 'aiGeneration' },
    async ({ req, actor, db, correlationId }) => {
      const authUserId = actor.authUserId;

      routeLogger.info({ authUserId }, 'Plan stream handler entered');

      const parsedBody = await parseJsonBody(req, {
        mode: 'required',
        onMalformedJson: (error) =>
          new ValidationError(
            'Invalid request body.',
            { reason: 'Malformed or invalid JSON payload.' },
            { authUserId, error: serializeErrorForLog(error) },
          ),
      });

      const payloadLogResult = tryBuildPayloadLog(parsedBody);
      if (payloadLogResult.ok) {
        routeLogger.info(
          { authUserId, payload: payloadLogResult.payloadLog },
          'Plan stream request payload received',
        );
      } else {
        const { error, fallback } = payloadLogResult;
        routeLogger.warn(
          {
            authUserId,
            error: serializeErrorForLog(error),
            payload: fallback,
          },
          'Plan stream payload log failed',
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
              authUserId,
              payload: fallback,
            },
          },
        );
      }

      let body: CreateLearningPlanInput;
      try {
        body = createLearningPlanSchema.parse(parsedBody);
      } catch (error) {
        if (error instanceof ZodError) {
          const validation = error.flatten();
          throw new ValidationError('Invalid request body.', validation, {
            authUserId,
            validation,
          });
        }
        throw new ValidationError(
          'Invalid request body.',
          { reason: 'Malformed or invalid JSON payload.' },
          { authUserId, error: serializeErrorForLog(error) },
        );
      }

      const internalUserId = actor.id;

      const rateLimit = await checkPlanGenerationRateLimit(internalUserId, db);
      const generationRateLimitHeaders =
        getPlanGenerationRateLimitHeaders(rateLimit);

      routeLogger.info(
        { authUserId },
        'Delegating plan stream request to generation session',
      );

      return await boundary.respondCreateStream({
        req,
        authUserId,
        internalUserId,
        body,
        savedPreferredAiModel: actor.preferredAiModel ?? null,
        responseHeaders: generationRateLimitHeaders,
        requestId: correlationId,
      });
    },
  );
}

export const POST = createStreamHandler();
