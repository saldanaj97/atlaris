// IMPORTANT: Mock imports must come first, before any component imports
// that use the mocked modules (sonner, client-logger, next/navigation).
import '../../../../mocks/unit/client-logger.unit';
import '../../../../mocks/unit/sonner.unit';

import { ManualCreatePanel } from '@/app/plans/new/components/ManualCreatePanel';
import type {
  StreamingPlanState,
  UseStreamingPlanGenerationResult,
} from '@/hooks/useStreamingPlanGeneration';
import { clientLogger } from '@/lib/logging/client';
import type { CreateLearningPlanInput } from '@/lib/validation/learningPlans.types';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { createDeferredPromise } from '../../../../helpers/deferred-promise';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn<(href: string) => void>();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const mockStartGeneration =
  vi.fn<
    (
      input: CreateLearningPlanInput,
      options?: { onPlanIdReady?: (planId: string) => void }
    ) => Promise<string>
  >();
const mockCancel = vi.fn<() => void>();
const mockUseStreamingPlanGeneration =
  vi.fn<() => UseStreamingPlanGenerationResult>();

vi.mock('@/hooks/useStreamingPlanGeneration', async () => {
  const actual = await vi.importActual<
    typeof import('@/hooks/useStreamingPlanGeneration')
  >('@/hooks/useStreamingPlanGeneration');

  return {
    ...actual,
    useStreamingPlanGeneration: () => mockUseStreamingPlanGeneration(),
  };
});

const mockState: StreamingPlanState = {
  status: 'idle',
  modules: [],
  planId: undefined,
  progress: undefined,
  error: undefined,
};

describe('ManualCreatePanel', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
    Object.assign(mockState, {
      status: 'idle' as const,
      modules: [],
      planId: undefined,
      progress: undefined,
      error: undefined,
    });
    mockUseStreamingPlanGeneration.mockReturnValue({
      state: mockState,
      startGeneration: mockStartGeneration,
      cancel: mockCancel,
    });
  });

  afterEach(() => {
    cleanup();
  });

  async function fillTopic(topic: string): Promise<void> {
    await user.type(screen.getByLabelText(/what do you want to learn/i), topic);
  }

  async function chooseOption(currentLabel: string, nextLabel: string) {
    const currentValue = screen.getByText(currentLabel);
    const trigger = currentValue.closest('button');

    if (!(trigger instanceof HTMLButtonElement)) {
      throw new Error(`Could not find dropdown trigger for "${currentLabel}"`);
    }

    await user.click(trigger);
    await user.click(await screen.findByText(nextLabel));
  }

  async function submitForm(): Promise<void> {
    await user.click(screen.getByRole('button', { name: /generate my plan/i }));
  }

  describe('handleSubmit - successful generation', () => {
    it('starts generation from the real form and redirects when the plan id is ready', async () => {
      const planId = 'plan-123';
      mockStartGeneration.mockImplementation(async (_input, options) => {
        options?.onPlanIdReady?.(planId);
        return planId;
      });

      render(<ManualCreatePanel />);

      await fillTopic('Test Topic');
      await submitForm();

      await waitFor(() => {
        expect(mockStartGeneration).toHaveBeenCalledTimes(1);
      });

      const callArgs = mockStartGeneration.mock.calls[0]?.[0];
      expect(callArgs).toMatchObject({
        topic: 'Test Topic',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      });
      expect(callArgs?.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(callArgs?.deadlineDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          'Your learning plan generation has started.'
        );
      });

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith(`/plans/${planId}`);
      });
    });

    it('uses the real form values instead of a mocked mapper payload', async () => {
      mockStartGeneration.mockResolvedValue('plan-456');

      render(<ManualCreatePanel />);

      await fillTopic('  Learn Rust  ');
      await chooseOption('Beginner', 'Advanced');
      await chooseOption('3-5 hours', '11-15 hours');
      await chooseOption('Mixed', 'Reading');
      await chooseOption('1 month', '3 months');
      await submitForm();

      await waitFor(() => {
        expect(mockStartGeneration).toHaveBeenCalledTimes(1);
      });

      const callArgs = mockStartGeneration.mock.calls[0]?.[0];
      expect(callArgs).toMatchObject({
        topic: 'Learn Rust',
        skillLevel: 'advanced',
        weeklyHours: 15,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
      });
      expect(callArgs?.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(callArgs?.deadlineDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('handleSubmit - abort handling', () => {
    it('shows the cancellation toast when generation is aborted', async () => {
      mockStartGeneration.mockRejectedValue(
        new DOMException('Aborted', 'AbortError')
      );

      render(<ManualCreatePanel />);

      await fillTopic('Cancelled topic');
      await submitForm();

      await waitFor(() => {
        expect(mockStartGeneration).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(toast.info).toHaveBeenCalledWith('Generation cancelled');
      });

      expect(pushMock).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe('handleSubmit - partial failure with planId recovery', () => {
    it('recovers planId from the thrown error and redirects to the plan page', async () => {
      const planId = 'plan-recovery-123';
      const errorWithPlanId = new Error('Generation failed') as Error & {
        status?: number;
        planId?: string;
      };
      errorWithPlanId.status = 200;
      errorWithPlanId.planId = planId;

      mockStartGeneration.mockRejectedValue(errorWithPlanId);

      render(<ManualCreatePanel />);

      await fillTopic('Recovery topic');
      await submitForm();

      await waitFor(() => {
        expect(mockStartGeneration).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Generation failed. You can retry from the plan page.'
        );
      });

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith(`/plans/${planId}`);
      });

      expect(clientLogger.error).toHaveBeenCalledWith(
        'Streaming plan generation failed',
        errorWithPlanId
      );
    });

    it('recovers planId from error.data.planId', async () => {
      const planId = 'plan-recovery-456';
      const errorWithData = new Error('Generation failed') as Error & {
        status?: number;
        data?: { planId?: string };
      };
      errorWithData.status = 200;
      errorWithData.data = { planId };

      mockStartGeneration.mockRejectedValue(errorWithData);

      render(<ManualCreatePanel />);

      await fillTopic('Recovery from error data');
      await submitForm();

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith(`/plans/${planId}`);
      });
    });

    it('recovers planId from the streaming state ref when the error does not include one', async () => {
      const planId = 'plan-recovery-789';
      Object.assign(mockState, {
        status: 'generating' as const,
        planId,
      });

      const errorWithoutPlanId = new Error('Generation failed') as Error & {
        status?: number;
      };
      errorWithoutPlanId.status = 200;

      mockStartGeneration.mockRejectedValue(errorWithoutPlanId);

      render(<ManualCreatePanel />);

      await fillTopic('Recovery from state');
      await submitForm();

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith(`/plans/${planId}`);
      });
    });
  });

  describe('handleSubmit - generic error handling', () => {
    it('shows the streaming error message when no planId can be recovered', async () => {
      const genericError = new Error('Network error');
      mockStartGeneration.mockRejectedValue(genericError);

      render(<ManualCreatePanel />);

      await fillTopic('Generic error topic');
      await submitForm();

      await waitFor(() => {
        expect(mockStartGeneration).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Network error');
      });

      expect(pushMock).not.toHaveBeenCalled();
      expect(clientLogger.error).toHaveBeenCalledWith(
        'Streaming plan generation failed',
        genericError
      );
    });

    it('falls back to the generic error toast when the thrown value has no message', async () => {
      mockStartGeneration.mockRejectedValue({ status: 500 });

      render(<ManualCreatePanel />);

      await fillTopic('Fallback error topic');
      await submitForm();

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'We could not create your learning plan. Please try again.'
        );
      });
    });
  });

  describe('UnifiedPlanInput integration', () => {
    it('shows the real submitting state while generation is in flight', async () => {
      const deferredGeneration = createDeferredPromise<string>();
      mockStartGeneration.mockImplementation(() => deferredGeneration.promise);

      render(<ManualCreatePanel />);

      await fillTopic('Long running topic');
      await submitForm();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /generating/i })
        ).toBeDisabled();
      });

      deferredGeneration.resolve('plan-999');

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /generate my plan/i })
        ).toBeEnabled();
      });
    });
  });
});
