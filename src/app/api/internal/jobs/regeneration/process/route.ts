import { drainRegenerationQueue } from '@/features/jobs/regeneration-worker';
import type { PlainHandler } from '@/lib/api/auth';
import { AppError } from '@/lib/api/errors';
import { assertInternalWorkerAccess } from '@/lib/api/internal/internal-worker-access';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { withErrorBoundary } from '@/lib/api/route-wrappers';
import { json } from '@/lib/api/response';
import { regenerationQueueEnv } from '@/lib/config/env';
import { getLoggingRequestContext } from '@/lib/logging/request-context';

const REGENERATION_WORKER_HEADER = 'x-regeneration-worker-token';

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

  assertInternalWorkerAccess({
    request,
    pathname,
    logger,
    enabled: regenerationQueueEnv.enabled,
    workerToken: regenerationQueueEnv.workerToken,
    headerName: REGENERATION_WORKER_HEADER,
    unavailableMessage: 'Regeneration processing is currently unavailable.',
    unauthorizedLogMessage: 'Unauthorized regeneration worker trigger attempt',
    missingWorkerTokenLogMessage:
      'Regeneration worker token missing in production',
  });

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
