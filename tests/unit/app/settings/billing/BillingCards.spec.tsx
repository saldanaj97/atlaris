import { ROUTES } from '@/features/navigation/routes';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBillingAccountSnapshotMock: vi.fn(),
  redirectMock: vi.fn(),
  requestBoundaryComponentMock: vi.fn(),
  shouldUseClerkUiMock: vi.fn(),
}));

vi.mock('@/features/billing/account-snapshot', () => ({
  getBillingAccountSnapshot: mocks.getBillingAccountSnapshotMock,
}));

vi.mock('@/lib/api/request-boundary', () => ({
  requestBoundary: {
    component: mocks.requestBoundaryComponentMock,
  },
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirectMock,
}));

vi.mock('@clerk/nextjs/experimental', () => ({
  SubscriptionDetailsButton: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='clerk-subscription-details'>{children}</div>
  ),
}));

vi.mock('@/lib/auth/local-identity', () => ({
  shouldUseClerkUi: mocks.shouldUseClerkUiMock,
}));

async function renderBillingCards(): Promise<void> {
  const { BillingPlanRows, UsageRows } =
    await import('@/app/(app)/settings/billing/components/BillingCards');

  render(
    <>
      {await BillingPlanRows({ locale: 'en-US' })}
      {await UsageRows()}
    </>,
  );
}

describe('BillingCards', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requestBoundaryComponentMock.mockImplementation(async (resolver) =>
      resolver({
        actor: { id: 'user_billing_cards' },
        db: {} as never,
      }),
    );
    mocks.shouldUseClerkUiMock.mockReturnValue(true);
    mocks.getBillingAccountSnapshotMock.mockResolvedValue({
      tier: 'pro',
      subscriptionStatus: 'active',
      subscriptionPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
      usage: {
        tier: 'pro',
        activePlans: { current: 2, limit: 5 },
        regenerations: { used: 3, limit: 10 },
      },
    });
  });

  it('renders each usage meter with explicit labels and limits', async () => {
    await renderBillingCards();

    expect(mocks.getBillingAccountSnapshotMock).toHaveBeenCalledWith({
      userId: 'user_billing_cards',
      dbClient: {},
    });
    expect(screen.getByText("You're currently on the Pro plan.")).toBeVisible();
    expect(screen.getByText('Pro Plan')).toBeVisible();
    expect(screen.getByRole('link', { name: 'View plans' })).toHaveAttribute(
      'href',
      ROUTES.PRICING,
    );
    expect(screen.getByText('Active plans')).toBeVisible();
    expect(screen.getByText('Regenerations (monthly)')).toBeVisible();
    expect(screen.queryByText('Exports (monthly)')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Lesson generations (monthly)'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('2/5')).toBeVisible();
    expect(screen.getByText('3/10')).toBeVisible();
    expect(screen.queryByText('4/20')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Active plans: 2 of 5')).toBeVisible();
    expect(
      screen.getByLabelText('Monthly regenerations: 3 of 10'),
    ).toBeVisible();
    expect(screen.queryByLabelText(/Monthly exports/i)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Monthly lesson generations/i),
    ).not.toBeInTheDocument();
  });

  it('lets paid subscribers manage or cancel and states the auto-renewal terms', async () => {
    await renderBillingCards();

    expect(
      screen.getByRole('button', { name: 'Manage or cancel subscription' }),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Renews automatically at the end of each billing period until you cancel. Cancellation takes effect at the end of the current billing period.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Next billing date')).toBeVisible();
  });

  it('hides the cancel button and renewal notice for free users', async () => {
    mocks.getBillingAccountSnapshotMock.mockResolvedValueOnce({
      tier: 'free',
      subscriptionStatus: 'active',
      subscriptionPeriodEnd: null,
      cancelAtPeriodEnd: false,
      usage: {
        tier: 'free',
        activePlans: { current: 0, limit: 1 },
        regenerations: { used: 0, limit: 0 },
      },
    });

    await renderBillingCards();

    expect(
      screen.queryByRole('button', { name: 'Manage or cancel subscription' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Renews automatically/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View plans' })).toBeVisible();
  });

  it('omits the Clerk cancel button in local non-Clerk mode', async () => {
    mocks.shouldUseClerkUiMock.mockReturnValue(false);

    await renderBillingCards();

    expect(
      screen.queryByRole('button', { name: 'Manage or cancel subscription' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View plans' })).toBeVisible();
  });

  it('drops the renewal notice once the subscription is set to cancel', async () => {
    mocks.getBillingAccountSnapshotMock.mockResolvedValueOnce({
      tier: 'pro',
      subscriptionStatus: 'active',
      subscriptionPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      cancelAtPeriodEnd: true,
      usage: {
        tier: 'pro',
        activePlans: { current: 2, limit: 5 },
        regenerations: { used: 3, limit: 10 },
      },
    });

    await renderBillingCards();

    expect(
      screen.getByRole('button', { name: 'Manage or cancel subscription' }),
    ).toBeVisible();
    expect(screen.queryByText(/Renews automatically/)).not.toBeInTheDocument();
  });

  it('redirects signed-out users back to settings', async () => {
    mocks.requestBoundaryComponentMock.mockResolvedValueOnce(null);
    mocks.redirectMock.mockImplementationOnce(() => {
      throw new Error('redirected');
    });
    const { BillingPlanRows } =
      await import('@/app/(app)/settings/billing/components/BillingCards');

    await expect(BillingPlanRows({})).rejects.toThrow('redirected');

    expect(mocks.redirectMock).toHaveBeenCalledWith(
      `${ROUTES.AUTH.SIGN_IN}?redirect_url=${encodeURIComponent(ROUTES.SETTINGS.BILLING)}`,
    );
  });
});
