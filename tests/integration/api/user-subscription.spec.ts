import { clearTestUser, setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db/users';
import { GET } from '@/app/api/v1/user/subscription/route';
import { TIER_LIMITS } from '@/shared/constants/tier-limits';
import { learningPlans, usageMetrics, users } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { mockServerSession } from '@tests/helpers/mock-server-auth';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serverAuth = vi.hoisted(() => {
  const getSession = vi.fn();
  return {
    getSession,
    module: () => ({ auth: { getSession } }),
  };
});
vi.mock('@/lib/auth/server', () => serverAuth.module());

describe('GET /api/v1/user/subscription', () => {
  const authUserId = 'auth_subscription_test_user';
  let userId: string;

  beforeEach(async () => {
    mockServerSession(serverAuth.getSession, authUserId);

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
    const before = await db
      .select()
      .from(usageMetrics)
      .where(eq(usageMetrics.userId, userId));
    expect(before).toHaveLength(0);

    const request = new NextRequest(
      'http://localhost:3000/api/v1/user/subscription',
      { method: 'GET' },
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toHaveProperty('tier', 'free');
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('periodEnd');
    expect(body).toHaveProperty('cancelAtPeriodEnd', false);
    expect(body).toHaveProperty('usage');
    expect(body.usage).toEqual({
      activePlans: { current: 0, limit: TIER_LIMITS.free.maxActivePlans },
      regenerations: { used: 0, limit: TIER_LIMITS.free.monthlyRegenerations },
    });
    expect(body.usage).not.toHaveProperty('exports');

    const after = await db
      .select()
      .from(usageMetrics)
      .where(eq(usageMetrics.userId, userId));
    expect(after).toHaveLength(0);
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

    const request = new NextRequest(
      'http://localhost:3000/api/v1/user/subscription',
      { method: 'GET' },
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.usage.activePlans.current).toBe(2);
  });

  it('should return 401 for unauthenticated requests', async () => {
    clearTestUser();

    // Mock auth to return null (unauthenticated)
    serverAuth.getSession.mockResolvedValue({
      data: { user: null },
    });

    const request = new NextRequest(
      'http://localhost:3000/api/v1/user/subscription',
      { method: 'GET' },
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

    const request = new NextRequest(
      'http://localhost:3000/api/v1/user/subscription',
      { method: 'GET' },
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.tier).toBe('pro');
    expect(body.usage).not.toHaveProperty('exports');
    expect(body.usage.activePlans).toEqual({ current: 0, limit: null });
    expect(body.usage.regenerations).toEqual({
      used: 0,
      limit: TIER_LIMITS.pro.monthlyRegenerations,
    });
    expect(body.usage).not.toHaveProperty('lessonGenerations');
  });

  it('should handle starter tier subscriptions', async () => {
    await ensureUser({
      authUserId,
      email: 'subscription@example.com',
      subscriptionTier: 'starter',
    });

    const request = new NextRequest(
      'http://localhost:3000/api/v1/user/subscription',
      { method: 'GET' },
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.tier).toBe('starter');
  });

  it('should return cancelAtPeriodEnd from the local database state', async () => {
    await db
      .update(users)
      .set({ cancelAtPeriodEnd: true })
      .where(eq(users.id, userId));

    const request = new NextRequest(
      'http://localhost:3000/api/v1/user/subscription',
      { method: 'GET' },
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.cancelAtPeriodEnd).toBe(true);
  });
});
