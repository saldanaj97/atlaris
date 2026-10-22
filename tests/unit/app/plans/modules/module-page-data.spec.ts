import { loadModuleForPage } from '@/app/(app)/plans/[id]/modules/[moduleId]/module-page-data';
import { describe, expect, it, vi } from 'vitest';

const {
  requestBoundaryComponentMock,
  getModuleDetailForReadMock,
  isGroundedEnabledMock,
} = vi.hoisted(() => ({
  requestBoundaryComponentMock: vi.fn(),
  getModuleDetailForReadMock: vi.fn(),
  isGroundedEnabledMock: vi.fn(),
}));

vi.mock('@/lib/api/request-boundary', () => ({
  requestBoundary: {
    component: requestBoundaryComponentMock,
  },
}));

vi.mock('@/features/plans/read-projection/service', () => ({
  getModuleDetailForRead: getModuleDetailForReadMock,
}));

vi.mock('@/features/ai/grounded-generation-flag', () => ({
  isGroundedEnabled: isGroundedEnabledMock,
}));

vi.mock('@/lib/logging/logger', () => ({
  logger: { debug: vi.fn() },
}));

describe('loadModuleForPage lesson sources', () => {
  it.each([true, false])(
    'requests lesson sources only when grounded generation is on for the viewer tier (%s)',
    async (enabled) => {
      requestBoundaryComponentMock.mockImplementationOnce(async (resolver) =>
        resolver({ actor: { id: 'user-1', subscriptionTier: 'pro' }, db: {} }),
      );
      isGroundedEnabledMock.mockResolvedValueOnce(enabled);
      getModuleDetailForReadMock.mockResolvedValueOnce({ module: {} });

      await loadModuleForPage('plan-1', 'module-1');

      expect(isGroundedEnabledMock).toHaveBeenLastCalledWith('pro');
      expect(getModuleDetailForReadMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ includeLessonSources: enabled }),
      );
    },
  );
});
