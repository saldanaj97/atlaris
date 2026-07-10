import { createEmailNotificationDeliveryCronRoute } from '@/app/api/cron/notifications/email/route';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const URL = 'https://atlaris.app/api/cron/notifications/email';

function request(headers: HeadersInit = {}): Request {
  return new Request(URL, { headers });
}

describe('email notification delivery cron route', () => {
  const resolveDeliveryEnabled = vi.fn();
  const startWorkflow = vi.fn();

  beforeEach(() => {
    resolveDeliveryEnabled.mockReset();
    startWorkflow.mockReset();
  });

  it('rejects missing or wrong CRON_SECRET before flag or workflow access', async () => {
    const GET = createEmailNotificationDeliveryCronRoute({
      resolveCronSecret: () => 'cron-secret',
      resolveDeliveryEnabled,
      startWorkflow,
    });

    const unauthorizedHeaders: HeadersInit[] = [
      { 'x-vercel-cron-schedule': '0 14 * * *' },
      {
        authorization: 'Bearer wrong-secret',
        'x-vercel-cron-schedule': '0 14 * * *',
      },
    ];
    for (const headers of unauthorizedHeaders) {
      const response = await GET(request(headers));
      expect(response.status).toBe(401);
    }

    expect(resolveDeliveryEnabled).not.toHaveBeenCalled();
    expect(startWorkflow).not.toHaveBeenCalled();
  });

  it('fails closed when CRON_SECRET is not configured', async () => {
    const GET = createEmailNotificationDeliveryCronRoute({
      resolveCronSecret: () => undefined,
      resolveDeliveryEnabled,
      startWorkflow,
    });

    const response = await GET(
      request({
        authorization: 'Bearer supplied-secret',
        'x-vercel-cron-schedule': '0 14 * * *',
      }),
    );

    expect(response.status).toBe(503);
    expect(resolveDeliveryEnabled).not.toHaveBeenCalled();
    expect(startWorkflow).not.toHaveBeenCalled();
  });

  it('rejects an unknown Vercel schedule before flag evaluation', async () => {
    const GET = createEmailNotificationDeliveryCronRoute({
      resolveCronSecret: () => 'cron-secret',
      resolveDeliveryEnabled,
      startWorkflow,
    });

    const response = await GET(
      request({
        authorization: 'Bearer cron-secret',
        'x-vercel-cron-schedule': '0 0 * * *',
      }),
    );

    expect(response.status).toBe(400);
    expect(resolveDeliveryEnabled).not.toHaveBeenCalled();
    expect(startWorkflow).not.toHaveBeenCalled();
  });

  it('returns disabled without reserving a run when the flag is off', async () => {
    resolveDeliveryEnabled.mockResolvedValue(false);
    const GET = createEmailNotificationDeliveryCronRoute({
      resolveCronSecret: () => 'cron-secret',
      resolveDeliveryEnabled,
      startWorkflow,
    });

    const response = await GET(
      request({
        authorization: 'Bearer cron-secret',
        'x-vercel-cron-schedule': '0 14 * * *',
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      outcome: 'disabled',
    });
    expect(startWorkflow).not.toHaveBeenCalled();
  });

  it('maps the daily schedule to a code-owned daily logical run', async () => {
    resolveDeliveryEnabled.mockResolvedValue(true);
    startWorkflow.mockResolvedValue({
      outcome: 'started',
      runId: 'run-1',
      workflowRunId: 'workflow-1',
    });
    const GET = createEmailNotificationDeliveryCronRoute({
      resolveCronSecret: () => 'cron-secret',
      resolveDeliveryEnabled,
      startWorkflow,
      now: () => new Date('2026-07-10T14:01:00.000Z'),
    });

    const response = await GET(
      request({
        authorization: 'Bearer cron-secret',
        'x-vercel-cron-schedule': '0 14 * * *',
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

  it('returns an existing weekly run without treating it as a new workflow', async () => {
    resolveDeliveryEnabled.mockResolvedValue(true);
    startWorkflow.mockResolvedValue({
      outcome: 'already_running',
      runId: 'run-2',
      workflowRunId: 'workflow-2',
    });
    const GET = createEmailNotificationDeliveryCronRoute({
      resolveCronSecret: () => 'cron-secret',
      resolveDeliveryEnabled,
      startWorkflow,
      now: () => new Date('2026-07-13T14:31:00.000Z'),
    });

    const response = await GET(
      request({
        authorization: 'Bearer cron-secret',
        'x-vercel-cron-schedule': '30 14 * * 1',
      }),
    );

    expect(response.status).toBe(200);
    expect(startWorkflow).toHaveBeenCalledWith({
      runKind: 'weekly',
      schedulerDateUtc: '2026-07-13',
      action: 'start',
    });
  });

  it('rejects a weekly cron trigger on a non-Monday UTC date', async () => {
    resolveDeliveryEnabled.mockResolvedValue(true);
    const GET = createEmailNotificationDeliveryCronRoute({
      resolveCronSecret: () => 'cron-secret',
      resolveDeliveryEnabled,
      startWorkflow,
      now: () => new Date('2026-07-14T14:31:00.000Z'),
    });

    const response = await GET(
      request({
        authorization: 'Bearer cron-secret',
        'x-vercel-cron-schedule': '30 14 * * 1',
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Weekly email notification delivery requires a Monday UTC date.',
    });
    expect(startWorkflow).not.toHaveBeenCalled();
  });
});
