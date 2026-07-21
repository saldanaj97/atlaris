import {
  CHECKOUT_BASELINE_QUERY_PARAM,
  CHECKOUT_RETURN_QUERY_PARAM,
  CHECKOUT_SYNC_TIMEOUT_MESSAGE,
  CHECKOUT_SYNC_UPDATING_MESSAGE,
  buildCheckoutBillingSignature,
} from '@/features/billing/checkout-return';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  replaceMock: vi.fn(),
  router: {
    refresh: vi.fn(),
    replace: vi.fn(),
  },
  searchParamsGetMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => ({
    get: mocks.searchParamsGetMock,
  }),
}));

describe('CheckoutSubscriptionSync', () => {
  const baseline = {
    tier: 'free',
    status: 'active' as string | null,
    periodEnd: null as string | null,
    cancelAtPeriodEnd: false,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.router.refresh = mocks.refreshMock;
    mocks.router.replace = mocks.replaceMock;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tier: 'free',
          status: 'active',
          periodEnd: null,
          cancelAtPeriodEnd: false,
        }),
      }),
    );
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        href: 'http://localhost:3000/settings?checkout=1&checkoutBaseline=free%7Cactive%7C%7C0#billing',
        pathname: '/settings',
        search: '?checkout=1&checkoutBaseline=free%7Cactive%7C%7C0',
        hash: '#billing',
      },
    });
  });

  function mockCheckoutReturn(
    baselineSignature: string | null = buildCheckoutBillingSignature(baseline),
  ): void {
    mocks.searchParamsGetMock.mockImplementation((name: string) => {
      if (name === CHECKOUT_RETURN_QUERY_PARAM) return '1';
      if (name === CHECKOUT_BASELINE_QUERY_PARAM) return baselineSignature;
      return null;
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows updating copy and stops after the projection catches up', async () => {
    mockCheckoutReturn();
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tier: 'free',
          status: 'active',
          periodEnd: null,
          cancelAtPeriodEnd: false,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tier: 'pro',
          status: 'active',
          periodEnd: '2026-08-01T00:00:00.000Z',
          cancelAtPeriodEnd: false,
        }),
      } as Response);

    const { CheckoutSubscriptionSync } =
      await import('@/app/(app)/settings/billing/components/CheckoutSubscriptionSync');

    render(<CheckoutSubscriptionSync pollIntervalMs={10} timeoutMs={500} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      CHECKOUT_SYNC_UPDATING_MESSAGE,
    );

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(mocks.refreshMock).toHaveBeenCalled();
    expect(mocks.replaceMock).toHaveBeenCalledWith('/settings#billing');
  });

  it('finishes immediately when the webhook projected before settings rendered', async () => {
    mockCheckoutReturn();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tier: 'pro',
        status: 'active',
        periodEnd: '2026-08-01T00:00:00.000Z',
        cancelAtPeriodEnd: false,
      }),
    } as Response);

    const { CheckoutSubscriptionSync } =
      await import('@/app/(app)/settings/billing/components/CheckoutSubscriptionSync');

    render(<CheckoutSubscriptionSync pollIntervalMs={10} timeoutMs={500} />);

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.refreshMock).toHaveBeenCalled();
    expect(mocks.replaceMock).toHaveBeenCalledWith('/settings#billing');
  });

  it('shows timeout copy without claiming payment failed', async () => {
    mockCheckoutReturn();

    const { CheckoutSubscriptionSync } =
      await import('@/app/(app)/settings/billing/components/CheckoutSubscriptionSync');

    render(<CheckoutSubscriptionSync pollIntervalMs={10} timeoutMs={40} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      CHECKOUT_SYNC_UPDATING_MESSAGE,
    );

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        CHECKOUT_SYNC_TIMEOUT_MESSAGE,
      );
    });

    expect(CHECKOUT_SYNC_TIMEOUT_MESSAGE.toLowerCase()).not.toMatch(
      /payment failed|declined|unsuccessful payment/,
    );
    expect(mocks.replaceMock).toHaveBeenCalledWith('/settings#billing');
  });

  it('times out and aborts a hung subscription request', async () => {
    mockCheckoutReturn();
    let requestSignal: AbortSignal | null = null;
    vi.mocked(fetch).mockImplementation((_input, init) => {
      requestSignal = init?.signal ?? null;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const { CheckoutSubscriptionSync } =
      await import('@/app/(app)/settings/billing/components/CheckoutSubscriptionSync');

    render(<CheckoutSubscriptionSync pollIntervalMs={10} timeoutMs={40} />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        CHECKOUT_SYNC_TIMEOUT_MESSAGE,
      );
    });

    expect((requestSignal as AbortSignal | null)?.aborted).toBe(true);
    expect(mocks.replaceMock).toHaveBeenCalledWith('/settings#billing');
  });

  it('aborts an in-flight request when unmounted', async () => {
    mockCheckoutReturn();
    let requestSignal: AbortSignal | null = null;
    vi.mocked(fetch).mockImplementation((_input, init) => {
      requestSignal = init?.signal ?? null;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const { CheckoutSubscriptionSync } =
      await import('@/app/(app)/settings/billing/components/CheckoutSubscriptionSync');

    const { unmount } = render(
      <CheckoutSubscriptionSync pollIntervalMs={10} timeoutMs={500} />,
    );
    await waitFor(() => expect(requestSignal).not.toBeNull());

    unmount();

    expect((requestSignal as AbortSignal | null)?.aborted).toBe(true);
  });

  it('does not poll when the checkout return marker is absent', async () => {
    mocks.searchParamsGetMock.mockReturnValue(null);

    const { CheckoutSubscriptionSync } =
      await import('@/app/(app)/settings/billing/components/CheckoutSubscriptionSync');

    render(<CheckoutSubscriptionSync />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not poll without a pre-checkout baseline', async () => {
    mockCheckoutReturn(null);

    const { CheckoutSubscriptionSync } =
      await import('@/app/(app)/settings/billing/components/CheckoutSubscriptionSync');

    render(<CheckoutSubscriptionSync />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
