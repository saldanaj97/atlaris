import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { setTestUser, clearTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
import { auth } from '../../mocks/shared/auth-server';

const authUserId = 'auth_resources_test_user';

const authenticatedSession = {
  data: {
    user: {
      id: authUserId,
      email: 'resources@example.com',
      name: 'Resources Test',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    },
  },
} as const;

describe('GET /api/v1/resources', () => {
  beforeEach(async () => {
    vi.mocked(auth.getSession).mockResolvedValue(authenticatedSession);

    setTestUser(authUserId);

    await ensureUser({
      authUserId,
      email: 'resources@example.com',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearTestUser();
  });

  it('should return 501 Not Implemented', async () => {
    const { GET } = await import('@/app/api/v1/resources/route');
    const request = new NextRequest('http://localhost:3000/api/v1/resources', {
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

    vi.mocked(auth.getSession).mockResolvedValue({ data: null });

    const { GET } = await import('@/app/api/v1/resources/route');
    const request = new NextRequest('http://localhost:3000/api/v1/resources', {
      method: 'GET',
    });

    const response = await GET(request);

    expect(response.status).toBe(401);
  });
});
