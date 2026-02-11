import { and, eq, lt, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { toErrorResponse } from '@/lib/api/errors';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { db } from '@/lib/db/service-role';
import { jobQueue } from '@/lib/db/schema';
import { JOB_TYPES } from '@/lib/jobs/types';

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

export async function GET(request: Request) {
  try {
    checkIpRateLimit(request, 'health');
  } catch (error) {
    return toErrorResponse(error);
  }

  const timestamp = new Date().toISOString();
  const stuckThreshold = new Date(Date.now() - STUCK_JOB_THRESHOLD_MS);
  // Use service-role DB to bypass RLS and get system-wide metrics
  // Health checks need to see all jobs across all users, not just the authenticated user's jobs

  try {
    // Check for stuck jobs (processing for > 10 minutes)
    const [stuckJobsResult] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(jobQueue)
      .where(
        and(
          eq(jobQueue.status, 'processing'),
          lt(jobQueue.startedAt, stuckThreshold)
        )
      );

    const stuckJobCount = stuckJobsResult?.count ?? 0;

    // Check for backlog (pending jobs)
    const [backlogResult] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(jobQueue)
      .where(eq(jobQueue.status, 'pending'));

    const backlogCount = backlogResult?.count ?? 0;

    const [pendingRegenerationResult] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(jobQueue)
      .where(
        and(
          eq(jobQueue.status, 'pending'),
          eq(jobQueue.jobType, JOB_TYPES.PLAN_REGENERATION)
        )
      );

    const [stuckRegenerationResult] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(jobQueue)
      .where(
        and(
          eq(jobQueue.status, 'processing'),
          eq(jobQueue.jobType, JOB_TYPES.PLAN_REGENERATION),
          lt(jobQueue.startedAt, stuckThreshold)
        )
      );

    const pendingRegenerationCount = pendingRegenerationResult?.count ?? 0;
    const stuckRegenerationCount = stuckRegenerationResult?.count ?? 0;

    const stuckJobsCheck = {
      status: stuckJobCount > 0 ? ('fail' as const) : ('ok' as const),
      count: stuckJobCount,
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
        reasons.push(`${stuckJobCount} stuck job(s) detected`);
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
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

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
        reason: `Health check failed: ${errorMessage}`,
      } satisfies HealthCheckResponse,
      { status: 503 }
    );
  }
}
