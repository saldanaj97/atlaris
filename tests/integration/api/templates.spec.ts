import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { setTestUser, clearTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';

// Mock Auth auth before importing the route
vi.mock('@/lib/auth/server', () => ({
  auth: { getSession: vi.fn() },
}));

describe('GET /api/v1/templates', () => {
  const authUserId = 'auth_templates_test_user';

  beforeEach(async () => {
    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { user: { id: authUserId } },
    });

    setTestUser(authUserId);

    await ensureUser({
      authUserId,
      email: 'templates@example.com',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearTestUser();
  });

  it('should return 501 Not Implemented', async () => {
    const { GET } = await import('@/app/api/v1/templates/route');
    const request = new NextRequest('http://localhost:3000/api/v1/templates', {
      method: 'GET',
    });

    const response = await GET(request);

    expect(response.status).toBe(501);
    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toBe('Not Implemented');
    expect(body.code).toBe('NOT_IMPLEMENTED');
  });

  it('should require authentication', async () => {
    clearTestUser();

    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { user: null },
    });

    const { GET } = await import('@/app/api/v1/templates/route');
    const request = new NextRequest('http://localhost:3000/api/v1/templates', {
      method: 'GET',
    });

    const response = await GET(request);

    expect(response.status).toBe(401);
  });
});
