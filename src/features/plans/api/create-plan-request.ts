import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';
import type { Logger } from '@/lib/logging/logger';

import { createLearningPlanSchema } from '@/features/plans/validation/learningPlans';
import { ValidationError } from '@/lib/api/errors';
import { parseJsonBody } from '@/lib/api/parse-json-body';
import { serializeErrorForLog } from '@/lib/errors';
import * as Sentry from '@sentry/nextjs';
import { ZodError } from 'zod';

export type CreatePlanRouteLogger = Pick<Logger, 'error' | 'info' | 'warn'>;

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
    hasTopic:
      typeof maybePayload.topic === 'string' && maybePayload.topic.length > 0,
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
 * Reads and validates a create-plan JSON body for `POST /api/v1/plans`. Logs
 * structural payload metadata only (never the topic or notes).
 *
 * @param logPrefix Leads the log messages, e.g. `Plan create`.
 * @param sentryRoute The Sentry `route` tag when the payload log fails.
 * @throws ValidationError for malformed JSON or an invalid body.
 */
export async function parseCreatePlanRequest({
  req,
  authUserId,
  correlationId,
  logger,
  logPrefix,
  sentryRoute,
}: {
  req: Request;
  authUserId: string;
  correlationId: string;
  logger: CreatePlanRouteLogger;
  logPrefix: string;
  sentryRoute: string;
}): Promise<CreateLearningPlanInput> {
  const parsedBody = await parseJsonBody(req, {
    mode: 'required',
    onMalformedJson: (error) =>
      new ValidationError(
        'Invalid request body.',
        { reason: 'Malformed or invalid JSON payload.' },
        { authUserId, error: serializeErrorForLog(error) },
      ),
    maxBytes: 1 * 1024 * 1024,
  });

  const payloadLogResult = tryBuildPayloadLog(parsedBody);
  if (payloadLogResult.ok) {
    logger.info(
      { authUserId, correlationId, payload: payloadLogResult.payloadLog },
      `${logPrefix} request payload received`,
    );
  } else {
    const { error, fallback } = payloadLogResult;
    logger.warn(
      {
        authUserId,
        correlationId,
        error: serializeErrorForLog(error),
        payload: fallback,
      },
      `${logPrefix} payload log failed`,
    );
    Sentry.captureException(
      error instanceof Error ? error : new Error(String(error)),
      {
        level: 'warning',
        tags: {
          route: sentryRoute,
          source: 'payload-log',
        },
        extra: {
          authUserId,
          payload: fallback,
        },
      },
    );
  }

  try {
    return createLearningPlanSchema.parse(parsedBody);
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
}
