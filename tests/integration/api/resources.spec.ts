import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';

// Mock Clerk auth before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

describe('GET /api/v1/resources', () => {
  const clerkUserId = 'clerk_resources_test_user';

  beforeEach(async () => {
    const { auth } = await import('@clerk/nextjs/server');
    vi.mocked(auth).mockResolvedValue({
      userId: clerkUserId,
    } as Awaited<ReturnType<typeof auth>>);

    setTestUser(clerkUserId);

    await ensureUser({
      clerkUserId,
      email: 'resources@example.com',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
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
    expect(body.error).toHaveProperty('message', 'Not Implemented');
    expect(body.error).toHaveProperty('code', 'NOT_IMPLEMENTED');
  });

  it('should require authentication', async () => {
    const { auth } = await import('@clerk/nextjs/server');
    vi.mocked(auth).mockResolvedValue({
      userId: null,
    } as Awaited<ReturnType<typeof auth>>);

    const { GET } = await import('@/app/api/v1/resources/route');
    const request = new NextRequest('http://localhost:3000/api/v1/resources', {
      method: 'GET',
    });

    const response = await GET(request);

    expect(response.status).toBe(401);
  });
});
