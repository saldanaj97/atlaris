import { createEmailNotificationDeliveryPostRoute } from '@/app/api/internal/maintenance/notifications/email/route';
import { ServiceUnavailableError } from '@/lib/api/errors';
import { createMaintenancePostRequest } from '@tests/helpers/maintenance-request';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const URL = 'http://localhost/api/internal/maintenance/notifications/email';

const withMonitor = vi.hoisted(() =>
  vi.fn(
    async (
      _slug: string,
      callback: () => Promise<Response> | Response,
    ): Promise<Response> => callback(),
  ),
);

vi.mock('@sentry/nextjs', () => ({
  withMonitor,
  getIsolationScope: () => ({
    setAttributes: vi.fn(),
  }),
}));

vi.mock('@/lib/api/ip-rate-limit', () => ({
  checkIpRateLimit: vi.fn(),
}));

describe('email notification delivery route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MAINTENANCE_WORKER_TOKEN;
  });

  it('returns disabled outcome without creating a sender when flag is false', async () => {
    const createSender = vi.fn();
    const runDelivery = vi.fn();
    const resolveDeliveryEnabled = vi.fn().mockResolvedValue(false);
    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled,
      createSender,
      runDelivery,
    });

    const response = await POST(
      createMaintenancePostRequest(URL, {
        body: JSON.stringify({
          categories: ['daily_reminder'],
          schedulerDateUtc: '2026-07-09',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      outcome: 'disabled',
      examined: 0,
      nextCursor: null,
    });
    expect(createSender).not.toHaveBeenCalled();
    expect(runDelivery).not.toHaveBeenCalled();
  });

  it('fail-closes to disabled when flag evaluation throws', async () => {
    const createSender = vi.fn();
    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled: vi
        .fn()
        .mockRejectedValue(new Error('flags down')),
      createSender,
      runDelivery: vi.fn(),
    });

    const response = await POST(
      createMaintenancePostRequest(URL, {
        body: JSON.stringify({
          categories: ['daily_reminder'],
          schedulerDateUtc: '2026-07-09',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      outcome: 'disabled',
    });
    expect(createSender).not.toHaveBeenCalled();
  });

  it('rejects impossible scheduler dates before evaluating the delivery flag', async () => {
    const resolveDeliveryEnabled = vi.fn();
    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled,
      createSender: vi.fn(),
      runDelivery: vi.fn(),
    });

    const response = await POST(
      createMaintenancePostRequest(URL, {
        body: JSON.stringify({
          categories: ['daily_reminder'],
          schedulerDateUtc: '2026-02-31',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(400);
    expect(resolveDeliveryEnabled).not.toHaveBeenCalled();
  });

  it('rejects unauthorized requests before flag evaluation', async () => {
    process.env.MAINTENANCE_WORKER_TOKEN = 'secret';
    const resolveDeliveryEnabled = vi.fn();
    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled,
      createSender: vi.fn(),
      runDelivery: vi.fn(),
    });

    const response = await POST(
      createMaintenancePostRequest(URL, {
        body: JSON.stringify({
          categories: ['daily_reminder'],
          schedulerDateUtc: '2026-07-09',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(401);
    expect(resolveDeliveryEnabled).not.toHaveBeenCalled();
  });

  it('returns 200 when delivery has zero failures', async () => {
    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled: vi.fn().mockResolvedValue(true),
      createSender: vi.fn().mockReturnValue({
        resolveRequest: vi.fn(),
        sendResolved: vi.fn(),
      }),
      runDelivery: vi.fn().mockResolvedValue({
        examined: 1,
        claimed: 1,
        sent: 1,
        skipped: 0,
        failed: 0,
        alreadyTerminal: 0,
        inFlight: 0,
        manualReview: 0,
        nextCursor: null,
      }),
    });

    const response = await POST(
      createMaintenancePostRequest(URL, {
        body: JSON.stringify({
          categories: ['daily_reminder'],
          schedulerDateUtc: '2026-07-09',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      outcome: 'delivered',
      sent: 1,
    });
  });

  it('throws ServiceUnavailableError inside the monitored callback on partial failure', async () => {
    let monitoredError: unknown;
    withMonitor.mockImplementationOnce(async (_slug, callback) => {
      try {
        return await callback();
      } catch (error) {
        monitoredError = error;
        throw error;
      }
    });

    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled: vi.fn().mockResolvedValue(true),
      createSender: vi.fn().mockReturnValue({
        resolveRequest: vi.fn(),
        sendResolved: vi.fn(),
      }),
      runDelivery: vi.fn().mockResolvedValue({
        examined: 2,
        claimed: 2,
        sent: 1,
        skipped: 0,
        failed: 1,
        alreadyTerminal: 0,
        inFlight: 0,
        manualReview: 0,
        nextCursor: null,
      }),
    });

    const response = await POST(
      createMaintenancePostRequest(URL, {
        body: JSON.stringify({
          categories: ['daily_reminder'],
          schedulerDateUtc: '2026-07-09',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(503);
    expect(monitoredError).toBeInstanceOf(ServiceUnavailableError);
  });

  it('throws on total failure and manual review counts', async () => {
    const POST = createEmailNotificationDeliveryPostRoute({
      resolveDeliveryEnabled: vi.fn().mockResolvedValue(true),
      createSender: vi.fn().mockReturnValue({
        resolveRequest: vi.fn(),
        sendResolved: vi.fn(),
      }),
      runDelivery: vi.fn().mockResolvedValue({
        examined: 1,
        claimed: 1,
        sent: 0,
        skipped: 0,
        failed: 0,
        alreadyTerminal: 0,
        inFlight: 0,
        manualReview: 1,
        nextCursor: null,
      }),
    });

    const response = await POST(
      createMaintenancePostRequest(URL, {
        body: JSON.stringify({
          categories: ['daily_reminder'],
          schedulerDateUtc: '2026-07-09',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(503);
  });
});
