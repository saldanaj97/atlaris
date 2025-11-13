import { and, eq, lt, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db/drizzle';
import { jobQueue } from '@/lib/db/schema';

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
  };
  reason?: string;
}

export async function GET() {
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

    const isHealthy =
      stuckJobsCheck.status === 'ok' && backlogCheck.status === 'ok';

    const response: HealthCheckResponse = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp,
      checks: {
        stuckJobs: stuckJobsCheck,
        backlog: backlogCheck,
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
        },
        reason: `Health check failed: ${errorMessage}`,
      } satisfies HealthCheckResponse,
      { status: 503 }
    );
  }
}
