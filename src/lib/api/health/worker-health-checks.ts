export const STUCK_JOB_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
export const BACKLOG_THRESHOLD = 100; // pending jobs threshold

export interface HealthCheckResponse {
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

export type WorkerJobMetrics = {
  stuckJobsCount: number;
  backlogCount: number;
  pendingRegenerationCount: number;
  stuckRegenerationCount: number;
};

export function buildStuckJobsCheck(stuckJobsCount: number) {
  return {
    status: stuckJobsCount > 0 ? ('fail' as const) : ('ok' as const),
    count: stuckJobsCount,
    threshold: STUCK_JOB_THRESHOLD_MS,
  };
}

function buildBacklogCheck(backlogCount: number) {
  return {
    status:
      backlogCount > BACKLOG_THRESHOLD ? ('fail' as const) : ('ok' as const),
    count: backlogCount,
    threshold: BACKLOG_THRESHOLD,
  };
}

function buildRegenerationCheck(
  pendingRegenerationCount: number,
  stuckRegenerationCount: number,
) {
  return {
    status: stuckRegenerationCount > 0 ? ('fail' as const) : ('ok' as const),
    pendingCount: pendingRegenerationCount,
    stuckProcessingCount: stuckRegenerationCount,
    threshold: STUCK_JOB_THRESHOLD_MS,
  };
}

export function buildHealthyWorkerHealthBody(
  timestamp: string,
  metrics: WorkerJobMetrics,
): { body: HealthCheckResponse; httpStatus: 200 | 503 } {
  const stuckJobsCheck = buildStuckJobsCheck(metrics.stuckJobsCount);
  const backlogCheck = buildBacklogCheck(metrics.backlogCount);
  const regenerationCheck = buildRegenerationCheck(
    metrics.pendingRegenerationCount,
    metrics.stuckRegenerationCount,
  );

  const isHealthy =
    stuckJobsCheck.status === 'ok' &&
    backlogCheck.status === 'ok' &&
    regenerationCheck.status === 'ok';

  const checks = {
    stuckJobs: stuckJobsCheck,
    backlog: backlogCheck,
    regeneration: regenerationCheck,
  };

  const response: HealthCheckResponse = {
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp,
    checks,
  };

  if (!isHealthy) {
    const reasons: string[] = [];
    if (stuckJobsCheck.status === 'fail') {
      reasons.push(`${metrics.stuckJobsCount} stuck job(s) detected`);
    }
    if (backlogCheck.status === 'fail') {
      reasons.push(
        `backlog of ${metrics.backlogCount} pending jobs exceeds threshold`,
      );
    }
    if (regenerationCheck.status === 'fail') {
      reasons.push(
        `${metrics.stuckRegenerationCount} stuck regeneration job(s) detected`,
      );
    }
    response.reason = reasons.join('; ');
  }

  return {
    body: response,
    httpStatus: isHealthy ? 200 : 503,
  };
}

export function buildWorkerHealthMonitoringErrorBody(
  timestamp: string,
): HealthCheckResponse {
  return {
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
  };
}
