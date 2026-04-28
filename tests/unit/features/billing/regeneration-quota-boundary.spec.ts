import { makeDbClient } from '@tests/fixtures/db-mocks';
import { createId } from '@tests/fixtures/ids';
import { describe, expect, it, vi } from 'vitest';
import type {
  MeteredReservationToken,
  ReserveMeteredResult,
} from '@/features/billing/metered-reservation';
import {
  type RegenerationQuotaBoundaryDeps,
  type RegenerationQuotaWorkResult,
  runRegenerationQuotaReserved,
} from '@/features/billing/regeneration-quota-boundary';

const fakeDb = makeDbClient();
const userId = createId('user');
const planId = createId('plan');
const jobId = createId('job');

const baseToken: MeteredReservationToken = {
  userId,
  month: '2026-04',
  meter: 'regeneration',
  limit: 5,
  newCount: 3,
};

function buildDeps(
  overrides: Partial<RegenerationQuotaBoundaryDeps> = {},
): RegenerationQuotaBoundaryDeps {
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

describe('runRegenerationQuotaReserved', () => {
  it('returns denial when reserve is not allowed and never invokes work or compensate', async () => {
    const work = vi.fn();
    const deps = buildDeps({
      reserve: vi.fn(
        async (): Promise<ReserveMeteredResult> => ({
          ok: false,
          currentCount: 5,
          limit: 5,
        }),
      ),
    });

    const result = await runRegenerationQuotaReserved(
      { userId, planId, dbClient: fakeDb, work },
      deps,
    );

    expect(result).toEqual({ ok: false, currentCount: 5, limit: 5 });
    expect(work).not.toHaveBeenCalled();
    expect(deps.compensate).not.toHaveBeenCalled();
    expect(deps.reportReconciliation).not.toHaveBeenCalled();
  });

  it('keeps reservation consumed when work returns disposition=consumed', async () => {
    const deps = buildDeps();
    const work = vi.fn(
      async (): Promise<RegenerationQuotaWorkResult<{ jobId: string }>> => ({
        disposition: 'consumed',
        value: { jobId },
      }),
    );

    const result = await runRegenerationQuotaReserved(
      { userId, planId, dbClient: fakeDb, work },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      consumed: true,
      value: { jobId },
    });
    expect(work).toHaveBeenCalledTimes(1);
    expect(deps.compensate).not.toHaveBeenCalled();
    expect(deps.reportReconciliation).not.toHaveBeenCalled();
  });

  it('compensates exactly once when work returns disposition=revert', async () => {
    const deps = buildDeps();
    const work = vi.fn(
      async (): Promise<RegenerationQuotaWorkResult<{ jobId: string }>> => ({
        disposition: 'revert',
        value: { jobId },
        reason: 'enqueue_deduplicated',
        jobId,
      }),
    );

    const result = await runRegenerationQuotaReserved(
      { userId, planId, dbClient: fakeDb, work },
      deps,
    );

    expect(work).toHaveBeenCalledTimes(1);
    expect(deps.compensate).toHaveBeenCalledTimes(1);
    expect(deps.compensate).toHaveBeenCalledWith(baseToken, fakeDb);
    expect(deps.reportReconciliation).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      consumed: false,
      value: { jobId },
      reconciliationRequired: false,
    });
  });

  it('compensates exactly once and rethrows the original error when work throws', async () => {
    const deps = buildDeps();
    const error = new Error('queue insert failed');
    const work = vi.fn(async () => {
      throw error;
    });

    await expect(
      runRegenerationQuotaReserved(
        { userId, planId, dbClient: fakeDb, work },
        deps,
      ),
    ).rejects.toBe(error);

    expect(work).toHaveBeenCalledTimes(1);
    expect(deps.compensate).toHaveBeenCalledTimes(1);
    expect(deps.compensate).toHaveBeenCalledWith(baseToken, fakeDb);
    expect(deps.reportReconciliation).not.toHaveBeenCalled();
  });

  it('emits reconciliation telemetry when compensation fails on revert path', async () => {
    const compensateError = new Error('decrement failed');
    const deps = buildDeps({
      compensate: vi.fn(async () => {
        throw compensateError;
      }),
    });
    const work = vi.fn(
      async (): Promise<RegenerationQuotaWorkResult<{ jobId: string }>> => ({
        disposition: 'revert',
        value: { jobId },
        reason: 'enqueue_deduplicated',
        jobId,
      }),
    );

    const result = await runRegenerationQuotaReserved(
      { userId, planId, dbClient: fakeDb, work },
      deps,
    );

    expect(work).toHaveBeenCalledTimes(1);
    expect(deps.reportReconciliation).toHaveBeenCalledTimes(1);
    expect(deps.reportReconciliation).toHaveBeenCalledWith(
      { planId, userId, jobId },
      compensateError,
    );
    expect(result).toEqual({
      ok: true,
      consumed: false,
      value: { jobId },
      reconciliationRequired: true,
    });
  });

  it('emits reconciliation telemetry when compensation fails after work throws and rethrows the original error', async () => {
    const workError = new Error('queue insert failed');
    const compensateError = new Error('decrement failed');
    const deps = buildDeps({
      compensate: vi.fn(async () => {
        throw compensateError;
      }),
    });
    const work = vi.fn(async () => {
      throw workError;
    });

    await expect(
      runRegenerationQuotaReserved(
        { userId, planId, dbClient: fakeDb, work },
        deps,
      ),
    ).rejects.toBe(workError);

    expect(work).toHaveBeenCalledTimes(1);
    expect(deps.reportReconciliation).toHaveBeenCalledTimes(1);
    expect(deps.reportReconciliation).toHaveBeenCalledWith(
      { planId, userId },
      compensateError,
    );
  });

  it('propagates the error and never calls work when reserve throws', async () => {
    const reserveError = new Error('reserve transaction failed');
    const work = vi.fn();
    const deps = buildDeps({
      reserve: vi.fn(async () => {
        throw reserveError;
      }),
    });

    await expect(
      runRegenerationQuotaReserved(
        { userId, planId, dbClient: fakeDb, work },
        deps,
      ),
    ).rejects.toBe(reserveError);

    expect(work).not.toHaveBeenCalled();
    expect(deps.compensate).not.toHaveBeenCalled();
    expect(deps.reportReconciliation).not.toHaveBeenCalled();
  });

  it('treats reportReconciliation as fire-and-forget so a throwing telemetry helper does not shadow the original work error', async () => {
    const workError = new Error('queue insert failed');
    const compensateError = new Error('decrement failed');
    const reportError = new Error('sentry transport down');
    const reportReconciliation = vi.fn(() => {
      throw reportError;
    });
    const deps = buildDeps({
      compensate: vi.fn(async () => {
        throw compensateError;
      }),
      reportReconciliation,
    });
    const work = vi.fn(async () => {
      throw workError;
    });

    await expect(
      runRegenerationQuotaReserved(
        { userId, planId, dbClient: fakeDb, work },
        deps,
      ),
    ).rejects.toBe(workError);

    expect(reportReconciliation).toHaveBeenCalledTimes(1);
  });

  it('treats reportReconciliation as fire-and-forget on the revert path and still reports reconciliationRequired', async () => {
    const compensateError = new Error('decrement failed');
    const reportError = new Error('sentry transport down');
    const reportReconciliation = vi.fn(() => {
      throw reportError;
    });
    const deps = buildDeps({
      compensate: vi.fn(async () => {
        throw compensateError;
      }),
      reportReconciliation,
    });
    const work = vi.fn(
      async (): Promise<RegenerationQuotaWorkResult<{ jobId: string }>> => ({
        disposition: 'revert',
        value: { jobId },
        reason: 'enqueue_deduplicated',
        jobId,
      }),
    );

    const result = await runRegenerationQuotaReserved(
      { userId, planId, dbClient: fakeDb, work },
      deps,
    );

    expect(reportReconciliation).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      consumed: false,
      value: { jobId },
      reconciliationRequired: true,
    });
  });
});
