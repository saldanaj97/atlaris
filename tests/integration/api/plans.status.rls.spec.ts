import { db } from '@/lib/db/service-role';
import { learningPlans, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';

// Mock Clerk auth before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

describe('GET /api/v1/plans/:planId/status - access control', () => {
  let ownerUserId: string;
  let otherUserId: string;
  let ownerPlanId: string;
  let otherPlanId: string | null = null;
  const ownerClerkId = 'clerk_status_owner';
  const otherClerkId = 'clerk_status_other';

  beforeEach(async () => {
    // Mock Clerk to return the owner by default
    const { auth } = await import('@clerk/nextjs/server');
    vi.mocked(auth).mockResolvedValue({
      userId: ownerClerkId,
    } as Awaited<ReturnType<typeof auth>>);

    // Authenticate as owner for the route
    setTestUser(ownerClerkId);

    // Create owner and other users
    ownerUserId = await ensureUser({
      clerkUserId: ownerClerkId,
      email: 'status-owner@example.com',
    });
    otherUserId = await ensureUser({
      clerkUserId: otherClerkId,
      email: 'status-other@example.com',
    });

    // Create a plan for the owner
    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: ownerUserId,
        topic: 'RLS Status Plan',
        skillLevel: 'beginner',
        weeklyHours: 3,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();
    ownerPlanId = plan.id;
  });

  afterEach(async () => {
    // Clean up created rows
    if (ownerPlanId) {
      await db.delete(learningPlans).where(eq(learningPlans.id, ownerPlanId));
    }
    if (otherPlanId) {
      await db.delete(learningPlans).where(eq(learningPlans.id, otherPlanId));
      otherPlanId = null;
    }
    if (otherUserId) {
      await db.delete(users).where(eq(users.id, otherUserId));
    }
    if (ownerUserId) {
      await db.delete(users).where(eq(users.id, ownerUserId));
    }
    vi.clearAllMocks();
  });

  it('returns status for the owner plan (allowed)', async () => {
    const { GET } = await import('@/app/api/v1/plans/[planId]/status/route');
    const request = new NextRequest(
      `http://localhost:3000/api/v1/plans/${ownerPlanId}/status`,
      { method: 'GET' }
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.planId).toBe(ownerPlanId);
    expect(['pending', 'processing', 'ready', 'failed']).toContain(body.status);
  });

  it("returns 404 for another user's plan (denied)", async () => {
    // Create a plan for the other user
    const [otherPlan] = await db
      .insert(learningPlans)
      .values({
        userId: otherUserId,
        topic: 'Other Plan',
        skillLevel: 'beginner',
        weeklyHours: 3,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();
    otherPlanId = otherPlan.id;

    const { GET } = await import('@/app/api/v1/plans/[planId]/status/route');
    const request = new NextRequest(
      `http://localhost:3000/api/v1/plans/${otherPlan.id}/status`,
      { method: 'GET' }
    );
    const response = await GET(request);
    expect(response.status).toBe(404);
  });
});
