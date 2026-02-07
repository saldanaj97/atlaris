/**
 * Integration tests for curation persistence
 * Tests: end-to-end upsert+attach 1-3 resources for a fake task
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/service-role';
import {
  resources,
  taskResources,
  tasks,
  modules,
  learningPlans,
  users,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { upsertAndAttach } from '@/lib/db/queries/resources';
import type { ResourceCandidate } from '@/lib/curation/types';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';

describe('Curation Persistence Integration', () => {
  let testUserId: string;
  let testPlanId: string;
  let testModuleId: string;
  let testTaskId: string;

  beforeEach(async () => {
    const authUserId = buildTestAuthUserId('curation-persistence');

    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        authUserId,
        email: buildTestEmail(authUserId),
        subscriptionTier: 'free',
      })
      .returning();
    testUserId = user.id;

    // Create test plan
    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: testUserId,
        topic: 'React Learning',
        skillLevel: 'beginner',
        weeklyHours: 5,
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
        title: 'Getting Started',
        estimatedMinutes: 60,
      })
      .returning();
    testModuleId = module.id;

    // Create test task
    const [task] = await db
      .insert(tasks)
      .values({
        moduleId: testModuleId,
        order: 1,
        title: 'Learn React Basics',
        estimatedMinutes: 30,
      })
      .returning();
    testTaskId = task.id;
  });

  afterEach(async () => {
    // Clean up test data
    await db.delete(taskResources);
    await db.delete(resources);
    await db.delete(tasks);
    await db.delete(modules);
    await db.delete(learningPlans);
    await db.delete(users);
  });

  it('should upsert and attach resources end-to-end', async () => {
    const candidates: ResourceCandidate[] = [
      {
        url: 'https://react.dev/docs',
        title: 'React Official Documentation',
        source: 'doc',
        score: {
          blended: 0.9,
          components: { authority: 1.0, relevance: 0.8, recency: 0.8 },
          scoredAt: new Date().toISOString(),
        },
        metadata: {
          query: 'react basics',
        },
      },
      {
        url: 'https://youtube.com/watch?v=test123',
        title: 'React Tutorial Video',
        source: 'youtube',
        score: {
          blended: 0.85,
          components: {
            popularity: 0.8,
            recency: 0.9,
            relevance: 0.8,
          },
          scoredAt: new Date().toISOString(),
        },
        metadata: {
          videoId: 'test123',
          viewCount: 100000,
          publishedAt: '2023-01-01T00:00:00Z',
          durationMinutes: 15,
        },
      },
    ];

    const resourceIds = await upsertAndAttach(testTaskId, candidates);

    expect(resourceIds).toHaveLength(2);

    // Verify resources were created
    const createdResources = await db
      .select()
      .from(resources)
      .where(eq(resources.id, resourceIds[0]));

    const createdResources2 = await db
      .select()
      .from(resources)
      .where(eq(resources.id, resourceIds[1]));

    const allResources = [...createdResources, ...createdResources2];

    expect(allResources).toHaveLength(2);
    const docResource = allResources.find((r) => r.type === 'doc');
    const youtubeResource = allResources.find((r) => r.type === 'youtube');
    expect(docResource).toBeDefined();
    expect(youtubeResource).toBeDefined();

    // Verify task attachments with stable ordering
    const attachments = await db
      .select()
      .from(taskResources)
      .where(eq(taskResources.taskId, testTaskId))
      .orderBy(taskResources.order);

    expect(attachments).toHaveLength(2);
    expect(attachments[0].order).toBe(1);
    expect(attachments[1].order).toBe(2);
    expect(attachments[0].resourceId).toBe(resourceIds[0]);
    expect(attachments[1].resourceId).toBe(resourceIds[1]);
  });

  it('should handle up to 3 resources', async () => {
    const candidates: ResourceCandidate[] = [
      {
        url: 'https://example.com/doc1',
        title: 'Documentation 1',
        source: 'doc',
        score: {
          blended: 0.8,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {},
      },
      {
        url: 'https://example.com/doc2',
        title: 'Documentation 2',
        source: 'doc',
        score: {
          blended: 0.8,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {},
      },
      {
        url: 'https://example.com/doc3',
        title: 'Documentation 3',
        source: 'doc',
        score: {
          blended: 0.8,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {},
      },
    ];

    const resourceIds = await upsertAndAttach(testTaskId, candidates);

    expect(resourceIds).toHaveLength(3);

    const attachments = await db
      .select()
      .from(taskResources)
      .where(eq(taskResources.taskId, testTaskId))
      .orderBy(taskResources.order);

    expect(attachments).toHaveLength(3);
    expect(attachments.map((a) => a.order)).toEqual([1, 2, 3]);
  });

  it('should prevent duplicate attachments', async () => {
    const candidate: ResourceCandidate = {
      url: 'https://example.com/unique-resource',
      title: 'Unique Resource',
      source: 'doc',
      score: {
        blended: 0.8,
        components: {},
        scoredAt: new Date().toISOString(),
      },
      metadata: {},
    };

    // Attach same resource twice
    await upsertAndAttach(testTaskId, [candidate]);
    await upsertAndAttach(testTaskId, [candidate]);

    const attachments = await db
      .select()
      .from(taskResources)
      .where(eq(taskResources.taskId, testTaskId));

    // Should only have one attachment (idempotent)
    expect(attachments).toHaveLength(1);
  });
});
