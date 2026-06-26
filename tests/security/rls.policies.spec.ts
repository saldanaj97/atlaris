/**
 * RLS (Row Level Security) Policy Verification Tests
 *
 * These tests exercise Postgres RLS policies by running queries
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

import { truncateAll } from '../helpers/db/truncate';
import {
  cleanupTrackedRlsClients,
  createAnonRlsDb,
  createRlsDbForUser,
  getServiceRoleDb,
} from '../helpers/rls';
import {
  expectedPolicyTables,
  expectRlsViolation,
  policyRowSchema,
  serverOwnedWriteTables,
} from './rls-test-helpers';
import {
  jobQueue,
  aiUsageEvents,
  generationAttempts,
  learningPlans,
  modules,
  planSchedules,
  resources,
  usageMetrics,
  taskProgress,
  taskResources,
  tasks,
  users,
} from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createId } from '@tests/fixtures/ids';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

// Coverage gap (not functionally exercised in this suite yet):
// plan_generations, oauth_state_tokens.

describe('RLS Policy Verification', () => {
  beforeEach(async () => {
    await cleanupTrackedRlsClients();
    await truncateAll();
  });

  afterEach(async () => {
    await cleanupTrackedRlsClients();
  });

  describe('Policy Role Scope', () => {
    it('scopes user-facing policies to authenticated role (not PUBLIC)', async () => {
      const rawPolicyRows = await db.execute(sql`
        SELECT tablename, policyname, unnest(roles) AS role
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = ANY(ARRAY[${sql.raw(
            expectedPolicyTables.map((name) => `'${name}'`).join(','),
          )}]::text[])
        ORDER BY tablename, policyname, role
      `);
      const rawRows = Array.isArray(rawPolicyRows)
        ? rawPolicyRows
        : (rawPolicyRows as { rows: unknown[] }).rows;
      const policyRows = z.array(policyRowSchema).parse(rawRows);

      expect(policyRows.length).toBeGreaterThan(0);
      const rolesByPolicy = new Map<string, Set<string>>();
      const allowedRoles = new Set(['authenticated']);
      const tablesWithPolicies = new Set(
        policyRows.map((row) => row.tablename),
      );
      const missingTables = expectedPolicyTables.filter(
        (tableName) => !tablesWithPolicies.has(tableName),
      );

      expect(missingTables).toEqual([]);

      for (const row of policyRows) {
        const policyKey = `${row.tablename}.${row.policyname}`;
        const role = row.role.toLowerCase();

        expect(role).not.toBe('public');
        expect(allowedRoles.has(role)).toBe(true);
        expect(role).toBe('authenticated');
        expect(row.policyname.endsWith('_anon')).toBe(false);

        const existingRoles = rolesByPolicy.get(policyKey) ?? new Set<string>();
        existingRoles.add(role);
        rolesByPolicy.set(policyKey, existingRoles);
      }

      for (const roles of rolesByPolicy.values()) {
        expect(roles.size).toBeGreaterThan(0);
      }
    });
  });

  describe('Service Role Access (RLS Bypass)', () => {
    it('service role can read all users regardless of ownership', async () => {
      const serviceClient = getServiceRoleDb();

      // Create test data
      const _user1 = await db
        .insert(users)
        .values({
          authUserId: 'user_1',
          email: 'user1@test.com',
        })
        .returning();

      const _user2 = await db
        .insert(users)
        .values({
          authUserId: 'user_2',
          email: 'user2@test.com',
        })
        .returning();

      // Service role should see both users
      const rows = await serviceClient.select().from(users);

      expect(rows).toHaveLength(2);
      expect(rows.map((u) => u.authUserId)).toContain('user_1');
      expect(rows.map((u) => u.authUserId)).toContain('user_2');
    });
  });

  describe('Anonymous Access', () => {
    it('anonymous users cannot read learning plans regardless of visibility', async () => {
      const anonDb = await createAnonRlsDb();

      const [publicUser] = await db
        .insert(users)
        .values({
          authUserId: 'user_public_plan',
          email: 'public@test.com',
        })
        .returning();

      await db.insert(learningPlans).values({
        userId: publicUser.id,
        topic: 'Public Topic',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'public',
      });

      const [privateUser] = await db
        .insert(users)
        .values({
          authUserId: 'user_private',
          email: 'private@test.com',
        })
        .returning();

      await db.insert(learningPlans).values({
        userId: privateUser.id,
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
          authUserId: 'anon_target_user',
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
        }),
      );
    });

    it('anonymous users cannot update or delete learning plans', async () => {
      const anonDb = await createAnonRlsDb();

      const [user] = await db
        .insert(users)
        .values({
          authUserId: 'anon_no_write',
          email: 'anon-no-write@test.com',
        })
        .returning();

      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId: user.id,
          topic: 'Read-Only Plan',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          visibility: 'public',
        })
        .returning();

      const readableRows = await anonDb
        .select()
        .from(learningPlans)
        .where(eq(learningPlans.id, plan.id));
      expect(readableRows).toHaveLength(0);

      await expectRlsViolation(() =>
        anonDb
          .update(learningPlans)
          .set({ topic: 'Should Not Update' })
          .where(eq(learningPlans.id, plan.id))
          .returning({ id: learningPlans.id }),
      );

      await expectRlsViolation(() =>
        anonDb
          .delete(learningPlans)
          .where(eq(learningPlans.id, plan.id))
          .returning({ id: learningPlans.id }),
      );

      const persistedPlan = await db.query.learningPlans.findFirst({
        where: (fields, operators) => operators.eq(fields.id, plan.id),
      });

      expect(persistedPlan).toBeDefined();
      expect(persistedPlan?.topic).toBe('Read-Only Plan');
    });

    it('anonymous users cannot insert modules into any plans', async () => {
      const anonDb = await createAnonRlsDb();

      const [user] = await db
        .insert(users)
        .values({
          authUserId: 'anon_module_insert',
          email: 'anon-module@test.com',
        })
        .returning();

      const [targetPlan] = await db
        .insert(learningPlans)
        .values({
          userId: user.id,
          topic: 'Target Plan',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          visibility: 'private',
        })
        .returning();

      await expectRlsViolation(() =>
        anonDb.insert(modules).values({
          planId: targetPlan.id,
          order: 1,
          title: 'Unauthorized Module',
          estimatedMinutes: 30,
        }),
      );
    });
  });

  describe('Authenticated User Access', () => {
    it('authenticated role has no write grants on server-owned billing and generation tables', async () => {
      const rawRows = await db.execute(sql`
        SELECT table_name::text, privilege_type::text
        FROM information_schema.table_privileges
        WHERE table_schema = 'public'
          AND grantee = 'authenticated'
          AND table_name = ANY(ARRAY[${sql.raw(
            serverOwnedWriteTables.map((name) => `'${name}'`).join(','),
          )}]::text[])
          AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
        ORDER BY table_name, privilege_type
      `);
      const rows = Array.isArray(rawRows)
        ? rawRows
        : (rawRows as { rows: unknown[] }).rows;

      expect(rows).toEqual([]);
    });

    it('authenticated users can read and update only their own user row', async () => {
      const [user1] = await db
        .insert(users)
        .values({
          authUserId: 'user_profile_1',
          email: 'user-profile-1@test.com',
          name: 'User One',
        })
        .returning();

      const [user2] = await db
        .insert(users)
        .values({
          authUserId: 'user_profile_2',
          email: 'user-profile-2@test.com',
          name: 'User Two',
        })
        .returning();

      const user1Db = await createRlsDbForUser('user_profile_1');

      const visibleRows = await user1Db
        .select({
          id: users.id,
          authUserId: users.authUserId,
          name: users.name,
        })
        .from(users);

      expect(visibleRows).toHaveLength(1);
      expect(visibleRows[0]?.id).toBe(user1.id);
      expect(visibleRows[0]?.authUserId).toBe('user_profile_1');

      const ownUpdate = await user1Db
        .update(users)
        .set({ name: 'User One Updated' })
        .where(eq(users.id, user1.id))
        .returning({ id: users.id, name: users.name });

      expect(ownUpdate).toHaveLength(1);
      expect(ownUpdate[0]?.name).toBe('User One Updated');

      const crossTenantUpdate = await user1Db
        .update(users)
        .set({ name: 'Should Not Update' })
        .where(eq(users.id, user2.id))
        .returning({ id: users.id });

      expect(crossTenantUpdate).toHaveLength(0);
    });

    // Transitive ownership: `job_queue_select_own` only returns rows for plans
    // owned by the current user. Anonymous has no `job_queue` visibility.
    it('authenticated can read own job_queue rows, cannot forge/change rows; anonymous cannot read or write', async () => {
      const [owner] = await db
        .insert(users)
        .values({
          authUserId: 'job_queue_owner',
          email: 'job-queue-owner@test.com',
        })
        .returning({ id: users.id });

      const [otherUser] = await db
        .insert(users)
        .values({
          authUserId: 'job_queue_other',
          email: 'job-queue-other@test.com',
        })
        .returning({ id: users.id });

      const [ownerPlan] = await db
        .insert(learningPlans)
        .values({
          userId: owner.id,
          topic: 'Owner Plan',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          visibility: 'private',
        })
        .returning({ id: learningPlans.id });

      const [otherPlan] = await db
        .insert(learningPlans)
        .values({
          userId: otherUser.id,
          topic: 'Other Plan',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          visibility: 'private',
        })
        .returning({ id: learningPlans.id });

      const ownerDb = await createRlsDbForUser('job_queue_owner');
      const anonDb = await createAnonRlsDb();

      const [seededJob] = await db
        .insert(jobQueue)
        .values({
          planId: ownerPlan.id,
          userId: owner.id,
          jobType: 'plan_regeneration',
          status: 'pending',
          payload: { planId: ownerPlan.id },
          priority: 0,
        })
        .returning({
          id: jobQueue.id,
          planId: jobQueue.planId,
          userId: jobQueue.userId,
          jobType: jobQueue.jobType,
        });

      const [otherSeededJob] = await db
        .insert(jobQueue)
        .values({
          planId: otherPlan.id,
          userId: otherUser.id,
          jobType: 'plan_regeneration',
          status: 'pending',
          payload: { planId: otherPlan.id },
          priority: 0,
        })
        .returning({
          id: jobQueue.id,
          planId: jobQueue.planId,
          userId: jobQueue.userId,
          jobType: jobQueue.jobType,
        });

      const visibleJobs = await ownerDb
        .select({
          id: jobQueue.id,
          planId: jobQueue.planId,
          userId: jobQueue.userId,
          jobType: jobQueue.jobType,
        })
        .from(jobQueue);

      expect(visibleJobs).toEqual([seededJob]);
      expect(visibleJobs).not.toContainEqual(otherSeededJob);

      const anonRows = await anonDb
        .select({
          id: jobQueue.id,
        })
        .from(jobQueue);
      expect(anonRows).toHaveLength(0);

      await expectRlsViolation(() =>
        ownerDb.insert(jobQueue).values({
          planId: otherPlan.id,
          userId: owner.id,
          jobType: 'plan_regeneration',
          status: 'pending',
          payload: { planId: otherPlan.id },
          priority: 0,
        }),
      );

      await expectRlsViolation(() =>
        ownerDb
          .update(jobQueue)
          .set({ status: 'processing' })
          .where(eq(jobQueue.id, seededJob.id)),
      );

      await expectRlsViolation(() =>
        ownerDb.delete(jobQueue).where(eq(jobQueue.id, seededJob.id)),
      );

      await expectRlsViolation(() =>
        anonDb.insert(jobQueue).values({
          planId: ownerPlan.id,
          userId: owner.id,
          jobType: 'plan_regeneration',
          status: 'pending',
          payload: { planId: ownerPlan.id },
          priority: 0,
        }),
      );
      await expectRlsViolation(() =>
        anonDb
          .update(jobQueue)
          .set({ status: 'processing' })
          .where(eq(jobQueue.id, seededJob.id)),
      );
      await expectRlsViolation(() =>
        anonDb.delete(jobQueue).where(eq(jobQueue.id, seededJob.id)),
      );
    });

    it('authenticated users cannot update billing/system-managed columns on their own row', async () => {
      // RLS limits authenticated users to their own row, and migration 0018's
      // column-level UPDATE grants keep billing/system-managed fields writable
      // only by the service role. This test guards against drift between those
      // layers by proving rejected updates leave the row unchanged.
      const [user] = await db
        .insert(users)
        .values({
          authUserId: 'user_billing_guard',
          email: 'billing-guard@test.com',
          name: 'Billing Guard User',
        })
        .returning({
          id: users.id,
          cancelAtPeriodEnd: users.cancelAtPeriodEnd,
          stripeCustomerId: users.stripeCustomerId,
          subscriptionStatus: users.subscriptionStatus,
        });

      const userDb = await createRlsDbForUser('user_billing_guard');

      await expectRlsViolation(() =>
        userDb
          .update(users)
          .set({ cancelAtPeriodEnd: true })
          .where(eq(users.id, user.id)),
      );

      await expectRlsViolation(() =>
        userDb
          .update(users)
          .set({ stripeCustomerId: 'cus_fake123' })
          .where(eq(users.id, user.id)),
      );

      await expectRlsViolation(() =>
        userDb
          .update(users)
          .set({ subscriptionStatus: 'active' })
          .where(eq(users.id, user.id)),
      );

      const [billingAfterViolations] = await userDb
        .select({
          cancelAtPeriodEnd: users.cancelAtPeriodEnd,
          stripeCustomerId: users.stripeCustomerId,
          subscriptionStatus: users.subscriptionStatus,
        })
        .from(users)
        .where(eq(users.id, user.id));

      expect(billingAfterViolations).toEqual({
        cancelAtPeriodEnd: user.cancelAtPeriodEnd,
        stripeCustomerId: user.stripeCustomerId,
        subscriptionStatus: user.subscriptionStatus,
      });

      const updatedName = await userDb
        .update(users)
        .set({ name: 'Updated Name' })
        .where(eq(users.id, user.id))
        .returning({ id: users.id, name: users.name });

      expect(updatedName).toHaveLength(1);
      expect(updatedName[0]?.name).toBe('Updated Name');

      const updatedPreferred = await userDb
        .update(users)
        .set({ preferredAiModel: 'google/gemini-2.0-flash-exp:free' })
        .where(eq(users.id, user.id))
        .returning({ id: users.id, preferredAiModel: users.preferredAiModel });

      expect(updatedPreferred).toHaveLength(1);
      expect(updatedPreferred[0]?.preferredAiModel).toBe(
        'google/gemini-2.0-flash-exp:free',
      );
    });

    it('authenticated users cannot directly mutate their own usage metrics', async () => {
      const [user] = await db
        .insert(users)
        .values({
          authUserId: 'usage_metrics_guard',
          email: 'usage-metrics-guard@test.com',
        })
        .returning({ id: users.id });

      const userDb = await createRlsDbForUser('usage_metrics_guard');

      await expectRlsViolation(() =>
        userDb.insert(usageMetrics).values({
          userId: user.id,
          month: '2026-05',
          plansGenerated: 0,
          regenerationsUsed: 0,
          exportsUsed: 0,
          lessonModulesGenerated: 0,
        }),
      );

      const [metric] = await db
        .insert(usageMetrics)
        .values({
          userId: user.id,
          month: '2026-05',
          plansGenerated: 2,
          regenerationsUsed: 3,
          exportsUsed: 1,
          lessonModulesGenerated: 4,
        })
        .returning({ id: usageMetrics.id });

      await expectRlsViolation(() =>
        userDb
          .update(usageMetrics)
          .set({ regenerationsUsed: 0, lessonModulesGenerated: 0 })
          .where(eq(usageMetrics.id, metric.id)),
      );

      await expectRlsViolation(() =>
        userDb.delete(usageMetrics).where(eq(usageMetrics.id, metric.id)),
      );

      const [persisted] = await db
        .select({
          regenerationsUsed: usageMetrics.regenerationsUsed,
          lessonModulesGenerated: usageMetrics.lessonModulesGenerated,
        })
        .from(usageMetrics)
        .where(eq(usageMetrics.id, metric.id));

      expect(persisted).toEqual({
        regenerationsUsed: 3,
        lessonModulesGenerated: 4,
      });
    });

    it('authenticated users cannot directly write plan schedule cache rows', async () => {
      const [user] = await db
        .insert(users)
        .values({
          authUserId: 'plan_schedules_guard',
          email: 'plan-schedules-guard@test.com',
        })
        .returning();

      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId: user.id,
          topic: 'Schedule Plan',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'practice',
          visibility: 'private',
        })
        .returning();

      const authDb = await createRlsDbForUser('plan_schedules_guard');

      await expectRlsViolation(() =>
        authDb.insert(planSchedules).values({
          planId: plan.id,
          scheduleJson: { weeks: [] },
          inputsHash: 'forged-hash',
          timezone: 'UTC',
          weeklyHours: 5,
          startDate: '2026-05-01',
        }),
      );
    });

    it('authenticated users cannot directly write task resource links', async () => {
      const [user] = await db
        .insert(users)
        .values({
          authUserId: 'task_resources_guard',
          email: 'task-resources-guard@test.com',
        })
        .returning();

      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId: user.id,
          topic: 'Task Resources Plan',
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
          estimatedMinutes: 60,
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

      const [resource] = await db
        .insert(resources)
        .values({
          type: 'article',
          title: 'Linked Resource',
          url: `https://example.com/article-${createId('resource')}`,
        })
        .returning();

      const authDb = await createRlsDbForUser('task_resources_guard');

      await expectRlsViolation(() =>
        authDb.insert(taskResources).values({
          taskId: task.id,
          resourceId: resource.id,
          order: 1,
        }),
      );
    });

    it('authenticated users cannot directly write AI usage event audit rows', async () => {
      const [user] = await db
        .insert(users)
        .values({
          authUserId: 'ai_usage_events_guard',
          email: 'ai-usage-events-guard@test.com',
        })
        .returning({ id: users.id });

      const userDb = await createRlsDbForUser('ai_usage_events_guard');

      await expectRlsViolation(() =>
        userDb.insert(aiUsageEvents).values({
          userId: user.id,
          provider: 'mock',
          model: 'mock-model',
          inputTokens: 1,
          outputTokens: 1,
          costCents: 0,
        }),
      );
    });

    it('authenticated users can read their own learning plans', async () => {
      // Create user in database
      const [user] = await db
        .insert(users)
        .values({
          authUserId: 'user_auth_123',
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

    it('authenticated users cannot read other users plans', async () => {
      // Create two users
      const [user1] = await db
        .insert(users)
        .values({
          authUserId: 'user_1',
          email: 'user1@test.com',
        })
        .returning();

      const [user2] = await db
        .insert(users)
        .values({
          authUserId: 'user_2',
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

      // Create another private plan for user2 (own records should be visible)
      await db.insert(learningPlans).values({
        userId: user2.id,
        topic: 'User 2 Private Plan',
        skillLevel: 'advanced',
        weeklyHours: 15,
        learningStyle: 'video',
        visibility: 'private',
      });

      // Authenticate as user2
      const user2Db = await createRlsDbForUser('user_2');

      // User2 should only see their own plan, not user1's plan
      const rows = await user2Db.select().from(learningPlans);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.topic).toBe('User 2 Private Plan');
    });

    it('authenticated users cannot directly insert learning plans through the client role', async () => {
      const [user] = await db
        .insert(users)
        .values({
          authUserId: 'user_plan_insert_guard',
          email: 'plan-insert-guard@test.com',
        })
        .returning();

      const authDb = await createRlsDbForUser('user_plan_insert_guard');

      await expectRlsViolation(() =>
        authDb.insert(learningPlans).values({
          userId: user.id,
          topic: 'New Plan',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          visibility: 'private',
          generationStatus: 'ready',
          isQuotaEligible: false,
        }),
      );

      const plans = await authDb.select().from(learningPlans);
      expect(plans).toHaveLength(0);
    });

    it('authenticated users cannot insert plans for other users', async () => {
      // Create two users
      const [_user1] = await db
        .insert(users)
        .values({
          authUserId: 'user_cant_insert_1',
          email: 'user1@test.com',
        })
        .returning();

      const [user2] = await db
        .insert(users)
        .values({
          authUserId: 'user_cant_insert_2',
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
        }),
      );
    });

    it('authenticated users cannot directly update server-owned plan quota state', async () => {
      const [user] = await db
        .insert(users)
        .values({
          authUserId: 'user_plan_update_guard',
          email: 'plan-update-guard@test.com',
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
          generationStatus: 'ready',
          isQuotaEligible: true,
        })
        .returning();

      const authDb = await createRlsDbForUser('user_plan_update_guard');

      await expectRlsViolation(() =>
        authDb
          .update(learningPlans)
          .set({
            generationStatus: 'failed',
            isQuotaEligible: false,
            finalizedAt: null,
          })
          .where(eq(learningPlans.id, plan.id)),
      );

      const [persisted] = await db
        .select({
          generationStatus: learningPlans.generationStatus,
          isQuotaEligible: learningPlans.isQuotaEligible,
        })
        .from(learningPlans)
        .where(eq(learningPlans.id, plan.id));

      expect(persisted).toEqual({
        generationStatus: 'ready',
        isQuotaEligible: true,
      });
    });

    it('authenticated users cannot update other users plans', async () => {
      // Create two users
      const [user1] = await db
        .insert(users)
        .values({
          authUserId: 'user_no_update_1',
          email: 'user1@test.com',
        })
        .returning();

      const [_user2] = await db
        .insert(users)
        .values({
          authUserId: 'user_no_update_2',
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

      await expectRlsViolation(() =>
        user2Db
          .update(learningPlans)
          .set({ topic: 'Hacked!' })
          .where(eq(learningPlans.id, plan.id)),
      );
    });

    it('authenticated users cannot directly delete their own learning plans', async () => {
      const [user] = await db
        .insert(users)
        .values({
          authUserId: 'user_plan_delete_guard',
          email: 'plan-delete-guard@test.com',
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

      const authDb = await createRlsDbForUser('user_plan_delete_guard');

      await expectRlsViolation(() =>
        authDb.delete(learningPlans).where(eq(learningPlans.id, plan.id)),
      );

      const rows = await authDb.select().from(learningPlans);
      expect(rows).toHaveLength(1);
    });

    it('authenticated users cannot delete other users plans', async () => {
      // Create two users
      const [user1] = await db
        .insert(users)
        .values({
          authUserId: 'user_no_delete_1',
          email: 'user1@test.com',
        })
        .returning();

      const [_user2] = await db
        .insert(users)
        .values({
          authUserId: 'user_no_delete_2',
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

      await expectRlsViolation(() =>
        user2Db.delete(learningPlans).where(eq(learningPlans.id, plan.id)),
      );

      // Verify plan still exists using direct DB (bypasses RLS)
      const verification = await db.query.learningPlans.findFirst({
        where: (fields, ops) => ops.eq(fields.id, plan.id),
      });

      expect(verification).toBeDefined();
    });
  });

  describe('Cascade Policies (modules, tasks, etc.)', () => {
    it('users can only read modules from plans they own', async () => {
      // Create two users
      const [user1] = await db
        .insert(users)
        .values({
          authUserId: 'user_modules_1',
          email: 'user1@test.com',
        })
        .returning();

      const [user2] = await db
        .insert(users)
        .values({
          authUserId: 'user_modules_2',
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

      // Create another private plan for user2
      const [otherUserPlan] = await db
        .insert(learningPlans)
        .values({
          userId: user2.id,
          topic: 'Other User Plan',
          skillLevel: 'intermediate',
          weeklyHours: 10,
          learningStyle: 'video',
          visibility: 'private',
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
        planId: otherUserPlan.id,
        order: 1,
        title: 'Other User Module',
        estimatedMinutes: 90,
      });

      // Authenticate as user1
      const user1Db = await createRlsDbForUser('user_modules_1');

      // User1 should only see modules from their own plan.
      const rows = await user1Db.select().from(modules);

      expect(rows).toHaveLength(1);
      const titles = rows.map((m) => m.title);
      expect(titles).toContain('Private Module');
      expect(titles).not.toContain('Other User Module');
    });

    it('users can only read tasks from plans they own', async () => {
      // Create user
      const [user] = await db
        .insert(users)
        .values({
          authUserId: 'user_tasks',
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

    it('authenticated users cannot directly mutate module lesson-generation bookkeeping', async () => {
      const [user] = await db
        .insert(users)
        .values({
          authUserId: 'module_lesson_guard',
          email: 'module-lesson-guard@test.com',
        })
        .returning();

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
          lessonGenerationStatus: 'not_generated',
        })
        .returning();

      const authDb = await createRlsDbForUser('module_lesson_guard');

      await expectRlsViolation(() =>
        authDb
          .update(modules)
          .set({
            lessonGenerationStatus: 'ready',
            lessonGenerationCompletedAt: new Date(),
            lessonGenerationMetadata: { version: 1, batchRequestId: 'forged' },
          })
          .where(eq(modules.id, module.id)),
      );

      const [persisted] = await db
        .select({
          lessonGenerationStatus: modules.lessonGenerationStatus,
          lessonGenerationCompletedAt: modules.lessonGenerationCompletedAt,
          lessonGenerationMetadata: modules.lessonGenerationMetadata,
        })
        .from(modules)
        .where(eq(modules.id, module.id));

      expect(persisted).toEqual({
        lessonGenerationStatus: 'not_generated',
        lessonGenerationCompletedAt: null,
        lessonGenerationMetadata: null,
      });
    });

    it('authenticated users cannot directly write generated task lesson content', async () => {
      const [user] = await db
        .insert(users)
        .values({
          authUserId: 'task_lesson_content_guard',
          email: 'task-lesson-content-guard@test.com',
        })
        .returning();

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

      const authDb = await createRlsDbForUser('task_lesson_content_guard');

      await expectRlsViolation(() =>
        authDb
          .update(tasks)
          .set({
            lessonContent: {
              version: 1,
              blocks: [{ type: 'paragraph', text: 'Forged lesson' }],
            },
            lessonContentUpdatedAt: new Date(),
          })
          .where(eq(tasks.id, task.id)),
      );

      const [persisted] = await db
        .select({
          lessonContent: tasks.lessonContent,
          lessonContentUpdatedAt: tasks.lessonContentUpdatedAt,
        })
        .from(tasks)
        .where(eq(tasks.id, task.id));

      expect(persisted).toEqual({
        lessonContent: null,
        lessonContentUpdatedAt: null,
      });
    });

    it('authenticated users cannot directly insert or update generation attempts', async () => {
      const [user] = await db
        .insert(users)
        .values({
          authUserId: 'generation_attempt_guard',
          email: 'generation-attempt-guard@test.com',
        })
        .returning();

      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId: user.id,
          topic: 'Attempt Guard Plan',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          visibility: 'private',
        })
        .returning();

      const authDb = await createRlsDbForUser('generation_attempt_guard');

      await expectRlsViolation(() =>
        authDb.insert(generationAttempts).values({
          planId: plan.id,
          status: 'success',
          classification: null,
          durationMs: 1,
          modulesCount: 0,
          tasksCount: 0,
        }),
      );

      const [attempt] = await db
        .insert(generationAttempts)
        .values({
          planId: plan.id,
          status: 'failure',
          classification: 'provider_error',
          durationMs: 100,
          modulesCount: 0,
          tasksCount: 0,
        })
        .returning();

      await expectRlsViolation(() =>
        authDb
          .update(generationAttempts)
          .set({ status: 'success', classification: null })
          .where(eq(generationAttempts.id, attempt.id)),
      );
    });

    it('users can only manage progress for their own tasks', async () => {
      // Create user
      const [user] = await db
        .insert(users)
        .values({
          authUserId: 'user_progress',
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
    it('only authenticated users can read resources', async () => {
      // Create a resource using direct DB access
      await db.insert(resources).values({
        type: 'article',
        title: 'Test Article',
        url: `https://example.com/article-${Date.now()}`,
      });

      // Anonymous user should not see resources
      const anonDb = await createAnonRlsDb();
      const anonData = await anonDb.select().from(resources);
      expect(anonData).toHaveLength(0);

      // Authenticated user should also see it
      const [_user] = await db
        .insert(users)
        .values({
          authUserId: 'user_resources',
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
          authUserId: 'user_no_resources',
          email: 'noresources@test.com',
        })
        .returning();

      const authDb = await createRlsDbForUser('user_no_resources');

      // Try to insert a resource (should fail)
      await expectRlsViolation(() =>
        authDb.insert(resources).values({
          type: 'video',
          title: 'Unauthorized Resource',
          url: `https://example.com/video-${Date.now()}`,
        }),
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
