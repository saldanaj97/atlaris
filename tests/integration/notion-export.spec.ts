import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db/service-role';
import { users, learningPlans, integrationTokens } from '@/lib/db/schema';
import { storeOAuthTokens } from '@/lib/integrations/oauth';
import { ensureUser } from '../helpers/db';
import { setTestUser } from '../helpers/auth';

// Mock Clerk auth before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

// Mock Notion API client
vi.mock('@/lib/integrations/notion/client', () => ({
  NotionClient: vi.fn().mockImplementation(() => ({
    createPage: vi.fn().mockResolvedValue({ id: 'notion_page_123' }),
  })),
}));

describe('Notion Export API', () => {
  let testUserId: string;
  let testPlanId: string;
  const clerkUserId = 'clerk_notion_export_test';

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
      email: 'notion-export-test@example.com',
    });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: testUserId,
        topic: 'Test Topic',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        generationStatus: 'ready',
      })
      .returning();
    testPlanId = plan.id;

    // Store Notion token
    await storeOAuthTokens({
      userId: testUserId,
      provider: 'notion',
      tokenData: { accessToken: 'test_token', scope: 'notion' },
    });
  });

  it('should export plan to Notion and return page ID', async () => {
    const { POST } = await import(
      '@/app/api/v1/integrations/notion/export/route'
    );

    const request = new NextRequest(
      'http://localhost:3000/api/v1/integrations/notion/export',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: testPlanId }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.notionPageId).toBe('notion_page_123');
  });

  it('should return 401 if no Notion token found', async () => {
    const { POST } = await import(
      '@/app/api/v1/integrations/notion/export/route'
    );

    await db.delete(integrationTokens);

    const request = new NextRequest(
      'http://localhost:3000/api/v1/integrations/notion/export',
      {
        method: 'POST',
        body: JSON.stringify({ planId: testPlanId }),
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('should return 400 for invalid planId format', async () => {
    const { POST } = await import(
      '@/app/api/v1/integrations/notion/export/route'
    );

    const request = new NextRequest(
      'http://localhost:3000/api/v1/integrations/notion/export',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: 'invalid-uuid' }),
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('should return 404 for non-existent plan', async () => {
    const { POST } = await import(
      '@/app/api/v1/integrations/notion/export/route'
    );

    const nonExistentPlanId = '00000000-0000-0000-0000-000000000000';
    const request = new NextRequest(
      'http://localhost:3000/api/v1/integrations/notion/export',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: nonExistentPlanId }),
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(404);
  });

  it("should return 403 when trying to export another user's plan", async () => {
    // Create another user and their plan
    const [otherUser] = await db
      .insert(users)
      .values({
        clerkUserId: 'other-user',
        email: 'other@example.com',
      })
      .returning();

    const [otherPlan] = await db
      .insert(learningPlans)
      .values({
        userId: otherUser.id,
        topic: 'Other User Plan',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        generationStatus: 'ready',
      })
      .returning();

    const { POST } = await import(
      '@/app/api/v1/integrations/notion/export/route'
    );

    const request = new NextRequest(
      'http://localhost:3000/api/v1/integrations/notion/export',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: otherPlan.id }),
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(403);
  });
});
