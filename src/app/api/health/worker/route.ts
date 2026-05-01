import { NextResponse } from 'next/server';

import { toErrorResponse } from '@/lib/api/errors';
import {
  STUCK_JOB_THRESHOLD_MS,
  buildHealthyWorkerHealthBody,
  buildWorkerHealthMonitoringErrorBody,
} from '@/lib/api/health/worker-health-checks';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { getSystemWideJobMetrics } from '@/lib/db/queries/admin/jobs-metrics';
import { logger } from '@/lib/logging/logger';

export async function GET(request: Request): Promise<Response> {
  try {
    checkIpRateLimit(request, 'health');
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
    logger.error({ error }, 'Health worker check failed');

    return NextResponse.json(buildWorkerHealthMonitoringErrorBody(timestamp), {
      status: 503,
    });
  }
}
