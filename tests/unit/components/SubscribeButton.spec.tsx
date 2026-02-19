// IMPORTANT: Mock imports must come first, before any component or module
// imports that consume the mocked package (sonner in this case).
import SubscribeButton from '@/components/billing/SubscribeButton';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../mocks/unit/sonner.unit';

interface DeferredPromise<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function createDeferredPromise<T>(): DeferredPromise<T> {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  if (!resolve || !reject) {
    throw new Error('Failed to create deferred promise');
  }

  return { promise, resolve, reject };
}

describe('SubscribeButton', () => {
  const mockLocation = { href: '' };
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    user = userEvent.setup();
    mockLocation.href = '';
    // Mock window.location so assignments to .href go to our object (jsdom can normalize href on the real Location)
    Object.defineProperty(window, 'location', {
      value: mockLocation,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('should call checkout API with correct priceId', async () => {
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
    const deferredFetch = createDeferredPromise<{
      ok: boolean;
      json: () => Promise<{ sessionUrl: string }>;
    }>();
    const mockFetch = vi.fn().mockReturnValue(deferredFetch.promise);
    vi.stubGlobal('fetch', mockFetch);

    render(<SubscribeButton priceId="price_123" />);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/redirecting/i)).toBeInTheDocument();
    });

    await act(async () => {
      deferredFetch.resolve({
        ok: true,
        json: async () => ({
          sessionUrl: 'https://stripe.com/checkout',
        }),
      });
    });
  });

  it('should disable button during checkout', async () => {
    const deferredFetch = createDeferredPromise<{
      ok: boolean;
      json: () => Promise<{ sessionUrl: string }>;
    }>();
    const mockFetch = vi.fn().mockReturnValue(deferredFetch.promise);
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

    await act(async () => {
      deferredFetch.resolve({
        ok: true,
        json: async () => ({
          sessionUrl: 'https://stripe.com/checkout',
        }),
      });
    });
  });

  it('should redirect to checkout session URL on success', async () => {
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
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'Payment failed',
        code: 'VALIDATION_ERROR',
      }),
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
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: 'Error',
        code: 'INTERNAL_ERROR',
      }),
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
    const deferredFetch = createDeferredPromise<{
      ok: boolean;
      json: () => Promise<{ sessionUrl: string }>;
    }>();
    const mockFetch = vi.fn().mockReturnValue(deferredFetch.promise);
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

    await act(async () => {
      deferredFetch.resolve({
        ok: true,
        json: async () => ({
          sessionUrl: 'https://stripe.com/checkout',
        }),
      });
    });
  });
});
