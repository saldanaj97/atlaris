import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getOAuthTokens, storeOAuthTokens } from '@/lib/integrations/oauth';

import { createTestUser } from '../../fixtures/users';
import { clearTestUser, setTestUser } from '../../helpers/auth';

// Mock auth before importing the route
vi.mock('@/lib/auth/server', () => ({
  auth: { getSession: vi.fn() },
}));

describe('POST /api/v1/integrations/disconnect', () => {
  let testUser: Awaited<ReturnType<typeof createTestUser>>;

  beforeEach(async () => {
    testUser = await createTestUser({ email: 'disconnect@example.test' });

    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { user: { id: testUser.authUserId } },
    });

    setTestUser(testUser.authUserId);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    clearTestUser();
  });

  it('revokes Google access and refresh tokens and deletes integration tokens', async () => {
    await storeOAuthTokens({
      userId: testUser.id,
      provider: 'google_calendar',
      tokenData: {
        accessToken: 'test_access_token',
        refreshToken: 'test_refresh_token',
        scope: 'https://www.googleapis.com/auth/calendar',
      },
    });

    const fetchMock = vi
      .fn<(..._args: unknown[]) => Promise<Response>>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { POST } = await import('@/app/api/v1/integrations/disconnect/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/integrations/disconnect',
      {
        method: 'POST',
        body: JSON.stringify({ provider: 'google_calendar' }),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      provider: 'google_calendar',
      disconnected: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/revoke',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })
    );

    const requestBodies = fetchMock.mock.calls
      .map((call) => call[1] as RequestInit | undefined)
      .map((requestInit) => requestInit?.body);
    expect(requestBodies).toContain('token=test_access_token');
    expect(requestBodies).toContain('token=test_refresh_token');

    const remainingTokens = await getOAuthTokens(
      testUser.id,
      'google_calendar'
    );
    expect(remainingTokens).toBeNull();
  });

  it('returns 404 when no integration exists for provider', async () => {
    const fetchMock = vi
      .fn<(..._args: unknown[]) => Promise<Response>>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { POST } = await import('@/app/api/v1/integrations/disconnect/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/integrations/disconnect',
      {
        method: 'POST',
        body: JSON.stringify({ provider: 'google_calendar' }),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.code).toBe('NOT_FOUND');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 for unsupported provider payload', async () => {
    const { POST } = await import('@/app/api/v1/integrations/disconnect/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/integrations/disconnect',
      {
        method: 'POST',
        body: JSON.stringify({ provider: 'notion' }),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('continues deletion when access and refresh token revocation fails', async () => {
    await storeOAuthTokens({
      userId: testUser.id,
      provider: 'google_calendar',
      tokenData: {
        accessToken: 'stale_access_token',
        refreshToken: 'stale_refresh_token',
        scope: 'https://www.googleapis.com/auth/calendar',
      },
    });

    const fetchMock = vi
      .fn<(..._args: unknown[]) => Promise<Response>>()
      .mockResolvedValue(new Response(null, { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    const { POST } = await import('@/app/api/v1/integrations/disconnect/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/integrations/disconnect',
      {
        method: 'POST',
        body: JSON.stringify({ provider: 'google_calendar' }),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      provider: 'google_calendar',
      disconnected: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requestBodies = fetchMock.mock.calls
      .map((call) => call[1] as RequestInit | undefined)
      .map((requestInit) => requestInit?.body);
    expect(requestBodies).toContain('token=stale_access_token');
    expect(requestBodies).toContain('token=stale_refresh_token');

    const remainingTokens = await getOAuthTokens(
      testUser.id,
      'google_calendar'
    );
    expect(remainingTokens).toBeNull();
  });

  it('should require authentication', async () => {
    clearTestUser();

    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { user: null },
    });

    const { POST } = await import('@/app/api/v1/integrations/disconnect/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/integrations/disconnect',
      { method: 'POST' }
    );

    const response = await POST(request);

    expect(response.status).toBe(401);
  });
});
