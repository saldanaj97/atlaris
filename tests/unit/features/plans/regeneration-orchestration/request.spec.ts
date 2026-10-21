import type { RegenerationRequestDeps } from '@/features/plans/regeneration-orchestration/deps';
import type { RegenerationOwnedPlan } from '@/features/plans/regeneration-orchestration/types';

import { requestPlanRegeneration } from '@/features/plans/regeneration-orchestration/request';
import { RateLimitError } from '@/lib/api/errors';
import { makeDbClient } from '@tests/fixtures/db-mocks';
import {
  makeRegenerationOrchestrationDeps,
  type RegenerationOrchestrationDepsOverrides,
} from '@tests/helpers/regeneration-orchestration-deps';
import { describe, expect, it, vi } from 'vitest';

const fakeDb = makeDbClient();

const ownedPlan: RegenerationOwnedPlan = {
  id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  userId: 'user-1',
  topic: 'rust',
  skillLevel: 'beginner',
  weeklyHours: 5,
  learningStyle: 'mixed',
  startDate: null,
  deadlineDate: null,
};

function buildDeps(
  overrides: RegenerationOrchestrationDepsOverrides = {},
): RegenerationRequestDeps {
  return {
    ...makeRegenerationOrchestrationDeps({
      ...overrides,
      dbClient: overrides.dbClient ?? fakeDb,
      queue: { ...overrides.queue },
      quota: { ...overrides.quota },
      plans: {
        getActiveRegenerationJob: vi.fn(async () => null),
        findOwnedPlan: vi.fn(async () => ownedPlan),
        ...overrides.plans,
      },
    }),
    dispatch: vi.fn(async () => undefined),
  };
}

describe('requestPlanRegeneration', () => {
  it('returns queue-disabled when queue is off', async () => {
    const deps = buildDeps({
      queue: { enabled: () => false },
    });
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
      },
      deps,
    );
    expect(result).toEqual({ kind: 'queue-disabled' });
    expect(deps.plans.findOwnedPlan).not.toHaveBeenCalled();
  });

  it('returns active-job-conflict without enqueue or quota', async () => {
    const base = buildDeps();
    const deps = buildDeps({
      plans: {
        ...base.plans,
        getActiveRegenerationJob: vi.fn(async () => ({ id: 'existing' })),
      },
    });
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
      },
      deps,
    );
    expect(result).toEqual({
      kind: 'active-job-conflict',
      existingJobId: 'existing',
    });
    expect(deps.quota.peekUsage).not.toHaveBeenCalled();
    expect(deps.queue.enqueueWithResult).not.toHaveBeenCalled();
  });

  it('maps queue dedupe to queue-dedupe-conflict without settling quota', async () => {
    const deps = buildDeps({
      queue: {
        enqueueWithResult: vi.fn(async () => ({
          id: 'dup-job',
          deduplicated: true,
        })),
      },
    });

    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
      },
      deps,
    );

    expect(result).toEqual({
      kind: 'queue-dedupe-conflict',
      existingJobId: 'dup-job',
    });
  });

  it('does not settle quota when enqueue throws', async () => {
    const enqueueError = new Error('enqueue failed');
    const deps = buildDeps({
      queue: {
        enqueueWithResult: vi.fn().mockRejectedValue(enqueueError),
      },
    });

    await expect(
      requestPlanRegeneration(
        {
          userId: 'user-1',
          planId: ownedPlan.id,
        },
        deps,
      ),
    ).rejects.toBe(enqueueError);
  });

  it('returns quota-denied from a non-settling usage peek', async () => {
    const deps = buildDeps({
      quota: {
        peekUsage: vi.fn(async () => ({
          tier: 'starter' as const,
          activePlans: { current: 1, limit: 10 },
          regenerations: { used: 5, limit: 5 },
        })),
      },
    });
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
      },
      deps,
    );
    expect(result).toEqual({
      kind: 'quota-denied',
      currentCount: 5,
      limit: 5,
      reason: 'Regeneration quota exceeded for your subscription tier.',
    });
    expect(deps.queue.enqueueWithResult).not.toHaveBeenCalled();
  });

  it('returns not-included for Free before duration or quota', async () => {
    const deps = buildDeps({
      tier: { resolveUserTier: vi.fn(async () => 'free' as const) },
      quota: {
        peekUsage: vi.fn(async () => ({
          tier: 'free' as const,
          activePlans: { current: 1, limit: 1 },
          regenerations: { used: 0, limit: 0 },
        })),
      },
    });
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
        overrides: { deadlineDate: '2026-12-01' },
      },
      deps,
    );
    expect(result).toEqual({ kind: 'not-included' });
    expect(deps.quota.peekUsage).not.toHaveBeenCalled();
    expect(deps.queue.enqueueWithResult).not.toHaveBeenCalled();
  });

  it('returns duration-exceeded for Starter merged dates over 8 weeks', async () => {
    const longPlan: RegenerationOwnedPlan = {
      ...ownedPlan,
      startDate: '2026-01-01',
      deadlineDate: '2026-04-01',
    };
    const base = buildDeps();
    const deps = buildDeps({
      tier: { resolveUserTier: vi.fn(async () => 'starter' as const) },
      plans: {
        ...base.plans,
        findOwnedPlan: vi.fn(async () => longPlan),
      },
    });
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
      },
      deps,
    );
    expect(result.kind).toBe('duration-exceeded');
    expect(deps.queue.enqueueWithResult).not.toHaveBeenCalled();
  });

  it('enqueues a Starter long plan when date overrides bring duration within cap', async () => {
    const longPlan: RegenerationOwnedPlan = {
      ...ownedPlan,
      startDate: '2026-01-01',
      deadlineDate: '2026-04-01',
    };
    const base = buildDeps();
    const deps = buildDeps({
      tier: { resolveUserTier: vi.fn(async () => 'starter' as const) },
      plans: {
        ...base.plans,
        findOwnedPlan: vi.fn(async () => longPlan),
      },
    });
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
        overrides: { deadlineDate: '2026-02-12' },
      },
      deps,
    );
    expect(result.kind).not.toBe('duration-exceeded');
    expect(result.kind).not.toBe('not-included');
    expect(deps.queue.enqueueWithResult).toHaveBeenCalledWith(
      'plan_regeneration',
      ownedPlan.id,
      'user-1',
      {
        planId: ownedPlan.id,
        overrides: { deadlineDate: '2026-02-12' },
      },
      7,
    );
  });

  it('returns content-locked when the owned plan is not fully accessible', async () => {
    const base = buildDeps();
    const deps = buildDeps({
      plans: {
        ...base.plans,
        readContentAccess: vi.fn(async () => 'locked' as const),
      },
    });
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
      },
      deps,
    );
    expect(result).toEqual({ kind: 'content-locked' });
    expect(deps.queue.enqueueWithResult).not.toHaveBeenCalled();
  });

  it('returns plan-not-found when findOwnedPlan returns null', async () => {
    const base = buildDeps();
    const deps = buildDeps({
      plans: {
        ...base.plans,
        findOwnedPlan: vi.fn(async () => null),
      },
    });
    const result = await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
      },
      deps,
    );
    expect(result).toEqual({ kind: 'plan-not-found' });
  });

  it('propagates RateLimitError from rate limit check', async () => {
    const deps = buildDeps({
      rateLimit: {
        check: vi.fn().mockRejectedValue(
          new RateLimitError('blocked', {
            retryAfter: 60,
            remaining: 0,
            limit: 3,
            reset: 1,
          }),
        ),
      },
    });
    await expect(
      requestPlanRegeneration(
        {
          userId: 'user-1',
          planId: ownedPlan.id,
        },
        deps,
      ),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof RateLimitError && err.status() === 429,
    );
  });

  it('persists an optional model override on the queued job payload', async () => {
    const deps = buildDeps();

    await requestPlanRegeneration(
      {
        userId: 'user-1',
        planId: ownedPlan.id,
        overrides: { model: 'google/gemini-3.1-pro-preview' },
      },
      deps,
    );

    expect(deps.queue.enqueueWithResult).toHaveBeenCalledWith(
      'plan_regeneration',
      ownedPlan.id,
      'user-1',
      {
        planId: ownedPlan.id,
        overrides: { model: 'google/gemini-3.1-pro-preview' },
      },
      7,
    );
  });

  describe('grounded regeneration (JCS-162)', () => {
    const feedback = {
      reasons: ['too_basic' as const],
      note: 'More practice please',
    };

    it('drops reasons and note and keeps Free not-included when the flag is off', async () => {
      const deps = buildDeps();

      await requestPlanRegeneration(
        { userId: 'user-1', planId: ownedPlan.id, ...feedback },
        deps,
      );
      expect(deps.queue.enqueueWithResult).toHaveBeenCalledWith(
        'plan_regeneration',
        ownedPlan.id,
        'user-1',
        { planId: ownedPlan.id, overrides: undefined },
        7,
      );

      const free = buildDeps({
        tier: { resolveUserTier: vi.fn(async () => 'free' as const) },
      });
      await expect(
        requestPlanRegeneration(
          { userId: 'user-1', planId: ownedPlan.id, ...feedback },
          free,
        ),
      ).resolves.toEqual({ kind: 'not-included' });
      expect(free.quota.countPlanRegenerations).not.toHaveBeenCalled();
    });

    it('stores reasons and note on the payload when the flag is on', async () => {
      const deps = buildDeps({
        grounded: { isEnabled: vi.fn(async () => true) },
      });

      await requestPlanRegeneration(
        { userId: 'user-1', planId: ownedPlan.id, ...feedback },
        deps,
      );

      expect(deps.queue.enqueueWithResult).toHaveBeenCalledWith(
        'plan_regeneration',
        ownedPlan.id,
        'user-1',
        { planId: ownedPlan.id, overrides: undefined, ...feedback },
        7,
      );
      expect(deps.quota.peekUsage).toHaveBeenCalled();
      expect(deps.quota.countPlanRegenerations).not.toHaveBeenCalled();
    });

    it('leaves out empty reasons and note', async () => {
      const deps = buildDeps({
        grounded: { isEnabled: vi.fn(async () => true) },
      });

      await requestPlanRegeneration(
        { userId: 'user-1', planId: ownedPlan.id, reasons: [], note: '' },
        deps,
      );

      expect(deps.queue.enqueueWithResult).toHaveBeenCalledWith(
        'plan_regeneration',
        ownedPlan.id,
        'user-1',
        { planId: ownedPlan.id, overrides: undefined },
        7,
      );
    });

    it('admits Free once per plan without the monthly meter', async () => {
      const grounded = { isEnabled: vi.fn(async () => true) };
      const freeTier = {
        resolveUserTier: vi.fn(async () => 'free' as const),
      };
      const first = buildDeps({ grounded, tier: freeTier });

      await expect(
        requestPlanRegeneration(
          { userId: 'user-1', planId: ownedPlan.id, ...feedback },
          first,
        ),
      ).resolves.toMatchObject({ kind: 'enqueued' });
      expect(first.quota.countPlanRegenerations).toHaveBeenCalledWith(
        ownedPlan.id,
        fakeDb,
      );
      expect(first.quota.peekUsage).not.toHaveBeenCalled();

      const second = buildDeps({
        grounded,
        tier: freeTier,
        quota: { countPlanRegenerations: vi.fn(async () => 1) },
      });
      await expect(
        requestPlanRegeneration(
          { userId: 'user-1', planId: ownedPlan.id },
          second,
        ),
      ).resolves.toEqual({
        kind: 'quota-denied',
        currentCount: 1,
        limit: 1,
        reason: 'Regeneration quota exceeded for your subscription tier.',
      });
      expect(second.queue.enqueueWithResult).not.toHaveBeenCalled();
    });
  });

  describe('jobs Worker dispatch', () => {
    it('hands the inserted job to the jobs Worker', async () => {
      const deps = buildDeps();

      const result = await requestPlanRegeneration(
        { userId: 'user-1', planId: ownedPlan.id },
        deps,
      );

      expect(result).toMatchObject({
        kind: 'enqueued',
        jobId: 'job-1',
        status: 'pending',
      });
      expect(deps.dispatch).toHaveBeenCalledWith({
        jobId: 'job-1',
        planId: ownedPlan.id,
        userId: 'user-1',
      });
      expect(deps.queue.failJob).not.toHaveBeenCalled();
    });

    it('does not dispatch a deduplicated job', async () => {
      const deps = buildDeps({
        queue: {
          enqueueWithResult: vi.fn(async () => ({
            id: 'dup-job',
            deduplicated: true,
          })),
        },
      });

      await expect(
        requestPlanRegeneration(
          { userId: 'user-1', planId: ownedPlan.id },
          deps,
        ),
      ).resolves.toEqual({
        kind: 'queue-dedupe-conflict',
        existingJobId: 'dup-job',
      });
      expect(deps.dispatch).not.toHaveBeenCalled();
    });
  });
});
