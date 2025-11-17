import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { RegenerateButton } from '@/components/plans/RegenerateButton';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/logging/client', () => ({
  clientLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('RegenerateButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render with correct default label', () => {
    render(<RegenerateButton planId="test-plan-123" />);

    expect(screen.getByRole('button', { name: /regenerate plan/i })).toBeInTheDocument();
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
      expect(mockFetch).toHaveBeenCalledWith('/api/v1/plans/test-plan-123/regenerate', {
        method: 'POST',
      });
    });
  });

  it('should show loading state during regeneration', async () => {
    const mockFetch = vi.fn().mockImplementation(() =>
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
  });

  it('should disable button during regeneration', async () => {
    const mockFetch = vi.fn().mockImplementation(() =>
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
      expect(toast.error).toHaveBeenCalledWith('Unable to enqueue regeneration');
    });
  });

  it('should handle network errors gracefully', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    render(<RegenerateButton planId="test-plan-123" />);

    const button = screen.getByRole('button', { name: /regenerate plan/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Unable to enqueue regeneration');
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
    const mockFetch = vi.fn().mockImplementation(() =>
      new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 200))
    );
    vi.stubGlobal('fetch', mockFetch);

    render(<RegenerateButton planId="test-plan-123" />);

    const button = screen.getByRole('button', { name: /regenerate plan/i });

    // Click multiple times rapidly
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    // Should only have been called once
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
