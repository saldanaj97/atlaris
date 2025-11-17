import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
import { db } from '@/lib/db/drizzle';
import { learningPlans } from '@/lib/db/schema';

// Mock Clerk auth before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

describe('GET /api/v1/user/subscription', () => {
  const clerkUserId = 'clerk_subscription_test_user';
  let userId: string;

  beforeEach(async () => {
    const { auth } = await import('@clerk/nextjs/server');
    vi.mocked(auth).mockResolvedValue({
      userId: clerkUserId,
    } as Awaited<ReturnType<typeof auth>>);

    setTestUser(clerkUserId);

    userId = await ensureUser({
      clerkUserId,
      email: 'subscription@example.com',
      subscriptionTier: 'free',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
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
    // Ensure withAuth does not use DEV_CLERK_USER_ID fallback
    delete process.env.DEV_CLERK_USER_ID;

    // Mock auth to return null (unauthenticated)
    const { auth } = await import('@clerk/nextjs/server');
    vi.mocked(auth).mockResolvedValue({
      userId: null,
    } as Awaited<ReturnType<typeof auth>>);

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
      clerkUserId,
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
      clerkUserId,
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
