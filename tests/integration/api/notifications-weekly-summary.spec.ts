import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { setTestUser, clearTestUser } from '../../helpers/auth';
import { ensureUser, resetDbForIntegrationTestFile } from '../../helpers/db';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';

// Mock auth before importing the route
vi.mock('@/lib/auth/server', () => ({
  auth: { getSession: vi.fn() },
}));

describe('POST /api/v1/notifications/weekly-summary', () => {
  let authUserId: string;

  beforeEach(async () => {
    await resetDbForIntegrationTestFile();

    authUserId = buildTestAuthUserId('weekly-summary');
    const email = buildTestEmail(authUserId);

    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { user: { id: authUserId } },
    });

    setTestUser(authUserId);

    await ensureUser({
      authUserId,
      email,
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

    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { user: null },
    });

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
