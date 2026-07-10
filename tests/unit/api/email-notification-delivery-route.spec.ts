import { createEmailNotificationDeliveryPostRoute } from '@/app/api/internal/maintenance/notifications/email/route';
import { EmailNotificationDeliveryRunActionError } from '@/features/notifications/email/start-email-notification-delivery-workflow';
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
      startWorkflow: vi.fn(),
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

  it('returns disabled without reserving or starting a workflow', async () => {
    const startWorkflow = vi.fn();
    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled: vi.fn().mockResolvedValue(false),
      startWorkflow,
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
    expect(startWorkflow).not.toHaveBeenCalled();
  });

  it('rejects raw category, cursor, and batch controls before evaluating the flag', async () => {
    const resolveDeliveryEnabled = vi.fn();
    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled,
      startWorkflow: vi.fn(),
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
      startWorkflow: vi.fn(),
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

  it('uses the shared starter and returns 202 only for a newly started run', async () => {
    const startWorkflow = vi.fn().mockResolvedValue({
      outcome: 'started',
      runId: 'run-1',
      workflowRunId: 'workflow-1',
    });
    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled: vi.fn().mockResolvedValue(true),
      startWorkflow,
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
    expect(startWorkflow).toHaveBeenCalledWith({
      runKind: 'daily',
      schedulerDateUtc: '2026-07-10',
      action: 'start',
    });
  });

  it('passes explicit resume and replay actions to the same starter', async () => {
    const startWorkflow = vi
      .fn()
      .mockResolvedValueOnce({
        outcome: 'already_paused',
        runId: 'run-2',
        workflowRunId: null,
      })
      .mockResolvedValueOnce({
        outcome: 'needs_review',
        runId: 'run-3',
        workflowRunId: null,
      });
    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled: vi.fn().mockResolvedValue(true),
      startWorkflow,
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
    expect(startWorkflow).toHaveBeenNthCalledWith(1, {
      runKind: 'daily',
      schedulerDateUtc: '2026-07-10',
      action: 'resume',
    });
    expect(startWorkflow).toHaveBeenNthCalledWith(2, {
      runKind: 'weekly',
      schedulerDateUtc: '2026-07-13',
      action: 'replay_reviewed',
    });
  });

  it('rejects a manual action that does not match the run state', async () => {
    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled: vi.fn().mockResolvedValue(true),
      startWorkflow: vi
        .fn()
        .mockRejectedValue(new EmailNotificationDeliveryRunActionError()),
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
});
