import { db } from '@/lib/db/drizzle';
import {
  learningPlans,
  modules,
  tasks,
  notionSyncState,
} from '@/lib/db/schema';
import { eq, inArray, asc } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import { NotionClient } from './client';
import { mapFullPlanToBlocks } from './mapper';
import { createHash } from 'node:crypto';

type LearningPlan = InferSelectModel<typeof learningPlans>;
type Module = InferSelectModel<typeof modules>;
type Task = InferSelectModel<typeof tasks>;

type FullPlan = LearningPlan & {
  modules: Array<Module & { tasks: Task[] }>;
};

export async function exportPlanToNotion(
  planId: string,
  userId: string,
  accessToken: string
): Promise<string> {
  // Fetch plan with modules and tasks, validating ownership
  const [plan] = await db
    .select()
    .from(learningPlans)
    .where(
      eq(learningPlans.id, planId),
      eq(learningPlans.userId, userId)
    )
    .limit(1);

  if (!plan) {
    throw new Error('Plan not found or access denied');
  }

  const planModules = await db
    .select()
    .from(modules)
    .where(eq(modules.planId, planId))
    .orderBy(asc(modules.order));

  // Get all module IDs
  const moduleIds = planModules.map((mod) => mod.id);

  // Fetch all tasks for all modules
  const planTasks =
    moduleIds.length > 0
      ? await db
          .select()
          .from(tasks)
          .where(inArray(tasks.moduleId, moduleIds))
          .orderBy(asc(tasks.moduleId), asc(tasks.order))
      : [];

  // Combine data
  const fullPlan: FullPlan = {
    ...plan,
    modules: planModules.map((mod) => ({
      ...mod,
      tasks: planTasks.filter((t) => t.moduleId === mod.id),
    })),
  };

  // Map to Notion blocks
  const blocks = mapFullPlanToBlocks(fullPlan);

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
  const contentHash = createHash('sha256')
    .update(JSON.stringify(fullPlan))
    .digest('hex');

  // Store sync state
  const pageId =
    'id' in notionPage && typeof notionPage.id === 'string'
      ? notionPage.id
      : '';

  await db
    .insert(notionSyncState)
    .values({
      planId,
      userId: plan.userId,
      notionPageId: pageId,
      syncHash: contentHash,
      lastSyncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [notionSyncState.planId],
      set: {
        userId: plan.userId,
        notionPageId: pageId,
        syncHash: contentHash,
        lastSyncedAt: new Date(),
      },
    });

  return pageId;
}
