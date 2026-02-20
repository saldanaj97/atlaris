import { NextResponse } from 'next/server';

import { toErrorResponse } from '@/lib/api/errors';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { getSystemWideJobMetrics } from '@/lib/db/queries/jobs';
import { logger } from '@/lib/logging/logger';

const STUCK_JOB_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const BACKLOG_THRESHOLD = 100; // pending jobs threshold

interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  checks: {
    stuckJobs: {
      status: 'ok' | 'fail';
      count: number;
      threshold: number;
    };
    backlog: {
      status: 'ok' | 'fail';
      count: number;
      threshold: number;
    };
    regeneration: {
      status: 'ok' | 'fail';
      pendingCount: number;
      stuckProcessingCount: number;
      threshold: number;
    };
  };
  reason?: string;
}

export async function GET(request: Request): Promise<Response> {
  try {
    checkIpRateLimit(request, 'health');
  } catch (error) {
    return toErrorResponse(error);
  }

  const timestamp = new Date().toISOString();
  const stuckThreshold = new Date(Date.now() - STUCK_JOB_THRESHOLD_MS);

  try {
    const {
      stuckJobsCount,
      backlogCount,
      pendingRegenerationCount,
      stuckRegenerationCount,
    } = await getSystemWideJobMetrics(stuckThreshold);

    const stuckJobsCheck = {
      status: stuckJobsCount > 0 ? ('fail' as const) : ('ok' as const),
      count: stuckJobsCount,
      threshold: STUCK_JOB_THRESHOLD_MS,
    };

    const backlogCheck = {
      status:
        backlogCount > BACKLOG_THRESHOLD ? ('fail' as const) : ('ok' as const),
      count: backlogCount,
      threshold: BACKLOG_THRESHOLD,
    };

    const regenerationCheck = {
      status: stuckRegenerationCount > 0 ? ('fail' as const) : ('ok' as const),
      pendingCount: pendingRegenerationCount,
      stuckProcessingCount: stuckRegenerationCount,
      threshold: STUCK_JOB_THRESHOLD_MS,
    };

    const isHealthy =
      stuckJobsCheck.status === 'ok' &&
      backlogCheck.status === 'ok' &&
      regenerationCheck.status === 'ok';

    const response: HealthCheckResponse = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp,
      checks: {
        stuckJobs: stuckJobsCheck,
        backlog: backlogCheck,
        regeneration: regenerationCheck,
      },
    };

    if (!isHealthy) {
      const reasons: string[] = [];
      if (stuckJobsCheck.status === 'fail') {
        reasons.push(`${stuckJobsCount} stuck job(s) detected`);
      }
      if (backlogCheck.status === 'fail') {
        reasons.push(
          `backlog of ${backlogCount} pending jobs exceeds threshold`
        );
      }
      if (regenerationCheck.status === 'fail') {
        reasons.push(
          `${stuckRegenerationCount} stuck regeneration job(s) detected`
        );
      }
      response.reason = reasons.join('; ');
    }

    return NextResponse.json(response, {
      status: isHealthy ? 200 : 503,
    });
  } catch (error) {
    logger.error({ error }, 'Health worker check failed');

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp,
        checks: {
          stuckJobs: {
            status: 'fail',
            count: 0,
            threshold: STUCK_JOB_THRESHOLD_MS,
          },
          backlog: { status: 'fail', count: 0, threshold: BACKLOG_THRESHOLD },
          regeneration: {
            status: 'fail',
            pendingCount: 0,
            stuckProcessingCount: 0,
            threshold: STUCK_JOB_THRESHOLD_MS,
          },
        },
        reason: 'Health check failed due to an internal monitoring error',
      } satisfies HealthCheckResponse,
      { status: 503 }
    );
  }
}
