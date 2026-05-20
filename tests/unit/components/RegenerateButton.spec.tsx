// IMPORTANT: Mock imports must come first, before any component imports
// that use the mocked modules (sonner, client-logger)
import { createDeferredPromise } from '../../helpers/deferred-promise';
import '../../mocks/unit/client-logger.unit';
import '../../mocks/unit/sonner.unit';

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegenerateButton } from '@/app/(app)/plans/components/RegenerateButton';

describe('RegenerateButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
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
        }),
      );
    });
  });

  it('should show loading state during regeneration', async () => {
    const deferredFetch = createDeferredPromise<{ ok: boolean }>();
    const mockFetch = vi.fn().mockReturnValue(deferredFetch.promise);
    vi.stubGlobal('fetch', mockFetch);

    render(<RegenerateButton planId="test-plan-123" />);

    const button = screen.getByRole('button', { name: /regenerate plan/i });
    fireEvent.click(button);

    // Check loading state immediately after click
    await waitFor(() => {
      expect(screen.getByText(/regenerating/i)).toBeInTheDocument();
    });

    // Verify button is disabled during loading
    expect(button).toBeDisabled();

    await act(async () => {
      deferredFetch.resolve({ ok: true });
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
      expect(toast.error).toHaveBeenCalledWith(
        'Unable to enqueue regeneration',
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
        'Unable to enqueue regeneration',
      );
    });
  });

  it('should not allow multiple simultaneous regenerations', async () => {
    const deferredFetch = createDeferredPromise<{ ok: boolean }>();
    const mockFetch = vi.fn().mockReturnValue(deferredFetch.promise);
    vi.stubGlobal('fetch', mockFetch);

    render(<RegenerateButton planId="test-plan-123" />);

    const button = screen.getByRole('button', { name: /regenerate plan/i });

    // Click multiple times rapidly - button disables after first click
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    // Should only have been called once because button is disabled during loading
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferredFetch.resolve({ ok: true });
    });
  });
});
