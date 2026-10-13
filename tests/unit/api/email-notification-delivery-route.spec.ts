import { createEmailNotificationDeliveryPostRoute } from '@/app/api/internal/maintenance/notifications/email/route';
import { createMaintenancePostRequest } from '@tests/helpers/maintenance-request';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const URL = 'http://localhost/api/internal/maintenance/notifications/email';

vi.mock('@/lib/api/ip-rate-limit', () => ({
  checkIpRateLimit: vi.fn(),
}));

describe('email notification delivery recovery route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MAINTENANCE_WORKER_TOKEN;
  });

  it('authenticates before parsing the body or evaluating the delivery flag', async () => {
    process.env.MAINTENANCE_WORKER_TOKEN = 'secret';
    const resolveDeliveryEnabled = vi.fn();
    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled,
      dispatch: vi.fn(),
    });

    const response = await POST(
      createMaintenancePostRequest(URL, {
        body: '{',
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(401);
    expect(resolveDeliveryEnabled).not.toHaveBeenCalled();
  });

  it('returns disabled without dispatching to the Worker', async () => {
    const dispatch = vi.fn();
    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled: vi.fn().mockResolvedValue(false),
      dispatch,
    });

    const response = await POST(
      createMaintenancePostRequest(URL, {
        body: JSON.stringify({
          runKind: 'daily',
          schedulerDateUtc: '2026-07-10',
          action: 'start',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      outcome: 'disabled',
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rejects raw category, cursor, and batch controls before evaluating the flag', async () => {
    const resolveDeliveryEnabled = vi.fn();
    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled,
      dispatch: vi.fn(),
    });

    const response = await POST(
      createMaintenancePostRequest(URL, {
        body: JSON.stringify({
          categories: ['daily_reminder'],
          schedulerDateUtc: '2026-07-10',
          batchSize: 50,
          cursorUserId: null,
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(400);
    expect(resolveDeliveryEnabled).not.toHaveBeenCalled();
  });

  it('rejects a weekly manual run on a non-Monday UTC date', async () => {
    const resolveDeliveryEnabled = vi.fn();
    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled,
      dispatch: vi.fn(),
    });

    const response = await POST(
      createMaintenancePostRequest(URL, {
        body: JSON.stringify({
          runKind: 'weekly',
          schedulerDateUtc: '2026-07-10',
          action: 'start',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(400);
    expect(resolveDeliveryEnabled).not.toHaveBeenCalled();
  });

  it('rejects a future date for a new manual run', async () => {
    const resolveDeliveryEnabled = vi.fn();
    const dispatch = vi.fn();
    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled,
      dispatch,
      now: () => new Date('2026-07-10T23:59:59.000Z'),
    });

    const response = await POST(
      createMaintenancePostRequest(URL, {
        body: JSON.stringify({
          runKind: 'daily',
          schedulerDateUtc: '2026-07-11',
          action: 'start',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(400);
    expect(resolveDeliveryEnabled).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('dispatches to the jobs Worker and returns 202 only for a newly started run', async () => {
    const dispatch = vi.fn().mockResolvedValue({
      kind: 'accepted',
      outcome: 'started',
      runId: 'run-1',
      instanceId: 'workflow-1',
    });
    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled: vi.fn().mockResolvedValue(true),
      dispatch,
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    const response = await POST(
      createMaintenancePostRequest(URL, {
        body: JSON.stringify({
          runKind: 'daily',
          schedulerDateUtc: '2026-07-10',
          action: 'start',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      outcome: 'started',
      runId: 'run-1',
      workflowRunId: 'workflow-1',
    });
    expect(dispatch).toHaveBeenCalledWith({
      runKind: 'daily',
      schedulerDateUtc: '2026-07-10',
      action: 'start',
    });
  });

  it('reports a failed Worker dispatch as unavailable to the operator', async () => {
    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled: vi.fn().mockResolvedValue(true),
      dispatch: vi.fn().mockResolvedValue({ kind: 'failed' }),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    const response = await POST(
      createMaintenancePostRequest(URL, {
        body: JSON.stringify({
          runKind: 'daily',
          schedulerDateUtc: '2026-07-10',
          action: 'start',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Email notification workflow could not be started.',
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('passes explicit resume and replay actions to the same dispatch', async () => {
    const dispatch = vi
      .fn()
      .mockResolvedValueOnce({
        kind: 'accepted',
        outcome: 'already_paused',
        runId: 'run-2',
        instanceId: null,
      })
      .mockResolvedValueOnce({
        kind: 'accepted',
        outcome: 'needs_review',
        runId: 'run-3',
        instanceId: null,
      });
    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled: vi.fn().mockResolvedValue(true),
      dispatch,
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    const resume = await POST(
      createMaintenancePostRequest(URL, {
        body: JSON.stringify({
          runKind: 'daily',
          schedulerDateUtc: '2026-07-10',
          action: 'resume',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    const replay = await POST(
      createMaintenancePostRequest(URL, {
        body: JSON.stringify({
          runKind: 'weekly',
          schedulerDateUtc: '2026-07-13',
          action: 'replay_reviewed',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(resume.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(dispatch).toHaveBeenNthCalledWith(1, {
      runKind: 'daily',
      schedulerDateUtc: '2026-07-10',
      action: 'resume',
    });
    expect(dispatch).toHaveBeenNthCalledWith(2, {
      runKind: 'weekly',
      schedulerDateUtc: '2026-07-13',
      action: 'replay_reviewed',
    });
  });

  it('rejects a manual action that does not match the run state', async () => {
    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled: vi.fn().mockResolvedValue(true),
      dispatch: vi.fn().mockResolvedValue({ kind: 'invalid_run_state' }),
    });

    const response = await POST(
      createMaintenancePostRequest(URL, {
        body: JSON.stringify({
          runKind: 'daily',
          schedulerDateUtc: '2026-07-10',
          action: 'resume',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(409);
  });

  it('returns disabled when the Worker switch refuses the command', async () => {
    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled: vi.fn().mockResolvedValue(true),
      dispatch: vi
        .fn()
        .mockResolvedValue({ kind: 'disabled', code: 'job_disabled' }),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    const response = await POST(
      createMaintenancePostRequest(URL, {
        body: JSON.stringify({
          runKind: 'daily',
          schedulerDateUtc: '2026-07-10',
          action: 'start',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      outcome: 'disabled',
    });
  });

  it('reports an existing failed run as unavailable until it is resumed', async () => {
    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled: vi.fn().mockResolvedValue(true),
      dispatch: vi.fn().mockResolvedValue({
        kind: 'accepted',
        outcome: 'failed_requires_resume',
        runId: 'run-1',
        instanceId: null,
      }),
      now: () => new Date('2026-07-10T00:00:00.000Z'),
    });

    const response = await POST(
      createMaintenancePostRequest(URL, {
        body: JSON.stringify({
          runKind: 'daily',
          schedulerDateUtc: '2026-07-10',
          action: 'start',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(503);
  });
});
