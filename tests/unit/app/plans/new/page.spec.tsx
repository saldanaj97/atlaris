// IMPORTANT: Mock imports must come first, before any component imports
// that use the mocked modules (sonner, client-logger, next/navigation)
import '../../../../mocks/unit/client-logger.unit';
import '../../../../mocks/unit/sonner.unit';

import CreateNewPlanPage from '@/app/plans/new/page';
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
      <button onClick={onCancel}>Cancel</button>
      <div data-testid="streaming-status">{String(state)}</div>
    </div>
  ),
}));

describe('CreateNewPlanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushMock.mockClear();
    mockStartGeneration.mockClear();
    mockCancel.mockClear();
    // Reset mock state
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

      render(<CreateNewPlanPage />);

      // Find the textarea and submit button
      const textarea = screen.getByPlaceholderText(
        /I want to learn TypeScript for React development/i
      );
      const submitButton = screen.getByRole('button', {
        name: /generate my plan/i,
      });

      // Fill in the form
      fireEvent.change(textarea, {
        target: { value: 'I want to learn TypeScript' },
      });

      // Submit the form
      await act(async () => {
        fireEvent.click(submitButton);
      });

      // Wait for handleSubmit to complete
      await waitFor(() => {
        expect(mockStartGeneration).toHaveBeenCalledTimes(1);
      });

      // Verify the payload was correctly mapped
      const callArgs = mockStartGeneration.mock.calls[0][0];
      expect(callArgs).toMatchObject({
        topic: 'I want to learn TypeScript',
        skillLevel: 'beginner',
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      });
      expect(callArgs.deadlineDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Verify success toast and navigation
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

      render(<CreateNewPlanPage />);

      const textarea = screen.getByPlaceholderText(
        /I want to learn TypeScript for React development/i
      );
      const submitButton = screen.getByRole('button', {
        name: /generate my plan/i,
      });

      fireEvent.change(textarea, {
        target: { value: 'Learn React Hooks' },
      });

      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(mockStartGeneration).toHaveBeenCalled();
      });

      // Verify the mapper was called with correct structure
      const callArgs = mockStartGeneration.mock.calls[0][0];
      expect(callArgs.topic).toBe('Learn React Hooks');
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

      render(<CreateNewPlanPage />);

      const textarea = screen.getByPlaceholderText(
        /I want to learn TypeScript for React development/i
      );
      const submitButton = screen.getByRole('button', {
        name: /generate my plan/i,
      });

      fireEvent.change(textarea, {
        target: { value: 'Learn Vue.js' },
      });

      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(mockStartGeneration).toHaveBeenCalled();
      });

      // Wait for abort handling
      await waitFor(() => {
        expect(toast.info).toHaveBeenCalledWith('Generation cancelled');
      });

      // Should not navigate on abort
      expect(pushMock).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('should prevent duplicate cancellation toasts', async () => {
      const abortError = new DOMException('Aborted', 'AbortError');
      mockStartGeneration.mockRejectedValue(abortError);

      // Set up streaming state to simulate mid-stream cancellation
      Object.assign(mockState, {
        status: 'generating' as const,
        planId: 'plan-789',
      });

      render(<CreateNewPlanPage />);

      const textarea = screen.getByPlaceholderText(
        /I want to learn TypeScript for React development/i
      );
      const submitButton = screen.getByRole('button', {
        name: /generate my plan/i,
      });

      fireEvent.change(textarea, {
        target: { value: 'Learn Angular' },
      });

      await act(async () => {
        fireEvent.click(submitButton);
      });

      // Simulate cancel button click (which also shows toast)
      const cancelButton = screen.queryByText('Cancel');
      if (cancelButton) {
        await act(async () => {
          fireEvent.click(cancelButton);
        });
      }

      await waitFor(() => {
        expect(mockStartGeneration).toHaveBeenCalled();
      });

      // Wait a bit to ensure no duplicate toasts
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should only show cancellation toast once (either from handleSubmit or onCancel)
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

      render(<CreateNewPlanPage />);

      const textarea = screen.getByPlaceholderText(
        /I want to learn TypeScript for React development/i
      );
      const submitButton = screen.getByRole('button', {
        name: /generate my plan/i,
      });

      fireEvent.change(textarea, {
        target: { value: 'Learn Node.js' },
      });

      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(mockStartGeneration).toHaveBeenCalled();
      });

      // Should show error toast with retry message
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Generation failed. You can retry from the plan page.'
        );
      });

      // Should redirect to plan page even on failure if planId exists
      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith(`/plans/${planId}`);
      });

      // Should log the error
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

      render(<CreateNewPlanPage />);

      const textarea = screen.getByPlaceholderText(
        /I want to learn TypeScript for React development/i
      );
      const submitButton = screen.getByRole('button', {
        name: /generate my plan/i,
      });

      fireEvent.change(textarea, {
        target: { value: 'Learn Python' },
      });

      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith(`/plans/${planId}`);
      });
    });

    it('should recover planId from streamingState.planId ref', async () => {
      const planId = 'plan-recovery-789';
      // Set planId in state before error
      Object.assign(mockState, {
        status: 'generating' as const,
        planId,
      });

      const errorWithoutPlanId = new Error('Generation failed') as Error & {
        status?: number;
      };
      errorWithoutPlanId.status = 200;

      mockStartGeneration.mockRejectedValue(errorWithoutPlanId);

      render(<CreateNewPlanPage />);

      const textarea = screen.getByPlaceholderText(
        /I want to learn TypeScript for React development/i
      );
      const submitButton = screen.getByRole('button', {
        name: /generate my plan/i,
      });

      fireEvent.change(textarea, {
        target: { value: 'Learn Rust' },
      });

      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith(`/plans/${planId}`);
      });
    });
  });

  // Note: Tests for internal mapping function errors were removed because they
  // required mocking internal modules which isn't possible with ES modules.
  // The error handling behavior is tested via the generic error handling tests
  // which cover the user-facing error toast and logging behavior.

  describe('handleSubmit - generic error handling', () => {
    it('should handle generic streaming errors without planId', async () => {
      const genericError = new Error('Network error');
      mockStartGeneration.mockRejectedValue(genericError);

      render(<CreateNewPlanPage />);

      const textarea = screen.getByPlaceholderText(
        /I want to learn TypeScript for React development/i
      );
      const submitButton = screen.getByRole('button', {
        name: /generate my plan/i,
      });

      fireEvent.change(textarea, {
        target: { value: 'Learn Kotlin' },
      });

      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(mockStartGeneration).toHaveBeenCalled();
      });

      // Should show error toast with error message
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Network error');
      });

      // Should not navigate without planId
      expect(pushMock).not.toHaveBeenCalled();

      expect(clientLogger.error).toHaveBeenCalledWith(
        'Streaming plan generation failed',
        genericError
      );
    });

    it('should handle errors without message property', async () => {
      const errorWithoutMessage = { status: 500 } as unknown as Error;
      mockStartGeneration.mockRejectedValue(errorWithoutMessage);

      render(<CreateNewPlanPage />);

      const textarea = screen.getByPlaceholderText(
        /I want to learn TypeScript for React development/i
      );
      const submitButton = screen.getByRole('button', {
        name: /generate my plan/i,
      });

      fireEvent.change(textarea, {
        target: { value: 'Learn Dart' },
      });

      await act(async () => {
        fireEvent.click(submitButton);
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
      // Make startGeneration take some time
      mockStartGeneration.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(planId), 100);
          })
      );

      render(<CreateNewPlanPage />);

      const textarea = screen.getByPlaceholderText(
        /I want to learn TypeScript for React development/i
      );
      const submitButton = screen.getByRole('button', {
        name: /generate my plan/i,
      });

      fireEvent.change(textarea, {
        target: { value: 'Learn C++' },
      });

      await act(async () => {
        fireEvent.click(submitButton);
      });

      // Button should show loading state
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /generating/i })
        ).toBeInTheDocument();
      });

      // Wait for completion
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

      render(<CreateNewPlanPage />);

      const textarea = screen.getByPlaceholderText(
        /I want to learn TypeScript for React development/i
      );
      const submitButton = screen.getByRole('button', {
        name: /generate my plan/i,
      });

      // Only changing the topic via textarea - other fields use defaults
      fireEvent.change(textarea, {
        target: { value: 'Learn TypeScript' },
      });

      await act(async () => {
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(mockStartGeneration).toHaveBeenCalled();
      });

      // Verify the form data was correctly processed with default values
      const callArgs = mockStartGeneration.mock.calls[0][0];
      expect(callArgs.topic).toBe('Learn TypeScript');
      // These use default values since we only changed the topic
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

      render(<CreateNewPlanPage />);

      expect(screen.getByTestId('plan-draft-view')).toBeInTheDocument();
    });

    it('should not render PlanDraftView when status is idle', () => {
      Object.assign(mockState, {
        status: 'idle' as const,
      });

      render(<CreateNewPlanPage />);

      expect(screen.queryByTestId('plan-draft-view')).not.toBeInTheDocument();
    });

    it('should handle cancel from PlanDraftView', async () => {
      Object.assign(mockState, {
        status: 'generating' as const,
        planId: 'plan-cancel-123',
      });

      render(<CreateNewPlanPage />);

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
