import { timingSafeEqual } from 'node:crypto';

import { type PlainHandler, withErrorBoundary } from '@/lib/api/auth';
import { AppError, AuthError, ServiceUnavailableError } from '@/lib/api/errors';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { json } from '@/lib/api/response';
import { appEnv, regenerationQueueEnv } from '@/lib/config/env';
import { drainRegenerationQueue } from '@/lib/jobs/regeneration-worker';
import getRequestContext from '@/lib/logging/request-context';

function readWorkerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  return request.headers.get('x-regeneration-worker-token');
}

function tokensMatch(expectedToken: string, providedToken: string): boolean {
  const expected = Buffer.from(expectedToken);
  const provided = Buffer.from(providedToken);

  const lengthMatch = provided.length === expected.length;
  const paddedProvided = lengthMatch
    ? provided
    : provided.length > expected.length
      ? provided.subarray(0, expected.length)
      : Buffer.concat([
          provided,
          Buffer.alloc(expected.length - provided.length),
        ]);
  const matched = timingSafeEqual(expected, paddedProvided);

  return Boolean(Number(lengthMatch) & Number(matched));
}

export const POST: PlainHandler = withErrorBoundary(async (request) => {
  const { logger } = getRequestContext(request);
  const pathname = new URL(request.url).pathname;

  checkIpRateLimit(request, 'internal');

  if (!regenerationQueueEnv.enabled) {
    throw new ServiceUnavailableError(
      'Regeneration processing is currently unavailable.'
    );
  }

  const expectedToken = regenerationQueueEnv.workerToken;
  if (expectedToken) {
    const providedToken = readWorkerToken(request);
    if (!providedToken || !tokensMatch(expectedToken, providedToken)) {
      logger.warn(
        {
          path: pathname,
          method: request.method,
          hasToken: Boolean(providedToken),
        },
        'Unauthorized regeneration worker trigger attempt'
      );

      throw new AuthError('Unauthorized worker trigger.');
    }
  } else if (appEnv.isProduction) {
    logger.error(
      { path: pathname, method: request.method },
      'Regeneration worker token missing in production'
    );

    throw new ServiceUnavailableError(
      'Regeneration processing is currently unavailable.'
    );
  }

  const maxJobs = regenerationQueueEnv.maxJobsPerDrain;

  try {
    logger.info({ maxJobs }, 'Starting regeneration queue drain');

    const drained = await drainRegenerationQueue({ maxJobs });

    logger.info({ maxJobs, drained }, 'Completed regeneration queue drain');

    return json({ ok: true, ...drained });
  } catch (error: unknown) {
    logger.error(
      { error, maxJobs },
      'Failed to drain regeneration queue from internal route'
    );

    const diagnostic =
      error == null
        ? undefined
        : error instanceof AppError
          ? error.message
          : error instanceof Error
            ? error.message
            : undefined;

    throw new AppError('Failed to drain regeneration queue', {
      status: 500,
      code: 'REGENERATION_DRAIN_FAILED',
      ...(diagnostic !== undefined && {
        details: { cause: diagnostic },
      }),
    });
  }
});
