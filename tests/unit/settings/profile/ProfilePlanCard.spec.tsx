import { PRICING_PLAN_FEATURES } from '@/app/(landing)/pricing/pricing-plan-features';
import { ROUTES } from '@/features/navigation/routes';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadBillingSnapshotMock: vi.fn(),
}));

vi.mock(
  '@/app/(app)/settings/billing/components/load-billing-snapshot',
  () => ({
    loadBillingSnapshot: mocks.loadBillingSnapshotMock,
  }),
);

async function renderPlanCard(locale = 'en-US'): Promise<void> {
  const { ProfilePlanCard } =
    await import('@/app/(app)/settings/profile/components/ProfilePlanCard');

  render(await ProfilePlanCard({ locale }));
}

describe('ProfilePlanCard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.loadBillingSnapshotMock.mockResolvedValue({
      tier: 'free',
      subscriptionStatus: 'active',
      subscriptionPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
      usage: {
        tier: 'free',
        activePlans: { current: 1, limit: 1 },
        regenerations: { used: 0, limit: 0 },
      },
    });
  });

  it('renders the current tier, real feature list, and pricing link', async () => {
    const nextBilling = new Date('2026-07-01T00:00:00.000Z').toLocaleDateString(
      'en-US',
      { year: 'numeric', month: 'short', day: 'numeric' },
    );

    await renderPlanCard();

    expect(screen.getByRole('heading', { name: 'Plan' })).toBeVisible();
    expect(
      screen.getByText("You're currently on the Free plan."),
    ).toBeVisible();
    expect(screen.getByText('Free Plan')).toBeVisible();
    expect(screen.getByText('For finding your rhythm.')).toBeVisible();
    expect(screen.getByText('Status')).toBeVisible();
    expect(screen.getByText('Active')).toBeVisible();
    expect(screen.getByText('Billing')).toBeVisible();
    expect(screen.getByText('—')).toBeVisible();
    expect(screen.queryByText('Next billing date')).not.toBeInTheDocument();
    expect(screen.queryByText(nextBilling)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View plans/ })).toHaveAttribute(
      'href',
      ROUTES.PRICING,
    );

    for (const feature of PRICING_PLAN_FEATURES.free) {
      expect(screen.getByText(feature)).toBeVisible();
    }
    expect(screen.queryByText('Custom projects')).not.toBeInTheDocument();
  });

  it('shows an unavailable state when the snapshot is missing', async () => {
    mocks.loadBillingSnapshotMock.mockResolvedValueOnce(null);

    await renderPlanCard();

    expect(screen.getByText('Unavailable right now.')).toBeVisible();
    expect(
      screen.queryByRole('link', { name: /View plans/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
  });

  it('shows an em dash when the next billing date is missing', async () => {
    mocks.loadBillingSnapshotMock.mockResolvedValueOnce({
      tier: 'free',
      subscriptionStatus: 'canceled',
      subscriptionPeriodEnd: null,
      cancelAtPeriodEnd: false,
      usage: {
        tier: 'free',
        activePlans: { current: 1, limit: 1 },
        regenerations: { used: 0, limit: 0 },
      },
    });

    await renderPlanCard();

    expect(screen.getByText('Status')).toBeVisible();
    expect(screen.getByText('Canceled')).toBeVisible();
    expect(screen.getByText('Billing')).toBeVisible();
    expect(screen.getByText('—')).toBeVisible();
    expect(screen.queryByText('Next billing date')).not.toBeInTheDocument();
  });

  it('labels a cancel-at-period-end paid plan by access end date', async () => {
    const accessEnds = new Date('2026-08-15T00:00:00.000Z').toLocaleDateString(
      'en-US',
      { year: 'numeric', month: 'short', day: 'numeric' },
    );
    mocks.loadBillingSnapshotMock.mockResolvedValueOnce({
      tier: 'pro',
      subscriptionStatus: 'active',
      subscriptionPeriodEnd: new Date('2026-08-15T00:00:00.000Z'),
      cancelAtPeriodEnd: true,
      usage: {
        tier: 'pro',
        activePlans: { current: 1, limit: 20 },
        regenerations: { used: 0, limit: 20 },
      },
    });

    await renderPlanCard();

    expect(screen.getByText('Access ends')).toBeVisible();
    expect(screen.getByText(accessEnds)).toBeVisible();
    expect(screen.queryByText('Next billing date')).not.toBeInTheDocument();
  });
});
