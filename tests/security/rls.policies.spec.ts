/**
 * RLS (Row Level Security) Policy Verification Tests
 *
 * These tests exercise the Neon/Postgres RLS policies by running queries
 * through the RLS-enforced Drizzle client that mimics request handling.
 *
 * IMPORTANT: These are SECURITY tests, not business logic tests.
 * - Business logic tests (in tests/unit, tests/integration) bypass RLS
 * - Security tests (here) enforce RLS to verify policies work correctly
 *
 * Test Strategy:
 * 1. Use RLS Drizzle clients with different auth contexts (anon, authenticated, service)
 * 2. Verify unauthorized access is blocked
 * 3. Verify authorized access works
 * 4. Verify data isolation between users
 */

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/lib/db/service-role';
import {
  learningPlans,
  modules,
  resources,
  taskProgress,
  tasks,
  users,
} from '@/lib/db/schema';
import { truncateAll } from '../helpers/db';
import {
  createAnonRlsDb,
  createRlsDbForUser,
  getServiceRoleDb,
} from '../helpers/rls';

// Run RLS tests only when explicitly enabled (CI or RUN_RLS_TESTS=1)
const runRls = process.env.CI === 'true' || process.env.RUN_RLS_TESTS === '1';

async function expectRlsViolation(operation: () => Promise<unknown>) {
  try {
    await operation();
    throw new Error('Expected RLS violation but operation succeeded');
  } catch (error) {
    const err = error as Error;
    const message = err.message;
    const causeMessage = (err.cause as Error)?.message || '';
    const combinedMessage = message + ' ' + causeMessage;

    if (!/row.*level.*security|permission/i.test(combinedMessage)) {
      throw new Error(
        `Expected RLS violation error but got: ${message}${causeMessage ? ` (cause: ${causeMessage})` : ''}`
      );
    }
  }
}

describe.skipIf(!runRls)('RLS Policy Verification', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  describe('Service Role Access (RLS Bypass)', () => {
    it('service role can read all users regardless of ownership', async () => {
      const serviceClient = getServiceRoleDb();

      // Create test data
      const _user1 = await db
        .insert(users)
        .values({
          clerkUserId: 'user_1',
          email: 'user1@test.com',
        })
        .returning();

      const _user2 = await db
        .insert(users)
        .values({
          clerkUserId: 'user_2',
          email: 'user2@test.com',
        })
        .returning();

      // Service role should see both users
      const rows = await serviceClient.select().from(users);

      expect(rows).toHaveLength(2);
      expect(rows.map((u) => u.clerkUserId)).toContain('user_1');
      expect(rows.map((u) => u.clerkUserId)).toContain('user_2');
    });
  });

  describe('Anonymous Access', () => {
    it('anonymous users cannot read private learning plans', async () => {
      const anonDb = await createAnonRlsDb();

      // Create a private plan
      const [user] = await db
        .insert(users)
        .values({
          clerkUserId: 'user_private',
          email: 'private@test.com',
        })
        .returning();

      await db.insert(learningPlans).values({
        userId: user.id,
        topic: 'Private Topic',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private',
      });

      // Anonymous user should NOT see private plan
      const rows = await anonDb.select().from(learningPlans);
      expect(rows).toHaveLength(0);
    });

    it('anonymous users cannot insert learning plans', async () => {
      const anonDb = await createAnonRlsDb();

      const [user] = await db
        .insert(users)
        .values({
          clerkUserId: 'anon_target_user',
          email: 'anon@test.com',
        })
        .returning();

      await expectRlsViolation(() =>
        anonDb.insert(learningPlans).values({
          userId: user.id,
          topic: 'Unauthorized Topic',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          visibility: 'private',
        })
      );
    });
  });

  describe('Authenticated User Access', () => {
    it('authenticated users can read their own learning plans', async () => {
      // Create user in database
      const [user] = await db
        .insert(users)
        .values({
          clerkUserId: 'user_auth_123',
          email: 'auth@test.com',
        })
        .returning();

      // Create a private plan for this user
      await db.insert(learningPlans).values({
        userId: user.id,
        topic: 'My Private Plan',
        skillLevel: 'intermediate',
        weeklyHours: 10,
        learningStyle: 'practice',
        visibility: 'private',
      });

      // Authenticate as this user
      const authDb = await createRlsDbForUser('user_auth_123');

      // User should see their own plan
      const rows = await authDb.select().from(learningPlans);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.topic).toBe('My Private Plan');
    });

    it('authenticated users cannot read other users private plans', async () => {
      // Create two users
      const [user1] = await db
        .insert(users)
        .values({
          clerkUserId: 'user_1',
          email: 'user1@test.com',
        })
        .returning();

      const [user2] = await db
        .insert(users)
        .values({
          clerkUserId: 'user_2',
          email: 'user2@test.com',
        })
        .returning();

      // Create a private plan for user1
      await db.insert(learningPlans).values({
        userId: user1.id,
        topic: 'User 1 Private Plan',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'reading',
        visibility: 'private',
      });

      // Create a public plan for user2 (should be visible)
      await db.insert(learningPlans).values({
        userId: user2.id,
        topic: 'User 2 Public Plan',
        skillLevel: 'advanced',
        weeklyHours: 15,
        learningStyle: 'video',
        visibility: 'public',
      });

      // Authenticate as user2
      const user2Db = await createRlsDbForUser('user_2');

      // User2 should only see the public plan, not user1's private plan
      const rows = await user2Db.select().from(learningPlans);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.topic).toBe('User 2 Public Plan');
    });

    it('authenticated users can insert plans for themselves only', async () => {
      // Create user in database
      const [user] = await db
        .insert(users)
        .values({
          clerkUserId: 'user_insert',
          email: 'insert@test.com',
        })
        .returning();

      const authDb = await createRlsDbForUser('user_insert');

      // User should be able to create a plan for themselves
      const inserted = await authDb
        .insert(learningPlans)
        .values({
          userId: user.id,
          topic: 'New Plan',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          visibility: 'private',
        })
        .returning({ id: learningPlans.id, topic: learningPlans.topic });

      expect(inserted).toHaveLength(1);
      expect(inserted[0]?.topic).toBe('New Plan');

      // Verify the plan was created
      const plans = await authDb.select().from(learningPlans);
      expect(plans).toHaveLength(1);
    });

    it('authenticated users cannot insert plans for other users', async () => {
      // Create two users
      const [_user1] = await db
        .insert(users)
        .values({
          clerkUserId: 'user_cant_insert_1',
          email: 'user1@test.com',
        })
        .returning();

      const [user2] = await db
        .insert(users)
        .values({
          clerkUserId: 'user_cant_insert_2',
          email: 'user2@test.com',
        })
        .returning();

      // Authenticate as user1
      const user1Db = await createRlsDbForUser('user_cant_insert_1');

      // User1 tries to create a plan for user2 (should fail)
      await expectRlsViolation(() =>
        user1Db.insert(learningPlans).values({
          userId: user2.id, // Trying to insert for a different user
          topic: 'Unauthorized Plan',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          visibility: 'private',
        })
      );
    });

    it('authenticated users can update their own plans', async () => {
      // Create user and plan
      const [user] = await db
        .insert(users)
        .values({
          clerkUserId: 'user_update',
          email: 'update@test.com',
        })
        .returning();

      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId: user.id,
          topic: 'Original Topic',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'reading',
          visibility: 'private',
        })
        .returning();

      const authDb = await createRlsDbForUser('user_update');

      // Update the plan
      const updated = await authDb
        .update(learningPlans)
        .set({ topic: 'Updated Topic' })
        .where(eq(learningPlans.id, plan.id))
        .returning({ topic: learningPlans.topic });

      expect(updated).toHaveLength(1);
      expect(updated[0]?.topic).toBe('Updated Topic');
    });

    it('authenticated users cannot update other users plans', async () => {
      // Create two users
      const [user1] = await db
        .insert(users)
        .values({
          clerkUserId: 'user_no_update_1',
          email: 'user1@test.com',
        })
        .returning();

      const [_user2] = await db
        .insert(users)
        .values({
          clerkUserId: 'user_no_update_2',
          email: 'user2@test.com',
        })
        .returning();

      // Create plan for user1
      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId: user1.id,
          topic: 'User 1 Plan',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'reading',
          visibility: 'private',
        })
        .returning();

      // Authenticate as user2
      const user2Db = await createRlsDbForUser('user_no_update_2');

      // User2 tries to update user1's plan
      const updated = await user2Db
        .update(learningPlans)
        .set({ topic: 'Hacked!' })
        .where(eq(learningPlans.id, plan.id))
        .returning({ id: learningPlans.id });

      // Should be blocked or return no rows
      expect(updated).toHaveLength(0);
    });

    it('authenticated users can delete their own plans', async () => {
      // Create user and plan
      const [user] = await db
        .insert(users)
        .values({
          clerkUserId: 'user_delete',
          email: 'delete@test.com',
        })
        .returning();

      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId: user.id,
          topic: 'Plan to Delete',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'reading',
          visibility: 'private',
        })
        .returning();

      const authDb = await createRlsDbForUser('user_delete');

      // Delete the plan
      const deleted = await authDb
        .delete(learningPlans)
        .where(eq(learningPlans.id, plan.id))
        .returning({ id: learningPlans.id });

      expect(deleted).toHaveLength(1);

      // Verify plan was deleted
      const rows = await authDb.select().from(learningPlans);
      expect(rows).toHaveLength(0);
    });

    it('authenticated users cannot delete other users plans', async () => {
      // Create two users
      const [user1] = await db
        .insert(users)
        .values({
          clerkUserId: 'user_no_delete_1',
          email: 'user1@test.com',
        })
        .returning();

      const [_user2] = await db
        .insert(users)
        .values({
          clerkUserId: 'user_no_delete_2',
          email: 'user2@test.com',
        })
        .returning();

      // Create plan for user1
      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId: user1.id,
          topic: 'User 1 Plan',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'reading',
          visibility: 'private',
        })
        .returning();

      // Authenticate as user2
      const user2Db = await createRlsDbForUser('user_no_delete_2');

      // User2 tries to delete user1's plan
      const deleted = await user2Db
        .delete(learningPlans)
        .where(eq(learningPlans.id, plan.id))
        .returning({ id: learningPlans.id });

      // Should be blocked or affect 0 rows (no error thrown)
      expect(deleted).toHaveLength(0);

      // Verify plan still exists using direct DB (bypasses RLS)
      const verification = await db.query.learningPlans.findFirst({
        where: (fields, ops) => ops.eq(fields.id, plan.id),
      });

      expect(verification).toBeDefined();
    });
  });

  describe('Cascade Policies (modules, tasks, etc.)', () => {
    it('users can only read modules from plans they own or public plans', async () => {
      // Create two users
      const [user1] = await db
        .insert(users)
        .values({
          clerkUserId: 'user_modules_1',
          email: 'user1@test.com',
        })
        .returning();

      const [user2] = await db
        .insert(users)
        .values({
          clerkUserId: 'user_modules_2',
          email: 'user2@test.com',
        })
        .returning();

      // Create private plan for user1
      const [privatePlan] = await db
        .insert(learningPlans)
        .values({
          userId: user1.id,
          topic: 'Private Plan',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'reading',
          visibility: 'private',
        })
        .returning();

      // Create public plan for user2
      const [publicPlan] = await db
        .insert(learningPlans)
        .values({
          userId: user2.id,
          topic: 'Public Plan',
          skillLevel: 'intermediate',
          weeklyHours: 10,
          learningStyle: 'video',
          visibility: 'public',
        })
        .returning();

      // Add modules to both plans
      await db.insert(modules).values({
        planId: privatePlan.id,
        order: 1,
        title: 'Private Module',
        estimatedMinutes: 60,
      });

      await db.insert(modules).values({
        planId: publicPlan.id,
        order: 1,
        title: 'Public Module',
        estimatedMinutes: 90,
      });

      // Authenticate as user1
      const user1Db = await createRlsDbForUser('user_modules_1');

      // User1 should see:
      // - Module from their own private plan
      // - Module from user2's public plan
      const rows = await user1Db.select().from(modules);

      expect(rows).toHaveLength(2);
      const titles = rows.map((m) => m.title);
      expect(titles).toContain('Private Module');
      expect(titles).toContain('Public Module');
    });

    it('users can only read tasks from plans they own or public plans', async () => {
      // Create user
      const [user] = await db
        .insert(users)
        .values({
          clerkUserId: 'user_tasks',
          email: 'tasks@test.com',
        })
        .returning();

      // Create plan and module
      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId: user.id,
          topic: 'My Plan',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'practice',
          visibility: 'private',
        })
        .returning();

      const [module] = await db
        .insert(modules)
        .values({
          planId: plan.id,
          order: 1,
          title: 'Module 1',
          estimatedMinutes: 120,
        })
        .returning();

      // Add task to module
      await db.insert(tasks).values({
        moduleId: module.id,
        order: 1,
        title: 'Task 1',
        estimatedMinutes: 30,
      });

      // Authenticate as user
      const authDb = await createRlsDbForUser('user_tasks');

      // User should see their task
      const rows = await authDb.select().from(tasks);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.title).toBe('Task 1');
    });

    it('users can only manage progress for their own tasks', async () => {
      // Create user
      const [user] = await db
        .insert(users)
        .values({
          clerkUserId: 'user_progress',
          email: 'progress@test.com',
        })
        .returning();

      // Create plan, module, and task
      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId: user.id,
          topic: 'My Plan',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'practice',
          visibility: 'private',
        })
        .returning();

      const [module] = await db
        .insert(modules)
        .values({
          planId: plan.id,
          order: 1,
          title: 'Module 1',
          estimatedMinutes: 120,
        })
        .returning();

      const [task] = await db
        .insert(tasks)
        .values({
          moduleId: module.id,
          order: 1,
          title: 'Task 1',
          estimatedMinutes: 30,
        })
        .returning();

      // Create progress record
      await db.insert(taskProgress).values({
        taskId: task.id,
        userId: user.id,
        status: 'not_started',
      });

      // Authenticate as user
      const authDb = await createRlsDbForUser('user_progress');

      // User should see their own progress
      const rows = await authDb.select().from(taskProgress);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe('not_started');

      // User should be able to update their progress
      const updated = await authDb
        .update(taskProgress)
        .set({ status: 'in_progress' })
        .where(eq(taskProgress.taskId, task.id))
        .returning({ status: taskProgress.status });

      expect(updated).toHaveLength(1);
      expect(updated[0]?.status).toBe('in_progress');
    });
  });

  describe('Resources Access', () => {
    it('all users (including anonymous) can read resources', async () => {
      // Create a resource using direct DB access
      await db.insert(resources).values({
        type: 'article',
        title: 'Test Article',
        url: `https://example.com/article-${Date.now()}`,
      });

      // Anonymous user should see it
      const anonDb = await createAnonRlsDb();
      const anonData = await anonDb.select().from(resources);
      expect(anonData).toHaveLength(1);
      expect(anonData[0]?.title).toBe('Test Article');

      // Authenticated user should also see it
      const [_user] = await db
        .insert(users)
        .values({
          clerkUserId: 'user_resources',
          email: 'resources@test.com',
        })
        .returning();

      const authDb = await createRlsDbForUser('user_resources');
      const authData = await authDb.select().from(resources);

      expect(authData).toHaveLength(1);
      expect(authData[0]?.title).toBe('Test Article');
    });

    it('only service role can manage resources', async () => {
      // Create user
      const [_user] = await db
        .insert(users)
        .values({
          clerkUserId: 'user_no_resources',
          email: 'noresources@test.com',
        })
        .returning();

      const authDb = await createRlsDbForUser('user_no_resources');

      // Try to insert a resource (should fail)
      await expectRlsViolation(() =>
        authDb.insert(resources).values({
          type: 'youtube',
          title: 'Unauthorized Resource',
          url: `https://example.com/video-${Date.now()}`,
        })
      );

      // Service role should be able to manage resources
      const serviceDb = getServiceRoleDb();

      const inserted = await serviceDb
        .insert(resources)
        .values({
          type: 'course',
          title: 'Authorized Resource',
          url: `https://example.com/course-${Date.now()}`,
        })
        .returning({ title: resources.title });

      expect(inserted).toHaveLength(1);
      expect(inserted[0]?.title).toBe('Authorized Resource');
    });
  });
});
