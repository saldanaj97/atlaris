import { generateModuleLessons } from '@/features/lesson-content/generate-module-lessons';
import { getCurrentMonth } from '@/features/billing/usage-metrics';
import { MockGenerationProvider } from '@/features/ai/providers/mock';
import { modules, tasks, aiUsageEvents, usageMetrics } from '@supabase/schema';
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
import { db } from '@supabase/service-role';

describe('module lesson generation boundary (integration)', () => {
  afterEach(async () => {
    await cleanupTrackedRlsClients();
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('LESSON_GENERATION_ENABLED', '1');
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

    const result = await generateModuleLessons(
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
    const result = await generateModuleLessons(
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
    const result = await generateModuleLessons(
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
    const result = await generateModuleLessons(
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

    const result = await generateModuleLessons(
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
    expect(modRow?.lessonGenerationError).toMatch(/valid JSON/i);

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

    const result = await generateModuleLessons(
      {
        dbClient: rlsDb,
        userId,
        planId: plan.id,
        moduleId: mod.id,
        userTier: 'free',
      },
      { provider: driftingProvider },
    );

    expect(result.kind).toBe('failed');
    expect(result.kind === 'failed' ? result.message : '').toMatch(
      /coverage drifted/i,
    );

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
      generateModuleLessons({ dbClient: dbA, ...params }),
      generateModuleLessons({ dbClient: dbB, ...params }),
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
    const result = await generateModuleLessons({
      dbClient: rlsDbB,
      userId: userB,
      planId: plan.id,
      moduleId: mod.id,
      userTier: 'free',
    });

    expect(result.kind).toBe('not_found');
  });

  it('returns locked for an owned module behind incomplete prior modules without provider or quota side effects', async () => {
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
    const lockedModule = await createTestModule({
      planId: plan.id,
      order: 2,
      title: 'Locked second module',
    });
    await createTestTask({ moduleId: firstModule.id, order: 1 });
    await createTestTask({ moduleId: lockedModule.id, order: 1 });

    const rlsDb = await createRlsDbForUser(authUserId);
    const provider = {
      generateModuleLessonBatch: vi.fn(async () => {
        throw new Error('provider should not run for locked modules');
      }),
    };

    const result = await generateModuleLessons(
      {
        dbClient: rlsDb,
        userId,
        planId: plan.id,
        moduleId: lockedModule.id,
        userTier: 'free',
      },
      { provider },
    );

    expect(result.kind).toBe('locked');
    expect(provider.generateModuleLessonBatch).not.toHaveBeenCalled();

    const [modRow] = await db
      .select()
      .from(modules)
      .where(eq(modules.id, lockedModule.id));
    expect(modRow?.lessonGenerationStatus).toBe('not_generated');

    const [metrics] = await db
      .select({ n: usageMetrics.lessonModulesGenerated })
      .from(usageMetrics)
      .where(
        and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)),
      );
    expect(metrics?.n).toBe(0);
  });

  it('returns disabled when LESSON_GENERATION_ENABLED is false', async () => {
    vi.stubEnv('LESSON_GENERATION_ENABLED', '0');

    const authUserId = buildTestAuthUserId('mod-lesson-disabled');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const plan = await createTestPlan({ userId });
    const mod = await createTestModule({ planId: plan.id });
    await createTestTask({ moduleId: mod.id });

    const rlsDb = await createRlsDbForUser(authUserId);
    const result = await generateModuleLessons(
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

  it('quota_denied before provider; row not left generating', async () => {
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
    const result = await generateModuleLessons(
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

    expect(result).toEqual({
      kind: 'quota_denied',
      currentCount: 3,
      limit: 3,
    });

    const [modRow] = await db
      .select()
      .from(modules)
      .where(eq(modules.id, mod.id));
    expect(modRow?.lessonGenerationStatus).toBe('not_generated');
  });

  it('quota reservation error does not leave module generating', async () => {
    const authUserId = buildTestAuthUserId('mod-lesson-quota-error');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createTestPlan({ userId });
    const mod = await createTestModule({ planId: plan.id });
    await createTestTask({ moduleId: mod.id });

    const rlsDb = await createRlsDbForUser(authUserId);
    const provider = {
      generateModuleLessonBatch: vi.fn(async () => {
        throw new Error('provider should not run');
      }),
    };
    const result = await generateModuleLessons(
      {
        dbClient: rlsDb,
        userId,
        planId: plan.id,
        moduleId: mod.id,
        userTier: 'free',
      },
      {
        provider,
        runLessonQuotaReserved: vi.fn(async () => {
          throw new Error('quota store unavailable');
        }),
      },
    );

    expect(result.kind).toBe('failed');
    expect(provider.generateModuleLessonBatch).not.toHaveBeenCalled();

    const [modRow] = await db
      .select()
      .from(modules)
      .where(eq(modules.id, mod.id));
    expect(modRow?.lessonGenerationStatus).toBe('not_generated');
  });

  it('success increments lesson_modules_generated for current month', async () => {
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
    const result = await generateModuleLessons(
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

  it('cold-start success creates usage_metrics row with lesson_modules_generated = 1', async () => {
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
    const result = await generateModuleLessons(
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

  it('parser failure compensates lesson_modules_generated back to prior count', async () => {
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

    const result = await generateModuleLessons(
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
    expect(metrics?.n).toBe(2);
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
    const result = await generateModuleLessons({
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
    const result = await generateModuleLessons({
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
