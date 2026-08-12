import type { Job } from '@/features/jobs/types';
import type { PlanRegenerationWorkflowInput } from '@/features/plans/workflows/plan-regeneration.types';

import { claimPlanRegenerationJobStep } from '@/features/plans/workflows/plan-regeneration.steps';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claimJob: vi.fn(),
  loadJob: vi.fn(),
  updateJobPayload: vi.fn(),
  getWorkflowMetadata: vi.fn(),
}));

vi.mock('@/features/jobs/queue', () => ({
  claimRegenerationJob: mocks.claimJob,
  loadJobById: mocks.loadJob,
  updateJobPayload: mocks.updateJobPayload,
}));

vi.mock('workflow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('workflow')>();
  return {
    ...actual,
    getWorkflowMetadata: mocks.getWorkflowMetadata,
  };
});

const input: PlanRegenerationWorkflowInput = {
  jobId: 'e6e5528d-1871-45d2-a055-7bc03f2ca8f8',
  planId: '0c834f38-e9e1-4c7d-bdc0-2e28c505256a',
  userId: '353d54b9-f3d0-4aa6-8c74-33956019cb71',
  correlationId: 'regen-same-run-race',
};

function job(status: Job['status'], runId?: string): Job {
  const now = new Date('2026-06-22T18:00:00.000Z');
  return {
    id: input.jobId,
    type: 'plan_regeneration',
    planId: input.planId,
    userId: input.userId,
    status,
    priority: 0,
    attempts: 0,
    maxAttempts: 3,
    data: {
      planId: input.planId,
      ...(runId
        ? {
            workflow: {
              provider: 'workflow-sdk' as const,
              runId,
              startedAt: now.toISOString(),
            },
          }
        : {}),
    },
    result: null,
    error: null,
    processingStartedAt: status === 'processing' ? now : null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('claimPlanRegenerationJobStep', () => {
  beforeEach(() => {
    mocks.claimJob.mockReset();
    mocks.loadJob.mockReset();
    mocks.updateJobPayload.mockReset();
    mocks.getWorkflowMetadata.mockReturnValue({ workflowRunId: 'wrun_same' });
  });

  it('adopts a processing job without workflow metadata', async () => {
    mocks.loadJob.mockResolvedValue(job('processing'));
    mocks.updateJobPayload.mockResolvedValue(job('processing', 'wrun_same'));

    await expect(claimPlanRegenerationJobStep(input)).resolves.toEqual({
      kind: 'claimed',
      runId: 'wrun_same',
    });

    expect(mocks.updateJobPayload).toHaveBeenCalledWith(
      input.jobId,
      expect.objectContaining({
        workflow: expect.objectContaining({
          provider: 'workflow-sdk',
          runId: 'wrun_same',
        }),
      }),
    );
    expect(mocks.claimJob).not.toHaveBeenCalled();
  });

  it('does not claim when adoption finds the job already completed', async () => {
    mocks.loadJob.mockResolvedValue(job('processing'));
    mocks.updateJobPayload.mockResolvedValue(job('completed'));

    await expect(claimPlanRegenerationJobStep(input)).resolves.toEqual({
      kind: 'already-completed',
      jobId: input.jobId,
    });

    expect(mocks.claimJob).not.toHaveBeenCalled();
  });

  it('does not claim when adoption no longer finds the job', async () => {
    mocks.loadJob.mockResolvedValue(job('processing'));
    mocks.updateJobPayload.mockResolvedValue(null);

    await expect(claimPlanRegenerationJobStep(input)).resolves.toEqual({
      kind: 'job-not-found',
      jobId: input.jobId,
    });

    expect(mocks.claimJob).not.toHaveBeenCalled();
  });

  it('continues when a concurrent same-run claim wins the CAS', async () => {
    mocks.loadJob
      .mockResolvedValueOnce(job('pending'))
      .mockResolvedValueOnce(job('processing', 'wrun_same'));
    mocks.claimJob.mockResolvedValue(null);

    await expect(claimPlanRegenerationJobStep(input)).resolves.toEqual({
      kind: 'claimed',
      runId: 'wrun_same',
    });
  });
});
