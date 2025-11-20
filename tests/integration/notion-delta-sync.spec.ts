import '../../mocks/integration/notion-client.integration';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { db } from '@/lib/db/service-role';
import {
  notionSyncState,
  learningPlans,
  modules,
  tasks,
  users,
} from '@/lib/db/schema';
import { deltaSyncPlanToNotion } from '@/lib/integrations/notion/sync';
import { eq } from 'drizzle-orm';
import { Client } from '@notionhq/client';

describe('Notion Delta Sync', () => {
  let testUserId: string;
  let testPlanId: string;

  beforeEach(async () => {
    // Clean up test data
    await db.delete(notionSyncState);
    await db.delete(tasks);
    await db.delete(modules);
    await db.delete(learningPlans);
    await db.delete(users);

    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        clerkUserId: `clerk_test_${Date.now()}`,
        email: `test-${Date.now()}@example.com`,
      })
      .returning();

    testUserId = user.id;

    // Create test plan
    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: testUserId,
        topic: 'Test Plan',
        skillLevel: 'beginner',
        weeklyHours: 10,
        learningStyle: 'mixed',
      })
      .returning();

    testPlanId = plan.id;
  });

  it('should detect changes via content hash', async () => {
    // Create initial sync state
    await db.insert(notionSyncState).values({
      planId: testPlanId,
      userId: testUserId,
      notionPageId: 'notion_page_123',
      syncHash: 'old_hash',
      lastSyncedAt: new Date('2025-01-01'),
    });

    // Mock Notion Client
    const mockUpdatePage = vi.fn().mockResolvedValue({ id: 'notion_page_123' });
    const mockAppendBlocks = vi.fn().mockResolvedValue({});
    const mockListChildren = vi.fn().mockResolvedValue({
      object: 'list',
      results: [],
      next_cursor: null,
      has_more: false,
      type: 'block',
    });
    const mockUpdateBlock = vi.fn().mockResolvedValue({});
    (Client as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      pages: {
        update: mockUpdatePage,
      },
      blocks: {
        update: mockUpdateBlock,
        children: {
          append: mockAppendBlocks,
          list: mockListChildren,
        },
      },
    }));

    const hasChanges = await deltaSyncPlanToNotion(testPlanId, 'test_token');

    expect(hasChanges).toBe(true);
    expect(mockUpdatePage).toHaveBeenCalled();
    expect(mockAppendBlocks).toHaveBeenCalled();
    expect(mockListChildren).toHaveBeenCalled();
  });

  it('should skip sync if no changes detected', async () => {
    // Create a module and task to establish a stable plan structure
    const [module] = await db
      .insert(modules)
      .values({
        planId: testPlanId,
        order: 1,
        title: 'Test Module',
        estimatedMinutes: 60,
      })
      .returning();

    await db.insert(tasks).values({
      moduleId: module.id,
      order: 1,
      title: 'Test Task',
      estimatedMinutes: 30,
    });

    // Fetch the plan structure to calculate the hash
    const [plan] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, testPlanId))
      .limit(1);

    const planModules = await db
      .select()
      .from(modules)
      .where(eq(modules.planId, testPlanId));

    // Fetch all tasks for all modules in the plan
    const allTasks = await db.select().from(tasks);
    const planTasks = allTasks.filter((t) =>
      planModules.some((m) => m.id === t.moduleId)
    );

    const fullPlan = {
      ...plan,
      modules: planModules.map((mod) => ({
        ...mod,
        tasks: planTasks.filter((t) => t.moduleId === mod.id),
      })),
    };

    // Calculate the hash the same way the function does (stable stringify)
    function stableStringify(obj: unknown): string {
      if (obj === null || typeof obj !== 'object') {
        return JSON.stringify(obj);
      }
      if (obj instanceof Date) {
        return JSON.stringify(obj.toJSON());
      }
      if (Array.isArray(obj)) {
        return '[' + obj.map(stableStringify).join(',') + ']';
      }
      const keys = Object.keys(obj).sort();
      return (
        '{' +
        keys
          .map(
            (k) =>
              JSON.stringify(k) +
              ':' +
              stableStringify((obj as Record<string, unknown>)[k])
          )
          .join(',') +
        '}'
      );
    }

    const currentHash = createHash('sha256')
      .update(stableStringify(fullPlan))
      .digest('hex');

    // Create sync state with the calculated hash
    await db.insert(notionSyncState).values({
      planId: testPlanId,
      userId: testUserId,
      notionPageId: 'notion_page_456',
      syncHash: currentHash,
      lastSyncedAt: new Date(),
    });

    // Call the function - it should detect no changes
    const hasChanges = await deltaSyncPlanToNotion(testPlanId, 'test_token');

    expect(hasChanges).toBe(false);
  });
});
