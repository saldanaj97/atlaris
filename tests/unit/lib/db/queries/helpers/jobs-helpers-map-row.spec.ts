import { describe, expect, it } from 'vitest';

import type { JobQueueRow } from '@/lib/db/queries/types/jobs.types';
import { mapRowToJob } from '@/lib/db/queries/helpers/jobs-helpers';
import {
  JOB_TYPES,
  type JobPayload,
  type JobResult,
} from '@/shared/types/jobs.types';

describe('mapRowToJob', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  function buildRow(
    overrides: Partial<Omit<JobQueueRow, 'jobType'>> &
      Pick<JobQueueRow, 'jobType'>,
  ): JobQueueRow {
    const payload: JobPayload = { planId: 'plan-1' };
    const result: JobResult = {
      planId: 'plan-1',
      modulesCount: 1,
      tasksCount: 1,
      durationMs: 1,
    };

    const { jobType, ...rest } = overrides;

    return {
      id: 'job-1',
      planId: 'plan-1',
      userId: 'user-1',
      jobType,
      status: 'pending',
      priority: 0,
      attempts: 0,
      maxAttempts: 3,
      payload,
      result,
      error: null,
      scheduledFor: now,
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      ...rest,
    };
  }

  it('maps a valid row to a Job domain object', () => {
    const row = buildRow({ jobType: JOB_TYPES.PLAN_REGENERATION });
    const job = mapRowToJob(row);

    expect(job.id).toBe('job-1');
    expect(job.type).toBe(JOB_TYPES.PLAN_REGENERATION);
    expect(job.planId).toBe('plan-1');
    expect(job.userId).toBe('user-1');
    expect(job.status).toBe('pending');
    expect(job.data).toEqual(row.payload);
    expect(job.result).toEqual(row.result);
    expect(job.error).toBeNull();
    expect(job.processingStartedAt).toBeNull();
    expect(job.completedAt).toBeNull();
    expect(job.createdAt).toEqual(now);
    expect(job.updatedAt).toEqual(now);
  });

  it('throws when job type is invalid', () => {
    const row = buildRow({
      jobType: 'not_a_real_job' as JobQueueRow['jobType'],
    });
    expect(() => mapRowToJob(row)).toThrow(/Invalid job type/i);
  });
});
