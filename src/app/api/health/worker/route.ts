import { toErrorResponse } from '@/lib/api/errors';
import {
  STUCK_JOB_THRESHOLD_MS,
  buildHealthyWorkerHealthBody,
  buildWorkerHealthMonitoringErrorBody,
} from '@/lib/api/health/worker-health-checks';
import { assertInternalWorkerAccess } from '@/lib/api/internal/internal-worker-access';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { maintenanceEnv } from '@/lib/config/env';
import { EnvValidationError } from '@/lib/config/env/shared';
import { getSystemWideJobMetrics } from '@/lib/db/queries/admin/jobs-metrics';
import { getLoggingRequestContext } from '@/lib/logging/request-context';
import { NextResponse } from 'next/server';

const WORKER_HEALTH_HEADER = 'x-worker-health-token';

function resolveWorkerHealthToken(): string | undefined {
  try {
    return maintenanceEnv.workerHealthToken;
  } catch (error) {
    if (
      error instanceof EnvValidationError &&
      error.envKey === 'WORKER_HEALTH_TOKEN'
    ) {
      return undefined;
    }
    throw error;
  }
}

export async function GET(request: Request): Promise<Response> {
  const { logger: requestLogger } = getLoggingRequestContext(request);
  const pathname = new URL(request.url).pathname;

  try {
    checkIpRateLimit(request, 'health');
    assertInternalWorkerAccess({
      request,
      pathname,
      logger: requestLogger,
      enabled: true,
      workerToken: resolveWorkerHealthToken(),
      headerName: WORKER_HEALTH_HEADER,
      unavailableMessage: 'Worker health check is currently unavailable.',
      unauthorizedLogMessage: 'Unauthorized worker health check attempt',
      missingWorkerTokenLogMessage: 'Worker health token missing in production',
    });
  } catch (error) {
    return toErrorResponse(error);
  }

  const timestamp = new Date().toISOString();
  const stuckThreshold = new Date(Date.now() - STUCK_JOB_THRESHOLD_MS);

  try {
    const metrics = await getSystemWideJobMetrics(stuckThreshold);

    const { body, httpStatus } = buildHealthyWorkerHealthBody(
      timestamp,
      metrics,
    );

    return NextResponse.json(body, {
      status: httpStatus,
    });
  } catch (error) {
    requestLogger.error({ error }, 'Health worker check failed');

    return NextResponse.json(buildWorkerHealthMonitoringErrorBody(timestamp), {
      status: 503,
    });
  }
}
