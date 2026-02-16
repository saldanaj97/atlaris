// IMPORTANT: Mock imports must come first, before any component or module
// imports that consume the mocked package (sonner in this case).
import SubscribeButton from '@/components/billing/SubscribeButton';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../mocks/unit/sonner.unit';

describe('SubscribeButton', () => {
  const mockLocation = { href: '' };
  let originalLocation: Location;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation.href = '';
    originalLocation = window.location;
    // Mock window.location so assignments to .href go to our object (jsdom can normalize href on the real Location)
    Object.defineProperty(window, 'location', {
      value: mockLocation,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
    cleanup();
  });

  it('should render with default label', () => {
    render(<SubscribeButton priceId="price_123" />);

    expect(
      screen.getByRole('button', { name: /subscribe/i })
    ).toBeInTheDocument();
  });

  it('should render with custom label', () => {
    render(<SubscribeButton priceId="price_123" label="Upgrade Now" />);

    expect(
      screen.getByRole('button', { name: /upgrade now/i })
    ).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    render(<SubscribeButton priceId="price_123" className="custom-class" />);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('custom-class');
  });

  it('should call checkout API with correct priceId', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sessionUrl: 'https://stripe.com/checkout/session_123',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<SubscribeButton priceId="price_123" />);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/v1/stripe/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: 'price_123',
          successUrl: undefined,
          cancelUrl: undefined,
        }),
      });
    });
  });

  it('should include success and cancel URLs when provided', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sessionUrl: 'https://stripe.com/checkout/session_123',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    render(
      <SubscribeButton
        priceId="price_123"
        successUrl="/success"
        cancelUrl="/cancel"
      />
    );

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/v1/stripe/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: 'price_123',
          successUrl: '/success',
          cancelUrl: '/cancel',
        }),
      });
    });
  });

  it('should show loading state during checkout', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({
                  sessionUrl: 'https://stripe.com/checkout',
                }),
              }),
            100
          )
        )
    );
    vi.stubGlobal('fetch', mockFetch);

    render(<SubscribeButton priceId="price_123" />);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/redirecting/i)).toBeInTheDocument();
    });
  });

  it('should disable button during checkout', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({
                  sessionUrl: 'https://stripe.com/checkout',
                }),
              }),
            100
          )
        )
    );
    vi.stubGlobal('fetch', mockFetch);

    render(<SubscribeButton priceId="price_123" />);

    const button = screen.getByRole('button');

    // Button should be enabled initially
    expect(button).not.toBeDisabled();

    await user.click(button);

    // Button should be disabled during loading
    await waitFor(() => {
      expect(button).toBeDisabled();
    });
  });

  it('should redirect to checkout session URL on success', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sessionUrl: 'https://stripe.com/checkout/session_123',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<SubscribeButton priceId="price_123" />);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(window.location.href).toBe(
        'https://stripe.com/checkout/session_123'
      );
    });
  });

  it('should show error toast when API call fails', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => 'Payment failed',
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<SubscribeButton priceId="price_123" />);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Unable to start checkout', {
        description: 'Payment failed',
      });
    });
  });

  it('should show error toast when sessionUrl is missing', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}), // Missing sessionUrl
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<SubscribeButton priceId="price_123" />);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Unable to start checkout', {
        description: 'Missing session URL',
      });
    });
  });

  it('should handle network errors gracefully', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    render(<SubscribeButton priceId="price_123" />);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Unable to start checkout', {
        description: 'Network error',
      });
    });
  });

  it('should re-enable button after error', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => 'Error',
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<SubscribeButton priceId="price_123" />);

    const button = screen.getByRole('button');
    await user.click(button);

    // Wait for error
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });

    // Button should be enabled again
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });

  it('should not allow multiple simultaneous checkout requests', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({
                  sessionUrl: 'https://stripe.com/checkout',
                }),
              }),
            200
          )
        )
    );
    vi.stubGlobal('fetch', mockFetch);

    render(<SubscribeButton priceId="price_123" />);

    const button = screen.getByRole('button');

    // Click multiple times rapidly
    await user.click(button);
    await user.click(button);
    await user.click(button);

    // Should only have been called once
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
