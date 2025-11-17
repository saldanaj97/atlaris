import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';

// Mock Clerk auth before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

describe('GET /api/v1/notifications/preferences', () => {
  const clerkUserId = 'clerk_notif_prefs_test_user';

  beforeEach(async () => {
    const { auth } = await import('@clerk/nextjs/server');
    vi.mocked(auth).mockResolvedValue({
      userId: clerkUserId,
    } as Awaited<ReturnType<typeof auth>>);

    setTestUser(clerkUserId);

    await ensureUser({
      clerkUserId,
      email: 'notif-prefs@example.com',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return 501 Not Implemented', async () => {
    const { GET } = await import(
      '@/app/api/v1/notifications/preferences/route'
    );
    const request = new NextRequest(
      'http://localhost:3000/api/v1/notifications/preferences',
      { method: 'GET' }
    );

    const response = await GET(request);

    expect(response.status).toBe(501);
    const body = await response.json();
    expect(body.error).toHaveProperty('code', 'NOT_IMPLEMENTED');
  });
});

describe('PUT /api/v1/notifications/preferences', () => {
  const clerkUserId = 'clerk_notif_update_test_user';

  beforeEach(async () => {
    const { auth } = await import('@clerk/nextjs/server');
    vi.mocked(auth).mockResolvedValue({
      userId: clerkUserId,
    } as Awaited<ReturnType<typeof auth>>);

    setTestUser(clerkUserId);

    await ensureUser({
      clerkUserId,
      email: 'notif-update@example.com',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return 501 Not Implemented', async () => {
    const { PUT } = await import(
      '@/app/api/v1/notifications/preferences/route'
    );
    const request = new NextRequest(
      'http://localhost:3000/api/v1/notifications/preferences',
      {
        method: 'PUT',
        body: JSON.stringify({ emailEnabled: true }),
      }
    );

    const response = await PUT(request);

    expect(response.status).toBe(501);
    const body = await response.json();
    expect(body.error).toHaveProperty('code', 'NOT_IMPLEMENTED');
  });
});
