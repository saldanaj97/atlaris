import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db/service-role';
import {
  users,
  learningPlans,
  modules,
  tasks,
  notionSyncState,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { storeOAuthTokens } from '@/lib/integrations/oauth';
import { exportPlanToNotion } from '@/lib/integrations/notion/sync';
import { createSimpleMockNotionClient } from '../mocks/shared/notion-client.shared';

describe('Notion Export E2E Flow', () => {
  let userId: string;
  let planId: string;

  beforeEach(async () => {
    // Setup full test data
    await db.delete(notionSyncState);
    await db.delete(tasks);
    await db.delete(modules);
    await db.delete(learningPlans);
    await db.delete(users);

    const [user] = await db
      .insert(users)
      .values({
        clerkUserId: 'e2e_test_user',
        email: 'e2e@example.com',
      })
      .returning();
    userId = user.id;

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'E2E Test Plan',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        generationStatus: 'ready',
      })
      .returning();
    planId = plan.id;

    const [mod] = await db
      .insert(modules)
      .values({
        planId,
        title: 'Test Module',
        description: 'E2E test module',
        order: 1,
        estimatedMinutes: 60,
      })
      .returning();

    await db.insert(tasks).values({
      moduleId: mod.id,
      title: 'Test Task',
      description: 'E2E test task',
      order: 1,
      estimatedMinutes: 30,
    });

    await storeOAuthTokens({
      userId,
      provider: 'notion',
      tokenData: { accessToken: 'e2e_token', scope: 'notion' },
    });
  });

  it('should complete full Notion export workflow', async () => {
    const mockClient = createSimpleMockNotionClient('notion_page_e2e');

    const notionPageId = await exportPlanToNotion(planId, userId, mockClient);

    expect(notionPageId).toBe('notion_page_e2e');

    // Verify sync state created
    const [syncState] = await db
      .select()
      .from(notionSyncState)
      .where(eq(notionSyncState.planId, planId));

    expect(syncState).toBeDefined();
    expect(syncState.notionPageId).toBe('notion_page_e2e');
    expect(syncState.syncHash).toBeTruthy();
  });
});
