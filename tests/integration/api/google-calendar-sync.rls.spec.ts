import { db } from '@/lib/db/drizzle';
import {
  integrationTokens,
  learningPlans,
  modules,
  tasks,
  users,
} from '@/lib/db/schema';
import { storeOAuthTokens } from '@/lib/integrations/oauth';
import { eq, inArray } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';

// Mock Clerk auth before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

// Mock googleapis (we only test access control here)
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

// Set encryption key for tests (64 hex characters = 32 bytes for AES-256)
if (!process.env.OAUTH_ENCRYPTION_KEY) {
  process.env.OAUTH_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
}

// Set Google OAuth credentials for tests
if (!process.env.GOOGLE_CLIENT_ID) {
  process.env.GOOGLE_CLIENT_ID = 'test_google_client_id';
}
if (!process.env.GOOGLE_CLIENT_SECRET) {
  process.env.GOOGLE_CLIENT_SECRET = 'test_google_client_secret';
}
if (!process.env.GOOGLE_REDIRECT_URI) {
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/oauth/callback';
}

describe('POST /api/v1/integrations/google-calendar/sync - access control', () => {
  let ownerUserId: string;
  let otherUserId: string;
  let otherPlanId: string;
  const ownerClerkId = 'clerk_gsync_owner';
  const otherClerkId = 'clerk_gsync_other';

  beforeEach(async () => {
    // Mock Clerk to return the owner by default
    const { auth } = await import('@clerk/nextjs/server');
    vi.mocked(auth).mockResolvedValue({
      userId: ownerClerkId,
    } as Awaited<ReturnType<typeof auth>>);

    // Authenticate as owner for the route
    setTestUser(ownerClerkId);

    // Ensure users
    ownerUserId = await ensureUser({
      clerkUserId: ownerClerkId,
      email: 'gsync-owner@example.com',
    });
    otherUserId = await ensureUser({
      clerkUserId: otherClerkId,
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
