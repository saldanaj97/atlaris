import { eq, inArray } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/service-role';
import {
  integrationTokens,
  learningPlans,
  modules,
  tasks,
  users,
} from '@/lib/db/schema';
import { storeOAuthTokens } from '@/lib/integrations/oauth';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';

// Mock auth before importing the route
vi.mock('@/lib/auth/server', () => ({
  auth: { getSession: vi.fn() },
}));

// Mock googleapis
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: vi.fn(),
      })),
    },
    calendar: vi.fn().mockReturnValue({
      events: {
        insert: vi.fn().mockResolvedValue({
          data: { id: 'event_123', status: 'confirmed' },
        }),
      },
    }),
  },
}));

describe.skip('POST /api/v1/integrations/google-calendar/sync - access control (temporarily disabled)', () => {
  let ownerUserId: string;
  let otherUserId: string;
  let otherPlanId: string;
  const ownerAuthId = 'auth_gsync_owner';
  const otherAuthId = 'auth_gsync_other';

  beforeEach(async () => {
    // Mock Auth to return the owner by default
    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { user: { id: ownerAuthId } },
    });

    // Authenticate as owner for the route
    setTestUser(ownerAuthId);

    // Ensure users
    ownerUserId = await ensureUser({
      authUserId: ownerAuthId,
      email: 'gsync-owner@example.com',
    });
    otherUserId = await ensureUser({
      authUserId: otherAuthId,
      email: 'gsync-other@example.com',
    });

    // Store Google tokens for the owner (required by the route)
    await storeOAuthTokens({
      userId: ownerUserId,
      provider: 'google_calendar',
      tokenData: {
        accessToken: 'test_google_token',
        refreshToken: 'test_refresh_token',
        scope: 'https://www.googleapis.com/auth/calendar',
      },
    });

    // Create a plan for the other user
    const [otherPlan] = await db
      .insert(learningPlans)
      .values({
        userId: otherUserId,
        topic: 'Other User Plan',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        generationStatus: 'ready',
      })
      .returning();
    otherPlanId = otherPlan.id;
  });

  afterEach(async () => {
    // Clean up created rows
    if (otherPlanId) {
      // Delete tasks belonging to modules of the plan first
      const planModules = await db
        .select({ id: modules.id })
        .from(modules)
        .where(eq(modules.planId, otherPlanId));
      const moduleIds = planModules.map((m) => m.id);
      if (moduleIds.length > 0) {
        await db.delete(tasks).where(inArray(tasks.moduleId, moduleIds));
      }
      await db.delete(modules).where(eq(modules.planId, otherPlanId));
      await db.delete(learningPlans).where(eq(learningPlans.id, otherPlanId));
    }
    if (ownerUserId) {
      await db
        .delete(integrationTokens)
        .where(eq(integrationTokens.userId, ownerUserId));
      await db.delete(users).where(eq(users.id, ownerUserId));
    }
    if (otherUserId) {
      await db.delete(users).where(eq(users.id, otherUserId));
    }
    vi.clearAllMocks();
  });

  it("returns 404 when trying to sync another user's plan (denied)", async () => {
    const { POST } = await import(
      '@/app/api/v1/integrations/google-calendar/sync/route'
    );

    const request = new NextRequest(
      'http://localhost:3000/api/v1/integrations/google-calendar/sync',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: otherPlanId }),
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(404);
  });
});
