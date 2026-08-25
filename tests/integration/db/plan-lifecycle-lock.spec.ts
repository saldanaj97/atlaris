import { createReservationRejectionResult } from '@/features/ai/orchestrator/reservation';
import { runModuleLessonGenerationWork } from '@/features/lesson-content/run-module-lesson-generation-work';
import { reserveAttemptSlot } from '@/lib/db/queries/attempts';
import { buildMetadata } from '@/lib/db/queries/helpers/attempts-input';
import { persistSuccessfulAttemptInTx } from '@/lib/db/queries/helpers/attempts-persistence-success';
import {
  lockPlanLifecycle,
  PLAN_LIFECYCLE_LOCK_NAMESPACE,
} from '@/lib/db/queries/helpers/plan-lifecycle-lock';
import { selectOwnedPlanById } from '@/lib/db/queries/helpers/plans-helpers';
import { claimModuleLessonGenerationOrDescribe } from '@/lib/db/queries/module-lesson-generation';
import { deletePlan } from '@/lib/db/queries/plans';
import { generationAttempts, learningPlans, modules } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestModule, createTestTask } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db/users';
import { createDeferredPromise } from '@tests/helpers/deferred-promise';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

const TEST_INPUT = {
  topic: 'Lifecycle lock',
  skillLevel: 'beginner' as const,
  weeklyHours: 5,
  learningStyle: 'mixed' as const,
};

async function markModuleGenerating(moduleId: string): Promise<void> {
  await db
    .update(modules)
    .set({ lessonGenerationStatus: 'generating' })
    .where(eq(modules.id, moduleId));
}

async function waitForPlanLifecycleLockWaiter(planId: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const rows = await db.execute(sql`
      SELECT granted
      FROM pg_locks
      WHERE locktype = 'advisory'
        AND classid = ${sql.raw(String(PLAN_LIFECYCLE_LOCK_NAMESPACE))}
        AND objid = hashtext(${planId})
    `);
    const list = Array.isArray(rows) ? rows : [];
    const granted = list.some(
      (row) => (row as { granted?: unknown }).granted === true,
    );
    const waiting = list.some(
      (row) => (row as { granted?: unknown }).granted === false,
    );
    if (granted && waiting) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });
  }
  throw new Error(
    `Timed out waiting for plan lifecycle lock waiter (${planId})`,
  );
}

describe('plan lifecycle lock (integration)', () => {
  it('claims a child only when the parent plan is ready', async () => {
    const authUserId = buildTestAuthUserId('lifecycle-claim-ready');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createTestPlan({ userId, topic: 'Ready parent' });
    const mod = await createTestModule({ planId: plan.id });

    const claim = await claimModuleLessonGenerationOrDescribe(
      db,
      plan.id,
      mod.id,
      userId,
    );
    expect(claim).toEqual({ kind: 'claimed', workflowStartedAt: null });

    const [row] = await db
      .select({ status: modules.lessonGenerationStatus })
      .from(modules)
      .where(eq(modules.id, mod.id));
    expect(row?.status).toBe('generating');
  });

  it('returns in_flight and does not mutate when the parent is not ready', async () => {
    const authUserId = buildTestAuthUserId('lifecycle-claim-generating');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createTestPlan({
      userId,
      topic: 'Generating parent',
      generationStatus: 'generating',
    });
    const mod = await createTestModule({ planId: plan.id });

    const claim = await claimModuleLessonGenerationOrDescribe(
      db,
      plan.id,
      mod.id,
      userId,
    );
    expect(claim).toEqual({ kind: 'in_flight' });

    const [row] = await db
      .select({ status: modules.lessonGenerationStatus })
      .from(modules)
      .where(eq(modules.id, mod.id));
    expect(row?.status).toBe('not_generated');
  });

  it('rejects regeneration reservation while a child is generating', async () => {
    const authUserId = buildTestAuthUserId('lifecycle-reserve-child');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createTestPlan({ userId, topic: 'Last-good ready' });
    const mod = await createTestModule({ planId: plan.id });
    await markModuleGenerating(mod.id);

    const reservation = await reserveAttemptSlot({
      planId: plan.id,
      userId,
      input: TEST_INPUT,
      generationPurpose: 'initial',
      dbClient: db,
      requiredGenerationStatus: 'ready',
    });

    expect(reservation).toEqual({
      reserved: false,
      reason: 'active_child_generation',
    });
    if (reservation.reserved) {
      throw new Error('Expected active_child_generation rejection');
    }

    const rejection = createReservationRejectionResult(
      {
        planId: plan.id,
        userId,
        input: TEST_INPUT,
        generationPurpose: 'initial',
      },
      reservation,
      0,
      () => 1,
      () => new Date(),
    );
    expect(rejection.classification).toBe('rate_limit');
    expect(rejection.reservationRejectionReason).toBe(
      'active_child_generation',
    );

    const attempts = await db
      .select({ id: generationAttempts.id })
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, plan.id));
    expect(attempts).toHaveLength(0);

    const [current] = await db
      .select({ generationStatus: learningPlans.generationStatus })
      .from(learningPlans)
      .where(eq(learningPlans.id, plan.id));
    expect(current?.generationStatus).toBe('ready');
  });

  it('refuses successful persistence while a child is generating', async () => {
    const authUserId = buildTestAuthUserId('lifecycle-persist-child');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createTestPlan({
      userId,
      topic: 'Persist while child',
      generationStatus: 'failed',
      isQuotaEligible: false,
    });

    const reservation = await reserveAttemptSlot({
      planId: plan.id,
      userId,
      input: TEST_INPUT,
      generationPurpose: 'initial',
      dbClient: db,
    });
    if (!reservation.reserved) {
      throw new Error(`Expected reservation, got ${reservation.reason}`);
    }

    const child = await createTestModule({ planId: plan.id });
    await markModuleGenerating(child.id);

    const finishedAt = new Date();
    await expect(
      db.transaction(async (tx) =>
        persistSuccessfulAttemptInTx(tx, {
          attemptId: reservation.attemptId,
          planId: plan.id,
          preparation: reservation,
          normalizedModules: [
            {
              title: 'Replacement',
              description: 'Should not land',
              estimatedMinutes: 10,
              tasks: [],
            },
          ],
          normalizationFlags: { modulesClamped: false, tasksClamped: false },
          modulesCount: 1,
          tasksCount: 0,
          durationMs: 10,
          metadata: buildMetadata({
            sanitized: reservation.sanitized,
            modulesClamped: false,
            tasksClamped: false,
            startedAt: reservation.startedAt,
            finishedAt,
            extendedTimeout: false,
          }),
          finishedAt,
        }),
      ),
    ).rejects.toThrow('active child module lesson generation is in progress');

    const [attempt] = await db
      .select({ status: generationAttempts.status })
      .from(generationAttempts)
      .where(eq(generationAttempts.id, reservation.attemptId));
    expect(attempt?.status).toBe('in_progress');

    const [childRow] = await db
      .select({
        id: modules.id,
        status: modules.lessonGenerationStatus,
        title: modules.title,
      })
      .from(modules)
      .where(eq(modules.id, child.id));
    expect(childRow).toMatchObject({
      id: child.id,
      status: 'generating',
      title: child.title,
    });
  });

  it('does not delete a plan while a child module is generating', async () => {
    const authUserId = buildTestAuthUserId('lifecycle-delete-child');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createTestPlan({ userId, topic: 'Delete blocked' });
    const mod = await createTestModule({ planId: plan.id });
    await markModuleGenerating(mod.id);

    const result = await deletePlan(plan.id, userId);
    expect(result).toEqual({
      success: false,
      reason: 'active_child_generation',
    });

    const remaining = await db
      .select({ id: learningPlans.id })
      .from(learningPlans)
      .where(eq(learningPlans.id, plan.id));
    expect(remaining).toHaveLength(1);
  });

  it('lets delete win the lifecycle lock before a child claim and never invokes the provider', async () => {
    const authUserId = buildTestAuthUserId('lifecycle-delete-wins');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createTestPlan({ userId, topic: 'Delete wins lock' });
    const mod = await createTestModule({ planId: plan.id });

    const deleteLocked = createDeferredPromise<void>();
    const releaseDelete = createDeferredPromise<void>();
    let paused = false;

    const deletion = deletePlan(plan.id, userId, db, {
      selectOwnedPlanById: async (args) => {
        if (!paused) {
          paused = true;
          deleteLocked.resolve();
          await releaseDelete.promise;
        }
        return selectOwnedPlanById(args);
      },
    });

    await deleteLocked.promise;

    const provider = vi.fn();
    const claim = (async () => {
      const result = await claimModuleLessonGenerationOrDescribe(
        db,
        plan.id,
        mod.id,
        userId,
      );
      if (result.kind === 'claimed') {
        await provider();
      }
      return result;
    })();

    await waitForPlanLifecycleLockWaiter(plan.id);

    const [beforeRelease] = await db
      .select({ status: modules.lessonGenerationStatus })
      .from(modules)
      .where(eq(modules.id, mod.id));
    expect(beforeRelease?.status).toBe('not_generated');

    releaseDelete.resolve();

    await expect(deletion).resolves.toEqual({ success: true });
    await expect(claim).resolves.toEqual({ kind: 'not_found' });
    expect(provider).not.toHaveBeenCalled();
  });

  it('blocks deletion after a child provider-start marker wins first', async () => {
    const authUserId = buildTestAuthUserId('lifecycle-provider-delete');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createTestPlan({
      userId,
      topic: 'Provider then delete',
    });
    const mod = await createTestModule({ planId: plan.id });
    const task = await createTestTask({ moduleId: mod.id });

    const providerStarted = createDeferredPromise<void>();
    const releaseProvider = createDeferredPromise<void>();
    const provider = {
      generateModuleLessonBatch: vi.fn(async () => {
        providerStarted.resolve();
        await releaseProvider.promise;
        throw new Error('stop fake provider');
      }),
    };

    await expect(
      claimModuleLessonGenerationOrDescribe(db, plan.id, mod.id, userId),
    ).resolves.toEqual({ kind: 'claimed', workflowStartedAt: null });

    const generation = runModuleLessonGenerationWork(
      {
        load: {
          plan: {
            id: plan.id,
            topic: plan.topic,
            skillLevel: plan.skillLevel,
            learningStyle: plan.learningStyle,
          },
          module: mod,
          tasks: [task],
          isUnlocked: true,
        },
        userId,
        planId: plan.id,
        moduleId: mod.id,
        userTier: 'free',
      },
      {
        serverDbClient: db,
        provider,
        resolveGenerationEnabled: async () => true,
      },
    );

    await providerStarted.promise;

    const [startedModule] = await db
      .select({
        status: modules.lessonGenerationStatus,
        metadata: modules.lessonGenerationMetadata,
      })
      .from(modules)
      .where(eq(modules.id, mod.id));
    expect(startedModule).toMatchObject({
      status: 'generating',
      metadata: { providerStartedAt: expect.any(String) },
    });

    await expect(deletePlan(plan.id, userId, db)).resolves.toEqual({
      success: false,
      reason: 'active_child_generation',
    });
    expect(provider.generateModuleLessonBatch).toHaveBeenCalledOnce();

    releaseProvider.resolve();
    await expect(generation).resolves.toEqual({ kind: 'failed' });
  });

  it('blocks regeneration after a child provider-start marker wins first', async () => {
    const authUserId = buildTestAuthUserId('lifecycle-provider-regenerate');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createTestPlan({
      userId,
      topic: 'Provider then regenerate',
      generationStatus: 'ready',
      isQuotaEligible: true,
    });
    const mod = await createTestModule({ planId: plan.id });
    const task = await createTestTask({ moduleId: mod.id });

    const providerStarted = createDeferredPromise<void>();
    const releaseProvider = createDeferredPromise<void>();
    const provider = {
      generateModuleLessonBatch: vi.fn(async () => {
        providerStarted.resolve();
        await releaseProvider.promise;
        throw new Error('stop fake provider');
      }),
    };

    await expect(
      claimModuleLessonGenerationOrDescribe(db, plan.id, mod.id, userId),
    ).resolves.toEqual({ kind: 'claimed', workflowStartedAt: null });

    const generation = runModuleLessonGenerationWork(
      {
        load: {
          plan: {
            id: plan.id,
            topic: plan.topic,
            skillLevel: plan.skillLevel,
            learningStyle: plan.learningStyle,
          },
          module: mod,
          tasks: [task],
          isUnlocked: true,
        },
        userId,
        planId: plan.id,
        moduleId: mod.id,
        userTier: 'free',
      },
      {
        serverDbClient: db,
        provider,
        resolveGenerationEnabled: async () => true,
      },
    );

    await providerStarted.promise;

    const reservation = await reserveAttemptSlot({
      planId: plan.id,
      userId,
      input: TEST_INPUT,
      generationPurpose: 'initial',
      dbClient: db,
      requiredGenerationStatus: 'ready',
    });
    expect(reservation).toEqual({
      reserved: false,
      reason: 'active_child_generation',
    });
    expect(provider.generateModuleLessonBatch).toHaveBeenCalledOnce();

    releaseProvider.resolve();
    await expect(generation).resolves.toEqual({ kind: 'failed' });
  });

  it('serializes the same plan lock and isolates different plans', async () => {
    const authUserId = buildTestAuthUserId('lifecycle-lock-serialize');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const planA = await createTestPlan({ userId, topic: 'Lock A' });
    const planB = await createTestPlan({ userId, topic: 'Lock B' });

    const held = createDeferredPromise<void>();
    const release = createDeferredPromise<void>();
    let secondAcquired = false;

    const first = db.transaction(async (tx) => {
      await lockPlanLifecycle(tx, planA.id);
      held.resolve();
      await release.promise;
    });

    await held.promise;

    await db.transaction(async (tx) => {
      await lockPlanLifecycle(tx, planB.id);
    });

    const second = db.transaction(async (tx) => {
      await lockPlanLifecycle(tx, planA.id);
      secondAcquired = true;
    });

    await waitForPlanLifecycleLockWaiter(planA.id);
    expect(secondAcquired).toBe(false);

    release.resolve();
    await Promise.all([first, second]);
    expect(secondAcquired).toBe(true);
  });
});
