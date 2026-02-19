import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_RATE_LIMIT_RETRY_AFTER_SECONDS,
  createAuthRequest,
  createRouteContext,
} from '../../fixtures/api';
import { mockRateLimitExceeded } from '../../mocks/shared/ip-rate-limit';

import * as AuthRoute from '@/app/api/auth/[...path]/route';

const mocks = vi.hoisted(() => ({
  mockGetHandler: vi.fn(),
  mockPostHandler: vi.fn(),
  mockCheckIpRateLimit: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  auth: {
    handler: () => ({
      GET: mocks.mockGetHandler,
      POST: mocks.mockPostHandler,
    }),
  },
}));

function getMockHandlers(): ReturnType<typeof AuthRoute.createAuthHandlers> {
  return AuthRoute.createAuthHandlers({
    checkIpRateLimit: mocks.mockCheckIpRateLimit,
  });
}

describe('auth catch-all route rate limiting', () => {
  beforeEach(() => {
    mocks.mockGetHandler.mockReset();
    mocks.mockPostHandler.mockReset();
    mocks.mockCheckIpRateLimit.mockReset();
  });

  afterEach(() => {
    mocks.mockGetHandler.mockReset();
    mocks.mockPostHandler.mockReset();
    mocks.mockCheckIpRateLimit.mockReset();
  });

  it('applies auth IP rate limit and delegates GET handler', async () => {
    const expectedResponse = new Response('ok', { status: 200 });
    mocks.mockGetHandler.mockResolvedValue(expectedResponse);

    const { GET } = getMockHandlers();

    const request = createAuthRequest('/sign-in');
    const context = createRouteContext(['sign-in']);
    const response = await GET(request, context);

    expect(response).toBe(expectedResponse);
    expect(mocks.mockCheckIpRateLimit).toHaveBeenCalledWith(request, 'auth');
    expect(mocks.mockGetHandler).toHaveBeenCalledWith(request, context);
  });

  it('returns standardized 429 response when auth IP limit is exceeded', async () => {
    mocks.mockCheckIpRateLimit.mockImplementation(
      mockRateLimitExceeded(
        AUTH_RATE_LIMIT_RETRY_AFTER_SECONDS,
        'Too many auth attempts'
      )
    );

    const { GET } = getMockHandlers();

    const request = createAuthRequest('/sign-in');
    const context = createRouteContext(['sign-in']);
    const response = await GET(request, context);
    const body = (await response.json()) as {
      code?: string;
      retryAfter?: number;
    };

    expect(response.status).toBe(429);
    expect(body.code).toBe('RATE_LIMITED');
    expect(body.retryAfter).toBe(AUTH_RATE_LIMIT_RETRY_AFTER_SECONDS);
    expect(mocks.mockGetHandler).not.toHaveBeenCalled();
  });

  it('returns standardized 429 response for POST when auth IP limit is exceeded', async () => {
    mocks.mockCheckIpRateLimit.mockImplementation(
      mockRateLimitExceeded(
        AUTH_RATE_LIMIT_RETRY_AFTER_SECONDS,
        'Too many auth attempts'
      )
    );

    const { POST } = getMockHandlers();

    const request = createAuthRequest('/sign-up', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com' }),
    });
    const context = createRouteContext(['sign-up']);
    const response = await POST(request, context);
    const body = (await response.json()) as {
      code?: string;
      retryAfter?: number;
    };

    expect(response.status).toBe(429);
    expect(body.code).toBe('RATE_LIMITED');
    expect(body.retryAfter).toBe(AUTH_RATE_LIMIT_RETRY_AFTER_SECONDS);
    expect(mocks.mockPostHandler).not.toHaveBeenCalled();
  });

  it('returns standardized 500 response when auth IP limiter throws unexpectedly', async () => {
    mocks.mockCheckIpRateLimit.mockRejectedValue(
      new Error('limiter unavailable')
    );

    const { GET } = getMockHandlers();

    const request = createAuthRequest('/sign-in');
    const context = createRouteContext(['sign-in']);
    const response = await GET(request, context);
    const body = (await response.json()) as {
      code?: string;
      error?: string;
    };

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.error).toBe('Internal Server Error');
    expect(mocks.mockGetHandler).not.toHaveBeenCalled();
  });

  it('returns standardized 500 response when auth handler throws unexpectedly', async () => {
    mocks.mockPostHandler.mockRejectedValue(new Error('auth handler failed'));

    const { POST } = getMockHandlers();

    const request = createAuthRequest('/sign-up', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com' }),
    });
    const context = createRouteContext(['sign-up']);
    const response = await POST(request, context);
    const body = (await response.json()) as {
      code?: string;
      error?: string;
    };

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.error).toBe('Internal Server Error');
    expect(mocks.mockCheckIpRateLimit).toHaveBeenCalledWith(request, 'auth');
    expect(mocks.mockPostHandler).toHaveBeenCalledWith(request, context);
  });

  it('applies auth IP rate limit and delegates POST handler', async () => {
    const expectedResponse = new Response('created', { status: 201 });
    mocks.mockPostHandler.mockResolvedValue(expectedResponse);

    const { POST } = getMockHandlers();

    const request = createAuthRequest('/sign-up', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com' }),
    });
    const context = createRouteContext(['sign-up']);
    const response = await POST(request, context);

    expect(response).toBe(expectedResponse);
    expect(mocks.mockCheckIpRateLimit).toHaveBeenCalledWith(request, 'auth');
    expect(mocks.mockPostHandler).toHaveBeenCalledWith(request, context);
  });
});
