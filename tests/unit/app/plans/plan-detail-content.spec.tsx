import { PlanDetailContent } from '@/app/(app)/plans/[id]/components/PlanDetailContent';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const NOT_FOUND_SENTINEL = 'NEXT_HTTP_ERROR_FALLBACK;404';

const { loadPlanForPageMock, notFoundMock, redirectMock } = vi.hoisted(() => ({
  loadPlanForPageMock: vi.fn(),
  notFoundMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock('@/app/(app)/plans/[id]/plan-page-data', () => ({
  loadPlanForPage: loadPlanForPageMock,
}));

vi.mock('@/lib/logging/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

function accessError(code: string, message: string) {
  return { success: false, error: { code, message } };
}

describe('PlanDetailContent access results', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    notFoundMock.mockImplementation(() => {
      throw new Error(NOT_FOUND_SENTINEL);
    });
  });

  it('calls notFound() for a missing or not-owned plan instead of rendering an error panel', async () => {
    loadPlanForPageMock.mockResolvedValueOnce(
      accessError('NOT_FOUND', 'This plan does not exist.'),
    );

    await expect(PlanDetailContent({ planId: 'plan-1' })).rejects.toThrow(
      NOT_FOUND_SENTINEL,
    );

    expect(notFoundMock).toHaveBeenCalledOnce();
  });

  it('keeps internal failures as an error state', async () => {
    loadPlanForPageMock.mockResolvedValueOnce(
      accessError('INTERNAL_ERROR', 'boom'),
    );

    render(await PlanDetailContent({ planId: 'plan-1' }));

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Error loading plan');
  });

  it('keeps forbidden access as an error state', async () => {
    loadPlanForPageMock.mockResolvedValueOnce(accessError('FORBIDDEN', 'nope'));

    render(await PlanDetailContent({ planId: 'plan-1' }));

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(
      screen.getByText('You do not have permission to view this plan.'),
    ).toBeVisible();
  });
});
