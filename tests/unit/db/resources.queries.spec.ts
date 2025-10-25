/**
 * Unit tests for DB resources queries
 * Tests: upsert by URL, type mapping, attachment order/idempotency
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/drizzle';
import {
  resources,
  taskResources,
  tasks,
  modules,
  learningPlans,
  users,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  upsertResource,
  attachTaskResources,
  upsertAndAttach,
} from '@/lib/db/queries/resources';
import type { ResourceCandidate } from '@/lib/curation/types';

describe('DB Resources Queries', () => {
  let testUserId: string;
  let testPlanId: string;
  let testModuleId: string;
  let testTaskId: string;

  beforeEach(async () => {
    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        clerkUserId: 'test-clerk-id',
        email: 'test@example.com',
        subscriptionTier: 'free',
      })
      .returning();
    testUserId = user.id;

    // Create test plan
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

    // Create test module
    const [module] = await db
      .insert(modules)
      .values({
        planId: testPlanId,
        order: 1,
        title: 'Test Module',
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
        title: 'Test Task',
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

  describe('upsertResource', () => {
    it('should create new resource', async () => {
      const candidate: ResourceCandidate = {
        url: 'https://youtube.com/watch?v=test123',
        title: 'Test Video',
        source: 'youtube',
        score: {
          blended: 0.8,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {
          videoId: 'test123',
          durationMinutes: 10,
        },
      };

      const resourceId = await upsertResource(candidate);

      expect(resourceId).toBeDefined();

      const [resource] = await db
        .select()
        .from(resources)
        .where(eq(resources.id, resourceId));

      expect(resource.type).toBe('youtube');
      expect(resource.title).toBe('Test Video');
      expect(resource.url).toBe('https://youtube.com/watch?v=test123');
      expect(resource.durationMinutes).toBe(10);
    });

    it('should deduplicate by URL', async () => {
      const candidate: ResourceCandidate = {
        url: 'https://react.dev/docs',
        title: 'React Docs',
        source: 'doc',
        score: {
          blended: 0.8,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {},
      };

      const resourceId1 = await upsertResource(candidate);
      const resourceId2 = await upsertResource(candidate);

      expect(resourceId1).toBe(resourceId2);

      const allResources = await db.select().from(resources);
      expect(allResources).toHaveLength(1);
    });

    it('should map source types correctly', async () => {
      const youtubeCandidate: ResourceCandidate = {
        url: 'https://youtube.com/watch?v=test',
        title: 'YouTube Video',
        source: 'youtube',
        score: {
          blended: 0.8,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {},
      };

      const docCandidate: ResourceCandidate = {
        url: 'https://example.com/docs',
        title: 'Documentation',
        source: 'doc',
        score: {
          blended: 0.8,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {},
      };

      const youtubeId = await upsertResource(youtubeCandidate);
      const docId = await upsertResource(docCandidate);

      const [youtubeResource] = await db
        .select()
        .from(resources)
        .where(eq(resources.id, youtubeId));
      const [docResource] = await db
        .select()
        .from(resources)
        .where(eq(resources.id, docId));

      expect(youtubeResource.type).toBe('youtube');
      expect(docResource.type).toBe('doc');
    });
  });

  describe('attachTaskResources', () => {
    it('should attach resources with stable ordering', async () => {
      const resource1 = await upsertResource({
        url: 'https://example.com/resource1',
        title: 'Resource 1',
        source: 'doc',
        score: {
          blended: 0.8,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {},
      });

      const resource2 = await upsertResource({
        url: 'https://example.com/resource2',
        title: 'Resource 2',
        source: 'doc',
        score: {
          blended: 0.8,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {},
      });

      await attachTaskResources(testTaskId, [resource1, resource2]);

      const attachments = await db
        .select()
        .from(taskResources)
        .where(eq(taskResources.taskId, testTaskId))
        .orderBy(taskResources.order);

      expect(attachments).toHaveLength(2);
      expect(attachments[0].order).toBe(1);
      expect(attachments[0].resourceId).toBe(resource1);
      expect(attachments[1].order).toBe(2);
      expect(attachments[1].resourceId).toBe(resource2);
    });

    it('should be idempotent on duplicate inserts', async () => {
      const resourceId = await upsertResource({
        url: 'https://example.com/resource',
        title: 'Resource',
        source: 'doc',
        score: {
          blended: 0.8,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {},
      });

      await attachTaskResources(testTaskId, [resourceId]);
      await attachTaskResources(testTaskId, [resourceId]); // Duplicate

      const attachments = await db
        .select()
        .from(taskResources)
        .where(eq(taskResources.taskId, testTaskId));

      expect(attachments).toHaveLength(1);
    });
  });

  describe('upsertAndAttach', () => {
    it('should upsert and attach resources in order', async () => {
      const candidates: ResourceCandidate[] = [
        {
          url: 'https://example.com/resource1',
          title: 'Resource 1',
          source: 'doc',
          score: {
            blended: 0.8,
            components: {},
            scoredAt: new Date().toISOString(),
          },
          metadata: {},
        },
        {
          url: 'https://example.com/resource2',
          title: 'Resource 2',
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

      expect(resourceIds).toHaveLength(2);

      const attachments = await db
        .select()
        .from(taskResources)
        .where(eq(taskResources.taskId, testTaskId))
        .orderBy(taskResources.order);

      expect(attachments).toHaveLength(2);
      expect(attachments[0].order).toBe(1);
      expect(attachments[1].order).toBe(2);
    });

    it('should handle empty candidates', async () => {
      const resourceIds = await upsertAndAttach(testTaskId, []);

      expect(resourceIds).toEqual([]);

      const attachments = await db
        .select()
        .from(taskResources)
        .where(eq(taskResources.taskId, testTaskId));

      expect(attachments).toHaveLength(0);
    });
  });
});
