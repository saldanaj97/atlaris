import ManageSubscriptionButton from '@/components/billing/ManageSubscriptionButton';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('ManageSubscriptionButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.location.href
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render with default label', () => {
    render(<ManageSubscriptionButton />);

    expect(
      screen.getByRole('button', { name: /manage subscription/i })
    ).toBeInTheDocument();
  });

  it('should render with custom label', () => {
    render(<ManageSubscriptionButton label="Billing Settings" />);

    expect(
      screen.getByRole('button', { name: /billing settings/i })
    ).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    render(<ManageSubscriptionButton className="custom-class" />);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('custom-class');
  });

  it('should call portal API when clicked', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        portalUrl: 'https://billing.stripe.com/portal/session_123',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<ManageSubscriptionButton />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/v1/stripe/create-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ returnUrl: undefined }),
      });
    });
  });

  it('should include returnUrl when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        portalUrl: 'https://billing.stripe.com/portal/session_123',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<ManageSubscriptionButton returnUrl="/dashboard" />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/v1/stripe/create-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ returnUrl: '/dashboard' }),
      });
    });
  });

  it('should show loading state during portal creation', async () => {
    const mockFetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({
                  portalUrl: 'https://billing.stripe.com/portal',
                }),
              }),
            100
          )
        )
    );
    vi.stubGlobal('fetch', mockFetch);

    render(<ManageSubscriptionButton />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/opening/i)).toBeInTheDocument();
    });
  });

  it('should disable button during portal creation', async () => {
    const mockFetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({
                  portalUrl: 'https://billing.stripe.com/portal',
                }),
              }),
            100
          )
        )
    );
    vi.stubGlobal('fetch', mockFetch);

    render(<ManageSubscriptionButton />);

    const button = screen.getByRole('button');

    // Button should be enabled initially
    expect(button).not.toBeDisabled();

    fireEvent.click(button);

    // Button should be disabled during loading
    await waitFor(() => {
      expect(button).toBeDisabled();
    });
  });

  it('should redirect to portal URL on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        portalUrl: 'https://billing.stripe.com/portal/session_123',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<ManageSubscriptionButton />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(window.location.href).toBe(
        'https://billing.stripe.com/portal/session_123'
      );
    });
  });

  it('should show error toast when API call fails', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => 'Portal creation failed',
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<ManageSubscriptionButton />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Unable to open billing portal',
        {
          description: 'Portal creation failed',
        }
      );
    });
  });

  it('should show error toast when portalUrl is missing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}), // Missing portalUrl
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<ManageSubscriptionButton />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Unable to open billing portal',
        {
          description: 'Missing portal URL',
        }
      );
    });
  });

  it('should handle network errors gracefully', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    render(<ManageSubscriptionButton />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Unable to open billing portal',
        {
          description: 'Network error',
        }
      );
    });
  });

  it('should re-enable button after error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => 'Error',
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<ManageSubscriptionButton />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Wait for error
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });

    // Button should be enabled again
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });

  it('should not allow multiple simultaneous portal requests', async () => {
    const mockFetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({
                  portalUrl: 'https://billing.stripe.com/portal',
                }),
              }),
            200
          )
        )
    );
    vi.stubGlobal('fetch', mockFetch);

    render(<ManageSubscriptionButton />);

    const button = screen.getByRole('button');

    // Click multiple times rapidly
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    // Should only have been called once
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  it('should handle generic error objects', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValue({ message: 'Custom error object' });
    vi.stubGlobal('fetch', mockFetch);

    render(<ManageSubscriptionButton />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Unable to open billing portal',
        {
          description: 'Something went wrong',
        }
      );
    });
  });
});
