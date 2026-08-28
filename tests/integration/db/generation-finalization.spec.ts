import type { AttemptMetadata } from '@/lib/db/queries/types/attempts.types';

import { createPlan } from '../../fixtures/plans';
import { ensureUser } from '../../helpers/db/users';
import { cleanupTrackedRlsClients } from '../../helpers/rls';
import { getCurrentMonth } from '@/features/billing/usage-metrics';
import {
  commitPlanGenerationFailure,
  commitPlanGenerationSuccess,
} from '@/features/plans/lifecycle/generation-finalization/store';
import { reserveAttemptSlot } from '@/lib/db/queries/attempts';
import {
  aiUsageEvents,
  generationAttempts,
  learningPlans,
  modules,
  tasks,
  usageMetrics,
  users,
} from '@supabase/schema';
import { db } from '@supabase/service-role';
import { makeCanonicalUsage } from '@tests/fixtures/canonical-usage.factory';
import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const TEST_INPUT = {
  topic: 'Lifecycle finalization integration',
  skillLevel: 'beginner' as const,
  weeklyHours: 5,
  learningStyle: 'mixed' as const,
};

describe('plan generation finalization (single transaction)', () => {
  let authUserId = '';
  let userId = '';
  let planId = '';

  beforeEach(async () => {
    authUserId = `auth-${randomUUID()}`;
    userId = await ensureUser({
      authUserId,
      email: `${authUserId}@example.com`,
    });

    const plan = await createPlan(userId, {
      topic: 'Finalization Plan',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      generationStatus: 'failed',
      isQuotaEligible: false,
    });
    planId = plan.id;
  });

  afterEach(async () => {
    await cleanupTrackedRlsClients();
  });

  it('success path persists attempt, plan ready, modules, usage event, and increments plansGenerated', async () => {
    const reservation = await reserveAttemptSlot({
      planId,
      userId,
      input: TEST_INPUT,
      generationPurpose: 'initial',
      dbClient: db,
      now: () => new Date('2026-03-01T10:00:00.000Z'),
    });
    if (!reservation.reserved) {
      throw new Error(`Expected reservation, got ${reservation.reason}`);
    }

    const month = getCurrentMonth(new Date('2026-03-01T10:00:05.000Z'));
    const beforeMetrics = await db
      .select()
      .from(usageMetrics)
      .where(
        and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)),
      );

    const beforePlansGenerated = beforeMetrics[0]?.plansGenerated ?? 0;

    await commitPlanGenerationSuccess(db, {
      planId,
      userId,
      attemptId: reservation.attemptId,
      preparation: reservation,
      modules: [
        {
          title: 'Integrated Module',
          description: 'Desc',
          estimatedMinutes: 45,
          tasks: [
            {
              title: 'Task A',
              description: 'Ta',
              estimatedMinutes: 45,
            },
          ],
        },
      ],
      providerMetadata: { provider: 'mock', model: 'mock-model' },
      usage: makeCanonicalUsage({ provider: 'mock', model: 'mock-model' }),
      durationMs: 500,
      extendedTimeout: false,
      usageKind: 'plan',
      generationPurpose: 'initial',
      workflowMetadata: {
        provider: 'workflow-sdk',
        runId: 'run-plan-generation-1',
        startedAt: '2026-03-01T10:00:00.000Z',
        completedAt: '2026-03-01T10:00:00.500Z',
      },
      now: () => new Date('2026-03-01T10:00:05.000Z'),
    });

    const plan = await db.query.learningPlans.findFirst({
      where: eq(learningPlans.id, planId),
    });
    expect(plan?.generationStatus).toBe('ready');
    expect(plan?.isQuotaEligible).toBe(true);
    expect(plan?.finalizedAt).not.toBeNull();

    const attempt = await db.query.generationAttempts.findFirst({
      where: eq(generationAttempts.id, reservation.attemptId),
    });
    expect(attempt?.status).toBe('success');
    const attemptMetadata = attempt?.metadata as AttemptMetadata | undefined;
    expect(attemptMetadata?.workflow).toEqual({
      provider: 'workflow-sdk',
      runId: 'run-plan-generation-1',
      startedAt: '2026-03-01T10:00:00.000Z',
      completedAt: '2026-03-01T10:00:00.500Z',
    });

    const planModules = await db
      .select()
      .from(modules)
      .where(eq(modules.planId, planId))
      .orderBy(asc(modules.order));
    expect(planModules).toHaveLength(1);
    expect(planModules[0]?.title).toBe('Integrated Module');

    const planTasks = await db
      .select({ title: tasks.title })
      .from(tasks)
      .innerJoin(modules, eq(tasks.moduleId, modules.id))
      .where(eq(modules.planId, planId))
      .orderBy(asc(tasks.order));
    expect(planTasks.map((t) => t.title)).toEqual(['Task A']);

    const usageRows = await db
      .select()
      .from(aiUsageEvents)
      .where(eq(aiUsageEvents.userId, userId));
    expect(usageRows.length).toBe(1);
    expect(usageRows[0]?.provider).toBe('mock');

    const afterMetrics = await db
      .select()
      .from(usageMetrics)
      .where(
        and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)),
      );
    expect(afterMetrics[0]?.plansGenerated).toBe(beforePlansGenerated + 1);
    expect(attemptMetadata?.admitted_tier).toBe('free');

    const [entitlement] = await db
      .select({
        initialPlanGeneratedAt: users.initialPlanGeneratedAt,
        freeAccessPlanId: users.freeAccessPlanId,
        freeAccessPlanSelectedAt: users.freeAccessPlanSelectedAt,
      })
      .from(users)
      .where(eq(users.id, userId));
    expect(entitlement?.initialPlanGeneratedAt).toEqual(
      new Date('2026-03-01T10:00:05.000Z'),
    );
    expect(entitlement?.freeAccessPlanId).toBe(planId);
    expect(entitlement?.freeAccessPlanSelectedAt).toEqual(
      new Date('2026-03-01T10:00:05.000Z'),
    );
  });

  it('retryable failure updates attempt and plan failed without usage', async () => {
    const reservation = await reserveAttemptSlot({
      planId,
      userId,
      input: TEST_INPUT,
      generationPurpose: 'initial',
      dbClient: db,
      now: () => new Date('2026-03-02T08:00:00.000Z'),
    });
    if (!reservation.reserved) {
      throw new Error(`Expected reservation, got ${reservation.reason}`);
    }

    await commitPlanGenerationFailure(db, {
      variant: 'reserved_attempt',
      planId,
      userId,
      attemptId: reservation.attemptId,
      preparation: reservation,
      classification: 'timeout',
      error: new Error('timed out'),
      durationMs: 1000,
      timedOut: true,
      extendedTimeout: false,
      usageKind: 'plan',
      generationPurpose: 'initial',
      retryable: true,
      workflowMetadata: {
        provider: 'workflow-sdk',
        runId: 'run-plan-generation-failure-1',
        startedAt: '2026-03-02T08:00:00.000Z',
        completedAt: '2026-03-02T08:00:01.000Z',
      },
      now: () => new Date('2026-03-02T08:00:02.000Z'),
    });

    const plan = await db.query.learningPlans.findFirst({
      where: eq(learningPlans.id, planId),
    });
    expect(plan?.generationStatus).toBe('failed');
    expect(plan?.isQuotaEligible).toBe(false);

    const attempt = await db.query.generationAttempts.findFirst({
      where: eq(generationAttempts.id, reservation.attemptId),
    });
    expect(attempt?.status).toBe('failure');
    expect(attempt?.classification).toBe('timeout');
    const attemptMetadata = attempt?.metadata as AttemptMetadata | undefined;
    expect(attemptMetadata?.workflow).toEqual({
      provider: 'workflow-sdk',
      runId: 'run-plan-generation-failure-1',
      startedAt: '2026-03-02T08:00:00.000Z',
      completedAt: '2026-03-02T08:00:01.000Z',
    });

    const usageRows = await db
      .select()
      .from(aiUsageEvents)
      .where(eq(aiUsageEvents.userId, userId));
    expect(usageRows.length).toBe(0);

    const [entitlement] = await db
      .select({
        initialPlanGeneratedAt: users.initialPlanGeneratedAt,
        freeAccessPlanId: users.freeAccessPlanId,
        freeAccessPlanSelectedAt: users.freeAccessPlanSelectedAt,
      })
      .from(users)
      .where(eq(users.id, userId));
    expect(entitlement?.initialPlanGeneratedAt).toBeNull();
    expect(entitlement?.freeAccessPlanId).toBeNull();
    expect(entitlement?.freeAccessPlanSelectedAt).toBeNull();
  });

  it('permanent failure with usage records usage and increments plansGenerated', async () => {
    const reservation = await reserveAttemptSlot({
      planId,
      userId,
      input: TEST_INPUT,
      generationPurpose: 'initial',
      dbClient: db,
      now: () => new Date('2026-03-03T12:00:00.000Z'),
    });
    if (!reservation.reserved) {
      throw new Error(`Expected reservation, got ${reservation.reason}`);
    }

    const month = getCurrentMonth(new Date('2026-03-03T12:00:03.000Z'));
    const beforeMetrics = await db
      .select()
      .from(usageMetrics)
      .where(
        and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)),
      );
    const beforePlansGenerated = beforeMetrics[0]?.plansGenerated ?? 0;

    const usage = makeCanonicalUsage({ provider: 'mock', model: 'm2' });

    await commitPlanGenerationFailure(db, {
      variant: 'reserved_attempt',
      planId,
      userId,
      attemptId: reservation.attemptId,
      preparation: reservation,
      classification: 'validation',
      error: new Error('bad'),
      durationMs: 200,
      timedOut: false,
      extendedTimeout: false,
      providerMetadata: { provider: 'mock', model: 'm2' },
      usage,
      usageKind: 'plan',
      generationPurpose: 'initial',
      retryable: false,
      now: () => new Date('2026-03-03T12:00:03.000Z'),
    });

    const usageRows = await db
      .select()
      .from(aiUsageEvents)
      .where(eq(aiUsageEvents.userId, userId));
    expect(usageRows.length).toBe(1);

    const afterMetrics = await db
      .select()
      .from(usageMetrics)
      .where(
        and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)),
      );
    expect(afterMetrics[0]?.plansGenerated).toBe(beforePlansGenerated + 1);
  });

  it('permanent regeneration failure records usage without incrementing plansGenerated', async () => {
    await db
      .update(learningPlans)
      .set({ generationStatus: 'ready', isQuotaEligible: true })
      .where(eq(learningPlans.id, planId));

    const reservation = await reserveAttemptSlot({
      planId,
      userId,
      input: TEST_INPUT,
      generationPurpose: 'regeneration',
      dbClient: db,
      now: () => new Date('2026-03-03T13:00:00.000Z'),
    });
    if (!reservation.reserved) {
      throw new Error(`Expected reservation, got ${reservation.reason}`);
    }

    const month = getCurrentMonth(new Date('2026-03-03T13:00:03.000Z'));
    const beforeMetrics = await db
      .select()
      .from(usageMetrics)
      .where(
        and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)),
      );
    const beforePlansGenerated = beforeMetrics[0]?.plansGenerated ?? 0;

    await commitPlanGenerationFailure(db, {
      variant: 'reserved_attempt',
      planId,
      userId,
      attemptId: reservation.attemptId,
      preparation: reservation,
      classification: 'validation',
      error: new Error('bad regeneration'),
      durationMs: 200,
      timedOut: false,
      extendedTimeout: false,
      providerMetadata: { provider: 'mock', model: 'm2' },
      usage: makeCanonicalUsage({ provider: 'mock', model: 'm2' }),
      usageKind: 'plan',
      generationPurpose: 'regeneration',
      retryable: false,
      now: () => new Date('2026-03-03T13:00:03.000Z'),
    });

    const usageRows = await db
      .select()
      .from(aiUsageEvents)
      .where(eq(aiUsageEvents.userId, userId));
    expect(usageRows).toHaveLength(1);

    const afterMetrics = await db
      .select()
      .from(usageMetrics)
      .where(
        and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)),
      );
    expect(afterMetrics[0]?.plansGenerated ?? 0).toBe(beforePlansGenerated);
  });

  it('rolls back entire transaction when hook throws after attempt persist', async () => {
    const reservation = await reserveAttemptSlot({
      planId,
      userId,
      input: TEST_INPUT,
      generationPurpose: 'initial',
      dbClient: db,
      now: () => new Date('2026-03-04T09:00:00.000Z'),
    });
    if (!reservation.reserved) {
      throw new Error(`Expected reservation, got ${reservation.reason}`);
    }

    await expect(
      commitPlanGenerationSuccess(
        db,
        {
          planId,
          userId,
          attemptId: reservation.attemptId,
          preparation: reservation,
          modules: [
            {
              title: 'Rollback Mod',
              description: undefined,
              estimatedMinutes: 10,
              tasks: [],
            },
          ],
          providerMetadata: {},
          usage: makeCanonicalUsage(),
          durationMs: 100,
          extendedTimeout: false,
          usageKind: 'plan',
          generationPurpose: 'initial',
          now: () => new Date('2026-03-04T09:00:01.000Z'),
        },
        {
          afterSuccessfulAttemptPersist: () => {
            throw new Error('injected_after_persist');
          },
        },
      ),
    ).rejects.toThrow('injected_after_persist');

    const attempt = await db.query.generationAttempts.findFirst({
      where: eq(generationAttempts.id, reservation.attemptId),
    });
    expect(attempt?.status).toBe('in_progress');

    const plan = await db.query.learningPlans.findFirst({
      where: eq(learningPlans.id, planId),
    });
    expect(plan?.generationStatus).toBe('generating');

    const modCount = await db
      .select({ c: modules.id })
      .from(modules)
      .where(eq(modules.planId, planId));
    expect(modCount.length).toBe(0);

    const usageRows = await db
      .select()
      .from(aiUsageEvents)
      .where(eq(aiUsageEvents.userId, userId));
    expect(usageRows.length).toBe(0);
  });

  it('paid initial success sets the lifetime marker without Free selection', async () => {
    const paidAuthUserId = `auth-${randomUUID()}`;
    const paidUserId = await ensureUser({
      authUserId: paidAuthUserId,
      email: `${paidAuthUserId}@example.com`,
      subscriptionTier: 'starter',
    });
    const paidPlan = await createPlan(paidUserId, {
      topic: 'Paid Finalization Plan',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      generationStatus: 'failed',
      isQuotaEligible: false,
    });
    const reservation = await reserveAttemptSlot({
      planId: paidPlan.id,
      userId: paidUserId,
      input: TEST_INPUT,
      generationPurpose: 'initial',
      dbClient: db,
      now: () => new Date('2026-03-05T10:00:00.000Z'),
    });
    if (!reservation.reserved) {
      throw new Error(`Expected reservation, got ${reservation.reason}`);
    }

    await commitPlanGenerationSuccess(db, {
      planId: paidPlan.id,
      userId: paidUserId,
      attemptId: reservation.attemptId,
      preparation: reservation,
      modules: [
        {
          title: 'Paid Module',
          description: undefined,
          estimatedMinutes: 30,
          tasks: [],
        },
      ],
      providerMetadata: { provider: 'mock', model: 'mock-model' },
      usage: makeCanonicalUsage({ provider: 'mock', model: 'mock-model' }),
      durationMs: 200,
      extendedTimeout: false,
      usageKind: 'plan',
      generationPurpose: 'initial',
      now: () => new Date('2026-03-05T10:00:02.000Z'),
    });

    const [entitlement] = await db
      .select({
        initialPlanGeneratedAt: users.initialPlanGeneratedAt,
        freeAccessPlanId: users.freeAccessPlanId,
        freeAccessPlanSelectedAt: users.freeAccessPlanSelectedAt,
      })
      .from(users)
      .where(eq(users.id, paidUserId));
    expect(entitlement?.initialPlanGeneratedAt).toEqual(
      new Date('2026-03-05T10:00:02.000Z'),
    );
    expect(entitlement?.freeAccessPlanId).toBeNull();
    expect(entitlement?.freeAccessPlanSelectedAt).toBeNull();
  });

  it('regeneration success leaves lifetime fields unchanged', async () => {
    const marker = new Date('2026-01-15T00:00:00.000Z');
    await db
      .update(users)
      .set({
        initialPlanGeneratedAt: marker,
        subscriptionTier: 'starter',
      })
      .where(eq(users.id, userId));
    await db
      .update(learningPlans)
      .set({
        generationStatus: 'ready',
        isQuotaEligible: true,
      })
      .where(eq(learningPlans.id, planId));

    const reservation = await reserveAttemptSlot({
      planId,
      userId,
      input: TEST_INPUT,
      generationPurpose: 'regeneration',
      dbClient: db,
      now: () => new Date('2026-03-06T10:00:00.000Z'),
    });
    if (!reservation.reserved) {
      throw new Error(`Expected reservation, got ${reservation.reason}`);
    }

    await commitPlanGenerationSuccess(db, {
      planId,
      userId,
      attemptId: reservation.attemptId,
      preparation: reservation,
      modules: [
        {
          title: 'Regen Module',
          description: undefined,
          estimatedMinutes: 20,
          tasks: [],
        },
      ],
      providerMetadata: { provider: 'mock', model: 'mock-model' },
      usage: makeCanonicalUsage({ provider: 'mock', model: 'mock-model' }),
      durationMs: 150,
      extendedTimeout: false,
      usageKind: 'plan',
      generationPurpose: 'regeneration',
      now: () => new Date('2026-03-06T10:00:02.000Z'),
    });

    const [entitlement] = await db
      .select({
        initialPlanGeneratedAt: users.initialPlanGeneratedAt,
        freeAccessPlanId: users.freeAccessPlanId,
        freeAccessPlanSelectedAt: users.freeAccessPlanSelectedAt,
      })
      .from(users)
      .where(eq(users.id, userId));
    expect(entitlement?.initialPlanGeneratedAt).toEqual(marker);
    expect(entitlement?.freeAccessPlanId).toBeNull();
    expect(entitlement?.freeAccessPlanSelectedAt).toBeNull();
  });
});
