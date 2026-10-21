import {
  loadPlanForPage,
  loadPlanRegenerationState,
} from '@/app/(app)/plans/[id]/plan-page-data';
import { describe, expect, it, vi } from 'vitest';

const {
  requestBoundaryComponentMock,
  getPlanDetailForReadMock,
  isGroundedEnabledMock,
  getActiveRegenerationJobMock,
} = vi.hoisted(() => ({
  requestBoundaryComponentMock: vi.fn(),
  getPlanDetailForReadMock: vi.fn(),
  isGroundedEnabledMock: vi.fn(),
  getActiveRegenerationJobMock: vi.fn(),
}));

vi.mock('@/features/ai/grounded-generation-flag', () => ({
  isGroundedEnabled: isGroundedEnabledMock,
}));

vi.mock('@/lib/db/queries/jobs', () => ({
  getActiveRegenerationJob: getActiveRegenerationJobMock,
}));

vi.mock('@/lib/api/request-boundary', () => ({
  requestBoundary: {
    component: requestBoundaryComponentMock,
  },
}));

vi.mock('@/features/plans/read-projection/service', () => ({
  getPlanDetailForRead: getPlanDetailForReadMock,
}));

vi.mock('@/lib/logging/logger', () => ({
  logger: { debug: vi.fn() },
}));

describe('loadPlanForPage', () => {
  it('returns UNAUTHORIZED when the component boundary is unauthenticated', async () => {
    requestBoundaryComponentMock.mockResolvedValueOnce(null);

    const result = await loadPlanForPage('plan-1');

    expect(result).toEqual({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'You must be signed in to view this plan.',
      },
    });
  });

  it('returns NOT_FOUND when the plan is missing or not owned by the user', async () => {
    requestBoundaryComponentMock.mockImplementationOnce(async (resolver) =>
      resolver({ actor: { id: 'user-1' }, db: {} }),
    );
    getPlanDetailForReadMock.mockResolvedValueOnce(null);

    const result = await loadPlanForPage('plan-other-user');

    expect(result).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND' },
    });
  });
});

describe('loadPlanRegenerationState', () => {
  const actor = { id: 'user-1', subscriptionTier: 'pro' };

  it('hides regeneration without querying jobs when grounded is off', async () => {
    requestBoundaryComponentMock.mockImplementationOnce(async (resolver) =>
      resolver({ actor, db: {} }),
    );
    isGroundedEnabledMock.mockResolvedValueOnce(false);

    await expect(loadPlanRegenerationState('plan-1')).resolves.toEqual({
      canRegenerate: false,
      isRegenerating: false,
    });
    expect(getActiveRegenerationJobMock).not.toHaveBeenCalled();
  });

  it('reports an active regeneration job when grounded is on', async () => {
    const db = {};
    requestBoundaryComponentMock.mockImplementationOnce(async (resolver) =>
      resolver({ actor, db }),
    );
    isGroundedEnabledMock.mockResolvedValueOnce(true);
    getActiveRegenerationJobMock.mockResolvedValueOnce({ id: 'job-1' });

    await expect(loadPlanRegenerationState('plan-1')).resolves.toEqual({
      canRegenerate: true,
      isRegenerating: true,
    });
    expect(isGroundedEnabledMock).toHaveBeenCalledWith('pro');
    expect(getActiveRegenerationJobMock).toHaveBeenCalledWith(
      'plan-1',
      'user-1',
      db,
    );
  });

  it('hides regeneration when the viewer is signed out', async () => {
    requestBoundaryComponentMock.mockResolvedValueOnce(null);

    await expect(loadPlanRegenerationState('plan-1')).resolves.toEqual({
      canRegenerate: false,
      isRegenerating: false,
    });
  });
});
