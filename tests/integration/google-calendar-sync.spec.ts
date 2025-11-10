import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  users,
  learningPlans,
  modules,
  tasks,
  integrationTokens,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { storeOAuthTokens } from '@/lib/integrations/oauth';
import { ensureUser } from '../helpers/db';
import { setTestUser } from '../helpers/auth';

// Mock Clerk auth before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
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

describe('Google Calendar Sync API', () => {
  let testUserId: string;
  let testPlanId: string;
  let testModuleId: string;
  const clerkUserId = 'clerk_google_sync_test';
  const createdTaskIds: string[] = [];

  beforeEach(async () => {
    // Mock Clerk auth to return test user
    const { auth } = await import('@clerk/nextjs/server');
    vi.mocked(auth).mockResolvedValue({
      userId: clerkUserId,
    } as Awaited<ReturnType<typeof auth>>);

    // Ensure route handlers authenticate as this test user
    setTestUser(clerkUserId);

    // Ensure test user
    testUserId = await ensureUser({
      clerkUserId,
      email: 'google-sync-test@example.com',
    });

    // Create test plan
    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: testUserId,
        topic: 'Test Google Sync',
        skillLevel: 'beginner',
        weeklyHours: 10,
        learningStyle: 'mixed',
        generationStatus: 'ready',
      })
      .returning();
    testPlanId = plan.id;

    // Create test module
    const [module] = await db
      .insert(modules)
      .values({
        planId: testPlanId,
        order: 1,
        title: 'Test Module',
        description: 'Test module description',
        estimatedMinutes: 120,
      })
      .returning();
    testModuleId = module.id;

    // Create test tasks
    const createdTasks = await db
      .insert(tasks)
      .values([
        {
          moduleId: testModuleId,
          order: 1,
          title: 'Task 1',
          description: 'First task',
          estimatedMinutes: 60,
        },
        {
          moduleId: testModuleId,
          order: 2,
          title: 'Task 2',
          description: 'Second task',
          estimatedMinutes: 60,
        },
      ])
      .returning({ id: tasks.id });

    createdTaskIds.push(...createdTasks.map((t) => t.id));

    // Store Google Calendar token
    await storeOAuthTokens({
      userId: testUserId,
      provider: 'google_calendar',
      tokenData: {
        accessToken: 'test_google_token',
        refreshToken: 'test_refresh_token',
        scope: 'https://www.googleapis.com/auth/calendar',
      },
    });
  });

  it('should create calendar events for plan tasks', async () => {
    const { POST } = await import(
      '@/app/api/v1/integrations/google-calendar/sync/route'
    );

    const request = new NextRequest(
      'http://localhost:3000/api/v1/integrations/google-calendar/sync',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: testPlanId }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.eventsCreated).toBeGreaterThan(0);
  });

  it('should return 401 if no Google Calendar token found', async () => {
    const { POST } = await import(
      '@/app/api/v1/integrations/google-calendar/sync/route'
    );

    // Delete Google Calendar tokens for this user
    const { integrationTokens } = await import('@/lib/db/schema');
    const { and, eq } = await import('drizzle-orm');
    await db
      .delete(integrationTokens)
      .where(
        and(
          eq(integrationTokens.userId, testUserId),
          eq(integrationTokens.provider, 'google_calendar')
        )
      );

    const request = new NextRequest(
      'http://localhost:3000/api/v1/integrations/google-calendar/sync',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: testPlanId }),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('should return 400 if planId is missing', async () => {
    const { POST } = await import(
      '@/app/api/v1/integrations/google-calendar/sync/route'
    );

    const request = new NextRequest(
      'http://localhost:3000/api/v1/integrations/google-calendar/sync',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  afterEach(async () => {
    // Clean up test data in reverse order of creation to satisfy foreign key constraints
    if (createdTaskIds.length > 0) {
      await db.delete(tasks).where(eq(tasks.moduleId, testModuleId));
    }
    if (testModuleId) {
      await db.delete(modules).where(eq(modules.id, testModuleId));
    }
    if (testPlanId) {
      await db.delete(learningPlans).where(eq(learningPlans.id, testPlanId));
    }
    if (testUserId) {
      await db
        .delete(integrationTokens)
        .where(eq(integrationTokens.userId, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }

    // Clear mocks
    vi.clearAllMocks();

    // Reset tracked IDs
    createdTaskIds.length = 0;
  });
});
