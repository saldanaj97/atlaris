import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { setTestUser, clearTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
import { db } from '@/lib/db/service-role';
import { learningPlans } from '@/lib/db/schema';

// Mock auth before importing the route
vi.mock('@/lib/auth/server', () => ({
  auth: { getSession: vi.fn() },
}));

describe('GET /api/v1/user/subscription', () => {
  const authUserId = 'auth_subscription_test_user';
  let userId: string;

  beforeEach(async () => {
    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { user: { id: authUserId } },
    });

    setTestUser(authUserId);

    userId = await ensureUser({
      authUserId,
      email: 'subscription@example.com',
      subscriptionTier: 'free',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearTestUser();
  });

  it('should return subscription information for authenticated user', async () => {
    const { GET } = await import('@/app/api/v1/user/subscription/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/user/subscription',
      { method: 'GET' }
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toHaveProperty('tier', 'free');
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('periodEnd');
    expect(body).toHaveProperty('cancelAtPeriodEnd', false);
    expect(body).toHaveProperty('usage');
    expect(body.usage).toHaveProperty('activePlans');
    expect(body.usage).toHaveProperty('regenerations');
    expect(body.usage).toHaveProperty('exports');
  });

  it('should return usage metrics including active plans', async () => {
    // Create some plans for the user
    await db.insert(learningPlans).values([
      {
        userId,
        topic: 'TypeScript',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
        generationStatus: 'ready',
        isQuotaEligible: true,
        finalizedAt: new Date(),
      },
      {
        userId,
        topic: 'React',
        skillLevel: 'intermediate',
        weeklyHours: 10,
        learningStyle: 'practice',
        visibility: 'private',
        origin: 'ai',
        generationStatus: 'ready',
        isQuotaEligible: true,
        finalizedAt: new Date(),
      },
    ]);

    const { GET } = await import('@/app/api/v1/user/subscription/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/user/subscription',
      { method: 'GET' }
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.usage.activePlans.current).toBe(2);
  });

  it('should return 401 for unauthenticated requests', async () => {
    clearTestUser();

    // Mock auth to return null (unauthenticated)
    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { user: null },
    });

    const { GET } = await import('@/app/api/v1/user/subscription/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/user/subscription',
      { method: 'GET' }
    );

    const response = await GET(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  it('should handle pro tier subscriptions', async () => {
    await ensureUser({
      authUserId,
      email: 'subscription@example.com',
      subscriptionTier: 'pro',
    });

    const { GET } = await import('@/app/api/v1/user/subscription/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/user/subscription',
      { method: 'GET' }
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.tier).toBe('pro');
  });

  it('should handle starter tier subscriptions', async () => {
    await ensureUser({
      authUserId,
      email: 'subscription@example.com',
      subscriptionTier: 'starter',
    });

    const { GET } = await import('@/app/api/v1/user/subscription/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/user/subscription',
      { method: 'GET' }
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.tier).toBe('starter');
  });
});
