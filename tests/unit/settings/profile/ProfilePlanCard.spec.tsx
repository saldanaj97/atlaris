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

async function renderPlanCard(): Promise<void> {
  const { ProfilePlanCard } =
    await import('@/app/(app)/settings/profile/components/ProfilePlanCard');

  render(await ProfilePlanCard());
}

describe('ProfilePlanCard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.loadBillingSnapshotMock.mockResolvedValue({
      tier: 'free',
      subscriptionStatus: 'active',
      subscriptionPeriodEnd: null,
      cancelAtPeriodEnd: false,
      usage: {
        tier: 'free',
        activePlans: { current: 1, limit: 1 },
        regenerations: { used: 0, limit: 0 },
      },
    });
  });

  it('renders the current tier, real feature list, and pricing link', async () => {
    await renderPlanCard();

    expect(screen.getByRole('heading', { name: 'Plan' })).toBeVisible();
    expect(
      screen.getByText("You're currently on the Free plan."),
    ).toBeVisible();
    expect(screen.getByText('Free Plan')).toBeVisible();
    expect(screen.getByText('For finding your rhythm.')).toBeVisible();
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
  });
});
