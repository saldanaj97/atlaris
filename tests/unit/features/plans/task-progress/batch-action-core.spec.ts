import type { OwnedPlanRecord } from '@/lib/db/queries/helpers/plans-helpers';

import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  selectOwnedPlanByIdMock,
  ensureFreeAccessSelectionMock,
  applyTaskProgressUpdatesMock,
} = vi.hoisted(() => ({
  selectOwnedPlanByIdMock: vi.fn(),
  ensureFreeAccessSelectionMock: vi.fn(),
  applyTaskProgressUpdatesMock: vi.fn(),
}));

vi.mock('@/lib/db/queries/helpers/plans-helpers', () => ({
  selectOwnedPlanById: selectOwnedPlanByIdMock,
}));

vi.mock('@/features/plans/entitlement/store', () => ({
  ensureFreeAccessSelection: ensureFreeAccessSelectionMock,
}));

vi.mock('@/features/plans/task-progress/boundary', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/plans/task-progress/boundary')
  >('@/features/plans/task-progress/boundary');
  return {
    ...actual,
    applyTaskProgressUpdates: applyTaskProgressUpdatesMock,
  };
});

import { batchUpdateTaskProgressCore } from '@/features/plans/task-progress/batch-action-core';
import { AppError, NotFoundError } from '@/lib/api/errors';
import {
  API_ERROR_CODES,
  API_ERROR_HTTP_STATUS,
} from '@/shared/constants/api-error-codes';
import { makeDbClient } from '@tests/fixtures/db-mocks';

const selectedAt = new Date('2026-04-01T00:00:00.000Z');
const selectedPlanId = '11111111-1111-4111-8111-111111111111';
const otherPlanId = '22222222-2222-4222-8222-222222222222';
const userId = 'user-free';

function freeLifetimeSelection() {
  return {
    snapshot: {
      subscriptionTier: 'free' as const,
      initialPlanGeneratedAt: selectedAt,
      freeAccessPlanId: selectedPlanId,
      freeAccessPlanSelectedAt: selectedAt,
    },
    decision: 'not_applicable' as const,
    candidates: [],
  };
}

function coreInput(planId: string) {
  return {
    planId,
    updates: [{ taskId: 'task-1', status: 'completed' as const }],
    userId,
    dbClient: makeDbClient(),
    logContext: { planId },
    logMessage: 'Failed to batch update task progress',
  };
}

describe('batchUpdateTaskProgressCore access', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 for a non-owned plan id when a Free user has a lifetime selection', async () => {
    selectOwnedPlanByIdMock.mockResolvedValue(null);
    ensureFreeAccessSelectionMock.mockResolvedValue(freeLifetimeSelection());

    const error = await batchUpdateTaskProgressCore(
      coreInput(otherPlanId),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NotFoundError);
    if (!(error instanceof AppError)) {
      throw error;
    }
    expect(error.status()).toBe(404);
    expect(error.code()).toBe('NOT_FOUND');
    expect(ensureFreeAccessSelectionMock).not.toHaveBeenCalled();
    expect(applyTaskProgressUpdatesMock).not.toHaveBeenCalled();
  });

  it('returns 403 PLAN_ENTITLEMENT_REQUIRED for an owned locked Free plan', async () => {
    selectOwnedPlanByIdMock.mockResolvedValue({
      id: otherPlanId,
      userId,
    } as OwnedPlanRecord);
    ensureFreeAccessSelectionMock.mockResolvedValue(freeLifetimeSelection());

    const error = await batchUpdateTaskProgressCore(
      coreInput(otherPlanId),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    if (!(error instanceof AppError)) {
      throw error;
    }
    expect(error.status()).toBe(
      API_ERROR_HTTP_STATUS.PLAN_ENTITLEMENT_REQUIRED,
    );
    expect(error.code()).toBe(API_ERROR_CODES.PLAN_ENTITLEMENT_REQUIRED);
    expect(applyTaskProgressUpdatesMock).not.toHaveBeenCalled();
  });
});
