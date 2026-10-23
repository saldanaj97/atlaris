import {
  loadPlanForPage,
  loadPlanFreeRouterNotice,
  loadPlanRegenerationState,
} from '@/app/(app)/plans/[id]/plan-page-data';
import { describe, expect, it, vi } from 'vitest';

const {
  requestBoundaryComponentMock,
  getPlanDetailForReadMock,
  isGroundedEnabledMock,
  getActiveRegenerationJobMock,
  getPlanFreeRouterFallbackMock,
} = vi.hoisted(() => ({
  requestBoundaryComponentMock: vi.fn(),
  getPlanDetailForReadMock: vi.fn(),
  isGroundedEnabledMock: vi.fn(),
  getActiveRegenerationJobMock: vi.fn(),
  getPlanFreeRouterFallbackMock: vi.fn(),
}));

vi.mock('@/lib/db/queries/plan-free-router-fallback', () => ({
  getPlanFreeRouterFallback: getPlanFreeRouterFallbackMock,
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

describe('loadPlanFreeRouterNotice', () => {
  function signedInAs(subscriptionTier: string, db = {}) {
    requestBoundaryComponentMock.mockImplementationOnce(async (resolver) =>
      resolver({ actor: { id: 'user-1', subscriptionTier }, db }),
    );
  }

  it.each(['starter', 'pro'])(
    'returns the fallback for a %s viewer whose plan used the free router',
    async (tier) => {
      const db = {};
      signedInAs(tier, db);
      getPlanFreeRouterFallbackMock.mockResolvedValueOnce({
        outline: true,
        lessonModuleCount: 2,
      });

      await expect(loadPlanFreeRouterNotice('plan-1')).resolves.toEqual({
        outline: true,
        lessonModuleCount: 2,
      });
      expect(getPlanFreeRouterFallbackMock).toHaveBeenCalledWith('plan-1', db);
    },
  );

  it('returns null for a paid viewer when nothing used the free router', async () => {
    signedInAs('pro');
    getPlanFreeRouterFallbackMock.mockResolvedValueOnce({
      outline: false,
      lessonModuleCount: 0,
    });

    await expect(loadPlanFreeRouterNotice('plan-1')).resolves.toBeNull();
  });

  it('returns null for a free viewer without querying', async () => {
    getPlanFreeRouterFallbackMock.mockClear();
    signedInAs('free');

    await expect(loadPlanFreeRouterNotice('plan-1')).resolves.toBeNull();
    expect(getPlanFreeRouterFallbackMock).not.toHaveBeenCalled();
  });

  it('returns null when the viewer is signed out', async () => {
    requestBoundaryComponentMock.mockResolvedValueOnce(null);

    await expect(loadPlanFreeRouterNotice('plan-1')).resolves.toBeNull();
  });
});
