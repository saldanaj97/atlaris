/**
 * RLS (Row Level Security) Policy Verification Tests
 *
 * These tests verify that Supabase RLS policies correctly enforce data access
 * permissions based on user authentication and authorization.
 *
 * IMPORTANT: These are SECURITY tests, not business logic tests.
 * - Business logic tests (in tests/unit, tests/integration) bypass RLS
 * - Security tests (here) enforce RLS to verify policies work correctly
 *
 * Test Strategy:
 * 1. Use Supabase clients with different auth contexts (anon, authenticated, service)
 * 2. Verify unauthorized access is blocked
 * 3. Verify authorized access works
 * 4. Verify data isolation between users
 *
 * Implementation Status:
 * - Phase 1: Test infrastructure and documentation (CURRENT)
 * - Phase 2: Implement tests when Clerk JWT integration is ready (TODO)
 *
 * Prerequisites for full RLS testing:
 * - SUPABASE_SERVICE_ROLE_KEY must be set in .env.test
 * - Clerk JWT generation or Supabase Auth setup for authenticated tests
 * - See tests/helpers/rls.ts for details
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/lib/db/drizzle';
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
  createAnonClient,
  createAuthenticatedClient,
  createServiceRoleClient,
} from '../helpers/rls';

describe('RLS Policy Verification', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  describe('Service Role Access (RLS Bypass)', () => {
    it('service role can read all users regardless of ownership', async () => {
      const serviceClient = createServiceRoleClient();

      // Create test data
      const user1 = await db
        .insert(users)
        .values({
          clerkUserId: 'user_1',
          email: 'user1@test.com',
        })
        .returning();

      const user2 = await db
        .insert(users)
        .values({
          clerkUserId: 'user_2',
          email: 'user2@test.com',
        })
        .returning();

      // Service role should see both users
      const { data, error } = await serviceClient.from('users').select('*');

      expect(error).toBeNull();
      expect(data).toHaveLength(2);
      expect(data?.map((u) => u.clerk_user_id)).toContain('user_1');
      expect(data?.map((u) => u.clerk_user_id)).toContain('user_2');
    });
  });

  describe('Anonymous Access', () => {
    it('anonymous users can read public learning plans', async () => {
      const anonClient = createAnonClient();

      // Create a public plan
      const [user] = await db
        .insert(users)
        .values({
          clerkUserId: 'user_public',
          email: 'public@test.com',
        })
        .returning();

      await db.insert(learningPlans).values({
        userId: user.id,
        topic: 'Public Topic',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'public',
      });

      // Anonymous user should see public plan
      const { data, error } = await anonClient
        .from('learning_plans')
        .select('*')
        .eq('visibility', 'public');

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0]?.topic).toBe('Public Topic');
    });

    it('anonymous users cannot read private learning plans', async () => {
      const anonClient = createAnonClient();

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
      const { data, error } = await anonClient
        .from('learning_plans')
        .select('*');

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('anonymous users cannot insert learning plans', async () => {
      const anonClient = createAnonClient();

      // Try to insert a plan as anonymous
      const { error } = await anonClient.from('learning_plans').insert({
        user_id: '00000000-0000-0000-0000-000000000000',
        topic: 'Unauthorized Topic',
        skill_level: 'beginner',
        weekly_hours: 5,
        learning_style: 'mixed',
        visibility: 'private',
      });

      // Should be blocked
      expect(error).not.toBeNull();
      expect(error?.message).toContain('violates row-level security policy');
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
      const authClient = createAuthenticatedClient('user_auth_123');

      // User should see their own plan
      const { data, error } = await authClient
        .from('learning_plans')
        .select('*');

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0]?.topic).toBe('My Private Plan');
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
      const user2Client = createAuthenticatedClient('user_2');

      // User2 should only see the public plan, not user1's private plan
      const { data, error } = await user2Client
        .from('learning_plans')
        .select('*');

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0]?.topic).toBe('User 2 Public Plan');
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

      const authClient = createAuthenticatedClient('user_insert');

      // User should be able to create a plan for themselves
      const { data, error } = await authClient
        .from('learning_plans')
        .insert({
          user_id: user.id,
          topic: 'New Plan',
          skill_level: 'beginner',
          weekly_hours: 5,
          learning_style: 'mixed',
          visibility: 'private',
        })
        .select();

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0]?.topic).toBe('New Plan');

      // Verify the plan was created
      const { data: allPlans } = await authClient
        .from('learning_plans')
        .select('*');
      expect(allPlans).toHaveLength(1);
    });

    it('authenticated users cannot insert plans for other users', async () => {
      // Create two users
      const [user1] = await db
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
      const user1Client = createAuthenticatedClient('user_cant_insert_1');

      // User1 tries to create a plan for user2 (should fail)
      const { error } = await user1Client.from('learning_plans').insert({
        user_id: user2.id, // Trying to insert for a different user
        topic: 'Unauthorized Plan',
        skill_level: 'beginner',
        weekly_hours: 5,
        learning_style: 'mixed',
        visibility: 'private',
      });

      // Should be blocked by RLS
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/row.*level.*security|permission/i);
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

      const authClient = createAuthenticatedClient('user_update');

      // Update the plan
      const { data, error } = await authClient
        .from('learning_plans')
        .update({ topic: 'Updated Topic' })
        .eq('id', plan.id)
        .select();

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0]?.topic).toBe('Updated Topic');
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

      const [user2] = await db
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
      const user2Client = createAuthenticatedClient('user_no_update_2');

      // User2 tries to update user1's plan
      const { data, error } = await user2Client
        .from('learning_plans')
        .update({ topic: 'Hacked!' })
        .eq('id', plan.id)
        .select();

      // Should be blocked or return no rows
      expect(data).toHaveLength(0);
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

      const authClient = createAuthenticatedClient('user_delete');

      // Delete the plan
      const { error } = await authClient
        .from('learning_plans')
        .delete()
        .eq('id', plan.id);

      expect(error).toBeNull();

      // Verify plan was deleted
      const { data } = await authClient.from('learning_plans').select('*');
      expect(data).toHaveLength(0);
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

      const [user2] = await db
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
      const user2Client = createAuthenticatedClient('user_no_delete_2');

      // User2 tries to delete user1's plan
      const { error } = await user2Client
        .from('learning_plans')
        .delete()
        .eq('id', plan.id);

      // Should be blocked or affect 0 rows (no error thrown)
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
      const user1Client = createAuthenticatedClient('user_modules_1');

      // User1 should see:
      // - Module from their own private plan
      // - Module from user2's public plan
      const { data, error } = await user1Client.from('modules').select('*');

      expect(error).toBeNull();
      expect(data).toHaveLength(2);
      const titles = data?.map((m) => m.title);
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
      const authClient = createAuthenticatedClient('user_tasks');

      // User should see their task
      const { data, error } = await authClient.from('tasks').select('*');

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0]?.title).toBe('Task 1');
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
      const authClient = createAuthenticatedClient('user_progress');

      // User should see their own progress
      const { data, error } = await authClient
        .from('task_progress')
        .select('*');

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0]?.status).toBe('not_started');

      // User should be able to update their progress
      const { data: updated } = await authClient
        .from('task_progress')
        .update({ status: 'in_progress' })
        .eq('task_id', task.id)
        .select();

      expect(updated).toHaveLength(1);
      expect(updated?.[0]?.status).toBe('in_progress');
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
      const anonClient = createAnonClient();
      const { data: anonData, error: anonError } = await anonClient
        .from('resources')
        .select('*');

      expect(anonError).toBeNull();
      expect(anonData).toHaveLength(1);
      expect(anonData?.[0]?.title).toBe('Test Article');

      // Authenticated user should also see it
      const [user] = await db
        .insert(users)
        .values({
          clerkUserId: 'user_resources',
          email: 'resources@test.com',
        })
        .returning();

      const authClient = createAuthenticatedClient('user_resources');
      const { data: authData, error: authError } = await authClient
        .from('resources')
        .select('*');

      expect(authError).toBeNull();
      expect(authData).toHaveLength(1);
      expect(authData?.[0]?.title).toBe('Test Article');
    });

    it('only service role can manage resources', async () => {
      // Create user
      const [user] = await db
        .insert(users)
        .values({
          clerkUserId: 'user_no_resources',
          email: 'noresources@test.com',
        })
        .returning();

      const authClient = createAuthenticatedClient('user_no_resources');

      // Try to insert a resource (should fail)
      const { error: insertError } = await authClient.from('resources').insert({
        type: 'youtube',
        title: 'Unauthorized Resource',
        url: `https://example.com/video-${Date.now()}`,
      });

      expect(insertError).not.toBeNull();
      expect(insertError?.message).toMatch(/row.*level.*security|permission/i);

      // Service role should be able to manage resources
      const serviceClient = createServiceRoleClient();

      const { data, error } = await serviceClient
        .from('resources')
        .insert({
          type: 'course',
          title: 'Authorized Resource',
          url: `https://example.com/course-${Date.now()}`,
        })
        .select();

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0]?.title).toBe('Authorized Resource');
    });
  });
});
