import { MockGenerationProvider } from '@/features/ai/providers/mock';
import { createPlanLifecycleService } from '@/features/plans/lifecycle/factory';
import { commitPlanGenerationFailure } from '@/features/plans/lifecycle/generation-finalization/store';
import {
  atomicCheckAndInsertPlan,
  markPlanGenerationSuccess,
} from '@/features/plans/lifecycle/plan-persistence-store';
import { reserveAttemptSlot } from '@/lib/db/queries/attempts';
import { countPlansContributingToCap } from '@/lib/db/queries/helpers/plan-generation-status';
import { TIER_LIMITS } from '@/shared/constants/tier-limits';
import { learningPlans, modules } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { seedFailedAttemptsForDurableWindow } from '@tests/fixtures/attempts';
import { createTestModule } from '@tests/fixtures/modules';
import { createPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db/users';
import { createDeferredPromise } from '@tests/helpers/deferred-promise';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const TEST_INPUT = {
  topic: 'Cap reservation topic',
  skillLevel: 'beginner' as const,
  weeklyHours: 5,
  learningStyle: 'mixed' as const,
};

const PLAN_CORE = {
  topic: 'Cap core topic',
  skillLevel: 'beginner' as const,
  weeklyHours: 5,
  learningStyle: 'mixed' as const,
  visibility: 'private' as const,
  origin: 'ai' as const,
};

async function fillEligibleReadyPlans(userId: string, count: number) {
  const plans = [];
  for (let i = 0; i < count; i += 1) {
    plans.push(
      await createPlan(userId, {
        topic: `Eligible ready ${i}`,
        generationStatus: 'ready',
        isQuotaEligible: true,
      }),
    );
  }
  return plans;
}

async function createFailedIneligiblePlan(userId: string, topic: string) {
  return createPlan(userId, {
    topic,
    generationStatus: 'failed',
    isQuotaEligible: false,
  });
}

describe('last-good plan vs active-plan cap', () => {
  beforeAll(() => {
    vi.stubEnv('AI_PROVIDER', 'mock');
    vi.stubEnv('MOCK_GENERATION_DELAY_MS', '25');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('rate-limited regeneration of a populated ready plan stays ready and eligible', async () => {
    const authUserId = buildTestAuthUserId('cap-last-good-rate-limit');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createPlan(userId, {
      topic: 'Populated ready plan',
      generationStatus: 'ready',
      isQuotaEligible: true,
    });
    const module = await createTestModule({
      planId: plan.id,
      title: 'Keep me',
    });
    await seedFailedAttemptsForDurableWindow(plan.id, {
      promptHashPrefix: 'cap-last-good-rate-limit',
    });

    const lifecycle = createPlanLifecycleService({ dbClient: db });
    const result = await lifecycle.processGenerationAttempt({
      planId: plan.id,
      userId,
      tier: 'free',
      input: {
        topic: plan.topic,
        skillLevel: plan.skillLevel,
        weeklyHours: plan.weeklyHours,
        learningStyle: plan.learningStyle,
      },
    });

    expect(result.status).toBe('retryable_failure');

    const [row] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, plan.id));
    expect(row?.generationStatus).toBe('ready');
    expect(row?.isQuotaEligible).toBe(true);

    const remainingModules = await db
      .select({ title: modules.title })
      .from(modules)
      .where(eq(modules.planId, plan.id));
    expect(remainingModules).toEqual([{ title: module.title }]);
  });

  it('initial never-usable plan may become failed and ineligible', async () => {
    const authUserId = buildTestAuthUserId('cap-initial-fail');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const inserted = await atomicCheckAndInsertPlan(
      userId,
      { ...PLAN_CORE, topic: 'Never usable' },
      db,
    );
    expect(inserted.status).toBe('created');
    if (inserted.status !== 'created') return;

    await commitPlanGenerationFailure(db, {
      variant: 'plan_only',
      planId: inserted.id,
      userId,
      classification: 'rate_limit',
      error: new Error('rate limited'),
      durationMs: 1,
      usageKind: 'plan',
      retryable: true,
    });

    const [row] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, inserted.id));
    expect(row?.generationStatus).toBe('failed');
    expect(row?.isQuotaEligible).toBe(false);
  });

  it('failed ineligible plan cannot retry when slots are full and provider is not invoked', async () => {
    const authUserId = buildTestAuthUserId('cap-retry-blocked');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    await fillEligibleReadyPlans(userId, TIER_LIMITS.free.maxActivePlans);
    const failed = await createFailedIneligiblePlan(userId, 'Hidden leftover');
    const generateSpy = vi.spyOn(MockGenerationProvider.prototype, 'generate');

    const lifecycle = createPlanLifecycleService({ dbClient: db });
    const result = await lifecycle.processGenerationAttempt({
      planId: failed.id,
      userId,
      tier: 'free',
      allowedGenerationStatuses: ['failed', 'pending_retry'],
      input: TEST_INPUT,
    });

    expect(result.status).toBe('permanent_failure');
    expect(generateSpy).not.toHaveBeenCalled();
    expect(await countPlansContributingToCap(db, userId)).toBe(
      TIER_LIMITS.free.maxActivePlans,
    );

    const [row] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, failed.id));
    expect(row?.generationStatus).toBe('failed');
    expect(row?.isQuotaEligible).toBe(false);
  });

  it('retry reserves a generating slot before provider work', async () => {
    const authUserId = buildTestAuthUserId('cap-retry-before-provider');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    await fillEligibleReadyPlans(userId, TIER_LIMITS.free.maxActivePlans - 1);
    const failed = await createFailedIneligiblePlan(userId, 'Retry me');
    const originalGenerate = MockGenerationProvider.prototype.generate;
    const sawReservation = createDeferredPromise<void>();
    const releaseProvider = createDeferredPromise<void>();
    const generateSpy = vi
      .spyOn(MockGenerationProvider.prototype, 'generate')
      .mockImplementation(
        async function generate(this: MockGenerationProvider, input, options) {
          const [row] = await db
            .select()
            .from(learningPlans)
            .where(eq(learningPlans.id, failed.id));
          expect(row?.generationStatus).toBe('generating');
          expect(row?.isQuotaEligible).toBe(false);
          expect(await countPlansContributingToCap(db, userId)).toBe(
            TIER_LIMITS.free.maxActivePlans,
          );
          sawReservation.resolve();
          await releaseProvider.promise;
          return originalGenerate.call(this, input, options);
        },
      );

    const lifecycle = createPlanLifecycleService({ dbClient: db });
    const run = lifecycle.processGenerationAttempt({
      planId: failed.id,
      userId,
      tier: 'free',
      allowedGenerationStatuses: ['failed', 'pending_retry'],
      input: TEST_INPUT,
    });

    await sawReservation.promise;
    expect(generateSpy).toHaveBeenCalledTimes(1);
    const [mid] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, failed.id));
    expect(mid?.generationStatus).toBe('generating');
    expect(mid?.isQuotaEligible).toBe(false);

    releaseProvider.resolve();
    const result = await run;

    expect(result.status).toBe('generation_success');
    expect(await countPlansContributingToCap(db, userId)).toBe(
      TIER_LIMITS.free.maxActivePlans,
    );

    const [row] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, failed.id));
    expect(row?.generationStatus).toBe('ready');
    expect(row?.isQuotaEligible).toBe(true);
  });

  it('concurrent failed-plan reactivations with one slot admit exactly one', async () => {
    const authUserId = buildTestAuthUserId('cap-retry-race');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    await fillEligibleReadyPlans(userId, TIER_LIMITS.free.maxActivePlans - 1);
    const failedA = await createFailedIneligiblePlan(userId, 'Race A');
    const failedB = await createFailedIneligiblePlan(userId, 'Race B');
    const generateSpy = vi.spyOn(MockGenerationProvider.prototype, 'generate');
    const lifecycle = createPlanLifecycleService({ dbClient: db });

    const results = await Promise.all([
      lifecycle.processGenerationAttempt({
        planId: failedA.id,
        userId,
        tier: 'free',
        allowedGenerationStatuses: ['failed', 'pending_retry'],
        input: TEST_INPUT,
      }),
      lifecycle.processGenerationAttempt({
        planId: failedB.id,
        userId,
        tier: 'free',
        allowedGenerationStatuses: ['failed', 'pending_retry'],
        input: TEST_INPUT,
      }),
    ]);

    expect(
      results.filter((result) => result.status === 'generation_success'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'permanent_failure'),
    ).toHaveLength(1);
    expect(generateSpy).toHaveBeenCalledTimes(1);
    expect(await countPlansContributingToCap(db, userId)).toBe(
      TIER_LIMITS.free.maxActivePlans,
    );
  });

  it('successful regeneration replaces content without hiding last-good from quota', async () => {
    const authUserId = buildTestAuthUserId('cap-regen-success');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const [target] = await fillEligibleReadyPlans(
      userId,
      TIER_LIMITS.free.maxActivePlans,
    );
    await createTestModule({ planId: target.id, title: 'Old module' });

    const lifecycle = createPlanLifecycleService({ dbClient: db });
    const result = await lifecycle.processGenerationAttempt({
      planId: target.id,
      userId,
      tier: 'free',
      input: {
        topic: target.topic,
        skillLevel: target.skillLevel,
        weeklyHours: target.weeklyHours,
        learningStyle: target.learningStyle,
      },
    });

    expect(result.status).toBe('generation_success');
    expect(await countPlansContributingToCap(db, userId)).toBe(
      TIER_LIMITS.free.maxActivePlans,
    );

    const [row] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, target.id));
    expect(row?.generationStatus).toBe('ready');
    expect(row?.isQuotaEligible).toBe(true);

    const titles = await db
      .select({ title: modules.title })
      .from(modules)
      .where(eq(modules.planId, target.id));
    expect(titles.some((module) => module.title === 'Old module')).toBe(false);
    expect(titles.length).toBeGreaterThan(0);
  });

  it('failure after reservation follows last-good policy and cannot enable a cap bypass', async () => {
    const authUserId = buildTestAuthUserId('cap-fail-policy');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const [eligible] = await fillEligibleReadyPlans(userId, 2);
    await createTestModule({ planId: eligible.id, title: 'Keep last-good' });
    const failed = await createFailedIneligiblePlan(userId, 'Retry then fail');

    const eligibleReservation = await reserveAttemptSlot({
      planId: eligible.id,
      userId,
      input: TEST_INPUT,
      dbClient: db,
    });
    if (!eligibleReservation.reserved) {
      throw new Error(
        `Expected eligible reservation, got ${eligibleReservation.reason}`,
      );
    }

    await commitPlanGenerationFailure(db, {
      variant: 'reserved_attempt',
      planId: eligible.id,
      userId,
      attemptId: eligibleReservation.attemptId,
      preparation: eligibleReservation,
      classification: 'timeout',
      error: new Error('timeout'),
      durationMs: 10,
      timedOut: true,
      extendedTimeout: false,
      usageKind: 'plan',
      retryable: true,
    });

    const [eligibleRow] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, eligible.id));
    expect(eligibleRow?.generationStatus).toBe('ready');
    expect(eligibleRow?.isQuotaEligible).toBe(true);
    const kept = await db
      .select({ title: modules.title })
      .from(modules)
      .where(eq(modules.planId, eligible.id));
    expect(kept).toEqual([{ title: 'Keep last-good' }]);

    const ineligibleReservation = await reserveAttemptSlot({
      planId: failed.id,
      userId,
      input: TEST_INPUT,
      dbClient: db,
    });
    if (!ineligibleReservation.reserved) {
      throw new Error(
        `Expected ineligible reservation, got ${ineligibleReservation.reason}`,
      );
    }
    expect(await countPlansContributingToCap(db, userId)).toBe(3);

    await commitPlanGenerationFailure(db, {
      variant: 'reserved_attempt',
      planId: failed.id,
      userId,
      attemptId: ineligibleReservation.attemptId,
      preparation: ineligibleReservation,
      classification: 'timeout',
      error: new Error('timeout'),
      durationMs: 10,
      timedOut: true,
      extendedTimeout: false,
      usageKind: 'plan',
      retryable: true,
    });

    const [failedRow] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, failed.id));
    expect(failedRow?.generationStatus).toBe('failed');
    expect(failedRow?.isQuotaEligible).toBe(false);
    expect(await countPlansContributingToCap(db, userId)).toBe(2);

    await markPlanGenerationSuccess(failed.id, db);

    const [stillFailed] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, failed.id));
    expect(stillFailed?.generationStatus).toBe('failed');
    expect(stillFailed?.isQuotaEligible).toBe(false);
    expect(await countPlansContributingToCap(db, userId)).toBe(2);
  });

  it('keeps over-cap eligible plans and still blocks new inserts', async () => {
    const authUserId = buildTestAuthUserId('cap-over-cap-keep');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    await fillEligibleReadyPlans(userId, TIER_LIMITS.free.maxActivePlans + 2);

    const rejected = await atomicCheckAndInsertPlan(
      userId,
      { ...PLAN_CORE, topic: 'Over cap insert' },
      db,
    );
    expect(rejected.status).toBe('limit_reached');
    expect(await countPlansContributingToCap(db, userId)).toBe(
      TIER_LIMITS.free.maxActivePlans + 2,
    );
  });
});
