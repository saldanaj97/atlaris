import { ScheduledPlanChangeNotice } from '@/app/(app)/settings/billing/components/ScheduledPlanChangeNotice';
import { ROUTES } from '@/features/navigation/routes';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSubscription: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({
    billing: { getSubscription: mocks.getSubscription },
    loaded: true,
  }),
}));

vi.mock('@/lib/logging/client', () => ({
  clientLogger: { warn: mocks.warn },
}));

describe('ScheduledPlanChangeNotice', () => {
  beforeEach(() => {
    mocks.getSubscription.mockReset();
    mocks.warn.mockReset();
  });

  it('names the scheduled plan, its start date and where to change it', async () => {
    mocks.getSubscription.mockResolvedValue({
      subscriptionItems: [
        {
          plan: { hasBaseFee: true, name: 'Pro', slug: 'pro_plan' },
          status: 'active',
        },
        {
          plan: { hasBaseFee: true, name: 'Starter', slug: 'starter_plan' },
          status: 'upcoming',
          periodStart: new Date(2026, 10, 23, 12),
        },
      ],
    });

    render(<ScheduledPlanChangeNotice />);

    expect(
      await screen.findByText(/Moves to Starter on Nov 23\./),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Change this on the plans page' }),
    ).toHaveAttribute('href', ROUTES.PRICING);
  });

  it('stays hidden when only a cancellation to Free is scheduled', async () => {
    mocks.getSubscription.mockResolvedValue({
      subscriptionItems: [
        {
          plan: { hasBaseFee: true, name: 'Pro', slug: 'pro_plan' },
          status: 'active',
          canceledAt: new Date(),
        },
        {
          plan: { hasBaseFee: false, name: 'Free', slug: 'free_user' },
          status: 'upcoming',
        },
      ],
    });

    const { container } = render(<ScheduledPlanChangeNotice />);

    await waitFor(() => expect(mocks.getSubscription).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('logs and stays hidden when Clerk cannot be reached', async () => {
    mocks.getSubscription.mockRejectedValue(new Error('network unavailable'));

    const { container } = render(<ScheduledPlanChangeNotice />);

    await waitFor(() => expect(mocks.warn).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
  });
});
