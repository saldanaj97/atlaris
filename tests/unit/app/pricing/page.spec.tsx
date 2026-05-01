import { render, screen } from '@testing-library/react';
import { createStripeTierMap } from '@tests/fixtures/pricing';
import { buildUserFixture } from '@tests/fixtures/users';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadBillingCatalogInput } from '@/features/billing/catalog-read';
type PricingPageUser = ReturnType<typeof buildUserFixture>;

const mocks = vi.hoisted(() => ({
  requestBoundaryComponentMock: vi.fn(),
  readBillingCatalogTierDataMock: vi.fn(),
  pricingGridMock: vi.fn(),
  pricingMissingStripeNoticeMock: vi.fn(),
  manageSubscriptionButtonMock: vi.fn(),
  deriveBillingSubscriptionSnapshotMock: vi.fn(),
  loggerMock: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// This server-component spec intentionally uses module-level `vi.mock` because the
// component under test resolves framework/server dependencies at import time.

vi.mock('@/lib/api/request-boundary', () => ({
  requestBoundary: {
    component: mocks.requestBoundaryComponentMock,
  },
}));

vi.mock('@/features/billing/account-snapshot', () => ({
  deriveBillingSubscriptionSnapshot:
    mocks.deriveBillingSubscriptionSnapshotMock,
}));

vi.mock('@/features/billing/catalog-read', () => ({
  readBillingCatalogTierData: mocks.readBillingCatalogTierDataMock,
}));

vi.mock('@/lib/logging/logger', () => ({
  logger: mocks.loggerMock,
}));

vi.mock('@/app/(marketing)/pricing/components/pricing-config', () => ({
  MONTHLY_TIER_CONFIGS: [
    { key: 'free' },
    { key: 'starter', priceId: 'price_starter_monthly' },
    { key: 'pro', priceId: 'price_pro_monthly' },
  ],
  YEARLY_TIER_CONFIGS: [
    { key: 'free' },
    { key: 'starter', priceId: 'price_starter_yearly' },
    { key: 'pro', priceId: 'price_pro_yearly' },
  ],
}));

vi.mock('@/app/(marketing)/pricing/components/PricingGrid', () => ({
  PricingGrid: (props: {
    subscribeLabel: string;
    tierDisplayMap: ReadonlyMap<string, unknown>;
  }) => {
    mocks.pricingGridMock(props);
    return (
      <div
        data-testid={`pricing-grid-${props.subscribeLabel.toLowerCase().replaceAll(' ', '-')}`}
      >
        {props.subscribeLabel}
      </div>
    );
  },
}));

vi.mock(
  '@/app/(marketing)/pricing/components/PricingMissingStripeNotice',
  () => ({
    PricingMissingStripeNotice: () => {
      mocks.pricingMissingStripeNoticeMock();
      return <div>Missing Stripe pricing data</div>;
    },
  }),
);

vi.mock(
  '@/app/(app)/settings/billing/components/ManageSubscriptionButton',
  () => ({
    default: (props: { canOpenBillingPortal: boolean }) => {
      mocks.manageSubscriptionButtonMock(props);
      return (
        <div
          data-testid="manage-subscription-button"
          data-can-open-billing-portal={String(props.canOpenBillingPortal)}
        />
      );
    },
  }),
);

async function renderPricingPage(): Promise<void> {
  // Reset the module cache before dynamically importing '@/app/(marketing)/pricing/page'
  // so each render picks up the fresh mock graph for this test.
  vi.resetModules();
  const { default: PricingPage } =
    await import('@/app/(marketing)/pricing/page');
  render(await PricingPage());
}

function subscriptionSnapshotFromUser(user: PricingPageUser) {
  return {
    tier: user.subscriptionTier,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionPeriodEnd: user.subscriptionPeriodEnd,
    cancelAtPeriodEnd: user.cancelAtPeriodEnd,
    stripeCustomerId: user.stripeCustomerId,
    stripeSubscriptionId: user.stripeSubscriptionId,
    canOpenBillingPortal: Boolean(
      user.stripeCustomerId && user.subscriptionStatus,
    ),
  };
}

function mockAuthenticatedUser(user: PricingPageUser): void {
  mocks.requestBoundaryComponentMock.mockImplementation(async (resolver) =>
    resolver({
      actor: user,
      db: {} as never,
      owned: {
        userId: user.id,
        dbClient: {} as never,
      },
      correlationId: 'test-correlation-id',
    }),
  );
  mocks.deriveBillingSubscriptionSnapshotMock.mockImplementation(
    (input: PricingPageUser) => subscriptionSnapshotFromUser(input),
  );
}

function mockStripeTierData(
  monthlyStripeData = createStripeTierMap(['starter', 'pro']),
  yearlyStripeData = createStripeTierMap(['starter', 'pro']),
): void {
  mocks.readBillingCatalogTierDataMock
    .mockImplementationOnce(async (_input: ReadBillingCatalogInput) => {
      return monthlyStripeData;
    })
    .mockImplementationOnce(async (_input: ReadBillingCatalogInput) => {
      return yearlyStripeData;
    });
}

describe('PricingPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });
  it('uses requestBoundary.component to render an authenticated pricing page', async () => {
    const user = buildUserFixture({
      stripeCustomerId: 'cus_local_test',
      subscriptionStatus: 'active',
    });
    const monthlyStripeData = createStripeTierMap(['starter', 'pro']);
    const yearlyStripeData = createStripeTierMap(['starter', 'pro']);

    mockAuthenticatedUser(user);
    mockStripeTierData(monthlyStripeData, yearlyStripeData);

    await renderPricingPage();

    expect(mocks.requestBoundaryComponentMock).toHaveBeenCalledTimes(1);
    expect(mocks.deriveBillingSubscriptionSnapshotMock).toHaveBeenCalledWith(
      user,
    );
    expect(mocks.readBillingCatalogTierDataMock).toHaveBeenCalledTimes(2);
    expect(mocks.readBillingCatalogTierDataMock).toHaveBeenNthCalledWith(1, {
      interval: 'monthly',
      proId: 'price_pro_monthly',
      starterId: 'price_starter_monthly',
    });
    expect(mocks.readBillingCatalogTierDataMock).toHaveBeenNthCalledWith(2, {
      interval: 'yearly',
      proId: 'price_pro_yearly',
      starterId: 'price_starter_yearly',
    });
    expect(
      screen.getByRole('heading', { name: /invest in your growth/i }),
    ).toBeVisible();
    expect(screen.getByTestId('pricing-grid-subscribe-monthly')).toBeVisible();
    expect(
      screen.queryByText('Missing Stripe pricing data'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('manage-subscription-button')).toHaveAttribute(
      'data-can-open-billing-portal',
      'true',
    );
    expect(mocks.pricingGridMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tierDisplayMap: monthlyStripeData,
        subscribeLabel: 'Subscribe monthly',
      }),
    );
    expect(mocks.pricingGridMock).toHaveBeenCalledTimes(1);
    expect(mocks.loggerMock.warn).not.toHaveBeenCalled();
    expect(mocks.loggerMock.error).not.toHaveBeenCalled();
  });

  it('renders the fallback notice when stripe pricing data is incomplete', async () => {
    const user = buildUserFixture();

    mockAuthenticatedUser(user);
    mocks.readBillingCatalogTierDataMock
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(createStripeTierMap(['starter']));

    await renderPricingPage();

    expect(screen.getByText('Missing Stripe pricing data')).toBeVisible();
    expect(mocks.loggerMock.error).not.toHaveBeenCalled();
    expect(mocks.loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        monthlyLoadedTierKeys: [],
        monthlyMissingTierKeys: ['starter', 'pro'],
        yearlyLoadedTierKeys: ['starter'],
        yearlyMissingTierKeys: ['pro'],
      }),
      expect.stringContaining('Incomplete Stripe pricing data detected'),
    );
    expect(mocks.pricingGridMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tierDisplayMap: new Map(),
      }),
    );
    expect(mocks.pricingGridMock).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, null] as const)(
    'disables the billing portal when stripeCustomerId is %s',
    async (stripeCustomerId) => {
      const user = buildUserFixture({
        stripeCustomerId,
        subscriptionStatus: 'active',
      });

      mockAuthenticatedUser(user);
      mockStripeTierData();

      await renderPricingPage();

      expect(mocks.requestBoundaryComponentMock).toHaveBeenCalledTimes(1);
      expect(mocks.deriveBillingSubscriptionSnapshotMock).toHaveBeenCalledWith(
        user,
      );
      expect(mocks.readBillingCatalogTierDataMock).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('manage-subscription-button')).toHaveAttribute(
        'data-can-open-billing-portal',
        'false',
      );
    },
  );

  it('does not call deriveBillingSubscriptionSnapshot when the user is anonymous', async () => {
    mocks.requestBoundaryComponentMock.mockResolvedValue(null);
    mockStripeTierData();

    await renderPricingPage();

    expect(mocks.deriveBillingSubscriptionSnapshotMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { name: /invest in your growth/i }),
    ).toBeVisible();
    expect(screen.getByTestId('pricing-grid-subscribe-monthly')).toBeVisible();
    expect(screen.getByTestId('manage-subscription-button')).toHaveAttribute(
      'data-can-open-billing-portal',
      'false',
    );
  });

  it.each([['trialing'], ['canceled'], ['past_due']] as const)(
    'keeps billing portal access enabled for %s subscriptions',
    async (subscriptionStatus) => {
      const user = buildUserFixture({
        stripeCustomerId: 'cus_local_test',
        subscriptionStatus,
      });

      mockAuthenticatedUser(user);
      mockStripeTierData();

      await renderPricingPage();

      expect(
        screen.queryByText(
          'Billing portal is available after your first subscription checkout.',
        ),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('manage-subscription-button')).toHaveAttribute(
        'data-can-open-billing-portal',
        'true',
      );
    },
  );
});
