import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';

// Mock Auth auth before importing the route
vi.mock('@/lib/auth/server', () => ({
  auth: { getSession: vi.fn() },
}));

describe('GET /api/v1/user/profile', () => {
  const authUserId = 'auth_profile_test_user';

  beforeEach(async () => {
    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { user: { id: authUserId } },
    });

    setTestUser(authUserId);

    await ensureUser({
      authUserId,
      email: 'profile@example.com',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return 501 Not Implemented', async () => {
    const { GET } = await import('@/app/api/v1/user/profile/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/user/profile',
      {
        method: 'GET',
      }
    );

    const response = await GET(request);

    expect(response.status).toBe(501);
    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('code', 'NOT_IMPLEMENTED');
  });
});

describe('PUT /api/v1/user/profile', () => {
  const authUserId = 'auth_profile_update_user';

  beforeEach(async () => {
    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { user: { id: authUserId } },
    });

    setTestUser(authUserId);

    await ensureUser({
      authUserId,
      email: 'update-profile@example.com',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return 501 Not Implemented', async () => {
    const { PUT } = await import('@/app/api/v1/user/profile/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/user/profile',
      {
        method: 'PUT',
        body: JSON.stringify({ name: 'New Name' }),
      }
    );

    const response = await PUT(request);

    expect(response.status).toBe(501);
    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('code', 'NOT_IMPLEMENTED');
  });
});
