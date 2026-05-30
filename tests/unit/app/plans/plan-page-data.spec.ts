import { loadPlanForPage } from '@/app/(app)/plans/[id]/plan-page-data';
import { describe, expect, it, vi } from 'vitest';

const { requestBoundaryComponentMock, getPlanDetailForReadMock } = vi.hoisted(
  () => ({
    requestBoundaryComponentMock: vi.fn(),
    getPlanDetailForReadMock: vi.fn(),
  }),
);

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
});
