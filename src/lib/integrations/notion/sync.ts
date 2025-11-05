import { createHash } from 'node:crypto';
import { db } from '@/lib/db/drizzle';
import {
  learningPlans,
  modules,
  tasks,
  notionSyncState,
} from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { NotionClient } from './client';
import { mapFullPlanToBlocks } from './mapper';

function calculatePlanHash(plan: { [key: string]: unknown }): string {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}

export async function exportPlanToNotion(
  planId: string,
  accessToken: string
): Promise<string> {
  // Fetch plan with modules and tasks
  const [plan] = await db
    .select()
    .from(learningPlans)
    .where(eq(learningPlans.id, planId))
    .limit(1);

  if (!plan) {
    throw new Error('Plan not found');
  }

  const planModules = await db
    .select()
    .from(modules)
    .where(eq(modules.planId, planId))
    .orderBy(modules.order);

  // Fetch all tasks for all modules in the plan
  const moduleIds = planModules.map((m) => m.id);
  const planTasks =
    moduleIds.length > 0
      ? await db.select().from(tasks).where(inArray(tasks.moduleId, moduleIds))
      : [];

  // Combine data
  const fullPlan = {
    ...plan,
    modules: planModules.map((mod) => ({
      ...mod,
      tasks: planTasks.filter((t) => t.moduleId === mod.id),
    })),
  };

  // Map to Notion blocks
  const blocks = mapFullPlanToBlocks(
    fullPlan as {
      topic: string;
      skillLevel: string;
      weeklyHours: number;
      modules: Array<{
        title: string;
        description: string | null;
        estimatedMinutes: number;
        tasks: typeof planTasks;
      }>;
    }
  );

  // Create Notion page
  const client = new NotionClient(accessToken);
  const notionPage = await client.createPage({
    parent: {
      type: 'page_id',
      page_id: process.env.NOTION_PARENT_PAGE_ID || '',
    },
    properties: {
      title: {
        title: [{ type: 'text', text: { content: plan.topic } }],
      },
    },
    children: blocks,
  });

  // Calculate content hash for delta sync
  const contentHash = calculatePlanHash(fullPlan);

  // Store sync state
  await db.insert(notionSyncState).values({
    planId,
    userId: plan.userId,
    notionPageId: notionPage.id,
    syncHash: contentHash,
    lastSyncedAt: new Date(),
  });

  return notionPage.id;
}

export async function deltaSyncPlanToNotion(
  planId: string,
  accessToken: string
): Promise<boolean> {
  // Fetch current plan
  const [plan] = await db
    .select()
    .from(learningPlans)
    .where(eq(learningPlans.id, planId))
    .limit(1);

  if (!plan) {
    throw new Error('Plan not found');
  }

  const planModules = await db
    .select()
    .from(modules)
    .where(eq(modules.planId, planId))
    .orderBy(modules.order);

  // Fetch all tasks for all modules in the plan
  const moduleIds = planModules.map((m) => m.id);
  const planTasks =
    moduleIds.length > 0
      ? await db.select().from(tasks).where(inArray(tasks.moduleId, moduleIds))
      : [];

  const fullPlan = {
    ...plan,
    modules: planModules.map((mod) => ({
      ...mod,
      tasks: planTasks.filter((t) => t.moduleId === mod.id),
    })),
  };

  const currentHash = calculatePlanHash(fullPlan);

  // Check existing sync state
  const [syncState] = await db
    .select()
    .from(notionSyncState)
    .where(eq(notionSyncState.planId, planId))
    .limit(1);

  if (!syncState) {
    // No previous sync, do full export
    await exportPlanToNotion(planId, accessToken);
    return true;
  }

  if (syncState.syncHash === currentHash) {
    // No changes detected
    return false;
  }

  // Changes detected, update Notion page
  const blocks = mapFullPlanToBlocks(
    fullPlan as {
      topic: string;
      skillLevel: string;
      weeklyHours: number;
      modules: Array<{
        title: string;
        description: string | null;
        estimatedMinutes: number;
        tasks: typeof planTasks;
      }>;
    }
  );
  const client = new NotionClient(accessToken);

  // Clear existing blocks and append new ones
  // (Notion doesn't have a replace operation, so we update the page)
  await client.updatePage({
    page_id: syncState.notionPageId,
    properties: {
      title: {
        title: [
          {
            type: 'text' as const,
            text: { content: plan.topic },
          },
        ],
      },
    },
  });

  // Append updated blocks
  await client.appendBlocks(syncState.notionPageId, blocks);

  // Update sync state
  await db
    .update(notionSyncState)
    .set({
      syncHash: currentHash,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(notionSyncState.planId, planId));

  return true;
}
