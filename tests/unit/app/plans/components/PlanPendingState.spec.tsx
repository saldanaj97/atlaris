import { render, screen } from '@testing-library/react';
import { createTestPlanDetail } from '@tests/fixtures/plans';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanPendingState } from '@/app/(app)/plans/[id]/components/PlanPendingState';
import type { UsePlanGenerationSessionResult } from '@/features/plans/session/usePlanGenerationSession';

const {
  refreshMock,
  revalidateMock,
  retryGenerationMock,
  mockUsePlanStatus,
  mockUseRetryGeneration,
  mockUsePlanGenerationSession,
} = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  revalidateMock: vi.fn(),
  retryGenerationMock: vi.fn(),
  mockUsePlanStatus: vi.fn(),
  mockUseRetryGeneration: vi.fn(),
  mockUsePlanGenerationSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock('@/hooks/usePlanStatus', () => ({
  usePlanStatus: mockUsePlanStatus,
}));

vi.mock('@/hooks/useRetryGeneration', () => ({
  useRetryGeneration: mockUseRetryGeneration,
}));

vi.mock('@/features/plans/session/usePlanGenerationSession', () => ({
  usePlanGenerationSession: mockUsePlanGenerationSession,
}));

function createSessionMock(): UsePlanGenerationSessionResult {
  return {
    state: {
      status: 'idle',
      modules: [],
    },
    startSession: vi.fn(),
    cancel: vi.fn(),
  };
}

describe('PlanPendingState', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUsePlanGenerationSession.mockReturnValue(createSessionMock());
    mockUsePlanStatus.mockReturnValue({
      status: 'failed',
      attempts: 1,
      error: null,
      pollingError: null,
      isPolling: false,
      revalidate: revalidateMock,
    });
    mockUseRetryGeneration.mockReturnValue({
      status: 'idle',
      error: null,
      isDisabled: false,
      retryGeneration: retryGenerationMock,
    });
  });

  it('renders a fallback failed message when no error details are available', () => {
    render(
      <PlanPendingState plan={createTestPlanDetail({ status: 'failed' })} />,
    );

    expect(screen.getByText('Generation Failed')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Generation failed before it finished. You can try again.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /retry generation/i }),
    ).toBeInTheDocument();
  });

  it('keeps the interrupted fallback when a retry session is cancelled', () => {
    mockUseRetryGeneration.mockReturnValue({
      status: 'cancelled',
      error: null,
      isDisabled: false,
      retryGeneration: retryGenerationMock,
    });

    render(
      <PlanPendingState plan={createTestPlanDetail({ status: 'failed' })} />,
    );

    expect(screen.getByText('interrupted')).toBeInTheDocument();
    expect(screen.getByText('Generation interrupted')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Generation was interrupted before it finished. You can try again.',
      ),
    ).toBeInTheDocument();
  });
});
