import type { GenerateModuleLessonsDeps } from '@/features/lesson-content/generate-module-lessons.types';
import type { StartModuleLessonGenerationResult } from '@/features/lesson-content/start-module-lesson-generation-workflow';
import type { DbClient } from '@/lib/db/types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { MockGenerationProvider } from '@/features/ai/providers/mock';
import { getCurrentMonth } from '@/features/billing/usage-metrics';
import { setModuleLessonGenerationEnabledForTests } from '@/features/lesson-content/generation-flag';
import { runModuleLessonGenerationWork } from '@/features/lesson-content/run-module-lesson-generation-work';
import { startModuleLessonGeneration } from '@/features/lesson-content/start-module-lesson-generation-workflow';
import {
  loadModuleLessonGenerationContext,
  markModuleLessonProviderStarted,
} from '@/lib/db/queries/module-lesson-generation';
import { modules, tasks, aiUsageEvents, usageMetrics } from '@supabase/schema';
import { MAX_MODULE_LESSON_BATCH_TASKS } from '@supabase/schema/constants';
import { db } from '@supabase/service-role';
import { createId } from '@tests/fixtures/ids';
import { createTestModule, createTestTask } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db/users';
import {
  createRlsDbForUser,
  cleanupTrackedRlsClients,
} from '@tests/helpers/rls';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { and, asc, eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type StartThenRunParams = {
  readonly dbClient: DbClient;
  readonly userId: string;
  readonly planId: string;
  readonly moduleId: string;
  readonly userTier: SubscriptionTier;
};

async function startThenRunModuleLessonGeneration(
  params: StartThenRunParams,
  deps: GenerateModuleLessonsDeps = {},
): Promise<StartModuleLessonGenerationResult> {
  let capturedLoad: Awaited<
    ReturnType<typeof loadModuleLessonGenerationContext>
  > = null;
  let workResult: StartModuleLessonGenerationResult | undefined;

  const startResult = await startModuleLessonGeneration(
    {
      ...params,
      correlationId: createId('corr'),
    },
    {
      dbClient: deps.serverDbClient,
      isGenerationEnabled: deps.resolveGenerationEnabled,
      loadContext: async (dbClient, planId, moduleId, userId) => {
        capturedLoad = await loadModuleLessonGenerationContext(
          dbClient,
          planId,
          moduleId,
          userId,
        );
        return capturedLoad;
      },
      workflowStart: async () => {
        if (!capturedLoad) {
          workResult = { kind: 'failed' };
        } else {
          workResult = await runModuleLessonGenerationWork(
            {
              load: capturedLoad,
              userId: params.userId,
              planId: params.planId,
              moduleId: params.moduleId,
              userTier: params.userTier,
            },
            deps,
          );
        }
        return {
          runId: 'inline-test-run',
          returnValue: Promise.resolve(workResult),
        };
      },
    },
  );

  if (startResult.kind !== 'workflow_started') {
    return startResult;
  }

  return workResult ?? { kind: 'failed' };
}

describe('module lesson generation boundary (integration)', () => {
  afterEach(async () => {
    await cleanupTrackedRlsClients();
    setModuleLessonGenerationEnabledForTests(undefined);
  });

  beforeEach(() => {
    setModuleLessonGenerationEnabledForTests(true);
  });

  it('CAS + success persists task lessons, module ready, and usage row', async () => {
    const authUserId = buildTestAuthUserId('mod-lesson-boundary-ok');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createTestPlan({ userId, topic: 'Boundary ok' });
    const mod = await createTestModule({ planId: plan.id });
    const task1 = await createTestTask({ moduleId: mod.id, order: 1 });
    const task2 = await createTestTask({
      moduleId: mod.id,
      order: 2,
      title: 'Second',
    });

    const rlsDb = await createRlsDbForUser(authUserId);

    const beforeUsage = await db
      .select()
      .from(aiUsageEvents)
      .where(eq(aiUsageEvents.userId, userId));

    const result = await startThenRunModuleLessonGeneration(
      {
        dbClient: rlsDb,
        userId,
        planId: plan.id,
        moduleId: mod.id,
        userTier: 'free',
      },
      {
        provider: new MockGenerationProvider({
          delayMs: 0,
          deterministicSeed: 7,
        }),
      },
    );

    expect(result.kind).toBe('success');

    const afterUsage = await db
      .select()
      .from(aiUsageEvents)
      .where(eq(aiUsageEvents.userId, userId));
    expect(afterUsage.length).toBe(beforeUsage.length + 1);

    const [modRow] = await db
      .select()
      .from(modules)
      .where(eq(modules.id, mod.id));
    expect(modRow?.lessonGenerationStatus).toBe('ready');
    expect(modRow?.lessonGenerationError).toBeNull();

    const rows = await db
      .select({ id: tasks.id, lessonContent: tasks.lessonContent })
      .from(tasks)
      .where(eq(tasks.moduleId, mod.id))
      .orderBy(asc(tasks.order));

    expect(rows).toHaveLength(2);
    expect(rows[0]?.lessonContent?.version).toBe(1);
    expect(rows[1]?.lessonContent?.version).toBe(1);
    expect(rows[0]?.id).toBe(task1.id);
    expect(rows[1]?.id).toBe(task2.id);
  });

  it('persists distinct lesson content for max-batch tasks in one commit', async () => {
    const authUserId = buildTestAuthUserId('mod-lesson-max-batch');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createTestPlan({
      userId,
      topic: 'Max batch task coverage',
    });
    const mod = await createTestModule({ planId: plan.id });
    const createdTasks = await Promise.all(
      Array.from({ length: MAX_MODULE_LESSON_BATCH_TASKS }, (_, index) =>
        createTestTask({
          moduleId: mod.id,
          order: index + 1,
          title: `Task ${index + 1}`,
        }),
      ),
    );

    const rlsDb = await createRlsDbForUser(authUserId);
    const result = await startThenRunModuleLessonGeneration(
      {
        dbClient: rlsDb,
        userId,
        planId: plan.id,
        moduleId: mod.id,
        userTier: 'free',
      },
      {
        provider: new MockGenerationProvider({
          delayMs: 0,
          deterministicSeed: 23,
        }),
      },
    );

    expect(result.kind).toBe('success');

    const [modRow] = await db
      .select()
      .from(modules)
      .where(eq(modules.id, mod.id));
    expect(modRow?.lessonGenerationStatus).toBe('ready');

    const rows = await db
      .select({
        id: tasks.id,
        order: tasks.order,
        lessonContent: tasks.lessonContent,
      })
      .from(tasks)
      .where(eq(tasks.moduleId, mod.id))
      .orderBy(asc(tasks.order));

    expect(rows).toHaveLength(MAX_MODULE_LESSON_BATCH_TASKS);
    expect(rows.map((row) => row.id)).toEqual(
      createdTasks.map((task) => task.id),
    );
    expect(rows.every((row) => row.lessonContent?.version === 1)).toBe(true);
  });

  it('persists distinct lesson content for five tasks in one batch commit', async () => {
    const authUserId = buildTestAuthUserId('mod-lesson-five-tasks');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createTestPlan({ userId, topic: 'Five task batch' });
    const mod = await createTestModule({ planId: plan.id });
    const createdTasks = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        createTestTask({
          moduleId: mod.id,
          order: index + 1,
          title: `Task ${index + 1}`,
        }),
      ),
    );

    const rlsDb = await createRlsDbForUser(authUserId);
    const result = await startThenRunModuleLessonGeneration(
      {
        dbClient: rlsDb,
        userId,
        planId: plan.id,
        moduleId: mod.id,
        userTier: 'free',
      },
      {
        provider: new MockGenerationProvider({
          delayMs: 0,
          deterministicSeed: 19,
        }),
      },
    );

    expect(result.kind).toBe('success');

    const rows = await db
      .select({
        id: tasks.id,
        order: tasks.order,
        lessonContent: tasks.lessonContent,
        lessonContentUpdatedAt: tasks.lessonContentUpdatedAt,
      })
      .from(tasks)
      .where(eq(tasks.moduleId, mod.id))
      .orderBy(asc(tasks.order));

    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.id)).toEqual(
      createdTasks.map((task) => task.id),
    );

    const serializedContents = rows.map((row) =>
      JSON.stringify(row.lessonContent),
    );
    expect(new Set(serializedContents).size).toBe(5);

    const sharedTimestamp = rows[0]?.lessonContentUpdatedAt?.toISOString();
    expect(sharedTimestamp).toBeDefined();
    for (const row of rows) {
      expect(row.lessonContent?.version).toBe(1);
      expect(row.lessonContentUpdatedAt?.toISOString()).toBe(sharedTimestamp);
    }
  });

  it('retrying a failed module generation clears the error and returns ready', async () => {
    const authUserId = buildTestAuthUserId('mod-lesson-retry-failed');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createTestPlan({ userId, topic: 'Retry failed' });
    const mod = await createTestModule({ planId: plan.id });
    const task = await createTestTask({ moduleId: mod.id, order: 1 });

    await db
      .update(modules)
      .set({
        lessonGenerationStatus: 'failed',
        lessonGenerationFailedAt: new Date(),
        lessonGenerationError: 'previous generation failed',
      })
      .where(eq(modules.id, mod.id));

    const rlsDb = await createRlsDbForUser(authUserId);
    const result = await startThenRunModuleLessonGeneration(
      {
        dbClient: rlsDb,
        userId,
        planId: plan.id,
        moduleId: mod.id,
        userTier: 'free',
      },
      {
        provider: new MockGenerationProvider({
          delayMs: 0,
          deterministicSeed: 11,
        }),
      },
    );

    expect(result.kind).toBe('success');

    const [modRow] = await db
      .select()
      .from(modules)
      .where(eq(modules.id, mod.id));
    expect(modRow?.lessonGenerationStatus).toBe('ready');
    expect(modRow?.lessonGenerationError).toBeNull();

    const [taskRow] = await db
      .select({ lessonContent: tasks.lessonContent })
      .from(tasks)
      .where(eq(tasks.id, task.id));
    expect(taskRow?.lessonContent?.version).toBe(1);
  });

  it('second call while generating returns in_flight without finishing the stuck row', async () => {
    const authUserId = buildTestAuthUserId('mod-lesson-in-flight');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const plan = await createTestPlan({ userId });
    const mod = await createTestModule({ planId: plan.id });
    await createTestTask({ moduleId: mod.id });

    await db
      .update(modules)
      .set({ lessonGenerationStatus: 'generating' })
      .where(eq(modules.id, mod.id));

    const rlsDb = await createRlsDbForUser(authUserId);
    const result = await startThenRunModuleLessonGeneration(
      {
        dbClient: rlsDb,
        userId,
        planId: plan.id,
        moduleId: mod.id,
        userTier: 'free',
      },
      {
        provider: new MockGenerationProvider({
          delayMs: 0,
          deterministicSeed: 7,
        }),
      },
    );

    expect(result.kind).toBe('in_flight');
  });

  it('ready module short-circuits as already_ready', async () => {
    const authUserId = buildTestAuthUserId('mod-lesson-ready');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const plan = await createTestPlan({ userId });
    const mod = await createTestModule({ planId: plan.id });
    await createTestTask({ moduleId: mod.id });

    await db
      .update(modules)
      .set({
        lessonGenerationStatus: 'ready',
        lessonGenerationCompletedAt: new Date(),
      })
      .where(eq(modules.id, mod.id));

    const rlsDb = await createRlsDbForUser(authUserId);
    const result = await startThenRunModuleLessonGeneration(
      {
        dbClient: rlsDb,
        userId,
        planId: plan.id,
        moduleId: mod.id,
        userTier: 'free',
      },
      {
        provider: new MockGenerationProvider({
          delayMs: 0,
          deterministicSeed: 13,
        }),
      },
    );

    expect(result.kind).toBe('already_ready');
  });

  it('parser failure after claim sets failed and leaves lesson_content untouched', async () => {
    const authUserId = buildTestAuthUserId('mod-lesson-fail');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const plan = await createTestPlan({ userId });
    const mod = await createTestModule({ planId: plan.id });
    const task = await createTestTask({ moduleId: mod.id });

    const seedContent = {
      version: 1 as const,
      blocks: [{ type: 'heading' as const, text: 'Seed' }],
    };
    await db
      .update(tasks)
      .set({ lessonContent: seedContent })
      .where(eq(tasks.id, task.id));

    const rlsDb = await createRlsDbForUser(authUserId);
    const badBatch = new MockGenerationProvider({
      scenario: 'invalid_response',
    });

    const result = await startThenRunModuleLessonGeneration(
      {
        dbClient: rlsDb,
        userId,
        planId: plan.id,
        moduleId: mod.id,
        userTier: 'free',
      },
      { provider: badBatch },
    );

    expect(result.kind).toBe('failed');

    const [modRow] = await db
      .select()
      .from(modules)
      .where(eq(modules.id, mod.id));
    expect(modRow?.lessonGenerationStatus).toBe('failed');
    expect(modRow?.lessonGenerationError).toBeNull();

    const [ownerVisibleModule] = await rlsDb
      .select({ lessonGenerationError: modules.lessonGenerationError })
      .from(modules)
      .where(eq(modules.id, mod.id));
    expect(ownerVisibleModule?.lessonGenerationError).toBeNull();

    const [taskRow] = await db
      .select({ lessonContent: tasks.lessonContent })
      .from(tasks)
      .where(eq(tasks.id, task.id));
    expect(taskRow?.lessonContent).toEqual(seedContent);
  });

  it('fails without partial writes when tasks drift before success persist', async () => {
    const authUserId = buildTestAuthUserId('mod-lesson-task-drift');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createTestPlan({ userId });
    const mod = await createTestModule({ planId: plan.id });
    const task = await createTestTask({ moduleId: mod.id, order: 1 });

    const rlsDb = await createRlsDbForUser(authUserId);
    const driftingProvider = {
      generateModuleLessonBatch: vi.fn(async () => {
        await createTestTask({
          moduleId: mod.id,
          order: 2,
          title: 'Late task',
        });

        return {
          stream: new ReadableStream<string>({
            start(controller) {
              controller.enqueue(
                JSON.stringify({
                  version: 1,
                  tasks: [
                    {
                      taskId: task.id,
                      content: {
                        version: 1,
                        blocks: [{ type: 'heading', text: 'Original only' }],
                      },
                    },
                  ],
                }),
              );
              controller.close();
            },
          }),
          metadata: {
            provider: 'mock',
            model: 'mock-module-lesson-batch-v1',
            usage: {
              promptTokens: 1,
              completionTokens: 1,
              totalTokens: 2,
            },
          },
        };
      }),
    };

    const result = await startThenRunModuleLessonGeneration(
      {
        dbClient: rlsDb,
        userId,
        planId: plan.id,
        moduleId: mod.id,
        userTier: 'free',
      },
      { provider: driftingProvider },
    );

    expect(result).toEqual({ kind: 'failed' });

    const [modRow] = await db
      .select()
      .from(modules)
      .where(eq(modules.id, mod.id));
    expect(modRow?.lessonGenerationStatus).toBe('failed');

    const taskRows = await db
      .select({ lessonContent: tasks.lessonContent })
      .from(tasks)
      .where(eq(tasks.moduleId, mod.id))
      .orderBy(asc(tasks.order));
    expect(taskRows).toHaveLength(2);
    expect(taskRows.every((row) => row.lessonContent === null)).toBe(true);
  });

  it('parallel generate: one claimed path succeeds, other observes in_flight', async () => {
    const authUserId = buildTestAuthUserId('mod-lesson-parallel');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createTestPlan({ userId });
    const mod = await createTestModule({ planId: plan.id });
    await createTestTask({ moduleId: mod.id });

    const [dbA, dbB] = await Promise.all([
      createRlsDbForUser(authUserId),
      createRlsDbForUser(authUserId),
    ]);

    const params = {
      userId,
      planId: plan.id,
      moduleId: mod.id,
      userTier: 'free' as const,
    };

    const [a, b] = await Promise.all([
      startThenRunModuleLessonGeneration({ dbClient: dbA, ...params }),
      startThenRunModuleLessonGeneration({ dbClient: dbB, ...params }),
    ]);

    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(['in_flight', 'success']);
  });

  it('returns not_found for module outside user scope', async () => {
    const authA = buildTestAuthUserId('mod-lesson-a');
    const authB = buildTestAuthUserId('mod-lesson-b');
    const userA = await ensureUser({
      authUserId: authA,
      email: buildTestEmail(authA),
    });
    const userB = await ensureUser({
      authUserId: authB,
      email: buildTestEmail(authB),
    });
    const plan = await createTestPlan({ userId: userA });
    const mod = await createTestModule({ planId: plan.id });
    await createTestTask({ moduleId: mod.id });

    const rlsDbB = await createRlsDbForUser(authB);
    const result = await startThenRunModuleLessonGeneration({
      dbClient: rlsDbB,
      userId: userB,
      planId: plan.id,
      moduleId: mod.id,
      userTier: 'free',
    });

    expect(result.kind).toBe('not_found');
  });

  it('generates for an owned later module while earlier modules are incomplete', async () => {
    const authUserId = buildTestAuthUserId('mod-lesson-locked');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const month = getCurrentMonth();
    await db.insert(usageMetrics).values({
      userId,
      month,
      lessonModulesGenerated: 0,
    });

    const plan = await createTestPlan({ userId });
    const firstModule = await createTestModule({
      planId: plan.id,
      order: 1,
      title: 'Incomplete first module',
    });
    const laterModule = await createTestModule({
      planId: plan.id,
      order: 2,
      title: 'Later second module',
    });
    await createTestTask({ moduleId: firstModule.id, order: 1 });
    await createTestTask({ moduleId: laterModule.id, order: 1 });

    const rlsDb = await createRlsDbForUser(authUserId);
    const result = await startThenRunModuleLessonGeneration(
      {
        dbClient: rlsDb,
        userId,
        planId: plan.id,
        moduleId: laterModule.id,
        userTier: 'free',
      },
      {
        provider: new MockGenerationProvider({
          delayMs: 0,
          deterministicSeed: 19,
        }),
      },
    );

    expect(result.kind).not.toBe('locked');
    expect(result.kind).toBe('success');

    const [metrics] = await db
      .select({ n: usageMetrics.lessonModulesGenerated })
      .from(usageMetrics)
      .where(
        and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)),
      );
    expect(metrics?.n).toBe(1);
  });

  it('returns disabled when module-lesson-generation flag is false', async () => {
    setModuleLessonGenerationEnabledForTests(false);

    const authUserId = buildTestAuthUserId('mod-lesson-disabled');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const plan = await createTestPlan({ userId });
    const mod = await createTestModule({ planId: plan.id });
    await createTestTask({ moduleId: mod.id });

    const rlsDb = await createRlsDbForUser(authUserId);
    const result = await startThenRunModuleLessonGeneration(
      {
        dbClient: rlsDb,
        userId,
        planId: plan.id,
        moduleId: mod.id,
        userTier: 'free',
      },
      {
        provider: new MockGenerationProvider({
          delayMs: 0,
          deterministicSeed: 13,
        }),
      },
    );

    expect(result.kind).toBe('disabled');
  });

  it('records attempts without enforcing a lesson product quota', async () => {
    const authUserId = buildTestAuthUserId('mod-lesson-quota');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const month = getCurrentMonth();
    await db.insert(usageMetrics).values({
      userId,
      month,
      lessonModulesGenerated: 3,
    });

    const plan = await createTestPlan({ userId });
    const mod = await createTestModule({ planId: plan.id });
    await createTestTask({ moduleId: mod.id });

    const rlsDb = await createRlsDbForUser(authUserId);
    const result = await startThenRunModuleLessonGeneration(
      {
        dbClient: rlsDb,
        userId,
        planId: plan.id,
        moduleId: mod.id,
        userTier: 'free',
      },
      {
        provider: new MockGenerationProvider({
          delayMs: 0,
          deterministicSeed: 17,
        }),
      },
    );

    expect(result.kind).toBe('success');
    expect(result).not.toMatchObject({ kind: 'quota_denied' });

    const [modRow] = await db
      .select()
      .from(modules)
      .where(eq(modules.id, mod.id));
    expect(modRow?.lessonGenerationStatus).toBe('ready');

    const [metrics] = await db
      .select({ n: usageMetrics.lessonModulesGenerated })
      .from(usageMetrics)
      .where(
        and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)),
      );
    expect(metrics?.n).toBe(4);
  });

  it('provider failure after claim persists failed and records the attempt', async () => {
    const authUserId = buildTestAuthUserId('mod-lesson-quota-error');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createTestPlan({ userId });
    const mod = await createTestModule({ planId: plan.id });
    await createTestTask({ moduleId: mod.id });
    const month = getCurrentMonth();

    const rlsDb = await createRlsDbForUser(authUserId);
    const provider = {
      generateModuleLessonBatch: vi.fn(async () => {
        throw new Error('provider failed');
      }),
    };
    const result = await startThenRunModuleLessonGeneration(
      {
        dbClient: rlsDb,
        userId,
        planId: plan.id,
        moduleId: mod.id,
        userTier: 'free',
      },
      { provider },
    );

    expect(result).toEqual({ kind: 'failed' });
    expect(provider.generateModuleLessonBatch).toHaveBeenCalled();

    const [modRow] = await db
      .select()
      .from(modules)
      .where(eq(modules.id, mod.id));
    expect(modRow?.lessonGenerationStatus).toBe('failed');

    const [metrics] = await db
      .select({ n: usageMetrics.lessonModulesGenerated })
      .from(usageMetrics)
      .where(
        and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)),
      );
    expect(metrics?.n).toBe(1);
  });

  it('success records the provider-started lesson attempt', async () => {
    const authUserId = buildTestAuthUserId('mod-lesson-usage-ok');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const month = getCurrentMonth();
    await db.insert(usageMetrics).values({
      userId,
      month,
      lessonModulesGenerated: 0,
    });

    const plan = await createTestPlan({ userId, topic: 'Usage ok' });
    const mod = await createTestModule({ planId: plan.id });
    await createTestTask({ moduleId: mod.id });

    const rlsDb = await createRlsDbForUser(authUserId);
    const result = await startThenRunModuleLessonGeneration(
      {
        dbClient: rlsDb,
        userId,
        planId: plan.id,
        moduleId: mod.id,
        userTier: 'free',
      },
      {
        provider: new MockGenerationProvider({
          delayMs: 0,
          deterministicSeed: 13,
        }),
      },
    );

    expect(result.kind).toBe('success');

    const [metrics] = await db
      .select({ n: usageMetrics.lessonModulesGenerated })
      .from(usageMetrics)
      .where(
        sql`${usageMetrics.userId} = ${userId} AND ${usageMetrics.month} = ${month}`,
      );
    expect(metrics?.n).toBe(1);
  });

  it('replaying provider start preserves the marker and meters once', async () => {
    const authUserId = buildTestAuthUserId('mod-lesson-provider-replay');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const providerStartedAt = '2026-08-20T18:00:00.000Z';
    const month = getCurrentMonth(new Date(providerStartedAt));
    await db.insert(usageMetrics).values({
      userId,
      month,
      lessonModulesGenerated: 0,
    });

    const plan = await createTestPlan({ userId, topic: 'Provider replay' });
    const mod = await createTestModule({ planId: plan.id });
    await db
      .update(modules)
      .set({
        lessonGenerationStatus: 'generating',
        lessonGenerationMetadata: { version: 1 },
      })
      .where(eq(modules.id, mod.id));

    await markModuleLessonProviderStarted(db, {
      userId,
      planId: plan.id,
      moduleId: mod.id,
      providerStartedAt,
    });
    await markModuleLessonProviderStarted(db, {
      userId,
      planId: plan.id,
      moduleId: mod.id,
      providerStartedAt: '2026-08-20T18:01:00.000Z',
    });

    const [modRow] = await db
      .select({ metadata: modules.lessonGenerationMetadata })
      .from(modules)
      .where(eq(modules.id, mod.id));
    expect(modRow?.metadata?.providerStartedAt).toBe(providerStartedAt);

    const [metrics] = await db
      .select({ n: usageMetrics.lessonModulesGenerated })
      .from(usageMetrics)
      .where(
        and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)),
      );
    expect(metrics?.n).toBe(1);
  });

  it('cold-start success creates an observational lesson usage row', async () => {
    const authUserId = buildTestAuthUserId('mod-lesson-usage-cold-start');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const month = getCurrentMonth();

    const [before] = await db
      .select({ n: usageMetrics.lessonModulesGenerated })
      .from(usageMetrics)
      .where(
        and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)),
      );
    expect(before).toBeUndefined();

    const plan = await createTestPlan({ userId, topic: 'Usage cold start' });
    const mod = await createTestModule({ planId: plan.id });
    await createTestTask({ moduleId: mod.id });

    const rlsDb = await createRlsDbForUser(authUserId);
    const result = await startThenRunModuleLessonGeneration(
      {
        dbClient: rlsDb,
        userId,
        planId: plan.id,
        moduleId: mod.id,
        userTier: 'free',
      },
      {
        provider: new MockGenerationProvider({
          delayMs: 0,
          deterministicSeed: 17,
        }),
      },
    );

    expect(result.kind).toBe('success');

    const [metrics] = await db
      .select({ n: usageMetrics.lessonModulesGenerated })
      .from(usageMetrics)
      .where(
        and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)),
      );
    expect(metrics?.n).toBe(1);
  });

  it('parser failure after provider start records the attempt', async () => {
    const authUserId = buildTestAuthUserId('mod-lesson-usage-fail');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const month = getCurrentMonth();
    await db.insert(usageMetrics).values({
      userId,
      month,
      lessonModulesGenerated: 2,
    });

    const plan = await createTestPlan({ userId });
    const mod = await createTestModule({ planId: plan.id });
    await createTestTask({ moduleId: mod.id });

    const rlsDb = await createRlsDbForUser(authUserId);
    const badBatch = new MockGenerationProvider({
      scenario: 'invalid_response',
    });

    const result = await startThenRunModuleLessonGeneration(
      {
        dbClient: rlsDb,
        userId,
        planId: plan.id,
        moduleId: mod.id,
        userTier: 'free',
      },
      { provider: badBatch },
    );

    expect(result.kind).toBe('failed');

    const [metrics] = await db
      .select({ n: usageMetrics.lessonModulesGenerated })
      .from(usageMetrics)
      .where(
        sql`${usageMetrics.userId} = ${userId} AND ${usageMetrics.month} = ${month}`,
      );
    expect(metrics?.n).toBe(3);
  });

  it('already_ready does not change lesson_modules_generated', async () => {
    const authUserId = buildTestAuthUserId('mod-lesson-usage-ready');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const month = getCurrentMonth();
    await db.insert(usageMetrics).values({
      userId,
      month,
      lessonModulesGenerated: 1,
    });

    const plan = await createTestPlan({ userId });
    const mod = await createTestModule({ planId: plan.id });
    await createTestTask({ moduleId: mod.id });

    await db
      .update(modules)
      .set({
        lessonGenerationStatus: 'ready',
        lessonGenerationCompletedAt: new Date(),
      })
      .where(eq(modules.id, mod.id));

    const rlsDb = await createRlsDbForUser(authUserId);
    const result = await startThenRunModuleLessonGeneration({
      dbClient: rlsDb,
      userId,
      planId: plan.id,
      moduleId: mod.id,
      userTier: 'free',
    });

    expect(result.kind).toBe('already_ready');

    const [metrics] = await db
      .select({ n: usageMetrics.lessonModulesGenerated })
      .from(usageMetrics)
      .where(
        sql`${usageMetrics.userId} = ${userId} AND ${usageMetrics.month} = ${month}`,
      );
    expect(metrics?.n).toBe(1);
  });

  it('in_flight does not change lesson_modules_generated', async () => {
    const authUserId = buildTestAuthUserId('mod-lesson-usage-inflight');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const month = getCurrentMonth();
    await db.insert(usageMetrics).values({
      userId,
      month,
      lessonModulesGenerated: 1,
    });

    const plan = await createTestPlan({ userId });
    const mod = await createTestModule({ planId: plan.id });
    await createTestTask({ moduleId: mod.id });

    await db
      .update(modules)
      .set({ lessonGenerationStatus: 'generating' })
      .where(eq(modules.id, mod.id));

    const rlsDb = await createRlsDbForUser(authUserId);
    const result = await startThenRunModuleLessonGeneration({
      dbClient: rlsDb,
      userId,
      planId: plan.id,
      moduleId: mod.id,
      userTier: 'free',
    });

    expect(result.kind).toBe('in_flight');

    const [metrics] = await db
      .select({ n: usageMetrics.lessonModulesGenerated })
      .from(usageMetrics)
      .where(
        sql`${usageMetrics.userId} = ${userId} AND ${usageMetrics.month} = ${month}`,
      );
    expect(metrics?.n).toBe(1);
  });
});
