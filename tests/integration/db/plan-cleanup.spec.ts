import { getCurrentMonth } from '@/features/billing/usage-metrics';
import { setModuleLessonGenerationEnabledForTests } from '@/features/lesson-content/generation-flag';
import { startModuleLessonGeneration } from '@/features/lesson-content/start-module-lesson-generation-workflow';
import {
  cleanupAbandonedModuleLessonGenerations,
  cleanupOrphanedAttempts,
  cleanupStuckPlans,
  ORPHANED_ATTEMPT_THRESHOLD_MS,
  ORPHANED_MODULE_LESSON_GENERATION_THRESHOLD_MS,
  STUCK_PLAN_THRESHOLD_MS,
} from '@/features/plans/cleanup';
import {
  generationAttempts,
  jobQueue,
  learningPlans,
  modules,
  usageMetrics,
} from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createId } from '@tests/fixtures/ids';
import { createTestModule, createTestTask } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { createTestUser } from '@tests/fixtures/users';
import { eq, inArray } from 'drizzle-orm';
import { AsyncLocalStorage } from 'node:async_hooks';
import { describe, expect, it, vi } from 'vitest';

const getWorkflowMetadata = vi.hoisted(() => vi.fn());

vi.mock('workflow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('workflow')>();
  return {
    ...actual,
    getWorkflowMetadata,
  };
});

const workflowRunIds = new AsyncLocalStorage<string>();
getWorkflowMetadata.mockImplementation(() => ({
  workflowRunId: workflowRunIds.getStore() ?? 'missing-workflow-run-id',
}));

describe('cleanupStuckPlans (integration)', () => {
  it('restores last-good stuck plans and fails never-usable stuck plans', async () => {
    const user = await createTestUser();
    const thresholdMs = STUCK_PLAN_THRESHOLD_MS;
    const stuckCutoff = new Date(Date.now() - thresholdMs - 60_000);
    const recentCutoff = new Date(Date.now() - 60_000);

    const stuckOne = await createTestPlan({
      userId: user.id,
      topic: 'Stuck one',
      generationStatus: 'generating',
      isQuotaEligible: true,
    });
    const stuckTwo = await createTestPlan({
      userId: user.id,
      topic: 'Stuck two',
      generationStatus: 'generating',
      isQuotaEligible: false,
    });
    const recentGenerating = await createTestPlan({
      userId: user.id,
      topic: 'Recent generating',
      generationStatus: 'generating',
      isQuotaEligible: false,
    });
    const oldReady = await createTestPlan({
      userId: user.id,
      topic: 'Old ready',
      generationStatus: 'ready',
      isQuotaEligible: true,
    });
    const oldFailed = await createTestPlan({
      userId: user.id,
      topic: 'Old failed',
      generationStatus: 'failed',
      isQuotaEligible: false,
    });

    await db
      .update(learningPlans)
      .set({ updatedAt: stuckCutoff })
      .where(inArray(learningPlans.id, [stuckOne.id, stuckTwo.id]));

    await db
      .update(learningPlans)
      .set({ updatedAt: recentCutoff })
      .where(
        inArray(learningPlans.id, [
          recentGenerating.id,
          oldReady.id,
          oldFailed.id,
        ]),
      );

    const result = await cleanupStuckPlans(db, thresholdMs);

    expect(result.cleaned).toBe(2);

    const rows = await db
      .select({
        id: learningPlans.id,
        generationStatus: learningPlans.generationStatus,
        isQuotaEligible: learningPlans.isQuotaEligible,
        updatedAt: learningPlans.updatedAt,
      })
      .from(learningPlans)
      .where(
        inArray(learningPlans.id, [
          stuckOne.id,
          stuckTwo.id,
          recentGenerating.id,
          oldReady.id,
          oldFailed.id,
        ]),
      );

    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(byId.get(stuckOne.id)).toMatchObject({
      generationStatus: 'ready',
      isQuotaEligible: true,
    });
    expect(byId.get(stuckTwo.id)).toMatchObject({
      generationStatus: 'failed',
      isQuotaEligible: false,
    });
    expect(byId.get(stuckOne.id)?.updatedAt?.toISOString()).toBe(
      byId.get(stuckTwo.id)?.updatedAt?.toISOString(),
    );

    expect(byId.get(recentGenerating.id)).toMatchObject({
      generationStatus: 'generating',
      isQuotaEligible: false,
    });
    expect(byId.get(oldReady.id)).toMatchObject({
      generationStatus: 'ready',
      isQuotaEligible: true,
    });
    expect(byId.get(oldFailed.id)).toMatchObject({
      generationStatus: 'failed',
      isQuotaEligible: false,
    });
  });

  it('returns 0 when no stuck generating plans exist', async () => {
    const user = await createTestUser();
    const plan = await createTestPlan({
      userId: user.id,
      generationStatus: 'generating',
    });

    await db
      .update(learningPlans)
      .set({ updatedAt: new Date() })
      .where(eq(learningPlans.id, plan.id));

    const result = await cleanupStuckPlans(db);

    expect(result.cleaned).toBe(0);

    const [row] = await db
      .select({ generationStatus: learningPlans.generationStatus })
      .from(learningPlans)
      .where(eq(learningPlans.id, plan.id));

    expect(row?.generationStatus).toBe('generating');
  });

  it('keeps a stale plan owned by a processing regeneration workflow', async () => {
    const user = await createTestUser();
    const plan = await createTestPlan({
      userId: user.id,
      generationStatus: 'generating',
    });
    const runId = 'wrun-active-stuck-plan';

    await db
      .update(learningPlans)
      .set({
        updatedAt: new Date(Date.now() - STUCK_PLAN_THRESHOLD_MS - 60_000),
      })
      .where(eq(learningPlans.id, plan.id));
    await db.insert(jobQueue).values({
      planId: plan.id,
      userId: user.id,
      jobType: 'plan_regeneration',
      status: 'processing',
      payload: {
        planId: plan.id,
        workflow: { provider: 'workflow-sdk', runId },
      },
    });

    const result = await cleanupStuckPlans(db);

    expect(result.cleaned).toBe(0);
    const [row] = await db
      .select({ generationStatus: learningPlans.generationStatus })
      .from(learningPlans)
      .where(eq(learningPlans.id, plan.id));
    expect(row?.generationStatus).toBe('generating');
  });
});

describe('cleanupAbandonedModuleLessonGenerations (integration)', () => {
  it('settles stale provider-started work without refunding the budget and permits a charged retry', async () => {
    const user = await createTestUser();
    const plan = await createTestPlan({
      userId: user.id,
      topic: 'Abandoned module lesson generation',
    });
    const mod = await createTestModule({ planId: plan.id });
    await createTestTask({ moduleId: mod.id });
    const month = getCurrentMonth();
    const staleStartedAt = new Date(
      Date.now() - ORPHANED_MODULE_LESSON_GENERATION_THRESHOLD_MS - 60_000,
    );

    await db.insert(usageMetrics).values({
      userId: user.id,
      month,
      lessonModulesGenerated: 1,
    });
    await db
      .update(modules)
      .set({
        lessonGenerationStatus: 'generating',
        lessonGenerationStartedAt: staleStartedAt,
        lessonGenerationCompletedAt: null,
        lessonGenerationFailedAt: null,
        lessonGenerationError: null,
        lessonGenerationMetadata: {
          version: 1,
          providerStartedAt: staleStartedAt.toISOString(),
        },
      })
      .where(eq(modules.id, mod.id));

    const cleanupResult = await cleanupAbandonedModuleLessonGenerations(db);
    expect(cleanupResult.cleaned).toBe(1);

    const [settledModule] = await db
      .select({
        status: modules.lessonGenerationStatus,
        error: modules.lessonGenerationError,
        metadata: modules.lessonGenerationMetadata,
      })
      .from(modules)
      .where(eq(modules.id, mod.id));
    expect(settledModule).toMatchObject({
      status: 'failed',
      error:
        'Provider-started lesson generation was interrupted; retry required.',
      metadata: {
        version: 1,
        providerStartedAt: staleStartedAt.toISOString(),
      },
    });

    const [afterCleanup] = await db
      .select({ lessonModulesGenerated: usageMetrics.lessonModulesGenerated })
      .from(usageMetrics)
      .where(eq(usageMetrics.userId, user.id));
    expect(afterCleanup?.lessonModulesGenerated).toBe(1);

    setModuleLessonGenerationEnabledForTests(true);
    vi.stubEnv('MOCK_AI_SCENARIO', 'provider_error');
    let workflowResult: { kind: string } | undefined;
    const startResult = await startModuleLessonGeneration(
      {
        dbClient: db,
        userId: user.id,
        planId: plan.id,
        moduleId: mod.id,
        correlationId: 'plan-cleanup-retry',
      },
      {
        dbClient: db,
        isGenerationEnabled: async () => true,
        workflowStart: async (workflowFn, args) => {
          const runId = createId('wrun');
          workflowResult = await workflowRunIds.run(runId, () =>
            workflowFn(args[0]),
          );
          return {
            runId,
            returnValue: Promise.resolve(workflowResult),
          };
        },
      },
    );
    expect(startResult.kind).toBe('workflow_started');
    expect(workflowResult?.kind).toBe('failed');
    vi.unstubAllEnvs();
    setModuleLessonGenerationEnabledForTests(undefined);

    const [afterRetry] = await db
      .select({ lessonModulesGenerated: usageMetrics.lessonModulesGenerated })
      .from(usageMetrics)
      .where(eq(usageMetrics.userId, user.id));
    expect(afterRetry?.lessonModulesGenerated).toBe(2);
  });

  it('does not settle provider work whose providerStartedAt is still inside the threshold', async () => {
    const user = await createTestUser();
    const plan = await createTestPlan({
      userId: user.id,
      topic: 'Recent provider start',
    });
    const mod = await createTestModule({ planId: plan.id });
    await createTestTask({ moduleId: mod.id });
    const staleClaimAt = new Date(
      Date.now() - ORPHANED_MODULE_LESSON_GENERATION_THRESHOLD_MS - 60_000,
    );
    const recentProviderAt = new Date(Date.now() - 60_000);

    await db
      .update(modules)
      .set({
        lessonGenerationStatus: 'generating',
        lessonGenerationStartedAt: staleClaimAt,
        lessonGenerationCompletedAt: null,
        lessonGenerationFailedAt: null,
        lessonGenerationError: null,
        lessonGenerationMetadata: {
          version: 1,
          providerStartedAt: recentProviderAt.toISOString(),
        },
      })
      .where(eq(modules.id, mod.id));

    const cleanupResult = await cleanupAbandonedModuleLessonGenerations(db);
    expect(cleanupResult.cleaned).toBe(0);

    const [row] = await db
      .select({
        status: modules.lessonGenerationStatus,
        error: modules.lessonGenerationError,
      })
      .from(modules)
      .where(eq(modules.id, mod.id));
    expect(row).toMatchObject({
      status: 'generating',
      error: null,
    });
  });
});

describe('cleanupOrphanedAttempts (integration)', () => {
  it('finalizes stale in_progress attempts and leaves recent attempts untouched', async () => {
    const user = await createTestUser();
    const staleCutoff = new Date(
      Date.now() - ORPHANED_ATTEMPT_THRESHOLD_MS - 60_000,
    );
    const recentCutoff = new Date(Date.now() - 60_000);

    const stalePlan = await createTestPlan({
      userId: user.id,
      topic: 'Stale attempt plan',
    });
    const recentPlan = await createTestPlan({
      userId: user.id,
      topic: 'Recent attempt plan',
    });

    const [staleAttempt] = await db
      .insert(generationAttempts)
      .values({
        planId: stalePlan.id,
        status: 'in_progress',
        classification: null,
        durationMs: 0,
        modulesCount: 0,
        tasksCount: 0,
      })
      .returning();
    const [recentAttempt] = await db
      .insert(generationAttempts)
      .values({
        planId: recentPlan.id,
        status: 'in_progress',
        classification: null,
        durationMs: 0,
        modulesCount: 0,
        tasksCount: 0,
      })
      .returning();

    await db
      .update(generationAttempts)
      .set({ createdAt: staleCutoff })
      .where(eq(generationAttempts.id, staleAttempt.id));
    await db
      .update(generationAttempts)
      .set({ createdAt: recentCutoff })
      .where(eq(generationAttempts.id, recentAttempt.id));

    const result = await cleanupOrphanedAttempts(db);

    expect(result.cleaned).toBe(1);

    const rows = await db
      .select({
        id: generationAttempts.id,
        status: generationAttempts.status,
        classification: generationAttempts.classification,
      })
      .from(generationAttempts)
      .where(
        inArray(generationAttempts.id, [staleAttempt.id, recentAttempt.id]),
      );

    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(staleAttempt.id)).toMatchObject({
      status: 'failure',
      classification: 'timeout',
    });
    expect(byId.get(recentAttempt.id)).toMatchObject({
      status: 'in_progress',
      classification: null,
    });
  });

  it('keeps a stale attempt owned by a processing regeneration workflow', async () => {
    const user = await createTestUser();
    const activePlan = await createTestPlan({ userId: user.id });
    const orphanedPlan = await createTestPlan({ userId: user.id });
    const runId = 'wrun-active-attempt';
    const staleCutoff = new Date(
      Date.now() - ORPHANED_ATTEMPT_THRESHOLD_MS - 60_000,
    );

    const [activeAttempt, orphanedAttempt] = await db
      .insert(generationAttempts)
      .values([
        {
          planId: activePlan.id,
          status: 'in_progress',
          generationPurpose: 'regeneration',
          classification: null,
          durationMs: 0,
          modulesCount: 0,
          tasksCount: 0,
          metadata: {
            workflow: { provider: 'workflow-sdk', runId },
          },
        },
        {
          planId: orphanedPlan.id,
          status: 'in_progress',
          generationPurpose: 'regeneration',
          classification: null,
          durationMs: 0,
          modulesCount: 0,
          tasksCount: 0,
        },
      ])
      .returning();
    await db
      .update(generationAttempts)
      .set({ createdAt: staleCutoff })
      .where(
        inArray(generationAttempts.id, [activeAttempt.id, orphanedAttempt.id]),
      );
    await db.insert(jobQueue).values({
      planId: activePlan.id,
      userId: user.id,
      jobType: 'plan_regeneration',
      status: 'processing',
      payload: {
        planId: activePlan.id,
        workflow: { provider: 'workflow-sdk', runId },
      },
    });

    const result = await cleanupOrphanedAttempts(db);

    expect(result.cleaned).toBe(1);
    const rows = await db
      .select({
        id: generationAttempts.id,
        status: generationAttempts.status,
        classification: generationAttempts.classification,
      })
      .from(generationAttempts)
      .where(
        inArray(generationAttempts.id, [activeAttempt.id, orphanedAttempt.id]),
      );
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(activeAttempt.id)).toMatchObject({
      status: 'in_progress',
      classification: null,
    });
    expect(byId.get(orphanedAttempt.id)).toMatchObject({
      status: 'failure',
      classification: 'timeout',
    });
  });

  it('returns 0 when no orphaned in_progress attempts exist', async () => {
    const user = await createTestUser();
    const plan = await createTestPlan({ userId: user.id });
    const recentCutoff = new Date(Date.now() - 60_000);

    const [attempt] = await db
      .insert(generationAttempts)
      .values({
        planId: plan.id,
        status: 'in_progress',
        classification: null,
        durationMs: 0,
        modulesCount: 0,
        tasksCount: 0,
      })
      .returning();

    await db
      .update(generationAttempts)
      .set({ createdAt: recentCutoff })
      .where(eq(generationAttempts.id, attempt.id));

    const result = await cleanupOrphanedAttempts(db);

    expect(result.cleaned).toBe(0);
  });

  it('processes only one bounded batch per run', async () => {
    const user = await createTestUser();
    const staleCutoff = new Date(
      Date.now() - ORPHANED_ATTEMPT_THRESHOLD_MS - 60_000,
    );
    const attemptIds: string[] = [];

    for (let index = 0; index < 3; index += 1) {
      const plan = await createTestPlan({
        userId: user.id,
        topic: `Stale attempt plan ${index}`,
      });
      const [attempt] = await db
        .insert(generationAttempts)
        .values({
          planId: plan.id,
          status: 'in_progress',
          classification: null,
          durationMs: 0,
          modulesCount: 0,
          tasksCount: 0,
        })
        .returning();
      await db
        .update(generationAttempts)
        .set({ createdAt: staleCutoff })
        .where(eq(generationAttempts.id, attempt.id));
      attemptIds.push(attempt.id);
    }

    const result = await cleanupOrphanedAttempts(db, undefined, {
      batchSize: 2,
    });

    expect(result.cleaned).toBe(2);

    const rows = await db
      .select({
        id: generationAttempts.id,
        status: generationAttempts.status,
        classification: generationAttempts.classification,
      })
      .from(generationAttempts)
      .where(inArray(generationAttempts.id, attemptIds));

    const finalized = rows.filter((row) => row.classification === 'timeout');
    const stillInProgress = rows.filter(
      (row) => row.status === 'in_progress' && row.classification === null,
    );

    expect(finalized).toHaveLength(2);
    expect(stillInProgress).toHaveLength(1);
  });
});
