// IMPORTANT: Mock imports must come first, before any component imports
// that use the mocked modules (sonner, client-logger)
import '../../mocks/unit/sonner.unit';
import '../../mocks/unit/client-logger.unit';

import { RegenerateButton } from '@/app/plans/components/RegenerateButton';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('RegenerateButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render with correct default label', () => {
    render(<RegenerateButton planId="test-plan-123" />);

    expect(
      screen.getByRole('button', { name: /regenerate plan/i })
    ).toBeInTheDocument();
  });

  it('should trigger regeneration API call on click', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<RegenerateButton planId="test-plan-123" />);

    const button = screen.getByRole('button', { name: /regenerate plan/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/plans/test-plan-123/regenerate',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  it('should show loading state during regeneration', async () => {
    vi.useFakeTimers();
    const mockFetch = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 100))
      );
    vi.stubGlobal('fetch', mockFetch);

    render(<RegenerateButton planId="test-plan-123" />);

    const button = screen.getByRole('button', { name: /regenerate plan/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/regenerating/i)).toBeInTheDocument();
    });

    // Verify button is disabled during loading
    expect(button).toBeDisabled();

    vi.advanceTimersByTime(100);
    vi.useRealTimers();
  });

  it('should disable button during regeneration', async () => {
    vi.useFakeTimers();
    const mockFetch = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 100))
      );
    vi.stubGlobal('fetch', mockFetch);

    render(<RegenerateButton planId="test-plan-123" />);

    const button = screen.getByRole('button', { name: /regenerate plan/i });

    // Button should be enabled initially
    expect(button).not.toBeDisabled();

    fireEvent.click(button);

    // Button should be disabled during loading
    await waitFor(() => {
      expect(button).toBeDisabled();
    });

    vi.advanceTimersByTime(100);
    vi.useRealTimers();
  });

  it('should show success toast on successful regeneration', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<RegenerateButton planId="test-plan-123" />);

    const button = screen.getByRole('button', { name: /regenerate plan/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Plan regeneration enqueued');
    });
  });

  it('should show error toast on regeneration failure', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Internal Server Error',
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<RegenerateButton planId="test-plan-123" />);

    const button = screen.getByRole('button', { name: /regenerate plan/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Unable to enqueue regeneration'
      );
    });
  });

  it('should handle network errors gracefully', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    render(<RegenerateButton planId="test-plan-123" />);

    const button = screen.getByRole('button', { name: /regenerate plan/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Unable to enqueue regeneration'
      );
    });
  });

  it('should re-enable button after successful regeneration', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<RegenerateButton planId="test-plan-123" />);

    const button = screen.getByRole('button', { name: /regenerate plan/i });
    fireEvent.click(button);

    // Wait for operation to complete
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });

    // Button should be enabled again
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });

  it('should re-enable button after failed regeneration', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<RegenerateButton planId="test-plan-123" />);

    const button = screen.getByRole('button', { name: /regenerate plan/i });
    fireEvent.click(button);

    // Wait for operation to complete
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });

    // Button should be enabled again
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });

  it('should not allow multiple simultaneous regenerations', async () => {
    vi.useFakeTimers();
    const mockFetch = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 200))
      );
    vi.stubGlobal('fetch', mockFetch);

    render(<RegenerateButton planId="test-plan-123" />);

    const button = screen.getByRole('button', { name: /regenerate plan/i });

    // Click multiple times rapidly - button disables after first click
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    // Should only have been called once because button is disabled during loading
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    vi.advanceTimersByTime(200);
    vi.useRealTimers();
  });
});
