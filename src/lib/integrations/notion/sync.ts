import { createHash } from 'node:crypto';
import { notionEnv } from '@/lib/config/env';
import { getDb } from '@/lib/db/runtime';
import {
  learningPlans,
  modules,
  tasks,
  notionSyncState,
} from '@/lib/db/schema';
import { asc, eq, inArray } from 'drizzle-orm';
import { mapFullPlanToBlocks } from './mapper';
import type { Task } from '@/lib/types/db';
import type { NotionIntegrationClient } from './types';

// Deterministic JSON stringify: sorts object keys recursively
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

function calculatePlanHash(plan: { [key: string]: unknown }): string {
  return createHash('sha256').update(stableStringify(plan)).digest('hex');
}

/**
 * Exports a plan to Notion using a pre-configured client.
 * This function is pure with respect to env and third-party client construction.
 */
export async function exportPlanToNotion(
  planId: string,
  userId: string,
  notionClient: NotionIntegrationClient
): Promise<string> {
  // Fetch plan with modules and tasks (RLS-enforced via getDb)
  const db = getDb();
  const [plan] = await db
    .select()
    .from(learningPlans)
    .where(eq(learningPlans.id, planId))
    .limit(1);

  if (!plan) {
    throw new Error('Plan not found');
  }

  // Ensure the plan belongs to the requesting user (double-check for safety)
  if (plan.userId !== userId) {
    throw new Error("Access denied: plan doesn't belong to user");
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

  // Combine data (optimize task grouping)
  const tasksByModuleId = new Map<string, Task[]>();
  for (const task of planTasks) {
    const list = tasksByModuleId.get(task.moduleId) ?? [];
    list.push(task);
    tasksByModuleId.set(task.moduleId, list);
  }

  // Build objects for hashing (full rows) and for Notion (minimal fields)
  const fullPlanForHash = {
    ...plan,
    modules: planModules.map((mod) => ({
      ...mod,
      tasks: (tasksByModuleId.get(mod.id) ?? []).sort(
        (a, b) => a.order - b.order
      ),
    })),
  };

  const minimalPlanForNotion = {
    topic: plan.topic,
    skillLevel: plan.skillLevel,
    weeklyHours: plan.weeklyHours,
    modules: planModules.map((mod) => ({
      title: mod.title,
      description: mod.description ?? null,
      estimatedMinutes: mod.estimatedMinutes,
      tasks: (tasksByModuleId.get(mod.id) ?? []).map((t) => ({
        title: t.title,
        description: t.description ?? null,
        estimatedMinutes: t.estimatedMinutes,
      })),
    })),
  };

  // Map to Notion blocks
  const blocks = mapFullPlanToBlocks(minimalPlanForNotion);

  // Create Notion page
  const parentPageId = notionEnv.parentPageId;

  const client = notionClient;
  const notionPage = await client.createPage({
    parent: {
      type: 'page_id',
      page_id: parentPageId,
    },
    properties: {
      title: {
        title: [{ type: 'text', text: { content: plan.topic } }],
      },
    },
    children: blocks,
  });

  // Calculate content hash for delta sync
  const contentHash = calculatePlanHash(fullPlanForHash);

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

/**
 * Delta sync: checks if plan changed and updates Notion page if needed.
 * This function is pure with respect to env and third-party client construction.
 */
export async function deltaSyncPlanToNotion(
  planId: string,
  userId: string,
  notionClient: NotionIntegrationClient
): Promise<boolean> {
  // Fetch current plan (RLS-enforced via getDb)
  const db = getDb();
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
    .orderBy(asc(modules.order));

  // Fetch all tasks for all modules in the plan
  const moduleIds = planModules.map((m) => m.id);
  const planTasks =
    moduleIds.length > 0
      ? await db
          .select()
          .from(tasks)
          .where(inArray(tasks.moduleId, moduleIds))
          .orderBy(asc(tasks.moduleId), asc(tasks.order))
      : [];

  // Build objects for hashing (full rows) and for Notion (minimal fields)
  const fullPlanForHash = {
    ...plan,
    modules: planModules.map((mod) => ({
      ...mod,
      tasks: planTasks.filter((t) => t.moduleId === mod.id),
    })),
  };

  const minimalPlanForNotion = {
    topic: plan.topic,
    skillLevel: plan.skillLevel,
    weeklyHours: plan.weeklyHours,
    modules: planModules.map((mod) => ({
      title: mod.title,
      description: mod.description ?? null,
      estimatedMinutes: mod.estimatedMinutes,
      tasks: planTasks
        .filter((t) => t.moduleId === mod.id)
        .map((t) => ({
          title: t.title,
          description: t.description ?? null,
          estimatedMinutes: t.estimatedMinutes,
        })),
    })),
  };

  const currentHash = calculatePlanHash(fullPlanForHash);

  // Check existing sync state
  const [syncState] = await db
    .select()
    .from(notionSyncState)
    .where(eq(notionSyncState.planId, planId))
    .limit(1);

  if (!syncState) {
    // No previous sync, do full export
    await exportPlanToNotion(planId, userId, notionClient);
    return true;
  }

  if (syncState.syncHash === currentHash) {
    // No changes detected
    return false;
  }

  // Changes detected, update Notion page
  const blocks = mapFullPlanToBlocks(minimalPlanForNotion);
  const client = notionClient;
  const pageId = syncState.notionPageId;

  // Update page title
  await client.updatePage({
    page_id: pageId,
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

  // Replace blocks (archives existing and appends new ones)

  await client.replaceBlocks(pageId, blocks);

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
