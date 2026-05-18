import { makeDbClient } from '@tests/fixtures/db-mocks';
import { createId } from '@tests/fixtures/ids';
import { describe, expect, it, vi } from 'vitest';
import type {
  MeteredReservationToken,
  ReserveMeteredResult,
} from '@/features/billing/metered-reservation';
import {
  type LessonGenerationQuotaBoundaryDeps,
  type LessonGenerationQuotaWorkResult,
  runLessonGenerationQuotaReserved,
} from '@/features/billing/lesson-generation-quota-boundary';

const fakeDb = makeDbClient();
const userId = createId('user');
const planId = createId('plan');
const moduleId = createId('module');

const baseToken: MeteredReservationToken = {
  userId,
  month: '2026-04',
  meter: 'lessonGeneration',
  limit: 3,
  newCount: 2,
};

function buildDeps(
  overrides: Partial<LessonGenerationQuotaBoundaryDeps> = {},
): LessonGenerationQuotaBoundaryDeps {
  return {
    reserve: vi.fn(
      async (): Promise<ReserveMeteredResult> => ({
        ok: true,
        token: baseToken,
      }),
    ),
    compensate: vi.fn(async () => undefined),
    reportReconciliation: vi.fn(),
    ...overrides,
  };
}

describe('runLessonGenerationQuotaReserved', () => {
  it('returns denial when reserve is not allowed and never invokes work or compensate', async () => {
    const work = vi.fn();
    const deps = buildDeps({
      reserve: vi.fn(
        async (): Promise<ReserveMeteredResult> => ({
          ok: false,
          currentCount: 3,
          limit: 3,
        }),
      ),
    });

    const result = await runLessonGenerationQuotaReserved(
      { userId, planId, moduleId, dbClient: fakeDb, work },
      deps,
    );

    expect(result).toEqual({ ok: false, currentCount: 3, limit: 3 });
    expect(work).not.toHaveBeenCalled();
    expect(deps.compensate).not.toHaveBeenCalled();
    expect(deps.reportReconciliation).not.toHaveBeenCalled();
  });

  it('keeps reservation consumed when work returns disposition=consumed', async () => {
    const deps = buildDeps();
    const durationMs = 42;
    const work = vi.fn(
      async (): Promise<
        LessonGenerationQuotaWorkResult<{ durationMs: number }>
      > => ({
        disposition: 'consumed',
        value: { durationMs },
      }),
    );

    const result = await runLessonGenerationQuotaReserved(
      { userId, planId, moduleId, dbClient: fakeDb, work },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      consumed: true,
      value: { durationMs },
    });
    expect(work).toHaveBeenCalledTimes(1);
    expect(deps.compensate).not.toHaveBeenCalled();
    expect(deps.reportReconciliation).not.toHaveBeenCalled();
  });

  it('compensates when work returns disposition=revert', async () => {
    const deps = buildDeps();
    const work = vi.fn(
      async (): Promise<
        LessonGenerationQuotaWorkResult<
          { durationMs: number },
          { kind: 'failed'; message: string }
        >
      > => ({
        disposition: 'revert',
        value: { kind: 'failed', message: 'x' },
        reason: 'provider',
      }),
    );

    const result = await runLessonGenerationQuotaReserved(
      { userId, planId, moduleId, dbClient: fakeDb, work },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      consumed: false,
      value: { kind: 'failed', message: 'x' },
      reconciliationRequired: false,
    });
    expect(deps.compensate).toHaveBeenCalledWith(baseToken, fakeDb);
    expect(deps.reportReconciliation).not.toHaveBeenCalled();
  });

  it('compensates and rethrows when work throws', async () => {
    const deps = buildDeps();
    const boom = new Error('work failed');
    const work = vi.fn(async () => {
      throw boom;
    });

    await expect(
      runLessonGenerationQuotaReserved(
        { userId, planId, moduleId, dbClient: fakeDb, work },
        deps,
      ),
    ).rejects.toThrow(boom);

    expect(deps.compensate).toHaveBeenCalledWith(baseToken, fakeDb);
  });

  it('sets reconciliationRequired when compensate throws', async () => {
    const deps = buildDeps({
      compensate: vi.fn(async () => {
        throw new Error('compensate failed');
      }),
    });
    const work = vi.fn(
      async (): Promise<
        LessonGenerationQuotaWorkResult<
          { durationMs: number },
          { kind: 'failed'; message: string }
        >
      > => ({
        disposition: 'revert',
        value: { kind: 'failed', message: 'm' },
      }),
    );

    const result = await runLessonGenerationQuotaReserved(
      { userId, planId, moduleId, dbClient: fakeDb, work },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      consumed: false,
      value: { kind: 'failed', message: 'm' },
      reconciliationRequired: true,
    });
    expect(deps.reportReconciliation).toHaveBeenCalled();
  });
});
