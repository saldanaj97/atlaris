// IMPORTANT: Mock imports must come first, before any component imports
// that use the mocked modules (sonner, client-logger, next/navigation)
import '../../../../mocks/unit/client-logger.unit';
import '../../../../mocks/unit/sonner.unit';

import { ManualCreatePanel } from '@/app/plans/new/components/ManualCreatePanel';
import { clientLogger } from '@/lib/logging/client';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock next/navigation
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

// Mock useStreamingPlanGeneration hook
const mockStartGeneration = vi.fn();
const mockCancel = vi.fn();
const mockState = {
  status: 'idle' as const,
  modules: [],
  planId: undefined,
  progress: undefined,
  error: undefined,
};

vi.mock('@/hooks/useStreamingPlanGeneration', () => ({
  useStreamingPlanGeneration: vi.fn(() => ({
    state: mockState,
    startGeneration: mockStartGeneration,
    cancel: mockCancel,
  })),
}));

// Mock PlanDraftView to simplify tests
vi.mock('@/app/plans/[id]/components/PlanDraftView', () => ({
  PlanDraftView: ({
    state,
    onCancel,
  }: {
    state: unknown;
    onCancel: () => void;
  }) => (
    <div data-testid="plan-draft-view">
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <div data-testid="streaming-status">{String(state)}</div>
    </div>
  ),
}));

// Mock mapOnboardingToCreateInput to return a valid payload
const mockMappedPayload = {
  topic: 'Test Topic',
  skillLevel: 'beginner',
  weeklyHours: 5,
  learningStyle: 'mixed',
  startDate: '2025-01-01',
  deadlineDate: '2025-02-01',
  visibility: 'private' as const,
  origin: 'ai' as const,
};

vi.mock('@/lib/mappers/learningPlans', () => ({
  mapOnboardingToCreateInput: vi.fn(() => mockMappedPayload),
}));

// Mock UnifiedPlanInput to simplify form submission tests
let capturedOnSubmit: ((data: unknown) => void) | null = null;
let capturedIsSubmitting = false;

vi.mock('@/app/plans/new/components/plan-form', () => ({
  UnifiedPlanInput: ({
    onSubmit,
    isSubmitting,
  }: {
    onSubmit: (data: unknown) => void;
    isSubmitting: boolean;
  }) => {
    capturedOnSubmit = onSubmit;
    capturedIsSubmitting = isSubmitting;
    return (
      <div data-testid="unified-plan-input">
        <span data-testid="is-submitting">{String(isSubmitting)}</span>
        <button
          type="button"
          data-testid="mock-submit"
          onClick={() =>
            onSubmit({
              topic: 'Test Topic',
              skillLevel: 'beginner',
              weeklyHours: '3-5',
              learningStyle: 'mixed',
              deadlineWeeks: '4',
            })
          }
        >
          Submit
        </button>
      </div>
    );
  },
}));

describe('ManualCreatePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushMock.mockClear();
    mockStartGeneration.mockClear();
    mockCancel.mockClear();
    capturedOnSubmit = null;
    Object.assign(mockState, {
      status: 'idle' as const,
      modules: [],
      planId: undefined,
      progress: undefined,
      error: undefined,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleSubmit - successful generation', () => {
    it('should handle successful plan generation with full streaming flow', async () => {
      const planId = 'plan-123';
      mockStartGeneration.mockResolvedValue(planId);

      render(<ManualCreatePanel />);

      const submitButton = screen.getByTestId('mock-submit');

      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(mockStartGeneration).toHaveBeenCalledTimes(1);
      });

      const callArgs = mockStartGeneration.mock.calls[0][0];
      expect(callArgs).toMatchObject({
        topic: 'Test Topic',
        skillLevel: 'beginner',
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      });
      expect(callArgs.deadlineDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          'Your learning plan is ready!'
        );
      });

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith(`/plans/${planId}`);
      });
    });

    it('should convert PlanFormData to OnboardingFormValues correctly', async () => {
      const planId = 'plan-456';
      mockStartGeneration.mockResolvedValue(planId);

      render(<ManualCreatePanel />);

      await act(async () => {
        fireEvent.click(screen.getByTestId('mock-submit'));
      });

      await waitFor(() => {
        expect(mockStartGeneration).toHaveBeenCalled();
      });

      const callArgs = mockStartGeneration.mock.calls[0][0];
      expect(callArgs.topic).toBe('Test Topic');
      expect(callArgs.skillLevel).toBe('beginner');
      expect(callArgs.weeklyHours).toBeGreaterThan(0);
      expect(callArgs.learningStyle).toBe('mixed');
      expect(callArgs.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(callArgs.deadlineDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('handleSubmit - abort handling', () => {
    it('should handle user cancellation mid-stream', async () => {
      const abortError = new DOMException('Aborted', 'AbortError');
      mockStartGeneration.mockRejectedValue(abortError);

      render(<ManualCreatePanel />);

      await act(async () => {
        fireEvent.click(screen.getByTestId('mock-submit'));
      });

      await waitFor(() => {
        expect(mockStartGeneration).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(toast.info).toHaveBeenCalledWith('Generation cancelled');
      });

      expect(pushMock).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('should prevent duplicate cancellation toasts', async () => {
      const abortError = new DOMException('Aborted', 'AbortError');
      mockStartGeneration.mockRejectedValue(abortError);

      Object.assign(mockState, {
        status: 'generating' as const,
        planId: 'plan-789',
      });

      render(<ManualCreatePanel />);

      await act(async () => {
        fireEvent.click(screen.getByTestId('mock-submit'));
      });

      const cancelButton = screen.queryByText('Cancel');
      if (cancelButton) {
        await act(async () => {
          fireEvent.click(cancelButton);
        });
      }

      await waitFor(() => {
        expect(mockStartGeneration).toHaveBeenCalled();
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const infoCalls = (toast.info as ReturnType<typeof vi.fn>).mock.calls;
      expect(infoCalls.length).toBeLessThanOrEqual(1);
    });
  });

  describe('handleSubmit - partial failure with planId recovery', () => {
    it('should recover planId from error payload and redirect', async () => {
      const planId = 'plan-recovery-123';
      const errorWithPlanId = new Error('Generation failed') as Error & {
        status?: number;
        planId?: string;
      };
      errorWithPlanId.status = 200;
      errorWithPlanId.planId = planId;

      mockStartGeneration.mockRejectedValue(errorWithPlanId);

      render(<ManualCreatePanel />);

      await act(async () => {
        fireEvent.click(screen.getByTestId('mock-submit'));
      });

      await waitFor(() => {
        expect(mockStartGeneration).toHaveBeenCalled();
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

    it('should recover planId from error.data.planId', async () => {
      const planId = 'plan-recovery-456';
      const errorWithData = new Error('Generation failed') as Error & {
        status?: number;
        data?: { planId?: string };
      };
      errorWithData.status = 200;
      errorWithData.data = { planId };

      mockStartGeneration.mockRejectedValue(errorWithData);

      render(<ManualCreatePanel />);

      await act(async () => {
        fireEvent.click(screen.getByTestId('mock-submit'));
      });

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith(`/plans/${planId}`);
      });
    });

    it('should recover planId from streamingState.planId ref', async () => {
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

      await act(async () => {
        fireEvent.click(screen.getByTestId('mock-submit'));
      });

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith(`/plans/${planId}`);
      });
    });
  });

  describe('handleSubmit - generic error handling', () => {
    it('should handle generic streaming errors without planId', async () => {
      const genericError = new Error('Network error');
      mockStartGeneration.mockRejectedValue(genericError);

      render(<ManualCreatePanel />);

      await act(async () => {
        fireEvent.click(screen.getByTestId('mock-submit'));
      });

      await waitFor(() => {
        expect(mockStartGeneration).toHaveBeenCalled();
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

    it('should handle errors without message property', async () => {
      const errorWithoutMessage = { status: 500 } as unknown as Error;
      mockStartGeneration.mockRejectedValue(errorWithoutMessage);

      render(<ManualCreatePanel />);

      await act(async () => {
        fireEvent.click(screen.getByTestId('mock-submit'));
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'We could not create your learning plan. Please try again.'
        );
      });
    });
  });

  describe('UnifiedPlanInput integration', () => {
    it('should pass isSubmitting state to UnifiedPlanInput', async () => {
      const planId = 'plan-999';
      mockStartGeneration.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(planId), 100);
          })
      );

      render(<ManualCreatePanel />);

      await act(async () => {
        fireEvent.click(screen.getByTestId('mock-submit'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('is-submitting').textContent).toBe('true');
      });

      await waitFor(
        () => {
          expect(mockStartGeneration).toHaveBeenCalled();
        },
        { timeout: 200 }
      );
    });

    it('should call handleSubmit when UnifiedPlanInput emits onSubmit', async () => {
      const planId = 'plan-integration-123';
      mockStartGeneration.mockResolvedValue(planId);

      render(<ManualCreatePanel />);

      await act(async () => {
        fireEvent.click(screen.getByTestId('mock-submit'));
      });

      await waitFor(() => {
        expect(mockStartGeneration).toHaveBeenCalled();
      });

      const callArgs = mockStartGeneration.mock.calls[0][0];
      expect(callArgs.topic).toBe('Test Topic');
      expect(callArgs.skillLevel).toBe('beginner');
      expect(callArgs.learningStyle).toBe('mixed');
    });
  });

  describe('PlanDraftView integration', () => {
    it('should render PlanDraftView when streaming status is not idle', () => {
      Object.assign(mockState, {
        status: 'generating' as const,
        planId: 'plan-draft-123',
        modules: [
          {
            index: 0,
            title: 'Module 1',
            description: 'Introduction',
            estimatedMinutes: 120,
            tasksCount: 3,
          },
        ],
      });

      render(<ManualCreatePanel />);

      expect(screen.getByTestId('plan-draft-view')).toBeInTheDocument();
    });

    it('should not render PlanDraftView when status is idle', () => {
      Object.assign(mockState, {
        status: 'idle' as const,
      });

      render(<ManualCreatePanel />);

      expect(screen.queryByTestId('plan-draft-view')).not.toBeInTheDocument();
    });

    it('should handle cancel from PlanDraftView', async () => {
      Object.assign(mockState, {
        status: 'generating' as const,
        planId: 'plan-cancel-123',
      });

      render(<ManualCreatePanel />);

      const cancelButton = screen.getByText('Cancel');
      await act(async () => {
        fireEvent.click(cancelButton);
      });

      expect(mockCancel).toHaveBeenCalled();
      await waitFor(() => {
        expect(toast.info).toHaveBeenCalledWith('Generation cancelled');
      });
    });
  });
});
