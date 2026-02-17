/**
 * Unit tests for DB resources queries
 * Tests: upsert by URL, type mapping, attachment order/idempotency
 */
import type { ResourceCandidate } from '@/lib/curation/types';
import {
  attachTaskResources,
  upsertAndAttach,
  upsertResource,
} from '@/lib/db/queries/resources';
import {
  learningPlans,
  modules,
  resources,
  taskResources,
  tasks,
  users,
} from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

describe('DB Resources Queries', () => {
  let testUserId: string;
  let testPlanId: string;
  let testModuleId: string;
  let testTaskId: string;

  const upsertResourceWithDb = async (
    candidate: ResourceCandidate
  ): Promise<string> => upsertResource({ candidate, dbClient: db });

  const attachTaskResourcesWithDb = async (
    taskId: string,
    resourceIds: string[]
  ): Promise<void> =>
    attachTaskResources({
      taskId,
      resourceIds,
      dbClient: db,
    });

  const upsertAndAttachWithDb = async (
    taskId: string,
    candidates: ResourceCandidate[]
  ): Promise<string[]> =>
    upsertAndAttach({
      taskId,
      candidates,
      dbClient: db,
    });

  beforeEach(async () => {
    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        authUserId: 'test-auth-id',
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

      const resourceId = await upsertResourceWithDb(candidate);

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

      const resourceId1 = await upsertResourceWithDb(candidate);
      const resourceId2 = await upsertResourceWithDb(candidate);

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

      const youtubeId = await upsertResourceWithDb(youtubeCandidate);
      const docId = await upsertResourceWithDb(docCandidate);

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

    it('should reject invalid URLs', async () => {
      const badUrls = [
        'not-a-url',
        'ftp://example.com/file',
        'javascript:alert(1)',
      ];

      for (const bad of badUrls) {
        const candidate: ResourceCandidate = {
          url: bad,
          title: 'Bad URL',
          source: 'doc',
          score: {
            blended: 0.8,
            components: {},
            scoredAt: new Date().toISOString(),
          },
          metadata: {},
        };

        await expect(upsertResourceWithDb(candidate)).rejects.toThrow(
          /invalid url/i
        );
      }
    });

    it('should extract domain correctly from URL', async () => {
      const candidate: ResourceCandidate = {
        url: 'https://www.react.dev/docs/intro',
        title: 'React Docs',
        source: 'doc',
        score: {
          blended: 0.9,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {},
      };

      const resourceId = await upsertResourceWithDb(candidate);
      const [row] = await db
        .select()
        .from(resources)
        .where(eq(resources.id, resourceId));
      expect(row.domain).toBe('react.dev');
    });
  });

  describe('attachTaskResources', () => {
    it('should attach resources with stable ordering', async () => {
      const resource1 = await upsertResourceWithDb({
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

      const resource2 = await upsertResourceWithDb({
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

      await attachTaskResourcesWithDb(testTaskId, [resource1, resource2]);

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
      const resourceId = await upsertResourceWithDb({
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

      await attachTaskResourcesWithDb(testTaskId, [resourceId]);
      await attachTaskResourcesWithDb(testTaskId, [resourceId]); // Duplicate

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

      const resourceIds = await upsertAndAttachWithDb(testTaskId, candidates);

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
      const resourceIds = await upsertAndAttachWithDb(testTaskId, []);

      expect(resourceIds).toEqual([]);

      const attachments = await db
        .select()
        .from(taskResources)
        .where(eq(taskResources.taskId, testTaskId));

      expect(attachments).toHaveLength(0);
    });
  });
});
