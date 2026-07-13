import { RateLimitError } from '@/lib/api/errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const logger = { warn: vi.fn() };

  return {
    applyVerifiedClerkBillingEvent: vi.fn(),
    checkIpRateLimit: vi.fn(),
    createLoggingRequestContext: vi.fn(),
    logger,
    verifyWebhook: vi.fn(),
  };
});

vi.mock('@/features/billing/clerk-billing/reconciliation', () => ({
  applyVerifiedClerkBillingEvent: mocks.applyVerifiedClerkBillingEvent,
}));

vi.mock('@/lib/api/ip-rate-limit', () => ({
  checkIpRateLimit: mocks.checkIpRateLimit,
}));

vi.mock('@/lib/config/env', async (importOriginal) => ({
  ...(await importOriginal()),
  clerkAuthEnv: { webhookSigningSecret: 'whsec_test' },
}));

vi.mock('@/lib/logging/request-context', () => ({
  attachRequestIdHeader: (response: Response, requestId: string): Response => {
    const headers = new Headers(response.headers);
    headers.set('x-correlation-id', requestId);
    return new Response(response.body, { headers, status: response.status });
  },
  createLoggingRequestContext: mocks.createLoggingRequestContext,
}));

vi.mock('@clerk/nextjs/webhooks', () => ({
  verifyWebhook: mocks.verifyWebhook,
}));

import { POST } from '@/app/api/v1/clerk/billing/webhook/route';

const URL = 'https://atlaris.app/api/v1/clerk/billing/webhook';

function request(headers: HeadersInit = {}, body = '{}'): Request {
  return new Request(URL, { method: 'POST', headers, body });
}

describe('Clerk billing webhook POST', () => {
  beforeEach(() => {
    mocks.applyVerifiedClerkBillingEvent.mockReset();
    mocks.checkIpRateLimit.mockReset();
    mocks.createLoggingRequestContext.mockReset();
    mocks.logger.warn.mockReset();
    mocks.verifyWebhook.mockReset();
    mocks.createLoggingRequestContext.mockReturnValue({
      requestId: 'req_webhook_test',
      logger: mocks.logger,
    });
    mocks.verifyWebhook.mockResolvedValue({ type: 'event' });
    mocks.applyVerifiedClerkBillingEvent.mockResolvedValue({ applied: true });
  });

  it('returns 429 when rate limited', async () => {
    mocks.checkIpRateLimit.mockImplementation(() => {
      throw new RateLimitError('limited');
    });

    const response = await POST(request({ 'svix-id': 'evt_1' }));

    expect(response.status).toBe(429);
    expect(mocks.verifyWebhook).not.toHaveBeenCalled();
  });

  it('returns 400 without a svix-id', async () => {
    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(mocks.verifyWebhook).not.toHaveBeenCalled();
  });

  it('returns 413 for oversized content-length', async () => {
    const response = await POST(
      request({
        'content-length': String(256 * 1024 + 1),
        'svix-id': 'evt_1',
      }),
    );

    expect(response.status).toBe(413);
    expect(mocks.verifyWebhook).not.toHaveBeenCalled();
  });

  it('returns 413 for an oversized streamed body', async () => {
    const response = await POST(
      request({ 'svix-id': 'evt_1' }, 'x'.repeat(256 * 1024 + 1)),
    );

    expect(response.status).toBe(413);
    expect(mocks.verifyWebhook).not.toHaveBeenCalled();
  });

  it('returns 400 when verification fails', async () => {
    mocks.verifyWebhook.mockRejectedValue(new Error('invalid signature'));

    const response = await POST(request({ 'svix-id': 'evt_1' }));

    expect(response.status).toBe(400);
    expect(mocks.applyVerifiedClerkBillingEvent).not.toHaveBeenCalled();
  });

  it('reconciles a verified event and returns the request ID', async () => {
    const event = { type: 'event' };
    mocks.verifyWebhook.mockResolvedValue(event);

    const response = await POST(request({ 'svix-id': 'evt_1' }));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-correlation-id')).toBe('req_webhook_test');
    expect(mocks.applyVerifiedClerkBillingEvent).toHaveBeenCalledWith(
      event,
      'evt_1',
      { logger: mocks.logger },
    );
  });
});
