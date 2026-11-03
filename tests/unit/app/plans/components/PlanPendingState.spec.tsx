import type { UsePlanGenerationSessionResult } from '@/features/plans/session/usePlanGenerationSession';

import { PlanPendingState } from '@/app/(app)/plans/[id]/components/PlanPendingState';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTestPlanDetail } from '@tests/fixtures/plans';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  refreshMock,
  revalidateMock,
  restartMock,
  retryGenerationMock,
  mockUsePlanStatus,
  mockUseRetryGeneration,
  mockUsePlanGenerationSession,
} = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  revalidateMock: vi.fn().mockResolvedValue(undefined),
  restartMock: vi.fn().mockResolvedValue(undefined),
  retryGenerationMock: vi.fn().mockResolvedValue(undefined),
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
    },
    startSession: vi.fn(),
    cancel: vi.fn(),
  };
}

function mockPlanStatus(
  overrides: Partial<ReturnType<typeof mockUsePlanStatus>> = {},
) {
  mockUsePlanStatus.mockReturnValue({
    status: 'failed',
    attempts: 1,
    error: null,
    pollingError: null,
    isPolling: false,
    revalidate: revalidateMock,
    restart: restartMock,
    ...overrides,
  });
}

function mockRetryGeneration(
  overrides: Partial<ReturnType<typeof mockUseRetryGeneration>> = {},
) {
  mockUseRetryGeneration.mockReturnValue({
    status: 'idle',
    error: null,
    isDisabled: false,
    retryGeneration: retryGenerationMock,
    ...overrides,
  });
}

describe('PlanPendingState', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUsePlanGenerationSession.mockReturnValue(createSessionMock());
    mockPlanStatus();
    mockRetryGeneration();
  });

  it('refreshes the route when generation status becomes ready', async () => {
    mockPlanStatus({ status: 'ready' });

    render(
      <PlanPendingState
        plan={createTestPlanDetail({ status: 'processing' })}
      />,
    );

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });
  });

  it('renders a fallback failed message when no error details are available', () => {
    render(
      <PlanPendingState plan={createTestPlanDetail({ status: 'failed' })} />,
    );

    expect(screen.getByText('Generation failed')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Generation failed before it finished. You can try again.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /retry generation/i }),
    ).toBeInTheDocument();
  });

  it('uses the configured attempt cap for a reloaded failed plan', () => {
    mockPlanStatus({ status: 'failed', attempts: 0 });
    const plan = createTestPlanDetail({
      status: 'failed',
      attempts: 3,
      attemptCap: 5,
    });

    render(<PlanPendingState plan={plan} />);

    expect(screen.getByText('Attempt 3 of 5')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Retry Generation (2 attempts remaining)',
      }),
    ).toBeInTheDocument();
    expect(mockUseRetryGeneration).toHaveBeenLastCalledWith(
      plan.id,
      5,
      3,
      expect.anything(),
      expect.any(Function),
    );
  });

  it('resumes status polling when the server accepts a retry', () => {
    render(
      <PlanPendingState plan={createTestPlanDetail({ status: 'failed' })} />,
    );

    const onRetryStarted = mockUseRetryGeneration.mock.lastCall?.[4] as
      | (() => void)
      | undefined;
    expect(restartMock).not.toHaveBeenCalled();

    onRetryStarted?.();

    expect(restartMock).toHaveBeenCalledTimes(1);
  });

  it('shows the generating panel once polling resumes after a retry', () => {
    mockPlanStatus({ status: 'processing', attempts: 2, isPolling: true });

    render(
      <PlanPendingState
        plan={createTestPlanDetail({
          status: 'failed',
          attempts: 1,
          attemptCap: 3,
        })}
      />,
    );

    expect(
      screen.getByText('Generating your learning plan'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Generation failed')).not.toBeInTheDocument();
  });

  it('keeps the interrupted fallback when a retry session is cancelled', () => {
    mockRetryGeneration({
      status: 'cancelled',
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

  it('shows a connection issue and refreshes status when polling fails', async () => {
    const user = userEvent.setup();
    mockPlanStatus({
      status: 'processing',
      pollingError: 'Unable to reach the server',
    });

    render(
      <PlanPendingState
        plan={createTestPlanDetail({ status: 'processing' })}
      />,
    );

    expect(screen.getByText('Connection issue')).toBeInTheDocument();
    expect(screen.getByText('Unable to reach the server')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^refresh$/i }));

    expect(revalidateMock).toHaveBeenCalledTimes(1);
  });

  it('omits the create-plan link when retries are exhausted', () => {
    mockPlanStatus({
      status: 'failed',
      attempts: 2,
      error: 'Generation failed',
    });

    render(
      <PlanPendingState
        plan={createTestPlanDetail({
          status: 'failed',
          attempts: 2,
          attemptCap: 2,
        })}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /retry generation/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /create a new plan/i }),
    ).not.toBeInTheDocument();
  });

  it('retries generation when the retry action is clicked', async () => {
    const user = userEvent.setup();

    render(
      <PlanPendingState plan={createTestPlanDetail({ status: 'failed' })} />,
    );

    await user.click(screen.getByRole('button', { name: /retry generation/i }));

    expect(retryGenerationMock).toHaveBeenCalledTimes(1);
  });

  it('renders pending plan details from the plan record', () => {
    mockPlanStatus({ status: 'processing' });

    render(
      <PlanPendingState
        plan={createTestPlanDetail({
          status: 'processing',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          origin: 'manual',
        })}
      />,
    );

    const planDetails = screen.getByRole('region', { name: 'Plan details' });

    expect(planDetails).toHaveTextContent('Beginner');
    expect(planDetails).toHaveTextContent('5');
    expect(planDetails).toHaveTextContent('mixed');
    expect(planDetails).toHaveTextContent('Manual');
  });
});
