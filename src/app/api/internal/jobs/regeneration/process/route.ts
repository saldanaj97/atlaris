import { drainRegenerationQueue } from '@/features/jobs/regeneration-worker';
import type { PlainHandler } from '@/lib/api/auth';
import { AppError, AuthError, ServiceUnavailableError } from '@/lib/api/errors';
import {
  readWorkerToken,
  tokensMatch,
} from '@/lib/api/internal/regeneration-worker-token';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { withErrorBoundary } from '@/lib/api/route-wrappers';
import { json } from '@/lib/api/response';
import { appEnv, regenerationQueueEnv } from '@/lib/config/env';
import { getLoggingRequestContext } from '@/lib/logging/request-context';

function regenerationDrainFailureDiagnostic(
  error: unknown,
): string | undefined {
  if (error == null) {
    return undefined;
  }
  if (error instanceof AppError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return undefined;
}

export const POST: PlainHandler = withErrorBoundary(async (request) => {
  const { logger } = getLoggingRequestContext(request);
  const pathname = new URL(request.url).pathname;

  checkIpRateLimit(request, 'internal');

  if (!regenerationQueueEnv.enabled) {
    throw new ServiceUnavailableError(
      'Regeneration processing is currently unavailable.',
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
        'Unauthorized regeneration worker trigger attempt',
      );

      throw new AuthError('Unauthorized worker trigger.');
    }
  } else if (appEnv.isProduction) {
    logger.error(
      { path: pathname, method: request.method },
      'Regeneration worker token missing in production',
    );

    throw new ServiceUnavailableError(
      'Regeneration processing is currently unavailable.',
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
      'Failed to drain regeneration queue from internal route',
    );

    const diagnostic = regenerationDrainFailureDiagnostic(error);

    throw new AppError('Failed to drain regeneration queue', {
      status: 500,
      code: 'REGENERATION_DRAIN_FAILED',
      ...(diagnostic !== undefined && {
        details: { cause: diagnostic },
      }),
    });
  }
});
