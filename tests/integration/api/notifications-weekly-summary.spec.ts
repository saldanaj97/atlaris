import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { setTestUser, clearTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';

// Mock Clerk auth before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

describe('POST /api/v1/notifications/weekly-summary', () => {
  const clerkUserId = 'clerk_weekly_summary_test_user';

  beforeEach(async () => {
    const { auth } = await import('@clerk/nextjs/server');
    vi.mocked(auth).mockResolvedValue({
      userId: clerkUserId,
    } as Awaited<ReturnType<typeof auth>>);

    setTestUser(clerkUserId);

    await ensureUser({
      clerkUserId,
      email: 'weekly-summary@example.com',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearTestUser();
  });

  it('should return 501 Not Implemented', async () => {
    const { POST } = await import(
      '@/app/api/v1/notifications/weekly-summary/route'
    );
    const request = new NextRequest(
      'http://localhost:3000/api/v1/notifications/weekly-summary',
      { method: 'POST' }
    );

    const response = await POST(request);

    expect(response.status).toBe(501);
    const body = await response.json();
    expect(body.error).toHaveProperty('code', 'NOT_IMPLEMENTED');
  });

  it('should require authentication', async () => {
    clearTestUser();

    const { auth } = await import('@clerk/nextjs/server');
    vi.mocked(auth).mockResolvedValue({
      userId: null,
    } as Awaited<ReturnType<typeof auth>>);

    const { POST } = await import(
      '@/app/api/v1/notifications/weekly-summary/route'
    );
    const request = new NextRequest(
      'http://localhost:3000/api/v1/notifications/weekly-summary',
      { method: 'POST' }
    );

    const response = await POST(request);

    expect(response.status).toBe(401);
  });
});
