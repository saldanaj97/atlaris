import {
  CHECKOUT_SYNC_TIMEOUT_MESSAGE,
  CHECKOUT_SYNC_UPDATING_MESSAGE,
} from '@/features/billing/checkout-return';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  replaceMock: vi.fn(),
  searchParamsGetMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mocks.refreshMock,
    replace: mocks.replaceMock,
  }),
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
        href: 'http://localhost:3000/settings?checkout=1#billing',
        pathname: '/settings',
        search: '?checkout=1',
        hash: '#billing',
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows updating copy and stops after the projection catches up', async () => {
    mocks.searchParamsGetMock.mockReturnValue('1');
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

    vi.useFakeTimers();

    const { CheckoutSubscriptionSync } =
      await import('@/app/(app)/settings/billing/components/CheckoutSubscriptionSync');

    render(<CheckoutSubscriptionSync baseline={baseline} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      CHECKOUT_SYNC_UPDATING_MESSAGE,
    );

    await vi.advanceTimersByTimeAsync(0);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    await vi.advanceTimersByTimeAsync(2000);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    expect(mocks.refreshMock).toHaveBeenCalled();
    expect(mocks.replaceMock).toHaveBeenCalledWith('/settings#billing');
  });

  it('shows timeout copy without claiming payment failed', async () => {
    mocks.searchParamsGetMock.mockReturnValue('1');
    vi.useFakeTimers();

    const { CheckoutSubscriptionSync } =
      await import('@/app/(app)/settings/billing/components/CheckoutSubscriptionSync');

    render(<CheckoutSubscriptionSync baseline={baseline} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      CHECKOUT_SYNC_UPDATING_MESSAGE,
    );

    await vi.advanceTimersByTimeAsync(30_000);

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

  it('does not poll when the checkout return marker is absent', async () => {
    mocks.searchParamsGetMock.mockReturnValue(null);

    const { CheckoutSubscriptionSync } =
      await import('@/app/(app)/settings/billing/components/CheckoutSubscriptionSync');

    render(<CheckoutSubscriptionSync baseline={baseline} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
