import type { DbClient } from '@/lib/db/types';

import {
  type EmailDeliveryRunsDeps,
  emailDeliveryInstanceId,
  handleEmailDeliveryRunsCommand,
} from '../../../../workers/jobs/src/http/email-delivery-runs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runs = vi.hoisted(() => ({
  reserve: vi.fn(),
  loadByKey: vi.fn(),
  prepare: vi.fn(),
  fail: vi.fn(),
}));
const countManualReviews = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db/queries/email-notification-delivery-runs', () => ({
  reserveEmailNotificationDeliveryRun: runs.reserve,
  loadEmailNotificationDeliveryRunByKey: runs.loadByKey,
  prepareEmailNotificationDeliveryRunResume: runs.prepare,
  failEmailNotificationDeliveryRun: runs.fail,
}));

vi.mock('@/lib/db/queries/email-notification-deliveries', () => ({
  countEmailNotificationDeliveryManualReviews: countManualReviews,
}));

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const UPDATED_AT = new Date('2026-07-09T14:00:05.123Z');
const INSTANCE_ID = `email-${RUN_ID}-${UPDATED_AT.getTime()}`;

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    runKind: 'daily',
    schedulerDateUtc: '2026-07-09',
    status: 'queued',
    workflowRunId: null,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function post(body: unknown) {
  return new Request(
    'https://workers-staging.atlaris.app/v1/email-delivery/runs',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
  );
}

const START = {
  v: 1,
  runKind: 'daily',
  schedulerDateUtc: '2026-07-09',
  action: 'start',
};

function makeDeps(overrides: Partial<EmailDeliveryRunsDeps> = {}) {
  const workflow = {
    create: vi.fn(async () => ({}) as WorkflowInstance),
    get: vi.fn(async (): Promise<WorkflowInstance> => {
      throw new Error('not found');
    }),
  };
  const withDb = vi.fn((fn: (db: DbClient) => Promise<unknown>) =>
    fn({} as DbClient),
  );
  const deps: EmailDeliveryRunsDeps = {
    switches: { JOB_EMAIL_DELIVERY_ENABLED: 'true' },
    withDb: withDb as EmailDeliveryRunsDeps['withDb'],
    workflow,
    logger: { info: vi.fn(), error: vi.fn() },
    now: () => new Date('2026-07-09T15:00:00.000Z'),
    ...overrides,
  };
  return { deps, workflow, withDb };
}

describe('handleEmailDeliveryRunsCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runs.reserve.mockResolvedValue({ outcome: 'reserved', run: runRow() });
    runs.fail.mockResolvedValue({ outcome: 'transitioned' });
  });

  it.each([
    ['malformed JSON', '{'],
    ['missing version', { ...START, v: undefined }],
    ['unknown version', { ...START, v: 2 }],
    ['extra field', { ...START, force: true }],
    ['unknown action', { ...START, action: 'resend' }],
    ['invalid date', { ...START, schedulerDateUtc: '2026-02-30' }],
    ['weekly run on a non-Monday', { ...START, runKind: 'weekly' }],
    ['start for a future date', { ...START, schedulerDateUtc: '2026-07-10' }],
  ])('rejects %s with 400 before touching the database', async (_, body) => {
    const { deps, withDb, workflow } = makeDeps();

    const response = await handleEmailDeliveryRunsCommand(post(body), deps);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_body' });
    expect(withDb).not.toHaveBeenCalled();
    expect(workflow.create).not.toHaveBeenCalled();
  });

  it('returns 503 when jobs are paused or the email job is off', async () => {
    const paused = makeDeps({
      switches: { JOBS_PAUSED: 'true', JOB_EMAIL_DELIVERY_ENABLED: 'true' },
    });
    const pausedResponse = await handleEmailDeliveryRunsCommand(
      post(START),
      paused.deps,
    );
    expect(pausedResponse.status).toBe(503);
    await expect(pausedResponse.json()).resolves.toEqual({
      code: 'jobs_paused',
    });

    const disabled = makeDeps({ switches: {} });
    const disabledResponse = await handleEmailDeliveryRunsCommand(
      post(START),
      disabled.deps,
    );
    expect(disabledResponse.status).toBe(503);
    await expect(disabledResponse.json()).resolves.toEqual({
      code: 'job_disabled',
    });
    expect(paused.withDb).not.toHaveBeenCalled();
    expect(disabled.withDb).not.toHaveBeenCalled();
  });

  it('reserves the run and starts the Workflow with a deterministic instance ID', async () => {
    const { deps, workflow } = makeDeps();

    const response = await handleEmailDeliveryRunsCommand(post(START), deps);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      instanceId: INSTANCE_ID,
      runId: RUN_ID,
    });
    expect(emailDeliveryInstanceId(runRow())).toBe(INSTANCE_ID);
    expect(workflow.create).toHaveBeenCalledWith({
      id: INSTANCE_ID,
      params: { v: 1, runId: RUN_ID },
    });
  });

  it('returns the existing run without starting a Workflow', async () => {
    runs.reserve.mockResolvedValue({
      outcome: 'existing',
      run: runRow({ status: 'running', workflowRunId: 'cf:other' }),
    });
    const { deps, workflow } = makeDeps();

    const response = await handleEmailDeliveryRunsCommand(post(START), deps);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      duplicate: true,
      runId: RUN_ID,
      status: 'running',
    });
    expect(workflow.create).not.toHaveBeenCalled();
  });

  it('treats an existing instance as a duplicate and leaves the run alone', async () => {
    const { deps, workflow } = makeDeps();
    workflow.create.mockRejectedValue(new Error('instance already exists'));
    workflow.get.mockResolvedValue({} as WorkflowInstance);

    const response = await handleEmailDeliveryRunsCommand(post(START), deps);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      accepted: true,
      duplicate: true,
      instanceId: INSTANCE_ID,
    });
    expect(workflow.get).toHaveBeenCalledWith(INSTANCE_ID);
    expect(runs.fail).not.toHaveBeenCalled();
  });

  it('fails the unclaimed run and returns 503 when the Workflow cannot start', async () => {
    const { deps, workflow } = makeDeps();
    workflow.create.mockRejectedValue(new Error('binding unavailable'));

    const response = await handleEmailDeliveryRunsCommand(post(START), deps);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: 'workflow_start_failed',
    });
    expect(runs.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: RUN_ID,
        workflowRunId: null,
        errorClass: 'workflow_start_failed',
      }),
      expect.anything(),
    );
  });

  it('requeues a paused run for resume under a new instance ID', async () => {
    const resumedAt = new Date('2026-07-09T16:00:00.000Z');
    runs.loadByKey.mockResolvedValue(runRow({ status: 'paused' }));
    runs.prepare.mockResolvedValue({
      outcome: 'prepared',
      run: runRow({ updatedAt: resumedAt }),
    });
    const { deps, workflow } = makeDeps();

    const response = await handleEmailDeliveryRunsCommand(
      post({ ...START, action: 'resume' }),
      deps,
    );

    expect(response.status).toBe(202);
    expect(runs.prepare).toHaveBeenCalledWith(
      { runId: RUN_ID, action: 'resume' },
      expect.anything(),
    );
    expect(workflow.create).toHaveBeenCalledWith({
      id: `email-${RUN_ID}-${resumedAt.getTime()}`,
      params: { v: 1, runId: RUN_ID },
    });
  });

  it('returns 409 for an action that does not fit the run state', async () => {
    runs.loadByKey.mockResolvedValue(runRow({ status: 'completed' }));
    runs.prepare.mockResolvedValue({
      outcome: 'invalid_state',
      run: runRow({ status: 'completed' }),
    });
    const { deps, workflow } = makeDeps();

    const response = await handleEmailDeliveryRunsCommand(
      post({ ...START, action: 'resume' }),
      deps,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: 'invalid_run_state',
    });
    expect(workflow.create).not.toHaveBeenCalled();
  });

  it('does not replay a reviewed run while manual-review rows remain', async () => {
    runs.loadByKey.mockResolvedValue(runRow({ status: 'needs_review' }));
    countManualReviews.mockResolvedValue(2);
    const { deps, workflow } = makeDeps();

    const response = await handleEmailDeliveryRunsCommand(
      post({ ...START, action: 'replay_reviewed' }),
      deps,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      duplicate: true,
      status: 'needs_review',
    });
    expect(runs.prepare).not.toHaveBeenCalled();
    expect(workflow.create).not.toHaveBeenCalled();
  });
});
