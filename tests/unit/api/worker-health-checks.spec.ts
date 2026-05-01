import { describe, expect, it } from 'vitest';
import {
  BACKLOG_THRESHOLD,
  buildHealthyWorkerHealthBody,
  buildStuckJobsCheck,
  buildWorkerHealthMonitoringErrorBody,
} from '@/lib/api/health/worker-health-checks';

describe('worker health check builders', () => {
  it('marks healthy when all metrics clear', () => {
    const { body, httpStatus } = buildHealthyWorkerHealthBody('t0', {
      stuckJobsCount: 0,
      backlogCount: 0,
      pendingRegenerationCount: 3,
      stuckRegenerationCount: 0,
    });
    expect(httpStatus).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body.reason).toBeUndefined();
  });

  it('503 when backlog exceeds threshold', () => {
    const { body, httpStatus } = buildHealthyWorkerHealthBody('t0', {
      stuckJobsCount: 0,
      backlogCount: BACKLOG_THRESHOLD + 1,
      pendingRegenerationCount: 0,
      stuckRegenerationCount: 0,
    });
    expect(httpStatus).toBe(503);
    expect(body.status).toBe('unhealthy');
    expect(body.reason).toContain('backlog');
  });

  it('buildStuckJobsCheck fails when count > 0', () => {
    expect(buildStuckJobsCheck(1).status).toBe('fail');
    expect(buildStuckJobsCheck(0).status).toBe('ok');
  });

  it('monitoring error body shape', () => {
    const body = buildWorkerHealthMonitoringErrorBody('t1');
    expect(body.status).toBe('unhealthy');
    expect(body.checks.stuckJobs.status).toBe('fail');
    expect(body.reason).toContain('internal monitoring');
  });
});
